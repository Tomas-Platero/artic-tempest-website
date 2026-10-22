import type { Session } from "next-auth";

export type MockSessionRole =
	| "public"
	| "authenticated"
	| "raider"
	| "admin"
	| "banned";

const BASE_USER = {
	id: "test-user-id",
	discordId: "test-discord-id",
	username: "TestUser",
	avatarUrl: null,
	roleLevel: "member",
	email: null,
};

const ROLE_FLAGS_BY_ROLE: Record<
	Exclude<MockSessionRole, "public">,
	Session["user"]["roleFlags"]
> = {
	authenticated: {
		canAccessZonaRaider: false,
		isSuperAdmin: false,
		isAdmin: false,
		priority: 0,
		label: "Miembro",
		color: null,
	},
	raider: {
		canAccessZonaRaider: true,
		isSuperAdmin: false,
		isAdmin: false,
		priority: 10,
		label: "Raider",
		color: "#a855f7",
	},
	admin: {
		canAccessZonaRaider: true,
		isSuperAdmin: true,
		isAdmin: true,
		priority: 100,
		label: "GM",
		color: "#f59e0b",
	},
	banned: {
		canAccessZonaRaider: false,
		isSuperAdmin: false,
		isAdmin: false,
		priority: -Infinity,
		label: "Baneado",
		color: null,
	},
};

/**
 * Creates a mock NextAuth Session for testing authorization logic.
 *
 * @param role - The role tier to simulate.
 *   - 'public': returns null (no session)
 *   - 'authenticated': logged in, no special access
 *   - 'raider': zona_raider scope
 *   - 'admin': internal_admin scope
 *   - 'banned': authenticated scope with active ban
 */
export function createMockSession(role: MockSessionRole): Session | null {
	if (role === "public") return null;

	const flags = ROLE_FLAGS_BY_ROLE[role];
	const isBanned = role === "banned";

	let authzScope: string;
	let roleSlug: string;
	let roleLabel: string;

	switch (role) {
		case "authenticated":
			authzScope = "authenticated";
			roleSlug = "member";
			roleLabel = "Miembro";
			break;
		case "raider":
			authzScope = "zona_raider";
			roleSlug = "raider";
			roleLabel = "Raider";
			break;
		case "admin":
			authzScope = "internal_admin";
			roleSlug = "gm";
			roleLabel = "GM";
			break;
		case "banned":
			authzScope = "authenticated";
			roleSlug = "member";
			roleLabel = "Miembro";
			break;
		default:
			authzScope = "authenticated";
			roleSlug = "member";
			roleLabel = "Miembro";
	}

	return {
		user: {
			...BASE_USER,
			roleSlug,
			roleLabel,
			roleColor: flags.color,
			authzScope: authzScope as Session["user"]["authzScope"],
			roleFlags: flags,
			isBanned,
			banReason: isBanned ? "Violating community guidelines" : null,
			banExpiresAt: null,
		},
		checkedAt: new Date().toISOString(),
	} as Session;
}
