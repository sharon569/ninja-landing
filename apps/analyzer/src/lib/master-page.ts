// Phase 15D.-1 — Master Page model (client-safe types + labels).
// Server logic in master-page-server.ts.

export type MasterPageType =
	| "category"        // ecommerce category, e.g. /dustbins/brabantia, /coffee-machines
	| "product"         // single product page
	| "service"         // service landing for service-vertical clients
	| "blog_article"    // informational content
	| "brand_page"      // homepage or main brand entry
	| "homepage"        // root /
	| "landing_page"    // standalone landing (not category, not product)
	| "unknown";

export type MasterPageConfidence = "high" | "medium" | "low" | "unknown";

export type TargetPageMatchStatus =
	| "target_matches_ranking"
	| "target_differs_from_ranking"
	| "target_missing"                  // no operator-set targetUrl
	| "ranking_page_not_seo_eligible"
	| "master_page_candidate_found"     // scan-derived candidate, not operator-confirmed
	| "needs_human_review";

export type RecommendedPageAction =
	| "optimize_master_page"
	| "choose_master_page"               // operator must pick from candidates
	| "create_supporting_article"
	| "create_new_landing_page"
	| "improve_product_page"
	| "improve_category_page"
	| "brand_protection"                 // brand keyword, no changes needed
	| "no_change"
	| "human_review";

// ─── Labels ────────────────────────────────────────────────────

export const MASTER_PAGE_TYPE_LABEL: Record<MasterPageType, string> = {
	category: "קטגוריה",
	product: "מוצר",
	service: "שירות",
	blog_article: "מאמר/בלוג",
	brand_page: "עמוד מותג",
	homepage: "עמוד הבית",
	landing_page: "עמוד נחיתה",
	unknown: "לא מסווג",
};

export const MASTER_PAGE_CONFIDENCE_LABEL: Record<MasterPageConfidence, string> = {
	high: "ביטחון גבוה",
	medium: "ביטחון בינוני",
	low: "ביטחון נמוך",
	unknown: "לא ידוע",
};

export const MASTER_PAGE_CONFIDENCE_TONE: Record<MasterPageConfidence, "good" | "warn" | "bad" | "neutral"> = {
	high: "good",
	medium: "warn",
	low: "bad",
	unknown: "neutral",
};

export const TARGET_MATCH_LABEL: Record<TargetPageMatchStatus, string> = {
	target_matches_ranking: "Target = Ranking ✓",
	target_differs_from_ranking: "Target שונה מ-Ranking",
	target_missing: "אין Target Page",
	ranking_page_not_seo_eligible: "Ranking על עמוד לא SEO",
	master_page_candidate_found: "מועמד נמצא ב-scan",
	needs_human_review: "דורש סקירה אנושית",
};

export const RECOMMENDED_ACTION_LABEL: Record<RecommendedPageAction, string> = {
	optimize_master_page: "אופטימיזציה ל-Master Page",
	choose_master_page: "לבחור Master Page",
	create_supporting_article: "ליצור מאמר תומך",
	create_new_landing_page: "ליצור עמוד נחיתה חדש",
	improve_product_page: "לשפר עמוד מוצר",
	improve_category_page: "לשפר עמוד קטגוריה",
	brand_protection: "הגנת מותג",
	no_change: "לא לגעת",
	human_review: "סקירה אנושית",
};

export const RECOMMENDED_ACTION_TONE: Record<RecommendedPageAction, "good" | "warn" | "bad" | "neutral"> = {
	optimize_master_page: "good",
	choose_master_page: "warn",
	create_supporting_article: "good",
	create_new_landing_page: "warn",
	improve_product_page: "good",
	improve_category_page: "good",
	brand_protection: "neutral",
	no_change: "neutral",
	human_review: "warn",
};

// ─── Page type heuristics ──────────────────────────────────────
//
// classifyUrlPageType — pure URL-based classification. Used to bootstrap a
// guess about a page when we have nothing but its URL. The server-side
// resolver later refines with scan title / WP post_type / WooCommerce
// taxonomy when available.

