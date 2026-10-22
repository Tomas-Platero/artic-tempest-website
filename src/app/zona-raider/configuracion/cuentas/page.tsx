// src/app/zona-raider/configuracion/cuentas/page.tsx
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { AccountsClient } from "@/domains/settings/components/accounts-client";
import { getCachedServerSession } from "@/shared/auth/get-cached-server-session";

import { getAppPermission } from "@/shared/auth/permissions";
import { Forbidden } from "@/shared/components/forbidden";
import { AdminSectionHeader } from "@/shared/components/admin-section-header";
import { getPresenceMap, isUserOnline } from "@/shared/lib/presence";

export const dynamic = "force-dynamic";

export default async function AccountsSettingsPage() {
	const session = await getCachedServerSession();
	const roleLevel = session?.user?.roleLevel ?? "invitado";
	const { canEdit } = await getAppPermission(roleLevel, "settings-accounts");

	if (!canEdit) {
		return <Forbidden />;
	}

	const [{ data: profiles }, { data: charCounts }, { data: roles }] =
		await Promise.all([
			supabaseAdmin
				.from("profiles")
				.select("*")
				.order("discord_username", { ascending: true }),
			supabaseAdmin.from("bnet_characters").select("user_id"),
			supabaseAdmin
				.from("app_roles")
				.select(
					"level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin",
				)
				.order("priority", { ascending: false }),
		]);

	const countMap: Record<string, number> = {};
	charCounts?.forEach((c) => {
		countMap[c.user_id] = (countMap[c.user_id] || 0) + 1;
	});

	const profilesWithCounts =
		profiles?.map((p) => ({
			...p,
			character_count: countMap[p.user_id] || 0,
		})) || [];

	const presenceMap = await getPresenceMap(
		profilesWithCounts.map((profile) => profile.user_id),
	);

	const enrichedProfiles = profilesWithCounts.map((profile) => {
		const lastSeen = presenceMap[profile.user_id] ?? null;
		const isOnline = isUserOnline(lastSeen);
		return {
			...profile,
			is_online: isOnline,
			last_online_at: lastSeen ? new Date(lastSeen).toISOString() : null,
		};
	});

	return (
		<div className="flex flex-col gap-6 p-6 lg:px-8 w-full max-w-full">
			<AdminSectionHeader
				backHref="/zona-raider/configuracion/"
				backLabel="Volver a configuración"
				title="GESTIÓN DE CUENTAS"
				description="Gestión de cuentas de la web."
				titleClassName="flex items-center gap-3"
			/>
			<AccountsClient initialProfiles={enrichedProfiles} roles={roles ?? []} />
		</div>
	);
}
