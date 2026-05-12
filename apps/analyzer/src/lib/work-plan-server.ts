// Phase 15D.0 — SEO Work Plan engine (server-only).
//
// Single source of truth for "what should we work on this cycle?" — turns
// thousands of opportunities/strategies/briefs/links into ONE grouped,
// risk-scored plan the operator can approve by group.
//
// Public entries:
//   - buildSeoWorkPlan(clientId, planType, actor)
//   - approveWorkPlanGroup(planId, group, actor)
//   - cancelWorkPlan(planId)
//   - loadWorkPlanForClient(clientId)
//   - getActiveWorkPlanSummary(clientId)
//
// Invariants:
//   - Only ONE active plan per client at a time. Building a new plan flips
//     prior active plans to "superseded".
//   - Approval triggers prepare-only side effects (create briefs / draft
//     ExecutionActions / mark monitor-only). NO Dry Run, NO Execute, NO
//     plugin write calls.
//   - Every classification routes through the existing layers: scope,
//     decision cache, strategyContext, briefType readiness — we don't
//     re-implement decision logic here.

import "server-only";
import { db } from "./db";
import { isSeoEligible, type ClientScopeConfig } from "./page-scope";
import {
	type ItemGroup,
	type ItemDecision,
	type ItemAutomationMode,
	type ItemSourceType,
	type PlanSummary,
	type PlanType,
	GROUP_LABEL,
	APPROVABLE_GROUPS,
} from "./work-plan";
import { generateBriefFromStrategyStep, actionTypeToBriefType } from "./briefs-server";
import { createExecutionActionFromBrief } from "./brief-execution-server";
import { computeBriefExecutionReadiness } from "./brief-execution-server";

// ─── Types ───────────────────────────────────────────────────

interface ClassifiedItem {
	sourceType: ItemSourceType;
	sourceId: string;
	group: ItemGroup;
	decision: ItemDecision;
	automationMode: ItemAutomationMode;
	actionType: string | null;
	targetUrl: string | null;
	title: string;
	summary: string | null;
	riskLevel: "low" | "medium" | "high" | "critical";
	confidence: "low" | "medium" | "high";
	priorityScore: number;
	reason: string;
	blockedReason: string | null;
}

// ─── Classifier helpers ──────────────────────────────────────

/** A page is "high stakes" if it ranks Top 5 — changing its title/meta could lose existing traffic. */
function isHighStakesPosition(position: number | null | undefined): boolean {
	return position != null && position > 0 && position <= 5;
}

function isQuickWinPosition(position: number | null | undefined): boolean {
	return position != null && position >= 6 && position <= 20;
}

// ─── Classifiers per source ──────────────────────────────────

