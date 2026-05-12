"use client";

import { useActionState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import {
	DEFAULT_UTILITY_PATTERNS,
	DEFAULT_LEGAL_PATTERNS,
	DEFAULT_TRUST_PATTERNS,
	DEFAULT_BUSINESS_INFO_PATTERNS,
} from "@/lib/page-scope";
import { updateScopeSettings, type ScopeSettingsState } from "./actions";

interface Initial {
	seoIgnoredUrls: string[];
	seoIgnoredPatterns: string[];
	seoForcedTargetUrls: string[];
}

export function ScopeSettings({
	clientId,
	initial,
}: {
	clientId: string;
	initial: Initial;
}) {
	const bound = updateScopeSettings.bind(null, clientId);
	const [state, action, pending] = useActionState<
		ScopeSettingsState | undefined,
		FormData
	>(bound, undefined);

	return (
		<form action={action} className="space-y-6">
			<div className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-ink leading-relaxed">
				<p>
					עמודי <strong>cart, checkout, my-account, terms, privacy, accessibility, shop archive</strong> וכו׳
					מסווגים אוטומטית כלא-SEO ולא מקבלים Opportunities / Briefs / Strategy / Execution.
				</p>
				<p className="mt-1.5 text-ink-dim">
					השדות מתחתיים מאפשרים לעקוף את ברירת המחדל לכל לקוח בנפרד.
				</p>
			</div>

			<Field
				label="Forced SEO Target URLs"
				hint="עמודים שתופסים תמיד כעמודי SEO, גם אם הם תואמים תבנית ברירת מחדל (למשל /contact שמכוון תנועה). URL מלא לכל שורה."
				name="seoForcedTargetUrls"
				defaultValue={initial.seoForcedTargetUrls.join("\n")}
				placeholder="https://example.com/contact"
			/>

			<Field
				label="Ignored URLs (exact)"
				hint="עמודים שהמערכת תתעלם מהם לגמרי. URL מלא לכל שורה."
				name="seoIgnoredUrls"
				defaultValue={initial.seoIgnoredUrls.join("\n")}
				placeholder="https://example.com/promo-2025"
			/>

			<Field
				label="Ignored URL Patterns"
				hint='תבניות נתיב להתעלמות. "/foo" חוסם /foo ו-/foo/anything. "/foo$" חוסם בדיוק /foo. שורה אחת לכל תבנית.'
				name="seoIgnoredPatterns"
				defaultValue={initial.seoIgnoredPatterns.join("\n")}
				placeholder="/coupon&#10;/landing-paid$"
			/>

			<details className="rounded-lg border border-ninja-line bg-ninja-panel/40 px-4 py-3">
				<summary className="cursor-pointer text-xs uppercase tracking-wider text-ink-dim">
					Default ignore patterns (read-only)
				</summary>
				<div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-ink-mute">
					<PatternList title="Utility / System" items={DEFAULT_UTILITY_PATTERNS} />
					<PatternList title="Legal" items={DEFAULT_LEGAL_PATTERNS} />
					<PatternList title="Trust / Accessibility" items={DEFAULT_TRUST_PATTERNS} />
					<PatternList title="Business Info" items={DEFAULT_BUSINESS_INFO_PATTERNS} />
				</div>
				<p className="mt-3 text-xs text-ink-mute">
					Business Info patterns (about / contact) הופכים ל-eligible אם ה-URL נמצא ב-Target Pages של הלקוח.
				</p>
			</details>

			<div className="flex items-center gap-3 pt-3 border-t border-ninja-line">
				<button
					type="submit"
					disabled={pending}
					className="inline-flex items-center gap-2 rounded-md border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold px-4 py-2 text-sm font-semibold disabled:opacity-60"
				>
					{pending ? (
						<>
							<Loader2 className="w-4 h-4 animate-spin" />
							שומר…
						</>
					) : (
						"שמירת SEO Scope"
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

function Field({
	label,
	hint,
	name,
	defaultValue,
	placeholder,
}: {
	label: string;
	hint: string;
	name: string;
	defaultValue: string;
	placeholder: string;
}) {
	return (
		<div className="space-y-1.5">
			<label className="text-sm text-ink block">{label}</label>
			<p className="text-xs text-ink-mute">{hint}</p>
			<textarea
				name={name}
				rows={4}
				defaultValue={defaultValue}
				placeholder={placeholder}
				className="w-full rounded-md border border-ninja-line bg-ninja-panel/60 px-3 py-2 text-sm text-ink font-mono"
				dir="ltr"
			/>
		</div>
	);
}

function PatternList({ title, items }: { title: string; items: string[] }) {
	return (
		<div>
			<div className="font-bold text-ink-dim mb-1.5">{title}</div>
			<ul className="space-y-0.5 font-mono">
				{items.map((p) => (
					<li key={p}>{p}</li>
				))}
			</ul>
		</div>
	);
}
