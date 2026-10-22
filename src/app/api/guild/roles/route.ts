import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { ensureAdmin } from "@/shared/auth/permissions";
import { invalidateRolesCache } from "@/shared/auth/roles";
import { logRoleAudit } from "@/shared/lib/role-audit.server";

export async function GET() {
	const { data, error } = await supabaseAdmin
		.from("app_roles")
		.select(
			"level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin",
		)
		.order("priority", { ascending: false });

	if (error) {
		console.error("[roles] GET error", error);
		return NextResponse.json(
			{ error: "No se pudieron cargar los roles" },
			{
				status: 500,
			},
		);
	}

	return NextResponse.json(
		(data ?? []).map((role) => ({
			...role,
			roleSlug: role.level,
			roleLabel: role.label,
		})),
	);
}

export async function POST(req: Request) {
	const session = await ensureAdmin();

	try {
		const body = await req.json();
		const level = (body.roleSlug || body.level || body.role_slug || "")
			.toString()
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-_]/g, "-");
		const label = (body.roleLabel || body.label || body.role_label || "")
			.toString()
			.trim();
		const description = body.description?.toString() || null;
		const priority = Number(body.priority ?? 0);
		const color = (body.color || "#94a3b8").toString().trim();
		const canAccessZonaRaider = Boolean(body.canAccessZonaRaider);
		const isSuperAdmin = Boolean(body.isSuperAdmin);
		const isAdmin = Boolean(body.isAdmin);
		const isGmRole = level === "gm";
		const permissionsFrom =
			body.permissionsFrom?.toString().trim().toLowerCase() || null;

		if (!level || !label) {
			return NextResponse.json(
				{ error: "El identificador y el nombre son obligatorios" },
				{ status: 400 },
			);
		}

		const { data, error } = await supabaseAdmin
			.from("app_roles")
			.insert({
				level,
				label,
				description,
				priority,
				color,
				can_access_zona_raider: isGmRole ? true : canAccessZonaRaider,
				is_super_admin: isGmRole ? true : isSuperAdmin,
				is_admin: isGmRole ? true : isAdmin,
			})
			.select(
				"level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin",
			)
			.single();

		if (error) throw error;

		if (isSuperAdmin || isAdmin) {
			await supabaseAdmin
				.from("app_permissions")
				.delete()
				.eq("role_level", level);
		}

		await logRoleAudit({
			action: "role.create",
			roleLevel: level,
			payload: {
				label,
				description,
				priority,
				color,
				canAccessZonaRaider,
				isSuperAdmin,
				isAdmin,
			},
			changedBy: session.user?.id,
		});

		if (permissionsFrom) {
			const { data: templatePermissions } = await supabaseAdmin
				.from("app_permissions")
				.select("app_id, can_view, can_edit, can_manage")
				.eq("role_level", permissionsFrom);

			if (templatePermissions?.length) {
				const cloned = templatePermissions.map((perm) => ({
					...perm,
					role_level: level,
				}));
				await supabaseAdmin.from("app_permissions").insert(cloned);
				await logRoleAudit({
					action: "permission.clone",
					roleLevel: level,
					payload: { from: permissionsFrom, count: cloned.length },
					changedBy: session.user?.id,
				});
			}
		}

		invalidateRolesCache();
		return NextResponse.json({
			role: data
				? { ...data, roleSlug: data.level, roleLabel: data.label }
				: null,
		});
	} catch (error: any) {
		console.error("[roles] POST error", error);
		return NextResponse.json(
			{ error: error.message || "No se pudo crear el rol" },
			{ status: 500 },
		);
	}
}
