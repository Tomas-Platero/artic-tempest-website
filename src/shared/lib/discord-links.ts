/**
 * Public, permanent invite to the guild.
 *
 * Needed because Discord offers no way to bypass a user's DM privacy: if an
 * applicant shares no guild with the bot, no notification can reach them, so being
 * in the server is the only thing that unblocks the conversation.
 *
 * Client-safe on purpose — the apply form renders it too, and it must not import
 * anything server-only.
 *
 * Two verified facts behind this value (checked against the API and the configured
 * guild `1251201368467701791`):
 *
 * - The vanity invite `artictempest`, used in three places before, is **not valid**:
 *   Discord answers `404 Unknown Invite`. A plain `curl -I` returns 200 because
 *   Discord serves an HTML page even for a broken invite, which is how it went
 *   unnoticed.
 * - This branded short domain redirects to the real invite (`hvYQtdK7UM`), points to
 *   the right guild and never expires.
 */
export const DISCORD_PUBLIC_INVITE_URL = 'https://discord.artictempest.es/';
