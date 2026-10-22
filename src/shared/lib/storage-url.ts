/**
 * Supabase storage URL helpers.
 *
 * The public site exposes raw Supabase Storage URLs (e.g. in the RSS feed and
 * the sitemap), which leak the project ref and the bucket/path structure.
 * These helpers rewrite recognized public-storage URLs into a same-origin
 * proxy route (`/api/images/<bucket>/<path>`) so the Supabase origin is never
 * emitted. Anything that is not a recognized public-storage URL is returned
 * unchanged, so external images keep working.
 */

/** Buckets that are safe to serve through the public image proxy. */
export const PUBLIC_PROXY_BUCKETS = new Set([
	"news-images",
	"guild_assets",
	"image_boses_kills",
	"roster_ranks_images",
	"weekly-vault",
	"viserio_guide",
]);

const PUBLIC_STORAGE_PATH_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;

export type ParsedStorageRef = { bucket: string; path: string };

/**
 * Extract `{ bucket, path }` from a Supabase public storage URL.
 * Returns `null` for anything that is not a recognized public storage URL
 * (other hosts, private buckets, malformed URLs).
 */
export function parsePublicStorageUrl(value: string): ParsedStorageRef | null {
	let pathname: string;
	try {
		pathname = new URL(value).pathname;
	} catch {
		return null;
	}

	const match = pathname.match(PUBLIC_STORAGE_PATH_RE);
	if (!match) return null;

	try {
		const bucket = decodeURIComponent(match[1]);
		const path = decodeURIComponent(match[2]);

		if (!PUBLIC_PROXY_BUCKETS.has(bucket)) return null;
		if (!path) return null;

		return { bucket, path };
	} catch {
		return null;
	}
}

/**
 * Build a same-origin RELATIVE proxy path for an image rendered inside the
 * app (e.g. `next/image`). Unlike `toProxyImageUrl`, this never emits an
 * absolute site URL, so it resolves against the current origin in both dev
 * and production. Returns `null` for non-allowlisted/non-storage URLs.
 */
export function toProxyImagePath(
	imageUrl: string | null | undefined,
): string | null {
	if (!imageUrl) return null;
	if (imageUrl.startsWith("/api/images/")) return imageUrl;

	const parsed = parsePublicStorageUrl(imageUrl);
	if (!parsed) return null;

	const safePath = parsed.path
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	return `/api/images/${encodeURIComponent(parsed.bucket)}/${safePath}`;
}

/**
 * Rewrite a Supabase public storage URL into the same-origin image proxy URL.
 * Non-Supabase or non-allowlisted URLs are returned unchanged.
 */
export function toProxyImageUrl(
	imageUrl: string | null | undefined,
): string | null {
	if (!imageUrl) return null;
	if (imageUrl.startsWith("/api/images/")) return imageUrl;

	const parsed = parsePublicStorageUrl(imageUrl);
	if (!parsed) return imageUrl;

	const siteUrl = (
		process.env.NEXT_PUBLIC_SITE_URL || "https://artictempest.es"
	).replace(/\/$/, "");

	const safePath = parsed.path
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	return `${siteUrl}/api/images/${encodeURIComponent(parsed.bucket)}/${safePath}`;
}
