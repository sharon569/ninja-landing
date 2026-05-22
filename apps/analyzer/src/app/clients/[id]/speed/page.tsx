import { Zap, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { getSpeedSummary } from "@/lib/pagespeed-server";
import { CWV_LABELS, CWV_COLORS, cwvRating } from "@/lib/pagespeed";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function cwvIcon(status: string | null) {
	if (!status) return <span className="text-ink-mute">—</span>;
	if (status === "good") return <CheckCircle2 className="w-4 h-4 text-go inline" />;
	if (status === "needs-improvement") return <AlertTriangle className="w-4 h-4 text-gold inline" />;
	return <XCircle className="w-4 h-4 text-blade inline" />;
}

export default async function SpeedPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const summary = await getSpeedSummary(id);

	// Get all latest scores for the table
	const scores = await db.pageSpeedScore.findMany({
		where: { clientId: id, strategy: "mobile" },
		orderBy: { fetchedAt: "desc" },
		take: 50,
	});

	// Dedupe: latest per pageUrl
	const seen = new Set<string>();
	const latestScores = scores.filter((s) => {
		if (seen.has(s.pageUrl)) return false;
		seen.add(s.pageUrl);
		return true;
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Zap className="w-5 h-5 text-gold" />
				<h2 className="text-xl font-bold text-ink">מהירות</h2>
			</div>

			{summary.pagesAudited === 0 ? (
				<div className="rounded-xl border border-ninja-line bg-ninja-card p-8 text-center">
					<p className="text-ink-dim">אין נתוני מהירות עדיין.</p>
					<p className="text-xs text-ink-mute mt-2">
						הגדר PSI_ENABLED=true ו-PSI_API_KEY, ואז הרץ סריקה טכנית.
					</p>
				</div>
			) : (
				<>
					{/* Summary Cards */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<ScoreCard label="מובייל" score={summary.avgMobileScore} />
						<ScoreCard label="דסקטופ" score={summary.avgDesktopScore} />
						<div className="rounded-xl border border-ninja-line bg-ninja-card p-4">
							<p className="text-xs text-ink-mute mb-1">דפים שנבדקו</p>
							<p className="text-2xl font-bold text-ink">{summary.pagesAudited}</p>
						</div>
						<div className="rounded-xl border border-ninja-line bg-ninja-card p-4">
							<p className="text-xs text-ink-mute mb-1">עדכון אחרון</p>
							<p className="text-sm text-ink-dim">
								{summary.lastFetchedAt
									? new Date(summary.lastFetchedAt).toLocaleDateString("he-IL")
									: "—"}
							</p>
						</div>
					</div>

					{/* Core Web Vitals */}
					<div className="rounded-xl border border-ninja-line bg-ninja-card p-5">
						<h3 className="text-sm font-semibold text-ink mb-4">Core Web Vitals</h3>
						<div className="grid grid-cols-3 gap-6">
							<CwvMetric label="LCP" status={summary.cwvStatus.lcp} unit="שניות" />
							<CwvMetric label="INP" status={summary.cwvStatus.inp} unit="ms" />
							<CwvMetric label="CLS" status={summary.cwvStatus.cls} unit="" />
						</div>
					</div>

					{/* Pages Table */}
					{latestScores.length > 0 && (
						<div className="rounded-xl border border-ninja-line bg-ninja-card p-5">
							<h3 className="text-sm font-semibold text-ink mb-4">ציוני דפים (מובייל)</h3>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="text-ink-mute border-b border-ninja-line text-xs">
											<th className="text-start py-2 px-2">עמוד</th>
											<th className="text-start py-2 px-2">ציון</th>
											<th className="text-start py-2 px-2">LCP</th>
											<th className="text-start py-2 px-2">INP</th>
											<th className="text-start py-2 px-2">CLS</th>
										</tr>
									</thead>
									<tbody>
										{latestScores.map((s) => {
											const scoreTone = s.performanceScore >= 90 ? "text-go" : s.performanceScore >= 50 ? "text-gold" : "text-blade";
											return (
												<tr key={s.id} className="border-b border-ninja-line/50">
													<td className="py-2 px-2 text-ink-dim font-mono text-xs max-w-[300px] truncate" dir="ltr">
														{new URL(s.pageUrl).pathname}
													</td>
													<td className={`py-2 px-2 font-bold ${scoreTone}`}>
														{Math.round(s.performanceScore)}
													</td>
													<td className="py-2 px-2 text-xs">
														{s.lcp != null ? `${s.lcp.toFixed(1)}s` : "—"}
													</td>
													<td className="py-2 px-2 text-xs">
														{s.inp != null ? `${Math.round(s.inp)}ms` : "—"}
													</td>
													<td className="py-2 px-2 text-xs">
														{s.cls != null ? s.cls.toFixed(2) : "—"}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}

function ScoreCard({ label, score }: { label: string; score: number | null }) {
	const tone = score === null ? "text-ink-mute" : score >= 90 ? "text-go" : score >= 50 ? "text-gold" : "text-blade";
	return (
		<div className="rounded-xl border border-ninja-line bg-ninja-card p-4">
			<p className="text-xs text-ink-mute mb-1">{label}</p>
			<p className={`text-3xl font-bold ${tone}`}>{score ?? "—"}</p>
		</div>
	);
}

function CwvMetric({ label, status, unit }: { label: string; status: string | null; unit: string }) {
	return (
		<div>
			<div className="flex items-center gap-2 mb-1">
				{cwvIcon(status)}
				<span className="text-sm font-medium text-ink">{label}</span>
			</div>
			<p className={`text-xs ${status ? (CWV_COLORS[status] || "text-ink-mute") : "text-ink-mute"}`}>
				{status ? CWV_LABELS[status] : "אין נתונים"}
			</p>
		</div>
	);
}