export function classifyUrlPageType(url: string | null | undefined): MasterPageType {
	if (!url) return "unknown";
	let path: string;
	try {
		const u = new URL(url);
		path = u.pathname;
	} catch {
		path = url;
	}
	const p = path.toLowerCase().replace(/\/+$/, "");

	// Homepage
	if (p === "" || p === "/") return "homepage";

	// Common blog markers (slug segments OR WordPress permalink patterns)
	if (/^\/(blog|articles?|news|posts?|guide|magazine)\b/i.test(p)) return "blog_article";
	// Hebrew blog markers
	if (/(\/בלוג\b|\/מאמרים\b|\/מדריך\b)/.test(p)) return "blog_article";
	// Date-based permalinks /2024/07/post-name or /2024-07-...
	if (/^\/\d{4}\/\d{2}\//.test(p)) return "blog_article";

	// Service markers
	if (/^\/(service|services|servicii)\b/i.test(p)) return "service";
	if (/(\/שירות\b|\/שירותים\b)/.test(p)) return "service";

	// Brand pages (typical for a single-brand landing on ecommerce)
	if (/\/(brand|brands)\//i.test(p)) return "brand_page";

	// WooCommerce category pages — flatter URL with no trailing slug segment
	// /category, /shop/category, /product-category/...
	if (/\/product-category\//i.test(p)) return "category";
	if (/\/(shop|catalog)\/?$/i.test(p)) return "category";

	// Heuristic: paths with 2 segments tend to be category, paths with 3+
	// segments AND a trailing slug with non-Hebrew product-style words tend
	// to be product pages. This is rough — refined server-side using scan data.
	const segments = p.split("/").filter(Boolean);
	if (segments.length === 1) {
		// /coffee-machines / /אביזרים-לאמבטיה — single segment, usually a top-level category
		return "category";
	}
	if (segments.length === 2) {
		// /coffee-machines/delonghi → could be either subcategory or product
		// Default to category (subcategory) since on most ecommerce URL schemes,
		// 2-segment paths are still category-like. The resolver can override
		// from scan post_type.
		return "category";
	}
	// 3+ segments → usually a product page on most ecommerce schemes
	return "product";
}

// ─── Title style by page type ───────────────────────────────────
//
// Each page type has a preferred Hebrew title pattern. The Brief generator
// uses this to avoid "מסננת לכיור - השוואה, מחירים ובחירה" being applied to
// a single product page (the 15E.2 pilot failure).

export function titleStyleForPageType(t: MasterPageType): {
	pattern: string;
	example: string;
} {
	switch (t) {
		case "category":
			return {
				pattern: "{keyword} - דגמים, צבעים ומחירים",
				example: "פח אשפה ברבנטיה - דגמים, צבעים ומחירים",
			};
		case "product":
			return {
				pattern: "{keyword} | {brand} - הזמנה אונליין",
				example: "מסננת לכיור OXO - הזמנה אונליין",
			};
		case "service":
			return {
				pattern: "{keyword} - שירות באזור שלכם",
				example: "שיפוצים בתל אביב - שירות באזור שלכם",
			};
		case "blog_article":
			return {
				pattern: "איך לבחור {keyword} - המדריך השלם",
				example: "איך לבחור מסננת לכיור - המדריך השלם",
			};
		case "brand_page":
		case "homepage":
			return {
				pattern: "{brand} - {tagline}",
				example: "לויזון מרקט - בית למוצרי המטבח",
			};
		case "landing_page":
			return {
				pattern: "{keyword} - {value-proposition}",
				example: "אביזרים לאמבטיה - מבחר מקצועי וזמין למשלוח",
			};
		case "unknown":
			return {
				pattern: "{keyword}",
				example: "—",
			};
	}
}

// Quick check — does the brief's recommended title look like a category-style
// title? Used by the Page Type Mismatch Guard to refuse Execute when the
// target page is a product but the title sounds category-y.
export function looksLikeCategoryTitle(title: string | null | undefined): boolean {
	if (!title) return false;
	const t = title.toLowerCase();
	// Category-style markers
	return (
		t.includes("השוואה") ||
		t.includes("דגמים") ||
		t.includes("מחירים ובחירה") ||
		t.includes("מגוון דגמים") ||
		t.includes("המדריך לבחירה")
	);
}

export function looksLikeProductTitle(title: string | null | undefined): boolean {
	if (!title) return false;
	const t = title.toLowerCase();
	return (
		t.includes("הזמנה אונליין") ||
		t.includes("קנייה אונליין") ||
		t.includes("מחיר משתלם") ||
		/\b\d+\s*(ליטר|"|cm|ס"מ|מ"ל|kg)\b/.test(t)
	);
}

// Page type mismatch detector (used by Execution Guard).
export interface PageTypeMismatch {
	mismatch: boolean;
	reason: string | null;
}

export function detectTitleVsPageTypeMismatch(
	title: string | null | undefined,
	pageType: MasterPageType,
): PageTypeMismatch {
	if (!title) return { mismatch: false, reason: null };
	if (pageType === "product" && looksLikeCategoryTitle(title)) {
		return {
			mismatch: true,
			reason: 'Title בסגנון קטגוריה ("השוואה / דגמים / מחירים") על עמוד מוצר יחיד — לא מתאים.',
		};
	}
	if (pageType === "blog_article" && looksLikeProductTitle(title)) {
		return {
			mismatch: true,
			reason: "Title בסגנון מוצר על עמוד מאמר — לא מתאים.",
		};
	}
	return { mismatch: false, reason: null };
}
