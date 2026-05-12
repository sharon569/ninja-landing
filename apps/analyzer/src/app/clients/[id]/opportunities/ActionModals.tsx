"use client";

import { useState, useTransition } from "react";
import { X, Check, AlertCircle } from "lucide-react";
import { APPROVED_ACTION_TYPES } from "@/lib/opportunities";
import { approveOpportunity, markManuallyApplied, rejectOpportunity } from "./actions";

interface ModalBaseProps {
	opportunityId: string;
	onClose: () => void;
}

export function ApproveModal({ opportunityId, onClose }: ModalBaseProps) {
	const [pending, startTransition] = useTransition();
	const [err, setErr] = useState<string | null>(null);

	async function onSubmit(formData: FormData) {
		setErr(null);
		formData.set("opportunityId", opportunityId);
		startTransition(async () => {
			const r = await approveOpportunity(formData);
			if (r.error) setErr(r.error);
			else onClose();
		});
	}

	return (
		<ModalShell title="אישור פעולה" onClose={onClose}>
			<form action={onSubmit} className="p-5 space-y-4">
				<div className="rounded-md bg-go/10 border border-go/30 px-4 py-2.5 text-xs text-ink">
					אישור = הצהרה שאתה מאשר לבצע את ההמלצה. אין יישום אוטומטי — הביצוע עדיין ידני.
				</div>

				<Field label="סוג פעולה שתבצע (לא חובה)">
					<Select name="actionType" defaultValue="">
						<option value="">— לא מצוין —</option>
						{APPROVED_ACTION_TYPES.map((t) => (
							<option key={t.value} value={t.value}>
								{t.label}
							</option>
						))}
					</Select>
				</Field>

				<Field label="הערת אישור (לא חובה)">
					<Textarea name="note" rows={3} placeholder="הערה שתישאר ב-Action Log…" />
				</Field>

				{err && <Err msg={err} />}
				<SubmitRow pending={pending} onClose={onClose} label="אישור" />
			</form>
		</ModalShell>
	);
}

export function RejectModal({ opportunityId, onClose }: ModalBaseProps) {
	const [pending, startTransition] = useTransition();
	const [err, setErr] = useState<string | null>(null);

	async function onSubmit(formData: FormData) {
		setErr(null);
		formData.set("opportunityId", opportunityId);
		startTransition(async () => {
			const r = await rejectOpportunity(formData);
			if (r.error) setErr(r.error);
			else onClose();
		});
	}

	return (
		<ModalShell title="דחיית הזדמנות" onClose={onClose}>
			<form action={onSubmit} className="p-5 space-y-4">
				<Field label="למה אתה דוחה? (לא חובה)">
					<Textarea name="note" rows={3} placeholder="הסיבה תישמר ב-Action Log..." />
				</Field>
				{err && <Err msg={err} />}
				<SubmitRow pending={pending} onClose={onClose} label="דחה" tone="bad" />
			</form>
		</ModalShell>
	);
}

export function MarkAppliedModal({ opportunityId, onClose }: ModalBaseProps) {
	const [pending, startTransition] = useTransition();
	const [err, setErr] = useState<string | null>(null);

	async function onSubmit(formData: FormData) {
		setErr(null);
		formData.set("opportunityId", opportunityId);
		startTransition(async () => {
			const r = await markManuallyApplied(formData);
			if (r.error) setErr(r.error);
			else onClose();
		});
	}

	// default = today YYYY-MM-DD
	const today = new Date().toISOString().slice(0, 10);

	return (
		<ModalShell title="סימון כבוצע ידנית" onClose={onClose}>
			<form action={onSubmit} className="p-5 space-y-4">
				<div className="rounded-md bg-gold/10 border border-gold/30 px-4 py-2.5 text-xs text-ink">
					אישור הסימון יוצר Baseline של נתוני ה-GSC הנוכחיים — נקודת השוואה לבדיקת השפעה.
				</div>

				<Field label="מה בוצע בפועל">
					<Textarea
						name="note"
						rows={3}
						placeholder="לדוגמה: עודכן Title והמטא של עמוד הקטגוריה הראשי"
					/>
				</Field>

				<Field label="URL שבו בוצע השינוי (לא חובה)">
					<Input
						name="url"
						type="url"
						dir="ltr"
						placeholder="https://..."
					/>
				</Field>

				<Field label="תאריך ביצוע">
					<Input name="appliedAt" type="date" defaultValue={today} required />
				</Field>

				{err && <Err msg={err} />}
				<SubmitRow pending={pending} onClose={onClose} label="סמן כבוצע" tone="good" />
			</form>
		</ModalShell>
	);
}

// ─── shared shell ───────────────────────────────────────────────

function ModalShell({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/70 backdrop-blur-sm p-4"
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className="w-full max-w-lg rounded-xl border border-ninja-line-strong bg-ninja-panel shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
				<div className="flex items-center justify-between px-5 py-3 border-b border-ninja-line">
					<h3 className="font-display text-lg text-ink">{title}</h3>
					<button onClick={onClose} className="text-ink-dim hover:text-ink">
						<X className="w-4 h-4" />
					</button>
				</div>
				{children}
			</div>
		</div>
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
	return <input {...props} className={`${FIELD_CLASS} ${props.className ?? ""}`} />;
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea {...props} className={`${FIELD_CLASS} resize-y ${props.className ?? ""}`} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
	return <select {...props} className={`${FIELD_CLASS} ${props.className ?? ""}`} />;
}

function Err({ msg }: { msg: string }) {
	return (
		<div className="inline-flex items-center gap-1.5 text-xs text-blade">
			<AlertCircle className="w-3.5 h-3.5" />
			{msg}
		</div>
	);
}

function SubmitRow({
	pending,
	onClose,
	label,
	tone = "good",
}: {
	pending: boolean;
	onClose: () => void;
	label: string;
	tone?: "good" | "bad";
}) {
	return (
		<div className="flex items-center justify-end gap-3 pt-2">
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
				style={{
					background:
						tone === "bad"
							? "linear-gradient(135deg, #6a6f7c, #3a3d44)"
							: "linear-gradient(135deg, #ff2a3c, #b3001b)",
				}}
			>
				<Check className="w-3.5 h-3.5" />
				{pending ? "שומר…" : label}
			</button>
		</div>
	);
}
