import { NextRequest, NextResponse } from "next/server";
import {
	exchangeCodeForTokens,
	getAccessibleResources,
	resolveRedirectUri,
} from "@/shared/lib/jira/oauth";
import { saveTokens } from "@/shared/lib/jira/token-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
	const { searchParams } = req.nextUrl;
	const code = searchParams.get("code");
	const state = searchParams.get("state");
	const error = searchParams.get("error");
	const cookieState = req.cookies.get("jira_oauth_state")?.value;

	if (error) {
		return htmlResponse(`Error de OAuth: ${error}`, 400);
	}
	if (!code || !state || !cookieState || state !== cookieState) {
		return htmlResponse("Estado OAuth inválido.", 400);
	}

	try {
		const redirectUri = resolveRedirectUri(req.nextUrl.origin);
		const tokens = await exchangeCodeForTokens(code, redirectUri);

		if (!tokens.refresh_token) {
			return htmlResponse(
				"No se recibió refresh token (falta el scope offline_access).",
				500,
			);
		}

		const resources = await getAccessibleResources(tokens.access_token);
		const cloudId = resources[0]?.id;
		if (!cloudId) {
			return htmlResponse("No se encontró ningún recurso Jira accesible.", 500);
		}

		await saveTokens({
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			tokenType: tokens.token_type ?? "Bearer",
			expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
			cloudId,
		});

		const res = htmlResponse(
			"Jira OAuth conectado correctamente. Ya puedes cerrar esta página.",
			200,
		);
		res.cookies.delete("jira_oauth_state");
		return res;
	} catch (err) {
		console.error("Jira OAuth callback error:", err);
		return htmlResponse(
			`Fallo al completar OAuth: ${(err as Error).message}`,
			500,
		);
	}
}

function htmlResponse(message: string, status: number) {
	return new NextResponse(
		`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Jira OAuth</title></head><body style="font-family:system-ui;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><p style="max-width:32rem;text-align:center;line-height:1.6">${message}</p></body></html>`,
		{
			status,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		},
	);
}
