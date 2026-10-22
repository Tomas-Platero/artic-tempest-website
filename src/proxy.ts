import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isMaintenanceEnabled } from "@/flags";
import { isPublicApiRoute } from "@/shared/api/proxy-route-access";
import { sanitizeInternalCallbackUrl } from "@/shared/auth/callback-url";
import { validateCsrfToken } from "@/shared/security/csrf";
import { applySecurityHeaders } from "@/shared/security/response-headers";
import {
	isZonaRaiderPath,
	normalizeZonaRaiderPath,
} from "@/shared/lib/zona-raider-path";

/**
 * Global Security Proxy (Next.js 16 Experimental Proxy)
 *
 * Combined logic for:
 * 1. Rate Limiting (Supabase + local in-memory cache)
 * 2. Feature Flags (Cookie sync)
 * 3. Auth Guard (NextAuth JWT)
 */

// ── Rate Limiting logic ────────────────────────────────────────────────

let supabaseDisabledUntil = 0;
const BACKEND_COOLDOWN_MS = 120_000; // 2 min cooldown when Supabase is down

function isRateLimitBackendAvailable(): boolean {
	if (Date.now() < supabaseDisabledUntil) return false;
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
	const key =
		process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
	return !!(url && key);
}

function markBackendUnavailable() {
	supabaseDisabledUntil = Date.now() + BACKEND_COOLDOWN_MS;
	console.warn(
		`[Proxy] Rate limit backend unavailable. Backend checks disabled until ${new Date(supabaseDisabledUntil).toISOString()}`,
	);
}

// ── Local in-memory rate limiter (first line of defense) ──────────────
// Avoids hitting Supabase for every request. Only calls the backend for:
// 1. The first request in a window (baseline sync)
// 2. Every Nth request (periodic verification, N = VERIFY_INTERVAL)
// 3. When local tracking shows usage > 80% of limit (needs accurate enforcement)

const VERIFY_INTERVAL = 50; // Call backend every ~50 requests per identifier for sync
const HIGH_USAGE_THRESHOLD = 0.8; // 80% of limit → always call backend
const LOCAL_CLEANUP_INTERVAL_MS = 300_000; // Cleanup stale entries every 5 min
const LOCAL_CLEANUP_GRACE_MS = 60_000; // 1 min grace period after window expiry before cleanup
const MAX_LOCAL_ENTRIES = 10_000; // Hard cap on local cache size (DDoS protection)

type LocalWindowEntry = {
	count: number;
	windowStart: number;
	windowMs: number;
};

const localWindows = new Map<string, LocalWindowEntry>();
let lastLocalCleanup = Date.now();

function cleanupLocalWindows() {
	const now = Date.now();
	if (now - lastLocalCleanup < LOCAL_CLEANUP_INTERVAL_MS) return;
	lastLocalCleanup = now;
	for (const [key, entry] of localWindows) {
		if (now > entry.windowStart + entry.windowMs + LOCAL_CLEANUP_GRACE_MS) {
			localWindows.delete(key);
		}
	}
}

/**
 * Returns true if the request should be allowed based on local tracking alone.
 * Returns false if we should consult the backend (first request, periodic verify, or high usage).
 */
function shouldSkipBackendCheck(
	localKey: string,
	maxRequests: number,
	windowMs: number,
): boolean {
	cleanupLocalWindows();
	const now = Date.now();
	const entry = localWindows.get(localKey);

	// New window or no entry → call backend to establish baseline
	if (!entry || now >= entry.windowStart + entry.windowMs) {
		// Enforce max entries: evict oldest if at capacity
		if (!entry && localWindows.size >= MAX_LOCAL_ENTRIES) {
			const oldestKey = localWindows.keys().next().value;
			if (oldestKey) localWindows.delete(oldestKey);
		}
		localWindows.set(localKey, {
			count: 1,
			windowStart: now,
			windowMs,
		});
		return false; // Call backend (first request of window)
	}

	// Increment local counter
	entry.count++;

	const usageRatio = entry.count / maxRequests;

	// High usage → always call backend for accurate enforcement
	if (usageRatio >= HIGH_USAGE_THRESHOLD) {
		return false;
	}

	// Periodic verification → call backend every ~N requests
	if (entry.count % VERIFY_INTERVAL === 0) {
		return false;
	}

	// Normal usage, below threshold → skip backend, allow locally
	return true;
}

