// OAuth callback: receive ?code= ?state=, exchange for tokens, persist the
// singleton GscAccount, redirect to /integrations.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeCode, emailFromIdToken } from "@/lib/gsc";

const REDIRECT_TARGET = "/integrations";

function bounceWithError(origin: string, msg: string) {
	return NextResponse.redirect(
		new URL(`${REDIRECT_TARGET}?gsc_error=${encodeURIComponent(msg)}`, origin),
	);
}

export async function GET(req: Request) {
	const u = new URL(req.url);
	const code = u.searchParams.get("code");
	const errorParam = u.searchParams.get("error");

	if (errorParam) return bounceWithError(u.origin, errorParam);
	if (!code) return bounceWithError(u.origin, "missing_code");

	let tokens;
	try {
		tokens = await exchangeCode(code);
	} catch (err) {
		return bounceWithError(u.origin, `token_exchange_failed: ${(err as Error).message}`);
	}

	if (!tokens.refresh_token) {
		return bounceWithError(
			u.origin,
			"no_refresh_token: revoke access at myaccount.google.com/permissions and try again",
		);
	}

	const email = emailFromIdToken(tokens.id_token) ?? "unknown";

	const existing = await db.gscAccount.findFirst();
	if (existing) {
		await db.gscAccount.update({
			where: { id: existing.id },
			data: {
				googleEmail: email,
				refreshToken: tokens.refresh_token,
				accessToken: tokens.access_token ?? null,
				expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
			},
		});
	} else {
		await db.gscAccount.create({
			data: {
				googleEmail: email,
				refreshToken: tokens.refresh_token,
				accessToken: tokens.access_token ?? null,
				expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
			},
		});
	}

	return NextResponse.redirect(new URL(REDIRECT_TARGET, u.origin));
}
