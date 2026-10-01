import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import {
	fetchGuildBossProgress,
	fetchGuildBossKill,
	fetchGuildBossPulls,
	fetchGuildLiveRaidProgress,
	fetchGuildProgression,
	type RaiderIoGuildBossPull,
	type RaiderIoGuildBossKillRosterEntry,
	type RaiderIoLiveBoss,
} from "@/shared/integrations/raiderio/raiderio-client";
import { toRaiderIoRealmSlug } from "@/shared/integrations/wow-realm-slug";

const DIFFICULTIES = [
	{ key: "mythic", label: "M" },
	{ key: "heroic", label: "HC" },
	{ key: "normal", label: "NM" },
] as const;

const CURRENT_RAID_SLUG = process.env.RAID_TIMELINE_SLUG || "tier-mn-1";
const SPOREFALL_RAID_SLUG = "sporefall";
export const SEASON_2_RAID_SLUG = "the-venomous-abyss";

const RAID_KEYS = ["voidspire", "dreamwell", "sunwell", "sporefall"] as const;

const BOSS_RAID_MAP: Record<(typeof RAID_KEYS)[number], string[]> = {
	voidspire: [
		"imperator-averzian",
		"vorasius",
		"fallenking-salhadaar",
		"vaelgor-ezzorak",
		"lightblinded-vanguard",
		"crown-of-the-cosmos",
	],
	dreamwell: ["chimaerus-the-undreamt-god"],
	sunwell: ["beloren-child-of-alar", "midnight-falls"],
	sporefall: ["sporefall"],
};

const BOSS_NAME_OVERRIDES: Record<string, string> = {
	"midnight-falls": "L'ura",
	sporefall: "Pudrelodo",
};

const SYNTHETIC_RAID_IMAGES: Partial<
	Record<(typeof RAID_KEYS)[number], string>
> = {
	sporefall: "/assets/images/raids/sporefall.webp",
	"the-venomous-abyss": "/assets/images/raids/the-venomous-abyss.webp",
} as Record<string, string>;

const BOSS_SEQUENCE = RAID_KEYS.flatMap((key) => BOSS_RAID_MAP[key]);

export const RAID_BOSS_SEQUENCE = BOSS_SEQUENCE;

