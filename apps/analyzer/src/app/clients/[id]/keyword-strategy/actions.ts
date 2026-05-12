"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { computeKeywordStrategy } from "@/lib/strategy-server";
import { generateBriefFromStrategyStep, actionTypeToBriefType } from "@/lib/briefs-server";
import { getCurrentUser } from "@/lib/supabase";

async function actorEmail(): Promise<string> {
	try {
		const u = await getCurrentUser();
		return u?.email ?? "system";
	} catch {
		return "system";
	}
}

/** Build (or recompute) a KeywordStrategy for a given TargetKeyword. */
export async function buildKeywordStrategy(
	targetKeywordId: string,
): Promise<{ ok?: boolean; error?: string; strategyId?: string }> {
	try {
		const summary = await computeKeywordStrategy(targetKeywordId);
		const tk = await db.targetKeyword.findUnique({
			where: { id: targetKeywordId },
			select: { clientId: true, keyword: true },
		});
		if (!tk) return { error: "TargetKeyword not found" };

		// Upsert one strategy per (targetKeywordId). Re-running rewrites the
		// existing strategy in place so the operator's status/notes survive.
		const existing = await db.keywordStrategy.findFirst({
			where: { targetKeywordId },
			orderBy: { createdAt: "desc" },
		});

		const data = {
			clientId: tk.clientId,
			targetKeywordId,
			keyword: summary.keyword,
			strategyType: summary.strategyType,
			riskLevel: summary.riskLevel,
			confidence: summary.confidence,
			opportunityScore: summary.opportunityScore,
			rankingPage: summary.snapshot.rankingPage,
			currentPosition: summary.snapshot.currentPosition,
			currentClicks: summary.snapshot.clicks28d,
			currentImpressions: summary.snapshot.impressions28d,
			currentCtr: summary.snapshot.ctrPct / 100, // store as 0..1 fraction
			trend: summary.snapshot.trend,
			targetPageMismatch: summary.snapshot.targetPageMismatch,
			summary: summary.summary,
			payload: JSON.stringify(summary),
		};

		const saved = existing
			? await db.keywordStrategy.update({
					where: { id: existing.id },
					data: { ...data, updatedAt: new Date() },
				})
			: await db.keywordStrategy.create({ data });

		revalidatePath(`/clients/${tk.clientId}/keyword-strategy`);
		revalidatePath(`/clients/${tk.clientId}/keywords`);
		return { ok: true, strategyId: saved.id };
	} catch (err) {
		return { error: (err as Error).message };
	}
}

/** Build strategies for ALL active TargetKeywords of a client. */
export async function buildAllStrategiesForClient(
	clientId: string,
): Promise<{ ok?: boolean; built?: number; failed?: number; error?: string }> {
	try {
		const tks = await db.targetKeyword.findMany({
			where: { clientId, status: "active" },
			select: { id: true },
		});
		let built = 0;
		let failed = 0;
		for (const tk of tks) {
			const r = await buildKeywordStrategy(tk.id);
			if (r.ok) built++;
			else failed++;
		}
		revalidatePath(`/clients/${clientId}/keyword-strategy`);
		return { ok: true, built, failed };
	} catch (err) {
		return { error: (err as Error).message };
	}
}

const VALID_STATUSES = [
	"draft",
	"needs_human_review",
	"approved",
	"active",
	"monitoring",
	"completed",
	"paused",
	"rejected",
] as const;

/** Status transition. Approving and completing record actor + timestamp. */
export async function setStrategyStatus(
	formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
	const strategyId = String(formData.get("strategyId") ?? "");
	const newStatus = String(formData.get("status") ?? "");
	const note = String(formData.get("note") ?? "").trim();
	if (!strategyId) return { error: "strategyId missing" };
	if (!(VALID_STATUSES as readonly string[]).includes(newStatus)) {
		return { error: `Invalid status: ${newStatus}` };
	}
	const actor = await actorEmail();
	const strat = await db.keywordStrategy.findUnique({ where: { id: strategyId } });
	if (!strat) return { error: "Strategy not found" };

	const data: Record<string, unknown> = { status: newStatus };
	if (newStatus === "approved") {
		data.approvedAt = new Date();
		data.approvedBy = actor;
		data.approvalNote = note || null;
	}
	if (newStatus === "paused") {
		data.pausedAt = new Date();
	}
	if (newStatus === "completed") {
		data.completedAt = new Date();
	}

	await db.keywordStrategy.update({ where: { id: strategyId }, data });
	revalidatePath(`/clients/${strat.clientId}/keyword-strategy`);
	return { ok: true };
}

