import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { getGuildCredentials } from '@/shared/auth/credentials';
import { fetchCharacterRIO } from '@/shared/integrations/raiderio/raiderio-client';
import { fetchCharacterItemLevel } from '@/shared/integrations/bnet/bnet-client';
import { ensureAppPermission } from '@/shared/auth/permissions';
import { buildRecruitmentDiscordPayload } from '@/shared/lib/recruitment/discord-apply';
import { getRecruitmentDiscordRaidProgress } from '@/shared/lib/recruitment/raid-progression';

// Mismos colores base para mantener consistencia
const classInfo: Record<number, { name: string; color: number }> = {
  1: { name: 'Warrior', color: 0xc69b6d },
  2: { name: 'Paladin', color: 0xf48cba },
  3: { name: 'Hunter', color: 0xabd473 },
  4: { name: 'Rogue', color: 0xfff468 },
  5: { name: 'Priest', color: 0xffffff },
  6: { name: 'Death Knight', color: 0xc41e3a },
  7: { name: 'Shaman', color: 0x0070de },
  8: { name: 'Mage', color: 0x3fc7eb },
  9: { name: 'Warlock', color: 0x8788ee },
  10: { name: 'Monk', color: 0x00ff98 },
  11: { name: 'Druid', color: 0xff7c0a },
  12: { name: 'Demon Hunter', color: 0xa330c9 },
  13: { name: 'Evoker', color: 0x33937f },
};

const statusMap: Record<string, { label: string; color: number }> = {
  pending: { label: '🔵 Nuevo', color: 0x3b82f6 },
  reviewing: { label: '🟣 En Revisión', color: 0x8b5cf6 },
  paused: { label: '⏸️ En Pausa', color: 0x9ca3af },
  interview: { label: '🟠 Entrevista', color: 0xf59e0b },
  accepted: { label: '🟢 Aceptado', color: 0x10b981 },
  rejected: { label: '🔴 Rechazado', color: 0xef4444 },
  cancelado: { label: '⚫ Cancelado', color: 0x71717a },
};

export async function POST(req: Request) {
  await ensureAppPermission('recruitment', 'edit');

  try {
    const body = await req.json();
    const { application_id } = body;

    if (!application_id) {
      return NextResponse.json({ error: 'Falta ID' }, { status: 400 });
    }

    const { data: application, error: appError } = await supabaseAdmin
      .from('recruitment_applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (appError || !application || !application.discord_message_id) {
      return NextResponse.json(
        { error: 'Apply no encontrado o no está vinculado a Discord' },
        { status: 400 },
      );
    }

    // Obtener el perfil del usuario de forma segura
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('discord_username, discord_avatar, discord_user_id')
      .eq('user_id', application.user_id)
      .single();

    application.profiles = profile || {};

    // Obtener logo de la guild
    const { data: guild } = await supabaseAdmin
      .from('settings')
      .select('icon_url')
      .eq('id', 1)
      .maybeSingle();

    const guildIconUrl =
      guild?.icon_url || `${process.env.NEXTAUTH_URL}/favicon.ico`;

    // Obtener nivel real del personaje de la BD
    const { data: charData } = await supabaseAdmin
      .from('bnet_characters')
      .select('level')
      .eq('user_id', application.user_id)
      .eq('name', application.character_name)
      .eq('realm', application.character_realm)
      .single();

    const characterLevel = charData?.level || 80;

    const creds = await getGuildCredentials();
    const channelId = creds.discord_recruitment_channel_id;
    const botToken = creds.discord_bot_token;

    if (!channelId || !botToken) {
      return NextResponse.json({
        success: true,
        warning: 'Bot no configurado.',
      });
    }

    const charClassId = Number(application.character_class);
    const charClass = classInfo[charClassId] || {
      name: 'Unknown',
      color: 0x2b2d31,
    };

    const currentStatus = statusMap[application.status || 'pending'];

    // Obtener Raider.IO Data
    const rioData = await fetchCharacterRIO(
      application.character_name,
      application.character_realm,
    );

    let mplusScore = 0;
    if (rioData?.mythic_plus_scores_by_season) {
      const seasons = rioData.mythic_plus_scores_by_season;
      const activeSeason =
        seasons.find((s: any) => s.scores?.all > 0) || seasons[0];
      mplusScore = activeSeason?.scores?.all || 0;
    }

    const raidProgress = getRecruitmentDiscordRaidProgress(
      rioData?.raid_progression,
    );

    // Obtener el Item Level real directamente desde Battle.net
    const bnetItemLevel = await fetchCharacterItemLevel(
      application.character_realm,
      application.character_name,
      'eu',
    );

    const eqIvl = bnetItemLevel?.equipped || rioData?.gear?.item_level_equipped;
    const maxIvl = bnetItemLevel?.average || rioData?.gear?.item_level_total;
    const iLvl = eqIvl
      ? maxIvl > 0
        ? `${eqIvl} / ${maxIvl}`
        : `${eqIvl}`
      : 'N/A';

    const { data: answers } = await supabaseAdmin
      .from('application_answers')
      .select(`
        id,
        answer_text,
        question:recruitment_questions(
          label,
          type,
          order_index
        )
      `)
      .eq('application_id', application.id);

    const discordPayload = buildRecruitmentDiscordPayload({
      application,
      profile: application.profiles,
      guildIconUrl,
      characterLevel,
      charClass,
      iLvl,
      raidProgress,
      mplusScore,
      answers: answers || [],
      statusLabel: currentStatus.label,
      statusColor:
        application.status === 'accepted' ||
        application.status === 'rejected' ||
        application.status === 'cancelado'
          ? currentStatus.color
          : charClass.color,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: 'Ver Aplicación/Responder',
              url: `${process.env.NEXTAUTH_URL}/zona-raider/configuracion/reclutamiento/${application.id}`,
            },
          ],
        },
      ],
      thumbnailUrl: rioData?.thumbnail_url || null,
    });

    // LLamada PATCH a la API de Discord para editar un mensaje existente
    const discordRes = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${application.discord_message_id}`,
      {
        method: 'PATCH',
        cache: 'no-store',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordPayload),
      },
    );

    if (!discordRes.ok) throw new Error('Discord no actualizó');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
