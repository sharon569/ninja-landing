// Phase 14C — SEO Decision Intelligence layer (client-safe types).
//
// CORE INVARIANT: if the engine can't ground a recommendation in real
// numbers (impressions, clicks, CTR, position), it does NOT recommend
// execution. The `whyThisIsBetter` field must be substantive — generic
// SEO platitudes are explicitly disallowed.

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type Confidence = "low" | "medium" | "high";

// What the system advises the operator to actually do.
// Only `safe_to_execute` and `quick_win` allow ExecutionAction creation.
export type RecommendedNextStep =
	| "safe_to_execute"
	| "quick_win"
	| "human_review"
	| "monitor"
	| "research_needed"
	| "no_change";

// Reasons that drive risk / confidence — used for tooltips and UI badges.
export type RiskReason =
	| "top_3_position"
	| "top_5_position"
	| "traffic_concentration"      // one query brings most of a page's clicks
	| "intent_mismatch"
	| "insufficient_data"
	| "high_click_page"            // page already gets meaningful clicks
	| "multiple_winning_queries"   // page ranks well on several queries
	| "brand_voice_sensitive"
	| "ymyl_vertical"              // Your Money Your Life — medical/legal/financial
	| "possible_cannibalization"
	| "intent_unclear";

export type DecisionBadge =
	| "safe_to_test"
	| "quick_win"
	| "needs_human_review"
	| "high_risk"
	| "monitor_only"
	| "do_not_change_yet"
	| "research_needed";

export const RISK_LABEL: Record<RiskLevel, string> = {
	low: "סיכון נמוך",
	medium: "סיכון בינוני",
	high: "סיכון גבוה",
	critical: "סיכון קריטי",
};

export const RISK_TONE: Record<RiskLevel, "good" | "warn" | "bad" | "neutral"> = {
	low: "good",
	medium: "warn",
	high: "bad",
	critical: "bad",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
	low: "ביטחון נמוך",
	medium: "ביטחון בינוני",
	high: "ביטחון גבוה",
};

export const NEXT_STEP_LABEL: Record<RecommendedNextStep, string> = {
	safe_to_execute: "בטוח לביצוע",
	quick_win: "Quick Win — מומלץ לבצע",
	human_review: "דורש סקירה אנושית",
	monitor: "להמשיך לעקוב",
	research_needed: "נדרש מחקר נוסף",
	no_change: "לא לשנות כרגע",
};

export const NEXT_STEP_TONE: Record<RecommendedNextStep, "good" | "warn" | "bad" | "neutral" | "mute"> = {
	safe_to_execute: "good",
	quick_win: "good",
	human_review: "warn",
	monitor: "mute",
	research_needed: "warn",
	no_change: "bad",
};

export const RISK_REASON_LABEL: Record<RiskReason, string> = {
	top_3_position: "העמוד מדורג Top 3 — שינוי אגרסיבי עלול לפגוע",
	top_5_position: "העמוד מדורג Top 5 — צריך זהירות",
	traffic_concentration: "רוב התנועה של העמוד מגיעה מביטוי אחר",
	intent_mismatch: "כוונת החיפוש לא תואמת לסוג העמוד",
	insufficient_data: "אין מספיק נתונים מ-Search Console",
	high_click_page: "העמוד כבר מקבל קליקים — שינוי דורש זהירות",
	multiple_winning_queries: "העמוד מנצח על מספר ביטויים — שינוי כיוון מסוכן",
	brand_voice_sensitive: "טון מותג רגיש לסוג העסק הזה",
	ymyl_vertical: "תחום YMYL (רפואי/משפטי/פיננסי) — דרושה זהירות יתרה",
	possible_cannibalization: "ייתכן קניבליזציה בין עמודים על אותו ביטוי",
	intent_unclear: "כוונת החיפוש של הביטוי לא ברורה מהנתונים",
};

export const BADGE_LABEL: Record<DecisionBadge, string> = {
	safe_to_test: "בטוח לבדיקה",
	quick_win: "Quick Win",
	needs_human_review: "דורש סקירה אנושית",
	high_risk: "סיכון גבוה",
	monitor_only: "מעקב בלבד",
	do_not_change_yet: "לא לשנות כרגע",
	research_needed: "נדרש מחקר",
};

