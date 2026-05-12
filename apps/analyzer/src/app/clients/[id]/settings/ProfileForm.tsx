"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
	VERTICAL_OPTIONS,
	LANGUAGE_OPTIONS,
	AUTOMATION_LEVELS,
	APPROVAL_CATEGORIES,
} from "@/lib/profile";
import { updateClientProfile, type UpdateProfileState } from "./actions";

interface Props {
	clientId: string;
	initial: {
		vertical: string | null;
		language: string | null;
		country: string | null;
		serviceAreas: string[];
		seoGoals: string | null;
		targetPages: string[];
		competitors: string[];
		brandVoice: string | null;
		notes: string | null;
		automationLevel: string;
		requireApprovalFor: string[];
	};
}

export function ProfileForm({ clientId, initial }: Props) {
	const action = updateClientProfile.bind(null, clientId);
	const [state, formAction, pending] = useActionState<UpdateProfileState | undefined, FormData>(
		action,
		undefined,
	);

	return (
		<form action={formAction} className="space-y-10">
			{/* A. Business Context */}
			<Section
				eyebrow="A"
				title="הקשר עסקי"
				blurb="כל הקשר שמסביר מה הלקוח עושה ולמה — המוח העסקי של ה-SEO."
			>
				<div className="grid sm:grid-cols-2 gap-4">
					<Field label="סוג עסק">
						<Select name="vertical" defaultValue={initial.vertical ?? ""}>
							<option value="">— בחר —</option>
							{VERTICAL_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</Select>
					</Field>

					<Field label="שפה ראשית">
						<Select name="language" defaultValue={initial.language ?? ""}>
							<option value="">— בחר —</option>
							{LANGUAGE_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</Select>
					</Field>

					<Field label="מדינה" hint="קוד 2-תווי או שם (IL, US, וכו')">
						<Input
							name="country"
							defaultValue={initial.country ?? ""}
							placeholder="IL"
							maxLength={80}
						/>
					</Field>

					<Field label="אזורי שירות" hint="ערים/אזורים — שורה בכל פעם">
						<Textarea
							name="serviceAreas"
							defaultValue={initial.serviceAreas.join("\n")}
							placeholder="תל אביב&#10;חיפה&#10;ירושלים"
							rows={3}
						/>
					</Field>
				</div>

				<Field
					label="מטרות SEO"
					hint="מה הלקוח רוצה להשיג? לדוגמה: 'להגדיל הזמנות אונליין', 'להוביל בחיפושי מוסך באזור גוש דן'"
				>
					<Textarea
						name="seoGoals"
						defaultValue={initial.seoGoals ?? ""}
						placeholder="להוביל בחיפושים של ____ באזור ____"
						rows={3}
					/>
				</Field>
			</Section>

			{/* B. SEO Strategy */}
			<Section
				eyebrow="B"
				title="אסטרטגיית SEO"
				blurb="עמודים חשובים והמתחרים — המפה לפעולה."
			>
				<Field
					label="עמודים חשובים (Money Pages)"
					hint="URLs של עמודים מרכזיים — שורה בכל פעם"
				>
					<Textarea
						name="targetPages"
						defaultValue={initial.targetPages.join("\n")}
						placeholder="https://www.example.com/&#10;https://www.example.com/services&#10;https://www.example.com/category/main"
						rows={4}
						dir="ltr"
					/>
				</Field>

				<Field
					label="מתחרים"
					hint="דומיינים בלבד (בלי https://) — שורה בכל פעם"
				>
					<Textarea
						name="competitors"
						defaultValue={initial.competitors.join("\n")}
						placeholder="competitor1.co.il&#10;competitor2.com"
						rows={4}
						dir="ltr"
					/>
				</Field>

				<div className="rounded-lg border border-ninja-line bg-ninja-raised/40 px-4 py-3 text-xs text-ink-dim">
					<b className="text-gold-deep">בקרוב</b> · Phase 2 — Keyword Bank: ניהול מילות מפתח יעד פר-לקוח עם מיקום, קליקים, ומגמה.
				</div>
			</Section>

			{/* C. Content & Brand */}
			<Section
				eyebrow="C"
				title="תוכן ומותג"
				blurb="הטון שיכוון יצירת תוכן עתידית והערות פנימיות."
			>
				<Field
					label="טון כתיבה"
					hint="לדוגמה: 'מקצועי וחם', 'יוקרתי ומרוסן', 'ישיר וענייני'"
				>
					<Input
						name="brandVoice"
						defaultValue={initial.brandVoice ?? ""}
						placeholder="מקצועי, ישיר, ידידותי"
						maxLength={500}
					/>
				</Field>

				<Field label="הערות פנימיות" hint="לעיניים של הסוכנות בלבד — לא יישלח ללקוח">
					<Textarea
						name="notes"
						defaultValue={initial.notes ?? ""}
						placeholder="כל מה שחשוב לזכור על הלקוח..."
						rows={3}
					/>
				</Field>
			</Section>

			{/* D. Automation & Approval */}
			<Section
				eyebrow="D"
				title="אוטומציה ואישורים"
				blurb="כמה אוטונומיה יש למערכת? אילו פעולות דורשות אישור ידני לפני יישום."
			>
				<Field label="רמת אוטומציה">
					<div className="space-y-2">
						{AUTOMATION_LEVELS.map((l) => (
							<label
								key={l.value}
								className="flex items-start gap-3 rounded-lg border border-ninja-line bg-ninja-raised/40 px-4 py-3 cursor-pointer hover:border-gold/40 transition-colors has-[input:checked]:border-blade has-[input:checked]:bg-blade/10"
							>
								<input
									type="radio"
									name="automationLevel"
									value={l.value}
									defaultChecked={initial.automationLevel === l.value}
									className="mt-0.5 accent-blade"
								/>
								<div>
									<div className="text-sm font-semibold text-ink">{l.label}</div>
									<div className="text-xs text-ink-dim mt-0.5">{l.description}</div>
								</div>
							</label>
						))}
					</div>
				</Field>

				<Field
					label="פעולות שדורשות אישור"
					hint="כל פעולה מסומנת תופיע כ-Needs Human Review לפני יישום"
				>
					<div className="grid sm:grid-cols-2 gap-2">
						{APPROVAL_CATEGORIES.map((c) => (
							<label
								key={c.value}
								className="flex items-center gap-3 rounded-md border border-ninja-line bg-ninja-raised/40 px-3 py-2 cursor-pointer hover:border-gold/40 transition-colors has-[input:checked]:border-blade/60"
							>
								<input
									type="checkbox"
									name="requireApprovalFor"
									value={c.value}
									defaultChecked={initial.requireApprovalFor.includes(c.value)}
									className="accent-blade"
								/>
								<span className="text-sm text-ink">{c.label}</span>
							</label>
						))}
					</div>
				</Field>
			</Section>

			{/* Submit + status */}
			<div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ninja-line bg-ninja-panel/95 backdrop-blur-sm px-5 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
				<div className="text-xs text-ink-dim">
					שינויים נשמרים רק אחרי שלוחצים &quot;שמירה&quot;.
				</div>
				<div className="flex items-center gap-4">
					{state?.error && (
						<div className="inline-flex items-center gap-1.5 text-xs text-blade">
							<AlertCircle className="w-3.5 h-3.5" />
							{state.error}
						</div>
					)}
					{state?.ok && (
						<div className="inline-flex items-center gap-1.5 text-xs text-go">
							<CheckCircle2 className="w-3.5 h-3.5" />
							נשמר
						</div>
					)}
					<button
						type="submit"
						disabled={pending}
						className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold text-white shadow-[0_6px_18px_rgba(255,42,60,0.35)] hover:shadow-[0_8px_22px_rgba(255,42,60,0.45)] disabled:opacity-60 disabled:cursor-not-allowed transition-shadow"
						style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
					>
						{pending ? "שומר…" : "שמירה"}
					</button>
				</div>
			</div>
		</form>
	);
}

// ─── primitives ─────────────────────────────────────────────────────

function Section({
	eyebrow,
	title,
	blurb,
	children,
}: {
	eyebrow: string;
	title: string;
	blurb: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-5 border-b border-ninja-line pb-8 last:border-0">
			<div className="flex items-baseline gap-3">
				<span className="font-display text-blade text-2xl">{eyebrow}</span>
				<div>
					<h2 className="font-display text-xl text-ink">{title}</h2>
					<p className="text-xs text-ink-dim mt-1 max-w-xl">{blurb}</p>
				</div>
			</div>
			<div className="space-y-5">{children}</div>
		</section>
	);
}

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

const FIELD_CLASS =
	"w-full bg-ninja-raised border border-ninja-line rounded-lg px-4 py-2.5 text-ink placeholder:text-ink-mute focus:outline-none focus:border-blade/60 focus:ring-2 focus:ring-blade/20 transition-colors";

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input type="text" {...props} className={`${FIELD_CLASS} ${props.className ?? ""}`} />;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea {...props} className={`${FIELD_CLASS} resize-y ${props.className ?? ""}`} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
	return <select {...props} className={`${FIELD_CLASS} ${props.className ?? ""}`} />;
}
