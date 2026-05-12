import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, RefreshCw, Clock, AlertTriangle, FileText, Target, Sparkles, Activity, Heart } from "lucide-react";
import { db } from "@/lib/db";
import { runScan } from "@/app/actions";
import { ClientProfileCard } from "@/components/ClientProfileCard";
import { priorityBand } from "@/lib/opportunities";
import { calcProfileCompletion } from "@/lib/profile";
import { calcHealthScore } from "@/lib/health-score";

export const dynamic = "force-dynamic";

interface InfoCached {
	plugin_version?: string;
	wp_version?: string;
	php_version?: string;
	multisite?: boolean;
	sites_count?: number;
	yoast_active?: boolean;
	yoast_version?: string | null;
	woocommerce_active?: boolean;
	woocommerce_version?: string | null;
}

interface ScanSummary {
	urls_total?: number;
	products?: number;
	findings_count?: number;
	findings_total_affected?: number;
}

function timeAgo(date: Date | null): string {
	if (!date) return "אף פעם";
	const ms = Date.now() - date.getTime();
	const min = Math.floor(ms / 60_000);
	if (min < 1) return "ממש עכשיו";
	if (min < 60) return `לפני ${min} דק׳`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `לפני ${hr} שע׳`;
	const d = Math.floor(hr / 24);
	return `לפני ${d} ימים`;
}