// Phase 15B — Create a ContentBrief from a single Strategy step.
//
// Guardrails:
//   1. strategy.status not rejected/paused
//   2. step.actionType maps to a brief type (not monitor/no_change/etc.)
//   3. strategy.recommendedNextStep !== monitor_only
//   4. step has substantive `why`
//   5. payload includes a measurement plan
//   6. risk=critical is rejected (high gets needs_human_review status)
//   7. Dedupe per (clientId, keywordStrategyId, briefType, relatedPage)
export interface CreateBriefFromStrategyState {
	ok?: boolean;
	briefId?: string;
	error?: string;
	reused?: boolean;     // brief already existed
}

export async function createBriefFromStrategyStep(
	strategyId: string,
	stepNumber: number,
): Promise<CreateBriefFromStrategyState> {
	const strategy = await db.keywordStrategy.findUnique({ where: { id: strategyId } });
	if (!strategy) return { error: "Strategy not found" };
	if (strategy.status === "rejected") return { error: "האסטרטגיה נדחתה — לא ניתן ליצור Brief." };

	let payload: { actionPlan: Array<{ stepNumber: number; actionType: string; why?: string; risk?: string; requiresHumanReview?: boolean }>; strategyType?: string; measurementPlan?: { primaryKeyword?: string } } | null = null;
	try {
		payload = JSON.parse(strategy.payload);
	} catch {
		return { error: "Strategy payload corrupted" };
	}
	const step = payload?.actionPlan.find((s) => s.stepNumber === stepNumber);
	if (!step) return { error: `Step ${stepNumber} not found in strategy` };

	// Guardrails
	const briefType = actionTypeToBriefType(step.actionType);
	if (!briefType) {
		return { error: `סוג השלב "${step.actionType}" לא מתאים ליצירת Brief (monitor / קישורים פנימיים / טכני וכו').` };
	}
	if (strategy.strategyType === "monitor_only") {
		return { error: "האסטרטגיה היא monitor_only — אין מה לבנות Brief לפי המלצה." };
	}
	if (!step.why || step.why.trim().length < 30) {
		return { error: "השלב לא כולל Why מספיק ספציפי — לא ניתן ליצור Brief מבוסס נתונים." };
	}
	if (!payload?.measurementPlan?.primaryKeyword) {
		return { error: "האסטרטגיה חסרה Measurement Plan — לא ניתן לקבוע איך נמדוד הצלחה." };
	}
	if (step.risk === "high" && strategy.confidence === "low") {
		return { error: "שילוב של סיכון גבוה + ביטחון נמוך. נדרשת סקירה אנושית במלוא משמעותה לפני יצירת Brief." };
	}

	// Dedupe: by (clientId, keywordStrategyId, briefType). relatedPage can be
	// null when ranking page is unknown so it's not part of the unique key.
	const existing = await db.contentBrief.findFirst({
		where: {
			clientId: strategy.clientId,
			keywordStrategyId: strategyId,
			briefType,
		},
		select: { id: true },
	});
	if (existing) {
		return { ok: true, briefId: existing.id, reused: true };
	}

	let generated;
	try {
		generated = await generateBriefFromStrategyStep(strategyId, stepNumber);
	} catch (err) {
		return { error: `Generator failed: ${(err as Error).message}` };
	}
	if (!generated) return { error: "Generator returned null — likely a step type that can't produce a brief." };

	// Initial status:
	//   protect_position → always needs_human_review (we're touching a Top 3 page)
	//   risk=high OR confidence=low → needs_human_review
	//   step.requiresHumanReview → needs_human_review
	//   otherwise → draft
	const initialStatus =
		strategy.strategyType === "protect_position" ||
		step.risk === "high" ||
		strategy.confidence === "low" ||
		step.requiresHumanReview
			? "needs_human_review"
			: "draft";

	const actor = await actorEmail();
	const created = await db.contentBrief.create({
		data: {
			clientId: strategy.clientId,
			sourceType: "keyword_strategy",
			keywordStrategyId: strategyId,
			strategyStepIndex: stepNumber,
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
			status: initialStatus,
		},
	});

	// Audit hint: log actor for traceability (no dedicated audit table for
	// strategy events yet — we tag via console for now).
	void actor;

	revalidatePath(`/clients/${strategy.clientId}/keyword-strategy`);
	revalidatePath(`/clients/${strategy.clientId}/briefs`);
	revalidatePath(`/clients/${strategy.clientId}/workflow`);
	return { ok: true, briefId: created.id, reused: false };
}

export async function deleteStrategy(
	strategyId: string,
): Promise<{ ok?: boolean; error?: string }> {
	const strat = await db.keywordStrategy.findUnique({ where: { id: strategyId } });
	if (!strat) return { error: "Strategy not found" };
	await db.keywordStrategy.delete({ where: { id: strategyId } });
	revalidatePath(`/clients/${strat.clientId}/keyword-strategy`);
	return { ok: true };
}
