"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { SkipLink } from "@/shared/components/skip-link";
import { ScrollToTop } from "@/shared/ui/scroll-to-top";
import { ThemedToaster } from "@/shared/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { isZonaRaiderPath } from "@/shared/lib/zona-raider-path";

// Dynamic import so the toolbar code doesn't ship to production bundles
const VercelToolbar = dynamic(
	() =>
		import("@vercel/toolbar/next").then((mod) => ({
			default: mod.VercelToolbar,
		})),
	{ ssr: false },
);

const NotificationToastListener = dynamic(
	() =>
		import(
			"@/domains/notifications/components/notification-toast-listener"
		).then((mod) => ({ default: mod.NotificationToastListener })),
	{ ssr: false },
);

const NotificationPermissionModal = dynamic(
	() =>
		import(
			"@/domains/notifications/components/notification-permission-modal"
		).then((mod) => ({ default: mod.NotificationPermissionModal })),
	{ ssr: false },
);

const PwaPrompt = dynamic(
	() =>
		import("@/shared/components/pwa-prompt").then((mod) => ({
			default: mod.PwaPrompt,
		})),
	{ ssr: false },
);

const STATIC_LEGAL_PATHS = new Set([
	"/aviso-legal",
	"/cookies",
	"/privacidad",
	"/accesibilidad",
	"/ayuda",
	"/mantenimiento",
	"/login",
	"/login-mantenimiento",
	"/baneado",
]);

export function RouteEnhancements() {
	const pathname = usePathname();
	const isStaticLegal = pathname ? STATIC_LEGAL_PATHS.has(pathname) : false;

	const isProd = process.env.NODE_ENV === "production";

	return (
		<>
			<ScrollToTop />
			<SkipLink />
			{isZonaRaiderPath(pathname ?? "") && <NotificationToastListener />}
			{isZonaRaiderPath(pathname ?? "") && <NotificationPermissionModal />}
			{!isStaticLegal && <PwaPrompt />}
			<ThemedToaster />
			{isProd && <Analytics />}
			{isProd && <SpeedInsights />}
			{process.env.NODE_ENV === "development" && <VercelToolbar />}
		</>
	);
}
