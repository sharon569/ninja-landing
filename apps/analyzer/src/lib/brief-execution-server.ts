// Phase 15D — Brief → Execution wiring (server-only).
//
// Two public entries:
//   - computeBriefExecutionReadiness(briefId) — aggregates every gate so the
//     UI can render a green/red readiness panel.
//   - createExecutionActionFromBrief(briefId, actionType, actor) — the
//     mirror of createExecutionActionFromOpportunity. Same dry-run-only-
//     never-executes invariant: this only PREPARES an action, never runs it.
//
// Title/Meta only. image_alt_update, internal_link_insert, content_snippet_insert
// are explicitly NOT supported via Brief in this phase per the spec.

import "server-only";
import { db } from "./db";
import {
	canCreateExecutionAction,
	getExecutionReadiness,
} from "./execution-server";
import { type ExecutionActionType } from "./execution";
import { classifyPage, type ClientScopeConfig, type PageClassification } from "./page-scope";
import { computeDecisionForOpportunity } from "./decision-server";
import { decisionAllowsExecution, isSubstantiveWhy } from "./decision";
import {
	classifyUrlPageType,
	detectTitleVsPageTypeMismatch,
	type MasterPageType,
} from "./master-page";

// Action types the Brief → Execution flow is allowed to produce.
const BRIEF_ALLOWED_ACTION_TYPES: ExecutionActionType[] = [
	"yoast_title_update",
	"yoast_description_update",
];

export type BriefActionType = "yoast_title_update" | "yoast_description_update";

export interface BriefExecutionReadiness {
	briefId: string;
	clientId: string;
	briefStatus: string;
	briefType: string;
	hasTitle: boolean;
	hasMeta: boolean;
	targetUrl: string | null;
	pageScope: PageClassification | null;
	clientExecutionEnabled: boolean;
	allowedActionsTitle: boolean;
	allowedActionsMeta: boolean;
	pluginReadinessOk: boolean;
	pluginWarnings: string[];
	decisionAllows: boolean;
	decisionReason: string | null;
	existingExecutions: Array<{
		id: string;
		actionType: string;
		status: string;
	}>;
	// Computed final answer per actionType — true means "Prepare Execution"
	// button can be shown for this column.
	canPrepareTitle: boolean;
	canPrepareMeta: boolean;
	// Human-readable Hebrew blockers (rendered in the readiness panel)
	blockers: string[];
}

