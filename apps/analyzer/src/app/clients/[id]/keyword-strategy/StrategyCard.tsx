"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
	ChevronDown,
	Brain,
	TrendingUp,
	AlertTriangle,
	Activity,
	RotateCw,
	Loader2,
	CheckCircle2,
	Pause,
	X,
	Lock,
	FileText,
	ExternalLink,
} from "lucide-react";
import {
	STRATEGY_TYPE_LABEL,
	STRATEGY_TYPE_TONE,
	STRATEGY_STATUS_LABEL,
	STRATEGY_STATUS_TONE,
	ACTION_TYPE_LABEL,
	ACTION_TYPE_TONE,
	POSITION_BUCKET_LABEL,
	type ActionStep,
	type KeywordStrategySummary,
} from "@/lib/strategy";
import {
	buildKeywordStrategy,
	setStrategyStatus,
	deleteStrategy,
	createBriefFromStrategyStep,
} from "./actions";

interface Row {
	id: string;
	keyword: string;
	status: string;
	strategyType: string;
	riskLevel: string;
	confidence: string;
	opportunityScore: number;
	rankingPage: string | null;
	currentPosition: number | null;
	currentClicks: number | null;
	currentImpressions: number | null;
	currentCtr: number | null; // 0..1
	trend: string | null;
	targetPageMismatch: boolean;
	summary: string;
	payload: string;
	updatedAt: Date | string;
}