async function applyRateLimit(req: NextRequest): Promise<NextResponse | null> {
	if (
		process.env.DISABLE_RATE_LIMIT === "true" ||
		process.env.NODE_ENV !== "production"
	) {
		return null;
	}

	if (!isRateLimitBackendAvailable()) return null;

	const pathname = req.nextUrl.pathname;

	let maxRequests = 60;
	let windowSeconds = 60;
	let prefix = "ratelimit:artictempest:api";
	let identifier =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		"127.0.0.1";

	const authHeader = req.headers.get("authorization");
	const bearerToken = authHeader?.startsWith("Bearer ")
		? authHeader.slice(7).trim()
		: null;

	if (pathname.startsWith("/api/curseforge-addon")) {
		maxRequests = 30;
		windowSeconds = 300;
		prefix = "ratelimit:artictempest:curseforge-addon";
		if (bearerToken) {
			const sub = extractJwtSub(bearerToken);
			identifier = sub ? `sub:${sub}` : `token:${await sha256(bearerToken)}`;
		}
	}

	if (pathname.startsWith("/api/auth")) {
		maxRequests = 10;
		prefix = "ratelimit:artictempest:auth";
	} else if (
		pathname.startsWith("/api/recruitment/submit") ||
		pathname.startsWith("/api/feedback")
	) {
		maxRequests = 5;
		prefix = "ratelimit:artictempest:form";
	}

	// ── Local rate limiter check (avoids >90% of backend calls) ──
	const windowMs = windowSeconds * 1000;
	const localKey = `${prefix}:${identifier}`;

	if (shouldSkipBackendCheck(localKey, maxRequests, windowMs)) {
		return null; // Allowed by local tracker, skip backend entirely
	}

	// ── Supabase-backed enforcement (only for verification or high usage) ──
	const { checkSupabaseRateLimit } = await import("@/shared/api/rate-limit");

	const result = await checkSupabaseRateLimit(
		localKey,
		maxRequests,
		windowSeconds,
	);

	if (!result.allowed) {
		const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
		return NextResponse.json(
			{ error: "Too many requests. Please try again later." },
			{
				status: 429,
				headers: {
					"X-RateLimit-Limit": maxRequests.toString(),
					"X-RateLimit-Remaining": Math.max(
						0,
						maxRequests - result.count,
					).toString(),
					"X-RateLimit-Reset": result.reset.toString(),
					"Retry-After": retryAfter.toString(),
				},
			},
		);
	}

	return null;
}

function extractJwtSub(token: string): string | null {
	const parts = token.split(".");
	if (parts.length < 2) return null;

	try {
		const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
		const payload = JSON.parse(atob(padded)) as { sub?: unknown };
		if (typeof payload.sub === "string" && payload.sub.trim().length > 0) {
			return payload.sub.trim();
		}
	} catch {
		return null;
	}

	return null;
}

