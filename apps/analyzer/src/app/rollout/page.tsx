import Link from "next/link";
import {
	ArrowRight,
	AlertTriangle,
	CheckCircle2,
	XCircle,
	Settings,
	Plug,
	Activity,
	TrendingUp,
	Sparkles,
} from "lucide-react";
import { loadRolloutDashboard } from "@/lib/rollout-server";
import {
	CLIENT_STATUS_LABEL,
	CLIENT_STATUS_TONE,
	type ClientRolloutRow,
} from "@/lib/rollout";
import { MIN_PLUGIN_VERSION, RECOMMENDED_PLUGIN_VERSION } from "@/lib/execution";

export const dynamic = "force-dynamic";

function pct(n: number): string {
	return `${Math.round(n * 100)}%`;
}

function ago(iso: string | null): string {
	if (!iso) return "—";
	const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	return `${Math.floor(h / 24)}d`;
}

export default async function RolloutPage() {
	const { clients, metrics, needsAttention, expansionSuggestions } = await loadRolloutDashboard();

	return (
		<div className="space-y-8">
			<div>
				<Link href="/" className="inline-flex items-center gap-1.5 text-xs text-ink-mute hover:text-gold transition-colors mb-3">
					<ArrowRight className="w-3.5 h-3.5" />
					מרכז פיקוד
				</Link>
				<div className="flex items-center gap-3">
					<Plug className="w-6 h-6 text-gold" />
					<h1 className="font-display text-3xl text-ink">
						Execution <span className="text-brand-gradient">Rollout</span>
					</h1>
				</div>
				<p className="text-sm text-ink-dim mt-2 max-w-2xl">
					מבט-על על כל הלקוחות — מי מוכן לביצוע חי, מי בפיילוט, מי דורש טיפול. אין כפתורי ביצוע כאן — רק ניווט לדף לקוח.
				</p>
			</div>

			{/* Agency metrics */}
			<section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
				<Metric label="לקוחות" value={metrics.totalClients} />
				<Metric label="Execution דלוק" value={metrics.clientsExecutionEnabled} tone="good" />
				<Metric label="ב-Pilot" value={metrics.clientsPilot} tone="warn" />
				<Metric label="עדכון מומלץ" value={metrics.clientsUpdateRecommended} tone={metrics.clientsUpdateRecommended > 0 ? "warn" : "neutral"} />
				<Metric label="דורש טיפול" value={metrics.clientsNeedsAttention} tone={metrics.clientsNeedsAttention > 0 ? "bad" : "neutral"} />
				<Metric label="Finalized" value={metrics.finalizedExecutions} tone="good" />
			</section>

			<section className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<Metric label="בוצעו השבוע" value={metrics.executionsLast7d} />
				<Metric label="כשלים השבוע" value={metrics.failuresLast7d} tone={metrics.failuresLast7d > 0 ? "warn" : "neutral"} />
				<Metric label="Dry Run לא טרי" value={metrics.dryRunStaleCount} tone={metrics.dryRunStaleCount > 0 ? "warn" : "neutral"} />
				<Metric label="Rollback זמין" value={metrics.rollbackAvailableCount} />
			</section>

			<section className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<RateMetric label="Dry Run Success (30d)" value={metrics.dryRunSuccessRate} />
				<RateMetric label="Execution Success (30d)" value={metrics.executionSuccessRate} />
				<RateMetric label="Rollback Rate (30d)" value={metrics.rollbackRate} invert />
				<RateMetric label="Stale Rate (30d)" value={metrics.staleRate} invert />
			</section>

			{/* Needs Attention */}
			{needsAttention.length > 0 && (
				<section className="space-y-3">
					<h2 className="flex items-center gap-2 font-display text-lg text-ink">
						<AlertTriangle className="w-5 h-5 text-blade" />
						Execution Needs Attention
						<span className="text-[10px] text-ink-mute font-mono">({needsAttention.length})</span>
					</h2>
					<ul className="rounded-lg border border-blade/30 bg-blade/5 divide-y divide-ninja-line">
						{needsAttention.map((it) => (
							<li key={it.id} className="px-4 py-3 flex items-start gap-3">
								<XCircle className="w-4 h-4 text-blade shrink-0 mt-0.5" />
								<div className="flex-1 min-w-0">
									<div className="text-sm text-ink">{it.title}</div>
									{it.detail && <div className="text-xs text-ink-dim mt-0.5 break-words">{it.detail}</div>}
									<div className="flex items-center gap-3 mt-1.5">
										{it.links.map((l) => (
											<Link key={l.href} href={l.href} className="text-xs text-gold hover:text-blade">
												→ {l.label}
											</Link>
										))}
									</div>
								</div>
								<span className="text-[10px] text-ink-mute" dir="ltr">{ago(it.createdAt)}</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{/* Expansion suggestions */}
			{expansionSuggestions.length > 0 && (
				<section className="space-y-3">
					<h2 className="flex items-center gap-2 font-display text-lg text-ink">
						<Sparkles className="w-5 h-5 text-gold" />
						הצעות הרחבה
						<span className="text-[10px] text-ink-mute font-mono">({expansionSuggestions.length})</span>
					</h2>
					<ul className="rounded-lg border border-gold/30 bg-gold/5 divide-y divide-ninja-line">
						{expansionSuggestions.map((s) => (
							<li key={`${s.clientId}-${s.suggestedAction}`} className="px-4 py-3 flex items-start gap-3">
								<TrendingUp className="w-4 h-4 text-gold shrink-0 mt-0.5" />
								<div className="flex-1 min-w-0">
									<div className="text-sm text-ink">
										{s.clientName} ביצע {s.currentSuccessCount} פעמים <code className="text-xs">{s.currentAction}</code> בהצלחה
									</div>
									<div className="text-xs text-ink-dim mt-0.5">
										אפשר לשקול להוסיף <strong>{s.suggestedActionLabel}</strong> לפעולות המורשות.
										<span className="text-ink-mute"> · המערכת לא תוסיף לבד — תוסיף ידנית ב</span>
										<Link href={`/clients/${s.clientId}/settings`} className="text-gold hover:text-blade ms-1">
											הגדרות
										</Link>.
									</div>
								</div>
							</li>
						))}
					</ul>
				</section>
			)}

			{/* Clients matrix */}
			<section className="space-y-3">
				<div className="flex items-baseline justify-between flex-wrap gap-2">
					<h2 className="font-display text-lg text-ink">לקוחות</h2>
					<span className="text-[10px] text-ink-mute">
						דרישה מינ' פלאגין: v{MIN_PLUGIN_VERSION} · מומלץ: v{RECOMMENDED_PLUGIN_VERSION}
					</span>
				</div>
				<div className="rounded-lg border border-ninja-line bg-ninja-panel/40 overflow-x-auto">
					<table className="w-full text-sm min-w-[1200px]">
						<thead className="bg-ninja-raised text-[10px] uppercase tracking-wider text-ink-dim">
							<tr>
								<th className="px-3 py-2.5 text-right font-bold">לקוח</th>
								<th className="px-3 py-2.5 font-bold">סטטוס</th>
								<th className="px-3 py-2.5 font-bold">Plugin</th>
								<th className="px-3 py-2.5 font-bold">Write API</th>
								<th className="px-3 py-2.5 font-bold">DryRun</th>
								<th className="px-3 py-2.5 font-bold">Pilot</th>
								<th className="px-3 py-2.5 font-bold">Allowed</th>
								<th className="px-3 py-2.5 text-right font-bold">בוצעו</th>
								<th className="px-3 py-2.5 text-right font-bold">כשלים</th>
								<th className="px-3 py-2.5 text-right font-bold">Stale</th>
								<th className="px-3 py-2.5 text-right font-bold">Rollback</th>
								<th className="px-3 py-2.5 text-right font-bold">Final</th>
								<th className="px-3 py-2.5 font-bold">אחרון</th>
								<th className="px-3 py-2.5 font-bold text-center">פתח</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-ninja-line">
							{clients.map((c) => (
								<ClientRow key={c.clientId} c={c} />
							))}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}

function Metric({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: number;
	tone?: "good" | "warn" | "bad" | "neutral";
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
		<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 px-3 py-2.5">
			<div className={`font-display text-2xl tabular-nums ${color}`}>{value}</div>
			<div className="text-[10px] tracking-wider uppercase text-ink-mute mt-0.5">{label}</div>
		</div>
	);
}

function RateMetric({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
	const goodThreshold = invert ? 0.05 : 0.9;
	const tone = invert
		? value > 0.2
			? "bad"
			: value > goodThreshold
				? "warn"
				: "good"
		: value < 0.5
			? "bad"
			: value < goodThreshold
				? "warn"
				: "good";
	return <Metric label={label} value={Math.round(value * 100)} tone={tone} />;
}

function ClientRow({ c }: { c: ClientRolloutRow }) {
	const tone = CLIENT_STATUS_TONE[c.status];
	const statusCls =
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
		<tr className="hover:bg-ninja-raised/30">
			<td className="px-3 py-2.5">
				<div className="font-semibold text-ink">{c.clientName}</div>
				<div className="text-[10px] text-ink-mute font-mono" dir="ltr">{c.host}</div>
			</td>
			<td className="px-3 py-2.5">
				<span
					className={`inline-block text-[10px] font-bold rounded-full border px-2 py-0.5 ${statusCls}`}
					title={c.statusReasons.join(" · ")}
				>
					{CLIENT_STATUS_LABEL[c.status]}
				</span>
			</td>
			<td className="px-3 py-2.5 text-xs text-ink-dim">
				{c.pluginVersion ? (
					<span
						className={
							c.pluginVersionRecommended
								? "text-go"
								: c.pluginVersionOk
									? "text-gold"
									: "text-blade"
						}
						title={
							c.pluginVersionRecommended
								? "Recommended"
								: c.pluginVersionOk
									? `Supported, update to v${RECOMMENDED_PLUGIN_VERSION} recommended`
									: `Below minimum v${MIN_PLUGIN_VERSION}`
						}
					>
						v{c.pluginVersion}
					</span>
				) : (
					<span className="text-ink-mute">—</span>
				)}
			</td>
			<td className="px-3 py-2.5 text-center">
				{c.writeApiEnabled ? <CheckCircle2 className="w-3.5 h-3.5 text-go inline" /> : <XCircle className="w-3.5 h-3.5 text-ink-mute inline" />}
			</td>
			<td className="px-3 py-2.5 text-center">
				{c.dryRunSupported ? <CheckCircle2 className="w-3.5 h-3.5 text-go inline" /> : <XCircle className="w-3.5 h-3.5 text-ink-mute inline" />}
			</td>
			<td className="px-3 py-2.5 text-center">
				{c.executionEnabled && c.executionPilotMode ? (
					<span className="text-gold text-[10px]">Pilot</span>
				) : c.executionEnabled ? (
					<span className="text-go text-[10px]">Full</span>
				) : (
					<span className="text-ink-mute text-[10px]">—</span>
				)}
			</td>
			<td className="px-3 py-2.5 text-[10px] text-ink-dim">
				{c.allowedExecutionActions.length > 0 ? c.allowedExecutionActions.length : "—"}
			</td>
			<td className="px-3 py-2.5 text-end tabular-nums text-ink">{c.executedCount}</td>
			<td className={`px-3 py-2.5 text-end tabular-nums ${c.failedCount > 0 ? "text-blade" : "text-ink-mute"}`}>{c.failedCount}</td>
			<td className={`px-3 py-2.5 text-end tabular-nums ${c.dryRunStaleCount > 0 ? "text-gold" : "text-ink-mute"}`}>{c.dryRunStaleCount}</td>
			<td className="px-3 py-2.5 text-end tabular-nums text-ink-dim">{c.rollbackAvailableCount}</td>
			<td className="px-3 py-2.5 text-end tabular-nums text-go">{c.finalizedCount}</td>
			<td className="px-3 py-2.5 text-[10px] text-ink-mute" dir="ltr">{ago(c.lastExecutedAt)}</td>
			<td className="px-3 py-2.5 text-center">
				<Link
					href={`/clients/${c.clientId}/execution`}
					className="inline-flex items-center gap-1 text-xs text-gold hover:text-blade"
				>
					<Activity className="w-3 h-3" /> Exec
				</Link>
				<span className="text-ink-mute mx-1">·</span>
				<Link
					href={`/clients/${c.clientId}/settings`}
					className="inline-flex items-center gap-1 text-xs text-ink-dim hover:text-gold"
				>
					<Settings className="w-3 h-3" /> Set
				</Link>
			</td>
		</tr>
	);
}
