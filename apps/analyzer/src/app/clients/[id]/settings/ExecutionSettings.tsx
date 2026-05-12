"use client";

import { useActionState, useRef, useState } from "react";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { updateExecutionSettings, type ExecutionSettingsState } from "./actions";

interface Initial {
	executionEnabled: boolean;
	executionPilotMode: boolean;
	allowedExecutionActions: string[];
}

const ACTION_OPTIONS = [
	{ value: "yoast_title_update", label: "Yoast Title" },
	{ value: "yoast_description_update", label: "Yoast Meta Description" },
	{ value: "image_alt_update", label: "Image Alt Text" },
];

export function ExecutionSettings({
	clientId,
	initial,
}: {
	clientId: string;
	initial: Initial;
}) {
	const bound = updateExecutionSettings.bind(null, clientId);
	const [state, action, pending] = useActionState<
		ExecutionSettingsState | undefined,
		FormData
	>(bound, undefined);
	const formRef = useRef<HTMLFormElement | null>(null);
	const [showEnableModal, setShowEnableModal] = useState(false);

	// Phase 14B — controlled enable confirmation. If executionEnabled flips
	// from false→true, intercept submit and show the warning modal first.
	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		if (initial.executionEnabled) return; // already on, no need to confirm
		const form = e.currentTarget;
		const enableInput = form.elements.namedItem("executionEnabled") as HTMLInputElement | null;
		if (enableInput?.checked) {
			e.preventDefault();
			setShowEnableModal(true);
		}
	}

	function confirmEnable() {
		setShowEnableModal(false);
		// Defer slightly so React commits the state change before the synthetic submit
		requestAnimationFrame(() => formRef.current?.requestSubmit());
	}

	return (
		<>
		<form ref={formRef} action={action} onSubmit={handleSubmit} className="space-y-5">
			{/* Strong warning header */}
			<div className="rounded-lg border border-blade/40 bg-blade/10 px-4 py-3 text-sm text-blade flex items-start gap-3">
				<AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
				<div className="leading-relaxed">
					Execution מאפשר למערכת לבצע <strong>שינויים חיים</strong> באתר WordPress של הלקוח לאחר Dry Run ואישור מפורש.
					<br />
					<strong>מומלץ להפעיל תחילה רק על לקוח בדיקה.</strong>
				</div>
			</div>

			<div className="space-y-3">
				<label className="flex items-start gap-3 cursor-pointer">
					<input
						type="checkbox"
						name="executionEnabled"
						defaultChecked={initial.executionEnabled}
						className="mt-1 h-4 w-4 rounded border-ninja-line bg-ninja-panel accent-blade"
					/>
					<div>
						<div className="text-sm text-ink">Enable Execution for this client</div>
						<div className="text-xs text-ink-mute mt-0.5">
							מאסטר-מפתח. אם כבוי — לא ניתן ליצור ExecutionAction חדשה, ולא ניתן לבצע גם אם פלאגין v0.3 מותקן.
						</div>
					</div>
				</label>

				<label className="flex items-start gap-3 cursor-pointer ms-4 ps-4 border-s border-ninja-line">
					<input
						type="checkbox"
						name="executionPilotMode"
						defaultChecked={initial.executionPilotMode}
						className="mt-1 h-4 w-4 rounded border-ninja-line bg-ninja-panel accent-gold"
					/>
					<div>
						<div className="text-sm text-ink">Pilot Mode</div>
						<div className="text-xs text-ink-mute mt-0.5">
							מציג Banner צהוב בדף ה-Execution, ומתעד שכל פעולה נעשתה במצב פיילוט. מומלץ להישאר דלוק עד שהוסף מספר ביצועים מוצלחים.
						</div>
					</div>
				</label>
			</div>

			<div className="border-t border-ninja-line pt-4">
				<div className="text-xs uppercase tracking-wider text-ink-dim mb-2.5">
					Allowed Actions
				</div>
				<p className="text-xs text-ink-mute mb-3">
					גם אם Execution דלוק, ה-Analyzer יקבל פעולות רק עבור הסוגים שמסומנים כאן. Internal Link ו-Content Snippet הם
					preview-only ולכן לא מופיעים כאן.
				</p>
				<div className="space-y-2">
					{ACTION_OPTIONS.map((o) => (
						<label key={o.value} className="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								name="allowedExecutionActions"
								value={o.value}
								defaultChecked={initial.allowedExecutionActions.includes(o.value)}
								className="h-4 w-4 rounded border-ninja-line bg-ninja-panel accent-blade"
							/>
							<span className="text-sm text-ink">{o.label}</span>
						</label>
					))}
				</div>
			</div>

			<div className="flex items-center gap-3 pt-3 border-t border-ninja-line">
				<button
					type="submit"
					disabled={pending}
					className="inline-flex items-center gap-2 rounded-md border border-blade/30 bg-blade/10 hover:bg-blade/20 text-blade px-4 py-2 text-sm font-semibold disabled:opacity-60"
				>
					{pending ? (
						<>
							<Loader2 className="w-4 h-4 animate-spin" />
							שומר…
						</>
					) : (
						"שמירת הגדרות Execution"
					)}
				</button>
				{state?.ok && !pending && (
					<span className="inline-flex items-center gap-1.5 text-xs text-go">
						<CheckCircle2 className="w-3.5 h-3.5" /> נשמר
					</span>
				)}
				{state?.error && !pending && (
					<span className="text-xs text-blade">{state.error}</span>
				)}
			</div>
		</form>

		{showEnableModal && (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/80 backdrop-blur-sm p-4">
				<div className="max-w-lg w-full rounded-xl border border-blade/40 bg-ninja-panel p-6 shadow-2xl">
					<div className="flex items-start gap-3 mb-4">
						<AlertTriangle className="w-6 h-6 text-blade shrink-0 mt-0.5" />
						<div>
							<h3 className="font-display text-xl text-ink mb-2">הפעלת Execution</h3>
							<p className="text-sm text-ink-dim leading-relaxed">
								Execution מאפשר ביצוע שינויים חיים באתר WordPress לאחר Dry Run ואישור מפורש. מומלץ להתחיל עם
								<strong> Yoast Title</strong> בלבד. להפעיל?
							</p>
							<p className="text-xs text-ink-mute mt-2">
								אם לא בחרת Allowed Actions במפורש — נסמן את Yoast Title אוטומטית כברירת מחדל בטוחה.
							</p>
						</div>
					</div>
					<div className="flex items-center justify-end gap-2 pt-4 border-t border-ninja-line">
						<button
							type="button"
							onClick={() => setShowEnableModal(false)}
							className="rounded-md border border-ninja-line bg-ninja-panel/60 hover:bg-ninja-raised text-ink-dim px-4 py-2 text-sm"
						>
							לא, ביטול
						</button>
						<button
							type="button"
							onClick={confirmEnable}
							className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold text-white"
							style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
						>
							<AlertTriangle className="w-4 h-4" />
							כן, להפעיל Execution
						</button>
					</div>
				</div>
			</div>
		)}
		</>
	);
}
