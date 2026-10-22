import { IconArrowLeft, IconAlertTriangle } from "@/shared/ui/tabler-icons";
import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { getGuildCredentials } from "@/shared/auth/credentials";
import { getCachedServerSession } from "@/shared/auth/get-cached-server-session";
import { getAppPermission } from "@/shared/auth/permissions";
import { Forbidden } from "@/shared/components/forbidden";
import { getPresenceMap, isUserOnline } from "@/shared/lib/presence";
import { cookies } from "next/headers";
import {
	discordMemberHasVerifiedRole,
	fetchDiscordGuildMember,
	fetchDiscordGuildRoles,
	getRaiderRulesAcceptance,
} from "@/shared/lib/raider-rules.server";
import dynamicImport from "next/dynamic";

const AccountDetailClient = dynamicImport(() =>
	import("@/domains/settings/components/account-detail-client").then(
		(mod) => mod.AccountDetailClient,
	),
);

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({
	params,
}: {
	params: Promise<{ userId: string }>;
}) {
	const [{ userId }, session] = await Promise.all([
		params,
		getCachedServerSession(),
	]);
	const roleLevel = session?.user?.roleLevel ?? "invitado";
	const permissions = await getAppPermission(roleLevel, "settings-accounts");
	if (!permissions.canView) {
		return <Forbidden />;
	}

	const normalizedUserId = decodeURIComponent(userId || "")
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, "")
		.toLowerCase();

	const cookieStore = await cookies();
	const cookieMainCharacterId =
		cookieStore.get("artic-tempest-main-character-id")?.value ?? null;

	const profileSelect = `user_id, discord_username, discord_user_id, discord_avatar, role_level, battlenet_battletag, battlenet_id, main_character_id, discord_refresh_token, tokens_invalidated, can_access_bot_dashboard, created_at, last_verification_check, is_banned, ban_reason, ban_expires_at, officer_notes, verification_status`;

	// Editors and admins can see officer_notes and discord_refresh_token;
	// view-only users get these fields stripped before the data reaches the client.
	const canAccessSensitive = resolveCanAccessSensitive(permissions);

	let { data: profile } = await supabaseAdmin
		.from("profiles")
		.select(profileSelect)
		.eq("user_id", normalizedUserId)
		.maybeSingle();

	if (!profile) {
		const { data: fallbackProfile } = await supabaseAdmin
			.from("profiles")
			.select(profileSelect)
			.eq("discord_user_id", normalizedUserId)
			.maybeSingle();
		profile = fallbackProfile || null;
	}

	if (!profile) {
		return (
			<div className="flex flex-col gap-6 p-6 lg:px-8 w-full max-w-full">
				<div className="flex items-center gap-6">
					<Link href="/zona-raider/configuracion/cuentas">
						<Button
							variant="outline"
							size="icon"
							aria-label="Volver al listado"
							className="size-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10  shadow-xl"
						>
							<IconArrowLeft className="size-6" />
						</Button>
					</Link>
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/40">
							Gestión de cuentas
						</p>
						<h1 className="text-3xl font-semibold font-heading italic tracking-tight uppercase">
							Usuario no encontrado
						</h1>
					</div>
				</div>

				<div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-zinc-950/30 p-10 text-white">
					<IconAlertTriangle className="size-10 text-amber-400" />
					<p className="text-center text-sm text-white/70 max-w-lg">
						No hemos encontrado ningún perfil con ese identificador. Revisa el listado
						o selecciona otro usuario.
					</p>
					<Button asChild>
						<Link href="/zona-raider/configuracion/cuentas">Volver al listado</Link>
					</Button>
				</div>
			</div>
		);
	}

	const [raiderRulesAcceptance, creds] = await Promise.all([
		getRaiderRulesAcceptance(profile.user_id),
		getGuildCredentials(),
	]);

	const {
		discordRoleOptions,
		discordMemberRoleIds,
		discordRoleManagerError,
		discordHasVerifiedRole,
	} = await resolveDiscordRoleManager({ profile, creds });

	const profileUserId = profile.user_id;

	const [charactersRes, applicationsRes, presenceMap] = await Promise.all([
		supabaseAdmin
			.from("bnet_characters")
			.select("*")
			.eq("user_id", profileUserId)
			.order("name", { ascending: true }),
		supabaseAdmin
			.from("recruitment_applications")
			.select(
				"id, status, character_name, character_class, character_spec, created_at, updated_at",
			)
			.eq("user_id", profileUserId)
			.order("created_at", { ascending: false })
			.limit(10),
		getPresenceMap([profileUserId]),
	]);

	if (charactersRes.error) {
		console.error(
			`[ADMIN ACCOUNT DETAIL] Failed to load characters for ${profileUserId}:`,
			charactersRes.error,
		);
	}

	const lastSeenTs = resolveLastSeenTimestamp(presenceMap, profileUserId);

	// Strip sensitive fields for view-only users before data reaches the client
	if (!canAccessSensitive) {
		const {
			discord_refresh_token: _rt,
			officer_notes: _on,
			...safeProfile
		} = profile as Record<string, unknown> & {
			discord_refresh_token?: unknown;
			officer_notes?: unknown;
		};
		void _rt;
		void _on;
		profile = safeProfile as typeof profile;
	}

	const enrichedProfile = buildEnrichedProfile({
		profile,
		session,
		cookieMainCharacterId,
		lastSeenTs,
		raiderRulesAcceptance,
		discordHasVerifiedRole,
	});

	const { data: roles } = await supabaseAdmin
		.from("app_roles")
		.select(
			"level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin",
		)
		.order("priority", { ascending: false });

	return (
		<div className="flex flex-col gap-6 p-6 lg:px-8 w-full max-w-full">
			<div className="flex items-center gap-6">
				<Link href="/zona-raider/configuracion/cuentas">
					<Button
						variant="outline"
						size="icon"
						aria-label="Volver a cuentas"
						className="size-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10  shadow-xl"
					>
						<IconArrowLeft className="size-6" />
					</Button>
				</Link>
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/40">
						Gestión de cuentas
					</p>
					<h1 className="text-3xl font-semibold font-heading italic tracking-tight uppercase">
						Ficha de {profile.discord_username}
					</h1>
				</div>
			</div>

			<AccountDetailClient
				key={userId}
				initialProfile={enrichedProfile}
				characters={resolveListOrEmpty(charactersRes?.data)}
				applications={resolveListOrEmpty(applicationsRes?.data)}
				canEdit={permissions.canEdit}
				canManage={permissions.canManage}
				roleCatalog={roles ?? []}
				initialDiscordRoleOptions={discordRoleOptions}
				initialDiscordMemberRoleIds={discordMemberRoleIds}
				discordRoleManagerError={discordRoleManagerError}
				charactersErrorMessage={charactersRes.error?.message ?? null}
			/>
		</div>
	);
}

