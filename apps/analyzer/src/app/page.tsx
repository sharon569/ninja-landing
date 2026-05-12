import Link from "next/link";
import {
	ArrowLeft,
	Plus,
	Globe,
	AlertTriangle,
	CheckCircle2,
	TrendingUp,
	Inbox,
	Activity,
	ShieldAlert,
	BookOpen,
	Clock,
	Bot,
} from "lucide-react";
import { loadAgencyDashboard } from "@/lib/agency-server";
import { bandToneClass, type ClientSummary, type HealthBandFilter } from "@/lib/agency";
import { priorityBand } from "@/lib/opportunities";
import { db } from "@/lib/db";
import { runStatusLabel, runStatusTone } from "@/lib/automation";
import { AgencyFilters } from "./AgencyFilters";

export const dynamic = "force-dynamic";

interface SearchParams {
	q?: string;
	health?: HealthBandFilter;
	vertical?: string;
	pending?: string;
	high?: string;
	staleGsc?: string;
}

function ago(d: string | null): string {
	if (!d) return "אף פעם";
	const ms = Date.now() - new Date(d).getTime();
	const min = Math.floor(ms / 60_000);
	if (min < 60) return `לפני ${min} דק׳`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `לפני ${hr} שע׳`;
	const days = Math.floor(hr / 24);
	return `לפני ${days} ימים`;
}

