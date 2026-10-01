// src/shared/lib/recruitment/notify-apply-core.ts
// Session-less core of the recruitment Discord notification flow. Extracted from
// /api/discord/notify-apply so both the HTTP route (with auth) and the cron
// self-test (service role) can reuse the exact same logic.
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { getGuildCredentials } from "@/shared/auth/credentials";
import { fetchCharacterRIO } from "@/shared/integrations/raiderio/raiderio-client";
import { fetchCharacterItemLevel } from "@/shared/integrations/bnet/bnet-client";
import { buildRecruitmentDiscordPayload } from "@/shared/lib/recruitment/discord-apply";
import { getRecruitmentDiscordRaidProgress } from "@/shared/lib/recruitment/raid-progression";

const CLASS_INFO: Record<number, { name: string; color: number }> = {
	1: { name: "Warrior", color: 0xc69b6d },
	2: { name: "Paladin", color: 0xf48cba },
	3: { name: "Hunter", color: 0xabd473 },
	4: { name: "Rogue", color: 0xfff468 },
	5: { name: "Priest", color: 0xffffff },
	6: { name: "Death Knight", color: 0xc41e3a },
	7: { name: "Shaman", color: 0x0070de },
	8: { name: "Mage", color: 0x3fc7eb },
	9: { name: "Warlock", color: 0x8788ee },
	10: { name: "Monk", color: 0x00ff98 },
	11: { name: "Druid", color: 0xff7c0a },
	12: { name: "Demon Hunter", color: 0xa330c9 },
	13: { name: "Evoker", color: 0x33937f },
};

export type NotifyApplicationResult =
	| { ok: true; message_id: string }
	| { ok: false; reason: "not_configured" | "error"; error?: string };

/**
 * Builds and posts the recruitment Discord embed for an application and saves
 * the resulting message id. Returns `ok: false, reason: "not_configured"` when
 * the bot or channel is missing, and throws only on unexpected failures.
 */
