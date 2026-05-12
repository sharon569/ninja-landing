"use client";

import { useTransition, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { buildKeywordStrategy } from "./actions";

export function BuildOneButton({
	targetKeywordId,
	keyword,
	priority,
}: {
	targetKeywordId: string;
	keyword: string;
	priority: string;
}) {
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function build() {
		setError(null);
		startTransition(async () => {
			const r = await buildKeywordStrategy(targetKeywordId);
			if (!r.ok && r.error) setError(r.error);
		});
	}

	const tone =
		priority === "critical" || priority === "high"
			? "text-blade border-blade/30 hover:bg-blade/10"
			: "text-ink-dim border-ninja-line hover:bg-ninja-raised";

	return (
		<div className="inline-block">
			<button
				type="button"
				onClick={build}
				disabled={pending}
				className={`inline-flex items-center gap-1.5 text-xs rounded-md border px-2.5 py-1 disabled:opacity-60 ${tone}`}
				title={`בנה אסטרטגיה ל-"${keyword}"`}
			>
				{pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
				<span className="truncate max-w-[160px]">{keyword}</span>
			</button>
			{error && <span className="text-[10px] text-blade ms-1">{error}</span>}
		</div>
	);
}