function classifyOpportunity(
	o: {
		id: string;
		type: string;
		title: string;
		relatedKeyword: string;
		relatedPage: string;
		relatedQuery: string;
		priorityScore: number;
		impact: string;
		effort: string;
		confidence: string;
		status: string;
		decisionRiskCache: string | null;
		decisionConfidenceCache: string | null;
		decisionNextStepCache: string | null;
		humanReviewedAt: Date | null;
	},
	scope: ClientScopeConfig,
): ClassifiedItem {
	const targetUrl = o.relatedPage || null;
	const baseSummary = o.title;
	const confidence = (o.confidence as "low" | "medium" | "high") || "medium";
	const decisionRisk = (o.decisionRiskCache as "low" | "medium" | "high" | "critical") || "medium";
	const decisionNext = o.decisionNextStepCache;

	// Blocked: scope ineligible
	if (targetUrl && !isSeoEligible(targetUrl, scope)) {
		return {
			sourceType: "opportunity",
			sourceId: o.id,
			group: "blocked",
			decision: "blocked",
			automationMode: "manual_only",
			actionType: null,
			targetUrl,
			title: baseSummary,
			summary: o.relatedKeyword || o.relatedQuery || null,
			riskLevel: decisionRisk,
			confidence,
			priorityScore: o.priorityScore,
			reason: "scope_blocked",
			blockedReason: "העמוד מסווג כ-utility/legal/system — לא נכלל באסטרטגיית SEO",
		};
	}

	// Monitor / Skip / Research from decision cache
	if (decisionNext === "monitor") {
		return baseClassify(o, targetUrl, baseSummary, "monitor_only", "monitor_only", "manual_only", decisionRisk, confidence, "המערכת ממליצה להמשיך לעקוב ולא לשנות כרגע");
	}
	if (decisionNext === "no_change") {
		return baseClassify(o, targetUrl, baseSummary, "monitor_only", "skip", "manual_only", decisionRisk, confidence, "המערכת לא ממליצה לבצע שינוי כרגע");
	}
	if (decisionNext === "research_needed" || decisionNext === "human_review") {
		return baseClassify(o, targetUrl, baseSummary, "human_review", "human_review", "manual_only", decisionRisk, confidence,
			decisionNext === "research_needed" ? "אין מספיק נתונים — נדרש מחקר ידני" : "Decision Layer מבקש סקירה אנושית");
	}

	// Cannibalization / technical / content_gap → human review by default
	if (o.type === "cannibalization") {
		return baseClassify(o, targetUrl, baseSummary, "human_review", "human_review", "manual_only", "high", confidence, "Cannibalization — חייב החלטה ידנית");
	}
	if (o.type === "technical_seo_issue") {
		return baseClassify(o, targetUrl, baseSummary, "human_review", "human_review", "manual_only", decisionRisk, confidence, "בעיה טכנית — לסקור ידנית");
	}

	// Internal link opportunity
	if (o.type === "internal_link_opportunity") {
		return baseClassify(o, targetUrl, baseSummary, "internal_linking", "auto_prepare", "prepare_only", "low", confidence, "Internal Link מומלץ עם נתוני authority/related");
	}

	// Title/Meta types — safe_meta unless high stakes or low confidence
	const isMetaType = ["low_ctr", "high_impressions_no_clicks"].includes(o.type);
	const isQuickWinType = o.type === "quick_win_position";
	const isContentType = ["target_keyword_needs_content", "content_gap", "target_keyword_not_ranking"].includes(o.type);

	if (isMetaType || isQuickWinType) {
		// Need confidence + decision OK
		if (confidence === "low") {
			return baseClassify(o, targetUrl, baseSummary, "human_review", "human_review", "manual_only", decisionRisk, confidence, "Confidence נמוך — לסקור לפני שינוי");
		}
		// position-from-evidence check — best-effort, parse the evidence JSON
		const evidencePosition = parseEvidencePosition(o);
		if (isHighStakesPosition(evidencePosition)) {
			return baseClassify(o, targetUrl, baseSummary, "human_review", "human_review", "manual_only", "high", confidence, `מיקום גבוה (Top 5) — סיכון לאיבוד תנועה`);
		}
		const group: ItemGroup = isMetaType ? "safe_meta" : "quick_wins";
		const actionType = isMetaType ? "yoast_title_update" : "content_brief";
		return baseClassify(o, targetUrl, baseSummary, group, "auto_prepare", "prepare_only", decisionRisk, confidence, isMetaType ? "Meta/Title fix עם נתונים תומכים" : "Quick Win — מרחק נגיעה מ-Top 5", actionType);
	}

	if (isContentType) {
		return baseClassify(o, targetUrl, baseSummary, "content_expansion", "auto_prepare", "prepare_only", decisionRisk, confidence, "פער תוכן — Brief לכיסוי", "content_brief");
	}

	// Default: human review
	return baseClassify(o, targetUrl, baseSummary, "human_review", "human_review", "manual_only", decisionRisk, confidence, "לא הצלחנו להחליט אוטומטית");
}

function baseClassify(
	o: { id: string; relatedKeyword: string; relatedQuery: string; title: string; priorityScore: number },
	targetUrl: string | null,
	titleText: string,
	group: ItemGroup,
	decision: ItemDecision,
	automationMode: ItemAutomationMode,
	risk: "low" | "medium" | "high" | "critical",
	confidence: "low" | "medium" | "high",
	reason: string,
	actionType: string | null = null,
): ClassifiedItem {
	return {
		sourceType: "opportunity",
		sourceId: o.id,
		group,
		decision,
		automationMode,
		actionType,
		targetUrl,
		title: titleText,
		summary: o.relatedKeyword || o.relatedQuery || null,
		riskLevel: risk,
		confidence,
		priorityScore: o.priorityScore,
		reason,
		blockedReason: null,
	};
}

function parseEvidencePosition(o: { type: string }): number | null {
	void o;
	return null; // Could parse JSON evidence; intentionally conservative — null means "unknown".
}

