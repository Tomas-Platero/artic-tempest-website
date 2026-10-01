// src/shared/integrations/raiderio/raiderio-client.ts
// Raider.io public API client for guild progression

import { toRaiderIoRealmSlug } from "@/shared/integrations/wow-realm-slug";

export type RaidProgression = {
	summary: string;
	total_bosses: number;
	normal_bosses_killed: number;
	heroic_bosses_killed: number;
	mythic_bosses_killed: number;
};

export type RaiderIoGuildProfile = {
	name: string;
	region: string;
	realm: string;
	faction: string;
	profile_url: string;
	raid_progression: Record<string, RaidProgression>;
};

export type RaiderIoStaticRaid = {
	id: number;
	slug: string;
	name: string;
	short_name?: string;
	icon?: string;
	starts?: Record<string, string | null>;
	ends?: Record<string, string | null>;
	encounters?: Array<{
		id: number;
		slug: string;
		name: string;
	}>;
};

export type RaiderIoStaticData = {
	raids: RaiderIoStaticRaid[];
};

export type RaiderIoLiveBoss = {
	boss: {
		encounterId: number;
		name: string;
		slug: string;
		ordinal: number;
		iconUrl?: string;
	};
	bestPercent: number;
	pullCount: number;
	pullStartedAt: string | null;
	pullEndedAt: string | null;
	isDefeated: boolean;
};

export type RaiderIoLiveRaidProgress = {
	guild: {
		id: number;
		name: string;
		path: string;
		faction: string;
	};
	raid: {
		slug: string;
		name: string;
		difficulty: string;
	};
	bosses: RaiderIoLiveBoss[];
};

export type RaiderIoGuildBossProgress = {
	guild: {
		id: number;
		name: string;
		path: string;
		faction: string;
	};
	raid: {
		slug: string;
		name: string;
		difficulty: string;
	};
	boss: {
		encounterId: number;
		name: string;
		slug: string;
		ordinal: number;
		iconUrl?: string;
	};
	bestPercent: number;
	pullCount: number;
	pullStartedAt: string | null;
	pullEndedAt: string | null;
	isDefeated: boolean;
};

export type RaiderIoGuildBossPull = {
	encounterId: number;
	bossName: string;
	bossSlug: string;
	percent: number;
	startedAt: string | null;
	endedAt: string | null;
	isKill: boolean;
};

export type RaiderIoGuildBossKill = {
	kill: {
		defeatedAt: string | null;
		durationMs: number | null;
		isSuccess: boolean;
		itemLevelEquippedAvg: number | null;
		artifactTraitsAvg: number | null;
	} | null;
	roster: RaiderIoGuildBossKillRosterEntry[];
};

export type RaiderIoGuildBossKillRosterEntry = {
	name: string;
	className: string | null;
	classSlug: string | null;
	specName: string | null;
	specSlug: string | null;
	role: string | null;
	profileUrl: string | null;
};

const IS_DEV = process.env.NODE_ENV === "development";

// En desarrollo: timeout agresivo y sin reintentos
// El cache (unstable_cache) se pierde al reiniciar el server,
// así que es mejor fallar rápido que esperar 10s.
const RAIDER_IO_TIMEOUT_MS = IS_DEV ? 2000 : 5000;
const MAX_RETRIES = IS_DEV ? 0 : 1;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs = RAIDER_IO_TIMEOUT_MS,
	retries = MAX_RETRIES,
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const res = await fetch(url, {
				...init,
				signal: controller.signal,
			});

			if (res.ok || !RETRY_STATUSES.has(res.status)) {
				return res;
			}

			// Retryable 5xx/429 — wait with exponential backoff
			const delay = Math.min(1000 * 2 ** attempt, 4000);
			await new Promise((r) => setTimeout(r, delay));
		} catch (err) {
			lastError = err as Error;
			if (attempt >= retries) throw err;

			const delay = Math.min(1000 * 2 ** attempt, 4000);
			await new Promise((r) => setTimeout(r, delay));
		} finally {
			clearTimeout(timeout);
		}
	}

	throw lastError ?? new Error("fetchWithTimeout exhausted");
}

