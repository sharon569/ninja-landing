// Phase 16 — Durable job queue (server-only).
//
// enqueueJob()  → Insert a PipelineRun with status=queued.
// drainJobs()   → Pick up queued jobs and process them, one at a time per
//                 (clientId, type) pair so we don't double-refresh the same
//                 client concurrently.
// processJob()  → Dispatch a single job to the right existing function.
//
// The worker route (/api/jobs/drain) calls drainJobs() and is invoked by:
//   1. Vercel Cron (every minute)
//   2. Self-invoke from the Telegram webhook after enqueuing a job
//
// INVARIANT: enqueueJob is idempotent — if a (clientId, type, status=queued)
// row already exists, it returns the existing ID instead of creating a dup.

import "server-only";

import { db } from "@/lib/db";
import type { PipelineRunType, JobPayload, JobResult } from "@/lib/jobs";

// ─── Enqueue ──────────────────────────────────────────────────

export async function enqueueJob(
	type: PipelineRunType,
	clientId: string | null,
	payload: JobPayload | null,
	triggeredBy: string,
): Promise<{ id: string; alreadyQueued: boolean }> {
	// Dedup: skip if an identical job is already queued (or running).
	if (clientId) {
		const existing = await db.pipelineRun.findFirst({
			where: {
				clientId,
				type,
				status: { in: ["queued", "running"] },
			},
			select: { id: true },
		});
		if (existing) {
			return { id: existing.id, alreadyQueued: true };
		}
	}

	const run = await db.pipelineRun.create({
		data: {
			clientId,
			type,
			status: "queued",
			triggeredBy,
			payload: payload ? JSON.stringify(payload) : null,
		},
	});

	return { id: run.id, alreadyQueued: false };
}

// ─── Drain ────────────────────────────────────────────────────

/** Max jobs to process in a single drain call (guards against runaway). */
const MAX_JOBS_PER_DRAIN = 10;

export interface DrainResult {
	processed: number;
	succeeded: number;
	failed: number;
	skipped: number;
}

export async function drainJobs(): Promise<DrainResult> {
	const result: DrainResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

	// Fetch oldest queued jobs, limited.
	const queued = await db.pipelineRun.findMany({
		where: { status: "queued" },
		orderBy: { createdAt: "asc" },
		take: MAX_JOBS_PER_DRAIN,
	});

	for (const job of queued) {
		// Per-client lock: skip if another job of the same type is already
		// running for this client.
		if (job.clientId) {
			const running = await db.pipelineRun.findFirst({
				where: {
					clientId: job.clientId,
					type: job.type,
					status: "running",
					id: { not: job.id },
				},
				select: { id: true },
			});
			if (running) {
				result.skipped++;
				continue;
			}
		}

		// Mark as running.
		await db.pipelineRun.update({
			where: { id: job.id },
			data: { status: "running", startedAt: new Date() },
		});

		result.processed++;

		try {
			const payload: JobPayload | null = job.payload
				? (JSON.parse(job.payload) as JobPayload)
				: null;

			const jobResult = await processJob(
				job.type as PipelineRunType,
				job.clientId,
				payload,
				job.triggeredBy,
			);

			await db.pipelineRun.update({
				where: { id: job.id },
				data: {
					status: "success",
					finishedAt: new Date(),
					result: JSON.stringify(jobResult),
				},
			});

			result.succeeded++;
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			console.error(`[jobs] PipelineRun ${job.id} (${job.type}) failed:`, errorMsg);

			await db.pipelineRun.update({
				where: { id: job.id },
				data: {
					status: "failed",
					finishedAt: new Date(),
					error: errorMsg.slice(0, 2000),
				},
			});

			result.failed++;
		}
	}

	return result;
}

// ─── Process ──────────────────────────────────────────────────

async function processJob(
	type: PipelineRunType,
	clientId: string | null,
	payload: JobPayload | null,
	triggeredBy: string,
): Promise<JobResult> {
	switch (type) {
		case "full_refresh": {
			if (!clientId) throw new Error("full_refresh requires clientId");
			// Dynamic import to avoid pulling all engines into every entry point.
			const { refreshClient } = await import("@/lib/refresh-server");
			const result = await refreshClient(clientId, triggeredBy);
			return {
				summary: `Refresh done: ${result.opportunities.detected} opps, ${result.strategies.ran} strategies`,
				...result,
			};
		}

		case "scan": {
			if (!clientId) throw new Error("scan requires clientId");
			const { runScan } = await import("@/app/actions");
			await runScan(clientId);
			return { summary: "Scan completed" };
		}

		case "gsc_sync": {
			if (!clientId) throw new Error("gsc_sync requires clientId");
			const { syncGsc } = await import("@/app/actions-gsc");
			await syncGsc(clientId);
			return { summary: "GSC sync completed" };
		}

		case "keyword_refresh": {
			if (!clientId) throw new Error("keyword_refresh requires clientId");
			// Phase 2 will add refreshKeywords() — for now, fall back to full refresh.
			const { refreshClient } = await import("@/lib/refresh-server");
			const result = await refreshClient(clientId, triggeredBy);
			return {
				summary: `Keyword refresh (via full refresh): ${result.strategies.ran} strategies`,
				...result,
			};
		}

		case "speed_audit": {
			// Phase 6 will add runFullSpeedAudit() — stub for now.
			return { summary: "Speed audit not yet implemented" };
		}

		case "content_generate": {
			// Phase 4 will add generateContent() — stub for now.
			return { summary: "Content generation not yet implemented" };
		}

		default: {
			const _exhaustive: never = type;
			throw new Error(`Unknown job type: ${_exhaustive}`);
		}
	}
}

// ─── Utilities ────────────────────────────────────────────────

/** Wake the worker route by self-invoking it. Fire-and-forget. */
export function wakeWorker(): void {
	const baseUrl = process.env.PUBLIC_ANALYZER_URL || "https://seo.samp.ninja";
	const secret = process.env.CRON_SECRET;
	if (!secret) {
		console.warn("[jobs] CRON_SECRET not set — cannot wake worker");
		return;
	}

	// Fire-and-forget: we don't await this. The worker will pick up the job.
	fetch(`${baseUrl}/api/jobs/drain`, {
		method: "POST",
		headers: { Authorization: `Bearer ${secret}` },
		cache: "no-store",
	}).catch((err) => {
		console.warn("[jobs] Failed to wake worker:", (err as Error).message);
	});
}
