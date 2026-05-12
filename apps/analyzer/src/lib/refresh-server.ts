// Phase 15D Bundle D — "Refresh Everything" for one client (server-only).
//
// Forces a full pipeline run for a single client:
//   1. GSC sync (bypass staleness)
//   2. Technical audit (if a scan exists)
//   3. Opportunity analysis
//   4. Impact reviews (only ones that came due)
//   5. Strategy recompute per active TargetKeyword
//   6. Work Plan rebuild (so the operator sees fresh groupings)
//
// Never writes to a client site. Never runs Dry Run. Never executes.
// Wraps each step in an AutomationRun row so the operator can see the
// chain on /automation.

import "server-only";
import { db } from "./db";
import { searchAnalyticsQuery, defaultDateRange } from "./gsc";
import { analyzeOpportunities } from "./opportunities-server";
import { runTechnicalAudit } from "./tech-audit-server";
import { computeImpactReview } from "./impact-server";
import { computeKeywordStrategy } from "./strategy-server";
import { buildSeoWorkPlan } from "./work-plan-server";

export interface RefreshResult {
	clientId: string;
	parentRunId: string;
	gsc: { ran: boolean; rowsFetched: number; rowsWithPage: number; error?: string };
	techAudit: { ran: boolean; findings: number; opps: number; error?: string; skippedReason?: string };
	opportunities: { ran: boolean; detected: number; created: number; updated: number; error?: string };
	impactReviews: { ran: number; failed: number };
	strategies: { ran: number; failed: number; ineligibleRankingPage: number };
	workPlan: { ran: boolean; planId?: string; totalItems?: number; safeItemsCount?: number; reviewItemsCount?: number; blockedItemsCount?: number; monitorItemsCount?: number; error?: string };
	durationMs: number;
}

async function startRun(runType: string, clientId: string, triggeredBy: string, parentId: string | null) {
	const row = await db.automationRun.create({
		data: { runType, clientId, triggeredBy, parentRunId: parentId, status: "running", startedAt: new Date() },
	});
	return row.id;
}

async function finishRun(
	runId: string,
	status: "success" | "failed" | "skipped" | "partial_success",
	opts: { summary?: object; error?: string; skippedReason?: string } = {},
) {
	const row = await db.automationRun.findUnique({ where: { id: runId } });
	if (!row) return;
	const finishedAt = new Date();
	await db.automationRun.update({
		where: { id: runId },
		data: {
			status,
			finishedAt,
			durationMs: finishedAt.getTime() - row.startedAt.getTime(),
			summary: opts.summary ? JSON.stringify(opts.summary) : null,
			error: opts.error ?? null,
			skippedReason: opts.skippedReason ?? null,
		},
	});
}

/**
 * Run the full refresh pipeline for a single client. Returns a summary the
 * UI can render. Each step has its own AutomationRun row tied to a parent.
 *
 * Safety:
 *   - No live writes. Each step is read/compute/persist within the analyzer's
 *     own tables. The plugin is hit ONLY for tech audit (read) — never for
 *     write. Dry Run + Execute remain manual on /execution.
 */
