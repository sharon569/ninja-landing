// Keyword bank — client-safe constants, labels, and helpers.
// Server-only helpers (Prisma queries) live in `./keywords-server.ts`.

export const INTENT_OPTIONS = [
	{ value: "commercial", label: "מסחרית", description: "השוואה / בחירה לפני קנייה" },
	{ value: "transactional", label: "טרנזקציה", description: "קניה / הזמנה ישירה" },
	{ value: "informational", label: "מידעית", description: "חיפוש מידע / איך לעשות" },
	{ value: "local", label: "מקומית", description: "ליד אזור / שירות מקומי" },
	{ value: "navigational", label: "ניווט", description: "חיפוש מותג / אתר ספציפי" },
	{ value: "unknown", label: "לא מוגדרת", description: "טרם סווג" },
] as const;

export const PRIORITY_OPTIONS = [
	{ value: "critical", label: "קריטית", color: "#ff2a3c" },
	{ value: "high", label: "גבוהה", color: "#ffd166" },
	{ value: "medium", label: "בינונית", color: "#a8acb6" },
	{ value: "low", label: "נמוכה", color: "#6a6f7c" },
] as const;

export const STATUS_OPTIONS = [
	{ value: "active", label: "פעילה", tone: "neutral" },
	{ value: "paused", label: "מושהית", tone: "mute" },
	{ value: "ranking", label: "מדורגת", tone: "good" },
	{ value: "won", label: "הוגעה למטרה", tone: "good" },
	{ value: "not_ranking", label: "לא מדורגת", tone: "warn" },
	{ value: "needs_content", label: "דורש תוכן חדש", tone: "warn" },
	{ value: "needs_optimization", label: "דורש שיפור", tone: "warn" },
	{ value: "lost", label: "אבודה", tone: "bad" },
] as const;

export const BUSINESS_VALUE_OPTIONS = [
	{ value: "high", label: "ערך עסקי גבוה" },
	{ value: "medium", label: "ערך עסקי בינוני" },
	{ value: "low", label: "ערך עסקי נמוך" },
] as const;

// Phase 15E.1 — strategic goal per keyword. Operator-set only. Drives Brain
// priorities in later phases (15E.2+). In 15E.1 this is captured but does
// NOT yet affect Strategy/Opportunity/Brief/WorkPlan logic.
export const KEYWORD_GOAL_OPTIONS = [
	{
		value: "improve_rank",
		label: "שיפור דירוג",
		description: "המילה מדורגת חלש (מקום 6+) ורוצים לעלות.",
	},
	{
		value: "defend_top3",
		label: "הגנה על Top 3",
		description: "המילה כבר בטופ 3 — לא לאבד את המיקום.",
	},
	{
		value: "expand_content_coverage",
		label: "הרחבת כיסוי תוכן",
		description: "יש דף בסיסי, צריך להעמיק ולהוסיף sub-topics.",
	},
	{
		value: "new_landing_page",
		label: "יצירת דף נחיתה חדש",
		description: "אין עדיין דף יעד — צריך לבנות אחד.",
	},
	{
		value: "informational_authority",
		label: "סמכות תוכן מידעית",
		description: "מילה מידעית — רוצים להפוך למקור הסמכות בתחום.",
	},
	{
		value: "cannibalization_resolution",
		label: "פתרון קניבליזציה",
		description: "כמה דפים מתחרים על אותה מילה — לאחד.",
	},
	{
		value: "monitor_only",
		label: "מעקב בלבד",
		description: "לא לבצע פעולות — רק לעקוב אחרי המיקום.",
	},
] as const;

export type IntentValue = (typeof INTENT_OPTIONS)[number]["value"];
export type PriorityValue = (typeof PRIORITY_OPTIONS)[number]["value"];
export type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];
export type BusinessValueValue = (typeof BUSINESS_VALUE_OPTIONS)[number]["value"];
export type KeywordGoalValue = (typeof KEYWORD_GOAL_OPTIONS)[number]["value"];

export const PRIORITY_ORDER: Record<string, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

export function intentLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return INTENT_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function priorityLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return PRIORITY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function priorityColor(v: string | null | undefined): string {
	if (!v) return "#6a6f7c";
	return PRIORITY_OPTIONS.find((o) => o.value === v)?.color ?? "#6a6f7c";
}

export function statusLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function statusTone(v: string | null | undefined): string {
	if (!v) return "neutral";
	return STATUS_OPTIONS.find((o) => o.value === v)?.tone ?? "neutral";
}

export function keywordGoalLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return KEYWORD_GOAL_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function businessValueLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return BUSINESS_VALUE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

/** Normalize for storage: lowercase, trim, collapse whitespace. */
export function normalizeKeyword(s: string): string {
	return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface KeywordPerf {
	clicks: number;
	impressions: number;
	ctr: number;       // 0..1
	position: number;  // average, weighted by impressions
	days: number;
}
