// Workflow Center — server-only loaders.

import "server-only";
import { db } from "./db";
import type {
	WorkflowItem,
	WorkflowAction,
	WorkflowCounts,
	ExecutionWorkflowBadge,
	DecisionWorkflowBadge,
} from "./workflow";
import { priorityBand } from "./opportunities";
import { isSeoEligible } from "./page-scope";

// Active statuses per source type — items considered "in the workflow".
const ACTIVE_OPPORTUNITY = ["detected", "recommended", "needs_human_review", "approved"];
const MONITORING_OPPORTUNITY = ["monitoring", "manually_applied", "impact_reviewed"];
const ACTIVE_BRIEF = ["draft", "needs_human_review", "approved"];
const ACTIVE_LINK = ["suggested", "needs_human_review", "approved"];

function actionsForOpportunity(status: string): WorkflowAction[] {
	if (MONITORING_OPPORTUNITY.includes(status))
		return ["review_7d", "review_14d", "review_30d"];
	if (status === "approved") return ["mark_manual_applied"];
	if (status === "detected" || status === "recommended" || status === "needs_human_review")
		return ["approve", "needs_human_review", "reject", "dismiss"];
	return [];
}

function actionsForBrief(status: string): WorkflowAction[] {
	if (status === "approved") return ["mark_used"];
	if (status === "draft") return ["approve", "needs_human_review", "reject"];
	if (status === "needs_human_review") return ["approve", "reject"];
	return [];
}

function actionsForLink(status: string): WorkflowAction[] {
	if (status === "approved") return ["mark_used"];
	if (status === "suggested" || status === "needs_human_review")
		return ["approve", "needs_human_review", "reject", "dismiss"];
	return [];
}

function needsDecisionFlag(sourceType: string, status: string): boolean {
	if (status === "needs_human_review" || status === "recommended") return true;
	if (sourceType === "content_brief" && status === "draft") return true;
	if (sourceType === "internal_link" && status === "suggested") return true;
	return false;
}

function decisionCacheToBadge(nextStep: string | null): DecisionWorkflowBadge | null {
	switch (nextStep) {
		case "safe_to_execute":
			return "safe_to_test";
		case "quick_win":
			return "quick_win";
		case "human_review":
			return "needs_human_review";
		case "monitor":
			return "monitor_only";
		case "no_change":
			return "do_not_change_yet";
		case "research_needed":
			return "research_needed";
		default:
			return null;
	}
}

function executionStatusToBadge(status: string): ExecutionWorkflowBadge | null {
	if (status === "dry_run_ready" || status === "awaiting_execution_approval")
		return "execution_ready";
	if (status === "draft" || status === "preview_only") return "awaiting_execute";
	if (status === "dry_run_stale") return "dry_run_stale";
	if (status === "dry_run_failed" || status === "failed") return "dry_run_failed";
	if (status === "rollback_available") return "rollback_available";
	if (status === "finalized") return "finalized";
	if (status === "executed") return "executed";
	return null;
}

