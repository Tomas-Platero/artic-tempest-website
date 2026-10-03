// src/shared/lib/recruitment/submit-core.ts
// Session-less core of the recruitment application submission flow. Extracted
// from /api/recruitment/submit so both the HTTP route (with auth) and the cron
// self-test (service role) can reuse the exact same logic.
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { ACTIVE_RECRUITMENT_STATUSES } from "@/domains/recruitment/lib/application-status";
import { publishRecruitmentBotEvent } from "@/shared/lib/recruitment/bot-events";
import { resolveDiscordUserIdForApplication } from "@/shared/lib/recruitment/active-application";
import { notifyApplicationCore } from "@/shared/lib/recruitment/notify-apply-core";
import {
	resolveUserMembershipGate,
	MEMBERSHIP_REQUIRED_MESSAGE,
} from "@/shared/lib/recruitment/discord-membership";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 2;

export type SubmitApplicationParams = {
	userId: string;
	selectedChar: { id?: string; name: string; realm: string };
	answers: Record<string, unknown>;
	simulate?: boolean;
	discordChannelId?: string;
	internalAdmin?: boolean;
	/** Marks self-test/cron submissions so the bot skips the applicant DM. */
	isTest?: boolean;
};

export type SubmitApplicationResult =
	| { ok: true; application: { id: string; status: string } }
	| { ok: false; status: number; error: string };

