// Shared types for the audit rules engine.
//
// Each rule is a pure function: (ScanResponse) -> Finding | null
// Returning null means "this rule doesn't apply" (e.g. WC-specific rule on
// a site with no products). Returning a Finding with count=0 means "rule
// applies but everything passes" — we suppress these in the UI.

import type { ScanResponse, UrlEntry } from "@/lib/plugin-client";

export type Severity = "high" | "medium" | "low" | "info";

export type AuditCategory =
	| "indexation"
	| "on-page-meta"
	| "content-structure"
	| "content-quality"
	| "images"
	| "internal-linking"
	| "schema"
	| "cannibalization"
	// Phase 7 — technical SEO categories (filled by tech-audit-server.ts)
	| "sitemap"
	| "robots"
	| "redirects"
	| "performance"
	| "multi-language";

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
	"indexation": "אינדוקס וזחילה",
	"on-page-meta": "מטא בעמוד (כותרות, תיאורים, מילות מפתח)",
	"content-structure": "מבנה HTML (היררכיית H1, H2, H3)",
	"content-quality": "איכות תוכן ועומק",
	"images": "תמונות וטקסט חלופי",
	"internal-linking": "קישוריות פנימית",
	"schema": "סכמה מובנית",
	"cannibalization": "קניבליזציה וכפילויות",
	"sitemap": "Sitemap",
	"robots": "Robots.txt",
	"redirects": "Redirects & 404",
	"performance": "ביצועים ו-Core Web Vitals",
	"multi-language": "רב-לשוני (Hreflang)",
};

export const CATEGORY_ORDER: AuditCategory[] = [
	"indexation",
	"redirects",
	"sitemap",
	"robots",
	"on-page-meta",
	"content-structure",
	"content-quality",
	"images",
	"internal-linking",
	"schema",
	"cannibalization",
	"performance",
	"multi-language",
];

export interface AffectedUrl {
	blog_id: number;
	post_id: number;
	url: string;
	post_type: string;
	title: string;
	/** Free-form rule-specific detail, e.g. the offending alt text or current title. */
	detail?: string;
}

export interface Finding {
	ruleId: string;
	category: AuditCategory;
	title: string;            // Human title shown in the findings list, e.g. "Products with no Yoast title"
	description: string;      // 1-2 sentences explaining the SEO impact
	severity: Severity;
	count: number;
	affectedUrls: AffectedUrl[];
	/** Optional one-line action hint, e.g. "Set a custom title on each product page." */
	fixHint?: string;
}

export interface Rule {
	id: string;               // stable kebab-case identifier
	category: AuditCategory;
	defaultSeverity: Severity;
	/** Returns a Finding if the rule applies (count >= 1), null if it doesn't apply to this scan. */
	run: (scan: ScanResponse) => Finding | null;
}

/** Shared constants used by many rules. */
export const PUBLIC_CONTENT_TYPES = new Set(["post", "page", "product"]);

/** Treat falsy-ish values from Yoast indexable bool fields uniformly. */
export function isTrueish(v: unknown): boolean {
	return v === 1 || v === true || v === "1";
}

/** Convenience: iterate every URL across every blog in a scan. */
export function* iterateUrls(scan: ScanResponse): Generator<UrlEntry & { blog_id: number }> {
	for (const [blogIdStr, blog] of Object.entries(scan.sites)) {
		const blog_id = Number(blogIdStr);
		for (const url of blog.urls) {
			yield { ...url, blog_id };
		}
	}
}

/** Convenience: convert UrlEntry to AffectedUrl with a detail string. */
export function toAffected(
	entry: UrlEntry & { blog_id: number },
	detail?: string,
): AffectedUrl {
	return {
		blog_id: entry.blog_id,
		post_id: entry.post_id,
		url: entry.url,
		post_type: entry.post_type,
		title: entry.title,
		detail,
	};
}
