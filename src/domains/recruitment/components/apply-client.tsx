"use client";

import { useEffect, useRef, useReducer } from "react";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Label } from "@/shared/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/ui/select";
import { Checkbox } from "@/shared/ui/checkbox";
import { Card, CardContent } from "@/shared/ui/card";
import {
	IconCheck,
	IconAlertCircle,
	IconLoader2,
	IconUserCode,
	IconArrowRight,
	IconArrowLeft,
} from "@/shared/ui/tabler-icons";
import { toast } from "sonner";
import { CharacterAvatar } from "@/shared/components/character-avatar";
import {
	getScrollBehavior,
	usePrefersReducedMotion,
} from "@/shared/lib/use-prefers-reduced-motion";
import { DISCORD_PUBLIC_INVITE_URL } from "@/shared/lib/discord-links";

/** Safe JSON parse that never throws — returns { ok, data } or { ok, error }. */
function tryParseJSON(
	raw: string,
): { ok: true; data: any } | { ok: false; error: unknown } {
	try {
		return { ok: true, data: JSON.parse(raw) };
	} catch (error) {
		return { ok: false, error };
	}
}

async function doSubmitApplication(data: {
	selectedChar: any;
	answers: Record<string, string>;
	simulate: boolean;
}): Promise<{ success: boolean; error?: string; alreadyActive?: boolean }> {
	try {
		const res = await fetch("/api/recruitment/submit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				selectedChar: data.selectedChar,
				answers: data.answers,
				simulate: data.simulate,
			}),
		});

		if (!res.ok) {
			const json = await res.json().catch(() => ({}));
			if (json.error === "Ya tienes una solicitud activa") {
				return { success: false, alreadyActive: true, error: json.error };
			}
			return {
				success: false,
				error: json.error || "Error desconocido al enviar. Revisa la consola.",
			};
		}

		return { success: true };
	} catch (err: any) {
		console.error("Error submitting application:", err);
		return {
			success: false,
			error: err.message || "Error al enviar la solicitud",
		};
	}
}

const STEPS = ["Personaje", "Preguntas", "Finalizar"];

type Question = {
	id: string;
	label: string;
	type: string;
	options?: string[];
	is_required: boolean;
	help_text?: string;
};

type Props = {
	user: any;
	characters: any[];
	questions: Question[];
	classConstants: any[];
	submissionStatus?: "pending" | "simulated";
	/** True when the applicant's Discord membership was confirmed against the guild. */
	discordVerified: boolean;
};

type WizardState = {
	step: number;
	selectedChar: any;
	answers: Record<string, string>;
	isSubmitting: boolean;
	isSuccess: boolean;
};

type WizardAction =
	| { type: "SET_STEP"; step: number }
	| { type: "SELECT_CHAR"; char: any }
	| { type: "SET_ANSWERS"; answers: Record<string, string> }
	| { type: "SET_ANSWER"; questionId: string; value: string }
	| { type: "SET_SUBMITTING"; isSubmitting: boolean }
	| { type: "SET_SUCCESS"; isSuccess: boolean }
	| { type: "RESET" };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
	switch (action.type) {
		case "SET_STEP":
			return { ...state, step: action.step };
		case "SELECT_CHAR":
			return { ...state, selectedChar: action.char };
		case "SET_ANSWERS":
			return { ...state, answers: action.answers };
		case "SET_ANSWER":
			return {
				...state,
				answers: { ...state.answers, [action.questionId]: action.value },
			};
		case "SET_SUBMITTING":
			return { ...state, isSubmitting: action.isSubmitting };
		case "SET_SUCCESS":
			return { ...state, isSuccess: action.isSuccess };
		case "RESET":
			return {
				step: 1,
				selectedChar: null,
				answers: {},
				isSubmitting: false,
				isSuccess: false,
			};
		default:
			return state;
	}
}

type UiDraftState = {
	showAllChars: boolean;
	acceptedRGPD: boolean;
	characterSearch: string;
	draftLoaded: boolean;
	hasDraft: boolean;
};

