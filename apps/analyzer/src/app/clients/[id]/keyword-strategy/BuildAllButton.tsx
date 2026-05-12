"use client";

import { useTransition, useState } from "react";
import { Loader2, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { buildAllStrategiesForClient } from "./actions";

export function BuildAllButton({
	clientId,
	keywordsCount,
}: {
	clientId: string;
	keywordsCount: number;
}) {
	const [pending, startTransition] = useTransition();
	const [result, setResult] = useState<{ built?: number; failed?: number; error?: string } | null>(null);

	function build() {
		setResult(null);
		startTransition(async () => {
			const r = await buildAllStrategiesForClient(clientId);
			setResult(r);
		});
	}

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={build}
				disabled={pending}
				className="inline-flex items-center gap-2 rounded-md border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
			>
				{pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
				בנה / רענן הכל ({keywordsCount})
			</button>
			{result?.error && (
				<span className="text-xs text-blade inline-flex items-center gap-1">
					<XCircle className="w-3 h-3" /> {result.error}
				</span>
			)}
			{result?.built !== undefined && (
				<span className="text-xs text-go inline-flex items-center gap-1">
					<CheckCircle2 className="w-3 h-3" /> {result.built} נבנו{result.failed ? ` · ${result.failed} נכשלו` : ""}
				</span>
			)}
		</div>
	);
}
