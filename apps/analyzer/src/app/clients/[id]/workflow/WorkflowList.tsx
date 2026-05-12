"use client";

import { useState } from "react";
import type { WorkflowItem } from "@/lib/workflow";
import { WorkflowRow } from "./WorkflowRow";
import { BulkBar } from "./BulkBar";

export function WorkflowList({
	clientId,
	items,
}: {
	clientId: string;
	items: WorkflowItem[];
}) {
	const [selected, setSelected] = useState<Set<string>>(new Set());

	function toggle(id: string, on: boolean) {
		setSelected((cur) => {
			const next = new Set(cur);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	function selectAll() {
		setSelected(new Set(items.map((i) => i.id)));
	}

	function clearAll() {
		setSelected(new Set());
	}

	return (
		<div className="space-y-3">
			{items.length > 0 && (
				<div className="flex items-center justify-between text-xs text-ink-dim">
					<span>
						{items.length} פריטים בתצוגה
						{selected.size > 0 && ` · ${selected.size} נבחרו`}
					</span>
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={selectAll}
							className="text-xs text-gold hover:text-blade"
						>
							בחר הכל
						</button>
						{selected.size > 0 && (
							<button
								type="button"
								onClick={clearAll}
								className="text-xs text-ink-mute hover:text-ink"
							>
								ניקוי
							</button>
						)}
					</div>
				</div>
			)}

			{items.map((it) => (
				<WorkflowRow
					key={it.id}
					item={it}
					selected={selected.has(it.id)}
					onSelectChange={(on) => toggle(it.id, on)}
				/>
			))}

			<BulkBar
				clientId={clientId}
				selectedIds={Array.from(selected)}
				onClear={clearAll}
			/>
		</div>
	);
}