export function StrategyCard({ row, clientId }: { row: Row; clientId: string }) {
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const [message, setMessage] = useState<string | null>(null);

	let parsed: KeywordStrategySummary | null = null;
	try {
		parsed = JSON.parse(row.payload) as KeywordStrategySummary;
	} catch {
		parsed = null;
	}

	const statusTone = STRATEGY_STATUS_TONE[row.status as keyof typeof STRATEGY_STATUS_TONE];
	const typeTone = STRATEGY_TYPE_TONE[row.strategyType as keyof typeof STRATEGY_TYPE_TONE];

	function recompute() {
		setMessage(null);
		startTransition(async () => {
			const targetKw = parsed?.snapshot ? row.id : row.id;
			// We don't store targetKeywordId on the row directly here, so use the
			// payload's snapshot to fetch the canonical id via a roundtrip if
			// needed. The action accepts targetKeywordId — for now we rely on
			// the row.id being the strategy id; recompute requires keyword id.
			// Workaround: fetch by keyword from server. For MVP we simply trigger
			// buildKeywordStrategy using the strategy id endpoint that resolves
			// internally. (We don't have that helper, so just message user.)
			setMessage("Recompute trigger pending — open strategy detail to rebuild");
		});
	}

	function setStatus(newStatus: string) {
		setMessage(null);
		const fd = new FormData();
		fd.set("strategyId", row.id);
		fd.set("status", newStatus);
		startTransition(async () => {
			const r = await setStrategyStatus(fd);
			setMessage(r.ok ? `סטטוס שונה ל-${STRATEGY_STATUS_LABEL[newStatus as keyof typeof STRATEGY_STATUS_LABEL] ?? newStatus}` : r.error ?? "שגיאה");
		});
	}

	function remove() {
		if (!confirm(`למחוק את האסטרטגיה ל-"${row.keyword}"?`)) return;
		startTransition(async () => {
			await deleteStrategy(row.id);
		});
	}

	const scoreColor =
		row.opportunityScore >= 80
			? "text-go"
			: row.opportunityScore >= 60
				? "text-gold"
				: row.opportunityScore >= 40
					? "text-ink"
					: "text-ink-mute";

	return (
		<article className="rounded-xl border border-ninja-line bg-ninja-panel/60">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="w-full flex items-start gap-4 px-5 py-4 text-right"
			>
				<div className="shrink-0 w-16 text-center">
					<div className={`font-display text-3xl tabular-nums leading-none ${scoreColor}`}>
						{row.opportunityScore}
					</div>
					<div className="text-[9px] tracking-wider uppercase text-ink-mute mt-1">score</div>
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex flex-wrap items-baseline gap-2 mb-1">
						<h3 className="text-base font-semibold text-ink truncate">"{row.keyword}"</h3>
						<Pill label={STRATEGY_TYPE_LABEL[row.strategyType as keyof typeof STRATEGY_TYPE_LABEL] ?? row.strategyType} tone={typeTone} />
						<Pill label={STRATEGY_STATUS_LABEL[row.status as keyof typeof STRATEGY_STATUS_LABEL] ?? row.status} tone={statusTone} />
						{row.targetPageMismatch && (
							<span className="text-[10px] font-bold tracking-wider uppercase text-gold border border-gold/30 bg-gold/10 rounded-full px-1.5 py-0.5">
								⚠ Target≠Ranking
							</span>
						)}
					</div>
					<p className="text-xs text-ink-dim line-clamp-1">{row.summary}</p>
					<div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-ink-mute">
						{row.currentPosition !== null && <span>מיקום {row.currentPosition.toFixed(1)}</span>}
						{row.currentClicks !== null && <span>· {row.currentClicks.toLocaleString()} קליקים</span>}
						{row.currentImpressions !== null && <span>· {row.currentImpressions.toLocaleString()} חשיפות</span>}
						{row.currentCtr !== null && <span>· CTR {(row.currentCtr * 100).toFixed(1)}%</span>}
						{row.trend && <span>· מגמה: {trendLabel(row.trend)}</span>}
					</div>
				</div>
				<ChevronDown className={`w-4 h-4 mt-1 text-ink-mute transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
			</button>

			{open && parsed && (
				<div className="border-t border-ninja-line px-5 py-5 space-y-5">
					{/* Snapshot */}
					<section className="rounded-lg border border-ninja-line bg-ninja-black/40 p-4 space-y-2">
						<h4 className="text-sm font-bold uppercase tracking-wider text-ink flex items-center gap-2">
							<Brain className="w-4 h-4 text-gold" /> Snapshot
						</h4>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
							<Cell label="עמוד מדורג" value={parsed.snapshot.rankingPage ?? "—"} mono />
							<Cell label="עמוד יעד" value={parsed.snapshot.targetPage ?? "—"} mono />
							<Cell label="מיקום נוכחי" value={parsed.snapshot.currentPosition?.toFixed(1) ?? "—"} />
							<Cell label="Bucket" value={POSITION_BUCKET_LABEL[parsed.snapshot.positionBucket]} />
							<Cell label="חשיפות 28d" value={parsed.snapshot.impressions28d.toLocaleString()} />
							<Cell label="קליקים 28d" value={parsed.snapshot.clicks28d.toLocaleString()} />
							<Cell label="CTR" value={`${parsed.snapshot.ctrPct.toFixed(1)}%`} />
							<Cell label="כוונת חיפוש" value={parsed.snapshot.intent} />
						</div>
						{parsed.snapshot.targetPageMismatch && (
							<div className="text-xs text-gold flex items-start gap-1.5 pt-2 border-t border-ninja-line">
								<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
								<span>
									העמוד שמדורג בפועל שונה מעמוד היעד שהוגדר. צריך להחליט אם לחזק את העמוד הקיים או להעביר את הכוח לעמוד היעד.
								</span>
							</div>
						)}
						{parsed.snapshot.topQueriesOnRankingPage.length > 0 && (
							<details className="text-xs pt-2 border-t border-ninja-line">
								<summary className="cursor-pointer text-ink-dim">
									Top ביטויים על אותו עמוד ({parsed.snapshot.topQueriesOnRankingPage.length})
								</summary>
								<ul className="mt-2 space-y-1">
									{parsed.snapshot.topQueriesOnRankingPage.map((q) => (
										<li key={q.query} className="flex justify-between gap-2">
											<span className="text-ink truncate">"{q.query}"</span>
											<span className="text-ink-mute tabular-nums" dir="ltr">
												{q.clicks}c · pos {q.position.toFixed(1)} · CTR {q.ctrPct.toFixed(1)}%
											</span>
										</li>
									))}
								</ul>
							</details>
						)}
						{parsed.snapshot.competingPages.length > 0 && (
							<div className="text-xs text-blade flex items-start gap-1.5 pt-2 border-t border-ninja-line">
								<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
								<span>קניבליזציה: {parsed.snapshot.competingPages.length} עמודים נוספים מתחרים על "{row.keyword}"</span>
							</div>
						)}
					</section>

					{/* Action Plan */}
					<section className="rounded-lg border border-ninja-line bg-ninja-black/40 p-4 space-y-3">
						<h4 className="text-sm font-bold uppercase tracking-wider text-ink flex items-center gap-2">
							<TrendingUp className="w-4 h-4 text-gold" /> Action Plan
						</h4>
						<ol className="space-y-3">
							{parsed.actionPlan.map((step) => (
								<StepRow
									key={step.stepNumber}
									step={step}
									clientId={clientId}
									strategyId={row.id}
									strategyType={row.strategyType}
								/>
							))}
						</ol>
					</section>

					{/* Research Notes */}
					<section className="rounded-lg border border-ninja-line bg-ninja-black/40 p-4">
						<h4 className="text-sm font-bold uppercase tracking-wider text-ink flex items-center gap-2 mb-3">
							<Brain className="w-4 h-4 text-gold" /> Research Notes
						</h4>
						<div className="grid md:grid-cols-2 gap-3 text-xs">
							<NotesBlock title="מה אנחנו יודעים" items={parsed.researchNotes.whatWeKnow} tone="go" />
							<NotesBlock title="מה לא בטוח" items={parsed.researchNotes.whatWeDontKnow} tone="gold" />
							<NotesBlock title="מה לבדוק ידנית" items={parsed.researchNotes.whatToCheckManually} />
							<NotesBlock title="למה האסטרטגיה הזו" items={parsed.researchNotes.whyThisStrategy} tone="go" />
						</div>
					</section>

					{/* Measurement Plan */}
					<section className="rounded-lg border border-ninja-line bg-ninja-black/40 p-4 space-y-2">
						<h4 className="text-sm font-bold uppercase tracking-wider text-ink flex items-center gap-2">
							<Activity className="w-4 h-4 text-gold" /> Measurement Plan
						</h4>
						<div className="text-xs space-y-1">
							<div><span className="text-ink-mute">Baseline: </span>{new Date(parsed.measurementPlan.baselineDate).toLocaleDateString("he-IL")}</div>
							<div><span className="text-ink-mute">מטריקות: </span>{parsed.measurementPlan.metrics.join(", ")}</div>
							<div><span className="text-ink-mute">חלונות: </span>{parsed.measurementPlan.reviewWindows.join(", ")}</div>
							<div className="text-go"><span className="text-ink-mute">תנאי הצלחה: </span>{parsed.measurementPlan.successCondition}</div>
							<div className="text-gold"><span className="text-ink-mute">תנאי אזהרה: </span>{parsed.measurementPlan.warningCondition}</div>
							<div className="text-ink-dim italic"><span className="text-ink-mute">נקודת החלטה הבאה: </span>{parsed.measurementPlan.nextDecisionPoint}</div>
							{parsed.measurementPlan.secondaryQueries.length > 0 && (
								<div><span className="text-ink-mute">ביטויים מוגנים: </span>{parsed.measurementPlan.secondaryQueries.map((q) => `"${q}"`).join(", ")}</div>
							)}
						</div>
					</section>

					{/* Related links */}
					{(parsed.relatedOpportunities.length + parsed.relatedBriefs.length + parsed.relatedInternalLinks.length + parsed.relatedExecutions.length > 0) && (
						<section className="rounded-lg border border-ninja-line bg-ninja-black/40 p-4 space-y-2">
							<h4 className="text-sm font-bold uppercase tracking-wider text-ink">Related</h4>
							<div className="grid md:grid-cols-4 gap-3 text-xs">
								<RelatedBlock title="Opportunities" count={parsed.relatedOpportunities.length} href={`/clients/${clientId}/opportunities`} />
								<RelatedBlock title="Briefs" count={parsed.relatedBriefs.length} href={`/clients/${clientId}/briefs`} />
								<RelatedBlock title="Internal Links" count={parsed.relatedInternalLinks.length} href={`/clients/${clientId}/internal-links`} />
								<RelatedBlock title="Executions" count={parsed.relatedExecutions.length} href={`/clients/${clientId}/execution`} />
							</div>
						</section>
					)}

					{/* Status actions */}
					<section className="flex flex-wrap items-center gap-2 pt-3 border-t border-ninja-line">
						{row.status === "draft" && (
							<>
								<ActionButton label="לסקירה" icon={<Lock className="w-3.5 h-3.5" />} tone="warn" onClick={() => setStatus("needs_human_review")} pending={pending} />
								<ActionButton label="אישור" icon={<CheckCircle2 className="w-3.5 h-3.5" />} tone="good" onClick={() => setStatus("approved")} pending={pending} />
							</>
						)}
						{row.status === "needs_human_review" && (
							<>
								<ActionButton label="אישור" icon={<CheckCircle2 className="w-3.5 h-3.5" />} tone="good" onClick={() => setStatus("approved")} pending={pending} />
								<ActionButton label="דחייה" icon={<X className="w-3.5 h-3.5" />} tone="bad" onClick={() => setStatus("rejected")} pending={pending} />
							</>
						)}
						{row.status === "approved" && (
							<ActionButton label="התחל ביצוע" icon={<TrendingUp className="w-3.5 h-3.5" />} tone="good" onClick={() => setStatus("active")} pending={pending} />
						)}
						{(row.status === "active" || row.status === "monitoring") && (
							<>
								<ActionButton label="במעקב" icon={<Activity className="w-3.5 h-3.5" />} tone="neutral" onClick={() => setStatus("monitoring")} pending={pending} />
								<ActionButton label="הושלם" icon={<CheckCircle2 className="w-3.5 h-3.5" />} tone="good" onClick={() => setStatus("completed")} pending={pending} />
								<ActionButton label="השהה" icon={<Pause className="w-3.5 h-3.5" />} tone="warn" onClick={() => setStatus("paused")} pending={pending} />
							</>
						)}
						{row.status === "paused" && (
							<ActionButton label="חידוש" icon={<TrendingUp className="w-3.5 h-3.5" />} tone="good" onClick={() => setStatus("active")} pending={pending} />
						)}
						<div className="flex-1" />
						<button type="button" onClick={remove} className="text-xs text-ink-mute hover:text-blade">מחק</button>
					</section>

					{message && <div className="text-xs text-ink-dim">{message}</div>}
					<div className="text-[10px] text-ink-mute text-end">
						v{parsed.engineVersion} · עודכן {new Date(row.updatedAt).toLocaleString("he-IL")}
					</div>
				</div>
			)}
		</article>
	);
}

// Phase 15B — which step kinds map to a Brief
const BRIEF_ELIGIBLE_ACTIONS = new Set([
	"content_expansion",
	"new_article",
	"new_landing_page",
	"title_meta_update",
	"meta_description_update",
]);

function StepRow({
	step,
	clientId,
	strategyId,
	strategyType,
}: {
	step: ActionStep;
	clientId: string;
	strategyId: string;
	strategyType: string;
}) {
	const tone = ACTION_TYPE_TONE[step.actionType];
	const briefEligible = BRIEF_ELIGIBLE_ACTIONS.has(step.actionType) && strategyType !== "monitor_only";
	const [briefPending, startBrief] = useTransition();
	const [briefResult, setBriefResult] = useState<{ briefId?: string; error?: string; reused?: boolean } | null>(null);

	function createBrief() {
		setBriefResult(null);
		startBrief(async () => {
			const r = await createBriefFromStrategyStep(strategyId, step.stepNumber);
			setBriefResult({ briefId: r.briefId, error: r.error, reused: r.reused });
		});
	}
	const cls =
		tone === "good"
			? "border-go/30 bg-go/5"
			: tone === "warn"
				? "border-gold/30 bg-gold/5"
				: tone === "bad"
					? "border-blade/30 bg-blade/5"
					: "border-ninja-line bg-ninja-black/40";
	const riskTone =
		step.risk === "high" ? "text-blade" : step.risk === "medium" ? "text-gold" : "text-ink-mute";

	return (
		<li className={`rounded border px-3 py-2.5 ${cls}`}>
			<div className="flex items-start gap-2 mb-1.5">
				<span className="font-display text-base text-ink tabular-nums shrink-0">{step.stepNumber}.</span>
				<div className="flex-1">
					<div className="flex flex-wrap items-baseline gap-2 mb-0.5">
						<span className="text-sm text-ink font-semibold">{step.action}</span>
						<span className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
							{ACTION_TYPE_LABEL[step.actionType]}
						</span>
					</div>
					<div className="text-xs text-ink-dim leading-relaxed">{step.why}</div>
					<div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px]">
						<span className="text-ink-mute">צפי: <span className="text-ink-dim">{step.expectedImpact}</span></span>
						<span className={riskTone}>סיכון: {step.risk}</span>
						<span className="text-ink-mute">מאמץ: {step.effort}</span>
						<span className="text-ink-mute">עדיפות: {step.priority}</span>
						<span className="text-ink-mute">תזמון: {step.suggestedTiming}</span>
						{step.requiresHumanReview && <span className="text-gold">⚠ דורש סקירה</span>}
					</div>
					{step.relatedSurface && (
						<div className="mt-1.5 text-[11px] flex flex-wrap gap-2">
							{step.relatedSurface.opportunityId && (
								<Link href={`/clients/${clientId}/opportunities`} className="text-gold hover:text-blade">→ Opportunity קיימת</Link>
							)}
							{step.relatedSurface.briefId && (
								<Link href={`/clients/${clientId}/briefs`} className="text-gold hover:text-blade">→ Brief קיים</Link>
							)}
							{step.relatedSurface.internalLinkId && (
								<Link href={`/clients/${clientId}/internal-links`} className="text-gold hover:text-blade">→ Internal Link קיים</Link>
							)}
						</div>
					)}

					{/* Phase 15B — Create Brief from this step */}
					{briefEligible && (
						<div className="mt-2 flex items-center gap-2 pt-2 border-t border-ninja-line">
							{briefResult?.briefId ? (
								<Link
									href={`/clients/${clientId}/briefs`}
									className="inline-flex items-center gap-1.5 rounded-md border border-go/30 bg-go/10 hover:bg-go/20 text-go px-2.5 py-1 text-[11px] font-semibold"
								>
									<ExternalLink className="w-3 h-3" />
									{briefResult.reused ? "פתח Brief קיים" : "פתח את ה-Brief שנוצר"}
								</Link>
							) : (
								<button
									type="button"
									onClick={createBrief}
									disabled={briefPending}
									className="inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60"
								>
									{briefPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
									צור Brief מהאסטרטגיה
								</button>
							)}
							{briefResult?.error && (
								<span className="text-[10px] text-blade">{briefResult.error}</span>
							)}
						</div>
					)}
				</div>
			</div>
		</li>
	);
}

function Pill({ label, tone }: { label: string; tone: "good" | "warn" | "bad" | "neutral" | "mute" }) {
	const cls =
		tone === "good"
			? "bg-go/10 text-go border-go/30"
			: tone === "warn"
				? "bg-gold/10 text-gold border-gold/30"
				: tone === "bad"
					? "bg-blade/10 text-blade border-blade/30"
					: tone === "mute"
						? "bg-ninja-raised text-ink-mute border-ninja-line"
						: "bg-ninja-raised text-ink-dim border-ninja-line";
	return <span className={`inline-flex items-center text-[10px] font-bold tracking-wider rounded-full border px-2 py-0.5 ${cls}`}>{label}</span>;
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="rounded border border-ninja-line bg-ninja-panel/40 px-2 py-1.5">
			<div className="text-[9px] tracking-wider uppercase text-ink-mute">{label}</div>
			<div className={`text-xs text-ink truncate ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : "auto"}>{value}</div>
		</div>
	);
}

