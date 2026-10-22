import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { fetchCharacterProfessions } from '@/shared/integrations/bnet/bnet-client';

const MIDNIGHT_PROFESSION_KEYWORDS = ['midnight'];

const DEFAULT_RANK_NAMES = [
  'Guild Master',
  'Officer',
  'Officer Alt',
  'Raid Leader',
  'Artic Raider',
  'Raider',
  'Trial',
  'Social',
  'Alt',
  'Member',
];

const _CURRENT_MAX_CHARACTER_LEVEL = 80;

export const PROFESSION_META: Record<
  string,
  { label: string; slug: string; iconUrl: string }
> = {
  alchemy: {
    label: 'Alquimia',
    slug: 'alchemy',
    iconUrl: 'https://wow.zamimg.com/images/wow/icons/large/trade_alchemy.jpg',
  },
  blacksmithing: {
    label: 'Herrería',
    slug: 'blacksmithing',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/trade_blacksmithing.jpg',
  },
  enchanting: {
    label: 'Encantamiento',
    slug: 'enchanting',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/trade_engraving.jpg',
  },
  engineering: {
    label: 'Ingeniería',
    slug: 'engineering',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/trade_engineering.jpg',
  },
  herbalism: {
    label: 'Herboristería',
    slug: 'herbalism',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/trade_herbalism.jpg',
  },
  inscription: {
    label: 'Inscripción',
    slug: 'inscription',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/inv_inscription_tradeskill01.jpg',
  },
  jewelcrafting: {
    label: 'Joyería',
    slug: 'jewelcrafting',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/inv_misc_gem_01.jpg',
  },
  leatherworking: {
    label: 'Peletería',
    slug: 'leatherworking',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/inv_misc_armorkit_17.jpg',
  },
  mining: {
    label: 'Minería',
    slug: 'mining',
    iconUrl: 'https://wow.zamimg.com/images/wow/icons/large/trade_mining.jpg',
  },
  skinning: {
    label: 'Desuello',
    slug: 'skinning',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/inv_misc_pelt_wolf_01.jpg',
  },
  tailoring: {
    label: 'Sastrería',
    slug: 'tailoring',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/trade_tailoring.jpg',
  },
  cooking: {
    label: 'Cocina',
    slug: 'cooking',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/inv_misc_food_15.jpg',
  },
  fishing: {
    label: 'Pesca',
    slug: 'fishing',
    iconUrl: 'https://wow.zamimg.com/images/wow/icons/large/trade_fishing.jpg',
  },
  archaeology: {
    label: 'Arqueología',
    slug: 'archaeology',
    iconUrl:
      'https://wow.zamimg.com/images/wow/icons/large/trade_archaeology.jpg',
  },
};

type RawGuildMember = {
  id: string;
  character_name: string;
  realm_slug: string;
  class_id: number | null;
  level: number;
  rank: number;
  profile_id?: string | null;
};

export type ProfessionEntry = {
  id: number | null;
  name: string;
  label: string;
  slug: string;
  iconUrl: string;
  skillPoints: number;
  maxSkillPoints: number;
  tierName: string | null;
  isPrimary: boolean;
  isMaxed: boolean;
};

export type ProfessionMember = {
  id: string;
  characterName: string;
  realmSlug: string;
  avatarUrl: string | null;
  classId: number | null;
  className: string;
  classColor: string | null;
  level: number;
  rank: number;
  rankName: string;
  isMain: boolean;
  professions: ProfessionEntry[];
};

