// Workflow Center — client-safe types and labels.
// Unified shape for items that need human attention across Opportunity,
// ContentBrief, InternalLinkSuggestion, and impact-tracked actions.

export type WorkflowSourceType = "opportunity" | "content_brief" | "internal_link" | "impact_review";

export interface WorkflowItem {
	id: string;                                      // composite: `${sourceType}:${sourceId}`
	sourceType: WorkflowSourceType;
	sourceId: string;
	clientId: string;

	title: string;
	subtitle?: string;
	description?: string;
	recommendedAction?: string;

	status: string;
	priorityScore: number;
	impact: string;
	effort: string;
	confidence: string;

	relatedKeyword?: string;
	relatedPage?: string;
	relatedQuery?: string;

	createdAt: string;        // ISO
	updatedAt: string;        // ISO

	needsDecision: boolean;   // true → highlight in 'needs decision' tab
	isMonitoring: boolean;    // true → goes under monitoring tab

	availableActions: WorkflowAction[];
	sourceMeta?: Record<string, unknown>; // sourceType-specific extras (manualActionUrl, briefType, etc.)

	// Phase 12 — read-only execution state for opportunities. The badge tells
	// the user the current state of any prepared ExecutionAction; the actual
	// Execute click lives only on the /execution page.
	executionBadge?: ExecutionWorkflowBadge | null;
}

export type ExecutionWorkflowBadge =
	| "execution_ready"
	| "awaiting_execute"
	| "dry_run_failed"
	| "dry_run_stale"
	| "executed"
	| "rollback_available"
	| "finalized";

export const EXECUTION_BADGE_LABEL: Record<ExecutionWorkflowBadge, string> = {
	execution_ready: "Execution Ready",
	awaiting_execute: "Awaiting Execute",
	dry_run_failed: "Dry Run Failed",
	dry_run_stale: "Dry Run Stale",
	executed: "Executed",
	rollback_available: "Rollback Available",
	finalized: "Finalized",
};

export const EXECUTION_BADGE_TONE: Record<ExecutionWorkflowBadge, "good" | "warn" | "bad" | "neutral"> = {
	execution_ready: "warn",
	awaiting_execute: "warn",
	dry_run_failed: "bad",
	dry_run_stale: "bad",
	executed: "good",
	rollback_available: "warn",
	finalized: "good",
};

export type WorkflowAction =
	| "approve"
	| "reject"
	| "dismiss"
	| "needs_human_review"
	| "mark_manual_applied"
	| "mark_used"
	| "review_7d"
	| "review_14d"
	| "review_30d";

export const SOURCE_LABEL: Record<WorkflowSourceType, string> = {
	opportunity: "הזדמנות",
	content_brief: "בריף תוכן",
	internal_link: "קישור פנימי",
	impact_review: "מעקב השפעה",
};

export const SOURCE_TONE: Record<WorkflowSourceType, string> = {
	opportunity: "blade",       // red — actionable
	content_brief: "gold",      // amber — needs work
	internal_link: "go",        // green — easy gain
	impact_review: "ink-dim",   // muted — info
};

export const WORKFLOW_TABS = [
	{ value: "all", label: "הכל" },
	{ value: "needs_decision", label: "דורש החלטה" },
	{ value: "high_impact", label: "High Impact" },
	{ value: "content", label: "תוכן" },
	{ value: "internal_links", label: "קישורים פנימיים" },
	{ value: "technical", label: "טכני" },
	{ value: "monitoring", label: "במעקב" },
	{ value: "approved", label: "אושר" },
] as const;

export type WorkflowTab = (typeof WORKFLOW_TABS)[number]["value"];

export interface WorkflowCounts {
	total: number;
	needsDecision: number;
	highImpact: number;
	content: number;
	internalLinks: number;
	technical: number;
	monitoring: number;
	approved: number;
}

export function actionLabel(a: WorkflowAction): string {
	switch (a) {
		case "approve":
			return "אישור";
		case "reject":
			return "דחייה";
		case "dismiss":
			return "הסרה";
		case "needs_human_review":
			return "לסקירה";
		case "mark_manual_applied":
			return "סומן כבוצע ידנית";
		case "mark_used":
			return "סומן כנוצל";
		case "review_7d":
			return "בדוק 7d";
		case "review_14d":
			return "בדוק 14d";
		case "review_30d":
			return "בדוק 30d";
	}
}