type RaiderIoGuildBossPullApiItem = {
	encounterId?: number;
	bossName?: string;
	bossSlug?: string;
	percent?: number;
	startedAt?: string | null;
	endedAt?: string | null;
	isKill?: boolean;
	details?: {
		id?: number;
		is_success?: boolean;
		pull_started_at?: string | null;
		pull_ended_at?: string | null;
		encounter_health?: {
			overall_percent?: number;
			boss_percent?: number;
		};
	};
	boss?: {
		encounterId?: number;
		name?: string;
		slug?: string;
	};
};

function normalizeBossPull(
	item: RaiderIoGuildBossPullApiItem,
	fallbackBossSlug: string,
): RaiderIoGuildBossPull {
	return {
		encounterId:
			item.encounterId ?? item.boss?.encounterId ?? item.details?.id ?? 0,
		bossName: item.bossName ?? item.boss?.name ?? fallbackBossSlug,
		bossSlug: item.bossSlug ?? item.boss?.slug ?? fallbackBossSlug,
		percent:
			item.percent ??
			item.details?.encounter_health?.boss_percent ??
			item.details?.encounter_health?.overall_percent ??
			100,
		startedAt: item.startedAt ?? item.details?.pull_started_at ?? null,
		endedAt: item.endedAt ?? item.details?.pull_ended_at ?? null,
		isKill: item.isKill ?? item.details?.is_success ?? false,
	};
}

/** Fetch guild raid progression from Raider.io */
export async function fetchGuildProgression(
	realmSlug: string,
	guildName: string,
	region: string = "eu",
): Promise<RaiderIoGuildProfile | null> {
	// Raider.io expects the name with spaces or URL-encoded (e.g. "Artic%20Tempest")
	const url = `https://raider.io/api/v1/guilds/profile?region=${region}&realm=${encodeURIComponent(realmSlug)}&name=${encodeURIComponent(guildName)}&fields=raid_progression`;

	try {
		// We cache the result for 1 hour to avoid hitting rate limits
		const res = await fetchWithTimeout(url, {
			next: { revalidate: 3600 },
		});

		if (!res.ok) {
			if (res.status === 404) return null;
			console.error(`Raider.io API error ${res.status}: ${await res.text()}`);
			return null;
		}

		const data: RaiderIoGuildProfile = await res.json();
		return data;
	} catch (error) {
		if ((error as any)?.name === "AbortError") return null;
		console.error("Failed to fetch Raider.io progression:", error);
		return null;
	}
}

export async function fetchRaiderIoRaidingStaticData(
	expansionId = 11,
): Promise<RaiderIoStaticData | null> {
	const url = `https://raider.io/api/v1/raiding/static-data?expansion_id=${expansionId}`;

	try {
		const res = await fetchWithTimeout(url, { next: { revalidate: 3600 } });

		if (!res.ok) {
			console.error(
				`Raider.io Static Data error ${res.status}: ${await res.text()}`,
			);
			return null;
		}

		return (await res.json()) as RaiderIoStaticData;
	} catch (error) {
		if ((error as any)?.name === "AbortError") return null;
		console.error("Failed to fetch Raider.io static data:", error);
		return null;
	}
}

