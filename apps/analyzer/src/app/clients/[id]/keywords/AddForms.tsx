"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, AlertCircle, Plus, ListPlus } from "lucide-react";
import {
	INTENT_OPTIONS,
	PRIORITY_OPTIONS,
} from "@/lib/keywords";
import { addKeyword, addKeywordsBulk, type AddKeywordState } from "./actions";

export function AddForms({ clientId }: { clientId: string }) {
	const [mode, setMode] = useState<"single" | "bulk">("single");

	return (
		<section className="rounded-xl border border-ninja-line bg-ninja-panel/60 overflow-hidden">
			<div className="flex items-center gap-1 border-b border-ninja-line bg-ninja-raised/40 px-2">
				<TabButton active={mode === "single"} onClick={() => setMode("single")} icon={<Plus className="w-3.5 h-3.5" />}>
					הוספה בודדת
				</TabButton>
				<TabButton active={mode === "bulk"} onClick={() => setMode("bulk")} icon={<ListPlus className="w-3.5 h-3.5" />}>
					הוספה מרובה (Bulk)
				</TabButton>
			</div>
			<div className="p-5">
				{mode === "single" ? <SingleAdd clientId={clientId} /> : <BulkAdd clientId={clientId} />}
			</div>
		</section>
	);
}

function TabButton({
	active,
	onClick,
	icon,
	children,
}: {
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`relative px-4 py-3 text-sm transition-colors inline-flex items-center gap-2 ${
				active ? "text-ink font-semibold" : "text-ink-dim hover:text-ink"
			}`}
		>
			{icon}
			{children}
			{active && (
				<span
					className="absolute -bottom-px left-0 right-0 h-0.5"
					style={{ background: "linear-gradient(90deg, #ff2a3c, #ffd166)" }}
				/>
			)}
		</button>
	);
}

function SingleAdd({ clientId }: { clientId: string }) {
	const action = addKeyword.bind(null, clientId);
	const [state, formAction, pending] = useActionState<AddKeywordState | undefined, FormData>(
		action,
		undefined,
	);
	return (
		<form action={formAction} key={state?.ok ? Date.now() : "form"} className="space-y-4">
			<div className="grid sm:grid-cols-2 gap-4">
				<Field label="מילת מפתח">
					<Input name="keyword" required placeholder="מטבחים מודרניים תל אביב" />
				</Field>
				<Field label="עמוד יעד" hint="ה-URL שמילת המפתח אמורה לקדם">
					<Input name="targetUrl" placeholder="https://www.example.com/..." dir="ltr" />
				</Field>
				<Field label="כוונת חיפוש">
					<Select name="intent">
						<option value="">— בחר —</option>
						{INTENT_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</Select>
				</Field>
				<Field label="עדיפות">
					<Select name="priority" defaultValue="medium">
						{PRIORITY_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</Select>
				</Field>
			</div>
			<Field label="הערות">
				<Textarea name="notes" rows={2} placeholder="הערות פנימיות (לא יישלחו ללקוח)" />
			</Field>

			<SubmitBar pending={pending} state={state} label="הוסף מילת מפתח" />
		</form>
	);
}

function BulkAdd({ clientId }: { clientId: string }) {
	const action = addKeywordsBulk.bind(null, clientId);
	const [state, formAction, pending] = useActionState<AddKeywordState | undefined, FormData>(
		action,
		undefined,
	);
	return (
		<form action={formAction} key={state?.ok ? Date.now() : "bulk"} className="space-y-4">
			<Field
				label="רשימת מילות מפתח"
				hint="מילה אחת בכל שורה. ברירת מחדל: intent=unknown, priority=medium, status=active. כפילויות יידחו."
			>
				<Textarea
					name="bulk"
					rows={10}
					placeholder={"מטבחים מודרניים\nשיפוץ מטבח&#10;ארונות מטבח חיפה"}
				/>
			</Field>

			<SubmitBar pending={pending} state={state} label="הוסף את כל המילים" />
		</form>
	);
}

function SubmitBar({
	pending,
	state,
	label,
}: {
	pending: boolean;
	state: AddKeywordState | undefined;
	label: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 pt-2">
			<div className="text-xs">
				{state?.error && (
					<span className="inline-flex items-center gap-1.5 text-blade">
						<AlertCircle className="w-3.5 h-3.5" />
						{state.error}
					</span>
				)}
				{state?.ok && (
					<span className="inline-flex items-center gap-1.5 text-go">
						<CheckCircle2 className="w-3.5 h-3.5" />
						{typeof state.added === "number"
							? `נוספו ${state.added}${state.skipped ? ` · דולגו ${state.skipped} כפילויות` : ""}`
							: "נשמר"}
					</span>
				)}
			</div>
			<button
				type="submit"
				disabled={pending}
				className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold text-white shadow-[0_4px_14px_rgba(255,42,60,0.35)] hover:shadow-[0_6px_18px_rgba(255,42,60,0.45)] disabled:opacity-60 disabled:cursor-not-allowed transition-shadow"
				style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
			>
				{pending ? "שומר…" : label}
			</button>
		</div>
	);
}

// ─── primitives ──────────────────────────────────────────────────

const FIELD_CLASS =
	"w-full bg-ninja-raised border border-ninja-line rounded-lg px-4 py-2.5 text-ink placeholder:text-ink-mute focus:outline-none focus:border-blade/60 focus:ring-2 focus:ring-blade/20 transition-colors";

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
				<span className="text-xs font-bold tracking-[0.15em] uppercase text-ink-dim">
					{label}
				</span>
				{hint && <span className="text-[11px] text-ink-mute">{hint}</span>}
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
