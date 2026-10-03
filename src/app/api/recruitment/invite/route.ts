import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { ensureAppPermission } from '@/shared/auth/permissions';
import { getGuildCredentials } from '@/shared/auth/credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One week, single use: an invitation for one conversation, not a public door. */
const INVITE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const INVITE_MAX_USES = 1;

/**
 * Creates a single-use server invite for an applicant who cannot be reached by DM.
 *
 * Discord offers no way to bypass a user's DM privacy, so when an applicant shares
 * no guild with the bot the DM simply cannot be delivered. Getting them into the
 * server is the only thing that unblocks the conversation, and the officer is the
 * one who can pass the link on through another channel.
 */
export async function POST(request: NextRequest) {
  await ensureAppPermission('recruitment', 'edit');

  try {
    const body: Record<string, unknown> = await request.json();
    const applicationId = body?.applicationId;

    if (!applicationId || typeof applicationId !== 'string') {
      return NextResponse.json(
        { error: 'Falta applicationId' },
        { status: 400 },
      );
    }

    const { data: application } = await supabaseAdmin
      .from('recruitment_applications')
      .select('id')
      .eq('id', applicationId)
      .maybeSingle();

    if (!application) {
      return NextResponse.json(
        { error: 'Solicitud no encontrada' },
        { status: 404 },
      );
    }

    const creds = await getGuildCredentials();
    const channelId = creds.discord_recruitment_channel_id;
    const botToken = creds.discord_bot_token;

    if (!channelId || !botToken) {
      return NextResponse.json(
        { error: 'El bot de Discord no está configurado' },
        { status: 503 },
      );
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/invites`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_age: INVITE_MAX_AGE_SECONDS,
          max_uses: INVITE_MAX_USES,
          unique: true,
          reason:
            'Invitación de reclutamiento: el aplicante no es alcanzable por DM',
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(
        '[Recruitment:Invite] Discord refused the invite:',
        response.status,
        detail,
      );
      return NextResponse.json(
        { error: 'Discord rechazó la creación de la invitación' },
        { status: 502 },
      );
    }

    const invite = await response.json();

    if (!invite?.code) {
      return NextResponse.json(
        { error: 'Discord no devolvió un código de invitación' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      inviteUrl: `https://discord.gg/${invite.code}`,
      expiresAt: invite.expires_at ?? null,
      maxUses: invite.max_uses ?? INVITE_MAX_USES,
    });
  } catch (error: any) {
    console.error('[Recruitment:Invite] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
