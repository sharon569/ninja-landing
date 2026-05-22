// Phase 16 — Worker route that drains the PipelineRun queue.
//
// Called by:
//   1. Vercel Cron (see vercel.json, every minute)
//   2. Self-invoke from wakeWorker() after a Telegram webhook enqueues a job
//   3. Manual POST with CRON_SECRET for debugging
//
// Auth: same Bearer CRON_SECRET pattern as /api/cron/agency-sync.

import { NextResponse, type NextRequest } from "next/server";
import { drainJobs } from "@/lib/jobs-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — enough for scan + refresh

function authorize(req: NextRequest): boolean {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;
	const header = req.headers.get("authorization");
	return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
	if (!authorize(req)) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	try {
		const result = await drainJobs();
		return NextResponse.json({ ok: true, ...result });
	} catch (err) {
		console.error("[jobs/drain] failed:", err);
		return NextResponse.json(
			{ ok: false, error: (err as Error).message },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	return GET(req);
}
