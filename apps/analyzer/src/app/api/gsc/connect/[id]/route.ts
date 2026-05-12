// OAuth start: redirect the user to Google's consent screen.
// State carries the clientId so the callback knows which Client to attach to.

import { NextResponse } from "next/server";
import { buildAuthUrl, isGscConfigured } from "@/lib/gsc";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
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
	const url = buildAuthUrl(id);
	return NextResponse.redirect(url);
}