async function fetchRaidProgressionInternal() {
	try {
		const { data: guild } = await supabaseAdmin
			.from("settings")
			.select("*")
			.eq("id", 1)
			.maybeSingle();

		if (!guild) return [];

		const region = guild.region.toLowerCase();
		const realmSlug = toRaiderIoRealmSlug(guild.realm);

		const [
			rioData,
			liveTrackingByDiff,
			sporefallLiveTrackingByDiff,
			sporefallRecordedActivityByDiff,
		] = await Promise.all([
			fetchGuildProgression(realmSlug, guild.name, region),
			Promise.all(
				DIFFICULTIES.map(async (diff) => {
					const data = await fetchGuildLiveRaidProgress({
						realmSlug,
						guildName: guild.name,
						region,
						raidSlug: CURRENT_RAID_SLUG,
						difficulty: diff.key,
					});
					return [diff.key, data] as const;
				}),
			).then((entries) => Object.fromEntries(entries)),
			Promise.all(
				DIFFICULTIES.map(async (diff) => {
					const data = await fetchGuildLiveRaidProgress({
						realmSlug,
						guildName: guild.name,
						region,
						raidSlug: SPOREFALL_RAID_SLUG,
						difficulty: diff.key,
					});
					return [diff.key, data] as const;
				}),
			).then((entries) => Object.fromEntries(entries)),
			Promise.all(
				DIFFICULTIES.map(async (diff) => {
					const [progressData, killData, pullsData] = await Promise.all([
						fetchGuildBossProgress({
							realmSlug,
							guildName: guild.name,
							region,
							raidSlug: SPOREFALL_RAID_SLUG,
							difficulty: diff.key,
							bossSlug: "latest",
						}),
						fetchGuildBossKill({
							realmSlug,
							guildName: guild.name,
							region,
							raidSlug: SPOREFALL_RAID_SLUG,
							difficulty: diff.key,
							bossSlug: "rotmire",
						}),
						fetchGuildBossPulls({
							realmSlug,
							guildName: guild.name,
							region,
							raidSlug: SPOREFALL_RAID_SLUG,
							difficulty: diff.key,
							bossSlug: "latest",
						}),
					]);
					const pulls = (pullsData || []).slice().sort((a, b) => {
						const aTime = new Date(a.startedAt || a.endedAt || 0).getTime();
						const bTime = new Date(b.startedAt || b.endedAt || 0).getTime();
						return aTime - bTime;
					});
					const killPull = pulls.find((pull) => pull.isKill);
					const firstSeenAt = pulls[0]?.startedAt || pulls[0]?.endedAt || null;
					const lastPullAt =
						pulls[pulls.length - 1]?.endedAt ||
						pulls[pulls.length - 1]?.startedAt ||
						null;
					const isDefeated = Boolean(
						killData?.kill?.isSuccess || progressData?.isDefeated || killPull,
					);
					const killDate =
						killData?.kill?.defeatedAt ||
						(progressData?.isDefeated
							? progressData.pullEndedAt || progressData.pullStartedAt
							: null) ||
						killPull?.endedAt ||
						killPull?.startedAt ||
						null;

					return [
						diff.key,
						{
							isDefeated,
							pullCount:
								pulls.length > 0
									? pulls.length
									: (progressData?.pullCount ?? 0),
							firstSeenAt,
							lastPullAt,
							killDate,
						},
					] as const;
				}),
			).then((entries) => Object.fromEntries(entries)),
		]);

		const killSets: Record<
			(typeof DIFFICULTIES)[number]["key"],
			Set<string>
		> = {
			mythic: new Set(),
			heroic: new Set(),
			normal: new Set(),
		} as const;

		let isLiveRaid = false;

		DIFFICULTIES.forEach((diff) => {
			const bosses = liveTrackingByDiff?.[diff.key]?.bosses || [];
			bosses.forEach((boss) => {
				if (boss.isDefeated) {
					killSets[diff.key].add(boss.boss.slug);
				}
				if (boss.pullStartedAt && !boss.isDefeated) {
					isLiveRaid = true;
				}
			});
		});

		const currentTier =
			rioData?.raid_progression?.[CURRENT_RAID_SLUG] ||
			rioData?.raid_progression?.["tier-mn-1"];
		const sporefallTier = rioData?.raid_progression?.[SPOREFALL_RAID_SLUG];
		const aggregatedKills: Record<
			(typeof DIFFICULTIES)[number]["key"],
			number
		> = {
			mythic: currentTier?.mythic_bosses_killed ?? 0,
			heroic: currentTier?.heroic_bosses_killed ?? 0,
			normal: currentTier?.normal_bosses_killed ?? 0,
		} as const;

		DIFFICULTIES.forEach((diff) => {
			let remaining = Math.max(
				0,
				aggregatedKills[diff.key] - killSets[diff.key].size,
			);
			if (remaining <= 0) return;
			for (const slug of BOSS_SEQUENCE) {
				if (remaining <= 0) break;
				if (killSets[diff.key].has(slug)) continue;
				killSets[diff.key].add(slug);
				remaining -= 1;
			}
		});

		const hasRaidLiveActivity = (raidKey: (typeof RAID_KEYS)[number]) => {
			if (raidKey === "sporefall") {
				const hasRecordedActivity = DIFFICULTIES.some((diff) => {
					const activity = sporefallRecordedActivityByDiff?.[diff.key];
					return Boolean(
						activity?.isDefeated ||
							activity?.pullCount > 0 ||
							activity?.firstSeenAt ||
							activity?.lastPullAt ||
							activity?.killDate,
					);
				});

				if (hasRecordedActivity) return true;
			}

			const liveTracking =
				raidKey === "sporefall"
					? sporefallLiveTrackingByDiff
					: liveTrackingByDiff;
			const targetSlugs = new Set(BOSS_RAID_MAP[raidKey]);

			return DIFFICULTIES.some((diff) => {
				const bosses = (liveTracking?.[diff.key]?.bosses || []).filter((boss) =>
					targetSlugs.has(boss.boss.slug),
				);

				return hasMeaningfulBossActivity(bosses);
			});
		};

		const getSporefallRecordedKillDifficulty = () =>
			DIFFICULTIES.find(
				(diff) => sporefallRecordedActivityByDiff?.[diff.key]?.isDefeated,
			);

		const { data: raids } = await supabaseAdmin
			.from("game_constants")
			.select("key, value, metadata")
			.eq("category", "wow_raid");

		const raidRows = (raids || []).filter(
			(r: any) => r.key !== "Todas las Raids",
		);
		const existingRaidTypes = raidRows.reduce<Set<string>>((set, r) => {
			const key = String(r.key || "").toLowerCase();
			for (const raidKey of RAID_KEYS) {
				if (key.includes(raidKey)) set.add(raidKey);
			}
			return set;
		}, new Set());

		const visibleRaids = raidRows
			.sort((a: any, b: any) => {
				const indexA = RAID_KEYS.findIndex((k) =>
					a.key.toLowerCase().includes(k),
				);
				const indexB = RAID_KEYS.findIndex((k) =>
					b.key.toLowerCase().includes(k),
				);
				return indexA - indexB;
			})
			.map((r: any) => {
				const bossCount =
					r.metadata?.boss_count || r.metadata?.bosses?.length || 0;
				const normalizedKey = r.key.toLowerCase();
				const raidType = RAID_KEYS.find((k) => normalizedKey.includes(k));
				const targetSlugs = raidType ? BOSS_RAID_MAP[raidType] : [];
				const raidProgress =
					raidType === "sporefall" ? sporefallTier : currentTier;

				let displayKills = 0;
				let diffLabel = "NM";

				if (raidType === "sporefall" && raidProgress) {
					for (const diff of DIFFICULTIES) {
						const profileKills =
							raidProgress[`${diff.key}_bosses_killed` as const] ?? 0;
						if (profileKills > 0) {
							displayKills = Math.min(profileKills, bossCount);
							diffLabel = diff.label;
							break;
						}
					}
					const recordedKillDifficulty = getSporefallRecordedKillDifficulty();
					if (displayKills === 0 && recordedKillDifficulty) {
						displayKills = 1;
						diffLabel = recordedKillDifficulty.label;
					}
				} else {
					for (const diff of DIFFICULTIES) {
						const diffKills = targetSlugs.filter((slug) =>
							killSets[diff.key].has(slug),
						).length;
						if (diffKills > 0) {
							displayKills = diffKills;
							diffLabel = diff.label;
							break;
						}
					}
				}

				if (
					displayKills === 0 &&
					(!raidType || !hasRaidLiveActivity(raidType))
				) {
					return null;
				}

				const imageMap: Record<string, string> = {
					voidspire: "/assets/images/raids/voidspire.webp",
					dreamwell: "/assets/images/raids/dreamrift.webp",
					sunwell: "/assets/images/raids/marchonqueldanas.webp",
					sporefall: "/assets/images/raids/sporefall.webp",
					marchonqueldanas: "/assets/images/raids/marchonqueldanas.webp",
				};

				const normalizedImageKey = normalizedKey
					.replace(/['"']/g, "")
					.replace(/\s+/g, "");

				return {
					name: r.value,
					expansion: r.metadata?.expansion || "Midnight",
					tier: r.metadata?.tier || "Temporada 1",
					progress:
						displayKills > 0
							? `${displayKills}/${bossCount} ${diffLabel}`
							: `0/${bossCount}`,
					status:
						raidType === "sporefall"
							? isLiveRaid && displayKills < bossCount
								? ""
								: ""
							: isLiveRaid && displayKills < bossCount
								? ""
								: displayKills > 0
									? ""
									: "Próximamente",
					imageUrl:
						imageMap[raidType || normalizedImageKey] ||
						imageMap[normalizedImageKey] ||
						"/assets/images/raids/all-raids.webp",
					rank: "-",
				};
			})
			.filter((raid): raid is NonNullable<typeof raid> => raid !== null);

		const missingSyntheticRaids = RAID_KEYS.reduce<any[]>((acc, raidKey) => {
			if (existingRaidTypes.has(raidKey)) return acc;
			const targetSlugs = BOSS_RAID_MAP[raidKey];
			const bossCount = targetSlugs.length || 1;
			let displayKills = 0;
			let diffLabel = "NM";

			const raidProgress =
				raidKey === "sporefall" ? sporefallTier : currentTier;

			if (raidKey === "sporefall" && raidProgress) {
				for (const diff of DIFFICULTIES) {
					const profileKills =
						raidProgress[`${diff.key}_bosses_killed` as const] ?? 0;
					if (profileKills > 0) {
						displayKills = Math.min(profileKills, bossCount);
						diffLabel = diff.label;
						break;
					}
				}
				const recordedKillDifficulty = getSporefallRecordedKillDifficulty();
				if (displayKills === 0 && recordedKillDifficulty) {
					displayKills = 1;
					diffLabel = recordedKillDifficulty.label;
				}
			} else {
				for (const diff of DIFFICULTIES) {
					const diffKills = targetSlugs.filter((slug) =>
						killSets[diff.key].has(slug),
					).length;
					if (diffKills > 0) {
						displayKills = diffKills;
						diffLabel = diff.label;
						break;
					}
				}
			}

			if (raidProgress) {
				const profileKills =
					raidProgress.mythic_bosses_killed ??
					raidProgress.heroic_bosses_killed ??
					raidProgress.normal_bosses_killed ??
					0;
				if (profileKills > 0)
					displayKills = Math.max(displayKills, profileKills);
			}

			if (displayKills === 0 && !hasRaidLiveActivity(raidKey)) {
				return acc;
			}

			acc.push({
				name:
					raidKey === "sporefall"
						? "Pudrelodo"
						: raidKey.charAt(0).toUpperCase() + raidKey.slice(1),
				expansion: "Midnight",
				tier: "Temporada 1",
				progress:
					displayKills > 0
						? `${displayKills}/${bossCount} ${diffLabel}`
						: `0/${bossCount}`,
				status:
					displayKills > 0 && displayKills < bossCount && isLiveRaid
						? "En Vivo"
						: "",
				imageUrl:
					SYNTHETIC_RAID_IMAGES[raidKey] ||
					"/assets/images/raids/all-raids.webp",
				rank: "-",
			});
			return acc;
		}, []);

		const result = [...visibleRaids, ...missingSyntheticRaids];

		// Season 2 "Abismo Venenoso" — real progression once Raider.io exposes it.
		const hasSeason2 = result.some(
			(r) => r.tier === "Temporada 2" || r.name === "The Venomous Abyss",
		);
		if (!hasSeason2) {
			const season2Tier = rioData?.raid_progression?.[SEASON_2_RAID_SLUG];
			const bossCount = season2Tier?.total_bosses || 8;
			let displayKills = 0;
			let diffLabel = "NM";

			if (season2Tier) {
				for (const diff of DIFFICULTIES) {
					const profileKills =
						season2Tier[`${diff.key}_bosses_killed` as const] ?? 0;
					if (profileKills > 0) {
						displayKills = Math.min(profileKills, bossCount);
						diffLabel = diff.label;
						break;
					}
				}
			}

			result.push({
				name: "Abismo Venenoso",
				expansion: "Midnight",
				tier: "Temporada 2",
				progress:
					displayKills > 0
						? `${displayKills}/${bossCount} ${diffLabel}`
						: "Season 2",
				status: "",
				imageUrl: "/assets/images/raids/the-venomous-abyss.webp",
				rank: "-",
			});
		}

		return result;
	} catch (e) {
		console.error("getProgression failed:", e);
		return [];
	}
}