export default async function AgencyDashboard({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	const sp = await searchParams;
	const [data, lastAgencyRun] = await Promise.all([
		loadAgencyDashboard(),
		db.automationRun.findFirst({
			where: { runType: "agency_auto_sync" },
			orderBy: { startedAt: "desc" },
			select: {
				id: true,
				status: true,
				summary: true,
				startedAt: true,
				finishedAt: true,
				durationMs: true,
				error: true,
			},
		}),
	]);

	if (data.clients.length === 0) {
		return (
			<div className="max-w-lg mx-auto pt-24 text-center">
				<div className="mx-auto w-16 h-16 rounded-2xl bg-ninja-panel border border-ninja-line flex items-center justify-center mb-6">
					<Plus className="w-7 h-7 text-gold" />
				</div>
				<h1 className="font-display text-3xl text-ink mb-3">
					אין עדיין <span className="text-brand-gradient">לקוחות</span>
				</h1>
				<p className="text-sm text-ink-dim leading-relaxed mb-8 max-w-sm mx-auto">
					התקן את הפלאגאין{" "}
					<code className="text-[12px] bg-ninja-raised border border-ninja-line text-gold px-1.5 py-0.5 rounded">
						agency-seo-scanner
					</code>{" "}
					על אתר וורדפרס, ואז חבר אותו כאן.
				</p>
				<Link
					href="/clients/new"
					className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold text-white shadow-[0_6px_18px_rgba(255,42,60,0.35)] hover:shadow-[0_8px_22px_rgba(255,42,60,0.45)]"
					style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
				>
					הוספת הלקוח הראשון
					<ArrowLeft className="w-4 h-4" />
				</Link>
			</div>
		);
	}

	// Apply filters
	const q = (sp.q ?? "").toLowerCase();
	const filtered = data.clients.filter((c) => {
		if (q && !c.name.toLowerCase().includes(q) && !c.host.toLowerCase().includes(q)) return false;
		if (sp.health && c.healthBand !== sp.health) return false;
		if (sp.vertical && c.vertical !== sp.vertical) return false;
		if (sp.pending === "1" && c.openOpps + c.briefsPending + c.linksSuggested === 0) return false;
		if (sp.high === "1" && c.highImpactOpps === 0) return false;
		if (sp.staleGsc === "1") {
			if (!c.lastGscRowFetchedAt) return true;
			const days = Math.floor(
				(Date.now() - new Date(c.lastGscRowFetchedAt).getTime()) / 86_400_000,
			);
			if (days < 14) return false;
		}
		return true;
	});

	return (
		<div className="space-y-10">
			{/* Header */}
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full mb-3">
						AGENCY COMMAND CENTER
					</span>
					<h1 className="font-display text-4xl text-ink">
						מרכז <span className="text-brand-gradient">פיקוד</span>
					</h1>
					<p className="text-sm text-ink-dim mt-2 max-w-2xl">
						מבט-על על כל הלקוחות — מי דורש טיפול עכשיו, איפה יש High Impact, איפה תקועים אישורים, ואיפה רואים שיפור.
					</p>
				</div>
			</div>

			{/* Top overview cards */}
			<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
				<Chip label="לקוחות פעילים" value={data.totals.activeClients} />
				<Chip label="ממוצע Health" value={`${data.totals.avgHealthScore}`} tone={data.totals.avgHealthScore >= 70 ? "good" : data.totals.avgHealthScore >= 50 ? "warn" : "bad"} />
				<Chip label="Workflow פתוח" value={data.totals.totalWorkflowOpen} />
				<Chip label="High Impact" value={data.totals.totalHighImpact} tone="bad" />
				<Chip label="דורש סקירה" value={data.totals.totalNeedsReview} tone="warn" />
				<Chip label="במעקב" value={data.totals.totalMonitoring} tone="good" />
				<Chip label="טכני חמור" value={data.totals.totalTechCritical} tone="bad" />
				<Chip label="בריפים לסקירה" value={data.totals.totalBriefsPending} tone="warn" />
			</div>

			{/* Automation Status */}
			<AutomationStatusCard run={lastAgencyRun} />

			{/* Health band distribution */}
			<HealthBandStrip totals={data.totals} totalClients={data.clients.length} />

			{/* Attention Required */}
			{data.attention.length > 0 && (
				<section className="space-y-4">
					<div className="flex items-baseline justify-between">
						<h2 className="font-display text-xl text-ink">
							דורש תשומת לב <span className="text-brand-gradient">השבוע</span>
						</h2>
						<span className="text-xs text-ink-mute">{data.attention.length} לקוחות</span>
					</div>
					<div className="grid gap-3">
						{data.attention.map((a) => (
							<Link
								key={a.clientId}
								href={`/clients/${a.clientId}/workflow`}
								className="flex items-start gap-4 rounded-xl border border-ninja-line bg-ninja-panel/60 px-5 py-4 hover:border-ninja-line-strong transition-colors group"
							>
								<div className="shrink-0 w-14 text-center">
									<div
										className="font-display text-2xl tabular-nums leading-none"
										style={{
											color:
												a.urgencyScore >= 60
													? "#ff2a3c"
													: a.urgencyScore >= 30
														? "#ffd166"
														: "#a8acb6",
										}}
									>
										{a.urgencyScore}
									</div>
									<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mt-1">
										urgency
									</div>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
										<h3 className="font-display text-base text-ink">{a.clientName}</h3>
										<span className="text-xs text-ink-mute font-mono">{a.host}</span>
										<HealthPill score={a.healthScore} band={a.healthBand} />
									</div>
									<ul className="text-sm text-ink-dim space-y-0.5">
										{a.reasons.map((r, i) => (
											<li key={i}>· {r}</li>
										))}
									</ul>
								</div>
								<ArrowLeft className="w-4 h-4 text-ink-mute group-hover:text-gold transition-colors" />
							</Link>
						))}
					</div>
				</section>
			)}

			{/* Cross-Client Priority Queue */}
			{data.queue.length > 0 && (
				<section className="space-y-4">
					<div className="flex items-baseline justify-between">
						<h2 className="font-display text-xl text-ink">
							התור החשוב <span className="text-brand-gradient">ביותר עכשיו</span>
						</h2>
						<span className="text-xs text-ink-mute">{data.queue.length} פריטים</span>
					</div>
					<div className="rounded-xl border border-ninja-line bg-ninja-panel/40 overflow-hidden">
						<div className="max-h-[480px] overflow-y-auto divide-y divide-ninja-line">
							{data.queue.map((q) => (
								<Link
									key={q.id}
									href={q.link}
									className="flex items-start gap-4 px-5 py-3 hover:bg-ninja-raised/40 transition-colors group"
								>
									<div className="shrink-0 w-10 text-center">
										<div
											className="font-display text-base tabular-nums"
											style={{ color: priorityBand(q.priorityScore).color }}
										>
											{q.priorityScore}
										</div>
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-baseline gap-2 flex-wrap">
											<span className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
												{q.clientName}
											</span>
											<SourcePill source={q.sourceType} />
											{q.needsDecision && (
												<span className="text-[10px] font-bold tracking-wider uppercase text-gold border border-gold/30 bg-gold/10 rounded-full px-1.5 py-0.5">
													דורש החלטה
												</span>
											)}
										</div>
										<div className="text-sm text-ink truncate mt-0.5">{q.title}</div>
									</div>
								</Link>
							))}
						</div>
					</div>
				</section>
			)}

			{/* Execution roll-up (Phase 12) — read-only */}
			{data.execution.clientsExecutionEnabled > 0 && (
				<section className="space-y-4">
					<div className="flex items-baseline justify-between flex-wrap gap-3">
						<h2 className="font-display text-xl text-ink">
							<span className="text-brand-gradient">Execution</span>
						</h2>
						<span className="text-[10px] text-ink-mute">מבט-על · ביצוע ידני בלבד דרך דף הלקוח</span>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
						<Bottleneck label="לקוחות עם Execution דלוק" value={data.execution.clientsExecutionEnabled} icon={<AlertTriangle className="w-4 h-4" />} />
						<Bottleneck label="ממתינים לאישור Execute" value={data.execution.awaitingExecute} icon={<AlertTriangle className="w-4 h-4" />} tone="warn" />
						<Bottleneck label="Dry Run נכשל/לא טרי" value={data.execution.dryRunFailed} icon={<AlertTriangle className="w-4 h-4" />} tone={data.execution.dryRunFailed > 0 ? "warn" : "neutral"} />
						<Bottleneck label="בוצעו השבוע" value={data.execution.executedLast7d} icon={<CheckCircle2 className="w-4 h-4" />} />
						<Bottleneck label="Rollback זמין" value={data.execution.rollbackAvailable} icon={<Clock className="w-4 h-4" />} />
					</div>
				</section>
			)}

			{/* Bottlenecks */}
			<section className="space-y-4">
				<h2 className="font-display text-xl text-ink">
					איפה <span className="text-brand-gradient">תקועים</span>
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					<Bottleneck label="ממתינים לאישור (Opportunities)" value={data.bottlenecks.awaitingApprovalOpps} icon={<Inbox className="w-4 h-4" />} />
					<Bottleneck label="בריפים לסקירה" value={data.bottlenecks.briefsAwaitingReview} icon={<BookOpen className="w-4 h-4" />} />
					<Bottleneck label="קישורים לאישור" value={data.bottlenecks.linksAwaitingReview} icon={<ArrowLeft className="w-4 h-4" />} />
					<Bottleneck label="אושרו, לא בוצעו" value={data.bottlenecks.approvedNotApplied} icon={<CheckCircle2 className="w-4 h-4" />} tone="warn" />
					<Bottleneck label="ממתינים ל-Impact Review" value={data.bottlenecks.monitoringAwaitingReview} icon={<Activity className="w-4 h-4" />} />
					<Bottleneck label="בלי GSC sync" value={data.bottlenecks.clientsWithoutGscSync} icon={<TrendingUp className="w-4 h-4" />} tone="warn" />
					<Bottleneck label="בלי Keyword Bank" value={data.bottlenecks.clientsWithoutKeywordBank} icon={<AlertTriangle className="w-4 h-4" />} />
				</div>
			</section>

			{/* Client Matrix */}
			<section className="space-y-4">
				<div className="flex flex-wrap items-baseline justify-between gap-3">
					<h2 className="font-display text-xl text-ink">
						מטריצת <span className="text-brand-gradient">לקוחות</span>
					</h2>
					<Link
						href="/clients/new"
						className="inline-flex items-center gap-1.5 text-xs text-blade hover:text-gold"
					>
						<Plus className="w-3.5 h-3.5" />
						הוספת לקוח
					</Link>
				</div>
				<AgencyFilters />
				{filtered.length === 0 ? (
					<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-8 py-12 text-center text-sm text-ink-dim">
						אין לקוחות שתואמים לסינון.
					</div>
				) : (
					<div className="rounded-xl border border-ninja-line bg-ninja-panel/40 overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="bg-ninja-raised text-xs uppercase tracking-wider text-ink-dim">
								<tr>
									<th className="px-3 py-2.5 text-right font-bold">לקוח</th>
									<th className="px-3 py-2.5 font-bold">Health</th>
									<th className="px-3 py-2.5 font-bold text-right">פתוח</th>
									<th className="px-3 py-2.5 font-bold text-right">High</th>
									<th className="px-3 py-2.5 font-bold text-right">דורש סקירה</th>
									<th className="px-3 py-2.5 font-bold text-right">אושר<br />לא בוצע</th>
									<th className="px-3 py-2.5 font-bold text-right">במעקב</th>
									<th className="px-3 py-2.5 font-bold text-right">בריפים</th>
									<th className="px-3 py-2.5 font-bold text-right">קישורים</th>
									<th className="px-3 py-2.5 font-bold text-right">טכני<br />חמור</th>
									<th className="px-3 py-2.5 font-bold text-right">Keywords</th>
									<th className="px-3 py-2.5 font-bold">GSC</th>
									<th className="px-3 py-2.5 font-bold">סריקה</th>
									<th className="px-3 py-2.5 font-bold text-center">פעולות</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-ninja-line">
								{filtered.map((c) => (
									<ClientRow key={c.id} c={c} />
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Recent Activity */}
			{data.recent.length > 0 && (
				<section className="space-y-4">
					<h2 className="font-display text-xl text-ink">
						פעילות <span className="text-brand-gradient">אחרונה</span>
					</h2>
					<div className="rounded-xl border border-ninja-line bg-ninja-panel/40 overflow-hidden">
						<ul className="divide-y divide-ninja-line">
							{data.recent.map((a) => (
								<li key={a.id} className="flex items-start gap-4 px-5 py-3 hover:bg-ninja-raised/30 transition-colors">
									<ActivityDot tone={a.tone} />
									<div className="flex-1 min-w-0">
										<div className="flex items-baseline gap-2 text-xs flex-wrap">
											<Link
												href={`/clients/${a.clientId}`}
												className="text-gold hover:text-blade font-semibold"
											>
												{a.clientName}
											</Link>
											<span className="text-ink-mute">·</span>
											<span className="text-ink-dim">{a.type}</span>
											<span className="text-ink-mute">·</span>
											<span className="text-ink-mute">{ago(a.at)}</span>
										</div>
										<div className="text-sm text-ink truncate mt-0.5">{a.title}</div>
									</div>
								</li>
							))}
						</ul>
					</div>
				</section>
			)}
		</div>
	);
}

function AutomationStatusCard({
	run,
}: {
	run: {
		id: string;
		status: string;
		summary: string | null;
		startedAt: Date;
		finishedAt: Date | null;
		durationMs: number | null;
		error: string | null;
	} | null;
}) {
	if (!run) {
		return (
			<Link
				href="/automation"
				className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-ninja-line bg-ninja-panel/40 px-5 py-4 hover:border-ninja-line-strong transition-colors"
			>
				<div className="flex items-center gap-3">
					<Bot className="w-5 h-5 text-ink-mute" />
					<div>
						<div className="text-sm text-ink">אוטומציה לא הופעלה עדיין</div>
						<div className="text-xs text-ink-dim mt-0.5">לחץ להגדרה והפעלה ראשונה</div>
					</div>
				</div>
				<ArrowLeft className="w-4 h-4 text-ink-mute" />
			</Link>
		);
	}

	let s: Record<string, number> = {};
	try {
		s = run.summary ? JSON.parse(run.summary) : {};
	} catch {
		s = {};
	}
	const tone = runStatusTone(run.status);
	const toneClass =
		tone === "good"
			? "border-go/30 bg-go/5"
			: tone === "warn"
				? "border-gold/30 bg-gold/5"
				: tone === "bad"
					? "border-blade/30 bg-blade/5"
					: "border-ninja-line bg-ninja-panel/60";
	const min = Math.floor((Date.now() - run.startedAt.getTime()) / 60_000);
	const agoText =
		min < 60 ? `לפני ${min} דק׳` : min < 24 * 60 ? `לפני ${Math.floor(min / 60)} שע׳` : `לפני ${Math.floor(min / (24 * 60))} ימים`;
	return (
		<Link
			href="/automation"
			className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-5 py-4 transition-colors hover:bg-ninja-raised/30 ${toneClass}`}
		>
			<div className="flex items-center gap-3 min-w-0">
				<Bot className="w-5 h-5 text-gold shrink-0" />
				<div className="min-w-0">
					<div className="text-sm text-ink flex items-baseline gap-2 flex-wrap">
						<span className="font-bold">סנכרון סוכנות אחרון</span>
						<span className="text-xs text-ink-dim">· {runStatusLabel(run.status)} ·</span>
						<span className="text-xs text-ink-mute">{agoText}</span>
					</div>
					<div className="text-xs text-ink-dim mt-0.5 truncate">
						{run.error ? (
							<span className="text-blade">{run.error}</span>
						) : (
							<>
								{s.clientsProcessed ?? 0} לקוחות עובדו · {s.clientsSkipped ?? 0} דולגו · {s.clientsFailed ?? 0} כשלים ·{" "}
								{s.totalOpportunitiesCreatedOrUpdated ?? 0} הזדמנויות · {s.totalTechFindings ?? 0} ממצאים טכניים ·{" "}
								{s.totalImpactReviews ?? 0} Impact Reviews
							</>
						)}
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2 text-xs text-ink-dim shrink-0">
				צפה בלוג
				<ArrowLeft className="w-4 h-4" />
			</div>
		</Link>
	);
}

function Chip({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: number | string;
	tone?: "neutral" | "good" | "warn" | "bad";
}) {
	const color =
		tone === "good"
			? "text-go"
			: tone === "warn"
				? "text-gold"
				: tone === "bad"
					? "text-blade"
					: "text-ink";
	return (
		<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 px-3 py-3">
			<div className="text-[10px] font-bold tracking-[0.15em] uppercase text-ink-mute leading-tight">
				{label}
			</div>
			<div className={`font-display text-2xl tabular-nums mt-1 ${color}`}>{value}</div>
		</div>
	);
}

function HealthBandStrip({
	totals,
	totalClients,
}: {
	totals: { healthBands: { excellent: number; good: number; warn: number; poor: number } };
	totalClients: number;
}) {
	const segs = [
		{ key: "excellent", count: totals.healthBands.excellent, color: "#2ee685", label: "מצוין" },
		{ key: "good", count: totals.healthBands.good, color: "#ffd166", label: "טוב" },
		{ key: "warn", count: totals.healthBands.warn, color: "#ffa600", label: "תשומת לב" },
		{ key: "poor", count: totals.healthBands.poor, color: "#ff2a3c", label: "טיפול" },
	];
	if (totalClients === 0) return null;
	return (
		<section className="space-y-2">
			<h3 className="text-xs font-bold tracking-[0.18em] uppercase text-ink-dim">
				התפלגות Health
			</h3>
			<div className="flex h-3 w-full overflow-hidden rounded-full bg-ninja-raised">
				{segs.map((s) => {
					const pct = totalClients > 0 ? (s.count / totalClients) * 100 : 0;
					if (pct === 0) return null;
					return (
						<div
							key={s.key}
							style={{ width: `${pct}%`, background: s.color }}
							title={`${s.label}: ${s.count}`}
						/>
					);
				})}
			</div>
			<div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
				{segs.map((s) => (
					<div key={s.key} className="flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
						<span className="text-ink">
							<span className="font-medium">{s.label}</span> · {s.count}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}

function ClientRow({ c }: { c: ClientSummary }) {
	const staleGsc = c.lastGscRowFetchedAt
		? Math.floor((Date.now() - new Date(c.lastGscRowFetchedAt).getTime()) / 86_400_000)
		: null;
	return (
		<tr>
			<td className="px-3 py-3 align-top">
				<Link
					href={`/clients/${c.id}`}
					className="font-semibold text-ink hover:text-gold"
				>
					{c.name}
				</Link>
				<div className="text-xs text-ink-mute font-mono mt-0.5">{c.host}</div>
				{c.vertical && (
					<div className="text-[11px] text-ink-dim mt-0.5">{c.vertical}</div>
				)}
			</td>
			<td className="px-3 py-3 align-top text-center">
				<HealthPill score={c.healthScore} band={c.healthBand} />
			</td>
			<td className="px-3 py-3 align-top text-center tabular-nums">
				<Link
					href={`/clients/${c.id}/workflow`}
					className={c.openOpps > 0 ? "text-ink hover:text-gold font-semibold" : "text-ink-mute"}
				>
					{c.openOpps}
				</Link>
			</td>
			<td className="px-3 py-3 align-top text-center tabular-nums">
				<Link
					href={`/clients/${c.id}/workflow?tab=high_impact`}
					className={c.highImpactOpps > 0 ? "text-blade font-bold hover:underline" : "text-ink-mute"}
				>
					{c.highImpactOpps}
				</Link>
			</td>
			<td className="px-3 py-3 align-top text-center tabular-nums">
				<Link
					href={`/clients/${c.id}/approvals`}
					className={c.needsReviewOpps > 0 ? "text-gold font-bold hover:underline" : "text-ink-mute"}
				>
					{c.needsReviewOpps}
				</Link>
			</td>
			<td className="px-3 py-3 align-top text-center tabular-nums">
				<Link
					href={`/clients/${c.id}/opportunities?status=approved`}
					className={c.approvedNotApplied > 0 ? "text-gold hover:underline" : "text-ink-mute"}
				>
					{c.approvedNotApplied}
				</Link>
			</td>
			<td className="px-3 py-3 align-top text-center tabular-nums">
				<Link
					href={`/clients/${c.id}/impact`}
					className={c.monitoringOpps > 0 ? "text-go hover:underline" : "text-ink-mute"}
				>
					{c.monitoringOpps}
				</Link>
			</td>
			<td className="px-3 py-3 align-top text-center tabular-nums">
				<Link
					href={`/clients/${c.id}/briefs`}
					className={c.briefsPending > 0 ? "text-gold hover:underline" : "text-ink-mute"}
				>
					{c.briefsPending}
				</Link>
			</td>
			<td className="px-3 py-3 align-top text-center tabular-nums">
				<Link
					href={`/clients/${c.id}/internal-links`}
					className={c.linksSuggested > 0 ? "text-ink hover:underline" : "text-ink-mute"}
				>
					{c.linksSuggested}
				</Link>
			</td>
			<td className="px-3 py-3 align-top text-center tabular-nums">
				<Link
					href={`/clients/${c.id}/issues`}
					className={c.techHighSeverity > 0 ? "text-blade font-bold hover:underline" : "text-ink-mute"}
				>
					{c.techHighSeverity}
				</Link>
			</td>
			<td className="px-3 py-3 align-top text-center tabular-nums">
				<Link
					href={`/clients/${c.id}/keywords`}
					className={c.keywordsCount > 0 ? "text-ink hover:text-gold" : "text-ink-mute"}
				>
					{c.keywordsCount}
				</Link>
			</td>
			<td className="px-3 py-3 align-top">
				{c.lastGscRowFetchedAt ? (
					<span className={staleGsc !== null && staleGsc > 14 ? "text-gold text-xs" : "text-ink-dim text-xs"}>
						{ago(c.lastGscRowFetchedAt)}
					</span>
				) : (
					<span className="text-ink-mute text-xs">—</span>
				)}
			</td>
			<td className="px-3 py-3 align-top text-xs text-ink-dim">
				{ago(c.lastScanAt)}
			</td>
			<td className="px-3 py-3 align-top text-center">
				<Link
					href={`/clients/${c.id}/workflow`}
					className="text-xs text-blade hover:text-gold font-semibold"
				>
					Workflow
				</Link>
			</td>
		</tr>
	);
}

function HealthPill({
	score,
	band,
}: {
	score: number;
	band: ClientSummary["healthBand"];
}) {
	return (
		<span
			className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums rounded-full border px-2 py-0.5 ${bandToneClass(band)}`}
		>
			{score}
		</span>
	);
}

function Bottleneck({
	label,
	value,
	icon,
	tone = "neutral",
}: {
	label: string;
	value: number;
	icon: React.ReactNode;
	tone?: "neutral" | "warn";
}) {
	const color = tone === "warn" && value > 0 ? "text-gold" : value > 0 ? "text-ink" : "text-ink-mute";
	return (
		<div className="flex items-center gap-3 rounded-lg border border-ninja-line bg-ninja-panel/60 px-4 py-3">
			<div className={`w-8 h-8 rounded-md bg-ninja-raised border border-ninja-line flex items-center justify-center ${color}`}>
				{icon}
			</div>
			<div className="flex-1">
				<div className="text-[11px] text-ink-dim">{label}</div>
				<div className={`font-display text-xl tabular-nums ${color}`}>{value}</div>
			</div>
		</div>
	);
}

function SourcePill({ source }: { source: string }) {
	const map: Record<string, { label: string; cls: string }> = {
		opportunity: { label: "הזדמנות", cls: "text-blade border-blade/30 bg-blade/10" },
		content_brief: { label: "בריף", cls: "text-gold border-gold/30 bg-gold/10" },
		internal_link: { label: "קישור", cls: "text-go border-go/30 bg-go/10" },
	};
	const m = map[source] ?? { label: source, cls: "text-ink-dim border-ninja-line" };
	return (
		<span className={`inline-flex items-center text-[10px] font-bold tracking-wider rounded-full border px-1.5 py-0.5 ${m.cls}`}>
			{m.label}
		</span>
	);
}

function ActivityDot({ tone }: { tone: "good" | "neutral" | "warn" | "bad" }) {
	const color =
		tone === "good"
			? "bg-go"
			: tone === "warn"
				? "bg-gold"
				: tone === "bad"
					? "bg-blade"
					: "bg-ink-mute";
	return (
		<div className="shrink-0 mt-2">
			<div className={`w-2 h-2 rounded-full ${color}`} />
		</div>
	);
}
