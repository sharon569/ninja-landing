"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, X, AlertTriangle } from "lucide-react";
import { setBriefHumanReview, type HumanReviewDecision } from "./actions";

interface Props {
	briefId: string;
	briefTitle: string;
	current: {
		humanReviewedAt: Date | string | null;
		humanReviewDecision: string | null;
		humanReviewedNote: string | null;
		humanReviewedBy: string | null;
	};
	onClose: () => void;
}

const OPTIONS: { value: HumanReviewDecision; label: string; tone: "good" | "warn" | "bad" | "mute"; hint: string }[] = [
	{
		value: "approved_for_execution",
		label: "אושר לביצוע",
		tone: "good",
		hint: "סקרתי את ה-Brief, התוכן נכון. אפשר להכין Execution גם אם השלב באסטרטגיה דרש סקירה.",
	},
	{
		value: "needs_changes",
		label: "צריך שינויים",
		tone: "warn",
		hint: "הברית בכיוון נכון אבל יש דברים שצריך לעדכן. עורך ידנית ואחר כך סוקר שוב.",
	},
	{
		value: "keep_as_draft",
		label: "להשאיר כטיוטה",
		tone: "mute",
		hint: "לא לדחות, אבל גם לא לאשר עכשיו. בודקים שוב במחזור הבא.",
	},
	{
		value: "rejected",
		label: "דחייה",
		tone: "bad",
		hint: "לא לקדם את הברית הזה — לא רלוונטי, כפול, או רעיון לא נכון.",
	},
];

export function HumanReviewModal({ briefId, briefTitle, current, onClose }: Props) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [decision, setDecision] = useState<HumanReviewDecision>(
		(current.humanReviewDecision as HumanReviewDecision) ?? "approved_for_execution",
	);
	const [note, setNote] = useState(current.humanReviewedNote ?? "");
	const [error, setError] = useState<string | null>(null);

	function go() {
		setError(null);
		startTransition(async () => {
			const r = await setBriefHumanReview(briefId, decision, note);
			if (r.error) {
				setError(r.error);
				return;
			}
			router.refresh();
			onClose();
		});
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/80 backdrop-blur-sm p-4">
			<div className="max-w-lg w-full rounded-xl border border-gold/40 bg-ninja-panel p-6 shadow-2xl">
				<div className="flex items-start justify-between mb-3">
					<h3 className="font-display text-xl text-ink flex items-center gap-2">
						<Eye className="w-5 h-5 text-gold" />
						סקירת Brief אנושית
					</h3>
					<button type="button" onClick={onClose} className="text-ink-mute hover:text-ink">
						<X className="w-4 h-4" />
					</button>
				</div>

				<p className="text-xs text-ink-dim leading-relaxed mb-4">
					<strong>{briefTitle}</strong>
					<br />
					סקירה אנושית מאשרת שראית את התוכן והוא נכון. כשמסומן &quot;אושר לביצוע&quot; — Decision Guard מתעלם רק
					מ-<code className="font-mono text-gold">requiresHumanReview</code> של השלב באסטרטגיה. כל שאר ה-gates
					(scope, plugin, allowed actions, risk critical) <strong className="text-blade">ממשיכים להתאכף</strong>.
				</p>

				{current.humanReviewedAt && (
					<div className="rounded-lg border border-ninja-line bg-ninja-raised/30 px-3 py-2 mb-4 text-xs">
						<div className="text-ink-mute">סקירה קודמת:</div>
						<div className="text-ink-dim mt-0.5">
							{new Date(current.humanReviewedAt).toLocaleString("he-IL")} ע&quot;י {current.humanReviewedBy ?? "—"}
							{current.humanReviewedNote && ` · "${current.humanReviewedNote}"`}
						</div>
					</div>
				)}

				<div className="space-y-2 mb-4">
					{OPTIONS.map((o) => (
						<label
							key={o.value}
							className={`block rounded-md border px-3 py-2 cursor-pointer ${
								decision === o.value
									? o.tone === "good"
										? "border-go/40 bg-go/5"
										: o.tone === "warn"
											? "border-gold/40 bg-gold/5"
											: o.tone === "bad"
												? "border-blade/40 bg-blade/5"
												: "border-ninja-line-strong bg-ninja-raised/30"
									: "border-ninja-line hover:border-ninja-line-strong"
							}`}
						>
							<div className="flex items-baseline gap-2">
								<input
									type="radio"
									name="briefReview"
									value={o.value}
									checked={decision === o.value}
									onChange={() => setDecision(o.value)}
								/>
								<span className="text-sm text-ink font-medium">{o.label}</span>
							</div>
							<p className="text-xs text-ink-dim mt-1 ms-5 leading-relaxed">{o.hint}</p>
						</label>
					))}
				</div>

				<label className="block text-xs text-ink-dim mb-1.5">הערה (אופציונלי)</label>
				<textarea
					value={note}
					onChange={(e) => setNote(e.target.value)}
					rows={2}
					placeholder="למה? מה הכרעת? למה זה בטוח/לא בטוח?"
					className="w-full rounded-md border border-ninja-line bg-ninja-panel/60 px-3 py-2 text-sm text-ink mb-4"
				/>

				{error && (
					<div className="rounded-md border border-blade/30 bg-blade/10 px-3 py-2 text-sm text-blade mb-3 flex items-start gap-2">
						<AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
						{error}
					</div>
				)}

				<div className="flex items-center justify-end gap-2 pt-3 border-t border-ninja-line">
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
						onClick={go}
						disabled={pending}
						className="inline-flex items-center gap-2 rounded-md border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold px-4 py-2 text-sm font-semibold disabled:opacity-60"
					>
						{pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
						שמור סקירה
					</button>
				</div>
			</div>
		</div>
	);
}
