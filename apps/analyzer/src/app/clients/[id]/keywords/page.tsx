import { notFound } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { db } from "@/lib/db";
import {
	intentLabel,
	priorityLabel,
	priorityColor,
	statusLabel,
	statusTone,
	PRIORITY_ORDER,
} from "@/lib/keywords";
import { loadKeywordPerformance } from "@/lib/keywords-server";
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
									<th className="px-4 py-3 font-bold">עדיפות</th>
									<th className="px-4 py-3 font-bold">סטטוס</th>
									<th className="px-4 py-3 font-bold text-left">מיקום</th>
									<th className="px-4 py-3 font-bold text-left">חשיפות</th>
									<th className="px-4 py-3 font-bold text-left">קליקים</th>
									<th className="px-4 py-3 font-bold text-left">CTR</th>
									<th className="px-4 py-3 font-bold">עמוד יעד</th>
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
