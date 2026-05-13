import { notFound } from "next/navigation";
import { ExternalLink, Search, Target, AlertTriangle, Compass } from "lucide-react";
import { db } from "@/lib/db";
import {
	intentLabel,
	priorityLabel,
	priorityColor,
	statusLabel,
	statusTone,
	keywordGoalLabel,
	businessValueLabel,
	PRIORITY_ORDER,
} from "@/lib/keywords";
import { loadKeywordPerformance } from "@/lib/keywords-server";
import {
	MASTER_PAGE_TYPE_LABEL,
	MASTER_PAGE_CONFIDENCE_LABEL,
	MASTER_PAGE_CONFIDENCE_TONE,
	RECOMMENDED_ACTION_LABEL,
	RECOMMENDED_ACTION_TONE,
	type MasterPageType,
	type MasterPageConfidence,
	type RecommendedPageAction,
} from "@/lib/master-page";
import { AddForms } from "./AddForms";
import { RowActions } from "./RowActions";

export const dynamic = "force-dynamic";

export default async function KeywordsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const client = await db.client.findUnique({
		where: { id },
		include: {
			targetKeywords: {
				orderBy: [{ createdAt: "desc" }],
			},
		},
	});
	if (!client) notFound();

	// Stable sort: priority (critical→low) then created date (new first)
	const keywords = [...client.targetKeywords].sort((a, b) => {
		const pa = PRIORITY_ORDER[a.priority] ?? 9;
		const pb = PRIORITY_ORDER[b.priority] ?? 9;
		if (pa !== pb) return pa - pb;
		return b.createdAt.getTime() - a.createdAt.getTime();
	});

	// Load GSC perf (matched by exact `query = keyword.toLowerCase()`)
	const perf = await loadKeywordPerformance(
		id,
		keywords.map((k) => k.keyword),
	);

	// Summary counters
	const counts = {
		total: keywords.length,
		active: keywords.filter((k) => k.status === "active" || k.status === "ranking").length,
		highOrCritical: keywords.filter((k) => k.priority === "high" || k.priority === "critical").length,
		withGsc: keywords.filter((k) => (perf.get(k.keyword)?.impressions ?? 0) > 0).length,
	};

	// Phase 15D.-1 — Master Page status counters
	const masterPageCounts = {
		withMasterPage: keywords.filter((k) => k.masterPage).length,
		highConfidence: keywords.filter((k) => k.masterPageConfidence === "high").length,
		needsReview: keywords.filter((k) => k.recommendedPageAction === "human_review" || k.recommendedPageAction === "choose_master_page").length,
		typeMismatch: keywords.filter((k) => k.pageTypeMismatch).length,
		manualOverride: keywords.filter((k) => k.masterPageManualOverride).length,
	};

	// Phase 15E.1 — Strategic goal coverage counters. The Brain does NOT yet
	// use these — they're captured here so the operator can fill them in
	// before 15E.2 wires them into Strategy/Brief logic.
	const activeKeywords = keywords.filter((k) => k.status === "active" || k.status === "ranking");
	const goalCounts = {
		withGoal: keywords.filter((k) => k.keywordGoal).length,
		withoutGoal: activeKeywords.filter((k) => !k.keywordGoal).length,
		withBusinessValue: keywords.filter((k) => k.businessValue).length,
	};

	return (
		<div className="space-y-8">
			{/* Header */}
			<div className="space-y-1">
				<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full mb-2">
					KEYWORD BANK
				</span>
				<h1 className="font-display text-3xl text-ink">
					מילות מפתח <span className="text-brand-gradient">יעד</span>
				</h1>
				<p className="text-sm text-ink-dim max-w-2xl mt-2">
					כאן מגדירים את מילות המפתח שהלקוח רוצה לקדם. בהמשך המערכת תצליב אותן עם Search Console ותציע פעולות SEO לפי ביצועים, מיקום וכוונת חיפוש.
				</p>
			</div>

			{/* Summary chips */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<SummaryChip label="סה״כ מילים" value={counts.total} />
				<SummaryChip label="פעילות" value={counts.active} tone={counts.active > 0 ? "good" : "neutral"} />
				<SummaryChip label="עדיפות גבוהה/קריטית" value={counts.highOrCritical} tone="warn" />
				<SummaryChip label="עם נתוני GSC" value={counts.withGsc} tone={counts.withGsc > 0 ? "good" : "mute"} />
			</div>

			{/* Master Page Status */}
			<section className="rounded-xl border border-gold/20 bg-gold/5 p-4 space-y-3">
				<div className="flex items-center gap-2">
					<Target className="w-5 h-5 text-gold" />
					<h2 className="text-sm font-bold tracking-wider uppercase text-gold">
						Master Page Status
					</h2>
				</div>
				<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
					<SummaryChip
						label="עם Master Page"
						value={masterPageCounts.withMasterPage}
						tone={masterPageCounts.withMasterPage === counts.total ? "good" : "warn"}
					/>
					<SummaryChip
						label="ביטחון גבוה"
						value={masterPageCounts.highConfidence}
						tone="good"
					/>
					<SummaryChip
						label="דורש סקירה"
						value={masterPageCounts.needsReview}
						tone={masterPageCounts.needsReview > 0 ? "warn" : "neutral"}
					/>
					<SummaryChip
						label="Type Mismatch"
						value={masterPageCounts.typeMismatch}
						tone={masterPageCounts.typeMismatch > 0 ? "bad" : "neutral"}
					/>
					<SummaryChip
						label="Manual Override"
						value={masterPageCounts.manualOverride}
						tone={masterPageCounts.manualOverride > 0 ? "good" : "mute"}
					/>
				</div>
				<p className="text-xs text-ink-dim leading-relaxed">
					Master Page הוא העמוד המרכזי שאמור להוביל את הקידום של מילת המפתח. ה-resolver בוחר אותו לפי targetUrl,
					scan match, וסוג העמוד שגוגל מדרג. ה-refresh button מעדכן את כל הערכים.
				</p>
			</section>

			{/* Phase 15E.1 — Strategic Goals coverage */}
			<section className="rounded-xl border border-blade/20 bg-blade/5 p-4 space-y-3">
				<div className="flex items-center gap-2">
					<Compass className="w-5 h-5 text-blade" />
					<h2 className="text-sm font-bold tracking-wider uppercase text-blade">
						Strategic Goals · Phase 15E.1
					</h2>
				</div>
				<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
					<SummaryChip
						label="עם מטרת קידום"
						value={goalCounts.withGoal}
						tone={goalCounts.withGoal > 0 ? "good" : "mute"}
					/>
					<SummaryChip
						label="פעילות ללא Goal"
						value={goalCounts.withoutGoal}
						tone={goalCounts.withoutGoal === 0 ? "good" : "warn"}
					/>
					<SummaryChip
						label="עם ערך עסקי"
						value={goalCounts.withBusinessValue}
						tone={goalCounts.withBusinessValue > 0 ? "good" : "mute"}
					/>
				</div>
				<p className="text-xs text-ink-dim leading-relaxed">
					כל מילת מפתח יכולה לקבל מטרת קידום (improve_rank, defend_top3, וכו׳) דרך כפתור עריכה.
					כרגע השדה נשמר בלבד — ה-Brain עדיין לא מתעדף actions לפיו (יחל ב-15E.2).
				</p>
			</section>

			{/* Add forms */}
			<AddForms clientId={id} />

			{/* Table */}
			{keywords.length === 0 ? (
				<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-8 py-16 text-center">
					<Search className="w-8 h-8 mx-auto text-gold mb-3" />
					<h2 className="font-display text-xl text-ink mb-2">עדיין אין מילות מפתח</h2>
					<p className="text-sm text-ink-dim">
						הוסף את המילים שהלקוח רוצה לקדם — תוכל להוסיף בודדת מלמעלה או רבות בבת אחת.
					</p>
				</div>
			) : (
				<section className="space-y-3">
					<h2 className="text-xs font-bold tracking-[0.2em] uppercase text-ink-dim">
						רשימת מילים · ממוינות לפי עדיפות
					</h2>
					<div className="overflow-x-auto rounded-xl border border-ninja-line bg-ninja-panel/40">
						<table className="w-full text-sm">
							<thead className="bg-ninja-raised text-xs uppercase tracking-wider text-ink-dim text-right">
								<tr>
									<th className="px-4 py-3 font-bold">מילת מפתח</th>
									<th className="px-4 py-3 font-bold">כוונה</th>
									<th className="px-4 py-3 font-bold">מטרה</th>
									<th className="px-4 py-3 font-bold">עדיפות</th>
									<th className="px-4 py-3 font-bold">סטטוס</th>
									<th className="px-4 py-3 font-bold text-left">מיקום</th>
									<th className="px-4 py-3 font-bold text-left">חשיפות</th>
									<th className="px-4 py-3 font-bold text-left">קליקים</th>
									<th className="px-4 py-3 font-bold text-left">CTR</th>
									<th className="px-4 py-3 font-bold">עמוד יעד</th>
									<th className="px-4 py-3 font-bold">Master Page</th>
									<th className="px-4 py-3 font-bold">פעולה מומלצת</th>
									<th className="px-4 py-3 font-bold w-1 text-center">פעולות</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-ninja-line">
								{keywords.map((k) => {
									const p = perf.get(k.keyword);
									const hasGsc = (p?.impressions ?? 0) > 0;
									return (
										<tr key={k.id} className="hover:bg-ninja-raised/30 transition-colors">
											<td className="px-4 py-3 align-top">
												<div className="font-semibold text-ink">{k.keyword}</div>
												{k.notes && (
													<div className="text-[11px] text-ink-mute mt-0.5 line-clamp-1">
														{k.notes}
													</div>
												)}
											</td>
											<td className="px-4 py-3 align-top text-ink-dim">
												{intentLabel(k.intent)}
											</td>
											<td className="px-4 py-3 align-top">
												{k.keywordGoal ? (
													<span
														className="inline-flex items-center text-[10px] font-bold tracking-wider rounded-full border bg-blade/10 text-blade border-blade/30 px-2 py-0.5"
														title={k.businessValue ? businessValueLabel(k.businessValue) : undefined}
													>
														{keywordGoalLabel(k.keywordGoal)}
													</span>
												) : (
													<span className="text-[10px] text-ink-mute">— ללא —</span>
												)}
											</td>
											<td className="px-4 py-3 align-top">
												<span
													className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase rounded-full px-2 py-0.5"
													style={{
														color: priorityColor(k.priority),
														borderColor: priorityColor(k.priority) + "55",
														border: "1px solid",
														background: priorityColor(k.priority) + "12",
													}}
												>
													{priorityLabel(k.priority)}
												</span>
											</td>
											<td className="px-4 py-3 align-top">
												<StatusBadge value={k.status} />
											</td>
											<td className="px-4 py-3 align-top text-left tabular-nums">
												{hasGsc ? p!.position.toFixed(1) : <Dash />}
											</td>
											<td className="px-4 py-3 align-top text-left tabular-nums text-ink-dim">
												{hasGsc ? p!.impressions.toLocaleString() : <Dash />}
											</td>
											<td className="px-4 py-3 align-top text-left tabular-nums">
												{hasGsc ? p!.clicks.toLocaleString() : <Dash />}
											</td>
											<td className="px-4 py-3 align-top text-left tabular-nums text-ink-dim">
												{hasGsc ? `${(p!.ctr * 100).toFixed(1)}%` : <Dash />}
											</td>
											<td className="px-4 py-3 align-top">
												{k.targetUrl ? (
													<a
														href={k.targetUrl}
														target="_blank"
														rel="noopener noreferrer"
														className="inline-flex items-center gap-1 text-xs text-gold hover:text-blade font-mono truncate max-w-[160px]"
														dir="ltr"
													>
														{hostOf(k.targetUrl)}
														<ExternalLink className="w-3 h-3 flex-shrink-0" />
													</a>
												) : (
													<Dash />
												)}
											</td>
											<td className="px-4 py-3 align-top">
												<MasterPageCell
													masterPage={k.masterPage}
													masterPageType={k.masterPageType as MasterPageType | null}
													masterPageConfidence={k.masterPageConfidence as MasterPageConfidence | null}
													pageTypeMismatch={k.pageTypeMismatch ?? false}
												/>
											</td>
											<td className="px-4 py-3 align-top">
												{k.recommendedPageAction ? (
													<RecommendedActionPill action={k.recommendedPageAction as RecommendedPageAction} />
												) : (
													<Dash />
												)}
											</td>
											<td className="px-4 py-3 align-top text-center">
												<RowActions
													row={{
														id: k.id,
														keyword: k.keyword,
														intent: k.intent,
														priority: k.priority,
														targetUrl: k.targetUrl,
														status: k.status,
														notes: k.notes,
														businessValue: k.businessValue,
														keywordGoal: k.keywordGoal,
														keywordGoalNote: k.keywordGoalNote,
													}}
												/>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					<p className="text-[11px] text-ink-mute mt-2 leading-relaxed">
						ביצועי GSC: צבירה של כל הימים ב-28 הימים האחרונים שנסכרנו, התאמה לפי <code className="text-gold">query = keyword</code> בדיוק.
						התאמה ל-page-level תתווסף ב-Phase 3.
					</p>
				</section>
			)}
		</div>
	);
}

function hostOf(url: string): string {
	try {
		return new URL(url).pathname || new URL(url).host;
	} catch {
		return url;
	}
}

function Dash() {
	return <span className="text-ink-mute">—</span>;
}

function MasterPageCell({
	masterPage,
	masterPageType,
	masterPageConfidence,
	pageTypeMismatch,
}: {
	masterPage: string | null;
	masterPageType: MasterPageType | null;
	masterPageConfidence: MasterPageConfidence | null;
	pageTypeMismatch: boolean;
}) {
	if (!masterPage) return <Dash />;
	const tone = masterPageConfidence
		? MASTER_PAGE_CONFIDENCE_TONE[masterPageConfidence]
		: "neutral";
	const cls =
		tone === "good"
			? "bg-go/10 text-go border-go/30"
			: tone === "warn"
				? "bg-gold/10 text-gold border-gold/30"
				: tone === "bad"
					? "bg-blade/10 text-blade border-blade/30"
					: "bg-ninja-raised text-ink-dim border-ninja-line";
	return (
		<div className="space-y-1 max-w-[200px]">
			<a
				href={masterPage}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1 text-xs text-gold hover:text-blade font-mono truncate max-w-full"
				dir="ltr"
			>
				{(() => {
					try {
						return decodeURIComponent(new URL(masterPage).pathname);
					} catch {
						return masterPage;
					}
				})()}
				<ExternalLink className="w-3 h-3 flex-shrink-0" />
			</a>
			<div className="flex items-center gap-1 flex-wrap">
				{masterPageType && (
					<span className="inline-flex items-center text-[9px] font-bold tracking-wider rounded-full border bg-ninja-raised text-ink-dim border-ninja-line px-1.5 py-0.5">
						{MASTER_PAGE_TYPE_LABEL[masterPageType]}
					</span>
				)}
				{masterPageConfidence && (
					<span className={`inline-flex items-center text-[9px] font-bold tracking-wider rounded-full border px-1.5 py-0.5 ${cls}`}>
						{MASTER_PAGE_CONFIDENCE_LABEL[masterPageConfidence]}
					</span>
				)}
				{pageTypeMismatch && (
					<span className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider rounded-full border bg-blade/10 text-blade border-blade/30 px-1.5 py-0.5">
						<AlertTriangle className="w-2.5 h-2.5" />
						Mismatch
					</span>
				)}
			</div>
		</div>
	);
}

function RecommendedActionPill({ action }: { action: RecommendedPageAction }) {
	const tone = RECOMMENDED_ACTION_TONE[action];
	const cls =
		tone === "good"
			? "bg-go/10 text-go border-go/30"
			: tone === "warn"
				? "bg-gold/10 text-gold border-gold/30"
				: tone === "bad"
					? "bg-blade/10 text-blade border-blade/30"
					: "bg-ninja-raised text-ink-dim border-ninja-line";
	return (
		<span className={`inline-flex items-center text-[10px] font-bold tracking-wider rounded-full border px-2 py-0.5 ${cls}`}>
			{RECOMMENDED_ACTION_LABEL[action]}
		</span>
	);
}

function SummaryChip({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: number;
	tone?: "neutral" | "good" | "warn" | "bad" | "mute";
}) {
	const color =
		tone === "good"
			? "text-go"
			: tone === "warn"
				? "text-gold"
				: tone === "bad"
					? "text-blade"
					: tone === "mute"
						? "text-ink-mute"
						: "text-ink";
	return (
		<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 px-4 py-3">
			<div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-mute">
				{label}
			</div>
			<div className={`font-display text-2xl tabular-nums mt-1 ${color}`}>
				{value}
			</div>
		</div>
	);
}

function StatusBadge({ value }: { value: string }) {
	const tone = statusTone(value);
	const bg =
		tone === "good"
			? "bg-go/10 text-go border-go/30"
			: tone === "warn"
				? "bg-gold/10 text-gold border-gold/30"
				: tone === "bad"
					? "bg-blade/10 text-blade border-blade/30"
					: tone === "mute"
						? "bg-ninja-raised text-ink-mute border-ninja-line"
						: "bg-ninja-raised text-ink-dim border-ninja-line";
	return (
		<span
			className={`inline-flex items-center text-[11px] font-bold tracking-wider rounded-full border px-2 py-0.5 ${bg}`}
		>
			{statusLabel(value)}
		</span>
	);
}
