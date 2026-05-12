"use client";

import { useActionState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { updateClientAutomation, type AutomationToggleState } from "./actions";

interface Initial {
	status: string;
	automationEnabled: boolean;
	autoGscSyncEnabled: boolean;
	autoTechAuditEnabled: boolean;
	autoOpportunityAnalysisEnabled: boolean;
	autoImpactReviewEnabled: boolean;
}

export function AutomationToggles({
	clientId,
	initial,
}: {
	clientId: string;
	initial: Initial;
}) {
	const bound = updateClientAutomation.bind(null, clientId);
	const [state, action, pending] = useActionState<
		AutomationToggleState | undefined,
		FormData
	>(bound, undefined);

	return (
		<form action={action} className="space-y-5">
			<div>
				<label className="block text-xs uppercase tracking-wider text-ink-dim mb-2">
					סטטוס הלקוח
				</label>
				<select
					name="status"
					defaultValue={initial.status}
					className="rounded-md border border-ninja-line bg-ninja-panel/60 px-3 py-2 text-sm text-ink"
				>
					<option value="active">פעיל</option>
					<option value="paused">מושהה</option>
					<option value="archived">בארכיון</option>
				</select>
				<p className="text-xs text-ink-mute mt-1">
					מושהה / בארכיון = יידלג בסנכרון האוטומטי.
				</p>
			</div>

			<div className="border-t border-ninja-line pt-5 space-y-3">
				<Toggle
					name="automationEnabled"
					label="אוטומציה ראשית"
					hint="מאסטר־כיבוי. אם כבוי — כל האוטומציות מדלגות על הלקוח הזה."
					defaultChecked={initial.automationEnabled}
				/>
				<div className="ms-4 ps-4 border-s border-ninja-line space-y-3">
					<Toggle
						name="autoGscSyncEnabled"
						label="GSC Sync אוטומטי"
						hint="נמשך כל 7 ימים."
						defaultChecked={initial.autoGscSyncEnabled}
					/>
					<Toggle
						name="autoTechAuditEnabled"
						label="ניתוח טכני אוטומטי"
						hint="כל 14 ימים (דורש סריקת פלאגאין קיימת)."
						defaultChecked={initial.autoTechAuditEnabled}
					/>
					<Toggle
						name="autoOpportunityAnalysisEnabled"
						label="ניתוח הזדמנויות אוטומטי"
						hint="כל 7 ימים, או מיד אחרי GSC Sync מוצלח."
						defaultChecked={initial.autoOpportunityAnalysisEnabled}
					/>
					<Toggle
						name="autoImpactReviewEnabled"
						label="Impact Reviews אוטומטיים"
						hint="חלונות 7/14/30 ימים מסימון ידני של ביצוע."
						defaultChecked={initial.autoImpactReviewEnabled}
					/>
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
						"שמירת הגדרות אוטומציה"
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

function Toggle({
	name,
	label,
	hint,
	defaultChecked,
}: {
	name: string;
	label: string;
	hint?: string;
	defaultChecked: boolean;
}) {
	return (
		<label className="flex items-start gap-3 cursor-pointer">
			<input
				type="checkbox"
				name={name}
				defaultChecked={defaultChecked}
				className="mt-1 h-4 w-4 rounded border-ninja-line bg-ninja-panel text-blade accent-blade"
			/>
			<div>
				<div className="text-sm text-ink">{label}</div>
				{hint && <div className="text-xs text-ink-mute mt-0.5">{hint}</div>}
			</div>
		</label>
	);
}
