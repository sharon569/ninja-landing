"use client";

// Phase 15D — Brief → Execution modal.
//
// Lets the operator review every gate, pick Title / Meta / Both, and create
// ExecutionAction(s). Each chosen actionType creates a SEPARATE action; we
// never combine title + description into one row.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Zap, ExternalLink, X } from "lucide-react";
import { getBriefExecutionReadiness, prepareBriefExecution } from "./actions";
import type { BriefExecutionReadiness } from "@/lib/brief-execution-server";
import { ScopeBadge } from "@/components/ScopeBadge";

type Selection = "title" | "meta" | "both";

export function PrepareBriefExecutionModal({
	briefId,
	clientId,
	onClose,
}: {
	briefId: string;
	clientId: string;
	onClose: () => void;
}) {
	const router = useRouter();
	const [readiness, setReadiness] = useState<BriefExecutionReadiness | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [createdIds, setCreatedIds] = useState<string[]>([]);
	const [selection, setSelection] = useState<Selection>("title");

	useEffect(() => {
		(async () => {
			const r = await getBriefExecutionReadiness(briefId);
			if (r.ok && r.readiness) setReadiness(r.readiness);
			else setLoadError(r.error ?? "Failed to load readiness");
			setLoading(false);
		})();
	}, [briefId]);

	useEffect(() => {
		if (!readiness) return;
		// Auto-pick the first viable column. If both are blocked, keep "title"
		// so the disabled state is visible.
		if (readiness.canPrepareTitle) setSelection("title");
		else if (readiness.canPrepareMeta) setSelection("meta");
	}, [readiness]);

	async function submit() {
		if (!readiness) return;
		setError(null);
		startTransition(async () => {
			const targets: ("yoast_title_update" | "yoast_description_update")[] = [];
			if (selection === "title" || selection === "both") targets.push("yoast_title_update");
			if (selection === "meta" || selection === "both") targets.push("yoast_description_update");

			const ids: string[] = [];
			for (const t of targets) {
				const r = await prepareBriefExecution(briefId, t);
				if (!r.ok || !r.actionId) {
					setError(r.error ?? "יצירה נכשלה");
					setCreatedIds(ids);
					return;
				}
				ids.push(r.actionId);
			}
			setCreatedIds(ids);
			router.refresh();
		});
	}

	const canBoth = readiness?.canPrepareTitle && readiness?.canPrepareMeta;
	const allDone = createdIds.length > 0;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/80 backdrop-blur-sm p-4">
			<div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-xl border border-blade/40 bg-ninja-panel p-6 shadow-2xl">
				<div className="flex items-start justify-between mb-4">
					<h3 className="font-display text-xl text-ink flex items-center gap-2">
						<Zap className="w-5 h-5 text-blade" />
						הכנת Execution מתוך Brief
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="text-ink-mute hover:text-ink"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<p className="text-xs text-ink-dim mb-4 leading-relaxed">
					שלב זה רק מכין ExecutionAction. השינוי באתר עצמו דורש Dry Run + לחיצה מפורשת על Execute בדף ה-Execution.
				</p>

				{loading && (
					<div className="text-sm text-ink-mute flex items-center gap-2">
						<Loader2 className="w-4 h-4 animate-spin" /> טוען Readiness…
					</div>
				)}

				{loadError && <div className="text-sm text-blade">{loadError}</div>}

				{readiness && (
					<>
						{readiness.pageScope && (
							<div className="mb-4">
								<ScopeBadge classification={readiness.pageScope} variant="full" />
							</div>
						)}

						{/* Target / source summary */}
						<div className="grid gap-2 text-xs mb-4">
							{readiness.targetUrl && (
								<Row label="Target URL">
									<a
										href={readiness.targetUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="text-gold hover:text-blade font-mono break-all inline-flex items-center gap-1"
										dir="ltr"
									>
										{readiness.targetUrl}
										<ExternalLink className="w-3 h-3" />
									</a>
								</Row>
							)}
							<Row label="briefType">{readiness.briefType}</Row>
							<Row label="briefStatus">{readiness.briefStatus}</Row>
						</div>

						{/* Gate checklist */}
						<section className="space-y-1.5 mb-4">
							<div className="text-[10px] tracking-wider uppercase text-ink-mute mb-1">
								Execution Readiness
							</div>
							<Gate ok={readiness.briefStatus === "approved"} label="Brief מאושר" />
							<Gate ok={readiness.briefType === "title_meta_update"} label="briefType = title_meta_update" />
							<Gate ok={readiness.hasTitle || readiness.hasMeta} label="יש Title או Meta מומלצים" />
							<Gate ok={!!readiness.targetUrl} label="יש Target URL" />
							<Gate ok={!readiness.pageScope || readiness.pageScope.isSeoEligible} label="העמוד SEO-eligible" />
							<Gate ok={readiness.clientExecutionEnabled} label="Execution Enabled ללקוח" />
							<Gate ok={readiness.pluginReadinessOk} label="פלאגין מוכן (write API + version)" />
							<Gate ok={readiness.decisionAllows} label="Decision Guard מאשר" detail={readiness.decisionReason ?? undefined} />
							{readiness.existingExecutions.length > 0 && (
								<div className="text-[11px] text-gold pt-1">
									{readiness.existingExecutions.length} פעולות Execution קודמות קיימות על Brief זה
								</div>
							)}
						</section>

						{readiness.blockers.length > 0 && !canBoth && !readiness.canPrepareTitle && !readiness.canPrepareMeta && (
							<div className="rounded-lg border border-blade/30 bg-blade/10 px-3 py-2 mb-4">
								<div className="text-xs font-bold text-blade mb-1 flex items-center gap-1.5">
									<AlertTriangle className="w-3.5 h-3.5" />
									לא ניתן להכין Execution
								</div>
								<ul className="text-xs text-ink-dim space-y-0.5">
									{readiness.blockers.map((b, i) => (
										<li key={i}>· {b}</li>
									))}
								</ul>
							</div>
						)}

						{/* Selection */}
						{(readiness.canPrepareTitle || readiness.canPrepareMeta) && !allDone && (
							<section className="mb-4 space-y-2">
								<div className="text-[10px] tracking-wider uppercase text-ink-mute">בחר Actions</div>
								<SelectionRow
									checked={selection === "title"}
									onChange={() => setSelection("title")}
									disabled={!readiness.canPrepareTitle}
									label="Title only"
									preview={readiness.hasTitle ? <Preview before="—" after={undefined} /> : null}
								/>
								<SelectionRow
									checked={selection === "meta"}
									onChange={() => setSelection("meta")}
									disabled={!readiness.canPrepareMeta}
									label="Meta only"
									preview={null}
								/>
								<SelectionRow
									checked={selection === "both"}
									onChange={() => setSelection("both")}
									disabled={!canBoth}
									label="Title + Meta — שני ExecutionActions נפרדים"
									preview={null}
								/>
							</section>
						)}

						{allDone && (
							<div className="rounded-lg border border-go/30 bg-go/10 px-3 py-3 text-sm mb-4 flex items-start gap-2">
								<CheckCircle2 className="w-4 h-4 text-go shrink-0 mt-0.5" />
								<div className="text-ink leading-relaxed">
									נוצרו {createdIds.length} פעולות Execution. עבור לדף Execution כדי להריץ Dry Run ולאשר.
								</div>
							</div>
						)}

						{error && (
							<div className="rounded-lg border border-blade/30 bg-blade/10 px-3 py-2 text-sm text-blade mb-3">
								{error}
							</div>
						)}

						{/* Footer */}
						<div className="flex items-center justify-end gap-2 pt-3 border-t border-ninja-line">
							{allDone ? (
								<>
									<button
										type="button"
										onClick={onClose}
										className="rounded-md border border-ninja-line bg-ninja-panel/60 hover:bg-ninja-raised text-ink-dim px-4 py-2 text-sm"
									>
										סגור
									</button>
									<a
										href={`/clients/${clientId}/execution`}
										className="inline-flex items-center gap-1.5 rounded-md border border-blade/30 bg-blade/10 hover:bg-blade/20 text-blade px-4 py-2 text-sm font-semibold"
									>
										עבור ל-Execution →
									</a>
								</>
							) : (
								<>
									<button
										type="button"
										onClick={onClose}
										disabled={pending}
										className="rounded-md border border-ninja-line bg-ninja-panel/60 hover:bg-ninja-raised text-ink-dim px-4 py-2 text-sm disabled:opacity-60"
									>
										ביטול
									</button>
									<button
										type="button"
										onClick={submit}
										disabled={
											pending ||
											(selection === "title" && !readiness.canPrepareTitle) ||
											(selection === "meta" && !readiness.canPrepareMeta) ||
											(selection === "both" && !canBoth)
										}
										className="inline-flex items-center gap-2 rounded-md border border-blade/30 bg-blade/10 hover:bg-blade/20 text-blade px-4 py-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
									>
										{pending ? (
											<>
												<Loader2 className="w-4 h-4 animate-spin" />
												יוצר…
											</>
										) : (
											"צור ExecutionAction"
										)}
									</button>
								</>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-baseline gap-2">
			<span className="text-[10px] uppercase tracking-wider text-ink-mute w-24 shrink-0">{label}</span>
			<span className="text-ink">{children}</span>
		</div>
	);
}

function Gate({
	ok,
	label,
	detail,
}: {
	ok: boolean;
	label: string;
	detail?: string;
}) {
	return (
		<div className="flex items-start gap-2 text-xs">
			<span
				className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${
					ok ? "bg-go/20 border-go/40 text-go" : "bg-blade/10 border-blade/40 text-blade"
				}`}
			>
				{ok ? "✓" : "✗"}
			</span>
			<div className="flex-1">
				<div className={ok ? "text-ink-dim" : "text-ink"}>{label}</div>
				{detail && <div className="text-[11px] text-ink-mute mt-0.5">{detail}</div>}
			</div>
		</div>
	);
}

function SelectionRow({
	checked,
	onChange,
	disabled,
	label,
	preview: _preview,
}: {
	checked: boolean;
	onChange: () => void;
	disabled: boolean;
	label: string;
	preview: React.ReactNode;
}) {
	return (
		<label
			className={`flex items-start gap-2 cursor-pointer rounded-md border px-3 py-2 ${
				checked
					? "border-blade/40 bg-blade/5"
					: disabled
						? "border-ninja-line opacity-50 cursor-not-allowed"
						: "border-ninja-line hover:border-ninja-line-strong"
			}`}
		>
			<input
				type="radio"
				name="actionSelection"
				checked={checked}
				disabled={disabled}
				onChange={onChange}
				className="mt-1"
			/>
			<div className="flex-1">
				<div className="text-sm text-ink">{label}</div>
			</div>
		</label>
	);
}

// Reserved for a future inline diff in the modal. Today the diff still comes
// from Dry Run on the Execution page so we keep this thin.
function Preview({ before: _before, after: _after }: { before: string; after?: string }) {
	return null;
}
