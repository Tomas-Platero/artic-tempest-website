import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import {
	IconBell,
	IconBug,
	IconBuildingStore,
	IconDeviceGamepad,
	IconUsers,
	IconUserSearch,
	IconBrandDiscord,
	IconBrandTwitch,
	IconLayoutNavbar,
	IconNews,
	IconShieldLock,
	IconApps,
	IconGlobe,
	IconKey,
	IconPhoto,
	IconFileText,
} from "@/shared/ui/tabler-icons";
import { AdminPageHeader } from "@/shared/components/admin-page-header";
import React from "react";

function SettingsCardGrid({ items }: { items: any[] }) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 md:gap-6 lg:gap-8 [&_a]:hover:scale-[1.02] w-full">
			{items.reduce<React.ReactNode[]>((acc, category) => {
				if (!category.visible) return acc;
				const Icon = category.icon;
				acc.push(
					<Link
						href={category.href}
						key={category.href}
						className="block group"
					>
						<Card className="h-full border-border/40 bg-card/40 backdrop-blur-sm  group-hover:border-primary/50 group-hover:bg-card/50 group-hover:shadow-lg group-hover:shadow-primary/5">
							<CardHeader className="flex flex-row items-center gap-4 p-5">
								<div
									className={`p-3 rounded-xl ${category.bg} ${category.color} shrink-0 shadow-sm border border-white/5 shrink-0 transition-transform group-hover:scale-110`}
								>
									<Icon className="size-6" />
								</div>
								<div className="flex flex-col text-left overflow-hidden">
									<CardTitle className="text-base font-semibold leading-none mb-2 truncate">
										{category.title}
									</CardTitle>
									<CardDescription className="text-sm leading-relaxed text-muted-foreground line-clamp-2">
										{category.description}
									</CardDescription>
								</div>
							</CardHeader>
						</Card>
					</Link>,
				);
				return acc;
			}, [])}
		</div>
	);
}

import { Forbidden } from "@/shared/components/forbidden";
import { getAppPermission } from "@/shared/auth/permissions";
import { getCachedServerSession } from "@/shared/auth/get-cached-server-session";
import { getAuthzSnapshot } from "@/shared/auth/authz";

