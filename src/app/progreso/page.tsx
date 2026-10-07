import { Metadata } from "next";
import Image from "next/image";
import {
	getRaidTimeline,
	SEASON_2_RAID_SLUG,
} from "@/domains/landing/lib/progression";
import { LandingNavigation } from "@/domains/landing/components/navigation";
import dynamic from "next/dynamic";
import { WebPageJsonLd } from "@/shared/seo/json-ld-webpage";
import { fetchRaiderIoRaidingStaticData } from "@/shared/integrations/raiderio/raiderio-client";
import { getSporefallSummary } from "./lib/sporefall-summary.server";
import {
	getRaidStartDate,
} from "./lib/progress.utils";

const HorizontalProgressTimeline = dynamic(() =>
	import("./components/horizontal-progress-timeline").then(
		(m) => m.HorizontalProgressTimeline,
	),
);
const VerticalProgressTimeline = dynamic(() =>
	import("./components/vertical-progress-timeline").then(
		(m) => m.VerticalProgressTimeline,
	),
);

const pageTitle = "Progreso Raiders | Artic Tempest";
const pageDescription =
	"Sigue el progreso de banda de Artic Tempest en Midnight con bosses derrotados, dificultad actual, porcentajes reales de avance y timeline de intentos.";

export const metadata: Metadata = {
	title: pageTitle,
	description: pageDescription,
	alternates: { canonical: "https://artictempest.es/progreso" },
	keywords: [
		"progreso de banda wow",
		"midnight tier 1",
		"artic tempest progreso",
		"raid progress wow",
		"heroico midnight",
	],
	openGraph: {
		title: pageTitle,
		description: pageDescription,
		type: "website",
		url: "https://artictempest.es/progreso",
		siteName: "Artic Tempest",
		images: ["/assets/images/artic-tempest-og.webp"],
	},
	twitter: {
		card: "summary_large_image",
		title: pageTitle,
		description: pageDescription,
		images: ["/assets/images/artic-tempest-og.webp"],
	},
};

export const revalidate = 120;

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://artictempest.es";

// Time-dependent, so it stays out of the component body: `react(purity)` flags
// impure calls made during render, and this value moves with the clock. The page
// is regenerated every `revalidate` seconds anyway.
function isSeason2Released(seasonStartMs: number | null): boolean {
	return seasonStartMs !== null && Date.now() >= seasonStartMs;
}

export default async function ProgressPage() {
	const [timeline, sporefall, staticData] = await Promise.all([
		getRaidTimeline(),
		getSporefallSummary(),
		fetchRaiderIoRaidingStaticData(11),
	]);
	const season2Start = getRaidStartDate(staticData, SEASON_2_RAID_SLUG);
	const isSeason2Visible = isSeason2Released(season2Start);
	const season2Timeline = isSeason2Visible
		? await getRaidTimeline(SEASON_2_RAID_SLUG)
		: null;
	const hasAnyTimeline = Boolean(season2Timeline || timeline || sporefall);

	return (
		<>
			<WebPageJsonLd
				webPage={{
					id: `\${baseUrl}/progreso`,
					name: "Progreso Raiders | Artic Tempest",
					description:
						"Sigue el progreso de banda de Artic Tempest en Midnight con bosses derrotados, dificultad actual, porcentajes reales de avance y timeline de intentos.",
				}}
				breadcrumb={[
					{ name: "Inicio", url: baseUrl },
					{ name: "Progreso", url: `\${baseUrl}/progreso` },
				]}
			/>
			<div className="min-h-dvh bg-[#040612] text-white animate-fade-in animate-duration-slow motion-reduce:animate-none">
				<LandingNavigation />
				<main
					id="main-content"
					className="relative overflow-hidden border-b border-white/5"
				>
					<div className="absolute inset-0">
						<Image
							src="/assets/images/progreso-equipo-raiders.webp"
							alt=""
							fill
							sizes="100vw"
							priority
							className="object-cover opacity-35"
						/>
						<div className="absolute inset-0 bg-linear-to-b from-black/82 via-[#040612]/86 to-[#040612]/96" />
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_40%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.35),transparent_55%)]" />
					</div>

					<div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-none flex-col px-0 pb-10 pt-32 md:pt-40">
						<div className="mx-auto w-full max-w-5xl text-center">
							<h1 className="text-3xl font-semibold uppercase tracking-[0.18em] text-balance sm:text-4xl lg:text-5xl">
								<span className="text-blue-100 drop-shadow-[0_0_24px_rgba(96,165,250,0.35)]">
									Progreso Raiders
								</span>
							</h1>
						</div>

						<div className="mt-10 flex-1">
							{hasAnyTimeline ? (
								<div className="space-y-10">
									{season2Timeline ? (
										<section aria-labelledby="season-2-timeline">
											<h2
												id="season-2-timeline"
												className="px-4 text-center text-sm font-semibold uppercase tracking-[0.35em] text-blue-100/80 sm:px-6 lg:px-8"
											>
												Temporada 2
											</h2>
											<div className="hidden lg:block">
												<HorizontalProgressTimeline
													timeline={season2Timeline}
													sporefall={null}
												/>
											</div>
											<div className="lg:hidden">
												<VerticalProgressTimeline
													timeline={season2Timeline}
													sporefall={null}
												/>
											</div>
										</section>
									) : null}
									{timeline || sporefall ? (
										<section aria-labelledby="season-1-timeline">
											<h2
												id="season-1-timeline"
												className="px-4 text-center text-sm font-semibold uppercase tracking-[0.35em] text-blue-100/80 sm:px-6 lg:px-8"
											>
												Temporada 1
											</h2>
											<div className="hidden lg:block">
												<HorizontalProgressTimeline
													timeline={timeline}
													sporefall={sporefall}
												/>
											</div>
											<div className="lg:hidden">
												<VerticalProgressTimeline
													timeline={timeline}
													sporefall={sporefall}
												/>
											</div>
										</section>
									) : null}
								</div>
							) : (
								<div className="mx-auto max-w-5xl rounded-3xl border border-white/5 bg-white/5 p-10 text-center text-white/70">
									<p>
										No hay datos suficientes para construir la línea temporal.
									</p>
									<p className="text-sm text-white/60">
										Comprueba más tarde cuando Raider.io vuelva a exponer live
										tracking para la banda actual.
									</p>
								</div>
							)}
						</div>
					</div>
				</main>
			</div>
		</>
	);
}
