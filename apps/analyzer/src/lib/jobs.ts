// Phase 16 — Job queue types (client-safe, no server-only imports).
//
// PipelineRun is a durable job record. The Telegram webhook (or UI, or cron)
// enqueues a job by inserting a row; the worker route (/api/jobs/drain)
// picks it up and runs it with per-client locking.

export const PIPELINE_RUN_TYPES = [
	"keyword_refresh",
	"full_refresh",
	"scan",
	"gsc_sync",
	"speed_audit",
	"content_generate",
] as const;

export type PipelineRunType = (typeof PIPELINE_RUN_TYPES)[number];

export const PIPELINE_RUN_STATUSES = ["queued", "running", "success", "failed"] as const;
export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number];

export const TRIGGERED_BY = ["telegram", "ui", "cron", "keyword_add"] as const;
export type TriggeredBy = (typeof TRIGGERED_BY)[number];

/** JSON-serialisable payload sent when enqueuing a job. */
export interface JobPayload {
	/** For keyword_refresh: the keyword IDs to process. */
	keywordIds?: string[];
	/** For scan: nothing extra needed (clientId is on the row). */
	/** For content_generate: briefId to generate content for. */
	briefId?: string;
	/** Generic key-value for future job types. */
	[key: string]: unknown;
}

/** JSON-serialisable result stored when a job completes. */
export interface JobResult {
	/** Human-readable one-liner. */
	summary?: string;
	/** Counts or details specific to the job type. */
	[key: string]: unknown;
}

// ─── Labels (Hebrew) ──────────────────────────────────────────

export const PIPELINE_TYPE_LABELS: Record<PipelineRunType, string> = {
	keyword_refresh: "רענון מילות מפתח",
	full_refresh: "רענון מלא",
	scan: "סריקה",
	gsc_sync: "סנכרון Search Console",
	speed_audit: "בדיקת מהירות",
	content_generate: "יצירת תוכן",
};

export const PIPELINE_STATUS_LABELS: Record<PipelineRunStatus, string> = {
	queued: "בתור",
	running: "רץ",
	success: "הושלם",
	failed: "נכשל",
};
// deployed Fri May 22 12:53:12 EEST 2026
