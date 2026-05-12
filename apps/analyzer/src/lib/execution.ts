// Phase 11 — Execution Engine client-safe types/labels.

export type ExecutionActionType =
	| "yoast_title_update"
	| "yoast_description_update"
	| "image_alt_update"
	| "internal_link_insert"
	| "content_snippet_insert";

export type ExecutionStatus =
	| "draft"
	| "dry_run_ready"
	| "dry_run_failed"
	| "awaiting_execution_approval" // alias for dry_run_ready (live flow)
	| "preview_only" // HTML-mutating actions in v0.3 — no execute path
	| "executing"
	| "executed"
	| "failed"
	| "cancelled"
	| "rollback_available"
	| "rolled_back";

export type ExecutionSourceType = "opportunity" | "content_brief" | "internal_link_suggestion";

// v0.3: only Yoast title/desc and image alt are executable on the server.
// The two HTML-mutating ones return preview only.
export const EXECUTABLE_ACTIONS: ExecutionActionType[] = [
	"yoast_title_update",
	"yoast_description_update",
	"image_alt_update",
];

export const DRY_RUN_ONLY_ACTIONS: ExecutionActionType[] = [
	"internal_link_insert",
	"content_snippet_insert",
];

export const ROLLBACK_SUPPORTED_ACTIONS: ExecutionActionType[] = [
	"yoast_title_update",
	"yoast_description_update",
	"image_alt_update",
];

export const ACTION_TYPE_LABELS: Record<ExecutionActionType, string> = {
	yoast_title_update: "עדכון Title (Yoast)",
	yoast_description_update: "עדכון Meta Description (Yoast)",
	image_alt_update: "עדכון Alt Text לתמונה",
	internal_link_insert: "הוספת קישור פנימי (Preview בלבד)",
	content_snippet_insert: "הוספת snippet תוכן (Preview בלבד)",
};

export const STATUS_LABELS: Record<ExecutionStatus, { label: string; tone: "good" | "warn" | "bad" | "neutral" | "mute" }> = {
	draft: { label: "טיוטה", tone: "mute" },
	dry_run_ready: { label: "Dry Run הצליח — מחכה לאישור ביצוע", tone: "warn" },
	dry_run_failed: { label: "Dry Run נכשל", tone: "bad" },
	awaiting_execution_approval: { label: "מחכה לאישור ביצוע", tone: "warn" },
	preview_only: { label: "Preview בלבד (לבצע ידנית)", tone: "neutral" },
	executing: { label: "מבצע…", tone: "neutral" },
	executed: { label: "בוצע באתר", tone: "good" },
	failed: { label: "ביצוע נכשל", tone: "bad" },
	cancelled: { label: "בוטל", tone: "mute" },
	rollback_available: { label: "ניתן לבצע Rollback", tone: "warn" },
	rolled_back: { label: "בוצע Rollback", tone: "mute" },
};

export const SOURCE_TYPE_LABELS: Record<ExecutionSourceType, string> = {
	opportunity: "Opportunity",
	content_brief: "בריף תוכן",
	internal_link_suggestion: "קישור פנימי",
};

export function actionTypeLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return ACTION_TYPE_LABELS[v as ExecutionActionType] ?? v;
}

export function statusLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return STATUS_LABELS[v as ExecutionStatus]?.label ?? v;
}

export function statusTone(v: string | null | undefined): string {
	if (!v) return "neutral";
	return STATUS_LABELS[v as ExecutionStatus]?.tone ?? "neutral";
}

export function sourceTypeLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return SOURCE_TYPE_LABELS[v as ExecutionSourceType] ?? v;
}

export function isExecutable(actionType: string): boolean {
	return (EXECUTABLE_ACTIONS as string[]).includes(actionType);
}

export function isDryRunOnly(actionType: string): boolean {
	return (DRY_RUN_ONLY_ACTIONS as string[]).includes(actionType);
}

export function isRollbackSupported(actionType: string): boolean {
	return (ROLLBACK_SUPPORTED_ACTIONS as string[]).includes(actionType);
}

// Hard-coded confirmation copy per Sharon's spec — must say it's a live change.
export const EXECUTE_CONFIRMATION_TEXT =
	"פעולה זו תבצע שינוי חי באתר WordPress של הלקוח. הפעולה כבר עברה Dry Run, אך עדיין מומלץ לבדוק את ה-Diff לפני ביצוע. האם לבצע עכשיו?";
export const EXECUTE_CONFIRMATION_BUTTON = "כן, לבצע שינוי באתר";
