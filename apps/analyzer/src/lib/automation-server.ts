// Phase 10 — Multi-Client Cron + Auto-Sync orchestrator (server-only).
//
// Strategy: for each automation-enabled, active client, decide what needs
// to run based on freshness signals (GSC last sync, tech audit last run,
// opportunity analysis last run, impact-review windows due). Each step is
// recorded as a row in AutomationRun. Failures of one client do not fail
// siblings; we accumulate `failedClients` instead.
//
// Public surface:
//   - runAgencyAutoSync(triggeredBy) → AgencySyncResult
//   - getAutomationStatus() → AutomationStatus (last run + next-due signals)

import "server-only";
import { db } from "./db";
import { analyzeOpportunities } from "./opportunities-server";
import { runTechnicalAudit } from "./tech-audit-server";
import { computeImpactReview } from "./impact-server";
import { syncGsc } from "@/app/actions-gsc";
import {
	GSC_SYNC_STALE_DAYS,
	TECH_AUDIT_STALE_DAYS,
	OPP_ANALYSIS_STALE_DAYS,
	MAX_CLIENTS_PER_RUN,
	MAX_CONCURRENT_CLIENTS,
} from "./automation";

// ─── Types ───────────────────────────────────────────────────────

export interface AgencySyncResult {
	parentRunId: string;
	clientsProcessed: number;
	clientsSkipped: number;
	clientsFailed: number;
	runsCreated: number;
	totalOpportunitiesCreatedOrUpdated: number;
	totalTechFindings: number;
	totalImpactReviews: number;
	durationMs: number;
}

interface SubRunRecord {
	id: string;
	clientId: string;
	runType: string;
	status: "success" | "failed" | "skipped";
	durationMs: number;
	summary?: Record<string, unknown>;
	error?: string;
	skippedReason?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function daysSince(d: Date | null | undefined): number | null {
	if (!d) return null;
	return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

async function lastSuccessfulRun(clientId: string, runType: string): Promise<Date | null> {
	const r = await db.automationRun.findFirst({
		where: { clientId, runType, status: "success" },
		orderBy: { finishedAt: "desc" },
		select: { finishedAt: true },
	});
	return r?.finishedAt ?? null;
}

async function lastGscFetchAt(clientId: string): Promise<Date | null> {
	const r = await db.gscDailyRow.findFirst({
		where: { clientId },
		orderBy: { fetchedAt: "desc" },
		select: { fetchedAt: true },
	});
	return r?.fetchedAt ?? null;
}

async function startRun(
	runType: string,
	clientId: string | null,
	triggeredBy: string,
	parentRunId: string | null = null,
): Promise<string> {
	const row = await db.automationRun.create({
		data: {
			runType,
			clientId,
			triggeredBy,
			parentRunId,
			status: "running",
			startedAt: new Date(),
		},
	});
	return row.id;
}

async function finishRun(
	runId: string,
	status: "success" | "failed" | "skipped" | "partial_success",
	opts: { summary?: object; error?: string; skippedReason?: string } = {},
): Promise<SubRunRecord | null> {
	const row = await db.automationRun.findUnique({ where: { id: runId } });
	if (!row) return null;
	const finishedAt = new Date();
	const durationMs = finishedAt.getTime() - row.startedAt.getTime();
	const updated = await db.automationRun.update({
		where: { id: runId },
		data: {
			status,
			finishedAt,
			durationMs,
			summary: opts.summary ? JSON.stringify(opts.summary) : null,
			error: opts.error ?? null,
			skippedReason: opts.skippedReason ?? null,
		},
	});
	return {
		id: updated.id,
		clientId: updated.clientId ?? "",
		runType: updated.runType,
		status: status === "partial_success" ? "success" : status,
		durationMs: updated.durationMs ?? 0,
		summary: opts.summary as Record<string, unknown> | undefined,
		error: opts.error,
		skippedReason: opts.skippedReason,
	};
}

// ─── Sub-runners ───────────────────────────────────────────────

interface ClientCtx {
	id: string;
	name: string;
	status: string;
	automationEnabled: boolean;
	autoGscSyncEnabled: boolean;
	autoTechAuditEnabled: boolean;
	autoOpportunityAnalysisEnabled: boolean;
	autoImpactReviewEnabled: boolean;
	gscPropertyUrl: string | null;
}

async function maybeGscSync(client: ClientCtx, triggeredBy: string, parentId: string): Promise<{ ran: boolean; opportunitiesShouldFollow: boolean }> {
	if (!client.autoGscSyncEnabled) {
		const runId = await startRun("gsc_sync", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: "autoGscSyncEnabled=false" });
		return { ran: false, opportunitiesShouldFollow: false };
	}
	if (!client.gscPropertyUrl) {
		const runId = await startRun("gsc_sync", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: "No GSC property assigned" });
		return { ran: false, opportunitiesShouldFollow: false };
	}

