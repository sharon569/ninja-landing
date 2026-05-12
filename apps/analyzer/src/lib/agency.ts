// Agency dashboard — client-safe types and labels.

export interface ClientSummary {
	id: string;
	name: string;
	host: string;
	vertical: string | null;
	language: string | null;
	country: string | null;
	createdAt: string;        // ISO
	lastScanAt: string | null;
	lastGscRowFetchedAt: string | null;

	profileCompletionPct: number;
	healthScore: number;
	healthBand: "excellent" | "good" | "warn" | "poor";
	healthColor: string;

	// Workflow counts
	openOpps: number;
	highImpactOpps: number;
	needsReviewOpps: number;
	approvedNotApplied: number;       // approved opps not yet manually_applied
	monitoringOpps: number;
	pendingImpactReview: number;      // monitoring with no review yet for any window

	briefsPending: number;            // draft + needs_human_review
	briefsApproved: number;

	linksSuggested: number;           // suggested + needs_human_review
	linksApproved: number;

	techHighSeverity: number;

	keywordsCount: number;
}

export interface AgencyTotals {
	activeClients: number;
	avgHealthScore: number;
	totalWorkflowOpen: number;
	totalHighImpact: number;
	totalNeedsReview: number;
	totalMonitoring: number;
	totalTechCritical: number;
	totalBriefsPending: number;
	healthBands: { excellent: number; good: number; warn: number; poor: number };
}

export interface AttentionItem {
	clientId: string;
	clientName: string;
	host: string;
	healthScore: number;
	healthBand: ClientSummary["healthBand"];
	highImpactOpps: number;
	needsReviewOpps: number;
	approvedNotApplied: number;
	techHighSeverity: number;
	staleGscDays: number | null;
	staleScanDays: number | null;
	urgencyScore: number;             // 0..100 — higher = more urgent
	reasons: string[];                // human-readable why
}

export interface QueueItem {
	id: string;                       // composite "type:id"
	clientId: string;
	clientName: string;
	sourceType: "opportunity" | "content_brief" | "internal_link";
	title: string;
	priorityScore: number;
	impact: string;
	status: string;
	relatedPage?: string;
	relatedKeyword?: string;
	needsDecision: boolean;
	updatedAt: string;
	link: string;                     // /clients/[id]/...
}

export interface Bottlenecks {
	awaitingApprovalOpps: number;     // recommended + needs_human_review
	briefsAwaitingReview: number;
	linksAwaitingReview: number;
	approvedNotApplied: number;
	monitoringAwaitingReview: number;
	clientsWithoutGscSync: number;
	clientsWithoutKeywordBank: number;
}

// Phase 12 — read-only execution health roll-up shown on Agency Dashboard.
// No actions on this surface; click-through goes to the per-client page only.
export interface ExecutionAgencyStats {
	clientsExecutionEnabled: number;
	awaitingExecute: number;          // status in dry_run_ready | awaiting_execution_approval
	dryRunFailed: number;             // status in dry_run_failed | dry_run_stale
	executedLast7d: number;
	rollbackAvailable: number;
}

export interface ActivityEntry {
	id: string;
	clientId: string;
	clientName: string;
	type: string;                     // human label
	tone: "good" | "neutral" | "warn" | "bad";
	title: string;
	note?: string;
	at: string;                       // ISO timestamp
}

export interface AgencyDashboard {
	clients: ClientSummary[];
	totals: AgencyTotals;
	attention: AttentionItem[];
	queue: QueueItem[];
	bottlenecks: Bottlenecks;
	recent: ActivityEntry[];
	execution: ExecutionAgencyStats;
}

// Filter buckets used in the matrix
export type HealthBandFilter = "all" | "excellent" | "good" | "warn" | "poor";

export function bandToneClass(band: ClientSummary["healthBand"]): string {
	switch (band) {
		case "excellent":
			return "text-go bg-go/10 border-go/30";
		case "good":
			return "text-gold bg-gold/10 border-gold/30";
		case "warn":
			return "text-gold bg-gold/10 border-gold/30";
		case "poor":
		default:
			return "text-blade bg-blade/10 border-blade/30";
	}
}
