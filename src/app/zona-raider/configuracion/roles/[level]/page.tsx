import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { getCachedServerSession } from "@/shared/auth/get-cached-server-session";
import { getAppPermission } from "@/shared/auth/permissions";
import { Forbidden } from "@/shared/components/forbidden";
import { RoleEditorClient } from "@/domains/settings/components/role-editor-client";

export const runtime = "nodejs";

type Params = {
	level: string;
};

export default async function EditRolePage({
	params,
}: {
	params: Promise<Params>;
}) {
	const { level } = await params;
	const normalizedLevel = decodeURIComponent(level).trim().toLowerCase();

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

	const { data: role } = await supabaseAdmin
		.from("app_roles")
		.select(
			"level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin",
		)
		.eq("level", normalizedLevel)
		.maybeSingle();

	if (!role) {
		notFound();
	}

	return <RoleEditorClient mode="edit" initialRole={role} />;
}
