"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { WORKFLOW_TABS } from "@/lib/workflow";
import type { WorkflowCounts } from "@/lib/workflow";

export function Tabs({ counts }: { counts: WorkflowCounts }) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const active = params.get("tab") ?? "all";

	function set(tab: string) {
		const next = new URLSearchParams(params);
		if (tab === "all") next.delete("tab");
		else next.set("tab", tab);
		router.push(`${pathname}?${next.toString()}`);
	}

	function badge(tab: string): number {
		switch (tab) {
			case "all":
				return counts.total;
			case "needs_decision":
				return counts.needsDecision;
			case "high_impact":
				return counts.highImpact;
			case "content":
				return counts.content;
			case "internal_links":
				return counts.internalLinks;
			case "technical":
				return counts.technical;
			case "monitoring":
				return counts.monitoring;
			case "approved":
				return counts.approved;
			default:
				return 0;
		}
	}

	return (
		<nav className="flex items-center gap-1 border-b border-ninja-line overflow-x-auto">
			{WORKFLOW_TABS.map((t) => {
				const isActive = active === t.value;
				const count = badge(t.value);
				return (
					<button
						key={t.value}
						type="button"
						onClick={() => set(t.value)}
						className={`relative px-4 py-3 text-sm whitespace-nowrap transition-colors ${
							isActive ? "text-ink font-semibold" : "text-ink-dim hover:text-ink"
						}`}
					>
						<span className="flex items-center gap-2">
							{t.label}
							{count > 0 && (
								<span
									className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums ${
										isActive
											? "bg-blade text-white"
											: "bg-ninja-raised text-ink-dim border border-ninja-line"
									}`}
								>
									{count}
								</span>
							)}
						</span>
						{isActive && (
							<span
								className="absolute -bottom-px left-0 right-0 h-0.5"
								style={{ background: "linear-gradient(90deg, #ff2a3c, #ffd166)" }}
							/>
						)}
					</button>
				);
			})}
		</nav>
	);
}