export default async function SettingsHubPage() {
	const session = await getCachedServerSession();
	const authz = session ? await getAuthzSnapshot(session) : null;
	const roleLevel = authz?.roleSlug ?? session?.user?.roleLevel ?? "member";
	const { canView } = await getAppPermission(roleLevel, "settings");

	if (!canView) {
		return (
			<div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6 lg:px-8">
				<Forbidden />
			</div>
		);
	}

	const [
		settingsPermission,
		discordPermission,
		bnetPermission,
		accountsPermission,
		apiPermission,
		menuPermission,
		recruitmentPermission,
		newsPermission,
		notificationsPermission,
		streamersPermission,
		mediaLibraryPermission,
		testingPermission,
	] = await Promise.all([
		getAppPermission(roleLevel, "settings"),
		getAppPermission(roleLevel, "settings-discord"),
		getAppPermission(roleLevel, "settings-bnet"),
		getAppPermission(roleLevel, "settings-accounts"),
		getAppPermission(roleLevel, "settings-api"),
		getAppPermission(roleLevel, "settings-menu"),
		getAppPermission(roleLevel, "settings-recruitment"),
		getAppPermission(roleLevel, "settings-news"),
		getAppPermission(roleLevel, "settings-notifications"),
		getAppPermission(roleLevel, "settings-streamers"),
		getAppPermission(roleLevel, "media-library"),
		getAppPermission(roleLevel, "settings-testing"),
	]);

	const identitySettings = [
		{
			title: "Configuración de Zona Raider",
			description: "Información de la hermandad y logotipo.",
			icon: IconBuildingStore,
			href: "/zona-raider/configuracion/general",
			color: "text-blue-500",
			bg: "bg-blue-500/10",
			visible: settingsPermission.canView,
		},
		{
			title: "Personalización del Menú",
			description:
				"Gestiona enlaces de la barra lateral, orden, iconos y visibilidad.",
			icon: IconLayoutNavbar,
			href: "/zona-raider/configuracion/menu",
			color: "text-orange-500",
			bg: "bg-orange-500/10",
			visible: menuPermission.canEdit,
		},
	];

	const membersSettings = [
		{
			title: "Gestión de Cuentas",
			description:
				"Estado de vinculación Discord/Bnet y verificación de miembros.",
			icon: IconUsers,
			href: "/zona-raider/configuracion/cuentas",
			color: "text-blue-500",
			bg: "bg-blue-500/10",
			visible: accountsPermission.canEdit,
		},
		{
			title: "Roles y Accesos",
			description: "Define qué puede ver y hacer cada rango de la hermandad.",
			icon: IconShieldLock,
			href: "/zona-raider/configuracion/roles",
			color: "text-green-500",
			bg: "bg-green-500/10",
			visible: settingsPermission.canManage,
		},
		{
			title: "Reclutamiento",
			description:
				"Gestiona vacantes de clase, prioridades y el formulario público.",
			icon: IconUserSearch,
			href: "/zona-raider/configuracion/reclutamiento",
			color: "text-blue-400",
			bg: "bg-blue-400/10",
			visible: recruitmentPermission.canView,
		},
	];

	const integrationsSettings = [
		{
			title: "Bot de Discord",
			description:
				"Vinculación de la App, gestión de Slash Commands y sincronización.",
			icon: IconBrandDiscord,
			href: "/zona-raider/configuracion/discord",
			color: "text-[#5865F2]",
			bg: "bg-[#5865F2]/10",
			visible: discordPermission.canEdit,
		},
		{
			title: "Configuración de WoWAudit",
			description:
				"Conecta el roster de WoWAudit con la web y fuerza la sincronización cuando sea necesario.",
			icon: IconDeviceGamepad,
			href: "/zona-raider/configuracion/wowaudit",
			color: "text-amber-500",
			bg: "bg-amber-500/10",
			visible: bnetPermission.canEdit,
		},
		{
			title: "API Tokens",
			description:
				"Genera y gestiona tokens de acceso para aplicaciones externas e integraciones.",
			icon: IconKey,
			href: "/zona-raider/configuracion/api-token",
			color: "text-yellow-500",
			bg: "bg-yellow-500/10",
			visible: apiPermission.canManage,
		},
	];

	const contentSettings = [
		{
			title: "Noticias de la Hermandad",
			description:
				"Publica las noticias que aparecen en la página principal.",
			icon: IconNews,
			href: "/zona-raider/configuracion/noticias",
			color: "text-primary",
			bg: "bg-primary/10",
			visible: newsPermission.canView,
		},
		{
			title: "Twitch Streamers",
			description:
				"Añade a los creadores de contenido para su promoción en la web.",
			icon: IconBrandTwitch,
			href: "/zona-raider/configuracion/streamers",
			color: "text-purple-400",
			bg: "bg-purple-400/10",
			visible: streamersPermission.canEdit,
		},
		{
			title: "Notificaciones del Sistema",
			description: "Envía comunicados y avisos globales a todos los usuarios.",
			icon: IconBell,
			href: "/zona-raider/configuracion/notificaciones",
			color: "text-rose-500",
			bg: "bg-rose-500/10",
			visible: notificationsPermission.canEdit,
		},
		{
			title: "Páginas",
			description:
				"Gestiona las páginas registradas, edita títulos y configura qué roles tienen acceso.",
			icon: IconFileText,
			href: "/zona-raider/configuracion/pages",
			color: "text-indigo-400",
			bg: "bg-indigo-400/10",
			visible: settingsPermission.canView,
		},
		{
			title: "Biblioteca Multimedia",
			description:
				"Gestiona imágenes, documentos y archivos de toda la web desde una biblioteca centralizada.",
			icon: IconPhoto,
			href: "/zona-raider/configuracion/medios",
			color: "text-amber-400",
			bg: "bg-amber-400/10",
			visible: mediaLibraryPermission.canView,
		},
	];

	const systemSettings = [
		{
			title: "SEO público",
			description:
				"Configura cómo se ve la web al compartirla en redes, el aviso de cookies y las herramientas de Google.",
			icon: IconGlobe,
			href: "/zona-raider/configuracion/seo",
			color: "text-cyan-400",
			bg: "bg-cyan-400/10",
			visible: settingsPermission.canEdit,
		},
		{
			title: "Configuración de Apps",
			description:
				"Activa o desactiva funcionalidades como el chatbot y la cámara semanal.",
			icon: IconApps,
			href: "/zona-raider/configuracion/aplicaciones",
			color: "text-emerald-500",
			bg: "bg-emerald-500/10",
			visible: apiPermission.canView,
		},
		{
			title: "Testing",
			description:
				"Autodiagnósticos y pruebas del sistema, incluido el self-test de reclutamiento.",
			icon: IconBug,
			href: "/zona-raider/configuracion/testing",
			color: "text-rose-500",
			bg: "bg-rose-500/10",
			visible: testingPermission.canView,
		},
	];

	return (
		<div className="flex flex-col gap-4 py-6 px-4 lg:px-6 w-full max-w-[1600px] mx-auto">
			<AdminPageHeader
				title="AJUSTES"
				description="Panel de control centralizado para la administración de la hermandad."
			/>

			<div className="flex flex-col gap-10 mt-6">
				<section>
					<div className="flex items-center gap-3 mb-5 px-1">
						<div className="size-1 h-4 bg-blue-500 rounded-full" />
						<h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80">
							Identidad
						</h2>
					</div>
					<SettingsCardGrid items={identitySettings} />
				</section>

				<section>
					<div className="flex items-center gap-3 mb-5 px-1">
						<div className="size-1 h-4 bg-green-500 rounded-full" />
						<h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80">
							Miembros
						</h2>
					</div>
					<SettingsCardGrid items={membersSettings} />
				</section>

				<section>
					<div className="flex items-center gap-3 mb-5 px-1">
						<div className="size-1 h-4 bg-[#5865F2] rounded-full" />
						<h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80">
							Integraciones
						</h2>
					</div>
					<SettingsCardGrid items={integrationsSettings} />
				</section>

				<section>
					<div className="flex items-center gap-3 mb-5 px-1">
						<div className="size-1 h-4 bg-primary rounded-full" />
						<h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80">
							Contenido
						</h2>
					</div>
					<SettingsCardGrid items={contentSettings} />
				</section>

				<section>
					<div className="flex items-center gap-3 mb-5 px-1">
						<div className="size-1 h-4 bg-emerald-500 rounded-full" />
						<h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80">
							Sistema
						</h2>
					</div>
					<SettingsCardGrid items={systemSettings} />
				</section>
			</div>
		</div>
	);
}
