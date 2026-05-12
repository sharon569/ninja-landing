// OAuth start (global): redirect the user to Google's consent screen.
// No clientId in state — there's a single agency-wide GscAccount.

import { NextResponse } from "next/server";
import { buildAuthUrl, isGscConfigured } from "@/lib/gsc";

export async function GET() {
	if (!isGscConfigured()) {
		return NextResponse.json(
			{
				error: "gsc_not_configured",
				message:
					"GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT are not set in .env",
			},
			{ status: 503 },
		);
	}
	// Random nonce as state (CSRF protection only — no clientId encoded).
	const state = crypto.randomUUID();
	const url = buildAuthUrl(state);
	return NextResponse.redirect(url);
}
