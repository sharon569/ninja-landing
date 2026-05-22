import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, XCircle, Clock, AlertTriangle, SkipForward, Send, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { runTypeLabel, runStatusLabel, runStatusTone } from "@/lib/automation";
import { PIPELINE_TYPE_LABELS, PIPELINE_STATUS_LABELS } from "@/lib/jobs";
import { TriggerSyncButton } from "./TriggerSyncButton";

export const dynamic = "force-dynamic";

interface SearchParams {
	status?: string;
	runType?: string;
	clientId?: string;
	parent?: string;
}

function ago(d: Date | string | null | undefined): string {
	if (!d) return "—";
	const ms = Date.now() - new Date(d).getTime();
	const min = Math.floor(ms / 60_000);
	if (min < 1) return "עכשיו";
	if (min < 60) return `לפני ${min} דק׳`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `לפני ${hr} שע׳`;
	const days = Math.floor(hr / 24);
	return `לפני ${days} ימים`;
}

function fmtDuration(ms: number | null | undefined): string {
	if (!ms) return "—";
	if (ms < 1000) return `${ms}ms`;
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(1)}s`;
	return `${(s / 60).toFixed(1)}m`;
}

function statusIcon(status: string, tone: string) {
	const cls = "w-3.5 h-3.5";
	switch (status) {
		case "success":
			return <CheckCircle2 className={`${cls} text-go`} />;
		case "failed":
			return <XCircle className={`${cls} text-blade`} />;
		case "running":
		case "queued":
			return <Clock className={`${cls} text-gold animate-pulse`} />;
		case "partial_success":
			return <AlertTriangle className={`${cls} text-gold`} />;
		case "skipped":
			return <SkipForward className={`${cls} text-ink-mute`} />;
		default:
			return <span className={`${cls} inline-block rounded-full bg-${tone}/40`} />;
	}
}

export default async function AutomationPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	const sp = await searchParams;

	const where: Record<string, unknown> = {};
	if (sp.status) where.status = sp.status;
	if (sp.runType) where.runType = sp.runType;
	if (sp.clientId) where.clientId = sp.clientId;
	if (sp.parent) where.parentRunId = sp.parent;

	const [runs, totalCount, statusCounts, clients, lastAgency, pipelineJobs, recentNotifications] = await Promise.all([
		db.automationRun.findMany({
			where,
			orderBy: { startedAt: "desc" },
			take: 100,
			include: { client: { select: { id: true, name: true } } },
		}),
		db.automationRun.count({ where }),
		db.automationRun.groupBy({
			by: ["status"],
			_count: { _all: true },
			where: {
				startedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
			},
		}),
		db.client.findMany({
			where: { status: "active" },
			orderBy: { name: "asc" },
			select: { id: true, name: true },
		}),
		db.automationRun.findFirst({
			where: { runType: "agency_auto_sync" },
			orderBy: { startedAt: "desc" },
		}),
		db.pipelineRun.findMany({
			orderBy: { createdAt: "desc" },
			take: 20,
			include: { client: { select: { name: true } } },
		}),
		db.botNotification.findMany({
			orderBy: { sentAt: "desc" },
			take: 20,
		}),
	]);

	const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
	const total30d = statusCounts.reduce((a, b) => a + b._count._all, 0);

	const filterChips: { label: string; key: string; value: string }[] = [];
	if (sp.status) filterChips.push({ label: `סטטוס: ${runStatusLabel(sp.status)}`, key: "status", value: sp.status });
	if (sp.runType) filterChips.push({ label: `סוג: ${runTypeLabel(sp.runType)}`, key: "runType", value: sp.runType });
	if (sp.clientId) {
		const c = clients.find((x) => x.id === sp.clientId);
		if (c) filterChips.push({ label: `לקוח: ${c.name}`, key: "clientId", value: sp.clientId });
	}
	if (sp.parent) filterChips.push({ label: `Run #${sp.parent.slice(-6)}`, key: "parent", value: sp.parent });

	function urlWithout(key: string): string {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(sp)) {
			if (k !== key && v) params.set(k, String(v));
		}
		const q = params.toString();
		return q ? `/automation?${q}` : "/automation";
	}

	return (
		<div className="space-y-8">
			{/* Header */}
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<Link
						href="/"
						className="inline-flex items-center gap-1.5 text-xs text-ink-mute hover:text-gold transition-colors mb-3"
					>
						<ArrowRight className="w-3.5 h-3.5" />
						מרכז פיקוד
					</Link>
					<div className="flex items-center gap-3">
						<Bot className="w-6 h-6 text-gold" />
						<h1 className="font-display text-3xl text-ink">
							<span className="text-brand-gradient">אוטומציה</span>
						</h1>
					</div>
					<p className="text-sm text-ink-dim mt-2 max-w-2xl">
						לוג הרצות אוטומטיות (GSC sync, ניתוח טכני, ניתוח הזדמנויות, Impact Reviews). הרצה יומית 5:00 בבוקר, או הפעלה ידנית מכאן.
					</p>
				</div>
				<TriggerSyncButton />
			</div>

			{/* Last Agency Sync */}
			<section className="rounded-xl border border-ninja-line bg-ninja-panel/60 p-5">
				<div className="flex items-baseline justify-between mb-3">
					<h2 className="font-display text-base text-ink">סנכרון סוכנות אחרון</h2>
					{lastAgency && (
						<span className="text-[10px] tracking-wider uppercase text-ink-mute">
							{ago(lastAgency.startedAt)}
						</span>
					)}
				</div>
				{!lastAgency ? (
					<p className="text-sm text-ink-dim">עוד לא רץ סנכרון אוטומטי. לחץ ״הרץ עכשיו״ כדי להתחיל.</p>
				) : (
					<AgencyRunSummary run={lastAgency} />
				)}
			</section>

			{/* 30-day stats */}
			<section className="grid grid-cols-2 md:grid-cols-6 gap-2">
				<StatCard label="הצלחות (30 ימים)" value={counts.success ?? 0} tone="good" />
				<StatCard label="חלקי" value={counts.partial_success ?? 0} tone="warn" />
				<StatCard label="כישלונות" value={counts.failed ?? 0} tone="bad" />
				<StatCard label="דלגו" value={counts.skipped ?? 0} tone="mute" />
				<StatCard label="פעיל" value={(counts.running ?? 0) + (counts.queued ?? 0)} />
				<StatCard label="סה״כ הרצות" value={total30d} />
			</section>

			{/* Filters */}
			<section className="flex flex-wrap items-center gap-3">
				<span className="text-xs text-ink-dim">סנן:</span>
				<FilterDropdown
					label="סטטוס"
					param="status"
					current={sp.status}
					options={[
						{ value: "success", label: "הצליח" },
						{ value: "failed", label: "נכשל" },
						{ value: "partial_success", label: "חלקי" },
						{ value: "skipped", label: "דולג" },
						{ value: "running", label: "רץ" },
					]}
					sp={sp}
				/>
				<FilterDropdown
					label="סוג הרצה"
					param="runType"
					current={sp.runType}
					options={[
						{ value: "agency_auto_sync", label: "סנכרון סוכנות" },
						{ value: "gsc_sync", label: "GSC Sync" },
						{ value: "technical_audit", label: "ניתוח טכני" },
						{ value: "opportunity_analysis", label: "הזדמנויות" },
						{ value: "impact_review", label: "Impact Review" },
					]}
					sp={sp}
				/>
				<FilterDropdown
					label="לקוח"
					param="clientId"
					current={sp.clientId}
					options={clients.map((c) => ({ value: c.id, label: c.name }))}
					sp={sp}
				/>
				{filterChips.map((c) => (
					<Link
						key={c.key}
						href={urlWithout(c.key)}
						className="inline-flex items-center gap-1.5 text-xs rounded-full border border-blade/30 bg-blade/10 text-blade px-2.5 py-1 hover:bg-blade/20"
					>
						{c.label} ✕
					</Link>
				))}
			</section>

			{/* Runs table */}
			<section className="space-y-3">
				<div className="flex items-baseline justify-between">
					<h2 className="font-display text-base text-ink">
						הרצות אחרונות{" "}
						<span className="text-[10px] text-ink-mute">({Math.min(100, totalCount)} מתוך {totalCount})</span>
					</h2>
				</div>
				{runs.length === 0 ? (
					<div className="rounded-lg border border-ninja-line bg-ninja-panel/40 px-5 py-10 text-center text-sm text-ink-dim">
						אין הרצות שתואמות לסינון.
					</div>
				) : (
					<div className="overflow-hidden rounded-lg border border-ninja-line bg-ninja-panel/40">
						<table className="w-full text-sm">
							<thead className="bg-ninja-raised text-xs uppercase tracking-wider text-ink-dim">
								<tr>
									<th className="px-3 py-2.5 text-right font-bold">מתי</th>
									<th className="px-3 py-2.5 text-right font-bold">סוג</th>
									<th className="px-3 py-2.5 text-right font-bold">לקוח</th>
									<th className="px-3 py-2.5 font-bold">סטטוס</th>
									<th className="px-3 py-2.5 text-right font-bold">משך</th>
									<th className="px-3 py-2.5 text-right font-bold">מקור</th>
									<th className="px-3 py-2.5 text-right font-bold">פירוט</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-ninja-line">
								{runs.map((r) => {
									const tone = runStatusTone(r.status);
									return (
										<tr key={r.id} className="hover:bg-ninja-raised/30">
											<td className="px-3 py-2.5 text-ink-dim text-xs whitespace-nowrap">{ago(r.startedAt)}</td>
											<td className="px-3 py-2.5 text-ink">
												<span className="text-xs">{runTypeLabel(r.runType)}</span>
												{r.runType === "agency_auto_sync" && (
													<Link
														href={`/automation?parent=${r.id}`}
														className="ml-2 text-[10px] text-gold hover:text-blade"
													>
														(הצג ילדים)
													</Link>
												)}
											</td>
											<td className="px-3 py-2.5 text-ink-dim text-xs">
												{r.client ? (
													<Link href={`/clients/${r.client.id}`} className="hover:text-gold">
														{r.client.name}
													</Link>
												) : (
													<span className="text-ink-mute">—</span>
												)}
											</td>
											<td className="px-3 py-2.5">
												<span className="inline-flex items-center gap-1.5 text-xs">
													{statusIcon(r.status, tone)}
													{runStatusLabel(r.status)}
												</span>
											</td>
											<td className="px-3 py-2.5 text-ink-dim tabular-nums text-xs text-left" dir="ltr">
												{fmtDuration(r.durationMs)}
											</td>
											<td className="px-3 py-2.5 text-ink-mute text-[11px]">{r.triggeredBy ?? "—"}</td>
											<td className="px-3 py-2.5 text-ink-dim text-[11px] max-w-xs truncate">
												{r.error ? (
													<span className="text-blade" title={r.error}>{r.error}</span>
												) : r.skippedReason ? (
													<span className="text-ink-mute" title={r.skippedReason}>{r.skippedReason}</span>
												) : r.summary ? (
													<SummaryPreview json={r.summary} />
												) : (
													"—"
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Pipeline Jobs (Telegram bot queue) */}
			<section className="space-y-3">
				<div className="flex items-center gap-2">
					<Zap className="w-4 h-4 text-gold" />
					<h2 className="font-display text-base text-ink">תור עבודות (Pipeline)</h2>
				</div>
				{pipelineJobs.length === 0 ? (
					<div className="rounded-lg border border-ninja-line bg-ninja-panel/40 px-5 py-6 text-center text-sm text-ink-dim">
						אין עבודות בתור.
					</div>
				) : (
					<div className="overflow-hidden rounded-lg border border-ninja-line bg-ninja-panel/40">
						<table className="w-full text-sm">
							<thead className="bg-ninja-raised text-xs uppercase tracking-wider text-ink-dim">
								<tr>
									<th className="px-3 py-2.5 text-right font-bold">מתי</th>
									<th className="px-3 py-2.5 text-right font-bold">סוג</th>
									<th className="px-3 py-2.5 text-right font-bold">לקוח</th>
									<th className="px-3 py-2.5 font-bold">סטטוס</th>
									<th className="px-3 py-2.5 text-right font-bold">מקור</th>
									<th className="px-3 py-2.5 text-right font-bold">שגיאה</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-ninja-line">
								{pipelineJobs.map((j) => (
									<tr key={j.id} className="hover:bg-ninja-raised/30">
										<td className="px-3 py-2.5 text-ink-dim text-xs">{ago(j.createdAt)}</td>
										<td className="px-3 py-2.5 text-ink text-xs">{PIPELINE_TYPE_LABELS[j.type as keyof typeof PIPELINE_TYPE_LABELS] ?? j.type}</td>
										<td className="px-3 py-2.5 text-ink-dim text-xs">{j.client?.name ?? "—"}</td>
										<td className="px-3 py-2.5">
											<span className={`inline-flex items-center gap-1.5 text-xs ${j.status === "success" ? "text-go" : j.status === "failed" ? "text-blade" : j.status === "running" ? "text-gold" : "text-ink-mute"}`}>
												{statusIcon(j.status, j.status === "success" ? "go" : j.status === "failed" ? "blade" : "gold")}
												{PIPELINE_STATUS_LABELS[j.status as keyof typeof PIPELINE_STATUS_LABELS] ?? j.status}
											</span>
										</td>
										<td className="px-3 py-2.5 text-ink-mute text-[11px]">{j.triggeredBy}</td>
										<td className="px-3 py-2.5 text-blade text-[11px] max-w-[200px] truncate">{j.error ?? ""}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Telegram Notifications */}
			<section className="space-y-3">
				<div className="flex items-center gap-2">
					<Send className="w-4 h-4 text-gold" />
					<h2 className="font-display text-base text-ink">הודעות Telegram</h2>
				</div>
				{recentNotifications.length === 0 ? (
					<div className="rounded-lg border border-ninja-line bg-ninja-panel/40 px-5 py-6 text-center text-sm text-ink-dim">
						אין הודעות.
					</div>
				) : (
					<div className="overflow-hidden rounded-lg border border-ninja-line bg-ninja-panel/40">
						<table className="w-full text-sm">
							<thead className="bg-ninja-raised text-xs uppercase tracking-wider text-ink-dim">
								<tr>
									<th className="px-3 py-2.5 text-right font-bold">מתי</th>
									<th className="px-3 py-2.5 text-right font-bold">סוג</th>
									<th className="px-3 py-2.5 font-bold">סטטוס</th>
									<th className="px-3 py-2.5 text-right font-bold">Message ID</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-ninja-line">
								{recentNotifications.map((n) => (
									<tr key={n.id} className="hover:bg-ninja-raised/30">
										<td className="px-3 py-2.5 text-ink-dim text-xs">{ago(n.sentAt)}</td>
										<td className="px-3 py-2.5 text-ink text-xs">{n.type}</td>
										<td className="px-3 py-2.5">
											<span className={`text-xs ${n.status === "sent" ? "text-go" : "text-ink-mute"}`}>{n.status}</span>
										</td>
										<td className="px-3 py-2.5 text-ink-mute text-xs font-mono">{n.messageId ?? "—"}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" | "mute" }) {
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
		<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 px-3 py-2.5">
			<div className={`font-display text-2xl tabular-nums ${color}`}>{value}</div>
			<div className="text-[10px] tracking-wider uppercase text-ink-mute mt-0.5">{label}</div>
		</div>
	);
}

function FilterDropdown({
	label,
	param,
	current,
	options,
	sp,
}: {
	label: string;
	param: string;
	current: string | undefined;
	options: { value: string; label: string }[];
	sp: SearchParams;
}) {
	function url(value: string): string {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(sp)) {
			if (k !== param && v) params.set(k, String(v));
		}
		if (value) params.set(param, value);
		const q = params.toString();
		return q ? `/automation?${q}` : "/automation";
	}
	return (
		<details className="relative">
			<summary className="text-xs cursor-pointer rounded-md border border-ninja-line bg-ninja-panel/60 px-2.5 py-1 text-ink-dim hover:text-ink list-none">
				{label}: {current ? options.find((o) => o.value === current)?.label ?? current : "הכל"} ▾
			</summary>
			<div className="absolute z-10 mt-1 min-w-[180px] max-h-72 overflow-y-auto rounded-md border border-ninja-line bg-ninja-black shadow-xl text-xs">
				<Link href={url("")} className="block px-3 py-1.5 hover:bg-ninja-raised text-ink-dim">— הכל —</Link>
				{options.map((o) => (
					<Link
						key={o.value}
						href={url(o.value)}
						className={`block px-3 py-1.5 hover:bg-ninja-raised ${current === o.value ? "text-gold" : "text-ink-dim"}`}
					>
						{o.label}
					</Link>
				))}
			</div>
		</details>
	);
}

function AgencyRunSummary({
	run,
}: {
	run: {
		id: string;
		status: string;
		summary: string | null;
		error: string | null;
		durationMs: number | null;
		triggeredBy: string | null;
	};
}) {
	let s: Record<string, unknown> = {};
	try {
		s = run.summary ? JSON.parse(run.summary) : {};
	} catch {
		s = {};
	}
	const tone = runStatusTone(run.status);
	const num = (k: string): number => Number(s[k] ?? 0);
	return (
		<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
			<MiniStat label="סטטוס" value={runStatusLabel(run.status)} tone={tone} />
			<MiniStat label="לקוחות עובדו" value={num("clientsProcessed")} />
			<MiniStat label="דולגו" value={num("clientsSkipped")} tone="mute" />
			<MiniStat label="כשלים" value={num("clientsFailed")} tone={num("clientsFailed") > 0 ? "bad" : undefined} />
			<MiniStat label="הזדמנויות" value={num("totalOpportunitiesCreatedOrUpdated")} tone="good" />
			<MiniStat label="טכני" value={num("totalTechFindings")} />
			<MiniStat label="Impact" value={num("totalImpactReviews")} />
		</div>
	);
}

function MiniStat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
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
		<div>
			<div className={`font-display text-lg tabular-nums ${color}`}>{value}</div>
			<div className="text-[10px] tracking-wider uppercase text-ink-mute mt-0.5">{label}</div>
		</div>
	);
}

function SummaryPreview({ json }: { json: string }) {
	let s: Record<string, unknown> = {};
	try {
		s = JSON.parse(json);
	} catch {
		return <span>—</span>;
	}
	const parts: string[] = [];
	if (typeof s.created === "number" || typeof s.updated === "number") {
		parts.push(`+${s.created ?? 0}/✎${s.updated ?? 0}`);
	}
	if (typeof s.findingsCreated === "number") {
		parts.push(`${s.findingsCreated} ממצאים`);
	}
	if (typeof s.clientsProcessed === "number") {
		parts.push(`${s.clientsProcessed} לקוחות`);
	}
	if (typeof s.window === "string") {
		parts.push(`חלון ${s.window}`);
	}
	return <span title={json}>{parts.join(" · ") || "—"}</span>;
}