	const lastFetch = await lastGscFetchAt(client.id);
	const days = daysSince(lastFetch);
	if (days !== null && days < GSC_SYNC_STALE_DAYS) {
		const runId = await startRun("gsc_sync", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: `Synced ${days}d ago (< ${GSC_SYNC_STALE_DAYS}d)` });
		return { ran: false, opportunitiesShouldFollow: false };
	}

	const runId = await startRun("gsc_sync", client.id, triggeredBy, parentId);
	try {
		await syncGsc(client.id);
		await finishRun(runId, "success", { summary: { triggeredBy, daysSinceLast: days } });
		return { ran: true, opportunitiesShouldFollow: true };
	} catch (err) {
		await finishRun(runId, "failed", { error: (err as Error).message });
		return { ran: false, opportunitiesShouldFollow: false };
	}
}

async function maybeTechAudit(client: ClientCtx, triggeredBy: string, parentId: string): Promise<boolean> {
	if (!client.autoTechAuditEnabled) {
		const runId = await startRun("technical_audit", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: "autoTechAuditEnabled=false" });
		return false;
	}

	const latestScan = await db.scan.findFirst({
		where: { clientId: client.id },
		orderBy: { ranAt: "desc" },
		select: { id: true },
	});
	if (!latestScan) {
		const runId = await startRun("technical_audit", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: "No scan available — run a scan first" });
		return false;
	}

	const last = await lastSuccessfulRun(client.id, "technical_audit");
	const days = daysSince(last);
	if (days !== null && days < TECH_AUDIT_STALE_DAYS) {
		const runId = await startRun("technical_audit", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: `Last audit ${days}d ago (< ${TECH_AUDIT_STALE_DAYS}d)` });
		return false;
	}

	const runId = await startRun("technical_audit", client.id, triggeredBy, parentId);
	try {
		const result = await runTechnicalAudit(client.id);
		await finishRun(runId, "success", {
			summary: {
				findingsCreated: result.findingsCreated,
				sitemapEntries: result.sitemapEntries,
				opportunitiesCreated: result.opportunitiesCreated,
				opportunitiesUpdated: result.opportunitiesUpdated,
				durationMs: result.durationMs,
			},
		});
		return true;
	} catch (err) {
		await finishRun(runId, "failed", { error: (err as Error).message });
		return false;
	}
}

async function maybeOppAnalysis(
	client: ClientCtx,
	triggeredBy: string,
	parentId: string,
	forceRun: boolean,
): Promise<{ ran: boolean; opps?: number }> {
	if (!client.autoOpportunityAnalysisEnabled) {
		const runId = await startRun("opportunity_analysis", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: "autoOpportunityAnalysisEnabled=false" });
		return { ran: false };
	}

	const gscRows = await db.gscDailyRow.count({ where: { clientId: client.id } });
	if (gscRows === 0) {
		const runId = await startRun("opportunity_analysis", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: "No GSC data" });
		return { ran: false };
	}

	if (!forceRun) {
		const last = await lastSuccessfulRun(client.id, "opportunity_analysis");
		const days = daysSince(last);
		if (days !== null && days < OPP_ANALYSIS_STALE_DAYS) {
			const runId = await startRun("opportunity_analysis", client.id, triggeredBy, parentId);
			await finishRun(runId, "skipped", { skippedReason: `Last analysis ${days}d ago (< ${OPP_ANALYSIS_STALE_DAYS}d)` });
			return { ran: false };
		}
	}

	const runId = await startRun("opportunity_analysis", client.id, triggeredBy, parentId);
	try {
		const result = await analyzeOpportunities(client.id);
		await finishRun(runId, "success", {
			summary: {
				detected: result.detected,
				created: result.created,
				updated: result.updated,
				staleClosed: result.staleClosed,
				durationMs: result.durationMs,
				triggeredAfterGsc: forceRun,
			},
		});
		return { ran: true, opps: result.created + result.updated };
	} catch (err) {
		await finishRun(runId, "failed", { error: (err as Error).message });
		return { ran: false };
	}
}

async function maybeImpactReviews(
	client: ClientCtx,
	triggeredBy: string,
	parentId: string,
): Promise<number> {
	if (!client.autoImpactReviewEnabled) return 0;

	// Find opportunities in monitoring/manually_applied where some window is due
	const monitoring = await db.opportunity.findMany({
		where: {
			clientId: client.id,
			status: { in: ["monitoring", "manually_applied", "impact_reviewed"] },
			manuallyAppliedAt: { not: null },
		},
		include: { impactReviews: { select: { reviewWindow: true } } },
	});

	let processed = 0;
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
			const runId = await startRun("impact_review", client.id, triggeredBy, parentId);
			try {
				const r = await computeImpactReview(opp.id, w);
				await finishRun(runId, "success", {
					summary: {
						opportunityId: opp.id,
						window: w,
						result: r.result,
						summary: r.summary,
					},
				});
				processed++;
			} catch (err) {
				await finishRun(runId, "failed", { error: (err as Error).message });
			}
		}
	}
	return processed;
}

// ─── Per-client orchestration ──────────────────────────────────

