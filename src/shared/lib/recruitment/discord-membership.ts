import 'server-only';

import { getGuildCredentials } from '@/shared/auth/credentials';
import { supabaseAdmin } from '@/shared/lib/supabase-admin';

/**
 * Public, permanent invite to the guild.
 *
 * Needed because Discord offers no way to bypass a user's DM privacy: if an
 * applicant shares no guild with the bot, no notification can reach them. Being in
 * the server is the only thing that unblocks the conversation, so this link is the
 * remedy the apply flow points at.
 */
export const DISCORD_PUBLIC_INVITE_URL = 'https://discord.gg/artictempest';

export const MEMBERSHIP_REQUIRED_MESSAGE =
  'Necesitas unirte al servidor de Discord de Artic Tempest antes de enviar tu solicitud.';

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

/**
 * Resolves the guild membership of an app user, following their linked Discord
 * account.
 *
 * `null` means "could not determine", never "no": both fields are tri-state so a
 * failure never turns into a wrong answer about the user.
 */
type MembershipStatus = {
  /** `true` has a linked account, `false` definitely none, `null` could not check. */
  hasDiscordAccount: boolean | null;
  inGuild: boolean | null;
};

async function fetchGuildMembershipForUser(
  userId: string,
): Promise<MembershipStatus> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('discord_user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error(
      '[Recruitment:Membership] Failed to load profile:',
      error.message,
    );
    return { hasDiscordAccount: null, inGuild: null };
  }

  const discordUserId = profile?.discord_user_id ?? null;

  if (!discordUserId) return { hasDiscordAccount: false, inGuild: null };

  return {
    hasDiscordAccount: true,
    inGuild: await fetchDiscordGuildMembership(discordUserId),
  };
}

export type MembershipGateReason =
  | 'member'
  | 'exempt_test'
  | 'exempt_simulate'
  | 'unknown'
  | 'not_in_server'
  | 'no_discord_account';

export type MembershipGateDecision = {
  allowed: boolean;
  reason: MembershipGateReason;
};

/**
 * Resolves the account status and applies the policy in one call, so both gate
 * callers (the apply page and the submit core) compose it the same way instead of
 * repeating the two steps.
 */
export async function resolveUserMembershipGate(input: {
  userId: string;
  isTest: boolean;
  simulate: boolean;
  internalAdmin: boolean;
}): Promise<MembershipGateDecision> {
  const status = await fetchGuildMembershipForUser(input.userId);

  return resolveMembershipGate({
    ...status,
    isTest: input.isTest,
    simulate: input.simulate,
    internalAdmin: input.internalAdmin,
  });
}

/**
 * Decides whether this submission may proceed.
 *
 * Fails **open** when membership cannot be determined: a Discord outage must not
 * make the application form unusable, and the web chat remains the source of truth
 * for the message itself. It fails **closed** only on a definite negative answer.
 */
export function resolveMembershipGate(input: {
  isTest: boolean;
  simulate: boolean;
  internalAdmin: boolean;
  hasDiscordAccount: boolean | null;
  inGuild: boolean | null;
}): MembershipGateDecision {
  // Test runs and admin simulations are exempt. The daily Statuspage self-test
  // submits from the test character's owner, who is not necessarily in the server,
  // and blocking it would take the monitoring down with it.
  if (input.isTest) return { allowed: true, reason: 'exempt_test' };
  if (input.simulate && input.internalAdmin) {
    return { allowed: true, reason: 'exempt_simulate' };
  }

  if (input.hasDiscordAccount === false) {
    return { allowed: false, reason: 'no_discord_account' };
  }

  if (input.inGuild === false) {
    return { allowed: false, reason: 'not_in_server' };
  }

  if (input.hasDiscordAccount === null || input.inGuild === null) {
    return { allowed: true, reason: 'unknown' };
  }

  return { allowed: true, reason: 'member' };
}
