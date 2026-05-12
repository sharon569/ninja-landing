"use client";

import { useEffect, useState, useTransition } from "react";
import { X, History, Loader2 } from "lucide-react";
import { getActionLog } from "./actions";

interface LogEntry {
	id: string;
	actionType: string;
	fromStatus: string | null;
	toStatus: string | null;
	note: string | null;
	createdBy: string | null;
	createdAt: string;
}

export function ActionLogDrawer({
	opportunityId,
	onClose,
}: {
	opportunityId: string;
	onClose: () => void;
}) {
	const [entries, setEntries] = useState<LogEntry[] | null>(null);
	const [pending, startTransition] = useTransition();
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		startTransition(async () => {
			try {
				const rows = await getActionLog(opportunityId);
				setEntries(rows);
			} catch (e) {
				setErr((e as Error).message);
			}
		});
	}, [opportunityId]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-stretch justify-end bg-ninja-black/70 backdrop-blur-sm"
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className="w-full max-w-md h-full overflow-y-auto bg-ninja-panel border-l border-ninja-line-strong shadow-[-20px_0_60px_rgba(0,0,0,0.5)]">
				<div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-ninja-line bg-ninja-panel">
					<div className="flex items-center gap-2">
						<History className="w-4 h-4 text-gold" />
						<h3 className="font-display text-lg text-ink">היסטוריית פעולות</h3>
					</div>
					<button onClick={onClose} className="text-ink-dim hover:text-ink">
						<X className="w-4 h-4" />
					</button>
				</div>

				<div className="p-5">
					{pending && (
						<div className="flex items-center gap-2 text-sm text-ink-dim">
							<Loader2 className="w-4 h-4 animate-spin" />
							טוען…
						</div>
					)}
					{err && <div className="text-sm text-blade">{err}</div>}
					{entries && entries.length === 0 && (
						<div className="text-sm text-ink-dim">
							אין עדיין פעולות לרישום עבור הפריט הזה.
						</div>
					)}
					{entries && entries.length > 0 && (
						<ol className="space-y-3">
							{entries.map((e) => (
								<li
									key={e.id}
									className="rounded-md border border-ninja-line bg-ninja-raised/40 px-4 py-3"
								>
									<div className="flex items-center justify-between gap-2 text-xs mb-1">
										<span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-gold border border-gold/30 bg-gold/10 rounded-full px-2 py-0.5">
											{e.actionType}
										</span>
										<span className="text-ink-mute">
											{new Date(e.createdAt).toLocaleString("he-IL")}
										</span>
									</div>
									{(e.fromStatus || e.toStatus) && (
										<div className="text-xs text-ink-dim mb-1">
											{e.fromStatus ?? "—"} → <span className="text-ink">{e.toStatus ?? "—"}</span>
										</div>
									)}
									{e.note && <div className="text-sm text-ink leading-relaxed">{e.note}</div>}
									{e.createdBy && (
										<div className="text-[11px] text-ink-mute mt-1.5">
											by {e.createdBy}
										</div>
									)}
								</li>
							))}
						</ol>
					)}
				</div>
			</div>
		</div>
	);
}
