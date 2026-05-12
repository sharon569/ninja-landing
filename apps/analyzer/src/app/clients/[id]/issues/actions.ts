"use server";

import { revalidatePath } from "next/cache";
import { runTechnicalAudit, type TechAuditResult } from "@/lib/tech-audit-server";

export interface TechAuditState {
	ok?: boolean;
	error?: string;
	result?: TechAuditResult;
}

export async function runTechnicalAuditAction(clientId: string): Promise<TechAuditState> {
	try {
		const result = await runTechnicalAudit(clientId);
		revalidatePath(`/clients/${clientId}/issues`);
		revalidatePath(`/clients/${clientId}/opportunities`);
		revalidatePath(`/clients/${clientId}/report`);
		revalidatePath(`/clients/${clientId}`);
		return { ok: true, result };
	} catch (err) {
		return { error: (err as Error).message };
	}
}
