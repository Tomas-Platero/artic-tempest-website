import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import type { AppRole, RoleLevel } from "@/shared/types/auth";

type CachedRoles = {
	data: AppRole[];
	fetchedAt: number;
};

const CACHE_TTL = 60 * 1000; // 60s
let cache: CachedRoles | null = null;

function normalizeRoles(rows: any[] | null): AppRole[] {
	if (!Array.isArray(rows)) return [];
	return rows.map((row) => ({
		level: row.level,
		label: row.label,
		description: row.description ?? null,
		priority: Number(row.priority ?? 0),
		color: row.color ?? "#94a3b8",
		can_access_zona_raider: Boolean(row.can_access_zona_raider),
		is_super_admin: Boolean(row.is_super_admin),
		is_admin: Boolean(row.is_admin),
	}));
}

export function invalidateRolesCache() {
	cache = null;
}

export async function fetchAppRoles(force = false): Promise<AppRole[]> {
	const now = Date.now();
	if (!force && cache && now - cache.fetchedAt < CACHE_TTL) {
		return cache.data;
	}

	const { data, error } = await supabaseAdmin
		.from("app_roles")
		.select(
			"level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin",
		)
		.order("priority", { ascending: false });

	if (error) {
		console.error("[roles] Error fetching app_roles", error);
		return cache?.data ?? [];
	}

	const normalized = normalizeRoles(data);
	cache = { data: normalized, fetchedAt: now };
	return normalized;
}

async function getRoleMeta(level: RoleLevel) {
	const roles = await fetchAppRoles();
	return roles.find((role) => role.level === level) ?? null;
}

export async function getRolePriority(level: RoleLevel): Promise<number> {
	const meta = await getRoleMeta(level);
	if (!meta) return Number.NEGATIVE_INFINITY;
	return meta.priority;
}

export async function isSuperAdmin(level: RoleLevel | null | undefined) {
	if (!level) return false;
	const meta = await getRoleMeta(level);
	return Boolean(meta?.is_super_admin);
}

export async function isRoleAtLeast(current: RoleLevel, required: RoleLevel) {
	const targetPriority = await getRolePriority(required);
	if (targetPriority === Number.NEGATIVE_INFINITY) return false;
	const currentPriority = await getRolePriority(current);
	return currentPriority >= targetPriority;
}

export async function getRoleFlags(level: RoleLevel) {
	const meta = await getRoleMeta(level);
	return {
		canAccessZonaRaider: Boolean(meta?.can_access_zona_raider),
		isSuperAdmin: Boolean(meta?.is_super_admin),
		isAdmin: Boolean(meta?.is_admin),
		priority: meta?.priority ?? Number.NEGATIVE_INFINITY,
		label: meta?.label ?? level,
		color: meta?.color ?? null,
	};
}