export const getRaidProgression = unstable_cache(
	fetchRaidProgressionInternal,
	["raid-progress-public-v5"],
	{ revalidate: 300 },
);

type RaidTimelineBoss = {
	name: string;
	slug: string;
	ordinal: number;
	imageUrl: string;
	killImageUrl: string | null;
	isDefeated: boolean;
	defeatedDifficulty: "mythic" | "heroic" | "normal" | null;
	killDate: string | null;
	pullCount: number;
	bestPercent: number;
	firstSeenAt: string | null;
	lastPullAt: string | null;
	killRoster: RaiderIoGuildBossKillRosterEntry[];
};

function normalizePullPercent(value: number | null | undefined) {
	if (typeof value !== "number" || Number.isNaN(value)) return 100;
	if (value > 0 && value <= 1) return value * 100;
	return value;
}

function getBestRemainingPercentFromPulls(
	pulls: RaiderIoGuildBossPull[],
	includeKills = false,
) {
	const relevantPulls = pulls.filter(
		(pull) =>
			(includeKills || !pull.isKill) &&
			// A non-kill pull can never legitimately end with the boss at 0% HP.
			// Raider.io sometimes reports boss_percent 0 on non-kill pulls (phase
			// resets, special encounter wipes), which would otherwise make the
			// timeline show a permanent "Mejor progreso: 100%".
			(pull.isKill || normalizePullPercent(pull.percent) !== 0),
	);
	if (relevantPulls.length === 0) return null;

	return relevantPulls.reduce((best, pull) => {
		const percent = normalizePullPercent(pull.percent);
		return Math.min(best, percent);
	}, 100);
}

