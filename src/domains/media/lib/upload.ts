// --- Upload Domain Helpers ---

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// MIME type → extension mapping for MIME-based fallback
const MIME_TO_EXT: Record<string, string> = {
	"image/jpeg": ".jpg",
	"image/png": ".png",
	"image/webp": ".webp",
	"image/gif": ".gif",
	"image/avif": ".avif",
	"image/svg+xml": ".svg",
	"application/pdf": ".pdf",
};

// Recognized extensions from filenames
const EXT_FROM_NAME: Record<string, string> = {
	".jpg": ".jpg",
	".jpeg": ".jpg",
	".png": ".png",
	".webp": ".webp",
	".gif": ".gif",
	".avif": ".avif",
	".svg": ".svg",
	".pdf": ".pdf",
};

export function getExtension(fileName: string, mimeType: string): string {
	// Try to extract extension from filename
	const lastDot = fileName.lastIndexOf(".");
	if (lastDot !== -1) {
		const ext = fileName.slice(lastDot).toLowerCase();
		const mapped = EXT_FROM_NAME[ext];
		if (mapped) return mapped;
	}

	// Fall back to MIME type → extension mapping
	const mimeExt = MIME_TO_EXT[mimeType];
	if (mimeExt) return mimeExt;

	return ".bin";
}

// Per-bucket MIME type allowlist
// V1: hardcoded; attachments allows PDFs, all others are images only
const IMAGE_MIMES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/avif",
	"image/svg+xml",
];

export const ALLOWED_MIME_TYPES_BY_BUCKET: Record<string, string[]> = {
	guild_assets: IMAGE_MIMES,
	"news-images": IMAGE_MIMES,
	image_boses_kills: IMAGE_MIMES,
	"weekly-vault": IMAGE_MIMES,
	roster_ranks_images: IMAGE_MIMES,
	feedback_attachments: [...IMAGE_MIMES, "application/pdf"],
};

export function generateStoragePath(_bucket: string, fileName: string): string {
	const ext = getExtension(fileName, "application/octet-stream");
	return `${crypto.randomUUID()}${ext}`;
}

export function validateFileType(
	bucket: string,
	mimeType: string,
): { valid: boolean; error?: string } {
	const allowed = ALLOWED_MIME_TYPES_BY_BUCKET[bucket];

	// Unknown buckets (user-created folders): allow common image + document types
	if (!allowed) {
		const DEFAULT_ALLOWED = [...IMAGE_MIMES, "application/pdf"];
		if (DEFAULT_ALLOWED.includes(mimeType)) {
			return { valid: true };
		}
		return {
			valid: false,
			error: `Tipo de archivo "${mimeType}" no permitido. Tipos aceptados: imágenes y PDF`,
		};
	}

	if (!allowed.includes(mimeType)) {
		return {
			valid: false,
			error: `Tipo de archivo no permitido. Tipos aceptados: ${allowed.join(", ")}`,
		};
	}

	return { valid: true };
}

export function validateFileSize(fileSize: number): {
	valid: boolean;
	error?: string;
} {
	if (!Number.isFinite(fileSize) || fileSize <= 0) {
		return {
			valid: false,
			error: "El archivo está vacío",
		};
	}

	if (fileSize > MAX_FILE_SIZE) {
		return {
			valid: false,
			error: `El archivo excede el tamaño máximo de 50 MB`,
		};
	}

	return { valid: true };
}
