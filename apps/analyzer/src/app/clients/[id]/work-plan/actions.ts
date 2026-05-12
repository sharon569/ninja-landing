"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
	buildSeoWorkPlan,
	approveWorkPlanGroup,
	cancelWorkPlan,
} from "@/lib/work-plan-server";
import type { ItemGroup, PlanType } from "@/lib/work-plan";
import { getCurrentUser } from "@/lib/supabase";

async function actorEmail(): Promise<string> {
	try {
		const u = await getCurrentUser();
		return u?.email ?? "system";
	} catch {
		return "system";
	}
}

function reval(clientId: string) {
	revalidatePath(`/clients/${clientId}/work-plan`);
	revalidatePath(`/clients/${clientId}/workflow`);
	revalidatePath(`/clients/${clientId}/briefs`);
	revalidatePath(`/clients/${clientId}/execution`);
	revalidatePath(`/clients/${clientId}/opportunities`);
}

export interface BuildPlanState {
	ok?: boolean;
	planId?: string;
	error?: string;
}

export async function rebuildWorkPlan(
	clientId: string,
	planType: PlanType = "monthly_seo_work",
): Promise<BuildPlanState> {
	try {
		const r = await buildSeoWorkPlan(clientId, planType, await actorEmail());
		reval(clientId);
		return { ok: true, planId: r.planId };
	} catch (err) {
		return { error: (err as Error).message };
	}
}

export interface ApproveGroupState {
	ok?: boolean;
	prepared?: number;
	skipped?: number;
	failed?: number;
	notes?: string[];
	error?: string;
}

export async function approveGroup(
	planId: string,
	group: ItemGroup,
): Promise<ApproveGroupState> {
	try {
		const r = await approveWorkPlanGroup(planId, group, await actorEmail());
		const plan = await db.seoWorkPlan.findUnique({
			where: { id: planId },
			select: { clientId: true },
		});
		if (plan) reval(plan.clientId);
		return {
			ok: true,
			prepared: r.prepared,
			skipped: r.skipped,
			failed: r.failed,
			notes: r.notes,
		};
	} catch (err) {
		return { error: (err as Error).message };
	}
}

export async function cancelPlan(planId: string): Promise<{ ok: boolean; error?: string }> {
	try {
		const plan = await db.seoWorkPlan.findUnique({
			where: { id: planId },
			select: { clientId: true },
		});
		await cancelWorkPlan(planId, await actorEmail());
		if (plan) reval(plan.clientId);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}
