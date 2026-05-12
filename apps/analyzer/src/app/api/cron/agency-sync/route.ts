// Phase 10 — daily agency-wide auto-sync entry point.
// Triggered by Vercel Cron (see vercel.json). Protected with CRON_SECRET.
//
// The orchestrator decides per-client which sub-tasks to run; this endpoint
// only handles auth, kicks it off, and returns the summary.

import { NextResponse, type NextRequest } from "next/server";
import { runAgencyAutoSync } from "@/lib/automation-server";

// Vercel Pro/Hobby cron sends Authorization: Bearer ${CRON_SECRET}.
// For manual triggers from the dashboard we also accept POST + same header.

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

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
		const result = await runAgencyAutoSync("cron");
		return NextResponse.json({ ok: true, result });
	} catch (err) {
		console.error("agency-sync cron failed:", err);
		return NextResponse.json(
			{ ok: false, error: (err as Error).message },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	return GET(req);
}
