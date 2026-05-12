"use client";

import { useActionState } from "react";
import { X, Save, AlertCircle } from "lucide-react";
import {
	BRIEF_TYPE_OPTIONS,
	SEARCH_INTENT_OPTIONS,
} from "@/lib/briefs";
import { updateBrief, type BriefActionState } from "./actions";

interface BriefData {
	id: string;
	targetKeyword: string;
	briefType: string;
	searchIntent: string;
	relatedPage: string | null;
	recommendedTitle: string | null;
	recommendedMetaDescription: string | null;
	recommendedH1: string | null;
	outline: string | null;
	secondaryKeywords: string[];
	internalLinks: string[];
	recommendedCTA: string | null;
	recommendedSchema: string | null;
	contentAngle: string | null;
	notes: string | null;
}

export function BriefEditModal({
	brief,
	onClose,
}: {
	brief: BriefData;
	onClose: () => void;
}) {
	const [state, formAction, pending] = useActionState<BriefActionState | undefined, FormData>(
		updateBrief,
		undefined,
	);
	if (state?.ok) {
		// Close after a tick so we don't break the form state update
		setTimeout(onClose, 80);
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/70 backdrop-blur-sm p-4"
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-ninja-line-strong bg-ninja-panel shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
				<div className="flex items-center justify-between px-5 py-3 border-b border-ninja-line">
					<h3 className="font-display text-lg text-ink">עריכת בריף תוכן</h3>
					<button onClick={onClose} className="text-ink-dim hover:text-ink">
						<X className="w-4 h-4" />
					</button>
				</div>

				<form action={formAction} className="p-5 space-y-5 overflow-y-auto">
					<input type="hidden" name="id" value={brief.id} />

					<div className="grid sm:grid-cols-2 gap-4">
						<Field label="מילת מפתח ראשית">
							<Input name="targetKeyword" defaultValue={brief.targetKeyword} required />
						</Field>
						<Field label="עמוד יעד">
							<Input
								name="relatedPage"
								defaultValue={brief.relatedPage ?? ""}
								dir="ltr"
								placeholder="https://..."
							/>
						</Field>
						<Field label="סוג בריף">
							<Select name="briefType" defaultValue={brief.briefType}>
								{BRIEF_TYPE_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</Select>
						</Field>
						<Field label="כוונת חיפוש">
							<Select name="searchIntent" defaultValue={brief.searchIntent}>
								{SEARCH_INTENT_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</Select>
						</Field>
					</div>

					<Field label="Title מומלץ" hint="עד 60 תווים">
						<Input name="recommendedTitle" defaultValue={brief.recommendedTitle ?? ""} maxLength={200} />
					</Field>

					<Field label="Meta Description מומלץ" hint="140-160 תווים">
						<Textarea
							name="recommendedMetaDescription"
							rows={2}
							defaultValue={brief.recommendedMetaDescription ?? ""}
							maxLength={400}
						/>
					</Field>

					<Field label="H1 מומלץ">
						<Input name="recommendedH1" defaultValue={brief.recommendedH1 ?? ""} />
					</Field>

					<Field label="מבנה Outline (H2/H3)" hint="markdown ## H2 / ### H3">
						<Textarea
							name="outline"
							rows={10}
							defaultValue={brief.outline ?? ""}
							className="font-mono text-xs"
						/>
					</Field>

					<div className="grid sm:grid-cols-2 gap-4">
						<Field label="מילות מפתח משניות" hint="שורה לכל מילה">
							<Textarea
								name="secondaryKeywords"
								rows={5}
								defaultValue={brief.secondaryKeywords.join("\n")}
							/>
						</Field>
						<Field
							label="קישורים פנימיים"
							hint="פורמט: url|anchor|reason — שורה לכל קישור"
						>
							<Textarea
								name="internalLinks"
								rows={5}
								defaultValue={brief.internalLinks.join("\n")}
								className="font-mono text-xs"
								dir="ltr"
							/>
						</Field>
					</div>

					<Field label="CTA מומלץ">
						<Textarea name="recommendedCTA" rows={2} defaultValue={brief.recommendedCTA ?? ""} />
					</Field>

					<Field label="Schema מומלץ">
						<Textarea
							name="recommendedSchema"
							rows={2}
							defaultValue={brief.recommendedSchema ?? ""}
						/>
					</Field>

					<Field label="זווית התוכן">
						<Textarea name="contentAngle" rows={2} defaultValue={brief.contentAngle ?? ""} />
					</Field>

					<Field label="הערות פנימיות">
						<Textarea name="notes" rows={3} defaultValue={brief.notes ?? ""} />
					</Field>

					{state?.error && (
						<div className="inline-flex items-center gap-1.5 text-xs text-blade">
							<AlertCircle className="w-3.5 h-3.5" />
							{state.error}
						</div>
					)}

					<div className="flex items-center justify-end gap-3 pt-2 border-t border-ninja-line">
						<button
							type="button"
							onClick={onClose}
							disabled={pending}
							className="text-sm text-ink-dim hover:text-ink disabled:opacity-50"
						>
							ביטול
						</button>
						<button
							type="submit"
							disabled={pending}
							className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
							style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
						>
							<Save className="w-3.5 h-3.5" />
							{pending ? "שומר…" : "שמירה"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

const FIELD_CLASS =
	"w-full bg-ninja-raised border border-ninja-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:border-blade/60 focus:ring-2 focus:ring-blade/20 transition-colors";

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<label className="block">
			<div className="flex items-baseline justify-between mb-1.5">
				<span className="text-[11px] font-bold tracking-[0.15em] uppercase text-ink-dim">
					{label}
				</span>
				{hint && <span className="text-[10px] text-ink-mute">{hint}</span>}
			</div>
			{children}
		</label>
	);
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input type="text" {...props} className={`${FIELD_CLASS} ${props.className ?? ""}`} />;
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea {...props} className={`${FIELD_CLASS} resize-y ${props.className ?? ""}`} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
	return <select {...props} className={`${FIELD_CLASS} ${props.className ?? ""}`} />;
}
