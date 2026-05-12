"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase";
import {
	createExecutionActionFromOpportunity,
	runDryRun,
	executeAction,
	cancelExecutionAction,
	rollbackAction,
	type CreatePayload,
} from "@/lib/execution-server";
import type { ExecutionActionType } from "@/lib/execution";

export interface ActionResult {
	ok?: boolean;
	error?: string;
	actionId?: string;
}

async function actor(): Promise<string> {
	const u = await getAdminUser();
	return u?.email ?? "system";
}

export async function prepareExecutionForOpportunity(
	opportunityId: string,
	actionType: ExecutionActionType,
	payload: CreatePayload,
): Promise<ActionResult> {
	try {
		const a = await actor();
		const created = await createExecutionActionFromOpportunity({
			opportunityId,
			actionType,
			payload,
			actor: a,
		});
		revalidatePath(`/clients/${created.clientId}/execution`);
		revalidatePath(`/clients/${created.clientId}/opportunities/${opportunityId}`);
		revalidatePath(`/clients/${created.clientId}/workflow`);
		return { ok: true, actionId: created.id };
	} catch (err) {
		return { error: (err as Error).message };
	}
}

export async function runDryRunAction(
	clientId: string,
	actionId: string,
): Promise<ActionResult> {
	try {
		const a = await actor();
		const result = await runDryRun(actionId, a);
		revalidatePath(`/clients/${clientId}/execution`);
		revalidatePath(`/clients/${clientId}/workflow`);
		if (!result.ok) return { error: result.error ?? "Dry Run failed" };
		return { ok: true, actionId };
	} catch (err) {
		return { error: (err as Error).message };
	}
}

export async function executeActionNow(
	clientId: string,
	actionId: string,
): Promise<ActionResult> {
	try {
		const a = await actor();
		const result = await executeAction(actionId, a);
		revalidatePath(`/clients/${clientId}/execution`);
		revalidatePath(`/clients/${clientId}/workflow`);
		revalidatePath(`/clients/${clientId}/opportunities`);
		revalidatePath(`/clients/${clientId}/impact`);
		revalidatePath(`/`);
		if (!result.ok) return { error: result.error ?? "Execute failed" };
		return { ok: true, actionId };
	} catch (err) {
		return { error: (err as Error).message };
	}
}

export async function cancelAction(
	clientId: string,
	actionId: string,
): Promise<ActionResult> {
	try {
		const a = await actor();
		await cancelExecutionAction(actionId, a);
		revalidatePath(`/clients/${clientId}/execution`);
		return { ok: true, actionId };
	} catch (err) {
		return { error: (err as Error).message };
	}
}

export async function rollbackActionNow(
	clientId: string,
	actionId: string,
): Promise<ActionResult> {
	try {
		const a = await actor();
		const r = await rollbackAction(actionId, a);
		revalidatePath(`/clients/${clientId}/execution`);
		revalidatePath(`/clients/${clientId}/opportunities`);
		revalidatePath(`/clients/${clientId}/impact`);
		if (!r.ok) return { error: r.error ?? "Rollback failed" };
		return { ok: true, actionId };
	} catch (err) {
		return { error: (err as Error).message };
	}
}