export async function refreshClient(clientId: string, actor: string = "refresh_button"): Promise<RefreshResult> {
	const startedAt = Date.now();
	const client = await db.client.findUnique({ where: { id: clientId } });
	if (!client) throw new Error(`Client ${clientId} not found`);

	const parentRunId = await startRun("full_client_refresh", clientId, actor, null);

	const result: RefreshResult = {
		clientId,
		parentRunId,
		gsc: { ran: false, rowsFetched: 0, rowsWithPage: 0 },
		techAudit: { ran: false, findings: 0, opps: 0 },
		opportunities: { ran: false, detected: 0, created: 0, updated: 0 },
		impactReviews: { ran: 0, failed: 0 },
		strategies: { ran: 0, failed: 0, ineligibleRankingPage: 0 },
		workPlan: { ran: false },
		durationMs: 0,
	};

	// ─── 1. GSC sync (force) ────────────────────────────────────
	try {
		const account = await db.gscAccount.findFirst();
		if (!account) {
			const runId = await startRun("gsc_sync", clientId, actor, parentRunId);
			await finishRun(runId, "skipped", { skippedReason: "No GSC account connected" });
			result.gsc.error = "No GSC account connected";
		} else if (!client.gscPropertyUrl) {
			const runId = await startRun("gsc_sync", clientId, actor, parentRunId);
			await finishRun(runId, "skipped", { skippedReason: "No GSC property assigned" });
			result.gsc.error = "No GSC property assigned";
		} else {
			const runId = await startRun("gsc_sync", clientId, actor, parentRunId);
			try {
				const { startDate, endDate } = defaultDateRange();
				const rows = await searchAnalyticsQuery({
					refreshToken: account.refreshToken,
					propertyUrl: client.gscPropertyUrl,
					startDate,
					endDate,
					dimensions: ["date", "query", "page"],
					rowLimit: 25_000,
				});
				await db.gscDailyRow.deleteMany({
					where: { clientId, date: { gte: startDate, lte: endDate } },
				});
				const withPage = rows.filter((r) => r.keys[2] && r.keys[2].length > 0).length;
				if (rows.length > 0) {
					await db.gscDailyRow.createMany({
						data: rows.map((r) => ({
							clientId,
							date: r.keys[0],
							query: r.keys[1],
							page: r.keys[2] ?? null,
							clicks: r.clicks,
							impressions: r.impressions,
							ctr: r.ctr,
							position: r.position,
						})),
					});
				}
				await db.client.update({
					where: { id: clientId },
					data: { gscLastSyncAt: new Date() },
				});
				result.gsc = { ran: true, rowsFetched: rows.length, rowsWithPage: withPage };
				await finishRun(runId, "success", {
					summary: { rowsFetched: rows.length, rowsWithPage: withPage, startDate, endDate, forced: true },
				});
			} catch (err) {
				result.gsc.error = (err as Error).message;
				await finishRun(runId, "failed", { error: (err as Error).message });
			}
		}
	} catch (err) {
		result.gsc.error = (err as Error).message;
	}

	// ─── 2. Tech audit (if scan exists) ─────────────────────────
	try {
		const latestScan = await db.scan.findFirst({
			where: { clientId },
			orderBy: { ranAt: "desc" },
			select: { id: true },
		});
		const runId = await startRun("technical_audit", clientId, actor, parentRunId);
		if (!latestScan) {
			await finishRun(runId, "skipped", { skippedReason: "No scan available" });
			result.techAudit.skippedReason = "אין סריקה זמינה — הרץ סריקה ידנית";
		} else {
			try {
				const r = await runTechnicalAudit(clientId);
				result.techAudit = {
					ran: true,
					findings: r.findingsCreated,
					opps: r.opportunitiesCreated + r.opportunitiesUpdated,
				};
				await finishRun(runId, "success", { summary: { ...r, forced: true } });
			} catch (err) {
				result.techAudit.error = (err as Error).message;
				await finishRun(runId, "failed", { error: (err as Error).message });
			}
		}
	} catch (err) {
		result.techAudit.error = (err as Error).message;
	}

	// ─── 3. Opportunity analysis (force) ────────────────────────
	try {
		const runId = await startRun("opportunity_analysis", clientId, actor, parentRunId);
		const gscRows = await db.gscDailyRow.count({ where: { clientId } });
		if (gscRows === 0) {
			await finishRun(runId, "skipped", { skippedReason: "No GSC data after sync" });
		} else {
			try {
				const r = await analyzeOpportunities(clientId);
				result.opportunities = {
					ran: true,
					detected: r.detected,
					created: r.created,
					updated: r.updated,
				};
				await finishRun(runId, "success", { summary: { ...r, forced: true } });
			} catch (err) {
				result.opportunities.error = (err as Error).message;
				await finishRun(runId, "failed", { error: (err as Error).message });
			}
		}
	} catch (err) {
		result.opportunities.error = (err as Error).message;
	}

	// ─── 4. Impact reviews ──────────────────────────────────────
	try {
		const monitoring = await db.opportunity.findMany({
			where: {
				clientId,
				status: { in: ["monitoring", "manually_applied", "impact_reviewed"] },
				manuallyAppliedAt: { not: null },
			},
			include: { impactReviews: { select: { reviewWindow: true } } },
		});
		const now = Date.now();
		for (const opp of monitoring) {
			if (!opp.manuallyAppliedAt) continue;
			const elapsed = (now - opp.manuallyAppliedAt.getTime()) / 86_400_000;
			const existing = new Set(opp.impactReviews.map((r) => r.reviewWindow));
			const windows: ("7d" | "14d" | "30d")[] = [];
			if (elapsed >= 7 && !existing.has("7d")) windows.push("7d");
			if (elapsed >= 14 && !existing.has("14d")) windows.push("14d");
			if (elapsed >= 30 && !existing.has("30d")) windows.push("30d");
			for (const w of windows) {
				const runId = await startRun("impact_review", clientId, actor, parentRunId);
				try {
					const r = await computeImpactReview(opp.id, w);
					await finishRun(runId, "success", {
						summary: { opportunityId: opp.id, window: w, result: r.result, summary: r.summary },
					});
					result.impactReviews.ran++;
				} catch (err) {
					result.impactReviews.failed++;
					await finishRun(runId, "failed", { error: (err as Error).message });
				}
			}
		}
	} catch (err) {
		// non-fatal
		console.error("impact reviews failed:", err);
	}

	// ─── 5. Strategy recompute per active TargetKeyword ─────────
	try {
		const activeKeywords = await db.targetKeyword.findMany({
			where: { clientId, status: "active" },
			select: { id: true, keyword: true },
		});
		const strategiesByKeywordId = new Map<string, string>();
		const existingStrategies = await db.keywordStrategy.findMany({
			where: { clientId, targetKeywordId: { in: activeKeywords.map((k) => k.id) } },
			select: { id: true, targetKeywordId: true },
		});
		for (const s of existingStrategies) strategiesByKeywordId.set(s.targetKeywordId, s.id);

		for (const kw of activeKeywords) {
			try {
				const fresh = await computeKeywordStrategy(kw.id);
				const data = {
					clientId,
					targetKeywordId: kw.id,
					keyword: fresh.keyword,
					strategyType: fresh.strategyType,
					riskLevel: fresh.riskLevel,
					confidence: fresh.confidence,
					opportunityScore: fresh.opportunityScore,
					rankingPage: fresh.snapshot.rankingPage,
					currentPosition: fresh.snapshot.currentPosition,
					currentClicks: fresh.snapshot.clicks28d,
					currentImpressions: fresh.snapshot.impressions28d,
					currentCtr: fresh.snapshot.ctrPct / 100,
					trend: fresh.snapshot.trend,
					targetPageMismatch: fresh.snapshot.targetPageMismatch,
					summary: fresh.summary,
					payload: JSON.stringify(fresh),
				};
				const existingId = strategiesByKeywordId.get(kw.id);
				if (existingId) {
					await db.keywordStrategy.update({ where: { id: existingId }, data });
				} else {
					await db.keywordStrategy.create({ data });
				}
				if (fresh.snapshot.rankingPageIneligibleUrl) result.strategies.ineligibleRankingPage++;
				result.strategies.ran++;
			} catch (err) {
				console.error(`strategy recompute failed for ${kw.keyword}:`, err);
				result.strategies.failed++;
			}
		}
	} catch (err) {
		console.error("strategy step failed:", err);
	}

	// ─── 6. Work Plan rebuild ───────────────────────────────────
	try {
		const r = await buildSeoWorkPlan(clientId, "monthly_seo_work", actor);
		result.workPlan = {
			ran: true,
			planId: r.planId,
			totalItems: r.summary.totalItems,
			safeItemsCount: r.summary.safeItemsCount,
			reviewItemsCount: r.summary.reviewItemsCount,
			blockedItemsCount: r.summary.blockedItemsCount,
			monitorItemsCount: r.summary.monitorItemsCount,
		};
	} catch (err) {
		result.workPlan.error = (err as Error).message;
	}

	result.durationMs = Date.now() - startedAt;
	await finishRun(parentRunId, "success", {
		summary: {
			gsc: result.gsc,
			techAudit: result.techAudit,
			opportunities: result.opportunities,
			impactReviews: result.impactReviews,
			strategies: result.strategies,
			workPlan: result.workPlan,
			durationMs: result.durationMs,
			actor,
		},
	});

	return result;
}
