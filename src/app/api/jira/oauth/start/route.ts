import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ensureAdmin } from "@/shared/auth/permissions";
import {
	buildAuthorizationUrl,
	resolveRedirectUri,
} from "@/shared/lib/jira/oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
	// El flujo guarda tokens de la organización: solo administradores pueden iniciarlo.
	try {
		await ensureAdmin();
	} catch (error) {
		const status = (error as { status?: number })?.status ?? 403;
		return NextResponse.json({ error: "Prohibido" }, { status });
	}

	const state = randomUUID();
	const redirectUri = resolveRedirectUri(req.nextUrl.origin);
	const url = buildAuthorizationUrl(redirectUri, state);

	const res = NextResponse.redirect(url);
	res.cookies.set("jira_oauth_state", state, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		maxAge: 60 * 10,
		path: "/",
	});
	return res;
}
