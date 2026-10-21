import "server-only";
import type { AuthOptions } from "next-auth";
import DiscordProvider, {
	type DiscordProfile,
} from "next-auth/providers/discord";
import { getServerSession } from "next-auth";
import { getGuildCredentials } from "@/shared/auth/credentials";
import { supabaseAdmin } from "@/shared/lib/supabase-admin"; // react-doctor-disable-line supabase-client-owned-authz-field — server-only file, not client
import type { AuthzScope, RoleFlags, RoleLevel } from "@/shared/types/auth";
import { resolveAuthzScopeFromFlags } from "@/shared/auth/authz";
import { fetchAppRoles, getRoleFlags } from "@/shared/auth/roles";

type DiscordMember = {
	user: {
		id: string;
		username?: string;
		global_name?: string;
		avatar?: string | null;
	};
	roles: string[];
};

const BAN_RESET_FIELDS = {
	is_banned: false,
	ban_reason: null,
	ban_expires_at: null,
	banned_at: null,
	banned_by: null,
};

function banStillActive(profile?: {
	is_banned?: boolean | null;
	ban_expires_at?: string | null;
}) {
	if (!profile?.is_banned) return false;
	if (!profile.ban_expires_at) return true;
	const expires = new Date(profile.ban_expires_at);
	return Number.isNaN(expires.getTime()) ? true : expires > new Date();
}

async function clearBan(userId: string) {
	if (!userId) return;
	await supabaseAdmin
		.from("profiles")
		.update(BAN_RESET_FIELDS)
		.eq("user_id", userId);
}

function discordAvatarURL(userId: string, avatar?: string | null) {
	return avatar
		? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`
		: null;
}

async function fetchDiscordMember(
	accessToken: string,
	guildId: string,
): Promise<DiscordMember | null> {
	if (!guildId) return null;
	const url = `https://discord.com/api/users/@me/guilds/${guildId}/member`;
	try {
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!response.ok) return null;
		return (await response.json()) as DiscordMember;
	} catch (error) {
		console.error("Error fetching Discord member", error);
		return null;
	}
}

async function pickTopDiscordRole(
	roleIds: string[],
): Promise<{ roleId: string; level: RoleLevel } | null> {
	if (!roleIds || roleIds.length === 0) return null;

	const { data } = await supabaseAdmin
		.from("app_discord_roles")
		.select("role_id, level")
		.in("role_id", roleIds);
	if (!data || data.length === 0) return null;

	const roles = await fetchAppRoles();
	const priorityMap = new Map(
		roles.map((role) => [role.level, role.priority] as const),
	);

	const sorted = data
		.map((row) => ({
			...row,
			priority:
				priorityMap.get(row.level as RoleLevel) ?? Number.NEGATIVE_INFINITY,
		}))
		.sort((a, b) => b.priority - a.priority);

	const top = sorted[0];
	return top ? { roleId: top.role_id, level: top.level as RoleLevel } : null;
}

