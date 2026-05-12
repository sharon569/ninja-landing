// Google Search Console integration.
//
// OAuth flow: web app pattern with offline access (refresh tokens).
// API: REST calls to searchconsole.googleapis.com with a bearer access token
// that we refresh on demand from the stored refresh token.
//
// Env vars (from .env):
//   GOOGLE_CLIENT_ID         — OAuth 2.0 client ID (reused agency-wide)
//   GOOGLE_CLIENT_SECRET     — its secret
//   GOOGLE_OAUTH_REDIRECT    — full URL of /api/gsc/callback (e.g. http://localhost:3000/api/gsc/callback)
//
// Scopes:
//   - openid email                          — to display whose Google account is connected
//   - .../auth/webmasters.readonly          — to read Search Console data

import { OAuth2Client } from "google-auth-library";

export const GSC_SCOPES = [
	"openid",
	"email",
	"https://www.googleapis.com/auth/webmasters.readonly",
];

export class GscNotConfigured extends Error {
	constructor() {
		super(
			"Google OAuth credentials missing. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable Search Console integration.",
		);
		this.name = "GscNotConfigured";
	}
}

export function isGscConfigured(): boolean {
	return !!(
		process.env.GOOGLE_CLIENT_ID &&
		process.env.GOOGLE_CLIENT_SECRET &&
		process.env.GOOGLE_OAUTH_REDIRECT
	);
}

export function getOAuthClient(): OAuth2Client {
	if (!isGscConfigured()) throw new GscNotConfigured();
	return new OAuth2Client({
		clientId: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		redirectUri: process.env.GOOGLE_OAUTH_REDIRECT,
	});
}

/** Build the consent URL. `state` round-trips a payload (we put the clientId there). */
export function buildAuthUrl(state: string): string {
	const client = getOAuthClient();
	return client.generateAuthUrl({
		access_type: "offline",  // → refresh token
		prompt: "consent",       // → ensure we get a refresh token on re-auth
		scope: GSC_SCOPES,
		state,
		include_granted_scopes: true,
	});
}

/** Exchange an auth code for tokens. */
export async function exchangeCode(code: string) {
	const client = getOAuthClient();
	const { tokens } = await client.getToken(code);
	return tokens;
}

/** Decode the id_token to extract the Google account email (best-effort, no signature verify). */
export function emailFromIdToken(idToken: string | null | undefined): string | null {
	if (!idToken) return null;
	const parts = idToken.split(".");
	if (parts.length < 2) return null;
	try {
		const payload = JSON.parse(
			Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"),
		);
		return payload.email ?? null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// API access — uses an OAuth2Client primed with stored refresh token. Library
// handles automatic access-token refresh under the hood.
// ---------------------------------------------------------------------------

export function clientForRefreshToken(refreshToken: string): OAuth2Client {
	const c = getOAuthClient();
	c.setCredentials({ refresh_token: refreshToken });
	return c;
}

/** List of GSC properties the authenticated user has access to. */
export interface GscSite {
	siteUrl: string;            // "sc-domain:example.com" or "https://www.example.com/"
	permissionLevel: string;    // "siteOwner" | "siteFullUser" | "siteRestrictedUser" | "siteUnverifiedUser"
}

export async function listSites(refreshToken: string): Promise<GscSite[]> {
	const client = clientForRefreshToken(refreshToken);
	const res = await client.request<{ siteEntry?: GscSite[] }>({
		url: "https://www.googleapis.com/webmasters/v3/sites",
		method: "GET",
	});
	return res.data.siteEntry ?? [];
}

// ---------------------------------------------------------------------------
// Search Analytics queries
// ---------------------------------------------------------------------------

export interface SearchAnalyticsRow {
	keys: string[];      // ordered by `dimensions` request
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
}

export interface SearchAnalyticsResponse {
	rows?: SearchAnalyticsRow[];
}

interface QueryArgs {
	refreshToken: string;
	propertyUrl: string;       // e.g. "sc-domain:example.com" or "https://www.example.com/"
	startDate: string;         // YYYY-MM-DD
	endDate: string;           // YYYY-MM-DD
	dimensions?: ("query" | "page" | "date" | "country" | "device" | "searchAppearance")[];
	rowLimit?: number;
}

export async function searchAnalyticsQuery(args: QueryArgs): Promise<SearchAnalyticsRow[]> {
	const client = clientForRefreshToken(args.refreshToken);
	const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(args.propertyUrl)}/searchAnalytics/query`;
	const body = {
		startDate: args.startDate,
		endDate: args.endDate,
		dimensions: args.dimensions ?? ["query"],
		rowLimit: args.rowLimit ?? 1000,
	};
	const res = await client.request<SearchAnalyticsResponse>({
		url,
		method: "POST",
		data: body,
	});
	return res.data.rows ?? [];
}

// ---------------------------------------------------------------------------
// Date helpers — GSC has a ~2-day data delay; default range is the last 28
// days ending 2 days ago. Strings, not Date objects, to dodge timezone bugs.
// ---------------------------------------------------------------------------

export function ymd(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function defaultDateRange(): { startDate: string; endDate: string } {
	const endDate = new Date();
	endDate.setUTCDate(endDate.getUTCDate() - 2);
	const startDate = new Date(endDate);
	startDate.setUTCDate(startDate.getUTCDate() - 27);
	return { startDate: ymd(startDate), endDate: ymd(endDate) };
}
