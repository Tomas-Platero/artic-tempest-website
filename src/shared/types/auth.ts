export type RoleLevel = string;

export type RoleSlug = RoleLevel;

export type AuthzScope =
	| "public"
	| "authenticated"
	| "zona_raider"
	| "internal_admin";

export type AppRole = {
	level: RoleLevel;
	label: string;
	description: string | null;
	priority: number;
	color: string;
	can_access_zona_raider: boolean;
	is_super_admin: boolean;
	is_admin: boolean;
};

export type RoleFlags = {
	canAccessZonaRaider: boolean;
	isSuperAdmin: boolean;
	isAdmin: boolean;
	priority: number;
	label: string;
	color: string | null;
};

export type AuthzRouteAccess = {
	publicApply: boolean;
	account: boolean;
	zonaRaider: boolean;
	internalAdmin: boolean;
};

export type AuthzSnapshot = {
	scope: AuthzScope;
	roleSlug: RoleSlug | null;
	roleLabel: string | null;
	route: AuthzRouteAccess;
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