export async function loadWorkflow(clientId: string): Promise<WorkflowItem[]> {
	const [opps, briefs, links, executions, briefExecutions, client] = await Promise.all([
		db.opportunity.findMany({
			where: {
				clientId,
				status: { in: [...ACTIVE_OPPORTUNITY, ...MONITORING_OPPORTUNITY] },
			},
			orderBy: { priorityScore: "desc" },
		}),
		db.contentBrief.findMany({
			where: { clientId, status: { in: ACTIVE_BRIEF } },
			orderBy: { createdAt: "desc" },
		}),
		db.internalLinkSuggestion.findMany({
			where: { clientId, status: { in: ACTIVE_LINK } },
			orderBy: { priorityScore: "desc" },
		}),
		// Phase 12 — fetch latest execution per opportunity for badge decoration.
		// Read-only; the workflow page never executes anything.
		db.executionAction.findMany({
			where: { clientId, sourceType: "opportunity" },
			orderBy: { updatedAt: "desc" },
			select: { sourceId: true, status: true, updatedAt: true },
		}),
		// Phase 15D — latest execution per brief, for the same badge surface.
		db.executionAction.findMany({
			where: { clientId, sourceType: "content_brief" },
			orderBy: { updatedAt: "desc" },
			select: { sourceId: true, status: true, updatedAt: true, actionType: true },
		}),
		db.client.findUnique({
			where: { id: clientId },
			select: {
				executionEnabled: true,
				allowedExecutionActions: true,
				targetPages: true,
				seoIgnoredUrls: true,
				seoIgnoredPatterns: true,
				seoForcedTargetUrls: true,
			},
		}),
	]);

	const latestExecutionBySource = new Map<string, ExecutionWorkflowBadge>();
	for (const e of executions) {
		if (latestExecutionBySource.has(e.sourceId)) continue; // first match is newest (orderBy desc)
		const badge = executionStatusToBadge(e.status);
		if (badge) latestExecutionBySource.set(e.sourceId, badge);
	}

	// Phase 15D — track brief-source executions separately so a brief row can
	// show its OWN execution badge without leaking into opportunity badges.
	const latestExecutionByBrief = new Map<string, ExecutionWorkflowBadge>();
	const openExecutionByBrief = new Set<string>();
	const OPEN_STATUSES = new Set([
		"draft", "dry_run_ready", "awaiting_execution_approval", "executing",
		"preview_only", "dry_run_failed", "dry_run_stale",
	]);
	for (const e of briefExecutions) {
		if (!latestExecutionByBrief.has(e.sourceId)) {
			const badge = executionStatusToBadge(e.status);
			if (badge) latestExecutionByBrief.set(e.sourceId, badge);
		}
		if (OPEN_STATUSES.has(e.status)) openExecutionByBrief.add(e.sourceId);
	}

	const items: WorkflowItem[] = [];

	for (const o of opps) {
		const isMonitoring = MONITORING_OPPORTUNITY.includes(o.status);
		items.push({
			id: `opportunity:${o.id}`,
			sourceType: "opportunity",
			sourceId: o.id,
			clientId,
			title: o.title,
			description: o.description,
			recommendedAction: o.recommendedAction,
			status: o.status,
			priorityScore: o.priorityScore,
			impact: o.impact,
			effort: o.effort,
			confidence: o.confidence,
			relatedKeyword: o.relatedKeyword || undefined,
			relatedPage: o.relatedPage || undefined,
			relatedQuery: o.relatedQuery || undefined,
			createdAt: o.createdAt.toISOString(),
			updatedAt: o.updatedAt.toISOString(),
			needsDecision: needsDecisionFlag("opportunity", o.status),
			isMonitoring,
			availableActions: actionsForOpportunity(o.status),
			executionBadge: latestExecutionBySource.get(o.id) ?? null,
			decisionBadge: decisionCacheToBadge(o.decisionNextStepCache),
			sourceMeta: {
				type: o.type,
				manualActionUrl: o.manualActionUrl,
				manuallyAppliedAt: o.manuallyAppliedAt?.toISOString(),
				approvedActionType: o.approvedActionType,
				approvalNote: o.approvalNote,
				isTechnical: o.type === "technical_seo_issue",
			},
		});
	}

	for (const b of briefs) {
		// Phase 15D — lightweight readiness check. Full readiness lives on the
		// brief row itself; this is just enough to flip a "Ready for Execution"
		// badge in the workflow. Plugin connectivity is intentionally not
		// re-checked here.
		const briefScopeEligible = (() => {
			if (!b.relatedPage || !client) return false;
			return isSeoEligible(b.relatedPage, {
				targetPages: client.targetPages,
				seoIgnoredUrls: client.seoIgnoredUrls,
				seoIgnoredPatterns: client.seoIgnoredPatterns,
				seoForcedTargetUrls: client.seoForcedTargetUrls,
			});
		})();
		const allowedSet = new Set(client?.allowedExecutionActions ?? []);
		const titleAllowed = allowedSet.has("yoast_title_update");
		const metaAllowed = allowedSet.has("yoast_description_update");
		const briefReady =
			b.status === "approved" &&
			b.briefType === "title_meta_update" &&
			!!b.relatedPage &&
			briefScopeEligible &&
			((b.recommendedTitle && titleAllowed) || (b.recommendedMetaDescription && metaAllowed)) &&
			(client?.executionEnabled ?? false) &&
			!openExecutionByBrief.has(b.id);

		items.push({
			id: `content_brief:${b.id}`,
			sourceType: "content_brief",
			sourceId: b.id,
			clientId,
			title: b.targetKeyword,
			subtitle: b.recommendedTitle ?? undefined,
			description: b.contentAngle ?? undefined,
			recommendedAction: b.recommendedH1 ?? undefined,
			status: b.status,
			priorityScore: 50, // briefs don't have priorityScore; treat as Medium
			impact: "medium",
			effort: "medium",
			confidence: "medium",
			relatedKeyword: b.targetKeyword,
			relatedPage: b.relatedPage ?? undefined,
			createdAt: b.createdAt.toISOString(),
			updatedAt: b.updatedAt.toISOString(),
			needsDecision: needsDecisionFlag("content_brief", b.status),
			isMonitoring: false,
			availableActions: actionsForBrief(b.status),
			executionBadge: latestExecutionByBrief.get(b.id) ?? null,
			sourceMeta: {
				briefType: b.briefType,
				searchIntent: b.searchIntent,
				executionReady: briefReady,
			},
		});
	}

	for (const l of links) {
		items.push({
			id: `internal_link:${l.id}`,
			sourceType: "internal_link",
			sourceId: l.id,
			clientId,
			title: `${l.sourceTitle || l.sourcePage} → ${l.targetTitle || l.targetPage}`,
			subtitle: `anchor: "${l.suggestedAnchor}"`,
			description: l.reason,
			status: l.status,
			priorityScore: l.priorityScore,
			impact: l.impact,
			effort: l.effort,
			confidence: l.confidence,
			relatedPage: l.targetPage,
			createdAt: l.createdAt.toISOString(),
			updatedAt: l.updatedAt.toISOString(),
			needsDecision: needsDecisionFlag("internal_link", l.status),
			isMonitoring: false,
			availableActions: actionsForLink(l.status),
			sourceMeta: {
				sourcePage: l.sourcePage,
				sourceTitle: l.sourceTitle,
				targetPage: l.targetPage,
				targetTitle: l.targetTitle,
				suggestedAnchor: l.suggestedAnchor,
				detector: l.source,
			},
		});
	}

	// Priority Queue sort: needs_decision first, then by impact band,
	// then priority score, then recency.
	items.sort((a, b) => {
		if (a.needsDecision !== b.needsDecision) return a.needsDecision ? -1 : 1;
		const bandA = priorityBand(a.priorityScore).bucket;
		const bandB = priorityBand(b.priorityScore).bucket;
		const bandOrder: Record<string, number> = { high: 0, quick: 1, medium: 2, low: 3 };
		if (bandA !== bandB) return (bandOrder[bandA] ?? 9) - (bandOrder[bandB] ?? 9);
		if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
		return b.updatedAt.localeCompare(a.updatedAt);
	});

	return items;
}

