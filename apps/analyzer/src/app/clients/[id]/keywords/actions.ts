"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase";
import { enqueueJob, wakeWorker } from "@/lib/jobs-server";
import {
	INTENT_OPTIONS,
	PRIORITY_OPTIONS,
	STATUS_OPTIONS,
	BUSINESS_VALUE_OPTIONS,
	KEYWORD_GOAL_OPTIONS,
	normalizeKeyword,
} from "@/lib/keywords";

async function actorEmail(): Promise<string> {
	try {
		const u = await getCurrentUser();
		return u?.email ?? "system";
	} catch {
		return "system";
	}
}

export interface AddKeywordState {
	ok?: boolean;
	added?: number;
	skipped?: number;
	error?: string;
}

const intentValues = INTENT_OPTIONS.map((o) => o.value) as [string, ...string[]];
const priorityValues = PRIORITY_OPTIONS.map((o) => o.value) as [string, ...string[]];
const statusValues = STATUS_OPTIONS.map((o) => o.value) as [string, ...string[]];
const businessValueValues = BUSINESS_VALUE_OPTIONS.map((o) => o.value) as [string, ...string[]];
const keywordGoalValues = KEYWORD_GOAL_OPTIONS.map((o) => o.value) as [string, ...string[]];

const singleSchema = z.object({
	keyword: z.string().min(2).max(200),
	intent: z.enum(intentValues).optional().nullable(),
	priority: z.enum(priorityValues).default("medium"),
	targetUrl: z.string().max(400).optional().nullable(),
	notes: z.string().max(2000).optional().nullable(),
});

const editSchema = z.object({
	id: z.string().min(1),
	keyword: z.string().min(2).max(200),
	intent: z.enum(intentValues).optional().nullable(),
	priority: z.enum(priorityValues).default("medium"),
	targetUrl: z.string().max(400).optional().nullable(),
	status: z.enum(statusValues).default("active"),
	notes: z.string().max(2000).optional().nullable(),
	businessValue: z.enum(businessValueValues).optional().nullable(),
	keywordGoal: z.enum(keywordGoalValues).optional().nullable(),
	keywordGoalNote: z.string().max(1000).optional().nullable(),
});

function nonEmpty(v: FormDataEntryValue | null): string | null {
	const s = (v ?? "").toString().trim();
	return s.length > 0 ? s : null;
}

export async function addKeyword(
	clientId: string,
	_prev: AddKeywordState | undefined,
	formData: FormData,
): Promise<AddKeywordState> {
	const parsed = singleSchema.safeParse({
		keyword: nonEmpty(formData.get("keyword")),
		intent: nonEmpty(formData.get("intent")),
		priority: nonEmpty(formData.get("priority")) ?? "medium",
		targetUrl: nonEmpty(formData.get("targetUrl")),
		notes: nonEmpty(formData.get("notes")),
	});
	if (!parsed.success) {
		return { error: parsed.error.issues.map((i) => i.message).join("; ") };
	}
	const normalized = normalizeKeyword(parsed.data.keyword);
	try {
		await db.targetKeyword.create({
			data: {
				clientId,
				keyword: normalized,
				intent: parsed.data.intent ?? null,
				priority: parsed.data.priority,
				targetUrl: parsed.data.targetUrl ?? null,
				notes: parsed.data.notes ?? null,
			},
		});
	} catch (err) {
		const msg = (err as Error).message;
		if (msg.includes("Unique constraint") || msg.includes("unique")) {
			return { error: `מילת המפתח "${normalized}" כבר קיימת אצל הלקוח הזה.` };
		}
		return { error: `Database error: ${msg}` };
	}
	revalidatePath(`/clients/${clientId}/keywords`);
	revalidatePath(`/clients/${clientId}`);

	// Phase 16.2 — trigger auto-pipeline in background
	enqueueJob("keyword_refresh", clientId, { keywordIds: [] }, "keyword_add")
		.then(() => wakeWorker())
		.catch((err) => console.warn("[keywords] Failed to enqueue pipeline:", (err as Error).message));

	return { ok: true, added: 1 };
}