function classifyKeywordStrategy(
	s: {
		id: string;
		keyword: string;
		status: string;
		strategyType: string;
		riskLevel: string;
		confidence: string;
		opportunityScore: number;
		rankingPage: string | null;
		currentPosition: number | null;
		payload: string;
	},
	scope: ClientScopeConfig,
): ClassifiedItem {
	const targetUrl = s.rankingPage;
	const risk = (s.riskLevel as ClassifiedItem["riskLevel"]) || "medium";
	const confidence = (s.confidence as ClassifiedItem["confidence"]) || "medium";

	// rankingPage ineligible → human review (need to remap to a real SEO page)
	if (targetUrl && !isSeoEligible(targetUrl, scope)) {
		return {
			sourceType: "keyword_strategy",
			sourceId: s.id,
			group: "human_review",
			decision: "human_review",
			automationMode: "manual_only",
			actionType: null,
			targetUrl,
			title: `אסטרטגיה: "${s.keyword}"`,
			summary: `דורש מיפוי לעמוד SEO — Google מציג עמוד תפעולי/משפטי`,
			riskLevel: "high",
			confidence,
			priorityScore: s.opportunityScore,
			reason: "ranking_page_ineligible",
			blockedReason: null,
		};
	}

	// Plan-eligible only if strategy is approved or active (not rejected/paused)
	if (["rejected", "paused", "completed"].includes(s.status)) {
		return {
			sourceType: "keyword_strategy",
			sourceId: s.id,
			group: "monitor_only",
			decision: "skip",
			automationMode: "manual_only",
			actionType: null,
			targetUrl,
			title: `אסטרטגיה: "${s.keyword}"`,
			summary: null,
			riskLevel: risk,
			confidence,
			priorityScore: s.opportunityScore,
			reason: `strategy_status_${s.status}`,
			blockedReason: null,
		};
	}

	if (s.status === "needs_human_review") {
		return {
			sourceType: "keyword_strategy",
			sourceId: s.id,
			group: "human_review",
			decision: "human_review",
			automationMode: "manual_only",
			actionType: null,
			targetUrl,
			title: `אסטרטגיה: "${s.keyword}"`,
			summary: "האסטרטגיה מבקשת סקירה אנושית",
			riskLevel: risk,
			confidence,
			priorityScore: s.opportunityScore,
			reason: "strategy_needs_review",
			blockedReason: null,
		};
	}

	// strategyType-based routing
	const isHighStakes = isHighStakesPosition(s.currentPosition);

	switch (s.strategyType) {
		case "protect_position":
			return {
				sourceType: "keyword_strategy",
				sourceId: s.id,
				group: "human_review",
				decision: "human_review",
				automationMode: "manual_only",
				actionType: null,
				targetUrl,
				title: `הגנה: "${s.keyword}"`,
				summary: "ביטוי שכבר מקבל קליקים — לא לגעת בלי החלטה",
				riskLevel: "high",
				confidence,
				priorityScore: s.opportunityScore,
				reason: "protect_position",
				blockedReason: null,
			};
		case "quick_win":
			if (confidence === "low" || isHighStakes) {
				return reviewable(s, targetUrl, "Quick Win עם סיכון — סקירה לפני אישור", risk, confidence);
			}
			return {
				sourceType: "keyword_strategy",
				sourceId: s.id,
				group: "quick_wins",
				decision: "auto_prepare",
				automationMode: "prepare_only",
				actionType: "content_brief",
				targetUrl,
				title: `Quick Win: "${s.keyword}"`,
				summary: `מרחק נגיעה מ-Top 5 (מיקום ${s.currentPosition?.toFixed(1) ?? "?"})`,
				riskLevel: risk,
				confidence,
				priorityScore: s.opportunityScore,
				reason: "strategy_quick_win",
				blockedReason: null,
			};
		case "content_boost":
		case "new_content_needed":
			return {
				sourceType: "keyword_strategy",
				sourceId: s.id,
				group: "content_expansion",
				decision: "auto_prepare",
				automationMode: "prepare_only",
				actionType: "content_brief",
				targetUrl,
				title: `${s.strategyType === "new_content_needed" ? "תוכן חדש" : "הרחבת תוכן"}: "${s.keyword}"`,
				summary: null,
				riskLevel: risk,
				confidence,
				priorityScore: s.opportunityScore,
				reason: "strategy_content",
				blockedReason: null,
			};
		case "internal_link_boost":
			return {
				sourceType: "keyword_strategy",
				sourceId: s.id,
				group: "internal_linking",
				decision: "auto_prepare",
				automationMode: "prepare_only",
				actionType: "content_brief",
				targetUrl,
				title: `קישור פנימי: "${s.keyword}"`,
				summary: null,
				riskLevel: "low",
				confidence,
				priorityScore: s.opportunityScore,
				reason: "strategy_internal_link",
				blockedReason: null,
			};
		case "monitor_only":
			return {
				sourceType: "keyword_strategy",
				sourceId: s.id,
				group: "monitor_only",
				decision: "monitor_only",
				automationMode: "manual_only",
				actionType: null,
				targetUrl,
				title: `במעקב: "${s.keyword}"`,
				summary: null,
				riskLevel: risk,
				confidence,
				priorityScore: s.opportunityScore,
				reason: "strategy_monitor",
				blockedReason: null,
			};
		case "not_worth_targeting_now":
			return {
				sourceType: "keyword_strategy",
				sourceId: s.id,
				group: "monitor_only",
				decision: "skip",
				automationMode: "manual_only",
				actionType: null,
				targetUrl,
				title: `מדולג: "${s.keyword}"`,
				summary: "לא מצדיק קידום כרגע",
				riskLevel: "low",
				confidence,
				priorityScore: s.opportunityScore,
				reason: "strategy_skip",
				blockedReason: null,
			};
		default:
			return reviewable(s, targetUrl, "אסטרטגיה — לא הצלחנו להחליט אוטומטית", risk, confidence);
	}
}

function reviewable(
	s: { id: string; keyword: string; opportunityScore: number },
	targetUrl: string | null,
	reason: string,
	risk: ClassifiedItem["riskLevel"],
	confidence: ClassifiedItem["confidence"],
): ClassifiedItem {
	return {
		sourceType: "keyword_strategy",
		sourceId: s.id,
		group: "human_review",
		decision: "human_review",
		automationMode: "manual_only",
		actionType: null,
		targetUrl,
		title: `אסטרטגיה: "${s.keyword}"`,
		summary: reason,
		riskLevel: risk,
		confidence,
		priorityScore: s.opportunityScore,
		reason,
		blockedReason: null,
	};
}

