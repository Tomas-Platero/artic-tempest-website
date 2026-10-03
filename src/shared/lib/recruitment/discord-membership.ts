import 'server-only';

import { getGuildCredentials } from '@/shared/auth/credentials';

/**
 * Bounded lookup: this runs inline on the chat send path, so a hanging Discord
 * request must not delay the message the officer is writing.
 */
const MEMBERSHIP_TIMEOUT_MS = 3000;

/**
 * Asks Discord whether this user is a member of the guild.
 *
 * Returns:
 * - `true`  — the user is in the server (`200`).
 * - `false` — the user is not (`404 Unknown Member`).
 * - `null`  — we could not ask (no credentials, timeout, rate limit).
 *
 * `null` is deliberately distinct from `false`: a failed lookup must never be
 * reported as "the applicant is not in the server".
 */
export async function fetchDiscordGuildMembership(
  discordUserId: string,
): Promise<boolean | null> {
  try {
    const creds = await getGuildCredentials();
    const guildId = creds.discord_guild_id;
    const botToken = creds.discord_bot_token;

    if (!guildId || !botToken || !discordUserId) return null;

    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`,
      {
        headers: { Authorization: `Bot ${botToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(MEMBERSHIP_TIMEOUT_MS),
      },
    );

    if (response.status === 200) return true;
    if (response.status === 404) return false;

    console.warn(
      `[Recruitment:Membership] Unexpected status ${response.status} for ${discordUserId}`,
    );
    return null;
  } catch (error: any) {
    const isTimeout = error?.name === 'TimeoutError';

    console.warn(
      isTimeout
        ? `[Recruitment:Membership] Lookup timed out for ${discordUserId}`
        : '[Recruitment:Membership] Lookup failed:',
      isTimeout ? '' : (error?.message ?? error),
    );
    return null;
  }
}
