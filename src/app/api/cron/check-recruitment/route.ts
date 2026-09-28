import { NextResponse } from "next/server";
import { requireCronAuth } from "@/shared/security/cron-auth";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { getGuildCredentials } from "@/shared/auth/credentials";
import { submitApplicationCore } from "@/shared/lib/recruitment/submit-core";
import { getComponentId } from "@/shared/integrations/statuspage/statuspage-client";
import { reportHeartbeat } from "@/shared/integrations/statuspage/monitor";

/**
 * CRON API Endpoint: runs the recruitment self-test end-to-end (submit →
 * Discord → bot event → rollback) and reports the result to the Statuspage
 * "Recruitment" component.
 *
 * Schedule (vercel.json): 10 3 * * *  (daily at 03:10 UTC)
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEST_CHARACTER_NAME =
	process.env.STATUSPAGE_RECRUITMENT_TEST_CHARACTER_NAME || "Rankas";
const TEST_CHARACTER_REALM =
	process.env.STATUSPAGE_RECRUITMENT_TEST_REALM || "Dun Modr";

type Step = {
	step: string;
	ok: boolean;
	detail?: string;
};

/**
 * Busca el evento del bot para una aplicación con reintentos, porque
 * `publishRecruitmentBotEvent` se dispara en "fire and forget" desde submit.
 */
async function findBotEventId(
	applicationId: string,
	timeoutMs = 3000,
): Promise<string | null> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const { data } = await supabaseAdmin
			.from("recruitment_bot_events")
			.select("id, payload")
			.eq("type", "recruitment.application.created")
			.limit(50);

		const match = (data ?? []).find(
			(e: { payload?: { applicationId?: string } }) =>
				e.payload?.applicationId === applicationId,
		);
		if (match) return match.id;

		await new Promise((r) => setTimeout(r, 300));
	}
	return null;
}

