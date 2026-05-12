// Phase 15C.2 — SEO Crawl Scope.
//
// Single source of truth for "is this URL an SEO target page?". Every
// recommendation engine that picks pages (opportunities, strategy, briefs,
// execution, internal-link) MUST pass URLs through classifyPage() before
// generating output.
//
// Client-safe (no "server-only") so route handlers, UI, and scripts can
// share the same classification. Pure functions over inputs — no I/O.

export type PageSeoScope =
	| "seo_target"
	| "utility"
	| "legal"
	| "trust"
	| "business_info"
	| "system"
	| "unknown";

export const SCOPE_LABEL: Record<PageSeoScope, string> = {
	seo_target: "עמוד SEO",
	utility: "עמוד תפעולי",
	legal: "עמוד משפטי",
	trust: "עמוד אמון",
	business_info: "עמוד מידע עסקי",
	system: "עמוד מערכת",
	unknown: "לא מסווג",
};

// ─── Default patterns ────────────────────────────────────────────
//
// Patterns are matched against the URL pathname (case-insensitive). A leading
// "/" anchors at the start of the path; otherwise the pattern is treated as
// "any segment matches". `$` at the end forces exact match (used to allow
// /shop archive to be blocked while /shop/category/x stays eligible).

export const DEFAULT_UTILITY_PATTERNS: string[] = [
	"/cart",
	"/checkout",
	"/my-account",
	"/account",
	"/login",
	"/register",
	"/wishlist",
	"/order",
	"/order-tracking",
	"/thank-you",
	"/search",
	"/wp-admin",
	"/wp-login",
	"/admin",
	"/dashboard",
	"/management",
];

export const DEFAULT_LEGAL_PATTERNS: string[] = [
	"/privacy-policy",
	"/privacy",
	"/terms",
	"/terms-and-conditions",
	"/shipping",
	"/shipping-policy",
	"/returns",
	"/refund-policy",
	"/cookies",
	"/cookie-policy",
];

export const DEFAULT_TRUST_PATTERNS: string[] = [
	"/accessibility",
	"/accessibility-statement",
];

export const DEFAULT_BUSINESS_INFO_PATTERNS: string[] = [
	"/about",
	"/about-us",
	"/contact",
	"/contact-us",
];

// Shop archive is excluded as a *bare* path only. Real category URLs like
// /shop/dustbins or /dustbins/brabantia stay eligible.
export const SHOP_ARCHIVE_EXACT: string[] = ["/shop$", "/store$"];

export const DEFAULT_SYSTEM_PATTERNS: string[] = [
	"/feed",
	"/wp-json",
	"/xmlrpc.php",
];

// ─── ClientScopeConfig — the subset of Client needed by the classifier ──

export interface ClientScopeConfig {
	targetPages: string[];
	seoIgnoredUrls?: string[];
	seoIgnoredPatterns?: string[];
	seoForcedTargetUrls?: string[];
}

// ─── URL helpers ─────────────────────────────────────────────────

function normalize(u: string): string {
	return u.trim().replace(/\s+/g, "");
}

function pathOf(u: string): string {
	const cleaned = normalize(u);
	try {
		const url = new URL(cleaned);
		// strip trailing slash for non-root paths so "/cart/" matches "/cart"
		let p = url.pathname;
		if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
		return p.toLowerCase();
	} catch {
		// Relative path or malformed — treat as path-like.
		let p = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
		// strip query / hash
		p = p.split("?")[0].split("#")[0];
		if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
		return p.toLowerCase();
	}
}

function urlsEqual(a: string, b: string): boolean {
	return normalize(a).replace(/\/$/, "").toLowerCase() ===
		normalize(b).replace(/\/$/, "").toLowerCase();
}

function matchesPattern(path: string, pattern: string): boolean {
	const p = pattern.toLowerCase().trim();
	if (!p) return false;
	const exact = p.endsWith("$");
	const body = exact ? p.slice(0, -1) : p;
	if (exact) {
		return path === body || path === `${body}/`;
	}
	if (body.startsWith("/")) {
		return path === body || path.startsWith(`${body}/`);
	}
	// Substring match — treat as "segment contains"
	return path.includes(body);
}

function pathMatchesAny(path: string, patterns: string[]): boolean {
	for (const pat of patterns) {
		if (matchesPattern(path, pat)) return true;
	}
	return false;
}

function urlInList(url: string, list: string[]): boolean {
	for (const u of list) {
		if (urlsEqual(url, u)) return true;
	}
	return false;
}

