"use client";

import { useTransition, useState } from "react";
import { ShieldAlert, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { runTechnicalAuditAction, type TechAuditState } from "./actions";

export function TechAuditButton({ clientId }: { clientId: string }) {
	const [pending, startTransition] = useTransition();
	const [state, setState] = useState<TechAuditState | null>(null);

	return (
		<div className="flex items-center gap-3 flex-wrap">
			<button
				type="button"
				disabled={pending}
				onClick={() =>
					startTransition(async () => {
						const r = await runTechnicalAuditAction(clientId);
						setState(r);
					})
				}
				className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-[0_4px_14px_rgba(255,42,60,0.35)] hover:shadow-[0_6px_18px_rgba(255,42,60,0.45)] disabled:opacity-60 disabled:cursor-not-allowed transition-shadow"
				style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
			>
				{pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
				{pending ? "מנתח טכני…" : "ניתוח טכני מתקדם"}
			</button>

			{state?.ok && state.result && (
				<span className="inline-flex items-center gap-1.5 text-xs text-go">
					<CheckCircle2 className="w-3.5 h-3.5" />
					{state.result.findingsCreated} ממצאים טכניים · {state.result.sitemapEntries} URLs ב-sitemap
					{state.result.opportunitiesCreated + state.result.opportunitiesUpdated > 0 && (
						<>
							{" · "}
							{state.result.opportunitiesCreated + state.result.opportunitiesUpdated} הזדמנויות
						</>
					)}
				</span>
			)}
			{state?.error && (
				<span className="inline-flex items-center gap-1.5 text-xs text-blade">
					<AlertCircle className="w-3.5 h-3.5" />
					{state.error}
				</span>
			)}
		</div>
	);
}
