"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
	VERTICAL_OPTIONS,
	LANGUAGE_OPTIONS,
	AUTOMATION_LEVELS,
	APPROVAL_CATEGORIES,
} from "@/lib/profile";

export interface UpdateProfileState {
	ok?: boolean;
	error?: string;
}

const verticalValues = VERTICAL_OPTIONS.map((o) => o.value) as [string, ...string[]];
const languageValues = LANGUAGE_OPTIONS.map((o) => o.value) as [string, ...string[]];
const automationValues = AUTOMATION_LEVELS.map((o) => o.value) as [string, ...string[]];
const approvalValues: readonly string[] = APPROVAL_CATEGORIES.map((o) => o.value);

// Split a textarea (one item per line) into a clean string[].
function linesToArray(s: FormDataEntryValue | null): string[] {
	if (!s) return [];
	return String(s)
		.split(/\r?\n/)
		.map((x) => x.trim())
		.filter((x) => x.length > 0);
}

const schema = z.object({
	vertical: z.enum(verticalValues).optional().nullable(),
	language: z.enum(languageValues).optional().nullable(),
	country: z.string().max(80).optional().nullable(),
	serviceAreas: z.array(z.string().max(120)).max(50).default([]),
	seoGoals: z.string().max(4000).optional().nullable(),
	targetPages: z.array(z.string().max(400)).max(50).default([]),
	competitors: z.array(z.string().max(200)).max(50).default([]),
	brandVoice: z.string().max(500).optional().nullable(),
	notes: z.string().max(4000).optional().nullable(),
	automationLevel: z.enum(automationValues).default("balanced"),
	requireApprovalFor: z.array(z.string()).default([]),
});

export async function updateClientProfile(
	clientId: string,
	_prev: UpdateProfileState | undefined,
	formData: FormData,
): Promise<UpdateProfileState> {
	const parsed = schema.safeParse({
		vertical: (formData.get("vertical") as string) || null,
		language: (formData.get("language") as string) || null,
		country: (formData.get("country") as string) || null,
		serviceAreas: linesToArray(formData.get("serviceAreas")),
		seoGoals: (formData.get("seoGoals") as string) || null,
		targetPages: linesToArray(formData.get("targetPages")),
		competitors: linesToArray(formData.get("competitors")),
		brandVoice: (formData.get("brandVoice") as string) || null,
		notes: (formData.get("notes") as string) || null,
		automationLevel:
			(formData.get("automationLevel") as string | null) || "balanced",
		requireApprovalFor: formData
			.getAll("requireApprovalFor")
			.map(String)
			.filter((v) => approvalValues.includes(v)),
	});

	if (!parsed.success) {
		return { error: parsed.error.issues.map((i) => i.message).join("; ") };
	}

	try {
		await db.client.update({
			where: { id: clientId },
			data: parsed.data,
		});
	} catch (err) {
		return { error: `Database error: ${(err as Error).message}` };
	}

	revalidatePath(`/clients/${clientId}`);
	revalidatePath(`/clients/${clientId}/settings`);
	revalidatePath("/");
	return { ok: true };
}

// ─── Phase 12: execution settings ─────────────────────────────

export interface ExecutionSettingsState {
	ok?: boolean;
	error?: string;
}

const EXECUTION_ALLOWED_ACTIONS = [
	"yoast_title_update",
	"yoast_description_update",
	"image_alt_update",
] as const;

const executionSchema = z.object({
	executionEnabled: z.boolean().default(false),
	executionPilotMode: z.boolean().default(true),
	allowedExecutionActions: z
		.array(z.enum(EXECUTION_ALLOWED_ACTIONS))
		.default([]),
});

export async function updateExecutionSettings(
	clientId: string,
	_prev: ExecutionSettingsState | undefined,
	formData: FormData,
): Promise<ExecutionSettingsState> {
	const allowed = formData
		.getAll("allowedExecutionActions")
		.map(String)
		.filter((v): v is (typeof EXECUTION_ALLOWED_ACTIONS)[number] =>
			(EXECUTION_ALLOWED_ACTIONS as readonly string[]).includes(v),
		);

	const parsed = executionSchema.safeParse({
		executionEnabled: formData.get("executionEnabled") === "on",
		executionPilotMode: formData.get("executionPilotMode") === "on",
		allowedExecutionActions: allowed,
	});
	if (!parsed.success) {
		return { error: parsed.error.issues.map((i) => i.message).join("; ") };
	}

	// allowedExecutionActions persists independently of executionEnabled.
	// The runtime gate (canCreateExecutionAction) requires BOTH flags, so an
	// orphan allowedActions list while Execution is disabled cannot execute
	// anything. Wiping silently was a UX bug — it made the natural flow
	// "configure allowed actions first, enable later" impossible.
	try {
		await db.client.update({ where: { id: clientId }, data: parsed.data });
	} catch (err) {
		return { error: `Database error: ${(err as Error).message}` };
	}
	revalidatePath(`/clients/${clientId}/settings`);
	revalidatePath(`/clients/${clientId}/execution`);
	revalidatePath("/");
	return { ok: true };
}

// ─── Phase 10: automation toggles ─────────────────────────────

export interface AutomationToggleState {
	ok?: boolean;
	error?: string;
}

const automationSchema = z.object({
	status: z.enum(["active", "paused", "archived"]).default("active"),
	automationEnabled: z.boolean().default(true),
	autoGscSyncEnabled: z.boolean().default(true),
	autoTechAuditEnabled: z.boolean().default(true),
	autoOpportunityAnalysisEnabled: z.boolean().default(true),
	autoImpactReviewEnabled: z.boolean().default(true),
});

export async function updateClientAutomation(
	clientId: string,
	_prev: AutomationToggleState | undefined,
	formData: FormData,
): Promise<AutomationToggleState> {
	const parsed = automationSchema.safeParse({
		status: (formData.get("status") as string) || "active",
		automationEnabled: formData.get("automationEnabled") === "on",
		autoGscSyncEnabled: formData.get("autoGscSyncEnabled") === "on",
		autoTechAuditEnabled: formData.get("autoTechAuditEnabled") === "on",
		autoOpportunityAnalysisEnabled: formData.get("autoOpportunityAnalysisEnabled") === "on",
		autoImpactReviewEnabled: formData.get("autoImpactReviewEnabled") === "on",
	});
	if (!parsed.success) {
		return { error: parsed.error.issues.map((i) => i.message).join("; ") };
	}
	try {
		await db.client.update({
			where: { id: clientId },
			data: parsed.data,
		});
	} catch (err) {
		return { error: `Database error: ${(err as Error).message}` };
	}
	revalidatePath(`/clients/${clientId}/settings`);
	revalidatePath("/");
	revalidatePath("/automation");
	return { ok: true };
}