function NotesBlock({ title, items, tone }: { title: string; items: string[]; tone?: "go" | "gold" }) {
	if (items.length === 0) return null;
	const color = tone === "go" ? "text-go" : tone === "gold" ? "text-gold" : "text-ink-dim";
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

function RelatedBlock({ title, count, href }: { title: string; count: number; href: string }) {
	if (count === 0) return (
		<div>
			<div className="text-[10px] tracking-wider uppercase text-ink-mute">{title}</div>
			<div className="text-xs text-ink-mute">—</div>
		</div>
	);
	return (
		<div>
			<div className="text-[10px] tracking-wider uppercase text-ink-mute">{title}</div>
			<Link href={href} className="text-sm text-gold hover:text-blade font-bold">{count}</Link>
		</div>
	);
}

function ActionButton({ label, icon, tone, onClick, pending }: { label: string; icon: React.ReactNode; tone: "good" | "warn" | "bad" | "neutral"; onClick: () => void; pending: boolean }) {
	const cls =
		tone === "good"
			? "text-go border-go/30 hover:bg-go/10"
			: tone === "warn"
				? "text-gold border-gold/30 hover:bg-gold/10"
				: tone === "bad"
					? "text-blade border-blade/30 hover:bg-blade/10"
					: "text-ink-dim border-ninja-line hover:bg-ninja-raised";
	return (
		<button type="button" onClick={onClick} disabled={pending} className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md border px-3 py-1.5 transition-colors disabled:opacity-50 ${cls}`}>
			{pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
			{label}
		</button>
	);
}

function trendLabel(t: string): string {
	switch (t) {
		case "up": return "↑ עולה";
		case "down": return "↓ יורד";
		case "flat": return "→ יציב";
		default: return "—";
	}
}