type UiDraftAction =
	| { type: "SET_SHOW_ALL_CHARS"; show: boolean }
	| { type: "SET_ACCEPTED_RGPD"; accepted: boolean }
	| { type: "SET_CHARACTER_SEARCH"; search: string }
	| { type: "SET_DRAFT_LOADED"; loaded: boolean }
	| { type: "SET_HAS_DRAFT"; hasDraft: boolean }
	| { type: "RESET" };

function uiDraftReducer(
	state: UiDraftState,
	action: UiDraftAction,
): UiDraftState {
	switch (action.type) {
		case "SET_SHOW_ALL_CHARS":
			return { ...state, showAllChars: action.show };
		case "SET_ACCEPTED_RGPD":
			return { ...state, acceptedRGPD: action.accepted };
		case "SET_CHARACTER_SEARCH":
			return { ...state, characterSearch: action.search };
		case "SET_DRAFT_LOADED":
			return { ...state, draftLoaded: action.loaded };
		case "SET_HAS_DRAFT":
			return { ...state, hasDraft: action.hasDraft };
		case "RESET":
			return {
				showAllChars: false,
				acceptedRGPD: false,
				characterSearch: "",
				draftLoaded: false,
				hasDraft: false,
			};
		default:
			return state;
	}
}

export function ApplyClient({
	user,
	characters,
	questions,
	classConstants,
	submissionStatus = "pending",
	discordVerified,
}: Props) {
	const router = useRouter();
	const draftKey = `recruitment-apply-draft:${user?.id ?? "anonymous"}`;
	const [wizard, dispatchWizard] = useReducer(wizardReducer, {
		step: 1,
		selectedChar: null,
		answers: {},
		isSubmitting: false,
		isSuccess: false,
	});
	const [uiDraft, dispatchUiDraft] = useReducer(uiDraftReducer, {
		showAllChars: false,
		acceptedRGPD: false,
		characterSearch: "",
		draftLoaded: false,
		hasDraft: false,
	});
	const { step, selectedChar, answers, isSubmitting, isSuccess } = wizard;
	const { showAllChars, acceptedRGPD, characterSearch, draftLoaded, hasDraft } =
		uiDraft;
	const prefersReducedMotion = usePrefersReducedMotion();
	const skipDraftSaveRef = useRef(false);

	const classMap = new Map();
	classConstants.forEach((c) => classMap.set(Number(c.key), c.value));

	const clearDraft = () => {
		skipDraftSaveRef.current = true;
		if (typeof window !== "undefined") {
			localStorage.removeItem(draftKey);
		}
		dispatchWizard({ type: "RESET" });
		dispatchUiDraft({ type: "RESET" });
	};

	useEffect(() => {
		if (typeof window === "undefined") return;

		const raw = localStorage.getItem(draftKey);
		if (!raw) {
			dispatchUiDraft({ type: "SET_DRAFT_LOADED", loaded: true });
			return;
		}

		const parseResult = tryParseJSON(raw);
		if (!parseResult.ok) {
			console.error("Error loading recruitment draft:", parseResult.error);
			localStorage.removeItem(draftKey);
			dispatchUiDraft({ type: "SET_DRAFT_LOADED", loaded: true });
			return;
		}

		const saved = parseResult.data;
		if (saved?.step) dispatchWizard({ type: "SET_STEP", step: saved.step });
		if (saved?.selectedChar)
			dispatchWizard({ type: "SELECT_CHAR", char: saved.selectedChar });
		if (saved?.answers)
			dispatchWizard({ type: "SET_ANSWERS", answers: saved.answers });
		if (typeof saved?.acceptedRGPD === "boolean") {
			dispatchUiDraft({
				type: "SET_ACCEPTED_RGPD",
				accepted: saved.acceptedRGPD,
			});
		}
		if (typeof saved?.characterSearch === "string") {
			dispatchUiDraft({
				type: "SET_CHARACTER_SEARCH",
				search: saved.characterSearch,
			});
		}
		if (typeof saved?.showAllChars === "boolean") {
			dispatchUiDraft({
				type: "SET_SHOW_ALL_CHARS",
				show: saved.showAllChars,
			});
		}
		dispatchUiDraft({ type: "SET_HAS_DRAFT", hasDraft: true });
		dispatchUiDraft({ type: "SET_DRAFT_LOADED", loaded: true });
	}, [draftKey]);

	useEffect(() => {
		if (!draftLoaded || isSuccess) return;

		if (skipDraftSaveRef.current) {
			skipDraftSaveRef.current = false;
			return;
		}

		const draft = {
			step,
			selectedChar,
			answers,
			acceptedRGPD,
			characterSearch,
			showAllChars,
		};

		localStorage.setItem(draftKey, JSON.stringify(draft));
		dispatchUiDraft({ type: "SET_HAS_DRAFT", hasDraft: true });
	}, [
		acceptedRGPD,
		answers,
		characterSearch,
		draftKey,
		draftLoaded,
		isSuccess,
		selectedChar,
		showAllChars,
		step,
	]);

	const filteredCharacters = (() => {
		const term = characterSearch.trim().toLowerCase();

		const matched = term
			? characters.filter((char) => {
					const name = char.name?.toLowerCase?.() ?? "";
					const realm = char.realm?.toLowerCase?.() ?? "";
					const spec = char.spec?.toLowerCase?.() ?? "";
					return (
						name.includes(term) || realm.includes(term) || spec.includes(term)
					);
				})
			: characters;

		if (term || showAllChars) return matched;

		return matched.slice(0, 6);
	})();

	const handleNext = () => {
		if (step === 1 && !selectedChar) {
			toast.error("Debes seleccionar un personaje");
			return;
		}
		dispatchWizard({ type: "SET_STEP", step: step + 1 });
		window.scrollTo({
			top: 0,
			behavior: getScrollBehavior(prefersReducedMotion),
		});
	};

	const handleBack = () => {
		dispatchWizard({ type: "SET_STEP", step: step - 1 });
		window.scrollTo({
			top: 0,
			behavior: getScrollBehavior(prefersReducedMotion),
		});
	};

	const handleSubmit = async () => {
		// Enforce required fields
		const missing = questions.find((q) => q.is_required && !answers[q.id]);
		if (missing) {
			toast.error(`El campo "${missing.label}" es obligatorio`);
			return;
		}

		dispatchWizard({ type: "SET_SUBMITTING", isSubmitting: true });

		const result = await doSubmitApplication({
			selectedChar,
			answers,
			simulate: submissionStatus === "simulated",
		});

		dispatchWizard({ type: "SET_SUBMITTING", isSubmitting: false });

		if (result.success) {
			dispatchWizard({ type: "SET_SUCCESS", isSuccess: true });
			clearDraft();
			toast.success("Solicitud enviada correctamente");
		} else if (result.alreadyActive) {
			toast.error(result.error!);
			router.push("/reclutamiento/apply-en-curso");
		} else {
			toast.error("Error al enviar la solicitud", {
				description: result.error,
			});
		}
	};

	if (isSuccess) {
		return <ApplySuccessState onGoHome={() => router.push("/")} />;
	}

	return (
		<LazyMotion features={domAnimation}>
			<div className="space-y-8">
				<DiscordCheckBanner verified={discordVerified} />

				<DraftControlsBanner
					hasDraft={hasDraft}
					onSaveDraft={() => {
						if (typeof window !== "undefined") {
							localStorage.setItem(
								draftKey,
								JSON.stringify({
									step,
									selectedChar,
									answers,
									acceptedRGPD,
									characterSearch,
									showAllChars,
								}),
							);
						}
						dispatchUiDraft({ type: "SET_HAS_DRAFT", hasDraft: true });
						toast.success("Progreso guardado");
					}}
					onReset={() => {
						if (
							window.confirm("¿Empezar de nuevo y borrar el borrador guardado?")
						) {
							clearDraft();
							toast.success("Formulario reiniciado");
						}
					}}
				/>

				<ApplyStepProgress step={step} />

				<AnimatePresence mode="wait">
					{step === 1 && (
						<ApplyStepOneSection
							characters={characters}
							characterSearch={characterSearch}
							filteredCharacters={filteredCharacters}
							selectedChar={selectedChar}
							showAllChars={showAllChars}
							onSearchChange={(value) =>
								dispatchUiDraft({ type: "SET_CHARACTER_SEARCH", search: value })
							}
							onSelectChar={(char) =>
								dispatchWizard({ type: "SELECT_CHAR", char })
							}
							onShowAllChars={() =>
								dispatchUiDraft({ type: "SET_SHOW_ALL_CHARS", show: true })
							}
							onNext={handleNext}
						/>
					)}

					{step === 2 && (
						<ApplyStepTwoSection
							questions={questions}
							answers={answers}
							onSetAnswer={(questionId, value) =>
								dispatchWizard({ type: "SET_ANSWER", questionId, value })
							}
							onBack={handleBack}
							onNext={handleNext}
						/>
					)}

					{step === 3 && selectedChar && (
						<ApplyStepThreeSection
							selectedChar={selectedChar}
							className={classMap.get(selectedChar.class_id)}
							acceptedRGPD={acceptedRGPD}
							isSubmitting={isSubmitting}
							onBack={handleBack}
							onSubmit={() => void handleSubmit()}
							onToggleRgpd={(value) =>
								dispatchUiDraft({ type: "SET_ACCEPTED_RGPD", accepted: value })
							}
						/>
					)}
				</AnimatePresence>
			</div>
		</LazyMotion>
	);
}

