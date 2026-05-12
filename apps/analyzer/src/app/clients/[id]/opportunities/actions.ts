"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { analyzeOpportunities, type AnalyzeResult } from "@/lib/opportunities-server";
import { createBaseline, computeImpactReview } from "@/lib/impact-server";
import { getCurrentUser } from "@/lib/supabase";

export interface AnalyzeState {
	ok?: boolean;
	error?: string;
	result?: AnalyzeResult;
}

async function actorEmail(): Promise<string> {
	try {
		const u = await getCurrentUser();
		return u?.email ?? "system";
	} catch {
		return "system";
	}
}

async function log(
	clientId: string,
	opportunityId: string,
	actionType: string,
	fromStatus: string | null,
	toStatus: string | null,
	note?: string | null,
) {
	const createdBy = await actorEmail();
	await db.opportunityActionLog.create({
		data: { clientId, opportunityId, actionType, fromStatus, toStatus, note: note ?? null, createdBy },
	});
}

function revalAll(clientId: string) {
	revalidatePath(`/clients/${clientId}/opportunities`);
	revalidatePath(`/clients/${clientId}/approvals`);
	revalidatePath(`/clients/${clientId}/impact`);
	revalidatePath(`/clients/${clientId}/report`);
	revalidatePath(`/clients/${clientId}`);
}

// ─── Analysis runner ─────────────────────────────────────────────

export async function runOpportunityAnalysis(
	clientId: string,
): Promise<AnalyzeState> {
	try {
		const result = await analyzeOpportunities(clientId);
		revalAll(clientId);
		return { ok: true, result };
	} catch (err) {
		return { error: `Analysis failed: ${(err as Error).message}` };
	}
}

// ─── Status changes ─────────────────────────────────────────────

const SIMPLE_STATUSES = new Set(["detected", "recommended", "needs_human_review", "dismissed"]);

/** Generic status setter for transitions that don't trigger any side-effect. */
export async function setOpportunityStatus(
	opportunityId: string,
	status: string,
): Promise<void> {
	if (!SIMPLE_STATUSES.has(status)) return;
	const row = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!row) return;
	await db.opportunity.update({
		where: { id: opportunityId },
		data: { status },
	});
	await log(row.clientId, opportunityId, "status_change", row.status, status, null);
	revalAll(row.clientId);
}

/** Approve = "I confirm this recommendation; work will happen manually." */
export async function approveOpportunity(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
	const opportunityId = String(formData.get("opportunityId") ?? "");
	const note = String(formData.get("note") ?? "").trim() || null;
	const actionType = String(formData.get("actionType") ?? "").trim() || null;
	if (!opportunityId) return { error: "Missing opportunityId" };

	const row = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!row) return { error: "Opportunity not found" };

	const actor = await actorEmail();

	await db.opportunity.update({
		where: { id: opportunityId },
		data: {
			status: "approved",
			approvedAt: new Date(),
			approvedBy: actor,
			approvalNote: note,
			approvedActionType: actionType,
		},
	});
	await log(row.clientId, opportunityId, "approved", row.status, "approved", note);
	revalAll(row.clientId);
	return { ok: true };
}

export async function rejectOpportunity(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
	const opportunityId = String(formData.get("opportunityId") ?? "");
	const note = String(formData.get("note") ?? "").trim() || null;
	if (!opportunityId) return { error: "Missing opportunityId" };

	const row = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!row) return { error: "Opportunity not found" };

	const actor = await actorEmail();

	await db.opportunity.update({
		where: { id: opportunityId },
		data: { status: "rejected", rejectedAt: new Date(), rejectedBy: actor },
	});
	await log(row.clientId, opportunityId, "rejected", row.status, "rejected", note);
	revalAll(row.clientId);
	return { ok: true };
}