export async function computeBriefExecutionReadiness(
	briefId: string,
): Promise<BriefExecutionReadiness | null> {
	const brief = await db.contentBrief.findUnique({ where: { id: briefId } });
	if (!brief) return null;
	const client = await db.client.findUnique({ where: { id: brief.clientId } });
	if (!client) return null;

	const blockers: string[] = [];

	// 1. Brief gate
	const briefStatusOk = brief.status === "approved";
	if (!briefStatusOk) blockers.push("ה-Brief לא במצב מאושר");
	const briefTypeOk = brief.briefType === "title_meta_update";
	if (!briefTypeOk) blockers.push("ה-briefType לא title_meta_update");

	const hasTitle = !!(brief.recommendedTitle && brief.recommendedTitle.trim());
	const hasMeta = !!(brief.recommendedMetaDescription && brief.recommendedMetaDescription.trim());
	if (!hasTitle && !hasMeta) blockers.push("אין recommendedTitle ואין recommendedMetaDescription");

	// 2. Target URL
	const targetUrl = brief.relatedPage?.trim() || null;
	if (!targetUrl) blockers.push("אין relatedPage ב-Brief");

	// 3. Page Scope
	const scopeCfg: ClientScopeConfig = {
		targetPages: client.targetPages,
		seoIgnoredUrls: client.seoIgnoredUrls,
		seoIgnoredPatterns: client.seoIgnoredPatterns,
		seoForcedTargetUrls: client.seoForcedTargetUrls,
	};
	const pageScope = targetUrl ? classifyPage(targetUrl, scopeCfg) : null;
	if (pageScope && !pageScope.isSeoEligible) {
		blockers.push(`העמוד מסווג כ-${pageScope.scope} (${pageScope.reason}) — לא נכלל באסטרטגיית SEO`);
	}

	// 4. Plugin / client execution readiness
	const titleGate = await canCreateExecutionAction(client.id, "yoast_title_update");
	const metaGate = await canCreateExecutionAction(client.id, "yoast_description_update");
	const readiness = await getExecutionReadiness(client.id);
	if (!readiness.executionEnabled) blockers.push("Execution לא מופעל ללקוח");
	if (!readiness.tokenPresent) blockers.push("חסר Token/Base URL ללקוח");
	if (!readiness.pluginReachable) blockers.push("הפלאגין לא נגיש");
	if (!readiness.writeApiEnabled) blockers.push("Write API כבוי בפלאגין");
	if (!readiness.pluginVersionOk) blockers.push("גרסת פלאגין נמוכה מ-0.3.0");
	const allowedTitle = readiness.allowedActions.includes("yoast_title_update");
	const allowedMeta = readiness.allowedActions.includes("yoast_description_update");

	// 5. Decision Guard — only blockable if we have something to compute on.
	// When brief came from an Opportunity, use the existing engine. When brief
	// came from a Strategy step, use the snapshot in strategyContext.
	let decisionAllows = true;
	let decisionReason: string | null = null;
	if (brief.opportunityId) {
		try {
			const decision = await computeDecisionForOpportunity(brief.opportunityId, {
				persistCache: false,
			});
			const opp = await db.opportunity.findUnique({
				where: { id: brief.opportunityId },
				select: { humanReviewedAt: true },
			});
			decisionAllows = decisionAllowsExecution(decision, opp?.humanReviewedAt ?? null);
			if (!decisionAllows) {
				decisionReason = decision.recommendedNextStep === "human_review"
					? "Decision Guard ביקש סקירה אנושית — סמן את ה-Opportunity המקור כ-Reviewed"
					: "Decision Guard לא מאשר ביצוע (סיכון/ביטחון/Why חסרים)";
				blockers.push(decisionReason);
			}
		} catch (err) {
			decisionAllows = false;
			decisionReason = `Decision לא חושב: ${(err as Error).message}`;
			blockers.push(decisionReason);
		}
	} else if (brief.sourceType === "keyword_strategy" && brief.strategyContext) {
		// Validate the strategy-side snapshot.
		try {
			const ctx = JSON.parse(brief.strategyContext) as {
				riskLevel?: string;
				confidence?: string;
				measurementPlan?: { successCondition?: string };
				why?: string;
				requiresHumanReview?: boolean;
			};
			// Phase 15D Bundle C — Brief-level human-review override.
			// If the operator explicitly approved the brief for execution, the
			// strategyStep.requiresHumanReview gate is unlocked. Other gates
			// (scope, allowed actions, plugin, risk=critical) stay enforced.
			const briefReviewed =
				brief.humanReviewedAt != null &&
				brief.humanReviewDecision === "approved_for_execution";
			if (ctx.requiresHumanReview && !briefReviewed) {
				decisionAllows = false;
				decisionReason = "השלב באסטרטגיה דורש סקירה אנושית";
			} else if (ctx.confidence === "low") {
				decisionAllows = false;
				decisionReason = "ביטחון נמוך באסטרטגיה — לא מספיק לביצוע";
			} else if (ctx.riskLevel === "high" || ctx.riskLevel === "critical") {
				decisionAllows = false;
				decisionReason = `סיכון ${ctx.riskLevel} באסטרטגיה — דרושה סקירה ידנית`;
			} else if (!ctx.measurementPlan?.successCondition) {
				decisionAllows = false;
				decisionReason = "אין measurementPlan באסטרטגיה";
			} else if (!isSubstantiveWhy(ctx.why ?? null)) {
				decisionAllows = false;
				decisionReason = "ה-Why של השלב גנרי מדי";
			}
			if (decisionReason) blockers.push(decisionReason);
		} catch {
			decisionAllows = false;
			decisionReason = "strategyContext לא תקין";
			blockers.push(decisionReason);
		}
	} else {
		// No source context to justify: block.
		decisionAllows = false;
		decisionReason = "אין מקור החלטה (Opportunity או Strategy)";
		blockers.push(decisionReason);
	}

	// 6. Existing executions for this brief
	const existing = await db.executionAction.findMany({
		where: {
			sourceType: "content_brief",
			sourceId: brief.id,
			actionType: { in: BRIEF_ALLOWED_ACTION_TYPES },
		},
		select: { id: true, actionType: true, status: true },
		orderBy: { createdAt: "desc" },
	});

	const openTitleExec = existing.find(
		(e) => e.actionType === "yoast_title_update" &&
			!["cancelled", "rolled_back", "executed", "finalized"].includes(e.status),
	);
	const openMetaExec = existing.find(
		(e) => e.actionType === "yoast_description_update" &&
			!["cancelled", "rolled_back", "executed", "finalized"].includes(e.status),
	);

	const baseGatesOk =
		briefStatusOk &&
		briefTypeOk &&
		!!targetUrl &&
		(!pageScope || pageScope.isSeoEligible) &&
		readiness.executionEnabled &&
		readiness.tokenPresent &&
		readiness.pluginReachable &&
		readiness.writeApiEnabled &&
		readiness.pluginVersionOk &&
		decisionAllows;

	if (hasTitle && !allowedTitle) blockers.push("Yoast Title לא ב-Allowed Actions של הלקוח");
	if (hasMeta && !allowedMeta) blockers.push("Yoast Meta לא ב-Allowed Actions של הלקוח");
	if (openTitleExec) blockers.push("כבר קיים Execution פתוח על Title");
	if (openMetaExec) blockers.push("כבר קיים Execution פתוח על Meta");

	// Phase 15D.-1 — Page Type Mismatch Guard. If the brief's recommendedTitle
	// reads as a category/comparison title but targetUrl is a product page (or
	// vice versa), refuse. Operator can fix the title in the brief and try
	// again. Override path: humanReviewedAt + approved_for_execution.
	let titleMismatch = false;
	if (hasTitle && targetUrl) {
		const tkType = await (async () => {
			const tk = await db.targetKeyword.findFirst({
				where: {
					clientId: brief.clientId,
					keyword: brief.targetKeyword.toLowerCase(),
				},
				select: { masterPageType: true },
			});
			return (tk?.masterPageType as MasterPageType | null) ?? null;
		})();
		const pageType: MasterPageType = tkType ?? classifyUrlPageType(targetUrl);
		const mm = detectTitleVsPageTypeMismatch(brief.recommendedTitle, pageType);
		if (mm.mismatch) {
			titleMismatch = true;
			const reviewed = brief.humanReviewedAt && brief.humanReviewDecision === "approved_for_execution";
			if (!reviewed) {
				blockers.push(`Page Type mismatch: ${mm.reason}`);
			}
		}
	}

	// Page-type mismatch is bypassable only via brief.humanReviewedAt
	// approved_for_execution. If mismatch + reviewed, the operator explicitly
	// took responsibility.
	const mismatchBypassed =
		brief.humanReviewedAt != null && brief.humanReviewDecision === "approved_for_execution";
	const mismatchHolds = titleMismatch && !mismatchBypassed;

	const canPrepareTitle =
		baseGatesOk && hasTitle && allowedTitle && titleGate.ok && !openTitleExec && !mismatchHolds;
	const canPrepareMeta =
		baseGatesOk && hasMeta && allowedMeta && metaGate.ok && !openMetaExec;

	return {
		briefId: brief.id,
		clientId: brief.clientId,
		briefStatus: brief.status,
		briefType: brief.briefType,
		hasTitle,
		hasMeta,
		targetUrl,
		pageScope,
		clientExecutionEnabled: readiness.executionEnabled,
		allowedActionsTitle: allowedTitle,
		allowedActionsMeta: allowedMeta,
		pluginReadinessOk: readiness.overallReady,
		pluginWarnings: readiness.warnings,
		decisionAllows,
		decisionReason,
		existingExecutions: existing,
		canPrepareTitle,
		canPrepareMeta,
		blockers,
	};
}

