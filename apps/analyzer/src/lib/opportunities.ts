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
	{ value: "manually_applied", label: "בוצע ידנית", tone: "good" },
	{ value: "monitoring", label: "במעקב", tone: "neutral" },
	{ value: "impact_reviewed", label: "נבחנה השפעה", tone: "good" },
	{ value: "rejected", label: "נדחה", tone: "mute" },
	{ value: "dismissed", label: "הוסר", tone: "mute" },
] as const;

export const APPROVED_ACTION_TYPES = [
	{ value: "title_meta_update", label: "עדכון Title / Meta Description" },
	{ value: "content_update", label: "עדכון תוכן בעמוד" },
	{ value: "internal_link_update", label: "עדכון קישורים פנימיים" },
	{ value: "new_content", label: "יצירת תוכן חדש" },
	{ value: "technical_fix", label: "תיקון טכני" },
	{ value: "schema_update", label: "עדכון Schema markup" },
	{ value: "manual_review", label: "סקירה ידנית בלבד" },
	{ value: "other", label: "אחר" },
] as const;

export function approvedActionTypeLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return APPROVED_ACTION_TYPES.find((t) => t.value === v)?.label ?? v;
}

export const IMPACT_RESULT_LABELS: Record<string, { label: string; tone: string }> = {
	improved: { label: "השתפר", tone: "good" },
	neutral: { label: "ניטרלי", tone: "mute" },
	declined: { label: "ירד", tone: "bad" },
	needs_more_time: { label: "צריך עוד זמן", tone: "warn" },
	not_enough_data: { label: "אין מספיק נתונים", tone: "mute" },
};

/** Statuses that show in the active list (not finalised, not yet in monitoring). */
export const ACTIVE_OPPORTUNITY_STATUSES = [
	"detected",
	"recommended",
	"needs_human_review",
	"approved",
] as const;

/** Statuses considered "in flight" — covers active + post-apply tracking. */
export const IN_FLIGHT_STATUSES = [
	...ACTIVE_OPPORTUNITY_STATUSES,
	"manually_applied",
	"monitoring",
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
