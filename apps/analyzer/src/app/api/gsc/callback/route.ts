// OAuth callback: receive ?code= ?state=, exchange for tokens, persist
// GscConnection, redirect back to the client's Search Console tab.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeCode, emailFromIdToken } from "@/lib/gsc";

export async function GET(req: Request) {
	const u = new URL(req.url);
	const code = u.searchParams.get("code");
	const state = u.searchParams.get("state");          // clientId
	const errorParam = u.searchParams.get("error");

	if (errorParam) {
		return NextResponse.redirect(
			new URL(
				`/clients/${state}/search?gsc_error=${encodeURIComponent(errorParam)}`,
				u.origin,
			),
		);
	}
	if (!code || !state) {
		return NextResponse.json(
			{ error: "missing_params", message: "Expected ?code and ?state from Google." },
			{ status: 400 },
		);
	}

	const client = await db.client.findUnique({ where: { id: state } });
	if (!client) {
		return NextResponse.json(
			{ error: "client_not_found", message: `No analyzer client with id ${state}` },
			{ status: 404 },
		);
	}

	let tokens;
	try {
		tokens = await exchangeCode(code);
	} catch (err) {
		return NextResponse.redirect(
			new URL(
				`/clients/${state}/search?gsc_error=${encodeURIComponent(
					"token_exchange_failed: " + (err as Error).message,
				)}`,
				u.origin,
			),
		);
	}

	if (!tokens.refresh_token) {
		// Happens if the user already granted offline access previously without
		// re-consent. We force prompt=consent on re-auth to avoid this — but just
		// in case, surface a helpful error rather than silently saving a useless row.
		return NextResponse.redirect(
			new URL(
				`/clients/${state}/search?gsc_error=${encodeURIComponent(
					"no_refresh_token: revoke access at myaccount.google.com/permissions and try again",
				)}`,
				u.origin,
			),
		);
	}

	const email = emailFromIdToken(tokens.id_token) ?? "unknown";

	await db.gscConnection.upsert({
		where: { clientId: state },
		create: {
			clientId: state,
			googleEmail: email,
			refreshToken: tokens.refresh_token,
			accessToken: tokens.access_token ?? null,
			expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
		},
		update: {
			googleEmail: email,
			refreshToken: tokens.refresh_token,
			accessToken: tokens.access_token ?? null,
			expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
		},
	});

	return NextResponse.redirect(new URL(`/clients/${state}/search`, u.origin));
}
