"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { approveGroup } from "./actions";
import type { ItemGroup } from "@/lib/work-plan";

export function ApproveGroupButton({
	planId,
	group,
	label,
	disabled,
}: {
	planId: string;
	group: ItemGroup;
	label: string;
	disabled?: boolean;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

	function go() {
		setResult(null);
		startTransition(async () => {
			const r = await approveGroup(planId, group);
			if (r.error) {
				setResult({ ok: false, msg: r.error });
				return;
			}
			const parts: string[] = [];
			if (r.prepared) parts.push(`${r.prepared} הוכנו`);
			if (r.skipped) parts.push(`${r.skipped} דולגו`);
			if (r.failed) parts.push(`${r.failed} נכשלו`);
			setResult({ ok: true, msg: parts.join(" · ") || "אין פעולות להכנה" });
			router.refresh();
		});
	}

	return (
		<div className="flex items-center gap-2 flex-wrap">
			<button
				type="button"
				onClick={go}
				disabled={pending || disabled}
				className="inline-flex items-center gap-1.5 rounded-md border border-go/30 bg-go/10 hover:bg-go/20 text-go px-3 py-1.5 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
				{label}
			</button>
			{result && (
				<span
					className={`inline-flex items-center gap-1.5 text-[11px] ${
						result.ok ? "text-go" : "text-blade"
					}`}
				>
					{result.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
					{result.msg}
				</span>
			)}
		</div>
	);
}
