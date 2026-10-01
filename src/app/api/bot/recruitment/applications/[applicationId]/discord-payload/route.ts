import { NextRequest, NextResponse } from 'next/server';
import { enforceBearerToken } from '@/shared/api/public-auth';
import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { fetchCharacterRIO } from '@/shared/integrations/raiderio/raiderio-client';
import { fetchCharacterItemLevel } from '@/shared/integrations/bnet/bnet-client';
import { buildRecruitmentDiscordPayload } from '@/shared/lib/recruitment/discord-apply';
import { getRecruitmentDiscordRaidProgress } from '@/shared/lib/recruitment/raid-progression';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStoreHeaders() {
  return { 'Cache-Control': 'no-store, max-age=0, must-revalidate' };
}

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

const STATUS_MAP: Record<string, { label: string; color: number }> = {
  pending: { label: '🔵 Nuevo', color: 0x3b82f6 },
  reviewing: { label: '🟣 En Revisión', color: 0x8b5cf6 },
  paused: { label: '⏸️ En Pausa', color: 0x9ca3af },
  interview: { label: '🟠 Entrevista', color: 0xf59e0b },
  accepted: { label: '🟢 Aceptado', color: 0x10b981 },
  rejected: { label: '🔴 Rechazado', color: 0xef4444 },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const authError = await enforceBearerToken(request);
  if (authError) return authError;

  const { applicationId } = await params;
  if (!applicationId || !UUID_REGEX.test(applicationId)) {
    return NextResponse.json(
      { error: 'Falta ID de la solicitud' },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  function isAnnounceRequested(url: string): boolean {
    try {
      const value = new URL(url).searchParams.get('announce');
      return value === '1' || value === 'true';
    } catch {
      return false;
    }
  }

  const announce = isAnnounceRequested(request.url);

  try {
    const { data: application, error: appError } = await supabaseAdmin
      .from('recruitment_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Solicitud no encontrada' },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('discord_username, discord_avatar, discord_user_id')
      .eq('user_id', application.user_id)
      .single();

    const { data: guild } = await supabaseAdmin
      .from('settings')
      .select('icon_url')
      .eq('id', 1)
      .maybeSingle();

    const guildIconUrl =
      guild?.icon_url || `${process.env.NEXTAUTH_URL}/favicon.ico`;

    const { data: charData } = await supabaseAdmin
      .from('bnet_characters')
      .select('level')
      .eq('user_id', application.user_id)
      .eq('name', application.character_name)
      .eq('realm', application.character_realm)
      .single();

    const characterLevel = charData?.level || 80;

    const charClassId = Number(application.character_class);
    const charClass = classInfo[charClassId] || {
      name: 'Unknown',
      color: 0x2b2d31,
    };

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

    const currentStatus = STATUS_MAP[application.status || 'pending'];
    const payload = buildRecruitmentDiscordPayload({
      application,
      profile,
      guildIconUrl,
      characterLevel,
      charClass,
      iLvl,
      raidProgress,
      mplusScore,
      answers: answers || [],
      includeRolePing: announce,
      statusLabel: currentStatus.label,
      statusColor:
        application.status === 'accepted' || application.status === 'rejected'
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

    return NextResponse.json({
      applicationId: application.id,
      status: application.status,
      payload,
    }, { headers: noStoreHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