/** Fetch character mythic plus and raid progression from Raider.io */
export async function fetchCharacterRIO(
	name: string,
	realm: string,
	region: string = "eu",
): Promise<any> {
	const realmSlug = toRaiderIoRealmSlug(realm);
	const seasons = [
		"current",
		"season-mn-2",
		"season-mn-1",
		"season-tww-3",
		"season-tww-2",
		"season-tww-1",
		"season-df-4",
		"season-df-3",
		"season-sl-4",
	];
	const raidField =
		"raid_progression:sporefall:tier-mn-1:the-venomous-abyss:the-tidebound-grotto:manaforge-omega:liberation-of-undermine:nerubar-palace:amirdrassil-the-dreams-hope:aberrus-the-shadowed-crucible:vault-of-the-incarnates:sepulcher-of-the-first-ones:sanctum-of-domination:castle-nathria";
	const seasonField = `mythic_plus_scores_by_season:${seasons.join(":")}`;
	const url = `https://raider.io/api/v1/characters/profile?region=${region}&realm=${encodeURIComponent(realmSlug)}&name=${encodeURIComponent(name)}&fields=guild,${seasonField},${raidField},active_spec_name,gear`;

	try {
		const res = await fetchWithTimeout(url, { next: { revalidate: 3600 } });
		if (!res.ok) return null;
		return await res.json();
	} catch (error) {
		if ((error as any)?.name === "AbortError") return null;
		console.error("Failed to fetch Character RIO:", error);
		return null;
	}
}

type LiveTrackingOptions = {
	realmSlug: string;
	guildName: string;
	region?: string;
	raidSlug?: string;
	difficulty?: "mythic" | "heroic" | "normal";
	revalidate?: number;
};

/**
 * Fetch live raid tracking data for a guild using Raider.io v2 API.
 * See https://raider.io/api (Live Tracking – Raiding)
 */
export async function fetchGuildLiveRaidProgress({
	realmSlug,
	guildName,
	region = "eu",
	raidSlug = "tier-mn-1",
	difficulty = "mythic",
	revalidate = 30,
}: LiveTrackingOptions): Promise<RaiderIoLiveRaidProgress | null> {
	const url = `https://raider.io/api/v1/live-tracking/guild/raid-progress?region=${region}&realm=${encodeURIComponent(realmSlug)}&guild=${encodeURIComponent(
		guildName,
	)}&raid=${raidSlug}&difficulty=${difficulty}`;

	try {
		const res = await fetchWithTimeout(url, {
			next: { revalidate },
		});

		if (!res.ok) {
			if (res.status === 404) return null;
			console.error(
				`Raider.io Live Tracking error ${res.status}: ${await res.text()}`,
			);
			return null;
		}

		const data: RaiderIoLiveRaidProgress = await res.json();
		return data;
	} catch (error) {
		if ((error as any)?.name === "AbortError") return null;
		console.error("Failed to fetch Raider.io live raid progress:", error);
		return null;
	}
}

type BossTrackingOptions = {
	realmSlug: string;
	guildName: string;
	bossSlug: string;
	region?: string;
	raidSlug?: string;
	difficulty?: "mythic" | "heroic" | "normal";
	revalidate?: number;
};

function normalizeGuildBossKill(
	data: any,
	region = "eu",
	realmSlug = "",
): RaiderIoGuildBossKill {
	return {
		kill: data?.kill
			? {
					defeatedAt: data.kill.defeatedAt ?? null,
					durationMs: data.kill.durationMs ?? null,
					isSuccess: Boolean(data.kill.isSuccess),
					itemLevelEquippedAvg: data.kill.itemLevelEquippedAvg ?? null,
					artifactTraitsAvg: data.kill.artifactTraitsAvg ?? null,
				}
			: null,
		roster: Array.isArray(data?.roster)
			? data.roster.reduce(
					(acc: RaiderIoGuildBossKillRosterEntry[], entry: any) => {
						const character = entry?.character ?? entry?.player ?? entry ?? {};
						const name = String(character?.name ?? "").trim();
						if (!name) return acc;

						const profileUrl =
							character?.profileUrl ??
							character?.profile_url ??
							(name && realmSlug
								? `https://raider.io/characters/${region}/${encodeURIComponent(realmSlug)}/${encodeURIComponent(name)}`
								: null);

						acc.push({
							name,
							className: character?.class?.name ?? null,
							classSlug: character?.class?.slug ?? null,
							specName: character?.spec?.name ?? null,
							specSlug: character?.spec?.slug ?? null,
							role: character?.spec?.role ?? character?.role ?? null,
							profileUrl,
						});
						return acc;
					},
					[] as RaiderIoGuildBossKillRosterEntry[],
				)
			: [],
	};
}