function pathInTargetPages(url: string, targetPages: string[]): boolean {
	for (const t of targetPages) {
		if (urlsEqual(url, t)) return true;
	}
	return false;
}

// ─── Classification ─────────────────────────────────────────────

export interface PageClassification {
	scope: PageSeoScope;
	isSeoEligible: boolean;
	reason: string; // short Hebrew explanation
}

/**
 * Decide precedence (top wins):
 *   1. forced_target — operator override → seo_target / eligible
 *   2. ignored_url — operator override → unknown / not eligible
 *   3. ignored_pattern — operator override → unknown / not eligible
 *   4. default utility / legal / trust / system patterns → not eligible
 *   5. shop archive exact → utility / not eligible
 *   6. business_info → eligible only if URL is in client.targetPages
 *   7. otherwise → seo_target / eligible (default permissive)
 *
 * The function is intentionally conservative on the BLOCK side: if we can't
 * confidently classify, we default to eligible so we don't silently hide
 * recommendations from the operator.
 */
export function classifyPage(
	url: string,
	client: ClientScopeConfig,
): PageClassification {
	if (!url) {
		return { scope: "unknown", isSeoEligible: true, reason: "אין URL" };
	}
	const path = pathOf(url);

	// 1. Forced target — operator says "treat this as SEO target no matter what"
	if (client.seoForcedTargetUrls?.length && urlInList(url, client.seoForcedTargetUrls)) {
		return {
			scope: "seo_target",
			isSeoEligible: true,
			reason: "מסומן ידנית כעמוד מטרת SEO",
		};
	}

	// 2. Operator-explicit ignore URL
	if (client.seoIgnoredUrls?.length && urlInList(url, client.seoIgnoredUrls)) {
		return {
			scope: "unknown",
			isSeoEligible: false,
			reason: "ב-Ignored URLs של הלקוח",
		};
	}

	// 3. Operator-explicit ignore pattern
	if (client.seoIgnoredPatterns?.length && pathMatchesAny(path, client.seoIgnoredPatterns)) {
		return {
			scope: "unknown",
			isSeoEligible: false,
			reason: "תואם Ignored Pattern של הלקוח",
		};
	}

	// 4. Default category patterns
	if (pathMatchesAny(path, DEFAULT_SYSTEM_PATTERNS)) {
		return { scope: "system", isSeoEligible: false, reason: "עמוד מערכת" };
	}
	if (pathMatchesAny(path, DEFAULT_UTILITY_PATTERNS)) {
		return { scope: "utility", isSeoEligible: false, reason: "עמוד תפעולי" };
	}
	if (pathMatchesAny(path, DEFAULT_LEGAL_PATTERNS)) {
		return { scope: "legal", isSeoEligible: false, reason: "עמוד משפטי" };
	}
	if (pathMatchesAny(path, DEFAULT_TRUST_PATTERNS)) {
		return { scope: "trust", isSeoEligible: false, reason: "עמוד אמון/נגישות" };
	}

	// 5. Shop archive (only the bare archive — categories like /shop/foo stay in)
	if (pathMatchesAny(path, SHOP_ARCHIVE_EXACT)) {
		return { scope: "utility", isSeoEligible: false, reason: "Shop archive" };
	}

	// 6. Business info — eligible only when explicitly marked as target page
	if (pathMatchesAny(path, DEFAULT_BUSINESS_INFO_PATTERNS)) {
		if (pathInTargetPages(url, client.targetPages)) {
			return {
				scope: "seo_target",
				isSeoEligible: true,
				reason: "עמוד מידע עסקי שסומן כ-targetPage",
			};
		}
		return {
			scope: "business_info",
			isSeoEligible: false,
			reason: "עמוד מידע עסקי — לא מסומן כעמוד SEO",
		};
	}

	// 7. Default: eligible
	return { scope: "seo_target", isSeoEligible: true, reason: "ברירת מחדל: עמוד SEO" };
}

export function isSeoEligible(url: string, client: ClientScopeConfig): boolean {
	return classifyPage(url, client).isSeoEligible;
}

// ─── Utility for UI ──────────────────────────────────────────────

export function scopeBadgeTone(scope: PageSeoScope): "neutral" | "warn" | "bad" | "good" {
	switch (scope) {
		case "seo_target":
			return "good";
		case "utility":
		case "system":
			return "bad";
		case "legal":
		case "trust":
		case "business_info":
			return "warn";
		default:
			return "neutral";
	}
}