/** Mark as manually applied — snapshots GSC baseline, moves to monitoring. */
export async function markManuallyApplied(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
	const opportunityId = String(formData.get("opportunityId") ?? "");
	const note = String(formData.get("note") ?? "").trim() || null;
	const url = String(formData.get("url") ?? "").trim() || null;
	const appliedAtStr = String(formData.get("appliedAt") ?? "").trim();
	if (!opportunityId) return { error: "Missing opportunityId" };

	const row = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!row) return { error: "Opportunity not found" };

	const appliedAt = appliedAtStr ? new Date(appliedAtStr) : new Date();
	if (Number.isNaN(appliedAt.getTime())) {
		return { error: "Invalid appliedAt date" };
	}

	const actor = await actorEmail();

	await db.opportunity.update({
		where: { id: opportunityId },
		data: {
			status: "monitoring",
			manuallyAppliedAt: appliedAt,
			manuallyAppliedBy: actor,
			manualActionNote: note,
			manualActionUrl: url,
			monitoringStartedAt: new Date(),
		},
	});

	await createBaseline(opportunityId);
	await log(row.clientId, opportunityId, "marked_manual_applied", row.status, "monitoring", note);
	revalAll(row.clientId);
	return { ok: true };
}

/** Run impact review for a specific window. */
export async function runImpactReview(
	opportunityId: string,
	reviewWindow: "7d" | "14d" | "30d",
): Promise<{ ok?: boolean; result?: string; summary?: string; error?: string }> {
	const row = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!row) return { error: "Opportunity not found" };
	try {
		const r = await computeImpactReview(opportunityId, reviewWindow);
		await log(
			row.clientId,
			opportunityId,
			"impact_reviewed",
			row.status,
			r.result === "improved" || r.result === "declined" ? "impact_reviewed" : row.status,
			`${reviewWindow}: ${r.summary}`,
		);
		revalAll(row.clientId);
		return { ok: true, result: r.result, summary: r.summary };
	} catch (err) {
		return { error: `Impact review failed: ${(err as Error).message}` };
	}
}

export async function addOpportunityNote(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
	const opportunityId = String(formData.get("opportunityId") ?? "");
	const note = String(formData.get("note") ?? "").trim();
	if (!opportunityId || !note) return { error: "Missing data" };
	const row = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!row) return { error: "Opportunity not found" };
	await log(row.clientId, opportunityId, "note_added", row.status, row.status, note);
	revalAll(row.clientId);
	return { ok: true };
}

// Phase 14C — server action loader for the Decision Card. The engine is
// expensive (GSC aggregation + portfolio compute) so we lazy-load on the
// first expand of an Opportunity row rather than pre-compute for every row.
export async function getOpportunityDecision(opportunityId: string) {
	const { computeDecisionForOpportunity } = await import("@/lib/decision-server");
	try {
		const decision = await computeDecisionForOpportunity(opportunityId);
		const opp = await db.opportunity.findUnique({
			where: { id: opportunityId },
			select: { humanReviewedAt: true },
		});
		return { ok: true, decision, alreadyReviewed: !!opp?.humanReviewedAt };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

// Phase 14C — Mark Opportunity as Human-Reviewed. Override the Decision
// Intelligence guard so high-risk / human_review recommendations can become
// executable. Recorded with actor + timestamp + optional note for audit.
export async function markOpportunityReviewed(
	formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
	const opportunityId = String(formData.get("opportunityId") ?? "");
	const note = String(formData.get("note") ?? "").trim();
	if (!opportunityId) return { error: "opportunityId missing" };
	const actor = await actorEmail();
	const opp = await db.opportunity.findUnique({
		where: { id: opportunityId },
		select: { clientId: true, status: true },
	});
	if (!opp) return { error: "Opportunity not found" };
	await db.opportunity.update({
		where: { id: opportunityId },
		data: {
			humanReviewedAt: new Date(),
			humanReviewedBy: actor,
			humanReviewNote: note || null,
		},
	});
	await log(
		opp.clientId,
		opportunityId,
		"human_reviewed",
		opp.status,
		opp.status,
		note || "סומן כ-Reviewed לעקיפת Decision Guard",
	);
	revalidatePath(`/clients/${opp.clientId}/opportunities`);
	revalidatePath(`/clients/${opp.clientId}/workflow`);
	return { ok: true };
}

export async function deleteOpportunity(opportunityId: string): Promise<void> {
	const row = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!row) return;
	await db.opportunity.delete({ where: { id: opportunityId } });
	revalAll(row.clientId);
}
