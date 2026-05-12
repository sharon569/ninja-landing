"use server";

import { revalidatePath } from "next/cache";
import { runAgencyAutoSync } from "@/lib/automation-server";
import { getAdminUser } from "@/lib/supabase";

export interface TriggerState {
	ok?: boolean;
	error?: string;
	parentRunId?: string;
}

export async function triggerAgencySync(
	_prev: TriggerState | undefined,
	_formData: FormData,
): Promise<TriggerState> {
	const user = await getAdminUser();
	if (!user) return { error: "Unauthorized" };

	try {
		const result = await runAgencyAutoSync(user.email ?? "manual");
		revalidatePath("/");
		revalidatePath("/automation");
		return { ok: true, parentRunId: result.parentRunId };
	} catch (err) {
		return { error: (err as Error).message };
	}
}
