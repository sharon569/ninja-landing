// Phase 14D — Keyword Strategy Planner (client-safe types).
//
// Pure data model: the engine builds a per-keyword strategic plan with a
// Why-grounded action roadmap, opportunity score, and measurement plan.
// Mirrors decision.ts's invariant — every action step must carry a
// substantive Why grounded in real GSC numbers. Generic steps are rejected.

export type StrategyType =
	| "protect_position"
	| "quick_win"
	| "content_boost"
	| "internal_link_boost"
	| "new_content_needed"
	| "cannibalization_fix"
	| "technical_blocker"
	| "monitor_only"
	| "not_worth_targeting_now";

export type StrategyStatus =
	| "draft"
	| "needs_human_review"
	| "approved"
	| "active"
	| "monitoring"
	| "completed"
	| "paused"
	| "rejected";

// What kind of operator move each action step represents. Mapped to existing
// system primitives so the UI can link to the right surface.
export type ActionType =
	| "monitor"
	| "title_meta_update"
	| "meta_description_update"
	| "content_expansion"
	| "internal_linking"
	| "new_article"
	| "new_landing_page"
	| "technical_fix"
	| "cannibalization_fix"
	| "no_change";

export type ActionRisk = "low" | "medium" | "high";
export type ActionEffort = "low" | "medium" | "high";
export type ActionPriority = "low" | "medium" | "high";

export interface ActionStep {
	stepNumber: number;
	actionType: ActionType;
	action: string;                  // Hebrew, specific (no generic "improve content")
	why: string;                     // INVARIANT: substantive, references numbers/queries
	expectedImpact: string;          // Hebrew narrative
	risk: ActionRisk;
	effort: ActionEffort;
	priority: ActionPriority;
	requiredData?: string[];         // what GSC/profile fields back the step
	requiresHumanReview: boolean;
	suggestedTiming: "now" | "after_step" | "after_30d" | "as_needed";
	relatedSurface?: {
		// Where in the system can the operator act on this step?
		opportunityId?: string;
		briefId?: string;
		internalLinkId?: string;
	};
}

// Snapshot of what we know about the keyword RIGHT NOW (engine input).
export interface KeywordResearchSnapshot {
	keyword: string;
	targetPage: string | null;       // from TargetKeyword.targetUrl
	rankingPage: string | null;      // top page from GSC for this query
	targetPageMismatch: boolean;     // ranking != target
	currentPosition: number | null;
	positionBucket: "1-3" | "4-5" | "6-10" | "11-20" | "21+" | "not_ranking" | "unknown";
	clicks28d: number;
	impressions28d: number;
	ctrPct: number;                  // 0..100
	trend: "up" | "down" | "flat" | "unknown";
	topQueriesOnRankingPage: Array<{
		query: string;
		clicks: number;
		impressions: number;
		ctrPct: number;
		position: number;
	}>;
	competingPages: string[];        // pages on the same domain ranking on this keyword
	intent: "informational" | "commercial" | "transactional" | "local" | "navigational" | "mixed" | "unknown";
	pageFit: "match" | "partial" | "mismatch" | "unknown";
	// Phase 15C.2 — when the top page Google shows for this query is a
	// utility / legal / system page (cart, checkout, terms…), we cannot use
	// it as the SEO ranking page. We still record it so the operator sees
	// "Google ranks this query on a non-SEO page — needs different target".
	rankingPageIneligibleUrl?: string | null;
	rankingPageIneligibleReason?: string | null;
}

export interface MeasurementPlan {
	baselineDate: string;            // ISO
	primaryKeyword: string;
	primaryPage: string | null;
	secondaryQueries: string[];      // queries on the ranking page that we want to protect
	metrics: ("position" | "clicks" | "impressions" | "ctr")[];
	reviewWindows: ("7d" | "14d" | "30d")[];
	successCondition: string;        // Hebrew, specific to this keyword
	warningCondition: string;        // Hebrew, specific to this keyword
	nextDecisionPoint: string;       // when do we re-evaluate the strategy
}

export interface ResearchNotes {
	whatWeKnow: string[];
	whatWeDontKnow: string[];
	whatToCheckManually: string[];
	whyThisStrategy: string[];
}

export interface KeywordStrategySummary {
	keyword: string;
	strategyType: StrategyType;
	riskLevel: "low" | "medium" | "high" | "critical";
	confidence: "low" | "medium" | "high";
	opportunityScore: number;        // 0..100
	summary: string;                 // Hebrew top-line recommendation

