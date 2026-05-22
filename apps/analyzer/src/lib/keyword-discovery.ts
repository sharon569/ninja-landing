// Phase 16.2 — Keyword Discovery types (client-safe).

export interface DiscoveryResult {
	clientId: string;
	totalGscQueries: number;
	alreadyInBank: number;
	filtered: number;
	suggested: number;
	updated: number;
	durationMs: number;
}

export interface SuggestedKeyword {
	id: string;
	query: string;
	page: string | null;
	clicks28d: number;
	impressions28d: number;
	ctr: number | null;
	position: number | null;
	trend: string | null;
	score: number;
	intent: string | null;
	reason: string;
	status: string;
}

// ─── Scoring constants ────────────────────────────────────────

/** Minimum impressions in 28 days to be considered. */
export const MIN_IMPRESSIONS = 100;

/** Skip queries already in top 3 (low priority — already winning). */
export const MIN_POSITION = 4;

/** Skip queries ranked beyond 50 (too far, low confidence). */
export const MAX_POSITION = 50;

/** Max suggestions per discovery run per client. */
export const MAX_SUGGESTIONS_PER_RUN = 30;

// ─── Labels ───────────────────────────────────────────────────

export const SUGGESTION_STATUS_LABELS: Record<string, string> = {
	suggested: "מוצע",
	approved: "אושר",
	rejected: "נדחה",
	converted: "הומר למילת מפתח",
};
