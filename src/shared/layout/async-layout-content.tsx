/**
 * Async layout content — deferred via Suspense so the root layout shell
 * can render as static HTML instead of streaming RSC.
 */
import { getSeoSettings } from "@/shared/seo/seo-settings";
import { GoogleAdsenseConsent } from "@/shared/components/google-adsense-consent";
import { isAdsenseEnabled } from "@/shared/adsense/adsense-config";
import { GoogleAnalyticsConsent } from "@/shared/components/google-analytics-consent";
import { FloatingActionsWrapper } from "@/shared/layout/floating-actions-wrapper";
import { RouteEnhancements } from "@/shared/layout/route-enhancements";
import { serializeJsonLd } from "@/shared/seo/json-ld-serializer";
import { DISCORD_PUBLIC_INVITE_URL } from "@/shared/lib/discord-links";
import Script from "next/script";

interface AsyncLayoutContentProps {
	nonce: string | undefined;
}

export async function AsyncLayoutContent({ nonce }: AsyncLayoutContentProps) {
	const seoSettings = await getSeoSettings();

	const publicSiteUrl = seoSettings.site.url || "https://artictempest.es";

	// Structured data (Organization + WebSite)
	const structuredData =
		seoSettings.schema.organization || seoSettings.schema.website
			? [
					...(seoSettings.schema.organization
						? [
								{
									"@context": "https://schema.org",
									"@type": "Organization",
									name: seoSettings.site.name,
									url: publicSiteUrl,
									logo: `${publicSiteUrl}/favicon.ico`,
									sameAs: [
										"https://x.com/artictempestWoW",
										"https://raider.io/guilds/eu/dun-modr/Artic%20Tempest",
										DISCORD_PUBLIC_INVITE_URL,
										"https://www.twitch.tv/artictempest",
										"https://www.warcraftlogs.com/guild/id/507584",
									],
									description: seoSettings.site.description,
								},
							]
						: []),
					...(seoSettings.schema.website
						? [
								{
									"@context": "https://schema.org",
									"@type": "WebSite",
									name: seoSettings.site.name,
									url: publicSiteUrl,
									inLanguage: "es",
									potentialAction: {
										"@type": "SearchAction",
										target: `${publicSiteUrl}/noticias?query={search_term_string}`,
										"query-input": "required name=search_term_string",
									},
								},
							]
						: []),
				]
			: [];

	return (
		<>
			{/* Structured data scripts */}
			{structuredData.map((schema) => (
				<Script
					key={`schema-${schema["@type"]}-${schema.name}`}
					id={`schema-${schema["@type"]}-${schema.name}`}
					type="application/ld+json"
					strategy="afterInteractive"
					data-cfasync="false"
					nonce={nonce}
					dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
				/>
			))}

			{/* Analytics — la CMP (CookieYes) está siempre presente, así que GA queda gated por consentimiento */}
			<GoogleAnalyticsConsent
				gaId={seoSettings.analytics.googleAnalyticsId || undefined}
				gtmId={seoSettings.analytics.googleTagManagerId || undefined}
			/>

			{/* AdSense */}
			<GoogleAdsenseConsent
				clientId={seoSettings.monetization.googleAdsenseClientId || undefined}
				enabled={isAdsenseEnabled()}
			/>

			{/* Route enhancements & floating actions */}
			<RouteEnhancements />
			<FloatingActionsWrapper />
		</>
	);
}
