"use client";

import { useState, useTransition } from "react";
import { Brain, AlertTriangle, CheckCircle2, Lock, Loader2, ShieldCheck } from "lucide-react";
import {
	BADGE_LABEL,
	BADGE_TONE,
	CONFIDENCE_LABEL,
	NEXT_STEP_LABEL,
	NEXT_STEP_TONE,
	RISK_LABEL,
	RISK_REASON_LABEL,
	RISK_TONE,
	type DecisionSummary,
} from "@/lib/decision";
import { markOpportunityReviewed } from "./actions";

interface Props {
	decision: DecisionSummary;
	opportunityId: string;
	alreadyReviewed: boolean;
}

export function DecisionCard({ decision, opportunityId, alreadyReviewed }: Props) {
	const [showReview, setShowReview] = useState(false);
	const [note, setNote] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	function submitReview() {
		const form = new FormData();
		form.set("opportunityId", opportunityId);
		form.set("note", note);
		startTransition(async () => {
			const r = await markOpportunityReviewed(form);
			if (r.ok) {
				setMessage("סומן כ-Reviewed");
				setShowReview(false);
			} else {
				setMessage(r.error ?? "שמירה נכשלה");
			}
		});
	}

	const badgeTone = BADGE_TONE[decision.badge];
	const badgeCls =
		badgeTone === "good"
			? "bg-go/10 text-go border-go/30"
			: badgeTone === "warn"
				? "bg-gold/10 text-gold border-gold/30"
				: badgeTone === "bad"
					? "bg-blade/10 text-blade border-blade/30"
					: "bg-ninja-raised text-ink-dim border-ninja-line";

	return (
		<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 p-4 space-y-4">
			<div className="flex items-start justify-between gap-3 flex-wrap">
				<div className="flex items-center gap-2">
					<Brain className="w-4 h-4 text-gold" />
					<h3 className="text-sm font-bold uppercase tracking-wider text-ink">
						Decision Summary
					</h3>
					<span className={`text-[10px] font-bold tracking-wider rounded-full border px-2 py-0.5 ${badgeCls}`}>
						{BADGE_LABEL[decision.badge]}
					</span>
				</div>
				<div className="flex items-center gap-3 text-[10px] text-ink-mute">
					<span>{RISK_LABEL[decision.riskLevel]}</span>
					<span>·</span>
					<span>{CONFIDENCE_LABEL[decision.confidence]}</span>
				</div>
			</div>

			<div className="text-sm text-ink">{decision.recommendation}</div>

			{/* Why this is better */}
			{decision.whyThisIsBetter ? (
				<div className="rounded border border-go/20 bg-go/5 px-3 py-2">
					<div className="text-[10px] tracking-wider uppercase text-go mb-1">למה זו המלצה טובה?</div>
					<div className="text-xs text-ink leading-relaxed whitespace-pre-line">
						{decision.whyThisIsBetter}
					</div>
				</div>
			) : (
				<div className="rounded border border-blade/30 bg-blade/10 px-3 py-2 text-xs text-blade">
					המערכת לא הצליחה לבנות הסבר עם נתונים שמצדיק את השינוי. לכן ההמלצה הופנתה ל-research_needed או monitor.
				</div>
			)}

			{/* Why not / risks */}
			{decision.whyNot.possibleRisks.length > 0 && (
				<div className="rounded border border-gold/30 bg-gold/5 px-3 py-2">
					<div className="text-[10px] tracking-wider uppercase text-gold mb-1 flex items-center gap-1">
						<AlertTriangle className="w-3 h-3" /> מה יכול להשתבש?
					</div>
					<ul className="text-xs text-ink-dim space-y-0.5 list-disc ms-4">
						{decision.whyNot.possibleRisks.map((r, i) => (
							<li key={i}>{r}</li>
						))}
					</ul>
					{decision.whyNot.whatToProtect.length > 0 && (
						<div className="mt-1.5 text-xs text-ink-dim">
							<span className="text-ink-mute">לשמור על: </span>
							{decision.whyNot.whatToProtect.join(" · ")}
						</div>
					)}
				</div>
			)}

			{/* Safer alternative */}
			{decision.saferAlternative && (
				<div className="rounded border border-ninja-line bg-ninja-black/40 px-3 py-2">
					<div className="text-[10px] tracking-wider uppercase text-ink-dim mb-1">חלופה בטוחה יותר</div>
					<div className="text-xs text-ink mb-1">{decision.saferAlternative.summary}</div>
					<ol className="text-xs text-ink-dim space-y-0.5 list-decimal ms-4">
						{decision.saferAlternative.steps.map((s, i) => (
							<li key={i}>{s}</li>
						))}
					</ol>
				</div>
			)}

			{/* Evidence */}
			{decision.primaryQuery && (
				<div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
					<EvidenceCell label="ביטוי" value={`"${decision.primaryQuery.query}"`} />
					<EvidenceCell label="חשיפות" value={decision.primaryQuery.impressions.toLocaleString()} />
					<EvidenceCell label="קליקים" value={decision.primaryQuery.clicks.toLocaleString()} />
					<EvidenceCell label="CTR" value={`${decision.primaryQuery.ctrPct.toFixed(1)}%`} />
					<EvidenceCell label="מיקום" value={decision.primaryQuery.position.toFixed(1)} />
				</div>
			)}

			{/* Query portfolio */}
			{decision.queryPortfolio && decision.queryPortfolio.topQueries.length > 0 && (
				<details className="rounded border border-ninja-line bg-ninja-black/40">
					<summary className="text-[10px] tracking-wider uppercase text-ink-dim cursor-pointer px-3 py-2">
						תיק ביטויים של העמוד · {decision.queryPortfolio.topQueries.length} ביטויים מובילים
					</summary>
					<div className="px-3 pb-3 space-y-1.5 text-xs">
						{decision.queryPortfolio.topQueries.map((q) => (
							<div key={q.query} className="flex items-baseline justify-between gap-2">
								<span className="text-ink truncate">"{q.query}"</span>
								<span className="text-ink-mute tabular-nums shrink-0" dir="ltr">
									{q.clicks}c · {q.impressions}i · CTR {q.ctrPct.toFixed(1)}% · pos {q.position.toFixed(1)}
								</span>
							</div>
						))}
						{decision.queryPortfolio.dominantQuery && (
							<div className="text-[11px] text-gold mt-2">
								⚠ {(decision.queryPortfolio.dominantShare * 100).toFixed(0)}% מהקליקים מגיעים מ-"{decision.queryPortfolio.dominantQuery.query}"
							</div>
						)}
					</div>
				</details>
			)}

			{/* Research notes */}
			<details className="rounded border border-ninja-line bg-ninja-black/40">
				<summary className="text-[10px] tracking-wider uppercase text-ink-dim cursor-pointer px-3 py-2 flex items-center gap-1">
					<Brain className="w-3 h-3" /> Research Notes
				</summary>
				<div className="px-3 pb-3 grid md:grid-cols-2 gap-3 text-xs">
					<ResearchBlock title="מה אנחנו יודעים" items={decision.researchNotes.whatWeKnow} tone="good" />
					<ResearchBlock title="מה עדיין לא בטוח" items={decision.researchNotes.whatWeDontKnow} tone="warn" />
					<ResearchBlock title="למה ההמלצה קיימת" items={decision.researchNotes.whyThisAction} />
					<ResearchBlock title="למה צריך להיזהר" items={decision.researchNotes.whyThisIsRisky} tone="warn" />
					<ResearchBlock title="מה לבדוק ידנית" items={decision.researchNotes.whatToCheckManually} />
					<ResearchBlock title="איך נמדוד הצלחה" items={decision.researchNotes.howWeMeasureSuccess} tone="good" />
				</div>
			</details>

			{/* Risk reasons */}
			{decision.riskReasons.length > 0 && (
				<div className="text-[11px] text-ink-mute flex flex-wrap gap-1.5">
					{decision.riskReasons.map((r) => (
						<span key={r} className="rounded-full border border-ninja-line px-2 py-0.5" title={RISK_REASON_LABEL[r]}>
							{r}
						</span>
					))}
				</div>
			)}

			{/* Measurement plan */}
			{decision.measurementPlan.primaryQuery && (
				<div className="rounded border border-ninja-line bg-ninja-black/40 px-3 py-2 text-xs">
					<div className="text-[10px] tracking-wider uppercase text-ink-dim mb-1">תוכנית מדידה</div>
					<div className="text-ink mb-1">
						מדד עיקרי: <strong>{decision.measurementPlan.primaryMetric}</strong> · חלונות:{" "}
						{decision.measurementPlan.windows.join(", ")}
					</div>
					<div className="text-ink-dim mb-1">צפי: {decision.measurementPlan.expectedOutcome}</div>
					<div className="text-ink-mute">אות כשל: {decision.measurementPlan.failureSignal}</div>
				</div>
			)}

			{/* Human Review CTA */}
			{decision.needsHumanReview && !alreadyReviewed && (
				<div className="rounded border border-gold/30 bg-gold/10 px-3 py-3 space-y-2">
					<div className="flex items-center gap-2 text-xs text-gold">
						<ShieldCheck className="w-4 h-4" />
						<strong>נדרשת סקירה אנושית.</strong> אחרי שתסקור — לחץ "סמן כ-Reviewed" כדי לפתוח Execute.
					</div>
					{!showReview ? (
						<button
							type="button"
							onClick={() => setShowReview(true)}
							className="text-xs rounded-md border border-gold/40 bg-gold/15 hover:bg-gold/25 text-gold px-3 py-1.5"
						>
							סמן כ-Reviewed
						</button>
					) : (
						<div className="space-y-2">
							<textarea
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="הערה אופציונלית — למה הסכמת לבצע למרות הסיכון?"
								rows={2}
								className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-2 py-1.5 text-xs text-ink"
							/>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={submitReview}
									disabled={pending}
									className="inline-flex items-center gap-1.5 rounded-md border border-go/40 bg-go/15 hover:bg-go/25 text-go px-3 py-1.5 text-xs disabled:opacity-60"
								>
									{pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
									אשר סקירה
								</button>
								<button
									type="button"
									onClick={() => setShowReview(false)}
									className="text-xs text-ink-mute hover:text-ink"
								>
									ביטול
								</button>
								{message && <span className="text-[11px] text-ink-dim">{message}</span>}
							</div>
						</div>
					)}
				</div>
			)}
			{alreadyReviewed && (
				<div className="text-xs text-go flex items-center gap-1.5">
					<CheckCircle2 className="w-3.5 h-3.5" /> סומן כ-Reviewed — Execute פתוח
				</div>
			)}

			{/* Bottom line */}
			<div className="text-[10px] text-ink-mute flex items-baseline justify-between border-t border-ninja-line pt-2">
				<span>
					המלצה: <span className={`text-${NEXT_STEP_TONE[decision.recommendedNextStep]}`}>{NEXT_STEP_LABEL[decision.recommendedNextStep]}</span>
				</span>
				<span dir="ltr">v{decision.engineVersion} · {new Date(decision.computedAt).toLocaleString("he-IL")}</span>
			</div>
		</div>
	);
}

function EvidenceCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded border border-ninja-line bg-ninja-black/40 px-2 py-1.5">
			<div className="text-[9px] tracking-wider uppercase text-ink-mute">{label}</div>
			<div className="text-xs text-ink tabular-nums truncate" dir="ltr">{value}</div>
		</div>
	);
}

function ResearchBlock({
	title,
	items,
	tone = "neutral",
}: {
	title: string;
	items: string[];
	tone?: "good" | "warn" | "neutral";
}) {
	if (items.length === 0) return null;
	const color =
		tone === "good" ? "text-go" : tone === "warn" ? "text-gold" : "text-ink-dim";
	return (
		<div>
			<div className={`text-[10px] tracking-wider uppercase mb-1 ${color}`}>{title}</div>
			<ul className="space-y-0.5 list-disc ms-4 text-ink-dim">
				{items.map((it, i) => (
					<li key={i} className="text-[11px] leading-snug">{it}</li>
				))}
			</ul>
		</div>
	);
}
