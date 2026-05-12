"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateBriefFromOpportunity } from "@/lib/briefs-server";
import {
	BRIEF_TYPE_OPTIONS,
	SEARCH_INTENT_OPTIONS,
	BRIEF_STATUS_OPTIONS,
} from "@/lib/briefs";
import { getCurrentUser } from "@/lib/supabase";
import {
	computeBriefExecutionReadiness,
	createExecutionActionFromBrief,
	type BriefActionType,
	type BriefExecutionReadiness,
} from "@/lib/brief-execution-server";

export interface BriefActionState {
	ok?: boolean;
	briefId?: string;
	error?: string;
}

async function actorEmail(): Promise<string> {
	try {
		const u = await getCurrentUser();
		return u?.email ?? "system";
	} catch {
		return "system";
	}
}

function revalAll(clientId: string) {
	revalidatePath(`/clients/${clientId}/briefs`);
	revalidatePath(`/clients/${clientId}/opportunities`);
	revalidatePath(`/clients/${clientId}/approvals`);
	revalidatePath(`/clients/${clientId}/report`);
	revalidatePath(`/clients/${clientId}`);
}

/**
 * Create a new ContentBrief from an Opportunity. If a brief already exists
 * for the same (client, opportunity, briefType), return its id instead.
 */
export async function createBriefFromOpportunity(
	opportunityId: string,
): Promise<BriefActionState> {
	const opp = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!opp) return { error: "Opportunity not found" };

	let generated;
	try {
		generated = await generateBriefFromOpportunity(opportunityId);
	} catch (err) {
		return { error: `Generator failed: ${(err as Error).message}` };
	}
	if (!generated) return { error: "Cannot generate brief — missing keyword or client." };

	const existing = await db.contentBrief.findUnique({
		where: {
			clientId_opportunityId_briefType: {
				clientId: opp.clientId,
				opportunityId,
				briefType: generated.briefType,
			},
		},
	});
	if (existing) {
		return { ok: true, briefId: existing.id };
	}

	const created = await db.contentBrief.create({
		data: {
			clientId: opp.clientId,
			opportunityId,
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
			status: "draft",
		},
	});

	// Log on the source opportunity
	const actor = await actorEmail();
	await db.opportunityActionLog.create({
		data: {
			clientId: opp.clientId,
			opportunityId,
			actionType: "brief_created",
			fromStatus: opp.status,
			toStatus: opp.status,
			note: `נוצר Content Brief (${generated.briefType})`,
			createdBy: actor,
		},
	});

	revalAll(opp.clientId);
	return { ok: true, briefId: created.id };
}

const briefTypeValues = BRIEF_TYPE_OPTIONS.map((o) => o.value) as [string, ...string[]];
const intentValues = SEARCH_INTENT_OPTIONS.map((o) => o.value) as [string, ...string[]];
const statusValues = BRIEF_STATUS_OPTIONS.map((o) => o.value) as [string, ...string[]];

const editSchema = z.object({
	id: z.string().min(1),
	targetKeyword: z.string().min(1).max(200),
	briefType: z.enum(briefTypeValues),
	searchIntent: z.enum(intentValues),
	recommendedTitle: z.string().max(200).optional().nullable(),
	recommendedMetaDescription: z.string().max(400).optional().nullable(),
	recommendedH1: z.string().max(200).optional().nullable(),
	outline: z.string().max(20_000).optional().nullable(),
	secondaryKeywords: z.array(z.string().max(200)).max(50).default([]),
	internalLinks: z.array(z.string().max(500)).max(30).default([]),
	recommendedCTA: z.string().max(1000).optional().nullable(),
	recommendedSchema: z.string().max(1000).optional().nullable(),
	contentAngle: z.string().max(2000).optional().nullable(),
	notes: z.string().max(4000).optional().nullable(),
	relatedPage: z.string().max(400).optional().nullable(),
});