export const BADGE_TONE: Record<DecisionBadge, "good" | "warn" | "bad" | "neutral"> = {
	safe_to_test: "good",
	quick_win: "good",
	needs_human_review: "warn",
	high_risk: "bad",
	monitor_only: "neutral",
	do_not_change_yet: "bad",
	research_needed: "warn",
};

// ─── Evidence shapes ──────────────────────────────────────────

export interface QueryEvidence {
	query: string;
	page: string | null;
	impressions: number;
	clicks: number;
	ctrPct: number;            // 0-100
	position: number;          // weighted average
	trend?: "up" | "down" | "flat" | "unknown";
}

export interface PageQueryPortfolio {
	page: string;
	totalImpressions28d: number;
	totalClicks28d: number;
	topQueries: QueryEvidence[];          // top 5 by clicks
	dominantQuery: QueryEvidence | null;  // share of clicks > 50%
	dominantShare: number;                // 0..1
	protectedQueries: string[];           // queries we should NOT break
}

export interface DataSufficiency {
	sufficient: boolean;
	impressionsCount: number;
	clicksCount: number;
	daysOfData: number;
	missing: string[];                    // human-readable missing pieces
}

export interface IntentFit {
	queryIntent: "informational" | "commercial" | "transactional" | "local" | "navigational" | "mixed" | "unknown";
	pageType: "post" | "page" | "product" | "product_cat" | "unknown";
	fit: "match" | "partial" | "mismatch" | "unknown";
	reasoning: string;                    // Hebrew, references the query
}

export interface BusinessFit {
	matchesClientVertical: boolean;
	matchesServiceArea: boolean | "unknown";
	matchesBrandVoice: boolean | "unknown";
	matchesPagePurpose: boolean | "unknown";
	warnings: string[];                   // Hebrew, specific
}

export interface PositionStatus {
	avgPosition: number | null;
	bucket: "1-3" | "4-5" | "6-15" | "16+" | "unknown";
	risk: RiskLevel;                      // derived from bucket
	advice: string;                       // Hebrew, what's safe at this position
}

// ─── Justifications (Why Layer) ───────────────────────────────

export interface TitleJustification {
	currentTitle: string | null;
	currentTitleStrengths: string[];
	currentTitleWeaknesses: string[];
	suggestedTitle: string | null;
	suggestedTitleAdvantages: string[];
	searchConsoleSupport: string;         // narrative referencing real numbers
	protectedQueries: string[];
	riskNotes: string[];
	whyThisIsBetter: string;              // INVARIANT: substantive or empty (which blocks recommend)
	whyNotOnlyMetaChange?: string;
	confidence: Confidence;
}

export interface MetaJustification {
	currentMeta: string | null;
	currentMetaIssue: string;
	suggestedMetaAdvantages: string[];
	expectedCtrImpact: string;            // narrative
	intentFit: string;
	businessFit: string;
	riskNotes: string[];
	whyThisIsBetter: string;
	confidence: Confidence;
}

export interface ContentJustification {
	currentContentGap: string;
	searchIntentReasoning: string;
	gscEvidence: string;
	recommendedContentBlock: string;      // human-readable suggestion (NOT writing copy)
	whyThisContentHelps: string;
	whyNotOnlyMetaChange: string;
	whyNotNewPage: string;
	businessFit: string;
	riskNotes: string[];
	successMeasurement: string;
	confidence: Confidence;
}

// ─── Measurement plan ─────────────────────────────────────────

export interface MeasurementPlan {
	primaryQuery: string | null;
	relatedPage: string | null;
	primaryMetric: "ctr" | "clicks" | "impressions" | "position";
	expectedOutcome: string;              // narrative
	failureSignal: string;                // narrative
	windows: ("7d" | "14d" | "30d")[];
	protectedMetrics: string[];           // queries/pages whose performance must not drop
}

// ─── Why / Why-Not / Safer Alternative ────────────────────────

export interface WhyNot {
	possibleRisks: string[];              // Hebrew
	whatCouldGoWrong: string[];
	whatToProtect: string[];              // protected queries / metrics
	saferAlternativeSummary: string;
	whenToAvoidThisChange: string;
}