export default async function ClientOverviewPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const client = await db.client.findUnique({
		where: { id },
		include: {
			scans: {
				orderBy: { ranAt: "desc" },
				take: 1,
				include: {
					findings: {
						orderBy: [{ severity: "asc" }, { count: "desc" }],
						take: 3,
					},
				},
			},
			targetKeywords: {
				select: { id: true, status: true, priority: true },
			},
			opportunities: {
				where: { status: { in: ["detected", "recommended", "needs_human_review", "approved"] } },
				orderBy: { priorityScore: "desc" },
				take: 1,
				select: { id: true, title: true, priorityScore: true, type: true },
			},
		},
	});
	if (!client) notFound();

	const opps = await db.opportunity.findMany({
		where: {
			clientId: id,
			status: { in: ["detected", "recommended", "needs_human_review", "approved"] },
		},
		select: { priorityScore: true, status: true },
	});
	const oppCounts = {
		total: opps.length,
		high: opps.filter((o) => priorityBand(o.priorityScore).bucket === "high").length,
		quick: opps.filter((o) => priorityBand(o.priorityScore).bucket === "quick").length,
	};
	const topOpp = client.opportunities[0];

	// Impact tracking summary
	const monitoringOpps = await db.opportunity.findMany({
		where: { clientId: id, status: { in: ["monitoring", "manually_applied", "impact_reviewed"] } },
		select: { id: true },
	});
	const allReviews = await db.impactReview.findMany({
		where: { clientId: id },
		select: { result: true },
	});
	const impactCounts = {
		monitoring: monitoringOpps.length,
		improved: allReviews.filter((r) => r.result === "improved").length,
		neutral: allReviews.filter((r) => r.result === "neutral").length,
		declined: allReviews.filter((r) => r.result === "declined").length,
		notEnoughData: allReviews.filter((r) => r.result === "not_enough_data" || r.result === "needs_more_time").length,
	};

	// SEO Health Score
	const completion = calcProfileCompletion(client);
	const highSeverityCount = client.scans[0]?.findings.filter((f) => f.severity === "high").length ?? 0;
	const totalKw = await db.targetKeyword.count({ where: { clientId: id } });
	const gscRowCount = await db.gscDailyRow.count({ where: { clientId: id } });
	const lastGscDate = await db.gscDailyRow.findFirst({
		where: { clientId: id },
		orderBy: { fetchedAt: "desc" },
		select: { fetchedAt: true },
	});
	const gscFreshDays = lastGscDate
		? Math.floor((Date.now() - new Date(lastGscDate.fetchedAt).getTime()) / 86_400_000)
		: null;

	const health = calcHealthScore({
		profileCompletionPct: completion.percent,
		openOpportunities: opps.length,
		highImpactOpen: oppCounts.high,
		highSeverityFindings: highSeverityCount,
		hasKeywordBank: totalKw > 0,
		hasGscSync: gscRowCount > 0,
		gscFreshDays,
		monitoringCount: impactCounts.monitoring,
		improvedReviews: impactCounts.improved,
	});

	// Keyword summary
	const kwTotal = client.targetKeywords.length;
	const kwActive = client.targetKeywords.filter(
		(k) => k.status === "active" || k.status === "ranking",
	).length;
	const kwTopPriority = client.targetKeywords.filter(
		(k) => k.priority === "high" || k.priority === "critical",
	).length;

	const info: InfoCached = client.lastInfo ? JSON.parse(client.lastInfo) : {};
	const latestScan = client.scans[0];
	const summary: ScanSummary | null = latestScan?.summary
		? JSON.parse(latestScan.summary)
		: null;

	const runScanWithId = runScan.bind(null, client.id);

	return (
		<div className="space-y-8">
			{/* SEO Health Score — top of the page */}
			<section className="rounded-xl border border-ninja-line bg-ninja-panel/60 overflow-hidden">
				<div className="px-5 py-4 flex flex-wrap items-center justify-between gap-6">
					<div className="flex items-center gap-4">
						<div
							className="w-14 h-14 rounded-full flex items-center justify-center font-display text-2xl tabular-nums"
							style={{
								background: `conic-gradient(${health.bandColor} ${health.score * 3.6}deg, rgba(255,255,255,0.05) 0)`,
								color: health.bandColor,
							}}
						>
							<div className="w-11 h-11 rounded-full bg-ninja-panel flex items-center justify-center">
								<span style={{ color: health.bandColor }}>{health.score}</span>
							</div>
						</div>
						<div>
							<div className="text-[10px] font-bold tracking-[0.25em] uppercase text-ink-mute">
								SEO Health Score
							</div>
							<div className="font-display text-xl mt-0.5" style={{ color: health.bandColor }}>
								{health.bandLabel}
							</div>
						</div>
					</div>
					<details className="text-xs">
						<summary className="cursor-pointer text-ink-dim hover:text-ink">
							הפירוט שמרכיב את הציון
						</summary>
						<div className="absolute mt-2 w-72 rounded-lg border border-ninja-line bg-ninja-panel shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-3 z-10 space-y-1.5">
							{health.breakdown.map((b) => (
								<div key={b.label} className="flex items-center justify-between text-xs">
									<span className="text-ink-dim">{b.label}</span>
									<span className="text-ink tabular-nums">
										{b.points}/{b.max}
									</span>
								</div>
							))}
						</div>
					</details>
				</div>
			</section>

			{/* SEO Profile summary */}
			<ClientProfileCard
				clientId={client.id}
				profile={{
					vertical: client.vertical,
					language: client.language,
					country: client.country,
					serviceAreas: client.serviceAreas,
					seoGoals: client.seoGoals,
					targetPages: client.targetPages,
					competitors: client.competitors,
					brandVoice: client.brandVoice,
					automationLevel: client.automationLevel,
					requireApprovalFor: client.requireApprovalFor,
				}}
			/>

			{/* Opportunities card */}
			<Link
				href={`/clients/${id}/opportunities`}
				className="group block rounded-xl border border-ninja-line bg-ninja-panel/60 px-5 py-4 hover:border-ninja-line-strong transition-colors"
			>
				<div className="flex items-center justify-between gap-6">
					<div className="flex items-center gap-3">
						<div className="w-9 h-9 rounded-lg bg-ninja-raised border border-ninja-line flex items-center justify-center">
							<Sparkles className="w-4 h-4 text-gold" />
						</div>
						<div>
							<div className="text-[10px] font-bold tracking-[0.25em] uppercase text-ink-mute">
								SEO Opportunities
							</div>
							<div className="text-sm text-ink mt-0.5">
								{oppCounts.total === 0 ? (
									<span className="text-ink-dim">לא הורצה ניתוח עדיין — לחץ לעבור לעמוד</span>
								) : (
									<>
										<span className="font-semibold">{oppCounts.total}</span> פעילות
										{oppCounts.high > 0 && (
											<>
												{" · "}
												<span className="text-blade">{oppCounts.high}</span> High Impact
											</>
										)}
										{oppCounts.quick > 0 && (
											<>
												{" · "}
												<span className="text-gold">{oppCounts.quick}</span> Quick Wins
											</>
										)}
									</>
								)}
							</div>
						</div>
					</div>
					<ArrowRight className="w-4 h-4 text-ink-mute group-hover:text-gold transition-colors" />
				</div>
				{topOpp && (
					<div className="mt-3 pt-3 border-t border-ninja-line">
						<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mb-1">
							הפעולה החשובה ביותר השבוע
						</div>
						<div className="flex items-baseline gap-3">
							<span
								className="font-display text-lg tabular-nums"
								style={{ color: priorityBand(topOpp.priorityScore).color }}
							>
								{topOpp.priorityScore}
							</span>
							<span className="text-sm text-ink">{topOpp.title}</span>
						</div>
					</div>
				)}
			</Link>

			{/* Impact Tracking card */}
			{impactCounts.monitoring > 0 && (
				<Link
					href={`/clients/${id}/impact`}
					className="group flex items-center justify-between gap-6 rounded-xl border border-ninja-line bg-ninja-panel/60 px-5 py-4 hover:border-ninja-line-strong transition-colors"
				>
					<div className="flex items-center gap-3">
						<div className="w-9 h-9 rounded-lg bg-ninja-raised border border-ninja-line flex items-center justify-center">
							<Activity className="w-4 h-4 text-go" />
						</div>
						<div>
							<div className="text-[10px] font-bold tracking-[0.25em] uppercase text-ink-mute">
								Impact Tracking
							</div>
							<div className="text-sm text-ink mt-0.5">
								<span className="font-semibold">{impactCounts.monitoring}</span> פעולות במעקב
								{impactCounts.improved > 0 && (
									<>
										{" · "}
										<span className="text-go">{impactCounts.improved}</span> השתפרו
									</>
								)}
								{impactCounts.declined > 0 && (
									<>
										{" · "}
										<span className="text-blade">{impactCounts.declined}</span> ירדו
									</>
								)}
								{impactCounts.notEnoughData > 0 && (
									<>
										{" · "}
										<span className="text-ink-mute">{impactCounts.notEnoughData}</span> אין מספיק נתונים
									</>
								)}
							</div>
						</div>
					</div>
					<ArrowRight className="w-4 h-4 text-ink-mute group-hover:text-gold transition-colors" />
				</Link>
			)}

			{/* Keyword bank chips */}
			<Link
				href={`/clients/${id}/keywords`}
				className="group flex items-center justify-between gap-6 rounded-xl border border-ninja-line bg-ninja-panel/60 px-5 py-4 hover:border-ninja-line-strong transition-colors"
			>
				<div className="flex items-center gap-3">
					<div className="w-9 h-9 rounded-lg bg-ninja-raised border border-ninja-line flex items-center justify-center">
						<Target className="w-4 h-4 text-gold" />
					</div>
					<div>
						<div className="text-[10px] font-bold tracking-[0.25em] uppercase text-ink-mute">
							Keyword Bank
						</div>
						<div className="text-sm text-ink mt-0.5">
							{kwTotal === 0 ? (
								<span className="text-ink-dim">עדיין אין מילות יעד — לחץ להוספה</span>
							) : (
								<>
									<span className="font-semibold">{kwTotal}</span> מילות מפתח ·{" "}
									<span className="text-go">{kwActive}</span> פעילות
									{kwTopPriority > 0 && (
										<>
											{" · "}
											<span className="text-blade">{kwTopPriority}</span> עדיפות גבוהה/קריטית
										</>
									)}
								</>
							)}
						</div>
					</div>
				</div>
				<ArrowRight className="w-4 h-4 text-ink-mute group-hover:text-gold transition-colors" />
			</Link>

			{/* Connection meta — compact strip, not a wall of cards */}
			<dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
				<MetaItem
					label="הגדרה"
					value={info.multisite ? `Multisite · ${info.sites_count ?? "?"} אתרים` : "אתר יחיד"}
				/>
				<MetaItem
					label="WordPress"
					value={info.wp_version ? `${info.wp_version}` : "—"}
				/>
				<MetaItem
					label="Yoast"
					value={info.yoast_active ? (info.yoast_version ?? "פעיל") : "לא מותקן"}
				/>
				<MetaItem
					label="WooCommerce"
					value={info.woocommerce_active ? (info.woocommerce_version ?? "פעיל") : "לא מותקן"}
				/>
			</dl>

			{/* Hero card: last scan + run-scan action */}
			{summary && latestScan ? (
				<section className="rounded-xl border border-ninja-line bg-ninja-panel/60 p-8">
					<div className="flex items-start justify-between gap-6">
						<div className="space-y-1">
							<div className="flex items-center gap-2 text-xs text-ink-dim">
								<Clock className="w-3.5 h-3.5" />
								סריקה אחרונה {timeAgo(latestScan.ranAt)}
							</div>
							<h2 className="text-xl font-semibold text-ink">
								{summary.urls_total?.toLocaleString() ?? 0} דפים נסרקו
							</h2>
							<p className="text-sm text-ink-dim">
								{summary.products?.toLocaleString() ?? 0} מוצרים · הסריקה נמשכה {(latestScan.durationMs / 1000).toFixed(1)} שניות
							</p>
						</div>
						<form action={runScanWithId}>
							<button
								type="submit"
								className="inline-flex items-center gap-2 rounded-md bg-blade px-4 py-2 text-sm text-white hover:opacity-90"
							>
								<RefreshCw className="w-3.5 h-3.5" />
								הרצת סריקה
							</button>
						</form>
					</div>
				</section>
			) : (
				<section className="rounded-xl border-2 border-dashed border-ninja-line-strong bg-ninja-panel/60 px-8 py-16 text-center">
					<div className="mx-auto max-w-md space-y-4">
						<h2 className="text-lg font-medium text-ink">מוכן לסריקה הראשונה</h2>
						<p className="text-sm text-ink-dim">
							שואב את כל הדפים באתר דרך ה-REST API של הפלאגאין, מריץ את כללי האודיט, ומציג את הממצאים.
						</p>
						<form action={runScanWithId}>
							<button
								type="submit"
								className="inline-flex items-center gap-2 rounded-md bg-blade px-5 py-2.5 text-sm text-white hover:opacity-90"
							>
								<RefreshCw className="w-3.5 h-3.5" />
								להריץ סריקה ראשונה
							</button>
						</form>
					</div>
				</section>
			)}

			{/* Top issues — preview only (top 3), with link to full list */}
			{latestScan && latestScan.findings.length > 0 && (
				<section className="space-y-3">
					<div className="flex items-baseline justify-between">
						<h2 className="text-sm font-medium text-ink uppercase tracking-wider">
							ממצאים מובילים
						</h2>
						<Link
							href={`/clients/${id}/issues`}
							className="inline-flex items-center gap-1 text-sm text-ink-dim hover:text-ink"
						>
							לכל {summary?.findings_count ?? latestScan.findings.length} הממצאים
							<ArrowRight className="w-3.5 h-3.5 rotate-180" />
						</Link>
					</div>
					<div className="space-y-2">
						{latestScan.findings.slice(0, 3).map((f) => {
							const finding = JSON.parse(f.payload) as {
								title: string;
								description: string;
							};
							return (
								<Link
									key={f.id}
									href={`/clients/${id}/issues/${f.id}`}
									className="block rounded-lg border border-ninja-line bg-ninja-panel/60 p-4 hover:border-ninja-line-strong transition-colors group"
								>
									<div className="flex items-start gap-4">
										<SeverityBadge severity={f.severity} />
										<div className="flex-1 min-w-0">
											<div className="flex items-baseline justify-between gap-4">
												<h3 className="text-sm font-medium text-ink group-hover:text-ink">
													{finding.title}
												</h3>
												<span className="text-sm font-semibold text-ink tabular-nums">
													{f.count.toLocaleString()}
												</span>
											</div>
											<p className="text-xs text-ink-dim mt-1 line-clamp-1">
												{finding.description}
											</p>
										</div>
									</div>
								</Link>
							);
						})}
					</div>
				</section>
			)}

			{/* Pulled-from-the-plugin notes — only when nothing's run yet, brief context */}
			{!latestScan && (
				<section className="rounded-lg bg-ninja-raised px-5 py-4 text-xs text-ink-dim flex items-start gap-3">
					<FileText className="w-4 h-4 mt-0.5 shrink-0 text-ink-mute" />
					<div>
						<div className="font-medium text-ink mb-0.5">מה נשאב</div>
						<p>
							כל פוסט, דף ומוצר ציבוריים. מטא של Yoast (כותרת, תיאור, canonical, מילת מפתח ממוקדת, סכמה). מטריקות תוכן (H1, טקסט חלופי, ספירת קישורים). דאטה של מוצרי WooCommerce. טקסונומיות ותפריטים. אחרי השליפה רצים כללי האודיט על התוצאה.
						</p>
					</div>
				</section>
			)}

			{/* Subtle warning if plugin reported any issues during the scan */}
			{latestScan && summary && (summary as { warnings?: number }).warnings ? (
				<div className="rounded-md border border-gold/30 bg-gold/10 px-4 py-3 text-xs text-gold flex items-start gap-2">
					<AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
					הפלאגאין דיווח על {(summary as { warnings?: number }).warnings} אזהרות בסריקה האחרונה. לפרטים, ראה הגדרות.
				</div>
			) : null}
		</div>
	);
}

function MetaItem({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<dt className="text-xs text-ink-dim uppercase tracking-wider">{label}</dt>
			<dd className="text-sm font-medium text-ink mt-0.5">{value}</dd>
		</div>
	);
}

const SEVERITY_DOT: Record<string, string> = {
	high: "bg-blade",
	medium: "bg-gold",
	low: "bg-sky-400",
	info: "bg-zinc-400",
};

function SeverityBadge({ severity }: { severity: string }) {
	return (
		<div className="flex items-center gap-2 pt-0.5">
			<span
				className={`w-2 h-2 rounded-full ${SEVERITY_DOT[severity] ?? SEVERITY_DOT.info}`}
			/>
			<span className="text-xs uppercase tracking-wider text-ink-dim">{severity}</span>
		</div>
	);
}