async function processClient(
	client: ClientCtx,
	triggeredBy: string,
	parentId: string,
): Promise<{
	processed: boolean;
	failed: boolean;
	skipped: boolean;
	runsCreated: number;
	skippedReason?: string;
}> {
	// Skip if not eligible
	if (client.status === "paused" || client.status === "archived") {
		const runId = await startRun("full_client_refresh", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: `client status = ${client.status}` });
		return { processed: false, failed: false, skipped: true, runsCreated: 0, skippedReason: `status=${client.status}` };
	}
	if (!client.automationEnabled) {
		const runId = await startRun("full_client_refresh", client.id, triggeredBy, parentId);
		await finishRun(runId, "skipped", { skippedReason: "automationEnabled=false" });
		return { processed: false, failed: false, skipped: true, runsCreated: 0, skippedReason: "automationEnabled=false" };
	}

	let runsCreated = 0;
	let failed = false;
	try {
		const gsc = await maybeGscSync(client, triggeredBy, parentId);
		runsCreated++;

		const tech = await maybeTechAudit(client, triggeredBy, parentId);
		if (tech) runsCreated++;
		else runsCreated++; // skip / fail also created a row

		const oppRes = await maybeOppAnalysis(
			client,
			triggeredBy,
			parentId,
			gsc.opportunitiesShouldFollow,
		);
		runsCreated++;

		const impactCount = await maybeImpactReviews(client, triggeredBy, parentId);
		runsCreated += impactCount;
	} catch (err) {
		failed = true;
		console.error(`processClient(${client.id}) failed:`, err);
	}
	return { processed: !failed, failed, skipped: false, runsCreated };
}

// ─── Public: Agency-wide sync ──────────────────────────────────

export async function runAgencyAutoSync(
	triggeredBy: string = "cron",
): Promise<AgencySyncResult> {
	const startedAt = Date.now();
	const parentId = await startRun("agency_auto_sync", null, triggeredBy, null);

	const clients = await db.client.findMany({
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			name: true,
			status: true,
			automationEnabled: true,
			autoGscSyncEnabled: true,
			autoTechAuditEnabled: true,
			autoOpportunityAnalysisEnabled: true,
			autoImpactReviewEnabled: true,
			gscPropertyUrl: true,
		},
	});

	const eligible = clients.slice(0, MAX_CLIENTS_PER_RUN);

	let clientsProcessed = 0;
	let clientsSkipped = 0;
	let clientsFailed = 0;
	let totalRunsCreated = 0;

	// Run with concurrency cap
	let cursor = 0;
	const workers = Array.from({ length: Math.min(MAX_CONCURRENT_CLIENTS, eligible.length) }, async () => {
		while (cursor < eligible.length) {
			const idx = cursor++;
			const c = eligible[idx];
			const res = await processClient(c as ClientCtx, triggeredBy, parentId);
			totalRunsCreated += res.runsCreated;
			if (res.skipped) clientsSkipped++;
			else if (res.failed) clientsFailed++;
			else clientsProcessed++;
		}
	});
	await Promise.all(workers);

	// Tally totals across the child runs for the parent summary
	const childRuns = await db.automationRun.findMany({
		where: { parentRunId: parentId, status: "success" },
		select: { runType: true, summary: true },
	});
	let totalOpps = 0;
	let totalTech = 0;
	let totalImpact = 0;
	for (const r of childRuns) {
		try {
			const s = r.summary ? JSON.parse(r.summary) : {};
			if (r.runType === "opportunity_analysis") {
				totalOpps += (s.created ?? 0) + (s.updated ?? 0);
			}
			if (r.runType === "technical_audit") {
				totalTech += s.findingsCreated ?? 0;
			}
			if (r.runType === "impact_review") {
				totalImpact++;
			}
		} catch {
			/* skip */
		}
	}

	const status: "success" | "partial_success" | "failed" =
		clientsFailed === 0
			? "success"
			: clientsProcessed > 0
				? "partial_success"
				: "failed";

	await finishRun(parentId, status, {
		summary: {
			clientsProcessed,
			clientsSkipped,
			clientsFailed,
			runsCreated: totalRunsCreated,
			totalOpportunitiesCreatedOrUpdated: totalOpps,
			totalTechFindings: totalTech,
			totalImpactReviews: totalImpact,
			eligibleClients: eligible.length,
			totalClients: clients.length,
		},
	});

	return {
		parentRunId: parentId,
		clientsProcessed,
		clientsSkipped,
		clientsFailed,
		runsCreated: totalRunsCreated,
		totalOpportunitiesCreatedOrUpdated: totalOpps,
		totalTechFindings: totalTech,
		totalImpactReviews: totalImpact,
		durationMs: Date.now() - startedAt,
	};
}

// ─── Status / Dashboard data ───────────────────────────────────

export async function getAutomationStatus() {
	const lastAgencyRun = await db.automationRun.findFirst({
		where: { runType: "agency_auto_sync" },
		orderBy: { startedAt: "desc" },
	});

	const recentRuns = await db.automationRun.findMany({
		orderBy: { startedAt: "desc" },
		take: 20,
		include: { client: { select: { name: true } } },
	});

	return { lastAgencyRun, recentRuns };
}
