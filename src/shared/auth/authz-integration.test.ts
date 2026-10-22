/**
 * Authorization integration tests.
 *
 * Tests route handler authorization across all 4 scopes (public, authenticated,
 * zona_raider, internal_admin) and ban enforcement. Uses createMockSession for
 * role simulation.
 *
 * @audit — self-skips if SUPABASE_URL is missing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSession } from "@/shared/auth/test-utils";
import {
	getApiRouteBoundary,
	isPublicApiRoute,
} from "@/shared/api/proxy-route-access";
import {
	hasAuthzScope,
	resolveAuthzScopeFromFlags,
} from "@/shared/auth/authz-core";

// ── Self-skip guard ────────────────────────────────────────────────────────
const hasSupabaseEnv =
	Boolean(process.env.SUPABASE_URL) ||
	Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

const describeOrSkip = hasSupabaseEnv ? describe : describe.skip;

// ── Hoisted mocks for route handler integration tests ─────────────────────
const { mockGetServerSession, mockGetAuthzSnapshot } = vi.hoisted(() => ({
	mockGetServerSession: vi.fn(),
	mockGetAuthzSnapshot: vi.fn(),
}));

vi.mock("@/auth", () => ({
	auth: mockGetServerSession,
}));

vi.mock("@/shared/auth/authz", () => ({
	getAuthzSnapshot: mockGetAuthzSnapshot,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/shared/lib/supabase-admin", () => ({
	supabaseAdmin: {
		from: vi.fn(),
		rpc: vi.fn(),
	},
}));

vi.mock("@/shared/auth/roles", () => ({
	isRoleAtLeast: vi.fn().mockResolvedValue(false),
	isSuperAdmin: vi.fn().mockResolvedValue(false),
	getRoleFlags: vi.fn().mockResolvedValue({
		canAccessZonaRaider: false,
		isSuperAdmin: false,
		priority: 0,
		label: "Miembro",
		color: null,
	}),
}));

describeOrSkip("authz integration — role-based access", () => {
	// ── Route boundary classification ──────────────────────────────────────
	describe("route boundary classification", () => {
		it("classifies /api/auth/signin as public", () => {
			expect(getApiRouteBoundary("/api/auth/signin")).toBe("public");
			expect(isPublicApiRoute("/api/auth/signin")).toBe(true);
		});

		it("classifies /api/guild/news as public", () => {
			expect(getApiRouteBoundary("/api/guild/news")).toBe("public");
		});

		it("classifies /api/curseforge-addon as integration", () => {
			expect(getApiRouteBoundary("/api/curseforge-addon")).toBe("integration");
		});

		it("classifies /api/raider-rules/accept as zona-raider", () => {
			expect(getApiRouteBoundary("/api/raider-rules/accept")).toBe(
				"zona-raider",
			);
		});

		it("classifies /api/admin/navigation as internal-admin", () => {
			expect(getApiRouteBoundary("/api/admin/navigation")).toBe(
				"internal-admin",
			);
		});

		it('classifies unknown route as "unknown" (defaults to protected)', () => {
			expect(getApiRouteBoundary("/api/unknown-endpoint")).toBe("unknown");
			// Unknown routes are NOT public — they default to protected
			expect(isPublicApiRoute("/api/unknown-endpoint")).toBe(false);
		});

		it("classifies cron routes as cron-internal", () => {
			expect(getApiRouteBoundary("/api/cron/check-streams")).toBe(
				"cron-internal",
			);
			expect(getApiRouteBoundary("/api/admin/system/cron/verify-members")).toBe(
				"cron-internal",
			);
		});
	});

	// ── Scope helper assertions ────────────────────────────────────────────
	describe("authz scope ladder", () => {
		it("public < authenticated < zona_raider < internal_admin", () => {
			// public only has public
			expect(hasAuthzScope("public", "public")).toBe(true);
			expect(hasAuthzScope("public", "authenticated")).toBe(false);
			expect(hasAuthzScope("public", "zona_raider")).toBe(false);
			expect(hasAuthzScope("public", "internal_admin")).toBe(false);

			// authenticated has public + authenticated
			expect(hasAuthzScope("authenticated", "public")).toBe(true);
			expect(hasAuthzScope("authenticated", "authenticated")).toBe(true);
			expect(hasAuthzScope("authenticated", "zona_raider")).toBe(false);
			expect(hasAuthzScope("authenticated", "internal_admin")).toBe(false);

			// zona_raider has public + authenticated + zona_raider
			expect(hasAuthzScope("zona_raider", "public")).toBe(true);
			expect(hasAuthzScope("zona_raider", "authenticated")).toBe(true);
			expect(hasAuthzScope("zona_raider", "zona_raider")).toBe(true);
			expect(hasAuthzScope("zona_raider", "internal_admin")).toBe(false);

			// internal_admin has all
			expect(hasAuthzScope("internal_admin", "public")).toBe(true);
			expect(hasAuthzScope("internal_admin", "authenticated")).toBe(true);
			expect(hasAuthzScope("internal_admin", "zona_raider")).toBe(true);
			expect(hasAuthzScope("internal_admin", "internal_admin")).toBe(true);
		});
	});

	// ── Mock session assertions ────────────────────────────────────────────
	describe("mock session roles", () => {
		it('createMockSession("public") returns null', () => {
			expect(createMockSession("public")).toBeNull();
		});

		it('createMockSession("authenticated") has authzScope "authenticated"', () => {
			const session = createMockSession("authenticated");
			expect(session).not.toBeNull();
			expect(session!.user.authzScope).toBe("authenticated");
			expect(session!.user.isBanned).toBe(false);
		});

		it('createMockSession("raider") has authzScope "zona_raider"', () => {
			const session = createMockSession("raider");
			expect(session).not.toBeNull();
			expect(session!.user.authzScope).toBe("zona_raider");
			expect(session!.user.roleSlug).toBe("raider");
			expect(session!.user.isBanned).toBe(false);
		});

		it('createMockSession("admin") has authzScope "internal_admin"', () => {
			const session = createMockSession("admin");
			expect(session).not.toBeNull();
			expect(session!.user.authzScope).toBe("internal_admin");
			expect(session!.user.roleFlags.isSuperAdmin).toBe(true);
			expect(session!.user.isBanned).toBe(false);
		});

		it('createMockSession("banned") has isBanned true', () => {
			const session = createMockSession("banned");
			expect(session).not.toBeNull();
			expect(session!.user.isBanned).toBe(true);
			expect(session!.user.banReason).toBeTruthy();
			// Banned users still have authzScope (for UI rendering rules)
			expect(session!.user.authzScope).toBe("authenticated");
		});
	});

	// ── Scope resolution with flags ────────────────────────────────────────
	describe("resolveAuthzScopeFromFlags", () => {
		it("returns authenticated when banned regardless of flags", () => {
			expect(
				resolveAuthzScopeFromFlags(
					"admin",
					{ canAccessZonaRaider: true, isSuperAdmin: true },
					true,
				),
			).toBe("authenticated");
		});

		it("returns internal_admin when isSuperAdmin is true regardless of role", () => {
			expect(
				resolveAuthzScopeFromFlags(
					"gm",
					{ canAccessZonaRaider: false, isSuperAdmin: true },
					false,
				),
			).toBe("internal_admin");
			expect(
				resolveAuthzScopeFromFlags(
					"officer",
					{ canAccessZonaRaider: false, isSuperAdmin: true },
					false,
				),
			).toBe("internal_admin");
		});

		it("returns internal_admin when isSuperAdmin is true", () => {
			expect(
				resolveAuthzScopeFromFlags(
					"member",
					{ canAccessZonaRaider: false, isSuperAdmin: true },
					false,
				),
			).toBe("internal_admin");
		});

		it("returns zona_raider when canAccessZonaRaider is true", () => {
			expect(
				resolveAuthzScopeFromFlags(
					"raider",
					{ canAccessZonaRaider: true, isSuperAdmin: false },
					false,
				),
			).toBe("zona_raider");
		});

		it("returns authenticated for member without flags", () => {
			expect(
				resolveAuthzScopeFromFlags(
					"member",
					{ canAccessZonaRaider: false, isSuperAdmin: false },
					false,
				),
			).toBe("authenticated");
		});

		it("returns authenticated for null/undefined roleSlug", () => {
			expect(
				resolveAuthzScopeFromFlags(
					null,
					{ canAccessZonaRaider: false, isSuperAdmin: false },
					false,
				),
			).toBe("authenticated");
		});
	});

	// ── Admin route protection ─────────────────────────────────────────────
	describe("admin route protection", () => {
		it("admin routes require internal_admin scope", () => {
			// /api/admin/navigation is internal-admin classified
			const boundary = getApiRouteBoundary("/api/admin/navigation");
			expect(boundary).toBe("internal-admin");

			// Only admin scope can access
			const adminSession = createMockSession("admin")!;
			expect(
				hasAuthzScope(adminSession.user.authzScope!, "internal_admin"),
			).toBe(true);

			const raiderSession = createMockSession("raider")!;
			expect(
				hasAuthzScope(raiderSession.user.authzScope!, "internal_admin"),
			).toBe(false);

			const authSession = createMockSession("authenticated")!;
			expect(
				hasAuthzScope(authSession.user.authzScope!, "internal_admin"),
			).toBe(false);
		});
	});

	// ── Ban enforcement ────────────────────────────────────────────────────
	describe("ban enforcement", () => {
		it("banned users have isBanned true and a ban reason", () => {
			const session = createMockSession("banned")!;
			expect(session.user.isBanned).toBe(true);
			expect(session.user.banReason).toBe("Violating community guidelines");
		});

		it("non-banned roles have isBanned false", () => {
			expect(createMockSession("authenticated")!.user.isBanned).toBe(false);
			expect(createMockSession("raider")!.user.isBanned).toBe(false);
			expect(createMockSession("admin")!.user.isBanned).toBe(false);
		});

		it("banned users resolve to authenticated scope (not higher)", () => {
			const session = createMockSession("banned")!;
			expect(session.user.authzScope).toBe("authenticated");
			// Banned users cannot access raider or admin routes
			expect(hasAuthzScope(session.user.authzScope!, "zona_raider")).toBe(
				false,
			);
		});
	});

	// ── Route handler integration: authz enforcement via real code paths ─────
	describe("route handler authz enforcement — real handlers", () => {
		describe("ensureAuthenticatedSession() — auth boundary", () => {
			let ensureAuthenticatedSession: Function;

			beforeEach(async () => {
				vi.clearAllMocks();
				const mod = await import("@/shared/auth/permissions");
				ensureAuthenticatedSession = mod.ensureAuthenticatedSession;
			});

			it("throws unauthorized (ApiError 401) when there is no session", async () => {
				mockGetServerSession.mockResolvedValue(null);

				let caught: any = null;
				try {
					await ensureAuthenticatedSession();
				} catch (e) {
					caught = e;
				}
				expect(caught).toBeTruthy();
				expect(caught.status).toBe(401);
				expect(caught.code).toBe("NO_SESSION");
			});

			it("throws forbidden (ApiError 403) when user is banned", async () => {
				const bannedSession = createMockSession("banned");
				mockGetServerSession.mockResolvedValue(bannedSession);

				let caught: any = null;
				try {
					await ensureAuthenticatedSession();
				} catch (e) {
					caught = e;
				}
				expect(caught).toBeTruthy();
				expect(caught.status).toBe(403);
				expect(caught.code).toBe("ACCOUNT_BANNED");
			});

			it("returns session for valid authenticated user", async () => {
				const validSession = createMockSession("authenticated");
				mockGetServerSession.mockResolvedValue(validSession);

				const result = await ensureAuthenticatedSession();
				expect(result).toBe(validSession);
				expect(result.user.isBanned).toBe(false);
			});

			it("returns session for raider role (higher scope)", async () => {
				const raiderSession = createMockSession("raider");
				mockGetServerSession.mockResolvedValue(raiderSession);

				const result = await ensureAuthenticatedSession();
				expect(result).toBe(raiderSession);
				expect(result.user.authzScope).toBe("zona_raider");
			});
		});

		describe("ensureAdmin() — admin boundary", () => {
			let ensureAdmin: Function;

			beforeEach(async () => {
				vi.clearAllMocks();
				const mod = await import("@/shared/auth/permissions");
				ensureAdmin = mod.ensureAdmin;
			});

			it("throws unauthorized (ApiError 401) when there is no session", async () => {
				mockGetServerSession.mockResolvedValue(null);

				let caught: any = null;
				try {
					await ensureAdmin();
				} catch (e) {
					caught = e;
				}
				expect(caught).toBeTruthy();
				expect(caught.status).toBe(401);
				expect(caught.code).toBe("NO_SESSION");
			});
		});

		describe("GET /api/me — authenticated route handler", () => {
			let GET: Function;

			beforeEach(async () => {
				vi.clearAllMocks();
				const mod = await import("@/app/api/me/route");
				GET = mod.GET;
			});

			it("returns 401 when unauthenticated (no session)", async () => {
				mockGetServerSession.mockResolvedValue(null);

				const request = new Request("https://example.com/api/me");
				const response = await GET(request);
				expect(response.status).toBe(401);

				const body = await response.json();
				expect(body.error).toBe("No autorizado");
			});
		});
	});
});
