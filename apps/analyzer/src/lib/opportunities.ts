// Opportunity Engine — client-safe types, labels, and presentation helpers.
// Server-only detectors and analysis runner live in `./opportunities-server.ts`.

export const OPPORTUNITY_TYPES = [
	{
		value: "low_ctr",
		label: "CTR נמוך",
		category: "ctr",
	},
	{
		value: "quick_win_position",
		label: "ניצחון מהיר במיקום",
		category: "ranking",
	},
	{
		value: "high_impressions_no_clicks",
		label: "חשיפות גבוהות בלי קליקים",
		category: "ctr",
	},
	{
		value: "declining_clicks",
		label: "קליקים יורדים",
		category: "decline",
	},
	{
		value: "declining_position",
		label: "מיקום יורד",
		category: "decline",
	},
	{
		value: "target_keyword_not_ranking",
		label: "מילת יעד שלא מדורגת",
		category: "keyword",
	},
	{
		value: "target_keyword_needs_content",
		label: "מילת יעד דורשת תוכן חדש",
		category: "keyword",
	},
	{
		value: "target_keyword_needs_optimization",
		label: "מילת יעד דורשת שיפור",
		category: "keyword",
	},
	{
		value: "cannibalization",
		label: "קניבליזציה",
		category: "ranking",
	},
	{
		value: "new_query_growth",
		label: "שאילתה חדשה צומחת",
		category: "growth",
	},
	{
		value: "technical_seo_issue",
		label: "בעיה טכנית",
		category: "technical",
	},
	{
		value: "content_gap",
		label: "פער תוכן",
		category: "content",
	},
	{
		value: "internal_link_opportunity",
		label: "הזדמנות קישור פנימי",
		category: "internal_linking",
	},
] as const;

export const STATUS_OPTIONS = [
	{ value: "detected", label: "זוהה", tone: "neutral" },
	{ value: "recommended", label: "מומלץ", tone: "neutral" },
	{ value: "needs_human_review", label: "דורש סקירה ידנית", tone: "warn" },
	{ value: "approved", label: "אושר", tone: "good" },
	{ value: "rejected", label: "נדחה", tone: "mute" },
	{ value: "dismissed", label: "הוסר", tone: "mute" },
	{ value: "monitoring", label: "במעקב", tone: "neutral" },
] as const;

export const IMPACT_OPTIONS = [
	{ value: "high", label: "גבוהה" },
	{ value: "medium", label: "בינונית" },
	{ value: "low", label: "נמוכה" },
] as const;

export const EFFORT_OPTIONS = [
	{ value: "low", label: "נמוך" },
	{ value: "medium", label: "בינוני" },
	{ value: "high", label: "גבוה" },
] as const;

export const CONFIDENCE_OPTIONS = [
	{ value: "high", label: "גבוה" },
	{ value: "medium", label: "בינוני" },
	{ value: "low", label: "נמוך" },
] as const;

export function typeLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return OPPORTUNITY_TYPES.find((t) => t.value === v)?.label ?? v;
}

export function typeCategory(v: string | null | undefined): string {
	if (!v) return "other";
	return OPPORTUNITY_TYPES.find((t) => t.value === v)?.category ?? "other";
}

export function statusLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return STATUS_OPTIONS.find((s) => s.value === v)?.label ?? v;
}

export function statusTone(v: string | null | undefined): string {
	if (!v) return "neutral";
	return STATUS_OPTIONS.find((s) => s.value === v)?.tone ?? "neutral";
}

export function impactLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return IMPACT_OPTIONS.find((i) => i.value === v)?.label ?? v;
}

export function effortLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return EFFORT_OPTIONS.find((i) => i.value === v)?.label ?? v;
}

export function confidenceLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return CONFIDENCE_OPTIONS.find((i) => i.value === v)?.label ?? v;
}

/** Priority-score buckets for UI grouping. */
export function priorityBand(score: number): {
	label: string;
	color: string;
	bucket: "high" | "quick" | "medium" | "low";
} {
	if (score >= 80) return { label: "High Impact", color: "#ff2a3c", bucket: "high" };
	if (score >= 60) return { label: "Quick Win", color: "#ffd166", bucket: "quick" };
	if (score >= 40) return { label: "Medium Priority", color: "#a8acb6", bucket: "medium" };
	return { label: "Low Priority", color: "#6a6f7c", bucket: "low" };
}
