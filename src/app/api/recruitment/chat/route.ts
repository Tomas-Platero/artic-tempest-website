import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { getAuthzSnapshot } from '@/shared/auth/authz';
import { publishTrackedNotification } from '@/shared/lib/recruitment/notify-with-delivery';
import { getDeliveriesByMessageIds } from '@/shared/lib/recruitment/discord-deliveries';
import type { RecruitmentDelivery } from '@/shared/lib/recruitment/delivery-status';
import { resolveDiscordUserIdForApplication } from '@/shared/lib/recruitment/active-application';

/**
 * `new URL()` throws a TypeError on malformed input, so it is kept behind a guard
 * instead of being called on the raw request target.
 */
function parseRequestUrl(req: Request): URL | null {
  try {
    return new URL(req.url);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const url = parseRequestUrl(req);
  if (!url) {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }

  const applicationId = url.searchParams.get('applicationId');

  if (!applicationId) {
    return NextResponse.json(
      { error: 'Falta id de solicitud' },
      { status: 400 },
    );
  }

  try {
    const { data: application, error: appError } = await supabaseAdmin
      .from('recruitment_applications')
      .select('user_id')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Solicitud no encontrada' },
        { status: 404 },
      );
    }

    const authz = await getAuthzSnapshot(session);
    const roleLevel =
      (authz.roleSlug ?? session.user?.roleLevel ?? '').toLowerCase?.() ?? '';
    const isOfficial = ['gm', 'officer'].includes(roleLevel);
    const isApplicant = session.user.id === application.user_id;

    if (!isOfficial && !isApplicant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const PAGE_SIZE = 50;
    const cursor = url.searchParams.get('cursor');

    let query = supabaseAdmin
      .from('application_messages')
      .select(
        '*, author:profiles(discord_username, discord_avatar, role_level)',
      )
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: messages, error: msgError } = await query;

    if (msgError) throw msgError;

    // Devolver en orden cronológico ascendente (los más antiguos primero)
    const rows = [...(messages || [])].reverse();

    // El estado de entrega es información interna: el aplicante ve el mensaje,
    // no si a él mismo le falló el aviso por Discord.
    if (!isOfficial) {
      return NextResponse.json(rows);
    }

    const deliveries = await getDeliveriesByMessageIds(
      rows.map((message: { id: string }) => message.id),
    );

    return NextResponse.json(
      rows.map((message: { id: string }) => ({
        ...message,
        delivery:
          (deliveries.get(message.id) as RecruitmentDelivery | undefined) ??
          null,
      })),
    );
  } catch (error: any) {
    console.error('GET Chat Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { applicationId, content, attachments } = await req.json();
  if (!applicationId || !content) {
    return NextResponse.json(
      { error: 'Faltan datos requeridos' },
      { status: 400 },
    );
  }

  const MAX_MESSAGE_LENGTH = 2000;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json(
      { error: 'El mensaje no puede estar vacío' },
      { status: 400 },
    );
  }
  const normalizedContent = content.trim();

  if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `El mensaje excede ${MAX_MESSAGE_LENGTH} caracteres` },
      { status: 400 },
    );
  }

  try {
    // 1. Get application details
    const { data: application, error: appError } = await supabaseAdmin
      .from('recruitment_applications')
      .select('user_id')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Solicitud no encontrada' },
        { status: 404 },
      );
    }

    // 2. Check permissions
    const authz = await getAuthzSnapshot(session);
    const senderRoleLevel =
      (authz.roleSlug ?? session.user?.roleLevel ?? '').toLowerCase?.() ?? '';
    const isOfficial = ['gm', 'officer'].includes(senderRoleLevel);
    const isApplicant = session.user.id === application.user_id;

    if (!isOfficial && !isApplicant) {
      return NextResponse.json({ error: 'Prohibido' }, { status: 403 });
    }

    // 3. Save to database
    const insertPayload: any = {
      application_id: applicationId,
      author_id: session.user.id,
      content: normalizedContent,
      source: 'web',
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
      insertPayload.attachments = attachments;
    }

    const { data: savedMsg, error: saveError } = await supabaseAdmin
      .from('application_messages')
      .insert(insertPayload)
      .select(
        '*, author:profiles(discord_username, discord_avatar, role_level)',
      )
      .single();

    if (saveError) throw saveError;

    // A staff message is a notification to the applicant. Its delivery is
    // recorded so the chat can show whether Discord actually accepted it,
    // instead of the silent success we used to return.
    let delivery: RecruitmentDelivery | null = null;

    if (isOfficial) {
      const applicantDiscordUserId =
        await resolveDiscordUserIdForApplication(applicationId);

      delivery = await publishTrackedNotification({
        applicationId,
        kind: 'chat_message',
        recipientKind: 'applicant',
        recipientDiscordId: applicantDiscordUserId,
        buildEvent: (recipientDiscordId) => ({
          type: 'recruitment.chat.message',
          applicationId,
          messageId: savedMsg.id,
          authorId: session.user.id,
          content: normalizedContent,
          attachments: Array.isArray(attachments) ? attachments : undefined,
          applicantDiscordUserId: recipientDiscordId,
          officerName:
            session.user.username ??
            savedMsg.author?.discord_username ??
            'Staff',
          officerRoleLabel: session.user.roleLabel ?? '',
          createdAt: savedMsg.created_at,
        }),
      });
    }

    return NextResponse.json({
      success: true,
      message: savedMsg,
      delivery,
    });
  } catch (err: any) {
    console.error('POST Chat Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