async function sha256(value: string): Promise<string> {
	const input = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", input);
	const bytes = Array.from(new Uint8Array(digest));
	return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRaiderNormativePath(pathname: string): boolean {
	const normalized = normalizeZonaRaiderPath(pathname);
	return (
		normalized === "/zona-raider/normativa-raider" ||
		normalized.startsWith("/zona-raider/normativa-raider/")
	);
}

// ── Auth Guard logic ───────────────────────────────────────────────────

function isProtectedRoute(pathname: string): boolean {
	if (isZonaRaiderPath(pathname)) return true;
	if (pathname.startsWith("/api/") && !isPublicApiRoute(pathname)) return true;
	return false;
}

function isMaintenanceAllowedPath(pathname: string) {
	return (
		pathname === "/mantenimiento" ||
		pathname.startsWith("/_next") ||
		pathname.startsWith("/assets") ||
		pathname.startsWith("/favicon") ||
		pathname.startsWith("/icon") ||
		pathname.startsWith("/images") ||
		pathname.startsWith("/.well-known")
	);
}

// ── Proxy Entry Point ──────────────────────────────────────────────────

export async function proxy(req: NextRequest) {
	const pathname = req.nextUrl.pathname;
	const forceNormativaRequested = req.nextUrl.searchParams.get("forceNormativa");
	const requestHeaders = new Headers(req.headers);
	requestHeaders.set("x-pathname", pathname);
	requestHeaders.set("x-public-page", isZonaRaiderPath(pathname) ? "0" : "1");
	const response = NextResponse.next({ request: { headers: requestHeaders } });

	const withSecurityHeaders = (response: NextResponse) => {
		applySecurityHeaders(response.headers);
		return response;
	};

	const maintenanceEnabled = await isMaintenanceEnabled();
	if (maintenanceEnabled && !isMaintenanceAllowedPath(pathname)) {
		if (pathname.startsWith("/api/")) {
			return withSecurityHeaders(
				NextResponse.json({ error: "maintenance_active" }, { status: 503 }),
			);
		}

		const maintenanceUrl = new URL("/mantenimiento", req.url);
		return withSecurityHeaders(NextResponse.redirect(maintenanceUrl));
	}

	let token: Awaited<ReturnType<typeof getToken>> | null = null;

	if (forceNormativaRequested === "1") {
		token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
		const authzScope = String((token as any)?.authzScope ?? "public");
		const canForceNormativa =
			process.env.NODE_ENV !== "production" ||
			["zona_raider", "internal_admin"].includes(authzScope);

		if (canForceNormativa && isZonaRaiderPath(pathname)) {
			const cleanUrl = req.nextUrl.clone();
			cleanUrl.searchParams.delete("forceNormativa");
			const forceResponse = NextResponse.redirect(cleanUrl);
			forceResponse.cookies.set("raider_normativa_debug", "1", {
				path: "/zona-raider",
				maxAge: 60 * 30,
				sameSite: "lax",
				secure: process.env.NODE_ENV === "production",
			});
			return withSecurityHeaders(forceResponse);
		}
	}

	if (forceNormativaRequested === "0" && isZonaRaiderPath(pathname)) {
		const cleanUrl = req.nextUrl.clone();
		cleanUrl.searchParams.delete("forceNormativa");
		const clearResponse = NextResponse.redirect(cleanUrl);
		clearResponse.cookies.set("raider_normativa_debug", "", {
			path: "/zona-raider",
			maxAge: 0,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
		});
		return withSecurityHeaders(clearResponse);
	}

	// 1. Rate limiting on all /api/* routes
	if (pathname.startsWith("/api/")) {
		try {
			const rateLimitResponse = await applyRateLimit(req);
			if (rateLimitResponse) return withSecurityHeaders(rateLimitResponse);
		} catch (e) {
			markBackendUnavailable();
			console.error("[Proxy] Rate limit error:", e);
		}

		// 1b. CSRF protection on state-changing API routes (POST/PUT/PATCH/DELETE)
		// Feature-flagged via CSRF_ENABLED. Safe methods and Bearer auth bypass automatically.
		try {
			const method = req.method.toUpperCase();
			if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
				await validateCsrfToken(req, null);
			}
		} catch (e: any) {
			if (e?.status === 403) {
				return withSecurityHeaders(
					NextResponse.json(
						{
							error: e.message ?? "CSRF token missing or invalid",
							code: e.code ?? "CSRF_TOKEN_INVALID",
						},
						{ status: 403 },
					),
				);
			}
			// Re-throw unexpected errors
			throw e;
		}
	}

	// 2. Feature Flags (from original proxy)
	const url = req.nextUrl.clone();
	const knownFlags = new Set([
		"enableRoster",
		"enableStatsLogs",
		"enableWeeklyVault",
	]);

	url.searchParams.forEach((value, key) => {
		if (knownFlags.has(key) && (value === "true" || value === "false")) {
			response.cookies.set(key, value, {
				path: "/",
				maxAge: 60 * 60 * 24 * 30, // 30 days
			});
		}
	});

	const requiresAuth = isProtectedRoute(pathname);

	if (requiresAuth) {
		token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
	}

	if (token) {
		requestHeaders.set(
			"x-authz-scope",
			String((token as any)?.authzScope ?? "public"),
		);
		requestHeaders.set(
			"x-authz-role-slug",
			String((token as any)?.roleSlug ?? (token as any)?.roleLevel ?? ""),
		);
	}

	// 3. Auth guard for protected routes
	if (isProtectedRoute(pathname)) {
		if (!token) {
			if (pathname.startsWith("/api/")) {
				return withSecurityHeaders(
					NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
				);
			}
			const loginUrl = new URL("/login", req.url);
			loginUrl.searchParams.set(
				"redirectPath",
				sanitizeInternalCallbackUrl(pathname),
			);
			return withSecurityHeaders(NextResponse.redirect(loginUrl));
		}

		if ((token as any)?.isBanned) {
			if (pathname.startsWith("/api/")) {
				return withSecurityHeaders(
					NextResponse.json({ error: "Account banned" }, { status: 403 }),
				);
			}
			const bannedUrl = new URL("/baneado", req.url);
			return withSecurityHeaders(NextResponse.redirect(bannedUrl));
		}

		if (isZonaRaiderPath(pathname) && !isRaiderNormativePath(pathname)) {
			const authzScope = String((token as any)?.authzScope ?? "public");
			if (!["zona_raider", "internal_admin"].includes(authzScope)) {
				const rulesUrl = new URL("/zona-raider/normativa-raider", req.url);
				return withSecurityHeaders(NextResponse.redirect(rulesUrl));
			}
		}
	}

	return withSecurityHeaders(response);
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
