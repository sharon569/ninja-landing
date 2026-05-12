"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { analyzeOpportunities, type AnalyzeResult } from "@/lib/opportunities-server";

export interface AnalyzeState {
	ok?: boolean;
	error?: string;
	result?: AnalyzeResult;
}

/** Run the detector suite and upsert results for this client. Manual trigger. */
export async function runOpportunityAnalysis(
	clientId: string,
): Promise<AnalyzeState> {
	try {
		const result = await analyzeOpportunities(clientId);
		revalidatePath(`/clients/${clientId}/opportunities`);
		revalidatePath(`/clients/${clientId}`);
		revalidatePath(`/clients/${clientId}/report`);
		return { ok: true, result };
	} catch (err) {
		return { error: `Analysis failed: ${(err as Error).message}` };
	}
}

const ALLOWED_STATUSES = new Set([
	"detected",
	"recommended",
	"needs_human_review",
	"approved",
	"rejected",
	"dismissed",
	"monitoring",
]);

export async function setOpportunityStatus(
	opportunityId: string,
	status: string,
): Promise<void> {
	if (!ALLOWED_STATUSES.has(status)) return;
	const row = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!row) return;
	await db.opportunity.update({
		where: { id: opportunityId },
		data: { status },
	});
	revalidatePath(`/clients/${row.clientId}/opportunities`);
	revalidatePath(`/clients/${row.clientId}`);
}

export async function deleteOpportunity(opportunityId: string): Promise<void> {
	const row = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!row) return;
	await db.opportunity.delete({ where: { id: opportunityId } });
	revalidatePath(`/clients/${row.clientId}/opportunities`);
	revalidatePath(`/clients/${row.clientId}`);
}
