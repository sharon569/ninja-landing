"use client";

import { useTransition } from "react";
import { Link2, Loader2 } from "lucide-react";
import { runInternalLinkAnalysis } from "./actions";

export function AnalyzeButton({ clientId }: { clientId: string }) {
	const [pending, startTransition] = useTransition();
	return (
		<button
			type="button"
			disabled={pending}
			onClick={() =>
				startTransition(async () => {
					await runInternalLinkAnalysis(clientId);
				})
			}
			className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(255,42,60,0.35)] hover:shadow-[0_8px_22px_rgba(255,42,60,0.45)] disabled:opacity-60 disabled:cursor-not-allowed transition-shadow"
			style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
		>
			{pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
			{pending ? "מנתח…" : "נתח קישורים פנימיים"}
		</button>
	);
}