export type RaidTimeline = {
	raidName: string;
	difficulty: "mythic" | "heroic" | "normal";
	lastUpdated: string;
	bosses: RaidTimelineBoss[];
};

function getLiveBossActivityScore(bosses: RaiderIoLiveBoss[] = []) {
	return bosses.reduce((score, boss) => {
		if (boss.isDefeated) return score + 1000;
		if (boss.pullStartedAt || boss.pullEndedAt) return score + 100;
		if (boss.pullCount > 0) return score + boss.pullCount;
		if (boss.bestPercent > 0 && boss.bestPercent < 100) return score + 10;
		return score;
	}, 0);
}

function hasMeaningfulBossActivity(bosses: RaiderIoLiveBoss[] = []) {
	return bosses.some(
		(boss) =>
			boss.isDefeated ||
			boss.pullCount > 0 ||
			Boolean(boss.pullStartedAt) ||
			Boolean(boss.pullEndedAt) ||
			(boss.bestPercent > 0 && boss.bestPercent < 100),
	);
}

function formatRaidTimelineName(raidSlug: string, fallbackName: string) {
	const normalized = raidSlug.trim().toLowerCase();

	if (normalized === "tier-mn-1") {
		return "Midnight Tier 1";
	}

	if (normalized === SEASON_2_RAID_SLUG) {
		return "The Venomous Abyss";
	}

	return fallbackName;
}