	snapshot: KeywordResearchSnapshot;
	actionPlan: ActionStep[];        // ordered roadmap
	researchNotes: ResearchNotes;
	measurementPlan: MeasurementPlan;

	// Links to related items in the existing system
	relatedOpportunities: string[];  // opportunity ids
	relatedBriefs: string[];         // brief ids
	relatedInternalLinks: string[];  // internal link suggestion ids
	relatedExecutions: string[];     // execution action ids

	computedAt: string;              // ISO
	engineVersion: string;
}

// ─── Labels ──────────────────────────────────────────────────

export const STRATEGY_TYPE_LABEL: Record<StrategyType, string> = {
	protect_position: "הגנה על מיקום",
	quick_win: "Quick Win",
	content_boost: "חיזוק תוכן",
	internal_link_boost: "חיזוק קישורים פנימיים",
	new_content_needed: "נדרש תוכן חדש",
	cannibalization_fix: "תיקון קניבליזציה",
	technical_blocker: "חסם טכני",
	monitor_only: "מעקב בלבד",
	not_worth_targeting_now: "לא שווה להשקיע כרגע",
};

export const STRATEGY_TYPE_TONE: Record<StrategyType, "good" | "warn" | "bad" | "neutral" | "mute"> = {
	protect_position: "warn",        // careful, don't break it
	quick_win: "good",
	content_boost: "good",
	internal_link_boost: "good",
	new_content_needed: "warn",
	cannibalization_fix: "bad",
	technical_blocker: "bad",
	monitor_only: "neutral",
	not_worth_targeting_now: "mute",
};

export const STRATEGY_STATUS_LABEL: Record<StrategyStatus, string> = {
	draft: "טיוטה",
	needs_human_review: "דורש סקירה",
	approved: "אושר",
	active: "פעיל",
	monitoring: "במעקב",
	completed: "הושלם",
	paused: "מושהה",
	rejected: "נדחה",
};

export const STRATEGY_STATUS_TONE: Record<StrategyStatus, "good" | "warn" | "bad" | "neutral" | "mute"> = {
	draft: "mute",
	needs_human_review: "warn",
	approved: "warn",
	active: "good",
	monitoring: "neutral",
	completed: "good",
	paused: "mute",
	rejected: "bad",
};

export const ACTION_TYPE_LABEL: Record<ActionType, string> = {
	monitor: "מעקב",
	title_meta_update: "עדכון Title",
	meta_description_update: "עדכון Meta Description",
	content_expansion: "הרחבת תוכן",
	internal_linking: "קישורים פנימיים",
	new_article: "מאמר חדש",
	new_landing_page: "עמוד נחיתה חדש",
	technical_fix: "תיקון טכני",
	cannibalization_fix: "פתרון קניבליזציה",
	no_change: "לא לשנות",
};

export const ACTION_TYPE_TONE: Record<ActionType, "good" | "warn" | "bad" | "neutral" | "mute"> = {
	monitor: "neutral",
	title_meta_update: "warn",
	meta_description_update: "warn",
	content_expansion: "good",
	internal_linking: "good",
	new_article: "good",
	new_landing_page: "warn",
	technical_fix: "warn",
	cannibalization_fix: "bad",
	no_change: "mute",
};

export const POSITION_BUCKET_LABEL: Record<KeywordResearchSnapshot["positionBucket"], string> = {
	"1-3": "Top 3",
	"4-5": "Top 5",
	"6-10": "Top 10",
	"11-20": "עמוד 2",
	"21+": "מתחת לעמוד 2",
	"not_ranking": "לא מדורג",
	"unknown": "לא ידוע",
};

export const ENGINE_VERSION = "14d.1";

// ─── Invariant check (mirrors decision.ts) ──────────────────

const GENERIC_WHY_PATTERNS = [
	/^זה\s+ישפר\s+SEO/i,
	/^זה\s+יחזק\s+את\s+העמוד/i,
	/^שיפור\s+תוכן/i,
	/^better for seo/i,
	/^improves seo/i,
];

export function isSubstantiveActionWhy(why: string | null | undefined): boolean {
	if (!why) return false;
	const t = why.trim();
	if (t.length < 30) return false;
	for (const p of GENERIC_WHY_PATTERNS) if (p.test(t)) return false;
	const hasNumber = /\d/.test(t);
	const hasQueryOrKeyword = /["'״“][^"'״”]{2,}["'״”]|CTR|impressions|clicks|מיקום|חשיפות|קליקים|הקלקות|ביטוי|query/i.test(t);
	return hasNumber || hasQueryOrKeyword;
}