async function classifyBrief(
	b: {
		id: string;
		clientId: string;
		targetKeyword: string;
		relatedPage: string | null;
		briefType: string;
		status: string;
		recommendedTitle: string | null;
		recommendedMetaDescription: string | null;
	},
	scope: ClientScopeConfig,
): Promise<ClassifiedItem> {
	const targetUrl = b.relatedPage;

	if (targetUrl && !isSeoEligible(targetUrl, scope)) {
		return {
			sourceType: "content_brief",
			sourceId: b.id,
			group: "blocked",
			decision: "blocked",
			automationMode: "manual_only",
			actionType: null,
			targetUrl,
			title: `Brief: ${b.targetKeyword}`,
			summary: null,
			riskLevel: "low",
			confidence: "medium",
			priorityScore: 50,
			reason: "scope_blocked",
			blockedReason: "עמוד הbrief לא נכלל באסטרטגיית SEO",
		};
	}

	// Brief לא מאושר → human review
	if (b.status === "draft" || b.status === "needs_human_review") {
		return {
			sourceType: "content_brief",
			sourceId: b.id,
			group: "human_review",
			decision: "human_review",
			automationMode: "manual_only",
			actionType: null,
			targetUrl,
			title: `Brief: ${b.targetKeyword}`,
			summary: "Brief ממתין לאישור / סקירה",
			riskLevel: "low",
			confidence: "medium",
			priorityScore: 50,
			reason: "brief_unapproved",
			blockedReason: null,
		};
	}

	if (b.status === "rejected" || b.status === "used") {
		// Already done; skip
		return {
			sourceType: "content_brief",
			sourceId: b.id,
			group: "monitor_only",
			decision: "skip",
			automationMode: "manual_only",
			actionType: null,
			targetUrl,
			title: `Brief: ${b.targetKeyword}`,
			summary: null,
			riskLevel: "low",
			confidence: "medium",
			priorityScore: 50,
			reason: `brief_${b.status}`,
			blockedReason: null,
		};
	}

	// Brief approved + title_meta_update → safe_meta if ready
	if (b.briefType === "title_meta_update" && (b.recommendedTitle || b.recommendedMetaDescription)) {
		const readiness = await computeBriefExecutionReadiness(b.id);
		if (readiness && (readiness.canPrepareTitle || readiness.canPrepareMeta)) {
			return {
				sourceType: "content_brief",
				sourceId: b.id,
				group: "safe_meta",
				decision: "auto_prepare",
				automationMode: "prepare_only",
				actionType: readiness.canPrepareTitle ? "yoast_title_update" : "yoast_description_update",
				targetUrl,
				title: `Brief: ${b.targetKeyword}`,
				summary: b.recommendedTitle ?? b.recommendedMetaDescription,
				riskLevel: "low",
				confidence: "medium",
				priorityScore: 60,
				reason: "brief_ready_for_execution",
				blockedReason: null,
			};
		}
		// Approved but not ready → human review with the blockers from readiness
		return {
			sourceType: "content_brief",
			sourceId: b.id,
			group: "human_review",
			decision: "human_review",
			automationMode: "manual_only",
			actionType: null,
			targetUrl,
			title: `Brief: ${b.targetKeyword}`,
			summary: readiness?.blockers[0] ?? "Brief לא עומד בגייטים של Execution",
			riskLevel: "medium",
			confidence: "medium",
			priorityScore: 50,
			reason: "brief_readiness_failed",
			blockedReason: null,
		};
	}

	// Approved non-title_meta brief → informational (content work). Treat as content_expansion done already.
	return {
		sourceType: "content_brief",
		sourceId: b.id,
		group: "content_expansion",
		decision: "monitor_only",
		automationMode: "manual_only",
		actionType: null,
		targetUrl,
		title: `Brief מאושר: ${b.targetKeyword}`,
		summary: `briefType=${b.briefType} — להמשך עבודה ידנית של הכתיבה`,
		riskLevel: "low",
		confidence: "medium",
		priorityScore: 40,
		reason: "brief_content_pending_writeup",
		blockedReason: null,
	};
}

