"use client";

import { useState, useTransition } from "react";
import { Check, X, Eye, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { bulkWorkflowAction } from "./actions";

export function BulkBar({
	clientId,
	selectedIds,
	onClear,
}: {
	clientId: string;
	selectedIds: string[];
	onClear: () => void;
}) {
	const [pending, startTransition] = useTransition();
	const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);

	if (selectedIds.length === 0 && !feedback) return null;

	function run(action: string, requireConfirm = false) {
		if (requireConfirm && confirming !== action) {
			setConfirming(action);
			return;
		}
		setConfirming(null);
		startTransition(async () => {
			const r = await bulkWorkflowAction(clientId, action, selectedIds);
			if (r.error) setFeedback({ ok: false, msg: r.error });
			else {
				setFeedback({
					ok: true,
					msg: `${r.processed} עובדו · ${r.skipped ?? 0} דולגו`,
				});
				onClear();
			}
			setTimeout(() => setFeedback(null), 4000);
		});
	}

	return (
		<div className="sticky bottom-4 z-30 mx-auto max-w-3xl">
			<div className="rounded-xl border border-ninja-line-strong bg-ninja-panel/95 backdrop-blur-sm shadow-[0_20px_60px_rgba(0,0,0,0.5)] px-5 py-3">
				{confirming === "approve" ? (
					<div className="space-y-2">
						<div className="flex items-center gap-2 text-sm text-ink">
							<AlertCircle className="w-4 h-4 text-gold" />
							אישור קבוצתי לא יבצע שינוי באתר. הפריטים יסומנו כמאושרים לעבודה ידנית.
						</div>
						<div className="flex items-center gap-2 justify-end">
							<button
								type="button"
								onClick={() => setConfirming(null)}
								className="text-xs text-ink-dim hover:text-ink"
							>
								ביטול
							</button>
							<button
								type="button"
								onClick={() => run("approve")}
								disabled={pending}
								className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-bold text-white"
								style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
							>
								<Check className="w-3 h-3" />
								כן, אשר את {selectedIds.length} הפריטים
							</button>
						</div>
					</div>
				) : (
					<div className="flex flex-wrap items-center gap-3">
						<span className="text-sm text-ink">
							<span className="font-semibold">{selectedIds.length}</span> פריטים נבחרו
						</span>
						<div className="flex-1" />
						<BulkBtn
							icon={<Check className="w-3 h-3" />}
							tone="good"
							onClick={() => run("approve", true)}
							disabled={pending || selectedIds.length === 0}
						>
							אישור קבוצתי
						</BulkBtn>
						<BulkBtn
							icon={<Eye className="w-3 h-3" />}
							tone="warn"
							onClick={() => run("needs_human_review")}
							disabled={pending || selectedIds.length === 0}
						>
							לסקירה
						</BulkBtn>
						<BulkBtn
							icon={<X className="w-3 h-3" />}
							tone="bad"
							onClick={() => run("dismiss")}
							disabled={pending || selectedIds.length === 0}
						>
							הסר
						</BulkBtn>
						<button
							type="button"
							onClick={onClear}
							className="text-xs text-ink-dim hover:text-ink underline"
						>
							ניקוי בחירה
						</button>
						{pending && <Loader2 className="w-4 h-4 animate-spin text-gold" />}
					</div>
				)}

				{feedback && (
					<div
						className={`mt-2 flex items-center gap-1.5 text-xs ${
							feedback.ok ? "text-go" : "text-blade"
						}`}
					>
						{feedback.ok ? (
							<CheckCircle2 className="w-3.5 h-3.5" />
						) : (
							<AlertCircle className="w-3.5 h-3.5" />
						)}
						{feedback.msg}
					</div>
				)}
			</div>
		</div>
	);
}

function BulkBtn({
	icon,
	tone,
	children,
	onClick,
	disabled,
}: {
	icon: React.ReactNode;
	tone: "good" | "bad" | "warn";
	children: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
}) {
	const cls =
		tone === "good"
			? "text-go border-go/30 hover:bg-go/10"
			: tone === "bad"
				? "text-blade border-blade/30 hover:bg-blade/10"
				: "text-gold border-gold/30 hover:bg-gold/10";
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md border px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
		>
			{icon}
			{children}
		</button>
	);
}
