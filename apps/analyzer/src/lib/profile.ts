// SEO Profile — labels, options, and completeness scoring.
// Hebrew labels for UI; English values for storage (stable across translations).

export interface ProfileLike {
	vertical?: string | null;
	language?: string | null;
	country?: string | null;
	serviceAreas?: string[];
	seoGoals?: string | null;
	targetPages?: string[];
	competitors?: string[];
	brandVoice?: string | null;
	notes?: string | null;
	automationLevel?: string | null;
	requireApprovalFor?: string[];
}

export const VERTICAL_OPTIONS = [
	{ value: "service", label: "שירות" },
	{ value: "ecommerce", label: "מסחר אלקטרוני (eCommerce)" },
	{ value: "local_business", label: "עסק מקומי" },
	{ value: "medical", label: "רפואה" },
	{ value: "legal", label: "משפטים" },
	{ value: "home_services", label: "שירותי בית" },
	{ value: "saas", label: "SaaS / תוכנה" },
	{ value: "content_site", label: "אתר תוכן" },
	{ value: "other", label: "אחר" },
] as const;

export const LANGUAGE_OPTIONS = [
	{ value: "he", label: "עברית" },
	{ value: "en", label: "אנגלית" },
	{ value: "ar", label: "ערבית" },
	{ value: "multi", label: "רב-לשוני" },
] as const;

export const AUTOMATION_LEVELS = [
	{
		value: "strict",
		label: "מחמיר",
		description: "כל פעולה דורשת אישור ידני לפני יישום",
	},
	{
		value: "balanced",
		label: "מאוזן",
		description: "אישור לפעולות עיקריות; QA אוטומטי לשאר (ברירת מחדל)",
	},
	{
		value: "aggressive",
		label: "אגרסיבי",
		description: "מינימום אישורים — רק שינויים גדולים מצריכים אישור",
	},
] as const;

/** Categories that can require approval before being applied. */
export const APPROVAL_CATEGORIES = [
	{ value: "publish", label: "פרסום עמוד / מאמר חדש" },
	{ value: "title_change", label: "שינוי כותרת (Title)" },
	{ value: "meta_change", label: "שינוי תיאור Meta" },
	{ value: "content_change", label: "שינוי תוכן הגוף" },
	{ value: "internal_link", label: "הוספת קישור פנימי" },
	{ value: "schema_change", label: "שינוי Schema markup" },
	{ value: "wordpress_update", label: "שינויים אחרים ב-WordPress" },
] as const;

/** Required for considering a profile "complete". */
const REQUIRED_FIELDS = [
	"vertical",
	"language",
	"country",
	"seoGoals",
	"targetPages",
	"competitors",
	"automationLevel",
] as const;

export interface CompletionResult {
	percent: number;
	completed: string[];
	missing: string[];
}

/**
 * Returns a 0–100 completion percentage based on the required fields list.
 * String fields count when truthy and non-empty after trim;
 * arrays count when length ≥ 1.
 */
export function calcProfileCompletion(c: ProfileLike): CompletionResult {
	const completed: string[] = [];
	const missing: string[] = [];

	for (const f of REQUIRED_FIELDS) {
		const v = c[f as keyof ProfileLike];
		const filled = Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;
		(filled ? completed : missing).push(f);
	}

	const percent = Math.round((completed.length / REQUIRED_FIELDS.length) * 100);
	return { percent, completed, missing };
}

/** Hebrew label for a stored vertical value (or fallback). */
export function verticalLabel(value: string | null | undefined): string {
	if (!value) return "—";
	return VERTICAL_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function languageLabel(value: string | null | undefined): string {
	if (!value) return "—";
	return LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function automationLabel(value: string | null | undefined): string {
	if (!value) return "—";
	return AUTOMATION_LEVELS.find((o) => o.value === value)?.label ?? value;
}
