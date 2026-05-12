"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { computeKeywordStrategy } from "@/lib/strategy-server";
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

export async function deleteStrategy(
	strategyId: string,
): Promise<{ ok?: boolean; error?: string }> {
	const strat = await db.keywordStrategy.findUnique({ where: { id: strategyId } });
	if (!strat) return { error: "Strategy not found" };
	await db.keywordStrategy.delete({ where: { id: strategyId } });
	revalidatePath(`/clients/${strat.clientId}/keyword-strategy`);
	return { ok: true };
}