/** Base auth options (without providers — built at runtime via buildAuthOptions). */
export const authOptions: AuthOptions = {
	secret: process.env.NEXTAUTH_SECRET,
	pages: {
		signIn: "/login",
		error: "/login",
	},
	session: {
		strategy: "jwt",
		maxAge: 30 * 24 * 60 * 60,
	},
	providers: [],
	callbacks: {
		async signIn({ account, profile }) {
			const accessToken = account?.access_token;
			const refreshToken = account?.refresh_token;
			if (!accessToken) return false;

			const userId =
				account?.providerAccountId ?? profile?.sub ?? (profile as any)?.id;
			if (!userId) {
				console.error("[AUTH] Missing Discord user id on sign-in");
				return false;
			}

			const dProfile = profile as DiscordProfile | null;
			const username = dProfile?.global_name ?? dProfile?.username ?? null;
			const avatarUrl = discordAvatarURL(userId, dProfile?.avatar ?? null);

			const { data: existing } = await supabaseAdmin
				.from("profiles")
				.select("user_id, role_level, is_banned, ban_reason, ban_expires_at")
				.eq("discord_user_id", userId)
				.maybeSingle();

			const dbLevel = (existing?.role_level as RoleLevel | null) ?? "invitado";

			if (existing && existing.is_banned) {
				if (banStillActive(existing)) {
					console.warn("[AUTH] Login blocked for banned user:", userId);
					return "/baneado";
				}
				await clearBan(existing.user_id);
			}

			try {
				const creds = await getGuildCredentials();
				const member = await fetchDiscordMember(
					accessToken,
					creds.discord_guild_id,
				);
				const topRole = member ? await pickTopDiscordRole(member.roles) : null;

				const discordLevel: RoleLevel =
					topRole?.level ?? (member ? "member" : "invitado");
				// Re-sync del rol desde Discord en cada login: si Discord resuelve un
				// rol de la hermandad es la fuente de verdad; si no (no miembro o API
				// caída) conservamos el rol guardado para no degradar a nadie (ATW-33).
				let finalLevel: RoleLevel = discordLevel;
				if (discordLevel === "invitado" && existing) {
					finalLevel = dbLevel;
				}

				const { error } = await supabaseAdmin.from("profiles").upsert(
					{
						discord_user_id: userId,
						discord_username: username,
						discord_avatar: avatarUrl,
						discord_refresh_token: refreshToken,
						role_level: finalLevel,
						last_role_check: new Date().toISOString(),
					},
					{ onConflict: "discord_user_id" },
				);

				if (error) {
					console.error(
						"[AUTH] Profile upsert failed; allowing login to continue",
						error,
					);
				}
			} catch (error) {
				console.error(
					"[AUTH] Discord provisioning failed; allowing login to continue",
					error,
				);
			}

			return true;
		},

		async jwt({ token, account }) {
			try {
				const isDiscordSignIn =
					account?.provider === "discord" && account.providerAccountId;
				if (isDiscordSignIn) {
					token.discordId = account.providerAccountId;
				}

				const primaryQuery = isDiscordSignIn
					? supabaseAdmin
							.from("profiles")
							.select(
								"user_id, discord_user_id, discord_username, discord_avatar, role_level, is_banned, ban_reason, ban_expires_at",
							)
							.eq("discord_user_id", account.providerAccountId)
							.maybeSingle()
					: supabaseAdmin
							.from("profiles")
							.select(
								"user_id, discord_user_id, discord_username, discord_avatar, role_level, is_banned, ban_reason, ban_expires_at",
							)
							.eq("user_id", token.userId)
							.maybeSingle();

				let { data: profile } = await primaryQuery;

				if (!profile && token.discordId && !isDiscordSignIn) {
					const fallback = await supabaseAdmin
						.from("profiles")
						.select(
							"user_id, discord_user_id, discord_username, discord_avatar, role_level, is_banned, ban_reason, ban_expires_at",
						)
						.eq("discord_user_id", token.discordId)
						.maybeSingle();

					if (fallback.data) {
						profile = fallback.data;
					}
				}

				if (profile) {
					token.userId = profile.user_id;
					token.discordId = profile.discord_user_id ?? token.discordId;
					token.username = profile.discord_username;
					token.avatarUrl = profile.discord_avatar;

					if (profile.is_banned && !banStillActive(profile)) {
						await clearBan(profile.user_id);
						profile.is_banned = false;
						profile.ban_reason = null;
						profile.ban_expires_at = null;
					}

					token.roleLevel = profile.role_level;
					token.roleSlug = profile.role_level;
					const activeBan = banStillActive(profile);
					token.isBanned = activeBan;
					token.banReason = activeBan ? profile.ban_reason : null;
					token.banExpiresAt = activeBan ? profile.ban_expires_at : null;

					if (token.roleLevel) {
						token.roleFlags = await getRoleFlags(token.roleLevel as RoleLevel);
						token.roleLabel = token.roleFlags.label;
						token.authzScope = resolveAuthzScopeFromFlags(
							token.roleLevel as RoleLevel,
							token.roleFlags,
							activeBan,
						);
					}
				} else {
					token.isBanned = false;
					token.banReason = null;
					token.banExpiresAt = null;
				}

				if (
					typeof token.userId !== "string" ||
					token.userId.length < 32 ||
					!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
						token.userId,
					)
				) {
					delete token.userId;
				}
			} catch (error) {
				console.error("[JWT Callback] Error refreshing role:", error);
			}

			return token;
		},

		async session({ session, token }) {
			const sessionRoleLevel = (token.roleLevel as RoleLevel) ?? "member";
			const sessionRoleFlags =
				(token.roleFlags as RoleFlags) ?? (await getRoleFlags(sessionRoleLevel));
			const sessionAuthzScope: AuthzScope =
				(token.authzScope as AuthzScope | undefined) ??
				resolveAuthzScopeFromFlags(
					sessionRoleLevel,
					sessionRoleFlags,
					Boolean(token.isBanned),
				);

			const rawUserId = token.userId as string | undefined;
			const safeUserId =
				typeof rawUserId === "string" &&
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
					rawUserId,
				)
					? rawUserId
					: "";

			session.user = {
				id: safeUserId,
				discordId: (token.discordId as string) ?? "",
				username: (token.username as string | null) ?? null,
				avatarUrl: (token.avatarUrl as string | null) ?? null,
				email: ((token.email as string) ?? "") as string,
				roleLevel: sessionRoleLevel,
				roleSlug: (token.roleSlug as RoleLevel) ?? sessionRoleLevel,
				roleLabel: (token.roleLabel as string | null) ?? sessionRoleFlags.label,
				roleColor: sessionRoleFlags.color ?? null,
				authzScope: sessionAuthzScope,
				roleFlags: sessionRoleFlags,
				isBanned: Boolean(token.isBanned),
				banReason: (token.banReason as string | null) ?? null,
				banExpiresAt: (token.banExpiresAt as string | null) ?? null,
			};
			return session;
		},
	},
};

/** Builds the full auth options with Discord provider credentials from the DB. */
export async function buildAuthOptions(): Promise<AuthOptions> {
	const credentials = await getGuildCredentials();

	if (!credentials.discord_client_id || !credentials.discord_client_secret) {
		throw new Error("Falta configuración de Discord en app_discord");
	}

	return {
		...authOptions,
		providers: [
			DiscordProvider({
				clientId: credentials.discord_client_id || credentials.discord_app_id,
				clientSecret: credentials.discord_client_secret,
				// Discord now returns the RFC 9207 `iss` claim on the OAuth callback.
				// next-auth's bundled Discord provider declares no issuer, so
				// openid-client aborts the callback with "issuer must be configured
				// on the issuer" unless we state it explicitly. Value must match
				// `issuer` in Discord's /.well-known/openid-configuration.
				issuer: "https://discord.com",
				authorization: {
					params: { scope: credentials.discord_requested_scopes },
				},
			}),
		],
	};
}

/** Thin v5-style wrapper — calls getServerSession(authOptions) so migrated code stays valid. */
export async function auth() {
	return getServerSession(authOptions);
}
