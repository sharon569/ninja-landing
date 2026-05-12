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
