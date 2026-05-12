"use client";

import { useActionState } from "react";
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

	return (
		<form action={action} className="space-y-5">
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
	);
}
