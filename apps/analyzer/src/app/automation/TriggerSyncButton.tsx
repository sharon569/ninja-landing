"use client";

import { useActionState } from "react";
import { Play, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { triggerAgencySync, type TriggerState } from "./actions";

export function TriggerSyncButton() {
	const [state, action, pending] = useActionState<TriggerState | undefined, FormData>(
		triggerAgencySync,
		undefined,
	);

	return (
		<form action={action} className="flex items-center gap-2">
			<button
				type="submit"
				disabled={pending}
				className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(255,42,60,0.35)] hover:shadow-[0_6px_18px_rgba(255,42,60,0.45)] disabled:opacity-60 disabled:cursor-not-allowed transition-shadow"
				style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
			>
				{pending ? (
					<>
						<Loader2 className="w-4 h-4 animate-spin" />
						מריץ סנכרון…
					</>
				) : (
					<>
						<Play className="w-4 h-4" />
						הרץ סנכרון עכשיו
					</>
				)}
			</button>
			{state?.ok && !pending && (
				<span className="inline-flex items-center gap-1.5 text-xs text-go">
					<CheckCircle2 className="w-3.5 h-3.5" /> הסתיים
				</span>
			)}
			{state?.error && !pending && (
				<span className="inline-flex items-center gap-1.5 text-xs text-blade" title={state.error}>
					<XCircle className="w-3.5 h-3.5" /> נכשל
				</span>
			)}
		</form>
	);
}
