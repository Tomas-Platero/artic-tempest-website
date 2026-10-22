import React from "react";
import Link from "next/link";
import { IconArrowLeft } from "@/shared/ui/tabler-icons";
import { Button } from "@/shared/ui/button";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { Forbidden } from "@/shared/components/forbidden";
import { getAppPermission } from "@/shared/auth/permissions";
import { getCachedServerSession } from "@/shared/auth/get-cached-server-session";
import { RolesListClient } from "@/domains/settings/components/roles-list-client";
import type { AppRole } from "@/shared/types/auth";

export const runtime = "nodejs";

export default async function SettingsRolesPage() {
	const session = await getCachedServerSession();
	const roleLevel = session?.user?.roleLevel ?? "member";
	const { canManage } = await getAppPermission(roleLevel, "settings");

	if (!canManage) {
		return (
			<div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6 lg:px-8">
				<Forbidden />
			</div>
		);
	}

	const { data: roles } = await supabaseAdmin
		.from("app_roles")
		.select(
			"level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin",
		)
		.order("priority", { ascending: false });

	return (
		<div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6 lg:px-8">
			<div className="flex items-center gap-4">
				<Link
					href="/zona-raider/configuracion"
					aria-label="Volver a configuración"
				>
					<Button
						variant="outline"
						size="icon"
						aria-label="Volver a configuración"
						className="size-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10  shadow-xl"
					>
						<IconArrowLeft className="size-6" />
					</Button>
				</Link>
				<div>
					<h1 className="text-3xl font-semibold font-heading italic tracking-tight flex items-center gap-3">
						GESTIÓN DE ROLES
					</h1>
					<p className="text-sm font-medium text-white/40 mt-2 tracking-widest leading-relaxed">
						Crea, ordena y configura los roles de la aplicación.
					</p>
				</div>
			</div>
			<RolesListClient roles={(roles as AppRole[]) ?? []} />
		</div>
	);
}
