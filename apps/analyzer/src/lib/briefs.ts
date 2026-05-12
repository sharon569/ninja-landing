// Content Brief — labels, options, helpers (client-safe).
// Server-only generator lives in `./briefs-server.ts`.

export const BRIEF_TYPE_OPTIONS = [
	{ value: "new_article", label: "מאמר חדש", category: "create" },
	{ value: "new_landing_page", label: "עמוד נחיתה חדש", category: "create" },
	{ value: "optimize_existing_page", label: "אופטימיזציה לעמוד קיים", category: "improve" },
	{ value: "expand_existing_content", label: "הרחבת תוכן קיים", category: "improve" },
	{ value: "faq_section", label: "הוספת אזור שאלות ותשובות", category: "improve" },
	{ value: "internal_link_plan", label: "תכנית קישורים פנימיים", category: "linking" },
	{ value: "title_meta_update", label: "עדכון Title / Meta", category: "metadata" },
] as const;

export const SEARCH_INTENT_OPTIONS = [
	{ value: "informational", label: "מידעית" },
	{ value: "commercial", label: "מסחרית" },
	{ value: "transactional", label: "טרנזקציה" },
	{ value: "local", label: "מקומית" },
	{ value: "navigational", label: "ניווט" },
	{ value: "mixed", label: "מעורבת" },
	{ value: "unknown", label: "לא מוגדרת" },
] as const;

export const BRIEF_STATUS_OPTIONS = [
	{ value: "draft", label: "טיוטה", tone: "neutral" },
	{ value: "needs_human_review", label: "דורש סקירה", tone: "warn" },
	{ value: "approved", label: "מאושר", tone: "good" },
	{ value: "rejected", label: "נדחה", tone: "mute" },
	{ value: "used", label: "נוצל", tone: "good" },
] as const;

export function briefTypeLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return BRIEF_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function briefTypeCategory(v: string | null | undefined): string {
	if (!v) return "other";
	return BRIEF_TYPE_OPTIONS.find((o) => o.value === v)?.category ?? "other";
}

export function searchIntentLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return SEARCH_INTENT_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function briefStatusLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return BRIEF_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function briefStatusTone(v: string | null | undefined): string {
	if (!v) return "neutral";
	return BRIEF_STATUS_OPTIONS.find((o) => o.value === v)?.tone ?? "neutral";
}

/** Opportunity types that have a useful brief template. */
export const BRIEF_ELIGIBLE_OPPORTUNITY_TYPES = new Set([
	"target_keyword_not_ranking",
	"target_keyword_needs_content",
	"target_keyword_needs_optimization",
	"high_impressions_no_clicks",
	"quick_win_position",
	"low_ctr",
	"content_gap",
	"internal_link_opportunity",
]);

export function canCreateBriefFor(opportunityType: string): boolean {
	return BRIEF_ELIGIBLE_OPPORTUNITY_TYPES.has(opportunityType);
}
