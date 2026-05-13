"use client";

import { useState, useTransition } from "react";
import { Pause, Play, Trash2, Pencil, X, Save } from "lucide-react";
import {
	INTENT_OPTIONS,
	PRIORITY_OPTIONS,
	STATUS_OPTIONS,
	BUSINESS_VALUE_OPTIONS,
	KEYWORD_GOAL_OPTIONS,
} from "@/lib/keywords";
import { deleteKeyword, toggleKeywordStatus, updateKeyword } from "./actions";

interface Row {
	id: string;
	keyword: string;
	intent: string | null;
	priority: string;
	targetUrl: string | null;
	status: string;
	notes: string | null;
	businessValue: string | null;
	keywordGoal: string | null;
	keywordGoalNote: string | null;
}

export function RowActions({ row }: { row: Row }) {
	const [editing, setEditing] = useState(false);
	const [pending, startTransition] = useTransition();

	if (editing) {
		return (
			<EditDialog row={row} onClose={() => setEditing(false)} />
		);
	}

	const paused = row.status === "paused";

	return (
		<div className="flex items-center gap-1">
			<IconButton
				title={paused ? "הפעלה" : "השהיה"}
				onClick={() =>
					startTransition(async () => {
						await toggleKeywordStatus(row.id);
					})
				}
				disabled={pending}
			>
				{paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
			</IconButton>
			<IconButton title="עריכה" onClick={() => setEditing(true)}>
				<Pencil className="w-3.5 h-3.5" />
			</IconButton>
			<IconButton
				title="מחיקה"
				danger
				onClick={() => {
					if (!confirm(`למחוק את "${row.keyword}"?`)) return;
					startTransition(async () => {
						await deleteKeyword(row.id);
					});
				}}
				disabled={pending}
			>
				<Trash2 className="w-3.5 h-3.5" />
			</IconButton>
		</div>
	);
}

function EditDialog({ row, onClose }: { row: Row; onClose: () => void }) {
	const [pending, startTransition] = useTransition();
	const [err, setErr] = useState<string | null>(null);

	async function onSubmit(formData: FormData) {
		setErr(null);
		startTransition(async () => {
			const res = await updateKeyword(undefined, formData);
			if (res.error) setErr(res.error);
			else onClose();
		});
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/70 backdrop-blur-sm p-4"
			role="dialog"
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className="w-full max-w-lg rounded-xl border border-ninja-line-strong bg-ninja-panel shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
				<div className="flex items-center justify-between px-5 py-3 border-b border-ninja-line">
					<h3 className="font-display text-lg text-ink">עריכת מילת מפתח</h3>
					<button onClick={onClose} className="text-ink-dim hover:text-ink">
						<X className="w-4 h-4" />
					</button>
				</div>
				<form action={onSubmit} className="p-5 space-y-4">
					<input type="hidden" name="id" value={row.id} />
					<Field label="מילת מפתח">
						<Input name="keyword" required defaultValue={row.keyword} />
					</Field>
					<Field label="עמוד יעד">
						<Input
							name="targetUrl"
							dir="ltr"
							defaultValue={row.targetUrl ?? ""}
							placeholder="https://..."
						/>
					</Field>
					<div className="grid grid-cols-3 gap-3">
						<Field label="כוונה">
							<Select name="intent" defaultValue={row.intent ?? ""}>
								<option value="">—</option>
								{INTENT_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</Select>
						</Field>
						<Field label="עדיפות">
							<Select name="priority" defaultValue={row.priority}>
								{PRIORITY_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</Select>
						</Field>
						<Field label="סטטוס">
							<Select name="status" defaultValue={row.status}>
								{STATUS_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</Select>
						</Field>
					</div>
					<Field label="הערות">
						<Textarea name="notes" rows={2} defaultValue={row.notes ?? ""} />
					</Field>

					<div className="border-t border-ninja-line pt-4 space-y-3">
						<div className="text-[10px] font-bold tracking-[0.2em] uppercase text-gold">
							Strategic Context · Phase 15E.1
						</div>
						<div className="grid grid-cols-2 gap-3">
							<Field label="מטרת קידום">
								<Select name="keywordGoal" defaultValue={row.keywordGoal ?? ""}>
									<option value="">— ללא הגדרה —</option>
									{KEYWORD_GOAL_OPTIONS.map((o) => (
										<option key={o.value} value={o.value} title={o.description}>
											{o.label}
										</option>
									))}
								</Select>
							</Field>
							<Field label="ערך עסקי">
								<Select name="businessValue" defaultValue={row.businessValue ?? ""}>
									<option value="">—</option>
									{BUSINESS_VALUE_OPTIONS.map((o) => (
										<option key={o.value} value={o.value}>
											{o.label}
										</option>
									))}
								</Select>
							</Field>
						</div>
						<Field label="הערת מטרה (אופציונלי)">
							<Textarea
								name="keywordGoalNote"
								rows={2}
								defaultValue={row.keywordGoalNote ?? ""}
								placeholder="הקשר נוסף — למה זו המטרה, מה success נראה..."
							/>
						</Field>
						<p className="text-[10px] text-ink-mute leading-relaxed">
							ה-Brain עדיין לא מתעדף לפי מטרת הקידום. השדה נשמר עכשיו ויחל להשפיע בשלב 15E.2.
						</p>
					</div>

					{err && (
						<div className="text-xs text-blade">{err}</div>
					)}

					<div className="flex items-center justify-end gap-3 pt-2">
						<button
							type="button"
							onClick={onClose}
							className="text-sm text-ink-dim hover:text-ink"
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

function IconButton({
	children,
	title,
	onClick,
	danger,
	disabled,
}: {
	children: React.ReactNode;
	title: string;
	onClick: () => void;
	danger?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			title={title}
			onClick={onClick}
			disabled={disabled}
			className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
				danger
					? "text-ink-mute hover:text-blade hover:bg-blade/10"
					: "text-ink-mute hover:text-gold hover:bg-ninja-raised"
			} disabled:opacity-40`}
		>
			{children}
		</button>
	);
}

const FIELD_CLASS =
	"w-full bg-ninja-raised border border-ninja-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:border-blade/60 focus:ring-2 focus:ring-blade/20 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="block">
			<span className="text-[11px] font-bold tracking-[0.15em] uppercase text-ink-dim block mb-1">
				{label}
			</span>
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
