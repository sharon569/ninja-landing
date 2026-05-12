// Phase 15C.3 — visibility component for pages excluded from SEO scope.
// Server-renderable React (no "use client"). Takes a pre-computed
// PageClassification (so callers control which client config is in scope)
// and renders a small inline badge.

import { EyeOff } from "lucide-react";
import { SCOPE_LABEL, scopeBadgeTone, type PageClassification } from "@/lib/page-scope";

const TONE_CLASS: Record<ReturnType<typeof scopeBadgeTone>, string> = {
	good: "border-go/40 bg-go/10 text-go",
	warn: "border-gold/40 bg-gold/10 text-gold",
	bad: "border-blade/40 bg-blade/10 text-blade",
	neutral: "border-ninja-line bg-ninja-panel/60 text-ink-dim",
};

export function ScopeBadge({
	classification,
	variant = "full",
}: {
	classification: PageClassification;
	variant?: "full" | "compact";
}) {
	// Eligible pages don't need a visible marker — it's the default.
	if (classification.isSeoEligible) return null;

	const tone = scopeBadgeTone(classification.scope);
	const cls = TONE_CLASS[tone];
	const label =
		variant === "compact"
			? SCOPE_LABEL[classification.scope]
			: `לא נכלל באסטרטגיית SEO · ${SCOPE_LABEL[classification.scope]}`;

	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide ${cls}`}
			title={classification.reason}
		>
			<EyeOff className="w-3 h-3 shrink-0" />
			<span>{label}</span>
		</span>
	);
}

export function ScopeExplainer({
	classification,
	className = "",
}: {
	classification: PageClassification;
	className?: string;
}) {
	if (classification.isSeoEligible) return null;
	return (
		<div
			className={`rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-ink leading-relaxed flex items-start gap-3 ${className}`}
		>
			<EyeOff className="w-4 h-4 shrink-0 mt-0.5 text-gold" />
			<div>
				<div className="font-bold text-gold mb-0.5">{SCOPE_LABEL[classification.scope]}</div>
				<p>
					עמוד זה נסרק, אך לא נכלל באסטרטגיית SEO ולכן לא ייווצרו ממנו המלצות קידום
					(Opportunities / Briefs / Strategy / Execution).
				</p>
				<p className="text-ink-dim mt-1">
					סיבה: {classification.reason}. ניתן לעקוף ב-Settings → SEO Crawl Scope → Forced SEO Target URLs.
				</p>
			</div>
		</div>
	);
}
