import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { getAuthzSnapshot } from "@/shared/auth/authz";
import { getAppPermission } from "@/shared/auth/permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = process.env.RECRUITMENT_ATTACHMENTS_BUCKET || "attachments";
const SIGNED_TTL_SECONDS =
	parseInt(process.env.RECRUITMENT_ATTACHMENTS_SIGNED_TTL || "", 10) || 86400; // default 24h
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
// Tipos que el navegador puede renderizar como documento activo: vector de XSS
// si el objeto acaba servido desde el dominio de storage.
const BLOCKED_CONTENT_TYPES = new Set([
	"text/html",
	"application/xhtml+xml",
	"image/svg+xml",
	"text/javascript",
	"application/javascript",
]);

/**
 * Solo el solicitante dueño de la aplicación o el staff con permiso de
 * reclutamiento pueden subir adjuntos.
 */
async function canUploadToApplication(
	userId: string,
	applicationId: string,
	session: Awaited<ReturnType<typeof auth>>,
): Promise<boolean> {
	const { data: application } = await supabaseAdmin
		.from("recruitment_applications")
		.select("user_id")
		.eq("id", applicationId)
		.maybeSingle();

	if (!application) return false;
	if (application.user_id === userId) return true;

	const authz = await getAuthzSnapshot(session as NonNullable<typeof session>);
	const roleLevel = authz.roleSlug ?? session?.user?.roleLevel ?? "invitado";
	const { canEdit } = await getAppPermission(roleLevel, "settings-recruitment");

	return canEdit;
}

export async function POST(req: Request) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "No autorizado" }, { status: 401 });
		}

		const form = await req.formData();
		const file = form.get("file") as File | null;
		const applicationId = (form.get("applicationId") as string) || "";

		if (!file) {
			return NextResponse.json({ error: "Falta fichero" }, { status: 400 });
		}

		if (file.size === 0) {
			return NextResponse.json({ error: "El fichero está vacío" }, { status: 400 });
		}

		if (file.size > MAX_FILE_BYTES) {
			return NextResponse.json(
				{ error: "El fichero supera los 10 MB" },
				{ status: 413 },
			);
		}

		if (BLOCKED_CONTENT_TYPES.has((file.type || "").toLowerCase())) {
			return NextResponse.json(
				{ error: "Tipo de fichero no permitido" },
				{ status: 415 },
			);
		}

		if (!applicationId) {
			return NextResponse.json(
				{ error: "Falta applicationId" },
				{ status: 400 },
			);
		}

		if (!(await canUploadToApplication(session.user.id, applicationId, session))) {
			return NextResponse.json({ error: "Prohibido" }, { status: 403 });
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const timestamp = Date.now();
		const safeName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
		// Sanitize applicationId to prevent path traversal
		const safeAppId = (applicationId || "anon")
			.replace(/[^a-zA-Z0-9_-]/g, "_")
			.slice(0, 64);
		const path = `recruitment/${safeAppId}/${timestamp}-${safeName}`;

		const { error: uploadError } = await supabaseAdmin.storage
			.from(BUCKET)
			.upload(path, buffer, { contentType: file.type, upsert: false });

		if (uploadError) {
			console.error("[Uploads] Supabase upload error:", uploadError);
			return NextResponse.json({ error: "Upload failed" }, { status: 500 });
		}

		// Generate a signed URL so access can be controlled. We also return the raw storage path
		// so callers can request fresh signed URLs later if needed.
		const { data: signedData, error: signedError } = await supabaseAdmin.storage
			.from(BUCKET)
			.createSignedUrl(path, SIGNED_TTL_SECONDS);

		if (signedError) {
			console.error("[Uploads] Supabase createSignedUrl error:", signedError);
			// Fallback to public URL if signed URL creation fails
			const { data: pub } = supabaseAdmin.storage
				.from(BUCKET)
				.getPublicUrl(path);
			const publicUrl = pub?.publicUrl || "";
			return NextResponse.json({
				url: publicUrl,
				name: file.name,
				contentType: file.type,
				path,
			});
		}

		const signedUrl = signedData?.signedUrl || "";
		const expiresAt = new Date(
			Date.now() + SIGNED_TTL_SECONDS * 1000,
		).toISOString();

		return NextResponse.json({
			url: signedUrl,
			name: file.name,
			contentType: file.type,
			path,
			expiresAt,
		});
	} catch (err: any) {
		console.error("[Uploads] Error:", err);
		return NextResponse.json(
			{ error: err.message || "Error interno" },
			{ status: 500 },
		);
	}
}