/** Bulk add — one keyword per line, defaults: intent=unknown, priority=medium, status=active. */
export async function addKeywordsBulk(
	clientId: string,
	_prev: AddKeywordState | undefined,
	formData: FormData,
): Promise<AddKeywordState> {
	const raw = (formData.get("bulk") ?? "").toString();
	const items = raw
		.split(/\r?\n/)
		.map((s) => normalizeKeyword(s))
		.filter((s) => s.length >= 2 && s.length <= 200);
	const unique = Array.from(new Set(items));
	if (unique.length === 0) {
		return { error: "אין מילות מפתח לקלוט (כל שורה צריכה להכיל בין 2 ל-200 תווים)." };
	}

	// Find existing to skip
	const existing = await db.targetKeyword.findMany({
		where: { clientId, keyword: { in: unique } },
		select: { keyword: true },
	});
	const existingSet = new Set(existing.map((e) => e.keyword));
	const toCreate = unique.filter((k) => !existingSet.has(k));

	if (toCreate.length === 0) {
		return { ok: true, added: 0, skipped: unique.length };
	}

	await db.targetKeyword.createMany({
		data: toCreate.map((keyword) => ({
			clientId,
			keyword,
			intent: "unknown",
			priority: "medium",
			status: "active",
		})),
	});

	revalidatePath(`/clients/${clientId}/keywords`);
	revalidatePath(`/clients/${clientId}`);

	// Phase 16.2 — trigger auto-pipeline in background (one job for the whole batch)
	if (toCreate.length > 0) {
		enqueueJob("keyword_refresh", clientId, { keywordIds: [] }, "keyword_add")
			.then(() => wakeWorker())
			.catch((err) => console.warn("[keywords] Failed to enqueue pipeline:", (err as Error).message));
	}

	return { ok: true, added: toCreate.length, skipped: existingSet.size };
}

export async function updateKeyword(
	_prev: AddKeywordState | undefined,
	formData: FormData,
): Promise<AddKeywordState> {
	const parsed = editSchema.safeParse({
		id: nonEmpty(formData.get("id")),
		keyword: nonEmpty(formData.get("keyword")),
		intent: nonEmpty(formData.get("intent")),
		priority: nonEmpty(formData.get("priority")) ?? "medium",
		targetUrl: nonEmpty(formData.get("targetUrl")),
		status: nonEmpty(formData.get("status")) ?? "active",
		notes: nonEmpty(formData.get("notes")),
		businessValue: nonEmpty(formData.get("businessValue")),
		keywordGoal: nonEmpty(formData.get("keywordGoal")),
		keywordGoalNote: nonEmpty(formData.get("keywordGoalNote")),
	});
	if (!parsed.success) {
		return { error: parsed.error.issues.map((i) => i.message).join("; ") };
	}
	const normalized = normalizeKeyword(parsed.data.keyword);
	const row = await db.targetKeyword.findUnique({ where: { id: parsed.data.id } });
	if (!row) return { error: "מילת מפתח לא נמצאה." };

	const goalChanged = (parsed.data.keywordGoal ?? null) !== (row.keywordGoal ?? null);
	const actor = goalChanged ? await actorEmail() : null;

	try {
		await db.targetKeyword.update({
			where: { id: parsed.data.id },
			data: {
				keyword: normalized,
				intent: parsed.data.intent ?? null,
				priority: parsed.data.priority,
				targetUrl: parsed.data.targetUrl ?? null,
				status: parsed.data.status,
				notes: parsed.data.notes ?? null,
				businessValue: parsed.data.businessValue ?? null,
				keywordGoal: parsed.data.keywordGoal ?? null,
				keywordGoalNote: parsed.data.keywordGoalNote ?? null,
				...(goalChanged
					? {
						keywordGoalSetAt: parsed.data.keywordGoal ? new Date() : null,
						keywordGoalSetBy: parsed.data.keywordGoal ? actor : null,
					}
					: {}),
			},
		});
	} catch (err) {
		const msg = (err as Error).message;
		if (msg.includes("Unique constraint") || msg.includes("unique")) {
			return { error: `מילת המפתח "${normalized}" כבר קיימת אצל הלקוח הזה.` };
		}
		return { error: `Database error: ${msg}` };
	}
	revalidatePath(`/clients/${row.clientId}/keywords`);
	revalidatePath(`/clients/${row.clientId}`);
	return { ok: true };
}

export async function deleteKeyword(keywordId: string): Promise<void> {
	const row = await db.targetKeyword.findUnique({ where: { id: keywordId } });
	if (!row) return;
	await db.targetKeyword.delete({ where: { id: keywordId } });
	revalidatePath(`/clients/${row.clientId}/keywords`);
	revalidatePath(`/clients/${row.clientId}`);
}

export async function toggleKeywordStatus(keywordId: string): Promise<void> {
	const row = await db.targetKeyword.findUnique({ where: { id: keywordId } });
	if (!row) return;
	const next = row.status === "paused" ? "active" : "paused";
	await db.targetKeyword.update({
		where: { id: keywordId },
		data: { status: next },
	});
	revalidatePath(`/clients/${row.clientId}/keywords`);
	revalidatePath(`/clients/${row.clientId}`);
}