export function computeCounts(items: WorkflowItem[]): WorkflowCounts {
	let needsDecision = 0;
	let highImpact = 0;
	let content = 0;
	let internalLinks = 0;
	let technical = 0;
	let monitoring = 0;
	let approved = 0;

	for (const i of items) {
		if (i.needsDecision) needsDecision++;
		if (priorityBand(i.priorityScore).bucket === "high") highImpact++;
		if (i.sourceType === "content_brief") content++;
		if (i.sourceType === "internal_link") internalLinks++;
		if (i.sourceMeta?.isTechnical) technical++;
		if (i.isMonitoring) monitoring++;
		if (i.status === "approved") approved++;
	}

	return {
		total: items.length,
		needsDecision,
		highImpact,
		content,
		internalLinks,
		technical,
		monitoring,
		approved,
	};
}

/** Filter items per tab. */
export function filterByTab(items: WorkflowItem[], tab: string): WorkflowItem[] {
	switch (tab) {
		case "needs_decision":
			return items.filter((i) => i.needsDecision);
		case "high_impact":
			return items.filter((i) => priorityBand(i.priorityScore).bucket === "high");
		case "content":
			return items.filter((i) => i.sourceType === "content_brief");
		case "internal_links":
			return items.filter((i) => i.sourceType === "internal_link");
		case "technical":
			return items.filter((i) => i.sourceMeta?.isTechnical === true);
		case "monitoring":
			return items.filter((i) => i.isMonitoring);
		case "approved":
			return items.filter((i) => i.status === "approved");
		default:
			return items;
	}
}

/** Load OpportunityActionLog for the drawer. */
export async function loadActionLog(opportunityId: string) {
	return db.opportunityActionLog.findMany({
		where: { opportunityId },
		orderBy: { createdAt: "desc" },
		take: 30,
	});
}
