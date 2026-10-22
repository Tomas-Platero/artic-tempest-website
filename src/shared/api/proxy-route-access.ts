export type ApiRouteBoundary =
	| "public"
	| "authenticated"
	| "zona-raider"
	| "integration"
	| "internal-admin"
	| "cron-internal"
	| "discord-webhook"
	| "unknown";

type RouteMatcher =
	| { type: "prefix"; value: string }
	| { type: "exact"; value: string };

function withPrefix(value: string): RouteMatcher {
	return { type: "prefix", value };
}

function withExact(value: string): RouteMatcher {
	return { type: "exact", value };
}

function matches(pathname: string, matcher: RouteMatcher): boolean {
	return matcher.type === "exact"
		? pathname === matcher.value
		: pathname.startsWith(matcher.value);
}

const CRON_OR_INTERNAL_ROUTES = [
	withPrefix("/api/cron"),
	withPrefix("/api/admin/system/cron"),
] as const;

const DISCORD_WEBHOOK_ROUTES = [] as const;

const ADMIN_ROUTES = [withPrefix("/api/admin/")] as const;

const RAIDER_ONLY_ROUTES = [
	withExact("/api/raider-rules/accept"),
] as const;

const INTEGRATION_ROUTES = [
	withExact("/api/curseforge-addon"),
	withPrefix("/api/bot/"),
] as const;

const AUTHENTICATED_WEB_ROUTES = [
	withExact("/api/raider-rules/status"),
] as const;

const PUBLIC_ROUTES = [
	withPrefix("/api/auth"),
	withExact("/api/guild/news"),
	withPrefix("/api/app-icon"),
	withPrefix("/api/images"),
	withExact("/api/bnet/avatar"),
	withExact("/api/raiderio"),
	withPrefix("/api/streamers"),
	withPrefix("/api/progression"),
	withExact("/api/status"),
] as const;

export function getApiRouteBoundary(pathname: string): ApiRouteBoundary {
	if (CRON_OR_INTERNAL_ROUTES.some((matcher) => matches(pathname, matcher))) {
		return "cron-internal";
	}

	if (DISCORD_WEBHOOK_ROUTES.some((matcher) => matches(pathname, matcher))) {
		return "discord-webhook";
	}

	if (ADMIN_ROUTES.some((matcher) => matches(pathname, matcher))) {
		return "internal-admin";
	}

	if (RAIDER_ONLY_ROUTES.some((matcher) => matches(pathname, matcher))) {
		return "zona-raider";
	}

	if (INTEGRATION_ROUTES.some((matcher) => matches(pathname, matcher))) {
		return "integration";
	}

	if (AUTHENTICATED_WEB_ROUTES.some((matcher) => matches(pathname, matcher))) {
		return "authenticated";
	}

	if (PUBLIC_ROUTES.some((matcher) => matches(pathname, matcher))) {
		return "public";
	}

	return "unknown";
}

export function isPublicApiRoute(pathname: string): boolean {
	const boundary = getApiRouteBoundary(pathname);
	return (
		boundary === "public" ||
		boundary === "integration" ||
		boundary === "zona-raider" ||
		boundary === "cron-internal" ||
		boundary === "discord-webhook"
	);
}
