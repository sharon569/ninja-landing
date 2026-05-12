"use server";

import { revalidatePath } from "next/cache";
import { refreshClient, type RefreshResult } from "@/lib/refresh-server";
import { getCurrentUser } from "@/lib/supabase";

export interface RefreshClientState {
	ok?: boolean;
	result?: RefreshResult;
	error?: string;
}

export async function refreshClientAction(clientId: string): Promise<RefreshClientState> {
	let actor = "refresh_button";
	try {
		const u = await getCurrentUser();
		if (u?.email) actor = u.email;
	} catch {}

	try {
		const result = await refreshClient(clientId, actor);
		// Revalidate every page that surfaces stale data after refresh.
		revalidatePath(`/clients/${clientId}`);
		revalidatePath(`/clients/${clientId}/work-plan`);
		revalidatePath(`/clients/${clientId}/workflow`);
		revalidatePath(`/clients/${clientId}/opportunities`);
		revalidatePath(`/clients/${clientId}/briefs`);
		revalidatePath(`/clients/${clientId}/keyword-strategy`);
		revalidatePath(`/clients/${clientId}/internal-links`);
		revalidatePath(`/clients/${clientId}/issues`);
		revalidatePath(`/clients/${clientId}/impact`);
		revalidatePath(`/clients/${clientId}/search`);
		revalidatePath(`/clients/${clientId}/report`);
		revalidatePath("/automation");
		return { ok: true, result };
	} catch (err) {
		return { error: (err as Error).message };
	}
}