export interface CreateBriefExecutionResult {
	ok: boolean;
	actionId?: string;
	error?: string;
	reusedExisting?: boolean;
}

/**
 * Prepare (NOT execute) a new ExecutionAction sourced from a Brief.
 *
 * Safety invariants enforced here:
 *  - Brief must be approved + briefType=title_meta_update.
 *  - actionType limited to yoast_title_update | yoast_description_update.
 *  - relatedPage required and SEO-eligible.
 *  - Decision Guard must pass (opportunity or strategy path).
 *  - Plugin readiness must pass canCreateExecutionAction().
 *  - Idempotent: returns existing open ExecutionAction instead of creating a
 *    duplicate.
 *  - decisionSnapshot is persisted so Impact Review can compare against the
 *    measurement plan that was in effect at prepare time.
 */
export async function createExecutionActionFromBrief(args: {
	briefId: string;
	actionType: BriefActionType;
	actor: string;
}): Promise<CreateBriefExecutionResult> {
	const { briefId, actionType, actor } = args;

	if (!BRIEF_ALLOWED_ACTION_TYPES.includes(actionType)) {
		return { ok: false, error: `actionType ${actionType} not allowed from Brief in this phase` };
	}

	const readiness = await computeBriefExecutionReadiness(briefId);
	if (!readiness) return { ok: false, error: "Brief not found" };

	const canForThis =
		actionType === "yoast_title_update" ? readiness.canPrepareTitle : readiness.canPrepareMeta;
	if (!canForThis) {
		const reason = readiness.blockers[0] ?? "הכנת Execution חסומה";
		return { ok: false, error: `לא ניתן להכין Execution: ${reason}` };
	}

	const brief = await db.contentBrief.findUnique({ where: { id: briefId } });
	if (!brief) return { ok: false, error: "Brief not found" };

	const targetUrl = brief.relatedPage!.trim();
	const payload =
		actionType === "yoast_title_update"
			? { targetUrl, title: brief.recommendedTitle! }
			: { targetUrl, description: brief.recommendedMetaDescription! };

	// Build decisionSnapshot. Prefer the real engine output when an Opportunity
	// is on the brief; otherwise the strategyContext JSON.
	let decisionSnapshot: string;
	if (brief.opportunityId) {
		try {
			const decision = await computeDecisionForOpportunity(brief.opportunityId, {
				persistCache: false,
			});
			decisionSnapshot = JSON.stringify({ source: "opportunity", decision });
		} catch (err) {
			return { ok: false, error: `Decision compute failed: ${(err as Error).message}` };
		}
	} else if (brief.sourceType === "keyword_strategy" && brief.strategyContext) {
		decisionSnapshot = JSON.stringify({
			source: "keyword_strategy",
			strategyContext: JSON.parse(brief.strategyContext),
		});
	} else {
		return { ok: false, error: "No decision source on brief" };
	}

	// Idempotent: reuse an open action for the same (brief, actionType).
	const existingOpen = await db.executionAction.findFirst({
		where: {
			sourceType: "content_brief",
			sourceId: briefId,
			actionType,
			status: {
				in: ["draft", "dry_run_ready", "awaiting_execution_approval", "executing", "preview_only", "dry_run_failed", "dry_run_stale"],
			},
		},
	});
	if (existingOpen) {
		return { ok: true, actionId: existingOpen.id, reusedExisting: true };
	}

	// History: if the most recent terminal action used the same payload, it's
	// not worth re-preparing — show a friendly error instead of silently
	// creating yet another row.
	const mostRecent = await db.executionAction.findFirst({
		where: {
			sourceType: "content_brief",
			sourceId: briefId,
			actionType,
		},
		orderBy: { createdAt: "desc" },
	});
	if (mostRecent && ["executed", "finalized"].includes(mostRecent.status)) {
		try {
			const mostRecentPayload = JSON.parse(mostRecent.payload);
			const currentVal =
				actionType === "yoast_title_update" ? brief.recommendedTitle : brief.recommendedMetaDescription;
			const prevVal =
				actionType === "yoast_title_update"
					? mostRecentPayload.title
					: mostRecentPayload.description;
			if (currentVal === prevVal) {
				return {
					ok: false,
					error: "כבר בוצעה פעולת Execution על ה-Brief הזה עם אותו ערך. עדכן את ה-Brief לפני יצירה חדשה.",
				};
			}
		} catch {
			// fall through — if payload unparseable just allow create
		}
	}

	const created = await db.executionAction.create({
		data: {
			clientId: brief.clientId,
			sourceType: "content_brief",
			sourceId: briefId,
			actionType,
			status: "draft",
			targetUrl,
			payload: JSON.stringify(payload),
			decisionSnapshot,
		},
	});

	return { ok: true, actionId: created.id };
}

/**
 * Phase 15D — post-execute hook for content_brief source. Called from
 * executeAction() when the execution succeeded AND something actually
 * changed. Side effects:
 *  - Mark brief.status = used
 *  - If the brief is also tied to an Opportunity, run that lifecycle too
 *    (delegated to existing onOpportunityExecuted via the engine).
 */
export async function onContentBriefExecuted(
	briefId: string,
	_actor: string,
	_actionType: string,
): Promise<void> {
	const brief = await db.contentBrief.findUnique({ where: { id: briefId } });
	if (!brief) return;
	if (brief.status !== "used") {
		await db.contentBrief.update({
			where: { id: briefId },
			data: { status: "used" },
		});
	}
}
