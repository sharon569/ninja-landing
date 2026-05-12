"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { rebuildWorkPlan } from "./actions";

export function BuildPlanButton({
	clientId,
	variant = "new",
}: {
	clientId: string;
	variant?: "new" | "rebuild";
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function run() {
		if (variant === "rebuild") {
			if (!confirm("בניית תוכנית חדשה תאחסן את התוכנית הפעילה. להמשיך?")) return;
		}
		startTransition(async () => {
			await rebuildWorkPlan(clientId);
			router.refresh();
		});
	}

	const Icon = variant === "new" ? Sparkles : RefreshCw;
	const label = variant === "new" ? "בנה תוכנית עבודה" : "בנה תוכנית חדשה";

	return (
		<button
			type="button"
			onClick={run}
			disabled={pending}
			className="inline-flex items-center gap-2 rounded-md border border-blade/30 bg-blade/10 hover:bg-blade/20 text-blade px-4 py-2 text-sm font-semibold disabled:opacity-60"
		>
			{pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
			{pending ? "בונה…" : label}
		</button>
	);
}
