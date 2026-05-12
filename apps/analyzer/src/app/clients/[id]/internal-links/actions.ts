"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { analyzeInternalLinks, type AnalyzeLinkResult } from "@/lib/internal-links-server";

export interface AnalyzeState {
	ok?: boolean;
	error?: string;
	result?: AnalyzeLinkResult;
}

function revalAll(clientId: string) {
	revalidatePath(`/clients/${clientId}/internal-links`);
	revalidatePath(`/clients/${clientId}/opportunities`);
	revalidatePath(`/clients/${clientId}/briefs`);
	revalidatePath(`/clients/${clientId}/report`);
	revalidatePath(`/clients/${clientId}`);
}

export async function runInternalLinkAnalysis(clientId: string): Promise<AnalyzeState> {
	try {
		const result = await analyzeInternalLinks(clientId);
		revalAll(clientId);
		return { ok: true, result };
	} catch (err) {
		return { error: `Analysis failed: ${(err as Error).message}` };
	}
}

const ALLOWED = new Set([
	"suggested",
	"needs_human_review",
	"approved",
	"used",
	"rejected",
	"dismissed",
]);

export async function setSuggestionStatus(
	suggestionId: string,
	status: string,
): Promise<void> {
	if (!ALLOWED.has(status)) return;
	const row = await db.internalLinkSuggestion.findUnique({ where: { id: suggestionId } });
	if (!row) return;
	await db.internalLinkSuggestion.update({ where: { id: suggestionId }, data: { status } });
	revalAll(row.clientId);
}

export async function deleteSuggestion(suggestionId: string): Promise<void> {
	const row = await db.internalLinkSuggestion.findUnique({ where: { id: suggestionId } });
	if (!row) return;
	await db.internalLinkSuggestion.delete({ where: { id: suggestionId } });
	revalAll(row.clientId);
}
