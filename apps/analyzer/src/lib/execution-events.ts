// Phase 13 — ExecutionEvent client-safe types and labels.

export type ExecutionEventType =
	| "dry_run_completed"
	| "dry_run_failed"
	| "dry_run_stale"
	| "execution_started"
	| "execution_succeeded"
	| "execution_failed"
	| "rollback_succeeded"
	| "rollback_failed"
	| "rollback_blocked_drift"
	| "execution_stuck"
	| "readiness_failed"
	| "plugin_unreachable"
	| "write_api_disabled"
	| "test_alert";

export type ExecutionEventSeverity = "info" | "success" | "warning" | "error" | "critical";

export const EVENT_TYPE_LABEL: Record<ExecutionEventType, string> = {
	dry_run_completed: "Dry Run הסתיים",
	dry_run_failed: "Dry Run נכשל",
	dry_run_stale: "Dry Run לא טרי",
	execution_started: "Execute התחיל",
	execution_succeeded: "Execute הצליח",
	execution_failed: "Execute נכשל",
	rollback_succeeded: "Rollback הצליח",
	rollback_failed: "Rollback נכשל",
	rollback_blocked_drift: "Rollback נחסם (drift)",
	execution_stuck: "ExecutionAction תקועה",
	readiness_failed: "Readiness נכשל",
	plugin_unreachable: "פלאגין לא נגיש",
	write_api_disabled: "Write API כבוי",
	test_alert: "התראת בדיקה",
};

export const SEVERITY_LABEL: Record<ExecutionEventSeverity, string> = {
	info: "מידע",
	success: "הצלחה",
	warning: "אזהרה",
	error: "שגיאה",
	critical: "קריטי",
};

export const SEVERITY_TONE: Record<ExecutionEventSeverity, "good" | "warn" | "bad" | "neutral"> = {
	info: "neutral",
	success: "good",
	warning: "warn",
	error: "bad",
	critical: "bad",
};

// Which event types are "noisy good news" — Sharon doesn't want alerts on
// these unless EXECUTION_ALERT_SUCCESS=true is explicitly set.
export const SUCCESS_EVENT_TYPES: ExecutionEventType[] = [
	"dry_run_completed",
	"execution_succeeded",
	"rollback_succeeded",
];

// Which event types ALWAYS trigger an alert dispatch attempt (gated by env).
// test_alert is included so the manual "send test" button actually exercises
// the full Slack/email pipeline end-to-end.
export const ALWAYS_ALERT_EVENT_TYPES: ExecutionEventType[] = [
	"execution_failed",
	"dry_run_stale",
	"rollback_blocked_drift",
	"rollback_failed",
	"plugin_unreachable",
	"write_api_disabled",
	"readiness_failed",
	"execution_stuck",
	"test_alert",
];

// Window for dedupe — same (clientId, executionActionId, eventType) within
// this many minutes is suppressed.
export const ALERT_DEDUPE_MINUTES = 30;

// How long an ExecutionAction can sit in 'executing' before we flag it stuck.
export const EXECUTION_STUCK_MINUTES = 10;

export function eventTypeLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return EVENT_TYPE_LABEL[v as ExecutionEventType] ?? v;
}

export function severityTone(v: string | null | undefined): string {
	if (!v) return "neutral";
	return SEVERITY_TONE[v as ExecutionEventSeverity] ?? "neutral";
}

export function severityLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return SEVERITY_LABEL[v as ExecutionEventSeverity] ?? v;
}
