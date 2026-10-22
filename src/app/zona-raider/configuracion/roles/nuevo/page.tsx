import { getCachedServerSession } from "@/shared/auth/get-cached-server-session";
import { getAppPermission } from "@/shared/auth/permissions";
import { Forbidden } from "@/shared/components/forbidden";
import { RoleEditorClient } from "@/domains/settings/components/role-editor-client";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";

export const runtime = "nodejs";

export default async function NewRolePage({
	searchParams,
}: {
	searchParams: Promise<{ template?: string }>;
}) {
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

	const { template } = await searchParams;
	let templateRole = null;
	let templateSource: string | null = null;

	if (template) {
		const normalized = template.trim().toLowerCase();
		const { data: roleTemplate } = await supabaseAdmin
			.from("app_roles")
			.select(
				"level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin",
			)
			.eq("level", normalized)
			.maybeSingle();
		if (roleTemplate) {
			templateRole = roleTemplate;
			templateSource = roleTemplate.level;
		}
	}

	return (
		<RoleEditorClient
			mode="create"
			initialRole={templateRole ? { ...templateRole, level: "" } : null}
			templateRole={templateRole}
			templateSource={templateSource}
		/>
	);
}