type DiscordRoleManagerResult = {
	discordRoleOptions: Array<{
		id: string;
		name: string;
		position: number;
		managed: boolean;
	}>;
	discordMemberRoleIds: string[];
	discordRoleManagerError: string | null;
	discordHasVerifiedRole: boolean;
};

/** Loads the Discord role manager state for one member. */
async function resolveDiscordRoleManager({
	profile,
	creds,
}: {
	profile: { discord_user_id: string | null };
	creds: { discord_bot_token?: string | null; discord_guild_id?: string | null };
}): Promise<DiscordRoleManagerResult> {
	let discordRoleOptions: Array<{
		id: string;
		name: string;
		position: number;
		managed: boolean;
	}> = [];
	let discordMemberRoleIds: string[] = [];
	let discordRoleManagerError: string | null = null;

	if (!profile.discord_user_id) {
		discordRoleManagerError =
			"Este miembro no tiene una cuenta de Discord vinculada.";
	} else if (!creds.discord_bot_token || !creds.discord_guild_id) {
		discordRoleManagerError =
			"Discord no está configurado correctamente (falta Bot Token o Guild ID).";
	} else {
		const [guildRolesResult, memberRolesResult] = await Promise.allSettled([
			fetchDiscordGuildRoles({
				guildId: creds.discord_guild_id,
				botToken: creds.discord_bot_token,
			}),
			fetchDiscordGuildMember({
				discordUserId: profile.discord_user_id,
				guildId: creds.discord_guild_id,
				botToken: creds.discord_bot_token,
			}),
		]);

		if (guildRolesResult.status === "fulfilled") {
			discordRoleOptions = guildRolesResult.value.reduce(
				(acc, role) => {
					if (!role.managed) {
						acc.push({
							id: role.id,
							name: role.name,
							position: role.position,
							managed: role.managed,
						});
					}
					return acc;
				},
				[] as Array<{
					id: string;
					name: string;
					position: number;
					managed: boolean;
				}>,
			);
		} else {
			discordRoleManagerError =
				"No se pudieron cargar los roles del servidor desde Discord.";
		}

		if (memberRolesResult.status === "fulfilled") {
			discordMemberRoleIds = memberRolesResult.value?.roles ?? [];
		} else {
			discordRoleManagerError =
				"No se pudieron cargar los roles actuales del miembro en Discord.";
		}
	}

	const discordHasVerifiedRole =
		profile.discord_user_id && creds.discord_bot_token && creds.discord_guild_id
			? await discordMemberHasVerifiedRole({
					discordUserId: profile.discord_user_id,
					guildId: creds.discord_guild_id,
					botToken: creds.discord_bot_token,
				}).catch(() => false)
			: false;

	return {
		discordRoleOptions,
		discordMemberRoleIds,
		discordRoleManagerError,
		discordHasVerifiedRole,
	};
}

