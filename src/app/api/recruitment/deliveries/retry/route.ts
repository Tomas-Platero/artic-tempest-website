import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { ensureAppPermission } from '@/shared/auth/permissions';
import { getRoleFlags } from '@/shared/auth/roles';
import type { RoleLevel } from '@/shared/types/auth';
import { resolveDiscordUserIdForApplication } from '@/shared/lib/recruitment/active-application';
import {
  getDeliveryById,
  resetDeliveryForRetry,
} from '@/shared/lib/recruitment/discord-deliveries';
import { republishTrackedNotification } from '@/shared/lib/recruitment/notify-with-delivery';
import type { RecruitmentBotEvent } from '@/shared/lib/recruitment/bot-events';
import type { RecruitmentDelivery } from '@/shared/lib/recruitment/delivery-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETRYABLE_STATUSES = ['failed', 'queued'] as const;

type RetryableStatus = (typeof RETRYABLE_STATUSES)[number];

function isRetryable(
  status: RecruitmentDelivery['status'],
): status is RetryableStatus {
  return (RETRYABLE_STATUSES as readonly string[]).includes(status);
}

type ChatMessageRow = {
  content: string | null;
  author_id: string;
  attachments: unknown;
  created_at: string;
  author: { discord_username: string | null; role_level: string | null } | null;
};

type ApplicationRow = {
  status: string;
  character_name: string | null;
  character_realm: string | null;
};

/**
 * Re-queues a notification the applicant never received.
 *
 * The event is rebuilt and validated *before* the delivery row is reset, so a
 * failure to rebuild leaves the previous outcome untouched instead of stranding
 * the row on `queued` with no event behind it.
 */
export async function POST(request: NextRequest) {
  await ensureAppPermission('recruitment', 'edit');

  try {
    const body: Record<string, unknown> = await request.json();
    const deliveryId = body?.deliveryId;

    if (!deliveryId || typeof deliveryId !== 'string') {
      return NextResponse.json({ error: 'Falta deliveryId' }, { status: 400 });
    }

    const delivery = await getDeliveryById(deliveryId);
    if (!delivery) {
      return NextResponse.json(
        { error: 'Entrega no encontrada' },
        { status: 404 },
      );
    }

    if (!isRetryable(delivery.status)) {
      return NextResponse.json(
        {
          error: `No se puede reintentar una entrega en estado "${delivery.status}"`,
        },
        { status: 400 },
      );
    }

    const applicantDiscordUserId = await resolveDiscordUserIdForApplication(
      delivery.application_id,
    );

    if (!applicantDiscordUserId) {
      return NextResponse.json(
        { error: 'El aplicante no tiene Discord vinculado' },
        { status: 400 },
      );
    }

    const buildEvent = await buildRetryEvent(delivery);

    if (!buildEvent) {
      return NextResponse.json(
        { error: 'El aviso original ya no se puede reconstruir' },
        { status: 400 },
      );
    }

    const reset = await resetDeliveryForRetry(deliveryId);
    if (!reset) {
      return NextResponse.json(
        { error: 'No se pudo preparar el reintento' },
        { status: 500 },
      );
    }

    const updated = await republishTrackedNotification(
      deliveryId,
      applicantDiscordUserId,
      buildEvent,
    );

    return NextResponse.json({ success: true, delivery: updated });
  } catch (error: any) {
    console.error('[Recruitment:DeliveryRetry] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 },
    );
  }
}

async function buildRetryEvent(
  delivery: RecruitmentDelivery,
): Promise<((recipientDiscordId: string) => RecruitmentBotEvent) | null> {
  if (delivery.kind === 'chat_message') {
    const messageId = delivery.message_id;
    if (!messageId) return null;

    const { data } = await supabaseAdmin
      .from('application_messages')
      .select(
        'content, author_id, attachments, created_at, author:profiles(discord_username, role_level)',
      )
      .eq('id', messageId)
      .maybeSingle();

    const message = data as ChatMessageRow | null;
    if (!message) return null;

    const author = message.author;
    const roleFlags = author?.role_level
      ? await getRoleFlags(author.role_level as RoleLevel)
      : null;

    return (recipientDiscordId) => ({
      type: 'recruitment.chat.message',
      applicationId: delivery.application_id,
      messageId,
      authorId: message.author_id,
      content: message.content ?? '',
      attachments: Array.isArray(message.attachments)
        ? (message.attachments as Array<{
            url: string;
            name?: string;
            contentType?: string;
          }>)
        : undefined,
      applicantDiscordUserId: recipientDiscordId,
      officerName: author?.discord_username ?? 'Staff',
      officerRoleLabel: roleFlags?.label ?? '',
      createdAt: message.created_at,
    });
  }

  if (delivery.kind === 'status_changed') {
    const { data } = await supabaseAdmin
      .from('recruitment_applications')
      .select('status, character_name, character_realm')
      .eq('id', delivery.application_id)
      .maybeSingle();

    const application = data as ApplicationRow | null;
    if (!application) return null;

    return (recipientDiscordId) => ({
      type: 'recruitment.application.status_changed',
      applicationId: delivery.application_id,
      applicantDiscordUserId: recipientDiscordId,
      // The embed only renders the new status, so the historical previous
      // status is not reconstructed here.
      previousStatus: null,
      status: application.status,
      characterName: application.character_name ?? '',
      characterRealm: application.character_realm ?? '',
    });
  }

  return null;
}