function normalizeCharacterKeyPart(value: string | null | undefined) {
  return (value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function makeCharacterKey(realmSlug: string, characterName: string) {
  return `${normalizeCharacterKeyPart(realmSlug)}:${normalizeCharacterKeyPart(characterName)}`;
}

function makeProfileCharacterKey(
  profileId: string | null | undefined,
  realmSlug: string,
  characterName: string,
) {
  return `${profileId || 'unknown'}:${makeCharacterKey(realmSlug, characterName)}`;
}

function normalizeProfessionKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function getProfessionMeta(name: string) {
  const key = normalizeProfessionKey(name);
  return (
    PROFESSION_META[key] || {
      label: name,
      slug: key || 'unknown',
      iconUrl:
        'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg',
    }
  );
}

function getProfessionTier(entry: any) {
  const tiers = [
    ...(Array.isArray(entry?.tiers) ? entry.tiers : []),
    ...(Array.isArray(entry?.skill_tiers) ? entry.skill_tiers : []),
  ];

  const candidates = tiers.reduce(
    (acc: Array<{ skillPoints: number; maxSkillPoints: number; tierName: string | null }>, tier: any) => {
      const item = {
        skillPoints: Number(tier?.skill_points ?? tier?.skillPoints ?? 0),
        maxSkillPoints: Number(
          tier?.max_skill_points ?? tier?.maxSkillPoints ?? 0,
        ),
        tierName: tier?.tier?.name ?? tier?.name ?? null,
      };
      if (item.maxSkillPoints > 0) acc.push(item);
      return acc;
    },
    [],
  );

  if (candidates.length > 0) {
    const midnightCandidates = candidates.filter((tier) =>
      MIDNIGHT_PROFESSION_KEYWORDS.some((keyword) =>
        (tier.tierName || '').toLowerCase().includes(keyword),
      ),
    );

    const preferredCandidates =
      midnightCandidates.length > 0 ? midnightCandidates : [];

    if (preferredCandidates.length > 0) {
      return preferredCandidates.reduce((best, current) =>
        current.skillPoints > best.skillPoints ||
        (current.skillPoints === best.skillPoints && current.maxSkillPoints > best.maxSkillPoints)
          ? current
          : best,
      );
    }

    return candidates.reduce((best, current) =>
      current.skillPoints > best.skillPoints ||
      (current.skillPoints === best.skillPoints && current.maxSkillPoints > best.maxSkillPoints)
        ? current
        : best,
    );
  }

  return {
    skillPoints: Number(entry?.skill_points ?? entry?.skillPoints ?? 0),
    maxSkillPoints: Number(
      entry?.max_skill_points ?? entry?.maxSkillPoints ?? 0,
    ),
    tierName: entry?.tier?.name ?? null,
  };
}

function parseProfessionEntries(entries: any[], isPrimary: boolean) {
  return entries.reduce((acc: ProfessionEntry[], entry) => {
    const professionName = entry?.profession?.name || entry?.name;
    if (!professionName) return acc;

    const tier = getProfessionTier(entry);
    if (
      !tier.tierName ||
      !MIDNIGHT_PROFESSION_KEYWORDS.some((keyword) =>
        tier.tierName.toLowerCase().includes(keyword),
      )
    ) {
      return acc;
    }

    const meta = getProfessionMeta(professionName);

    acc.push({
      id: entry?.profession?.id ?? entry?.id ?? null,
      name: professionName,
      label: meta.label,
      slug: meta.slug,
      iconUrl: meta.iconUrl,
      skillPoints: tier.skillPoints,
      maxSkillPoints: tier.maxSkillPoints,
      tierName: tier.tierName,
      isPrimary,
      isMaxed:
        tier.maxSkillPoints > 0 && tier.skillPoints >= tier.maxSkillPoints,
    } satisfies ProfessionEntry);
    return acc;
  }, []);
}

function isMainCharacter(rank: number, rankName: string) {
  const normalizedName = rankName.trim().toLowerCase();
  if (normalizedName.includes('alt') || normalizedName.includes('alter')) {
    return false;
  }

  return ![2, 7, 8].includes(rank);
}

async function getVisibleRosterMembers() {
  const [membersRes, ranksRes, constantsRes] = await Promise.all([
    supabaseAdmin
      .from('guild_members')
      .select(
        'id, character_name, realm_slug, class_id, level, rank, profile_id',
      )
      .order('rank', { ascending: true })
      .order('character_name', { ascending: true }),
    supabaseAdmin.from('guild_ranks').select('rank, name, is_visible'),
    supabaseAdmin
      .from('game_constants')
      .select('category, key, value, metadata')
      .in('category', ['wow_class']),
  ]);

  const rawRanks = ranksRes.data;

  const visibilityMap: Record<number, boolean> = {};
  const rankNames: Record<number, string> = {};

  rawRanks?.forEach((rank: any) => {
    visibilityMap[Number(rank.rank)] = rank.is_visible;
    rankNames[Number(rank.rank)] =
      rank.name || DEFAULT_RANK_NAMES[Number(rank.rank)] || `Rank ${rank.rank}`;
  });

  const classMap: Record<number, { name: string; color: string | null }> = {};
  constantsRes.data?.forEach((constant: any) => {
    if (constant.category === 'wow_class') {
      classMap[Number(constant.key)] = {
        name: constant.value,
        color: constant.metadata?.color || null,
      };
    }
  });

  const members = (membersRes.data || []).filter((member: any) => {
    const visible = visibilityMap[Number(member.rank)] ?? true;
    return visible;
  }) as RawGuildMember[];

  return { members, rankNames, classMap };
}

export async function getRosterProfessions(_options?: { fresh?: boolean }) {
  const { members, rankNames, classMap } = await getVisibleRosterMembers();
  const results: ProfessionMember[] = [];

  const avatarByProfileAndCharacter = new Map<string, string | null>();
  const avatarByCharacter = new Map<string, string | null>();

  const { data: allKnownCharacters } = await supabaseAdmin
    .from('bnet_characters')
    .select('user_id, name, realm_slug, thumbnail_url');

  allKnownCharacters?.forEach((character: any) => {
    const characterKey = makeCharacterKey(character.realm_slug, character.name);
    const profileCharacterKey = makeProfileCharacterKey(
      character.user_id,
      character.realm_slug,
      character.name,
    );

    if (!avatarByCharacter.has(characterKey)) {
      avatarByCharacter.set(characterKey, character.thumbnail_url || null);
    }

    avatarByProfileAndCharacter.set(
      profileCharacterKey,
      character.thumbnail_url || null,
    );
  });

  const memberResults = await Promise.all(
    members.map(async (member) => {
      const professionsData = await fetchCharacterProfessions(
        member.realm_slug,
        member.character_name.toLowerCase(),
        'eu',
      );

      const primary = parseProfessionEntries(
        professionsData?.primaries || [],
        true,
      );
      const secondary = parseProfessionEntries(
        professionsData?.secondaries || [],
        false,
      );

      return {
        id: member.id,
        characterName: member.character_name,
        realmSlug: member.realm_slug,
        avatarUrl:
          avatarByProfileAndCharacter.get(
            makeProfileCharacterKey(
              member.profile_id,
              member.realm_slug,
              member.character_name,
            ),
          ) ||
          avatarByCharacter.get(
            makeCharacterKey(member.realm_slug, member.character_name),
          ) ||
          null,
        classId: member.class_id,
        className: classMap[member.class_id ?? 0]?.name || 'Desconocida',
        classColor: classMap[member.class_id ?? 0]?.color || null,
        level: member.level,
        rank: member.rank,
        rankName: rankNames[member.rank] || `Rank ${member.rank}`,
        isMain: isMainCharacter(
          member.rank,
          rankNames[member.rank] || `Rank ${member.rank}`,
        ),
        professions: [...primary, ...secondary],
      } satisfies ProfessionMember;
    }),
  );

  results.push(...memberResults);

  const professionOptions = Array.from(
    new Map(
      results
        .flatMap((member) =>
          member.professions.map((profession) => [
            profession.slug,
            {
              slug: profession.slug,
              label: profession.label,
              iconUrl: profession.iconUrl,
            },
          ]),
        ),
    ).values(),
  ).sort((a, b) => a.label.localeCompare(b.label, 'es'));

  return {
    members: results,
    professionOptions,
  };
}