export async function notifyApplicationCore(
	applicationId: string,
	channelId?: string,
	force = false,
): Promise<NotifyApplicationResult> {
	try {
		const { data: application, error: appError } = await supabaseAdmin
			.from("recruitment_applications")
			.select("*")
			.eq("id", applicationId)
			.single();

		if (appError || !application) {
			throw new Error("No se pudo obtener la solicitud de la base de datos");
		}

		// Perfil del usuario
		const { data: profile } = await supabaseAdmin
			.from("profiles")
			.select("discord_username, discord_avatar, discord_user_id")
			.eq("user_id", application.user_id)
			.single();

		application.profiles = profile || {};

		// Logo de la guild
		const { data: guild } = await supabaseAdmin
			.from("settings")
			.select("icon_url")
			.eq("id", 1)
			.maybeSingle();

		const guildIconUrl =
			guild?.icon_url || `${process.env.NEXTAUTH_URL}/favicon.ico`;

		// Nivel real del personaje
		const { data: charData } = await supabaseAdmin
			.from("bnet_characters")
			.select("level")
			.eq("user_id", application.user_id)
			.eq("name", application.character_name)
			.eq("realm", application.character_realm)
			.single();

		const characterLevel = charData?.level || 80;

		// Credenciales del bot
		const creds = await getGuildCredentials();
		const targetChannelId = channelId || creds.discord_recruitment_channel_id;
		const botToken = creds.discord_bot_token;

		if (!targetChannelId || !botToken) {
			return { ok: false, reason: "not_configured" };
		}

		// Clase para el diseño del embed
		const charClassId = Number(application.character_class);
		const charClass = CLASS_INFO[charClassId] || {
			name: "Unknown",
			color: 0x2b2d31,
		};

		// Raider.IO
		const rioData = await fetchCharacterRIO(
			application.character_name,
			application.character_realm,
		);

		let mplusScore = 0;
		if (rioData?.mythic_plus_scores_by_season) {
			const seasons = rioData.mythic_plus_scores_by_season;
			const activeSeason =
				seasons.find((s: any) => s.scores?.all > 0) || seasons[0];
			mplusScore = activeSeason?.scores?.all || 0;
		}

		const raidProgress = getRecruitmentDiscordRaidProgress(
			rioData?.raid_progression,
		);

		// Item Level desde Battle.net
		const bnetItemLevel = await fetchCharacterItemLevel(
			application.character_realm,
			application.character_name,
			"eu",
		);

		const eqIvl = bnetItemLevel?.equipped || rioData?.gear?.item_level_equipped;
		const maxIvl = bnetItemLevel?.average || rioData?.gear?.item_level_total;
		const iLvl = eqIvl
			? maxIvl > 0
				? `${eqIvl} / ${maxIvl}`
				: `${eqIvl}`
			: "N/A";

		const { data: answers } = await supabaseAdmin
			.from("application_answers")
			.select(
				`
            id,
            answer_text,
            question:recruitment_questions(
              label,
              type,
              order_index
            )
          `,
			)
			.eq("application_id", application.id);

		// Embed de Discord
		const discordPayload = buildRecruitmentDiscordPayload({
			application,
			profile: application.profiles,
			guildIconUrl,
			characterLevel,
			charClass,
			iLvl,
			raidProgress,
			mplusScore,
			answers: answers || [],
			includeRolePing: true,
			components: [
				{
					type: 1, // Action Row
					components: [
						{
							type: 2, // Button
							style: 5, // Link
							label: "Ver Aplicación/Responder",
							url: `${process.env.NEXTAUTH_URL}/zona-raider/configuracion/reclutamiento/${application.id}`,
						},
					],
				},
			],
			thumbnailUrl: rioData?.thumbnail_url || null,
		});

		const discordHeaders = {
			Authorization: `Bot ${botToken}`,
			"Content-Type": "application/json",
		};

		const postDiscordMessage = () =>
			fetch(
				`https://discord.com/api/v10/channels/${targetChannelId}/messages`,
				{
					method: "POST",
					cache: "no-store",
					headers: discordHeaders,
					body: JSON.stringify(discordPayload),
				},
			);

		const patchDiscordMessage = (messageId: string) =>
			fetch(
				`https://discord.com/api/v10/channels/${targetChannelId}/messages/${messageId}`,
				{
					method: "PATCH",
					cache: "no-store",
					headers: discordHeaders,
					body: JSON.stringify(discordPayload),
				},
			);

		const canPatchExisting = force && !!application.discord_message_id;
		let discordRes = canPatchExisting
			? await patchDiscordMessage(application.discord_message_id)
			: await postDiscordMessage();

		if (!discordRes.ok && canPatchExisting) {
			console.warn(
				"Discord patch failed, falling back to a new message:",
				discordRes.status,
			);
			discordRes = await postDiscordMessage();
		}

		if (!discordRes.ok) {
			const errorText = await discordRes.text();
			console.error("\n❌ [DISCORD EMBED FAIL] Código:", discordRes.status);
			console.error("❌ Texto de discord:", errorText);
			console.error("❌ Intentando mandar al canal:", targetChannelId);
			throw new Error("No se pudo enviar el mensaje a Discord");
		}

		const discordMessage = await discordRes.json();

		if (discordMessage.id) {
			const { error: updateError } = await supabaseAdmin
				.from("recruitment_applications")
				.update({ discord_message_id: discordMessage.id })
				.eq("id", applicationId);

			if (updateError) {
				console.error(
					"No se pudo guardar discord_message_id. Asegúrate de añadir la columna a Supabase:",
					updateError.message,
				);
			}
		}

		return { ok: true, message_id: discordMessage.id };
	} catch (error: any) {
		return {
			ok: false,
			reason: "error",
			error: error?.message ?? String(error),
		};
	}
}