export interface SaferAlternative {
	summary: string;                      // 1-line Hebrew description
	steps: string[];                      // ordered Hebrew steps
	expectedBenefit: string;
}

// ─── Aggregate ────────────────────────────────────────────────

export interface DecisionSummary {
	// Top-level recommendation
	recommendation: string;               // Hebrew, what to do
	recommendedNextStep: RecommendedNextStep;
	badge: DecisionBadge;
	needsHumanReview: boolean;

	// Risk + confidence
	riskLevel: RiskLevel;
	riskReasons: RiskReason[];
	confidence: Confidence;

	// Evidence
	primaryQuery: QueryEvidence | null;
	queryPortfolio: PageQueryPortfolio | null;
	positionStatus: PositionStatus;
	intentFit: IntentFit;
	businessFit: BusinessFit;
	dataSufficiency: DataSufficiency;

	// Why
	whyThisIsBetter: string;              // INVARIANT — empty/generic blocks execute
	whyNot: WhyNot;
	saferAlternative: SaferAlternative | null;

	// Optional per-action justification (one of, depending on action type)
	titleJustification?: TitleJustification;
	metaJustification?: MetaJustification;
	contentJustification?: ContentJustification;

	// Measurement
	measurementPlan: MeasurementPlan;

	// Research notes for the UI "what we know / what we don't know" block
	researchNotes: {
		whatWeKnow: string[];
		whatWeDontKnow: string[];
		whyThisAction: string[];
		whyThisIsRisky: string[];
		whatToCheckManually: string[];
		howWeMeasureSuccess: string[];
	};

	// Diagnostics — version + when computed
	computedAt: string;                   // ISO
	engineVersion: string;
}

// ─── Why-quality predicate (the invariant guard) ─────────────

// Words that signal a generic, non-substantive justification.
// `whyThisIsBetter` containing only these will be rejected.
const GENERIC_WHY_PATTERNS = [
	/^זה\s+ישפר\s+SEO\.?$/i,
	/^זה\s+טוב\s+ל(?:מנועי\s+חיפוש|SEO)/i,
	/^זה\s+יגדיל\s+חשיפה\.?$/i,
	/^this will improve seo/i,
	/^better for seo/i,
	/^more optimized/i,
	/^more focused$/i,
	/^improves seo/i,
];

/**
 * Returns true when whyThisIsBetter is substantive — non-empty, longer than
 * a one-liner, and not matching banned generic patterns. Used by the engine
 * to flip a recommendation away from "safe_to_execute" when no evidence-based
 * justification could be built.
 */
export function isSubstantiveWhy(why: string | null | undefined): boolean {
	if (!why) return false;
	const trimmed = why.trim();
	if (trimmed.length < 40) return false; // ~one short sentence minimum
	for (const pat of GENERIC_WHY_PATTERNS) {
		if (pat.test(trimmed)) return false;
	}
	// Substantive justifications cite at least one real number OR a query.
	const hasNumber = /\d+/.test(trimmed);
	const hasQueryLike = /["'״“][^"'״”]{2,}["'״”]/.test(trimmed) || /CTR|impressions|clicks|מיקום|חשיפות|הקלקות|קליקים/.test(trimmed);
	return hasNumber || hasQueryLike;
}

// Final guard used by Execution Guard. Returns true when the decision is
// allowed to back an executable ExecutionAction.
export function decisionAllowsExecution(d: DecisionSummary, humanReviewedAt: Date | string | null = null): boolean {
	if (d.recommendedNextStep === "no_change") return false;
	if (d.recommendedNextStep === "research_needed") return false;
	if (d.recommendedNextStep === "monitor") return false;
	if (d.recommendedNextStep === "human_review" && !humanReviewedAt) return false;
	if (!isSubstantiveWhy(d.whyThisIsBetter)) return false;
	if (d.confidence === "low" && !humanReviewedAt) return false;
	if ((d.riskLevel === "high" || d.riskLevel === "critical") && !humanReviewedAt) return false;
	return true;
}

export const DECISION_ENGINE_VERSION = "14c.1";