export async function fetchGuildBossKill({
	realmSlug,
	guildName,
	bossSlug,
	region = "eu",
	raidSlug = "tier-mn-1",
	difficulty = "mythic",
	revalidate = 120,
}: BossTrackingOptions): Promise<RaiderIoGuildBossKill | null> {
	const url = `https://raider.io/api/v1/guilds/boss-kill?region=${region}&realm=${encodeURIComponent(realmSlug)}&guild=${encodeURIComponent(
		guildName,
	)}&raid=${raidSlug}&boss=${bossSlug}&difficulty=${difficulty}`;

	try {
		const res = await fetchWithTimeout(url, { next: { revalidate } });
		if (!res.ok) {
			if (res.status === 404) return null;
			console.error(
				`Raider.io Boss Kill error ${res.status}: ${await res.text()}`,
			);
			return null;
		}
		return normalizeGuildBossKill(await res.json(), region, realmSlug);
	} catch (error) {
		if ((error as any)?.name === "AbortError") return null;
		console.error("Failed to fetch Raider.io boss kill:", error);
		return null;
	}
}

export async function fetchGuildBossProgress({
	realmSlug,
	guildName,
	bossSlug,
	region = "eu",
	raidSlug = "tier-mn-1",
	difficulty = "mythic",
	revalidate = 120,
}: BossTrackingOptions): Promise<RaiderIoGuildBossProgress | null> {
	const url = `https://raider.io/api/v1/live-tracking/guild/boss-progress?region=${region}&realm=${encodeURIComponent(realmSlug)}&guild=${encodeURIComponent(
		guildName,
	)}&raid=${raidSlug}&boss=${bossSlug}&difficulty=${difficulty}`;

	try {
		const res = await fetchWithTimeout(url, { next: { revalidate } });
		if (!res.ok) {
			if (res.status === 404) return null;
			console.error(
				`Raider.io Boss Progress error ${res.status}: ${await res.text()}`,
			);
			return null;
		}
		return (await res.json()) as RaiderIoGuildBossProgress;
	} catch (error) {
		if ((error as any)?.name === "AbortError") return null;
		console.error("Failed to fetch Raider.io boss progress:", error);
		return null;
	}
}

export async function fetchGuildBossPulls({
	realmSlug,
	guildName,
	bossSlug,
	region = "eu",
	raidSlug = "tier-mn-1",
	difficulty = "mythic",
	revalidate = 120,
}: BossTrackingOptions): Promise<RaiderIoGuildBossPull[] | null> {
	const url = `https://raider.io/api/v1/live-tracking/guild/boss-pulls?region=${region}&realm=${encodeURIComponent(realmSlug)}&guild=${encodeURIComponent(
		guildName,
	)}&raid=${raidSlug}&boss=${bossSlug}&difficulty=${difficulty}`;

	try {
		const res = await fetchWithTimeout(url, { next: { revalidate } });
		if (!res.ok) {
			if (res.status === 404) return null;
			console.error(
				`Raider.io Boss Pulls error ${res.status}: ${await res.text()}`,
			);
			return null;
		}
		const data = await res.json();
		if (Array.isArray(data)) {
			return data.map((item) =>
				normalizeBossPull(item as RaiderIoGuildBossPullApiItem, bossSlug),
			);
		}
		if (Array.isArray(data?.pulls))
			return data.pulls.map((item: RaiderIoGuildBossPullApiItem) =>
				normalizeBossPull(item, bossSlug),
			);
		return null;
	} catch (error) {
		if ((error as any)?.name === "AbortError") return null;
		console.error("Failed to fetch Raider.io boss pulls:", error);
		return null;
	}
}