export async function GET(req: Request) {
	const authError = requireCronAuth(req);
	if (authError) {
		return authError;
	}

	const pageId = process.env.STATUSPAGE_PAGE_ID;
	const apiKey = process.env.STATUSPAGE_API_KEY;
	const componentId = await getComponentId("reclutamiento");

	if (!pageId || !apiKey || !componentId) {
		console.error(
			"[check-recruitment] Statuspage env vars missing. Set STATUSPAGE_PAGE_ID, STATUSPAGE_API_KEY and a 'reclutamiento' key (web > Heartbeating).",
		);
		return NextResponse.json(
			{ error: "Statuspage not configured" },
			{ status: 503 },
		);
	}

	const steps: Step[] = [];
	let applicationId: string | null = null;
	let discordMessageId: string | null = null;
	let botEventId: string | null = null;
	let testChannelId: string | null = null;

	try {
		// 1. Canal de test configurado
		const { data: settings } = await supabaseAdmin
			.from("settings")
			.select("recruitment_test_channel_id")
			.eq("id", 1)
			.maybeSingle();

		testChannelId = settings?.recruitment_test_channel_id?.trim() || null;
		steps.push({
			step: "canal_test",
			ok: Boolean(testChannelId),
			detail: testChannelId ?? "Configura el canal de Discord de test",
		});

		// 2. Personaje (Rankas)
		let character: {
			id: string;
			name: string;
			realm: string;
			class_id: number;
			spec: string;
			level: number;
			user_id: string;
		} | null = null;

		if (testChannelId) {
			const { data } = await supabaseAdmin
				.from("bnet_characters")
				.select("id, name, realm, class_id, spec, level, user_id")
				.eq("name", TEST_CHARACTER_NAME)
				.eq("realm", TEST_CHARACTER_REALM)
				.maybeSingle();
			character = data;
		}

		steps.push({
			step: "personaje",
			ok: Boolean(character),
			detail: character
				? `${character.name} — ${character.realm}`
				: `No se encontró ${TEST_CHARACTER_NAME} — ${TEST_CHARACTER_REALM}`,
		});

		// 3. Respuestas válidas generadas a partir de las preguntas reales
		const answers: Record<string, string> = {};
		if (character) {
			const { data: questions } = await supabaseAdmin
				.from("recruitment_questions")
				.select("id, type, options")
				.order("order_index", { ascending: true });

			for (const q of questions ?? []) {
				if (
					(q.type === "select" || q.type === "multiselect") &&
					q.options?.length
				) {
					answers[q.id] = q.options[0];
				} else if (q.type === "number") {
					answers[q.id] = "1";
				} else {
					answers[q.id] =
						`Respuesta de prueba (self-test ${new Date().toISOString()})`;
				}
			}
		}

		// 4. Submit real vía el core compartido
		if (character && testChannelId) {
			const result = await submitApplicationCore({
				userId: character.user_id,
				selectedChar: {
					id: character.id,
					name: character.name,
					realm: character.realm,
				},
				answers,
				simulate: false,
				discordChannelId: testChannelId,
				internalAdmin: false,
				isTest: true,
			});

			if (!result.ok) {
				steps.push({ step: "submit", ok: false, detail: result.error });
			} else {
				applicationId = result.application.id;
				steps.push({ step: "submit", ok: true, detail: applicationId });
			}
		} else {
			steps.push({
				step: "submit",
				ok: false,
				detail: "Omitido: falta canal o personaje",
			});
		}

		// 5. Verifica que notify-apply guardó el id del mensaje de Discord
		if (applicationId) {
			const { data: appRow } = await supabaseAdmin
				.from("recruitment_applications")
				.select("id, discord_message_id")
				.eq("id", applicationId)
				.maybeSingle();

			discordMessageId = appRow?.discord_message_id ?? null;
		}

		steps.push({
			step: "mensaje_discord",
			ok: Boolean(discordMessageId),
			detail: discordMessageId ?? "No se generó discord_message_id",
		});

		// 6. Verifica el evento del bot
		if (applicationId) {
			botEventId = await findBotEventId(applicationId);
		}

		steps.push({
			step: "evento_bot",
			ok: Boolean(botEventId),
			detail: botEventId ?? "No se encontró el evento del bot",
		});

		// 7. Rollback: borra el mensaje de Discord
		if (discordMessageId && testChannelId) {
			const creds = await getGuildCredentials();
			const botToken = creds.discord_bot_token;

			if (botToken) {
				const delRes = await fetch(
					`https://discord.com/api/v10/channels/${testChannelId}/messages/${discordMessageId}`,
					{
						method: "DELETE",
						headers: { Authorization: `Bot ${botToken}` },
					},
				);
				const deleted = delRes.ok || delRes.status === 404;
				steps.push({
					step: "rollback_discord",
					ok: deleted,
					detail: `status ${delRes.status}`,
				});
			} else {
				steps.push({
					step: "rollback_discord",
					ok: false,
					detail: "Sin bot token para borrar",
				});
			}
		} else {
			steps.push({
				step: "rollback_discord",
				ok: false,
				detail: "Sin mensaje o sin canal para borrar",
			});
		}

		// 8. Rollback: borra respuestas, evento y aplicación
		if (applicationId) {
			await supabaseAdmin
				.from("application_answers")
				.delete()
				.eq("application_id", applicationId);
			if (botEventId) {
				await supabaseAdmin
					.from("recruitment_bot_events")
					.delete()
					.eq("id", botEventId);
			}
			await supabaseAdmin
				.from("recruitment_applications")
				.delete()
				.eq("id", applicationId);
			steps.push({
				step: "rollback_db",
				ok: true,
				detail: "aplicación, respuestas y evento eliminados",
			});
		} else {
			steps.push({
				step: "rollback_db",
				ok: false,
				detail: "Sin aplicación para borrar",
			});
		}

		const ok = steps.every((s) => s.ok);

		const report = await reportHeartbeat({
			checkKey: "reclutamiento",
			pageId,
			apiKey,
			componentId,
			ok,
			details: steps.map((s) => `${s.step}: ${s.detail ?? ""}`),
			incidentName: "Reclutamiento degradado",
		});

		const status = report.status;

		console.log(`[check-recruitment] ${ok ? "PASS" : "FAIL"} -> ${status}`);

		return NextResponse.json(
			{ ok, status, steps, statuspage: report.statuspage },
			{ status: report.statuspage.ok ? 200 : 502 },
		);
	} catch (err) {
		console.error("[check-recruitment] error:", err);

		// Rollback de emergencia si algo quedó a medias.
		if (applicationId) {
			try {
				await supabaseAdmin
					.from("application_answers")
					.delete()
					.eq("application_id", applicationId);
			} catch (rollbackError) {
				console.error(
					"[check-recruitment] rollback answers failed:",
					rollbackError,
				);
			}
			try {
				await supabaseAdmin
					.from("recruitment_applications")
					.delete()
					.eq("id", applicationId);
			} catch (rollbackError) {
				console.error(
					"[check-recruitment] rollback application failed:",
					rollbackError,
				);
			}
		}

		await reportHeartbeat({
			checkKey: "reclutamiento",
			pageId,
			apiKey,
			componentId,
			ok: false,
			details: ["Internal server error"],
			incidentName: "Reclutamiento degradado",
		}).catch(() => {});

		return NextResponse.json(
			{ ok: false, error: "Internal server error" },
			{ status: 500 },
		);
	}
}