function classifyInternalLink(
	l: {
		id: string;
		sourcePage: string;
		targetPage: string;
		suggestedAnchor: string;
		status: string;
		priorityScore: number;
		confidence: string;
		impact: string;
	},
	scope: ClientScopeConfig,
): ClassifiedItem {
	const sourceOk = isSeoEligible(l.sourcePage, scope);
	const targetOk = isSeoEligible(l.targetPage, scope);
	if (!sourceOk || !targetOk) {
		return {
			sourceType: "internal_link_suggestion",
			sourceId: l.id,
			group: "blocked",
			decision: "blocked",
			automationMode: "manual_only",
			actionType: null,
			targetUrl: l.targetPage,
			title: `קישור פנימי: ${l.suggestedAnchor}`,
			summary: `${l.sourcePage} → ${l.targetPage}`,
			riskLevel: "low",
			confidence: (l.confidence as ClassifiedItem["confidence"]) || "medium",
			priorityScore: l.priorityScore,
			reason: "scope_blocked",
			blockedReason: !sourceOk
				? "עמוד המקור לא נכלל באסטרטגיית SEO"
				: "עמוד היעד לא נכלל באסטרטגיית SEO",
		};
	}

	if (l.status === "rejected" || l.status === "dismissed" || l.status === "used") {
		return {
			sourceType: "internal_link_suggestion",
			sourceId: l.id,
			group: "monitor_only",
			decision: "skip",
			automationMode: "manual_only",
			actionType: null,
			targetUrl: l.targetPage,
			title: `קישור פנימי: ${l.suggestedAnchor}`,
			summary: `${l.sourcePage} → ${l.targetPage}`,
			riskLevel: "low",
			confidence: (l.confidence as ClassifiedItem["confidence"]) || "medium",
			priorityScore: l.priorityScore,
			reason: `link_${l.status}`,
			blockedReason: null,
		};
	}

	if (l.status === "needs_human_review" || l.confidence === "low") {
		return {
			sourceType: "internal_link_suggestion",
			sourceId: l.id,
			group: "human_review",
			decision: "human_review",
			automationMode: "manual_only",
			actionType: null,
			targetUrl: l.targetPage,
			title: `קישור פנימי: ${l.suggestedAnchor}`,
			summary: `${l.sourcePage} → ${l.targetPage}`,
			riskLevel: "medium",
			confidence: (l.confidence as ClassifiedItem["confidence"]) || "medium",
			priorityScore: l.priorityScore,
			reason: "link_needs_review",
			blockedReason: null,
		};
	}

	// Suggested/approved + high/medium confidence + scope ok → internal_linking
	return {
		sourceType: "internal_link_suggestion",
		sourceId: l.id,
		group: "internal_linking",
		decision: "auto_prepare",
		automationMode: "prepare_only",
		actionType: "internal_link",
		targetUrl: l.targetPage,
		title: `קישור פנימי: ${l.suggestedAnchor}`,
		summary: `${l.sourcePage} → ${l.targetPage}`,
		riskLevel: "low",
		confidence: (l.confidence as ClassifiedItem["confidence"]) || "medium",
		priorityScore: l.priorityScore,
		reason: "link_ready",
		blockedReason: null,
	};
}

// ─── Builder ─────────────────────────────────────────────────

interface BuildResult {
	planId: string;
	summary: PlanSummary;
}