function lines(v: FormDataEntryValue | null): string[] {
	if (!v) return [];
	return String(v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
function nonEmpty(v: FormDataEntryValue | null): string | null {
	const s = (v ?? "").toString().trim();
	return s.length > 0 ? s : null;
}

export async function updateBrief(
	_prev: BriefActionState | undefined,
	formData: FormData,
): Promise<BriefActionState> {
	const parsed = editSchema.safeParse({
		id: nonEmpty(formData.get("id")),
		targetKeyword: nonEmpty(formData.get("targetKeyword")),
		briefType: nonEmpty(formData.get("briefType")),
		searchIntent: nonEmpty(formData.get("searchIntent")) ?? "unknown",
		recommendedTitle: nonEmpty(formData.get("recommendedTitle")),
		recommendedMetaDescription: nonEmpty(formData.get("recommendedMetaDescription")),
		recommendedH1: nonEmpty(formData.get("recommendedH1")),
		outline: nonEmpty(formData.get("outline")),
		secondaryKeywords: lines(formData.get("secondaryKeywords")),
		internalLinks: lines(formData.get("internalLinks")),
		recommendedCTA: nonEmpty(formData.get("recommendedCTA")),
		recommendedSchema: nonEmpty(formData.get("recommendedSchema")),
		contentAngle: nonEmpty(formData.get("contentAngle")),
		notes: nonEmpty(formData.get("notes")),
		relatedPage: nonEmpty(formData.get("relatedPage")),
	});
	if (!parsed.success) {
		return { error: parsed.error.issues.map((i) => i.message).join("; ") };
	}

	const row = await db.contentBrief.findUnique({ where: { id: parsed.data.id } });
	if (!row) return { error: "Brief not found" };

	await db.contentBrief.update({
		where: { id: parsed.data.id },
		data: {
			targetKeyword: parsed.data.targetKeyword,
			briefType: parsed.data.briefType,
			searchIntent: parsed.data.searchIntent,
			recommendedTitle: parsed.data.recommendedTitle ?? null,
			recommendedMetaDescription: parsed.data.recommendedMetaDescription ?? null,
			recommendedH1: parsed.data.recommendedH1 ?? null,
			outline: parsed.data.outline ?? null,
			secondaryKeywords: parsed.data.secondaryKeywords,
			internalLinks: parsed.data.internalLinks,
			recommendedCTA: parsed.data.recommendedCTA ?? null,
			recommendedSchema: parsed.data.recommendedSchema ?? null,
			contentAngle: parsed.data.contentAngle ?? null,
			notes: parsed.data.notes ?? null,
			relatedPage: parsed.data.relatedPage ?? null,
		},
	});
	revalAll(row.clientId);
	return { ok: true, briefId: row.id };
}

const ALLOWED_STATUSES = new Set(BRIEF_STATUS_OPTIONS.map((s) => s.value as string));

export async function setBriefStatus(briefId: string, status: string): Promise<void> {
	if (!ALLOWED_STATUSES.has(status)) return;
	const row = await db.contentBrief.findUnique({ where: { id: briefId } });
	if (!row) return;
	await db.contentBrief.update({ where: { id: briefId }, data: { status } });
	revalAll(row.clientId);
}

export async function deleteBrief(briefId: string): Promise<void> {
	const row = await db.contentBrief.findUnique({ where: { id: briefId } });
	if (!row) return;
	await db.contentBrief.delete({ where: { id: briefId } });
	revalAll(row.clientId);
}

// ─── Phase 15D — Brief → Execution ──────────────────────────────

export async function getBriefExecutionReadiness(
	briefId: string,
): Promise<{ ok: boolean; readiness?: BriefExecutionReadiness; error?: string }> {
	const r = await computeBriefExecutionReadiness(briefId);
	if (!r) return { ok: false, error: "Brief not found" };
	return { ok: true, readiness: r };
}

export interface PrepareBriefExecutionState {
	ok?: boolean;
	actionId?: string;
	reusedExisting?: boolean;
	error?: string;
}

/**
 * Single-action prepare. The modal calls it once per chosen actionType so
 * Title + Meta create two separate ExecutionActions.
 */
export async function prepareBriefExecution(
	briefId: string,
	actionType: BriefActionType,
): Promise<PrepareBriefExecutionState> {
	const actor = await actorEmail();
	const brief = await db.contentBrief.findUnique({
		where: { id: briefId },
		select: { clientId: true },
	});
	if (!brief) return { error: "Brief not found" };

	const r = await createExecutionActionFromBrief({ briefId, actionType, actor });
	if (!r.ok) return { error: r.error };

	revalAll(brief.clientId);
	revalidatePath(`/clients/${brief.clientId}/execution`);
	return { ok: true, actionId: r.actionId, reusedExisting: r.reusedExisting };
}