function getBossDisplayName(slug: string, fallbackName: string) {
	return BOSS_NAME_OVERRIDES[slug] || fallbackName;
}

function hasTimelineActivity(boss: RaidTimelineBoss) {
	return (
		boss.isDefeated ||
		boss.pullCount > 0 ||
		Boolean(boss.firstSeenAt) ||
		Boolean(boss.lastPullAt) ||
		(boss.bestPercent > 0 && boss.bestPercent < 100)
	);
}

async function fetchRaidTimelineInternal(
	raidSlug = CURRENT_RAID_SLUG,
): Promise<RaidTimeline | null> {
	try {
		const { data: guild } = await supabaseAdmin
			.from("settings")
			.select("name, region, realm")
			.eq("id", 1)
			.maybeSingle();

		if (!guild) return null;

		const region = guild.region.toLowerCase();
		const realmSlug = toRaiderIoRealmSlug(guild.realm);
		const difficulties: ("mythic" | "heroic" | "normal")[] = [
			"mythic",
			"heroic",
			"normal",
		];

		const liveDataByDifficulty = await Promise.all(
			difficulties.map(async (diff) => {
				const data = await fetchGuildLiveRaidProgress({
					realmSlug,
					guildName: guild.name,
					region,
					raidSlug,
					difficulty: diff,
					revalidate: 120,
				});

				return {
					difficulty: diff,
					data,
					activityScore: getLiveBossActivityScore(data?.bosses || []),
				};
			}),
		);

		const activeCandidate = liveDataByDifficulty.find(
			(entry) =>
				Boolean(entry.data?.bosses?.length) &&
				hasMeaningfulBossActivity(entry.data?.bosses || []),
		);

		const candidatesWithBosses = liveDataByDifficulty.filter(
			(entry) => entry.data?.bosses?.length,
		);
		const bestCandidate =
			candidatesWithBosses.length > 0
				? candidatesWithBosses.reduce((best, current) =>
						current.activityScore > best.activityScore ? current : best,
					)
				: undefined;

		const fallbackCandidate = liveDataByDifficulty.find((entry) =>
			Boolean(entry.data?.bosses?.length),
		);

		const selectedCandidate =
			activeCandidate ||
			(bestCandidate && bestCandidate.activityScore > 0
				? bestCandidate
				: fallbackCandidate);

		const resolvedDifficulty = selectedCandidate?.difficulty ?? null;
		const raidData = selectedCandidate?.data ?? null;

		if (!raidData || !resolvedDifficulty) return null;

		const progressionProfile = await fetchGuildProgression(realmSlug, guild.name, region);
		const currentTier = progressionProfile?.raid_progression?.[raidSlug];
		const aggregatedKills: Record<string, number> = {
			mythic: currentTier?.mythic_bosses_killed ?? 0,
			heroic: currentTier?.heroic_bosses_killed ?? 0,
			normal: currentTier?.normal_bosses_killed ?? 0,
		};

		const killSetForDifficulty = new Set<string>();
		(raidData.bosses || []).forEach((b: any) => {
			if (b.isDefeated) killSetForDifficulty.add(b.boss.slug);
		});
		let remainingKills = Math.max(
			0,
			aggregatedKills[resolvedDifficulty] - killSetForDifficulty.size,
		);
		if (remainingKills > 0) {
			const raidBossSequence = (raidData.bosses || [])
				.slice()
				.sort((a, b) => a.boss.ordinal - b.boss.ordinal)
				.map((boss) => boss.boss.slug);
			for (const slug of raidBossSequence) {
				if (remainingKills <= 0) break;
				if (killSetForDifficulty.has(slug)) continue;
				killSetForDifficulty.add(slug);
				remainingKills -= 1;
			}
		}

		const { data: killImages } = await supabaseAdmin
			.from("game_constants")
			.select("key, value")
			.eq("category", "wow_raid_kill_images");

		const killImageMap = Object.fromEntries(
			(killImages || []).map((row: any) => [row.key, row.value] as const),
		);

		const bossDetails = await Promise.all(
			raidData.bosses
				.slice()
				.sort((a, b) => a.boss.ordinal - b.boss.ordinal)
				.map(async (boss) => {
					const progressBossSlug =
						raidSlug === "sporefall" ? "latest" : boss.boss.slug;
					const killBossSlug =
						raidSlug === "sporefall" ? "rotmire" : boss.boss.slug;
					const [progressData, killData, pullsData] = await Promise.all([
						fetchGuildBossProgress({
							realmSlug,
							guildName: guild.name,
							region,
							raidSlug,
							difficulty: resolvedDifficulty,
							bossSlug: progressBossSlug,
							revalidate: 120,
						}),
						fetchGuildBossKill({
							realmSlug,
							guildName: guild.name,
							region,
							raidSlug,
							difficulty: resolvedDifficulty,
							bossSlug: killBossSlug,
							revalidate: 120,
						}),
						fetchGuildBossPulls({
							realmSlug,
							guildName: guild.name,
							region,
							raidSlug,
							difficulty: resolvedDifficulty,
							bossSlug: progressBossSlug,
							revalidate: 120,
						}),
					]);

					const pulls = (pullsData || []).slice().sort((a, b) => {
						const aTime = new Date(a.startedAt || a.endedAt || 0).getTime();
						const bTime = new Date(b.startedAt || b.endedAt || 0).getTime();
						return aTime - bTime;
					});

					const killPull = pulls.find((pull) => pull.isKill);
					const firstSeenAt = pulls[0]?.startedAt || pulls[0]?.endedAt || null;
					const lastPullAt =
						pulls[pulls.length - 1]?.endedAt ||
						pulls[pulls.length - 1]?.startedAt ||
						null;

					const rawIcon = boss.boss.iconUrl || progressData?.boss.iconUrl || "";
					const imageUrl = rawIcon.startsWith("http")
						? rawIcon
						: rawIcon
							? `https://cdnassets.raider.io${rawIcon}`
							: `${process.env.NEXT_PUBLIC_ASSETS_BASE_URL || "https://artictempest.es"}/assets/images/raids/all-raids.webp`;

					const computedPullCount =
						pulls.length > 0
							? pulls.length
							: (progressData?.pullCount ?? boss.pullCount);
					const bestWipePercent = getBestRemainingPercentFromPulls(pulls);
					const bestAnyPullPercent = getBestRemainingPercentFromPulls(
						pulls,
						true,
					);
					const apiBestPercent = normalizePullPercent(
						progressData?.bestPercent ?? boss.bestPercent,
					);
					const computedBestPercent =
						bestWipePercent ?? bestAnyPullPercent ?? apiBestPercent;

					const bossHasKillSignal = Boolean(
						killData?.kill?.isSuccess ||
							progressData?.isDefeated ||
							boss.isDefeated ||
							killPull?.isKill ||
							killSetForDifficulty.has(boss.boss.slug),
					);
					const defeatedDifficulty: RaidTimelineBoss["defeatedDifficulty"] =
						bossHasKillSignal ? resolvedDifficulty : null;

					return {
						name: getBossDisplayName(boss.boss.slug, boss.boss.name),
						slug: boss.boss.slug,
						ordinal: boss.boss.ordinal,
						imageUrl,
						killImageUrl: killImageMap[boss.boss.slug] || null,
						isDefeated: bossHasKillSignal,
						defeatedDifficulty,
						killDate:
							killData?.kill?.defeatedAt ||
							(bossHasKillSignal
								? progressData?.pullEndedAt || progressData?.pullStartedAt
								: null) ||
							killPull?.endedAt ||
							killPull?.startedAt ||
							(boss.isDefeated ? boss.pullEndedAt || boss.pullStartedAt : null),
						pullCount: computedPullCount,
						bestPercent: computedBestPercent,
						firstSeenAt,
						lastPullAt,
						killRoster: killData?.roster || [],
					} satisfies RaidTimelineBoss;
				}),
		);

		const activeBossDetails = bossDetails.filter(hasTimelineActivity);

		if (activeBossDetails.length === 0) return null;

		return {
			raidName: formatRaidTimelineName(raidSlug, raidData.raid.name),
			difficulty: resolvedDifficulty,
			lastUpdated: new Date().toISOString(),
			bosses: activeBossDetails,
		};
	} catch (error) {
		console.error("fetchRaidTimelineInternal failed:", error);
		return null;
	}
}

export const getRaidTimeline = unstable_cache(
	fetchRaidTimelineInternal,
	["raid-progress-timeline-v4"],
	{ revalidate: 120, tags: ["raid-kill-images"] },
);