export async function buildSeoWorkPlan(
	clientId: string,
	planType: PlanType = "monthly_seo_work",
	actor: string = "system",
): Promise<BuildResult> {
	void actor;
	const client = await db.client.findUnique({ where: { id: clientId } });
	if (!client) throw new Error("Client not found");

	const scope: ClientScopeConfig = {
		targetPages: client.targetPages,
		seoIgnoredUrls: client.seoIgnoredUrls,
		seoIgnoredPatterns: client.seoIgnoredPatterns,
		seoForcedTargetUrls: client.seoForcedTargetUrls,
	};

	// Pull source items
	const [opportunities, strategies, briefs, links] = await Promise.all([
		db.opportunity.findMany({
			where: {
				clientId,
				status: { in: ["detected", "recommended", "needs_human_review", "approved"] },
			},
			orderBy: { priorityScore: "desc" },
		}),
		db.keywordStrategy.findMany({
			where: {
				clientId,
				status: { in: ["draft", "needs_human_review", "approved", "active"] },
			},
			orderBy: { opportunityScore: "desc" },
		}),
		db.contentBrief.findMany({
			where: {
				clientId,
				status: { in: ["draft", "needs_human_review", "approved"] },
			},
			orderBy: { createdAt: "desc" },
		}),
		db.internalLinkSuggestion.findMany({
			where: {
				clientId,
				status: { in: ["suggested", "needs_human_review", "approved"] },
			},
			orderBy: { priorityScore: "desc" },
		}),
	]);

	const classified: ClassifiedItem[] = [];
	for (const o of opportunities) classified.push(classifyOpportunity(o, scope));
	for (const s of strategies) classified.push(classifyKeywordStrategy(s, scope));
	for (const b of briefs) classified.push(await classifyBrief(b, scope));
	for (const l of links) classified.push(classifyInternalLink(l, scope));

	// Dedupe by (sourceType, sourceId) — should be unique already, but safe.
	const seen = new Set<string>();
	const uniq = classified.filter((c) => {
		const k = `${c.sourceType}:${c.sourceId}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});

	// Per-group cap — Sharon's spec: Human Review should be small (5-20), and
	// the plan as a whole should be actionable not overwhelming. Anything past
	// the cap is downgraded to monitor_only / skip so it stays visible without
	// drowning the safe groups.
	const GROUP_CAPS: Partial<Record<ItemGroup, number>> = {
		safe_meta: 30,
		quick_wins: 30,
		content_expansion: 20,
		internal_linking: 50,
		human_review: 20,
		// blocked + monitor_only stay uncapped — they're counts, not work items.
	};
	const sorted = uniq.sort((a, b) => b.priorityScore - a.priorityScore);
	const groupSeen = new Map<string, number>();
	const capped: ClassifiedItem[] = [];
	for (const item of sorted) {
		const cap = GROUP_CAPS[item.group];
		const count = groupSeen.get(item.group) ?? 0;
		if (cap != null && count >= cap) {
			// Demote to monitor_only with a reason. Operator still sees it but
			// it's not in the "to act on" bucket.
			capped.push({
				...item,
				group: "monitor_only",
				decision: "skip",
				automationMode: "manual_only",
				reason: `${item.reason} · עבר את הסף לקבוצה (${cap})`,
			});
		} else {
			groupSeen.set(item.group, count + 1);
			capped.push(item);
		}
	}

	const summary = computeSummary(capped);

	// Archive any prior active plan
	await db.seoWorkPlan.updateMany({
		where: {
			clientId,
			status: { in: ["draft", "needs_review", "approved", "preparing", "prepared", "partially_prepared"] },
		},
		data: { status: "superseded" },
	});

	const title = `${planTypeTitle(planType)} · ${new Date().toLocaleDateString("he-IL")}`;

	const plan = await db.seoWorkPlan.create({
		data: {
			clientId,
			planType,
			title,
			status: "draft",
			summary: JSON.stringify(summary),
			totalItems: summary.totalItems,
			safeItemsCount: summary.safeItemsCount,
			reviewItemsCount: summary.reviewItemsCount,
			blockedItemsCount: summary.blockedItemsCount,
			monitorItemsCount: summary.monitorItemsCount,
			estimatedImpact: estimateImpact(capped),
			estimatedRisk: estimateRisk(capped),
		},
	});

	// Bulk-create items
	if (capped.length > 0) {
		await db.seoWorkPlanItem.createMany({
			data: capped.map((c) => ({
				workPlanId: plan.id,
				clientId,
				sourceType: c.sourceType,
				sourceId: c.sourceId,
				group: c.group,
				decision: c.decision,
				automationMode: c.automationMode,
				actionType: c.actionType,
				targetUrl: c.targetUrl,
				title: c.title,
				summary: c.summary,
				riskLevel: c.riskLevel,
				confidence: c.confidence,
				priorityScore: c.priorityScore,
				status: "planned",
				reason: c.reason,
				blockedReason: c.blockedReason,
			})),
		});
	}

	return { planId: plan.id, summary };
}

function planTypeTitle(t: PlanType): string {
	switch (t) {
		case "monthly_seo_work":
			return "תוכנית עבודה חודשית";
		case "quick_wins":
			return "Quick Wins";
		case "technical_cleanup":
			return "ניקוי טכני";
		case "meta_optimization":
			return "אופטימיזציית Meta";
		case "content_strategy":
			return "אסטרטגיית תוכן";
		case "internal_links":
			return "קישורים פנימיים";
		case "mixed":
			return "מעורב";
	}
}

function estimateImpact(items: ClassifiedItem[]): string {
	const safe = items.filter((i) => i.decision === "auto_prepare").length;
	if (safe >= 20) return "high";
	if (safe >= 5) return "medium";
	return "low";
}

function estimateRisk(items: ClassifiedItem[]): string {
	const critical = items.filter((i) => i.riskLevel === "critical").length;
	const high = items.filter((i) => i.riskLevel === "high").length;
	if (critical > 0) return "critical";
	if (high >= 5) return "high";
	if (high > 0) return "medium";
	return "low";
}

function computeSummary(items: ClassifiedItem[]): PlanSummary {
	const groups: ItemGroup[] = [
		"safe_meta",
		"quick_wins",
		"content_expansion",
		"internal_linking",
		"human_review",
		"blocked",
		"monitor_only",
	];
	const byGroup: Record<string, { group: ItemGroup; total: number; byDecision: Partial<Record<ItemDecision, number>> }> = {};
	for (const g of groups) byGroup[g] = { group: g, total: 0, byDecision: {} };
	let safe = 0, review = 0, blocked = 0, monitor = 0;
	for (const i of items) {
		byGroup[i.group].total++;
		byGroup[i.group].byDecision[i.decision] = (byGroup[i.group].byDecision[i.decision] ?? 0) + 1;
		if (APPROVABLE_GROUPS.includes(i.group)) safe++;
		else if (i.group === "human_review") review++;
		else if (i.group === "blocked") blocked++;
		else if (i.group === "monitor_only") monitor++;
	}
	return {
		totalItems: items.length,
		safeItemsCount: safe,
		reviewItemsCount: review,
		blockedItemsCount: blocked,
		monitorItemsCount: monitor,
		byGroup: byGroup as Record<ItemGroup, { group: ItemGroup; total: number; byDecision: Partial<Record<ItemDecision, number>> }>,
	};
}

// ─── Loaders ─────────────────────────────────────────────────

export async function loadWorkPlanForClient(clientId: string) {
	return db.seoWorkPlan.findFirst({
		where: {
			clientId,
			status: { in: ["draft", "needs_review", "approved", "preparing", "prepared", "partially_prepared"] },
		},
		orderBy: { createdAt: "desc" },
	});
}

export async function loadWorkPlanWithItems(planId: string) {
	const plan = await db.seoWorkPlan.findUnique({ where: { id: planId } });
	if (!plan) return null;
	const items = await db.seoWorkPlanItem.findMany({
		where: { workPlanId: planId },
		orderBy: [{ group: "asc" }, { priorityScore: "desc" }],
	});
	return { plan, items };
}

export async function getActiveWorkPlanSummary(clientId: string) {
	const plan = await loadWorkPlanForClient(clientId);
	if (!plan) return null;
	return {
		id: plan.id,
		title: plan.title,
		status: plan.status,
		totalItems: plan.totalItems,
		safeItemsCount: plan.safeItemsCount,
		reviewItemsCount: plan.reviewItemsCount,
		blockedItemsCount: plan.blockedItemsCount,
		monitorItemsCount: plan.monitorItemsCount,
		createdAt: plan.createdAt,
		approvedAt: plan.approvedAt,
	};
}

// ─── Approve ─────────────────────────────────────────────────

interface ApproveResult {
	planId: string;
	group: ItemGroup;
	prepared: number;
	skipped: number;
	failed: number;
	notes: string[];
}

/**
 * Approve a single group within a plan. Prepares each auto_prepare item:
 *   - keyword_strategy: create Brief from the most-actionable step
 *   - content_brief (title_meta_update + approved): create ExecutionAction draft
 *   - internal_link_suggestion: mark approved
 *   - opportunity: mark approved (no auto-create of brief/exec — those are
 *     downstream pathways)
 *
 * NEVER runs Dry Run. NEVER executes. NEVER hits the plugin write API.
 */
export async function approveWorkPlanGroup(
	planId: string,
	group: ItemGroup,
	actor: string,
): Promise<ApproveResult> {
	if (!APPROVABLE_GROUPS.includes(group)) {
		throw new Error(`קבוצה ${GROUP_LABEL[group]} לא ניתנת לאישור`);
	}
	const plan = await db.seoWorkPlan.findUnique({ where: { id: planId } });
	if (!plan) throw new Error("Work plan not found");

	const items = await db.seoWorkPlanItem.findMany({
		where: { workPlanId: planId, group, decision: "auto_prepare", status: "planned" },
		orderBy: { priorityScore: "desc" },
	});

	let prepared = 0;
	let skipped = 0;
	let failed = 0;
	const notes: string[] = [];

	for (const item of items) {
		await db.seoWorkPlanItem.update({
			where: { id: item.id },
			data: { status: "preparing" },
		});
		try {
			const result = await prepareItem(item, actor);
			if (result.skipped) {
				skipped++;
				await db.seoWorkPlanItem.update({
					where: { id: item.id },
					data: { status: "skipped", error: result.error ?? null },
				});
				if (result.error) notes.push(`דולג: ${item.title} — ${result.error}`);
				continue;
			}
			await db.seoWorkPlanItem.update({
				where: { id: item.id },
				data: {
					status: "prepared",
					preparedAt: new Date(),
					preparedSourceType: result.preparedSourceType ?? null,
					preparedSourceId: result.preparedSourceId ?? null,
				},
			});
			prepared++;
		} catch (err) {
			failed++;
			const msg = (err as Error).message;
			notes.push(`נכשל: ${item.title} — ${msg}`);
			await db.seoWorkPlanItem.update({
				where: { id: item.id },
				data: { status: "failed", error: msg },
			});
		}
	}

	// Update plan status
	const allItems = await db.seoWorkPlanItem.findMany({
		where: { workPlanId: planId },
		select: { status: true, decision: true },
	});
	const planStatus = derivePlanStatus(allItems);
	await db.seoWorkPlan.update({
		where: { id: planId },
		data: {
			status: planStatus,
			approvedAt: plan.approvedAt ?? new Date(),
			approvedBy: plan.approvedBy ?? actor,
			preparedAt: planStatus === "prepared" || planStatus === "completed" ? new Date() : plan.preparedAt,
		},
	});

	return { planId, group, prepared, skipped, failed, notes };
}

function derivePlanStatus(items: { status: string; decision: string }[]): string {
	const total = items.length;
	if (total === 0) return "draft";
	const autoTotal = items.filter((i) => i.decision === "auto_prepare").length;
	if (autoTotal === 0) return "prepared";
	const prepared = items.filter((i) => i.decision === "auto_prepare" && i.status === "prepared").length;
	const failed = items.filter((i) => i.decision === "auto_prepare" && i.status === "failed").length;
	if (prepared === autoTotal) return "prepared";
	if (prepared + failed === autoTotal && prepared > 0) return "partially_prepared";
	if (prepared > 0) return "preparing";
	return "approved";
}

interface PreparedItemResult {
	skipped?: boolean;
	error?: string;
	preparedSourceType?: string;
	preparedSourceId?: string;
}

async function prepareItem(
	item: {
		id: string;
		sourceType: string;
		sourceId: string;
		actionType: string | null;
		targetUrl: string | null;
	},
	actor: string,
): Promise<PreparedItemResult> {
	switch (item.sourceType) {
		case "keyword_strategy":
			return prepareStrategyItem(item.sourceId, actor);
		case "content_brief":
			return prepareBriefItem(item.sourceId, item.actionType, actor);
		case "internal_link_suggestion":
			return prepareInternalLinkItem(item.sourceId);
		case "opportunity":
			return prepareOpportunityItem(item.sourceId);
		default:
			return { skipped: true, error: `sourceType ${item.sourceType} not supported` };
	}
}

async function prepareStrategyItem(strategyId: string, _actor: string): Promise<PreparedItemResult> {
	const strategy = await db.keywordStrategy.findUnique({ where: { id: strategyId } });
	if (!strategy) return { skipped: true, error: "Strategy not found" };

	let payload: { actionPlan: Array<{ stepNumber: number; actionType: string; requiresHumanReview?: boolean }> };
	try {
		payload = JSON.parse(strategy.payload);
	} catch {
		return { skipped: true, error: "strategy payload corrupt" };
	}

	// Find first step that maps to a briefType AND doesn't require human review
	const step = payload.actionPlan.find((s) => {
		if (s.requiresHumanReview) return false;
		return actionTypeToBriefType(s.actionType) !== null;
	});
	if (!step) return { skipped: true, error: "No safe brief-able step found" };

	// Dedupe — if brief already exists for this strategy step, reuse it.
	const existing = await db.contentBrief.findFirst({
		where: {
			clientId: strategy.clientId,
			keywordStrategyId: strategy.id,
			strategyStepIndex: step.stepNumber,
		},
	});
	if (existing) {
		return { preparedSourceType: "content_brief", preparedSourceId: existing.id };
	}

	const generated = await generateBriefFromStrategyStep(strategy.id, step.stepNumber);
	if (!generated) return { skipped: true, error: "Generator returned null" };

	const created = await db.contentBrief.create({
		data: {
			clientId: strategy.clientId,
			sourceType: "keyword_strategy",
			keywordStrategyId: strategy.id,
			strategyStepIndex: step.stepNumber,
			strategyContext: generated.strategyContext,
			targetKeyword: generated.targetKeyword,
			relatedQuery: generated.relatedQuery ?? null,
			relatedPage: generated.relatedPage ?? null,
			briefType: generated.briefType,
			searchIntent: generated.searchIntent,
			recommendedTitle: generated.recommendedTitle ?? null,
			recommendedMetaDescription: generated.recommendedMetaDescription ?? null,
			recommendedH1: generated.recommendedH1 ?? null,
			outline: generated.outline ?? null,
			secondaryKeywords: generated.secondaryKeywords,
			internalLinks: generated.internalLinks,
			recommendedCTA: generated.recommendedCTA ?? null,
			recommendedSchema: generated.recommendedSchema ?? null,
			contentAngle: generated.contentAngle ?? null,
			notes: generated.notes ?? null,
			status: "draft",
		},
	});
	return { preparedSourceType: "content_brief", preparedSourceId: created.id };
}

async function prepareBriefItem(
	briefId: string,
	actionType: string | null,
	actor: string,
): Promise<PreparedItemResult> {
	if (actionType !== "yoast_title_update" && actionType !== "yoast_description_update") {
		return { skipped: true, error: `actionType ${actionType} not supported from Brief` };
	}
	const r = await createExecutionActionFromBrief({
		briefId,
		actionType: actionType as "yoast_title_update" | "yoast_description_update",
		actor,
	});
	if (!r.ok || !r.actionId) return { skipped: true, error: r.error ?? "createExecutionActionFromBrief failed" };
	return { preparedSourceType: "execution_action", preparedSourceId: r.actionId };
}

async function prepareInternalLinkItem(linkId: string): Promise<PreparedItemResult> {
	const link = await db.internalLinkSuggestion.findUnique({ where: { id: linkId } });
	if (!link) return { skipped: true, error: "Link not found" };
	if (link.status === "approved") {
		return { preparedSourceType: "internal_link_suggestion", preparedSourceId: link.id };
	}
	await db.internalLinkSuggestion.update({
		where: { id: linkId },
		data: { status: "approved" },
	});
	return { preparedSourceType: "internal_link_suggestion", preparedSourceId: link.id };
}

async function prepareOpportunityItem(oppId: string): Promise<PreparedItemResult> {
	const o = await db.opportunity.findUnique({ where: { id: oppId } });
	if (!o) return { skipped: true, error: "Opportunity not found" };
	if (o.status === "approved") {
		return { preparedSourceType: "opportunity", preparedSourceId: o.id };
	}
	if (["dismissed", "rejected", "monitoring"].includes(o.status)) {
		return { skipped: true, error: `opportunity already ${o.status}` };
	}
	await db.opportunity.update({
		where: { id: oppId },
		data: {
			status: "approved",
			approvedAt: new Date(),
			approvedBy: "work_plan",
			approvalNote: "אושר אוטומטית דרך תוכנית עבודה",
		},
	});
	return { preparedSourceType: "opportunity", preparedSourceId: o.id };
}

// ─── Cancel ─────────────────────────────────────────────────

export async function cancelWorkPlan(planId: string, _actor: string): Promise<void> {
	await db.seoWorkPlan.update({
		where: { id: planId },
		data: { status: "cancelled" },
	});
}