/** Adds the derived presence / Raider Rules fields to the stored profile. */
function buildEnrichedProfile({
	profile,
	session,
	cookieMainCharacterId,
	lastSeenTs,
	raiderRulesAcceptance,
	discordHasVerifiedRole,
}: {
	profile: any;
	session: any;
	cookieMainCharacterId: string | null;
	lastSeenTs: number | null;
	raiderRulesAcceptance: any;
	discordHasVerifiedRole: boolean;
}) {
	return {
		...profile,
		main_character_id:
			profile.main_character_id ||
			(session?.user?.id === profile.user_id ? cookieMainCharacterId : null),
		is_online: isUserOnline(lastSeenTs),
		last_online_at: lastSeenTs ? new Date(lastSeenTs).toISOString() : null,
		raider_rules_accepted_at: raiderRulesAcceptance?.accepted_at ?? null,
		raider_rules_accepted_version:
			raiderRulesAcceptance?.accepted_version ?? null,
		raider_rules_discord_role_assigned_at:
			raiderRulesAcceptance?.discord_role_assigned_at ??
			(discordHasVerifiedRole ? new Date().toISOString() : null),
		raider_rules_discord_role_status:
			raiderRulesAcceptance?.discord_role_status ??
			(discordHasVerifiedRole ? "assigned" : null),
		raider_rules_discord_role_error:
			raiderRulesAcceptance?.discord_role_error ?? null,
		raider_rules_discord_role_last_attempt_at:
			raiderRulesAcceptance?.discord_role_last_attempt_at ?? null,
	};
}
function resolveCanAccessSensitive(permissions: {
	canEdit: boolean;
	canManage: boolean;
}) {
	return permissions.canEdit || permissions.canManage;
}

function resolveLastSeenTimestamp(
	presenceMap: Record<string, number | null>,
	userId: string,
) {
	return presenceMap[userId] ?? null;
}

function resolveListOrEmpty<T>(value: T[] | null | undefined) {
	return value || [];
}
