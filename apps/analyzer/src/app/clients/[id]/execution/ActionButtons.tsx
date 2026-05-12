"use client";

import { useState, useTransition } from "react";
import {
	Play,
	AlertTriangle,
	Loader2,
	CheckCircle2,
	XCircle,
	RotateCcw,
	Ban,
} from "lucide-react";
import {
	runDryRunAction,
	executeActionNow,
	cancelAction,
	rollbackActionNow,
} from "./actions";
import {
	EXECUTE_CONFIRMATION_TEXT,
	EXECUTE_CONFIRMATION_BUTTON,
	ROLLBACK_CONFIRMATION_TEXT,
	ROLLBACK_BUTTON,
	isExecutable,
	isRollbackSupported,
} from "@/lib/execution";

interface Props {
	clientId: string;
	actionId: string;
	status: string;
	actionType: string;
}

export function ActionButtons({ clientId, actionId, status, actionType }: Props) {
	const [pending, startTransition] = useTransition();
	const [showExecuteModal, setShowExecuteModal] = useState(false);
	const [showRollbackModal, setShowRollbackModal] = useState(false);
	const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

	function runDryRun() {
		setMessage(null);
		startTransition(async () => {
			const r = await runDryRunAction(clientId, actionId);
			setMessage(
				r.ok ? { type: "ok", text: "Dry Run הסתיים" } : { type: "err", text: r.error ?? "Dry Run נכשל" },
			);
		});
	}

	function execute() {
		setMessage(null);
		setShowExecuteModal(false);
		startTransition(async () => {
			const r = await executeActionNow(clientId, actionId);
			setMessage(
				r.ok ? { type: "ok", text: "הפעולה בוצעה באתר" } : { type: "err", text: r.error ?? "Execute נכשל" },
			);
		});
	}

	function cancel() {
		startTransition(async () => {
			const r = await cancelAction(clientId, actionId);
			setMessage(
				r.ok ? { type: "ok", text: "בוטל" } : { type: "err", text: r.error ?? "ביטול נכשל" },
			);
		});
	}

	function rollback() {
		setMessage(null);
		setShowRollbackModal(false);
		startTransition(async () => {
			const r = await rollbackActionNow(clientId, actionId);
			setMessage(
				r.ok ? { type: "ok", text: "Rollback בוצע" } : { type: "err", text: r.error ?? "Rollback נכשל" },
			);
		});
	}

	const canDryRun =
		status === "draft" ||
		status === "dry_run_failed" ||
		status === "preview_only";
	const canExecute =
		(status === "dry_run_ready" || status === "awaiting_execution_approval") &&
		isExecutable(actionType);
	const canCancel = !["executed", "rolled_back", "cancelled", "executing"].includes(status);
	const canRollback = status === "rollback_available" && isRollbackSupported(actionType);

	return (
		<div className="flex flex-wrap items-center gap-2">
			{canDryRun && (
				<button
					type="button"
					onClick={runDryRun}
					disabled={pending}
					className="inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
				>
					{pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
					{status === "preview_only" ? "רענן Preview" : "הרץ Dry Run"}
				</button>
			)}
			{canExecute && (
				<button
					type="button"
					onClick={() => setShowExecuteModal(true)}
					disabled={pending}
					className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
					style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
				>
					{pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
					Execute
				</button>
			)}
			{canRollback && (
				<button
					type="button"
					onClick={() => setShowRollbackModal(true)}
					disabled={pending}
					className="inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
				>
					<RotateCcw className="w-3.5 h-3.5" /> Rollback
				</button>
			)}
			{canCancel && (
				<button
					type="button"
					onClick={cancel}
					disabled={pending}
					className="inline-flex items-center gap-1.5 rounded-md border border-ninja-line bg-ninja-panel/60 hover:bg-ninja-raised text-ink-mute px-3 py-1.5 text-xs disabled:opacity-60"
				>
					<Ban className="w-3.5 h-3.5" /> בטל
				</button>
			)}

			{message && (
				<span
					className={`inline-flex items-center gap-1.5 text-xs ${
						message.type === "ok" ? "text-go" : "text-blade"
					}`}
				>
					{message.type === "ok" ? (
						<CheckCircle2 className="w-3.5 h-3.5" />
					) : (
						<XCircle className="w-3.5 h-3.5" />
					)}
					{message.text}
				</span>
			)}

			{showExecuteModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/80 backdrop-blur-sm p-4">
					<div className="max-w-lg w-full rounded-xl border border-blade/40 bg-ninja-panel p-6 shadow-2xl">
						<div className="flex items-start gap-3 mb-4">
							<AlertTriangle className="w-6 h-6 text-blade shrink-0 mt-0.5" />
							<div>
								<h3 className="font-display text-xl text-ink mb-2">אישור שינוי חי</h3>
								<p className="text-sm text-ink-dim leading-relaxed">
									{EXECUTE_CONFIRMATION_TEXT}
								</p>
							</div>
						</div>
						<div className="flex items-center justify-end gap-2 pt-4 border-t border-ninja-line">
							<button
								type="button"
								onClick={() => setShowExecuteModal(false)}
								className="rounded-md border border-ninja-line bg-ninja-panel/60 hover:bg-ninja-raised text-ink-dim px-4 py-2 text-sm"
							>
								ביטול
							</button>
							<button
								type="button"
								onClick={execute}
								className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold text-white"
								style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
							>
								<AlertTriangle className="w-4 h-4" />
								{EXECUTE_CONFIRMATION_BUTTON}
							</button>
						</div>
					</div>
				</div>
			)}

			{showRollbackModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/80 backdrop-blur-sm p-4">
					<div className="max-w-lg w-full rounded-xl border border-gold/40 bg-ninja-panel p-6 shadow-2xl">
						<div className="flex items-start gap-3 mb-4">
							<RotateCcw className="w-6 h-6 text-gold shrink-0 mt-0.5" />
							<div>
								<h3 className="font-display text-xl text-ink mb-2">אישור Rollback</h3>
								<p className="text-sm text-ink-dim leading-relaxed">{ROLLBACK_CONFIRMATION_TEXT}</p>
								<p className="text-xs text-gold mt-2">
									הערה: אם הערך באתר שונה ממה שהמערכת ביצעה, Rollback אוטומטי לא יבוצע — נדרש טיפול ידני.
								</p>
							</div>
						</div>
						<div className="flex items-center justify-end gap-2 pt-4 border-t border-ninja-line">
							<button
								type="button"
								onClick={() => setShowRollbackModal(false)}
								className="rounded-md border border-ninja-line bg-ninja-panel/60 hover:bg-ninja-raised text-ink-dim px-4 py-2 text-sm"
							>
								ביטול
							</button>
							<button
								type="button"
								onClick={rollback}
								className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-gold/15 hover:bg-gold/25 text-gold px-4 py-2 text-sm font-bold"
							>
								<RotateCcw className="w-4 h-4" />
								{ROLLBACK_BUTTON}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
