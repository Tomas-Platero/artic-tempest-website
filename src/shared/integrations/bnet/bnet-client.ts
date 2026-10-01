// src/shared/integrations/bnet/bnet-client.ts
// Blizzard Battle.net API client using client_credentials OAuth2

import { getGuildCredentials } from '@/shared/auth/credentials';
import {
  toBlizzardCharacterName,
  toBlizzardRealmSlug,
} from '@/shared/integrations/wow-realm-slug';

/** Cached token */
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Get OAuth2 access token via client_credentials */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const creds = await getGuildCredentials();
  if (!creds.bnet_client_id || !creds.bnet_client_secret) {
    throw new Error(
      'Faltan credenciales de Battle.net (configúralas en Ajustes > General)',
    );
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.bnet_client_id,
    client_secret: creds.bnet_client_secret,
  });

  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Battle.net OAuth error ${res.status}: ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 1 min before expiry
  };

  return cachedToken.token;
}

/** Fetch character summary (spec + level) from Battle.net character profile */
export async function fetchCharacterSummary(
  realmSlug: string,
  characterNameSlug: string,
  region: string,
  token: string,
): Promise<{ spec: string | null; level: number | null } | null> {
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(toBlizzardRealmSlug(realmSlug))}/${encodeURIComponent(toBlizzardCharacterName(characterNameSlug))}?namespace=profile-${region}&locale=en_US`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const data = await res.json();
    return {
      spec: data.active_spec?.name || null,
      level: data.level || null,
    };
  } catch {
    return null;
  }
}

/** Fetch character media (avatar/thumbnail) from Battle.net */
export async function fetchCharacterMedia(
  realmSlug: string,
  characterNameSlug: string,
  region: string,
  token: string,
): Promise<string | null> {
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(toBlizzardRealmSlug(realmSlug))}/${encodeURIComponent(toBlizzardCharacterName(characterNameSlug))}/character-media?namespace=profile-${region}&locale=en_US`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const data = await res.json();
    // Assets: 'avatar' (small), 'inset' (medium), 'main' (large)
    const avatarAsset =
      data.assets?.find((a: any) => a.key === 'avatar') || data.assets?.[0];
    return avatarAsset?.value || null;
  } catch {
    return null;
  }
}

export async function fetchCharacterProfessions(
  realmSlug: string,
  characterNameSlug: string,
  region: string = 'eu',
): Promise<any> {
  const token = await getAccessToken();
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(toBlizzardRealmSlug(realmSlug))}/${encodeURIComponent(toBlizzardCharacterName(characterNameSlug))}/professions?namespace=profile-${region}&locale=en_US`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Fetch a character's item level from Battle.net */
export async function fetchCharacterItemLevel(
  realmSlug: string,
  characterNameSlug: string,
  region: string = 'eu',
): Promise<{ equipped: number; average: number } | null> {
  const token = await getAccessToken();
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(toBlizzardRealmSlug(realmSlug))}/${encodeURIComponent(toBlizzardCharacterName(characterNameSlug))}?namespace=profile-${region}&locale=en_US`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const data = await res.json();
    return {
      equipped: data.equipped_item_level || 0,
      average: data.average_item_level || 0,
    };
  } catch {
    return null;
  }
}

/** Convert guild name to slug (lowercase, hyphens, no special chars) */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