/**
 * Makes the Discord requirement visible while filling the form, instead of it being
 * an invisible precondition: the applicant sees that membership was checked.
 *
 * `verified: false` means the guild could not be reached and the gate failed open.
 * It is shown as such rather than hidden, because the applicant is then the one who
 * may end up unreachable.
 */
function DiscordCheckBanner({ verified }: { verified: boolean }) {
	return (
		<div
			className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border ${
				verified
					? "border-emerald-500/20 bg-emerald-500/[0.06]"
					: "border-amber-500/20 bg-amber-500/[0.06]"
			}`}
		>
			<div className="flex items-start gap-3">
				{verified ? (
					<IconCheck className="size-4 mt-0.5 shrink-0 text-emerald-400" />
				) : (
					<IconAlertCircle className="size-4 mt-0.5 shrink-0 text-amber-400" />
				)}
				<div>
					<p className="text-sm font-bold text-white">
						{verified
							? "Estás en el Discord de Artic Tempest"
							: "No hemos podido comprobar tu Discord"}
					</p>
					<p className="text-xs text-zinc-400">
						{verified
							? "Es el canal por el que un oficial se pondrá en contacto contigo para la entrevista."
							: "Para que un oficial pueda contactarte es obligatorio estar en el servidor. Entra y vuelve a cargar esta página."}
					</p>
				</div>
			</div>
			{!verified && (
				<Button asChild variant="outline" className="rounded-xl shrink-0">
					<a
						href={DISCORD_PUBLIC_INVITE_URL}
						target="_blank"
						rel="noopener noreferrer"
					>
						Entrar al servidor
					</a>
				</Button>
			)}
		</div>
	);
}

function ApplySuccessState({ onGoHome }: { onGoHome: () => void }) {
	const prefersReducedMotion = usePrefersReducedMotion();

	return (
		<LazyMotion features={domAnimation}>
			<m.div
				initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				className="bg-zinc-950 border border-emerald-500/20 rounded-3xl p-12 text-center"
			>
				<div className="size-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
					<IconCheck className="size-10" />
				</div>
				<h2 className="text-3xl font-semibold text-white mb-4 uppercase">
					¡SOLICITUD RECIBIDA!
				</h2>
				<p className="text-zinc-400 max-w-sm mx-auto mb-8">
					Tu aplicación ha sido enviada a los oficiales de Artic Tempest.
					Revisaremos tu perfil y nos pondremos en contacto contigo pronto.
				</p>
				<div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
					<Button asChild variant="outline" className="rounded-xl">
						<Link href="/reclutamiento/apply-en-curso">Revisar mi Apply</Link>
					</Button>
					<Button asChild className="rounded-xl">
						<a
							href={DISCORD_PUBLIC_INVITE_URL}
							target="_blank"
							rel="noopener noreferrer"
						>
							Unirme al Discord
						</a>
					</Button>
				</div>
				<Button
					variant="ghost"
					className="rounded-xl text-zinc-400 hover:text-white"
					onClick={onGoHome}
				>
					Volver a inicio
				</Button>
			</m.div>
		</LazyMotion>
	);
}

function DraftControlsBanner({
	hasDraft,
	onSaveDraft,
	onReset,
}: {
	hasDraft: boolean;
	onSaveDraft: () => void;
	onReset: () => void;
}) {
	return (
		<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
			<div>
				<p className="text-sm font-bold text-white">
					Tu progreso se guarda en este dispositivo
				</p>
				<p className="text-xs text-zinc-500">
					Puedes volver más tarde al mismo punto o empezar desde cero cuando
					quieras.
				</p>
			</div>
			<div className="flex items-center gap-2">
				{hasDraft && (
					<span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10">
						Borrador guardado
					</span>
				)}
				<Button
					type="button"
					variant="outline"
					className="rounded-xl border-white/10 bg-white/5"
					onClick={onSaveDraft}
				>
					Guardar progreso
				</Button>
				<Button
					type="button"
					variant="ghost"
					className="rounded-xl text-zinc-400 hover:text-white"
					onClick={onReset}
				>
					Empezar de nuevo
				</Button>
			</div>
		</div>
	);
}

function ApplyStepOneSection({
	characters,
	characterSearch,
	filteredCharacters,
	selectedChar,
	showAllChars,
	onSearchChange,
	onSelectChar,
	onShowAllChars,
	onNext,
}: {
	characters: any[];
	characterSearch: string;
	filteredCharacters: any[];
	selectedChar: any;
	showAllChars: boolean;
	onSearchChange: (value: string) => void;
	onSelectChar: (char: any) => void;
	onShowAllChars: () => void;
	onNext: () => void;
}) {
	const prefersReducedMotion = usePrefersReducedMotion();

	return (
		<m.div
			key="step1"
			initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }}
			animate={{ opacity: 1, x: 0 }}
			exit={prefersReducedMotion ? undefined : { opacity: 0, x: -20 }}
			className="space-y-6"
		>
			<div className="space-y-4">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<Label className="text-lg font-bold">
						Selecciona tu personaje principal
					</Label>
					{characters.length > 5 && (
						<div className="relative w-full sm:w-64">
							<Input
								placeholder="Buscar personaje..."
								className="bg-zinc-900/50 border-zinc-800 text-xs h-9 rounded-lg"
								value={characterSearch}
								onChange={(e) => onSearchChange(e.target.value)}
							/>
						</div>
					)}
				</div>
				{characters.length > 0 ? (
					<div className="space-y-4">
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
							{filteredCharacters.map((char) => (
								<Card
									key={char.id}
									className={`char-card cursor-pointer transition-colors border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900/60 ${selectedChar?.id === char.id ? "border-primary ring-1 ring-primary/50 bg-primary/5" : ""}`}
									onClick={() => onSelectChar(char)}
								>
									<CardContent className="p-3 flex items-center gap-3">
										<CharacterAvatar
											name={char.name}
											realm={char.realm}
											className="border border-white/5 shrink-0"
											size={40}
										/>
										<div className="flex-1 min-w-0">
											<p className="font-bold text-sm text-white truncate">
												{char.name}
											</p>
											<p className="text-[10px] text-zinc-500 truncate">
												{char.realm} · Lvl {char.level}
											</p>
										</div>
										<div
											className={`size-4 rounded-full border flex items-center justify-center shrink-0 ${selectedChar?.id === char.id ? "bg-primary border-primary" : "border-zinc-700"}`}
										>
											{selectedChar?.id === char.id && (
												<IconCheck className="size-2.5 text-black" />
											)}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
						{!showAllChars && !characterSearch && characters.length > 6 && (
							<button
								type="button"
								onClick={onShowAllChars}
								className="w-full py-3 rounded-xl border border-dashed border-zinc-800 text-zinc-500 text-xs font-bold uppercase tracking-widest hover:bg-white/5 hover:text-zinc-300 transition-colors"
							>
								Ver todos los personajes ({characters.length})
							</button>
						)}
						{filteredCharacters.length === 0 && (
							<div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center">
								<p className="text-zinc-300 font-bold mb-1">
									No hay personajes que coincidan
								</p>
								<p className="text-xs text-zinc-500">
									Prueba con otro nombre, reino o especialización.
								</p>
							</div>
						)}
					</div>
				) : (
					<div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center">
						<IconAlertCircle className="size-10 text-orange-400 mx-auto mb-4" />
						<p className="text-zinc-300 font-bold mb-2">
							No tienes personajes vinculados
						</p>
						<p className="text-sm text-zinc-500 mb-6">
							Debes vincular tu cuenta de Battle.net en tu cuenta para poder
							aplicar.
						</p>
						<Button variant="outline" asChild>
							<Link href="/mis-personajes">Ir a mis personajes</Link>
						</Button>
					</div>
				)}
			</div>
			<div className="flex justify-end pt-4">
				<Button
					size="xl"
					className="rounded-xl px-10 group"
					onClick={onNext}
					disabled={!selectedChar}
				>
					Siguiente
					<IconArrowRight className="size-5 ml-2 group-hover:translate-x-1 transition-transform" />
				</Button>
			</div>
		</m.div>
	);
}

function ApplyStepTwoSection({
	questions,
	answers,
	onSetAnswer,
	onBack,
	onNext,
}: {
	questions: Question[];
	answers: Record<string, string>;
	onSetAnswer: (questionId: string, value: string) => void;
	onBack: () => void;
	onNext: () => void;
}) {
	const prefersReducedMotion = usePrefersReducedMotion();

	return (
		<m.div
			key="step2"
			initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }}
			animate={{ opacity: 1, x: 0 }}
			exit={prefersReducedMotion ? undefined : { opacity: 0, x: -20 }}
			className="space-y-8"
		>
			{questions.map((q) => (
				<QuestionField
					key={q.id}
					question={q}
					value={answers[q.id] || ""}
					onSetAnswer={onSetAnswer}
				/>
			))}
			<div className="flex justify-between pt-4">
				<Button
					variant="ghost"
					className="rounded-xl px-10 text-zinc-500 hover:text-white"
					onClick={onBack}
				>
					<IconArrowLeft className="size-5 mr-2" />
					Atrás
				</Button>
				<Button size="xl" className="rounded-xl px-10 group" onClick={onNext}>
					Siguiente
					<IconArrowRight className="size-5 ml-2 group-hover:translate-x-1 transition-transform" />
				</Button>
			</div>
		</m.div>
	);
}

function QuestionField({
	question,
	value,
	onSetAnswer,
}: {
	question: Question;
	value: string;
	onSetAnswer: (questionId: string, value: string) => void;
}) {
	return (
		<div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-500">
			<div className="space-y-1">
				<Label className="text-base font-bold text-zinc-200">
					{question.label}
					{question.is_required && (
						<span className="text-blue-500 ml-1">*</span>
					)}
				</Label>
				{question.help_text && (
					<p className="text-xs text-zinc-500 italic">{question.help_text}</p>
				)}
			</div>
			{question.type === "text" && (
				<Input
					className="bg-zinc-950/40 border-zinc-800 text-white h-12 rounded-xl focus:border-blue-500/50"
					placeholder="Escribe tu respuesta..."
					value={value}
					onChange={(e) => onSetAnswer(question.id, e.target.value)}
					aria-required={question.is_required}
				/>
			)}
			{question.type === "number" && (
				<Input
					type="number"
					className="bg-zinc-950/40 border-zinc-800 text-white h-12 rounded-xl focus:border-blue-500/50"
					placeholder="Ej: 25"
					value={value}
					onChange={(e) => onSetAnswer(question.id, e.target.value)}
					aria-required={question.is_required}
				/>
			)}
			{question.type === "textarea" && (
				<Textarea
					className="bg-zinc-950/40 border-zinc-800 text-white min-h-[120px] rounded-xl focus:border-blue-500/50"
					placeholder="Danos detalles..."
					value={value}
					onChange={(e) => onSetAnswer(question.id, e.target.value)}
					aria-required={question.is_required}
				/>
			)}
			{question.type === "boolean" && (
				<button
					type="button"
					className="flex items-center gap-3 p-4 rounded-xl bg-zinc-950/40 border border-zinc-800 cursor-pointer"
					onClick={() => onSetAnswer(question.id, value === "Sí" ? "No" : "Sí")}
				>
					<Checkbox
						id={`q-${question.id}`}
						checked={value === "Sí"}
						onCheckedChange={(val) =>
							onSetAnswer(question.id, val ? "Sí" : "No")
						}
					/>
					<label
						htmlFor={`q-${question.id}`}
						className="text-sm font-medium text-zinc-300 cursor-pointer"
					>
						Acepto / Sí
					</label>
				</button>
			)}
			{question.type === "select" && (
				<Select
					value={value}
					onValueChange={(val) => onSetAnswer(question.id, val)}
				>
					<SelectTrigger className="bg-zinc-950/40 border-zinc-800 text-white h-12 rounded-xl focus:border-blue-500/50">
						<SelectValue placeholder="Selecciona una opción" />
					</SelectTrigger>
					<SelectContent className="bg-zinc-950 border-zinc-800 text-white">
						{question.options?.map((opt: any) => (
							<SelectItem
								key={opt}
								value={opt}
								className="focus:bg-white/5 focus:text-white"
							>
								{opt}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			{question.type === "multiselect" && (
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{question.options?.map((opt: any) => {
						const current = value.split(", ").filter(Boolean);
						const isChecked = current.includes(opt);
						return (
							<button
								type="button"
								key={opt}
								className={`flex items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer ${isChecked ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-zinc-950/20 border-zinc-800 text-zinc-500"}`}
								onClick={() => {
									const next = isChecked
										? current.filter((x) => x !== opt)
										: [...current, opt];
									onSetAnswer(question.id, next.join(", "));
								}}
							>
								<Checkbox checked={isChecked} />
								<span className="text-sm">{opt}</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

function ApplyStepThreeSection({
	selectedChar,
	className,
	acceptedRGPD,
	isSubmitting,
	onBack,
	onSubmit,
	onToggleRgpd,
}: {
	selectedChar: any;
	className: string;
	acceptedRGPD: boolean;
	isSubmitting: boolean;
	onBack: () => void;
	onSubmit: () => void;
	onToggleRgpd: (value: boolean) => void;
}) {
	const prefersReducedMotion = usePrefersReducedMotion();
	return (
		<m.div
			key="step3"
			initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }}
			animate={{ opacity: 1, x: 0 }}
			exit={prefersReducedMotion ? undefined : { opacity: 0, x: -20 }}
			className="space-y-8"
		>
			<div className="space-y-6">
				<div className="p-8 rounded-3xl bg-blue-600/5 border border-blue-500/20">
					<h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-3 italic">
						<IconUserCode className="size-6 text-blue-500" />
						Resumen de tu aplicación
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
						<div className="space-y-4">
							<p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
								Personaje
							</p>
							<div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
								<CharacterAvatar
									name={selectedChar.name}
									realm={selectedChar.realm}
									className="shadow-2xl rounded-xl"
									size={56}
								/>
								<div>
									<p className="text-lg font-semibold text-white leading-tight">
										{selectedChar.name}
									</p>
									<p className="text-[10px] text-zinc-400 font-medium uppercase">
										{selectedChar.spec || "Unknown"} {className}
									</p>
									<p className="text-[10px] text-xs mt-1 text-zinc-500">
										{selectedChar.realm}
									</p>
								</div>
							</div>
						</div>
						<div className="space-y-4">
							<p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
								Estado
							</p>
							<div className="bg-white/5 p-4 rounded-2xl border border-white/5">
								<p className="text-sm text-zinc-300">
									Al pulsar enviar, tu perfil de **Raider.io** se vinculará
									automáticamente para que los oficiales revisen tu progreso y
									actividad.
								</p>
							</div>
						</div>
					</div>
				</div>
				<div className="flex items-start gap-3 p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors group relative overflow-hidden">
					<div className="shrink-0 pt-0.5">
						<Checkbox
							id="rgpd-apply"
							checked={acceptedRGPD}
							onCheckedChange={(val) => onToggleRgpd(!!val)}
							className="size-5 rounded border-white/20 bg-zinc-950 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 cursor-pointer"
						/>
					</div>
					<Label
						htmlFor="rgpd-apply"
						className="text-xs text-white/50 leading-relaxed cursor-pointer group-hover:text-white/70 transition-colors flex-1 select-none block"
					>
						He leído y acepto la{" "}
						<Link
							href="/privacidad"
							target="_blank"
							className="text-blue-400 hover:underline font-bold"
						>
							política de privacidad
						</Link>{" "}
						y doy mi consentimiento para el tratamiento de mis datos personales
						para la gestión de mi solicitud de reclutamiento.
					</Label>
				</div>
			</div>
			<div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4">
				<Button
					variant="ghost"
					className="rounded-xl px-10 text-zinc-500 hover:text-white order-2 sm:order-1"
					onClick={onBack}
					disabled={isSubmitting}
				>
					<IconArrowLeft className="size-5 mr-2" />
					Atrás
				</Button>
				<Button
					size="xl"
					className="rounded-xl px-8 sm:px-12 font-semibold uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/20 disabled:opacity-40 disabled:grayscale order-1 sm:order-2 w-full sm:w-auto text-xs sm:text-base"
					onClick={onSubmit}
					disabled={isSubmitting || !acceptedRGPD}
				>
					{isSubmitting ? (
						<>
							<IconLoader2 className="size-5 mr-2 animate-spin" />
							Enviando…
						</>
					) : (
						"Enviar Aplicación"
					)}
				</Button>
			</div>
		</m.div>
	);
}

function ApplyStepProgress({ step }: { step: number }) {
	return (
		<div className="flex items-center gap-2 sm:gap-4 mb-8 overflow-hidden">
			{STEPS.map((label, index) => {
				const stepNumber = index + 1;
				const active = step >= stepNumber;

				return (
					<div key={label} className="contents">
						<div
							className={`flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest shrink-0 ${active ? "text-blue-500" : "text-zinc-600"}`}
						>
							<span
								className={`size-6 rounded-full shrink-0 flex items-center justify-center text-[10px] ${active ? "bg-blue-500 text-black" : "bg-zinc-800 text-zinc-500"}`}
							>
								{stepNumber}
							</span>
							<span className="hidden sm:inline">{label}</span>
						</div>
						{stepNumber < STEPS.length && (
							<div className="h-px bg-zinc-800 flex-1 min-w-[20px]" />
						)}
					</div>
				);
			})}
		</div>
	);
}