export async function submitApplicationCore(
	params: SubmitApplicationParams,
): Promise<SubmitApplicationResult> {
	const {
		userId,
		selectedChar,
		answers,
		simulate = false,
		discordChannelId,
		internalAdmin = false,
		isTest = false,
	} = params;

	try {
		if (!selectedChar?.name || !selectedChar?.realm) {
			return {
				ok: false,
				status: 400,
				error: "Faltan datos del personaje",
			};
		}

		const selectedCharacterQuery = supabaseAdmin
			.from("bnet_characters")
			.select("id, name, realm, realm_slug, class_id, spec, level")
			.eq("user_id", userId);

		const { data: selectedCharacter, error: characterError } = selectedChar.id
			? await selectedCharacterQuery.eq("id", selectedChar.id).maybeSingle()
			: await selectedCharacterQuery
					.eq("name", selectedChar.name.trim())
					.eq("realm", selectedChar.realm.trim())
					.maybeSingle();

		if (characterError) {
			console.error(
				"Submit application core: character lookup failed:",
				characterError,
			);
			return {
				ok: false,
				status: 503,
				error: `No se pudo verificar el personaje (${characterError.message || "error de base de datos"}). Inténtalo de nuevo.`,
			};
		}
		if (!selectedCharacter) {
			return {
				ok: false,
				status: 400,
				error: "El personaje seleccionado no pertenece a tu cuenta",
			};
		}

		const normalizedName = selectedCharacter.name.trim();
		const normalizedRealm = selectedCharacter.realm.trim();

		if (
			normalizedName.length < 2 ||
			normalizedName.length > 32 ||
			normalizedRealm.length < 2 ||
			normalizedRealm.length > 64
		) {
			return {
				ok: false,
				status: 400,
				error: "Datos del personaje inválidos",
			};
		}

		if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
			return { ok: false, status: 400, error: "Respuestas inválidas" };
		}

		const { data: recruitmentQuestions } = await supabaseAdmin
			.from("recruitment_questions")
			.select("id, label, type, is_required, options")
			.order("order_index", { ascending: true });

		const questionMap = new Map(
			(recruitmentQuestions || []).map((q) => [q.id, q]),
		);

		const sanitizedAnswers: Array<{
			application_id: string;
			question_id: string;
			answer_text: string;
		}> = [];

		for (const [questionId, rawValue] of Object.entries(answers)) {
			const question = questionMap.get(questionId);

			if (!question) {
				return {
					ok: false,
					status: 400,
					error: "Hay una pregunta inválida en la solicitud",
				};
			}

			const answerText =
				typeof rawValue === "string"
					? rawValue.trim()
					: String(rawValue).trim();

			if (question.is_required && !answerText) {
				return {
					ok: false,
					status: 400,
					error: `La respuesta de "${question.label}" es obligatoria`,
				};
			}

			if (question.type === "select" && question.options?.length) {
				const allowed = new Set(question.options as string[]);
				if (answerText && !allowed.has(answerText)) {
					return {
						ok: false,
						status: 400,
						error: "Una respuesta seleccionada no es válida",
					};
				}
			}

			if (question.type === "multiselect" && question.options?.length) {
				const allowed = new Set(question.options as string[]);
				const values = answerText ? answerText.split(", ").filter(Boolean) : [];
				if (values.some((value) => !allowed.has(value))) {
					return {
						ok: false,
						status: 400,
						error: "Una opción múltiple no es válida",
					};
				}
			}

			if (
				question.type === "number" &&
				answerText &&
				Number.isNaN(Number(answerText))
			) {
				return {
					ok: false,
					status: 400,
					error: "Una respuesta numérica no es válida",
				};
			}

			if (answerText.length > 5000) {
				return {
					ok: false,
					status: 400,
					error: "Respuesta demasiado larga",
				};
			}

			sanitizedAnswers.push({
				application_id: "",
				question_id: questionId,
				answer_text: answerText,
			});
		}

		const missingRequired = (recruitmentQuestions || []).find(
			(q) =>
				q.is_required &&
				!sanitizedAnswers.some((a) => a.question_id === q.id && a.answer_text),
		);

		if (missingRequired) {
			return {
				ok: false,
				status: 400,
				error: `El campo requerido "${missingRequired.id}" no fue contestado`,
			};
		}

		// Policy gate. Discord offers no way to bypass a user's DM privacy, so an
		// applicant who shares no guild with the bot can never be notified: measured
		// on real notifications, 3/3 members received their DM and 0/4 non-members did.
		// This lives here rather than only in the page because a direct POST to the
		// submit endpoint must not be able to skip it.
		const gate = await resolveUserMembershipGate({ userId, isTest });

		if (!gate.allowed) {
			console.warn(
				`[Recruitment:Submit] Blocked submission for user ${userId}: ${gate.reason}`,
			);

			return {
				ok: false,
				status: 403,
				error: MEMBERSHIP_REQUIRED_MESSAGE,
			};
		}

		const recentApps = await supabaseAdmin
			.from("recruitment_applications")
			.select("id, created_at")
			.eq("user_id", userId)
			.gte(
				"created_at",
				new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString(),
			)
			.limit(MAX_SUBMISSIONS_PER_WINDOW);

		if (
			recentApps.data &&
			recentApps.data.length >= MAX_SUBMISSIONS_PER_WINDOW
		) {
			return {
				ok: false,
				status: 429,
				error: "Demasiados intentos. Espera unos minutos.",
			};
		}

		const { data: activeApps } = await supabaseAdmin
			.from("recruitment_applications")
			.select("id")
			.eq("user_id", userId)
			.in("status", [...ACTIVE_RECRUITMENT_STATUSES])
			.limit(1);

		if (activeApps && activeApps.length > 0) {
			return {
				ok: false,
				status: 400,
				error: "Ya tienes una solicitud activa",
			};
		}

		const { data: application, error: appError } = await supabaseAdmin
			.from("recruitment_applications")
			.insert({
				user_id: userId,
				character_name: normalizedName,
				character_realm: normalizedRealm,
				character_class: selectedCharacter.class_id || null,
				character_spec: selectedCharacter.spec || null,
				status: simulate === true && internalAdmin ? "simulated" : "pending",
			})
			.select()
			.single();

		if (appError) {
			if (appError.code === "23505") {
				return {
					ok: false,
					status: 400,
					error: "Ya tienes una solicitud activa",
				};
			}

			throw appError;
		}

		if (answers && Object.keys(answers).length > 0) {
			const answersToInsert = sanitizedAnswers.map((item) => ({
				...item,
				application_id: application.id,
			}));

			const { error: ansError } = await supabaseAdmin
				.from("application_answers")
				.insert(answersToInsert);

			if (ansError) {
				await supabaseAdmin
					.from("recruitment_applications")
					.delete()
					.eq("id", application.id);

				throw new Error(
					"No se pudieron guardar las respuestas. Solicitud cancelada.",
				);
			}
		}

		if (application.status !== "simulated") {
			const notifyResult = await notifyApplicationCore(
				application.id,
				discordChannelId,
			);

			if (!notifyResult.ok && notifyResult.reason !== "not_configured") {
				console.error("Discord notify failed:", notifyResult.error);
			}
		}

		if (application.status !== "simulated") {
			const applicantDiscordUserId = await resolveDiscordUserIdForApplication(
				application.id,
			);

			if (applicantDiscordUserId) {
				void publishRecruitmentBotEvent({
					type: "recruitment.application.created",
					applicationId: application.id,
					applicantDiscordUserId,
					characterName: normalizedName,
					characterRealm: normalizedRealm,
					status: application.status,
					...(isTest ? { isTest: true } : {}),
				});
			}
		}

		return { ok: true, application };
	} catch (error) {
		console.error("Submit application core error:", error);
		return {
			ok: false,
			status: 500,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
