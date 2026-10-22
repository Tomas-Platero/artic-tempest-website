import type { Session } from "next-auth";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { getRoleFlags } from "./roles";
import type { RoleFlags, RoleLevel } from "@/shared/types/auth";
import type { AuthzScope } from "./authz-core";
import { hasAuthzScope, resolveAuthzScopeFromFlags } from "./authz-core";

export { hasAuthzScope, resolveAuthzScopeFromFlags } from "./authz-core";

export type AuthzSnapshot = {
	scope: AuthzScope;
	roleSlug: RoleLevel | null;
	roleLabel: string | null;
	route: {
		publicApply: boolean;
		account: boolean;
		zonaRaider: boolean;
		internalAdmin: boolean;
	};
	roleFlags: RoleFlags;
	banned: {
		active: boolean;
		reason: string | null;
		expiresAt: string | null;
	};
	sources: {
		source: "database-view" | "session" | "public";
		userId: string | null;
		discordUserId: string | null;
		roleLevel: RoleLevel | null;
	};
};

type AppAuthzSnapshotRow = {
	user_id: string;
	discord_user_id: string | null;
	role_slug: string | null;
	role_label: string | null;
	authz_scope: AuthzScope | null;
	is_super_admin: boolean | null;
	is_banned: boolean | null;
	ban_reason: string | null;
	ban_expires_at: string | null;
};

function normalizeScope(scope: AuthzScope | null | undefined): AuthzScope {
	return scope === "public" ||
		scope === "authenticated" ||
		scope === "zona_raider" ||
		scope === "internal_admin"
		? scope
		: "public";
}

function resolveRouteAccess(scope: AuthzScope, banned: boolean) {
	const authorized = !banned;

	return {
		publicApply: true,
		account: authorized && hasAuthzScope(scope, "authenticated"),
		zonaRaider: authorized && hasAuthzScope(scope, "zona_raider"),
		internalAdmin: authorized && hasAuthzScope(scope, "internal_admin"),
	};
}

function buildFallbackSnapshot(session: Session): AuthzSnapshot {
	const roleLevel = (session.user.roleSlug ??
		session.user.roleLevel ??
		null) as RoleLevel | null;
	const resolvedFlags: RoleFlags = session.user.roleFlags ?? {
		canAccessZonaRaider: false,
		isSuperAdmin: false,
		isAdmin: false,
		priority: Number.NEGATIVE_INFINITY,
		label: roleLevel ?? "invitado",
		color: null,
	};

	const banned = Boolean(session.user.isBanned);
	const scope = normalizeScope(
		session.user.authzScope ??
			resolveAuthzScopeFromFlags(roleLevel, resolvedFlags, banned),
	);

	return {
		scope,
		roleSlug: roleLevel,
		roleLabel: session.user.roleLabel ?? resolvedFlags.label ?? null,
		route: resolveRouteAccess(scope, banned),
		roleFlags: resolvedFlags,
		banned: {
			active: banned,
			reason: session.user.banReason ?? null,
			expiresAt: session.user.banExpiresAt ?? null,
		},
		sources: {
			source: session.user.id ? "session" : "public",
			userId: session.user.id || null,
			discordUserId: session.user.discordId || null,
			roleLevel,
		},
	};
}

function buildPublicSnapshot(): AuthzSnapshot {
	const roleFlags: RoleFlags = {
		canAccessZonaRaider: false,
		isSuperAdmin: false,
		isAdmin: false,
		priority: Number.NEGATIVE_INFINITY,
		label: "Público",
		color: null,
	};

	return {
		scope: "public",
		roleSlug: null,
		roleLabel: "Público",
		route: resolveRouteAccess("public", false),
		roleFlags,
		banned: {
			active: false,
			reason: null,
			expiresAt: null,
		},
		sources: {
			source: "public",
			userId: null,
			discordUserId: null,
			roleLevel: null,
		},
	};
}

export async function getAuthzSnapshot(
	session: Session | null,
): Promise<AuthzSnapshot> {
	if (!session?.user?.id) {
		return buildPublicSnapshot();
	}

	try {
		const { data } = await supabaseAdmin
			.from("app_authz_snapshot")
			.select(
				"user_id, discord_user_id, role_slug, role_label, authz_scope, is_super_admin, is_banned, ban_reason, ban_expires_at",
			)
			.eq("user_id", session.user.id)
			.maybeSingle();

		const snapshotRow = data as AppAuthzSnapshotRow | null;

		if (snapshotRow) {
			const banned = Boolean(snapshotRow.is_banned);
			const roleFlags = await getRoleFlags(
				(snapshotRow.role_slug ??
					session.user.roleSlug ??
					session.user.roleLevel ??
					"invitado") as RoleLevel,
			);
			const scope = normalizeScope(
				snapshotRow.authz_scope ??
					resolveAuthzScopeFromFlags(
						snapshotRow.role_slug ??
							session.user.roleSlug ??
							session.user.roleLevel ??
							null,
						roleFlags,
						banned,
					),
			);

			return {
				scope,
				roleSlug: (snapshotRow.role_slug ??
					session.user.roleSlug ??
					session.user.roleLevel ??
					null) as RoleLevel | null,
				roleLabel: snapshotRow.role_label ?? roleFlags.label ?? null,
				route: resolveRouteAccess(scope, banned),
				roleFlags: {
					...roleFlags,
					isSuperAdmin:
						Boolean(snapshotRow.is_super_admin) ||
						Boolean(roleFlags.isSuperAdmin),
				},
				banned: {
					active: banned,
					reason: snapshotRow.ban_reason ?? null,
					expiresAt: snapshotRow.ban_expires_at ?? null,
				},
				sources: {
					source: "database-view",
					userId: snapshotRow.user_id,
					discordUserId: snapshotRow.discord_user_id,
					roleLevel: (snapshotRow.role_slug ??
						session.user.roleSlug ??
						session.user.roleLevel ??
						null) as RoleLevel | null,
				},
			};
		}
	} catch (error) {
		console.error(
			"[authz] Failed to resolve database snapshot; falling back to session",
			error,
		);
	}

	return buildFallbackSnapshot(session);
}
