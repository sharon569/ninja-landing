// Phase 15D.0 — SEO Work Plan (client-safe types + labels).
// Server logic in work-plan-server.ts.

export type PlanStatus =
	| "draft"
	| "needs_review"
	| "approved"
	| "preparing"
	| "prepared"
	| "partially_prepared"
	| "completed"
	| "cancelled"
	| "superseded";

export type PlanType =
	| "monthly_seo_work"
	| "quick_wins"
	| "technical_cleanup"
	| "meta_optimization"
	| "content_strategy"
	| "internal_links"
	| "mixed";

// Plan items are bucketed into one of these display groups. Internal Linking
// + Safe Meta etc. are *safe* groups (prepare-only auto-approval allowed).
// Human Review / Blocked / Monitor are surface-only groups.
export type ItemGroup =
	| "safe_meta"
	| "quick_wins"
	| "content_expansion"
	| "internal_linking"
	| "human_review"
	| "blocked"
	| "monitor_only";

export type ItemDecision =
	| "auto_prepare"   // Plan can prepare the downstream action when group is approved
	| "human_review"   // Plan surfaces it; operator must decide
	| "blocked"        // Cannot proceed (scope ineligible, plugin not ready, etc.)
	| "monitor_only"   // Track, don't act
	| "skip";          // Excluded from this plan run

export type ItemAutomationMode =
	| "prepare_only"
	| "manual_only";

export type ItemStatus =
	| "planned"
	| "approved"
	| "preparing"
	| "prepared"
	| "failed"
	| "skipped"
	| "needs_human_review"
	| "completed";

export type ItemSourceType =
	| "opportunity"
	| "keyword_strategy"
	| "content_brief"
	| "internal_link_suggestion";

// ─── Hebrew labels ─────────────────────────────────────────────

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
	draft: "טיוטה",
	needs_review: "ממתין לאישור",
	approved: "מאושר",
	preparing: "בהכנה",
	prepared: "מוכן",
	partially_prepared: "מוכן חלקית",
	completed: "הושלם",
	cancelled: "בוטל",
	superseded: "הוחלף",
};

export const PLAN_STATUS_TONE: Record<PlanStatus, "good" | "warn" | "bad" | "neutral" | "mute"> = {
	draft: "neutral",
	needs_review: "warn",
	approved: "good",
	preparing: "warn",
	prepared: "good",
	partially_prepared: "warn",
	completed: "good",
	cancelled: "mute",
	superseded: "mute",
};

export const PLAN_TYPE_LABEL: Record<PlanType, string> = {
	monthly_seo_work: "תוכנית עבודה חודשית",
	quick_wins: "Quick Wins",
	technical_cleanup: "ניקוי טכני",
	meta_optimization: "אופטימיזציית Meta",
	content_strategy: "אסטרטגיית תוכן",
	internal_links: "קישורים פנימיים",
	mixed: "מעורב",
};

export const GROUP_LABEL: Record<ItemGroup, string> = {
	safe_meta: "Safe Meta Fixes",
	quick_wins: "Quick Wins",
	content_expansion: "הרחבת תוכן",
	internal_linking: "קישורים פנימיים",
	human_review: "סקירה אנושית",
	blocked: "חסומים / אל תיגע",
	monitor_only: "במעקב",
};

export const GROUP_DESCRIPTION: Record<ItemGroup, string> = {
	safe_meta: "Title / Meta Description עם נתונים ברורים, סיכון נמוך, מותרים ב-Allowed Actions ובסקופ SEO. אישור מכין ExecutionActions ב-draft.",
	quick_wins: "ביטויים במרחק נגיעה מ-Top 5, יש page fit ו-CTR gap. אישור מכין Brief לאופטימיזציה.",
	content_expansion: "האסטרטגיה מצביעה על הרחבה / יצירת תוכן חדש. אישור יוצר Briefs מתאימים.",
	internal_linking: "הצעות קישור פנימי שעברו את הגייטים. אישור מאשר אותן ל-staging.",
	human_review: "פריטים שהמערכת לא יכולה להחליט עליהם לבד — Top 5, סיכון גבוה, פערי נתונים, וכו'.",
	blocked: "עמודי utility/legal/system, סקופ לא מתאים, או חוסרי readiness. רק לסיכום — לא לעבוד עליהם.",
	monitor_only: "ביטויים יציבים שאנחנו רק מסתכלים עליהם — לא לשנות עכשיו.",
};

export const GROUP_TONE: Record<ItemGroup, "good" | "warn" | "bad" | "neutral"> = {
	safe_meta: "good",
	quick_wins: "good",
	content_expansion: "good",
	internal_linking: "good",
	human_review: "warn",
	blocked: "bad",
	monitor_only: "neutral",
};

// Which groups are eligible for the "Approve" button.
export const APPROVABLE_GROUPS: ItemGroup[] = [
	"safe_meta",
	"quick_wins",
	"content_expansion",
	"internal_linking",
];

export const DECISION_LABEL: Record<ItemDecision, string> = {
	auto_prepare: "להכנה אוטומטית",
	human_review: "דורש סקירה",
	blocked: "חסום",
	monitor_only: "מעקב בלבד",
	skip: "מדולג",
};

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
	planned: "מתוכנן",
	approved: "אושר",
	preparing: "בהכנה",
	prepared: "הוכן",
	failed: "נכשל",
	skipped: "דולג",
	needs_human_review: "דורש סקירה",
	completed: "הושלם",
};

export const ITEM_SOURCE_LABEL: Record<ItemSourceType, string> = {
	opportunity: "הזדמנות",
	keyword_strategy: "אסטרטגיית מילה",
	content_brief: "Brief",
	internal_link_suggestion: "קישור פנימי",
};

// Plan summary payload — used by builder + UI.
export interface PlanGroupSummary {
	group: ItemGroup;
	total: number;
	byDecision: Partial<Record<ItemDecision, number>>;
}

export interface PlanSummary {
	totalItems: number;
	safeItemsCount: number;
	reviewItemsCount: number;
	blockedItemsCount: number;
	monitorItemsCount: number;
	byGroup: Record<ItemGroup, PlanGroupSummary>;
}

// Approve all approvable safe groups at once.
export const SAFE_AUTO_PREPARE_GROUPS: ItemGroup[] = APPROVABLE_GROUPS;
