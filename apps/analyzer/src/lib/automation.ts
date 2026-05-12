// Automation — client-safe types and labels.

export const RUN_TYPE_LABELS: Record<string, string> = {
	agency_auto_sync: "סנכרון סוכנות (Agency)",
	gsc_sync: "סנכרון GSC",
	technical_audit: "ניתוח טכני",
	opportunity_analysis: "ניתוח הזדמנויות",
	impact_review: "Impact Review",
	full_client_refresh: "ריענון מלא של לקוח",
};

export const RUN_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
	queued: { label: "בתור", tone: "neutral" },
	running: { label: "רץ", tone: "neutral" },
	success: { label: "הצליח", tone: "good" },
	partial_success: { label: "חלקי", tone: "warn" },
	failed: { label: "נכשל", tone: "bad" },
	skipped: { label: "דולג", tone: "mute" },
};

export function runTypeLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return RUN_TYPE_LABELS[v] ?? v;
}

export function runStatusLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return RUN_STATUS_LABELS[v]?.label ?? v;
}

export function runStatusTone(v: string | null | undefined): string {
	if (!v) return "neutral";
	return RUN_STATUS_LABELS[v]?.tone ?? "neutral";
}

// Freshness thresholds — used by both server and UI for consistency.
export const GSC_SYNC_STALE_DAYS = 7;
export const TECH_AUDIT_STALE_DAYS = 14;
export const OPP_ANALYSIS_STALE_DAYS = 7;

// Safety caps for the agency sync
export const MAX_CLIENTS_PER_RUN = 10;
export const MAX_CONCURRENT_CLIENTS = 2;
