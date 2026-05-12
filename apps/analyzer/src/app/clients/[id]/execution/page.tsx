import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Activity, Inbox, ShieldAlert, Bot, ListChecks } from "lucide-react";
import { db } from "@/lib/db";
import { loadExecutionActionsForClient, getExecutionReadiness } from "@/lib/execution-server";
import { listClientEvents } from "@/lib/execution-events-server";
import {
	actionTypeLabel,
	statusLabel,
	statusTone,
	sourceTypeLabel,
	isDryRunOnly,
	ROLLBACK_AVAILABLE_NUDGE_DAYS,
} from "@/lib/execution";
import { ActionButtons } from "./ActionButtons";
import { ReadinessPanel } from "./ReadinessPanel";
import { EventFeed } from "./EventFeed";

export const dynamic = "force-dynamic";

function ago(d: Date | null | undefined): string {
	if (!d) return "—";
	const min = Math.floor((Date.now() - new Date(d).getTime()) / 60_000);
	if (min < 1) return "עכשיו";
	if (min < 60) return `לפני ${min} דק׳`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `לפני ${hr} שע׳`;
	return `לפני ${Math.floor(hr / 24)} ימים`;
}

interface ParsedDiff {
	before: string | null;
	after: string | null;
	currentRendered?: string | null;
	changed: boolean;
	warnings: string[];
	note: string | null;
}

function parseDiff(json: string | null): ParsedDiff | null {
	if (!json) return null;
	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
}

// Phase 15D — pull the brief→execution decision snapshot's relevant bits so
// the execution card can show Why / Measurement plan inline. Returns null
// when the snapshot is missing, malformed, or doesn't come from a brief.
interface BriefSnapshotMeta {
	strategy: boolean;
	why?: string;
	successCondition?: string;
	risk?: string;
	confidence?: string;
}
function parseBriefDecisionSnapshot(json: string | null): BriefSnapshotMeta | null {
	if (!json) return null;
	try {
		const parsed = JSON.parse(json) as {
			source?: string;
			strategyContext?: {
				why?: string;
				risk?: string;
				riskLevel?: string;
				confidence?: string;
				measurementPlan?: { successCondition?: string };
			};
			decision?: { whyThisIsBetter?: string };
		};
		if (parsed.source === "keyword_strategy" && parsed.strategyContext) {
			const sc = parsed.strategyContext;
			return {
				strategy: true,
				why: sc.why,
				successCondition: sc.measurementPlan?.successCondition,
				risk: sc.risk ?? sc.riskLevel,
				confidence: sc.confidence,
			};
		}
		if (parsed.source === "opportunity" && parsed.decision) {
			return { strategy: false, why: parsed.decision.whyThisIsBetter };
		}
		return null;
	} catch {
		return null;
	}
}

export default async function ExecutionPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const client = await db.client.findUnique({
		where: { id },
		select: { id: true, name: true, baseUrl: true, token: true },
	});
	if (!client) notFound();

	const [actions, readiness, events] = await Promise.all([
		loadExecutionActionsForClient(id),
		getExecutionReadiness(id),
		listClientEvents(id, 20),
	]);

	// Bucket by status
	const buckets = {
		ready: actions.filter((a) => a.status === "dry_run_ready" || a.status === "awaiting_execution_approval"),
		draft: actions.filter((a) => ["draft", "dry_run_failed", "dry_run_stale", "preview_only"].includes(a.status)),
		executing: actions.filter((a) => a.status === "executing"),
		executed: actions.filter((a) => ["executed", "rollback_available"].includes(a.status)),
		failed: actions.filter((a) => a.status === "failed"),
		closed: actions.filter((a) => ["cancelled", "rolled_back", "finalized"].includes(a.status)),
	};

	// Phase 14B — surface a "consider finalizing" warning for any rollback_available
	// action older than the nudge threshold.
	const nudgeCutoff = Date.now() - ROLLBACK_AVAILABLE_NUDGE_DAYS * 86_400_000;
	const aging = actions.filter(
		(a) => a.status === "rollback_available" && a.executedAt && a.executedAt.getTime() < nudgeCutoff,
	);

	return (
		<div className="space-y-8">
			{/* Header */}
			<div>
				<div className="flex items-baseline justify-between flex-wrap gap-3">
					<div>
						<h2 className="font-display text-2xl text-ink flex items-center gap-2">
							<AlertTriangle className="w-5 h-5 text-blade" />
							<span className="text-brand-gradient">Execution</span>
						</h2>
						<p className="text-xs text-ink-dim mt-1 max-w-2xl">
							שינויים חיים באתר הלקוח. כל פעולה עוברת Dry Run → אישור → ביצוע. אין bulk execution. אין cron execution.
							שינוי חי מבוצע <strong className="text-blade">רק</strong> אחרי לחיצה מפורשת על Execute עם אישור כפול.
						</p>
					</div>
				</div>
			</div>

			{/* Pilot Mode Banner */}
			{readiness.pilotMode && readiness.executionEnabled && (
				<div className="rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold flex items-start gap-3">
					<AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
					<div className="leading-relaxed">
						<strong>Pilot Mode פעיל</strong> — ביצוע מוגבל לפעולות שאושרו ידנית וברשימת Allowed Actions בלבד.
					</div>
				</div>
			)}

			{/* WP Readiness Panel */}
			<ReadinessPanel clientId={id} initial={readiness} />

			{/* Pre-flight Checklist */}
			<PilotChecklist readiness={readiness} clientId={id} />

			{/* Phase 14B — rollback follow-up nudge */}
			{aging.length > 0 && (
				<div className="rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold flex items-start gap-3">
					<AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
					<div className="leading-relaxed">
						<strong>{aging.length} פעולות בוצעו לפני יותר מ-{ROLLBACK_AVAILABLE_NUDGE_DAYS} ימים ועדיין זמינות ל-Rollback.</strong>
						<br />
						אם הכל תקין, אפשר ללחוץ <em>Finalize</em> כדי לסגור אותן בהיסטוריה.
					</div>
				</div>
			)}

			{/* Sections */}
			<Section title="ממתינים לאישור ביצוע" items={buckets.ready} clientId={id} icon={<AlertTriangle className="w-4 h-4 text-gold" />} emptyHint="אין פעולות שמוכנות לאישור ביצוע." />
			<Section title="Preview / טיוטה" items={buckets.draft} clientId={id} icon={<Inbox className="w-4 h-4 text-ink-mute" />} emptyHint="אין טיוטות פתוחות." />
			{buckets.executing.length > 0 && (
				<Section title="מבצע כעת" items={buckets.executing} clientId={id} icon={<Bot className="w-4 h-4 text-gold animate-pulse" />} />
			)}
			<Section title="בוצע באתר" items={buckets.executed} clientId={id} icon={<Activity className="w-4 h-4 text-go" />} emptyHint="עדיין לא בוצעו פעולות חיות מהמערכת." />
			{buckets.failed.length > 0 && (
				<Section title="נכשלו" items={buckets.failed} clientId={id} icon={<ShieldAlert className="w-4 h-4 text-blade" />} />
			)}
			{buckets.closed.length > 0 && (
				<Section title="סגורים (בוטלו / Rolled Back)" items={buckets.closed} clientId={id} icon={<Inbox className="w-4 h-4 text-ink-mute" />} />
			)}

			{/* Phase 13 — Execution events feed (read-only) */}
			<EventFeed clientId={id} events={events} />
		</div>
	);
}

interface ActionRow {
	id: string;
	actionType: string;
	status: string;
	sourceType: string;
	sourceId: string;
	targetUrl: string | null;
	targetPostId: number | null;
	diff: string | null;
	error: string | null;
	updatedAt: Date;
	dryRunAt: Date | null;
	executedAt: Date | null;
	executedBy: string | null;
	decisionSnapshot?: string | null;
}

function Section({
	title,
	items,
	clientId,
	icon,
	emptyHint,
}: {
	title: string;
	items: ActionRow[];
	clientId: string;
	icon: React.ReactNode;
	emptyHint?: string;
}) {
	return (
		<section className="space-y-3">
			<h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-dim">
				{icon}
				{title}
				<span className="text-[10px] text-ink-mute font-mono">({items.length})</span>
			</h3>
			{items.length === 0 ? (
				emptyHint && (
					<div className="rounded-lg border border-dashed border-ninja-line bg-ninja-panel/40 px-5 py-6 text-center text-xs text-ink-mute">
						{emptyHint}
					</div>
				)
			) : (
				<div className="space-y-2">
					{items.map((a) => (
						<ActionCard key={a.id} a={a} clientId={clientId} />
					))}
				</div>
			)}
		</section>
	);
}

function ActionCard({
	a,
	clientId,
}: {
	a: ActionRow;
	clientId: string;
}) {
	const diff = parseDiff(a.diff);
	const briefMeta = a.sourceType === "content_brief" ? parseBriefDecisionSnapshot(a.decisionSnapshot ?? null) : null;
	const tone = statusTone(a.status);
	const toneBorder =
		tone === "good"
			? "border-go/30"
			: tone === "warn"
				? "border-gold/30"
				: tone === "bad"
					? "border-blade/30"
					: "border-ninja-line";

	return (
		<div className={`rounded-lg border ${toneBorder} bg-ninja-panel/60 p-4`}>
			<div className="flex items-start justify-between gap-4 flex-wrap mb-3">
				<div className="min-w-0">
					<div className="flex items-baseline gap-2 flex-wrap mb-1">
						<span className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
							{sourceTypeLabel(a.sourceType)}
						</span>
						<span className="font-display text-sm text-ink">{actionTypeLabel(a.actionType)}</span>
						{isDryRunOnly(a.actionType) && (
							<span className="text-[10px] font-bold tracking-wider uppercase text-gold border border-gold/30 bg-gold/10 rounded-full px-1.5 py-0.5">
								Preview Only
							</span>
						)}
					</div>
					{a.targetUrl && (
						<a
							href={a.targetUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-ink-dim hover:text-gold font-mono break-all"
							dir="ltr"
						>
							{a.targetUrl}
						</a>
					)}
				</div>
				<div className="text-xs text-ink-mute">
					<div className="text-end">
						<span
							className={
								tone === "good"
									? "text-go"
									: tone === "warn"
										? "text-gold"
										: tone === "bad"
											? "text-blade"
											: "text-ink-dim"
							}
						>
							{statusLabel(a.status)}
						</span>
					</div>
					<div className="text-[10px] text-ink-mute mt-0.5 text-end">{ago(a.updatedAt)}</div>
				</div>
			</div>

			{briefMeta && (briefMeta.why || briefMeta.successCondition) && (
				<div className="rounded-lg border border-gold/20 bg-gold/5 p-3 mb-3 text-xs space-y-1.5">
					<div className="text-[10px] tracking-wider uppercase text-gold">
						{briefMeta.strategy ? "מאסטרטגיה" : "מ-Opportunity"}
					</div>
					{briefMeta.why && (
						<div className="text-ink-dim leading-relaxed">
							<span className="text-ink-mute">למה: </span>
							{briefMeta.why}
						</div>
					)}
					{briefMeta.successCondition && (
						<div className="text-go">
							<span className="text-ink-mute">הצלחה: </span>
							{briefMeta.successCondition}
						</div>
					)}
					{(briefMeta.risk || briefMeta.confidence) && (
						<div className="text-ink-mute text-[11px]">
							{briefMeta.risk && <span>· סיכון: {briefMeta.risk} </span>}
							{briefMeta.confidence && <span>· confidence: {briefMeta.confidence}</span>}
						</div>
					)}
				</div>
			)}

			{/* Diff — "before" shows the rendered title when there's no manual
			    Yoast override (templated case), with a small label noting it.
			    "after" is what we'll write into the meta. */}
			{diff && (diff.before !== null || diff.after !== null || diff.currentRendered) && (
				<div className="grid md:grid-cols-2 gap-2 text-xs mb-3">
					<div>
						<div className="text-[10px] tracking-wider uppercase text-ink-mute mb-1 flex items-center gap-1.5">
							לפני
							{!diff.before && diff.currentRendered && (
								<span className="text-[9px] normal-case tracking-normal text-gold-deep">
									(מחושב מתבנית Yoast — אין override שמור)
								</span>
							)}
						</div>
						<div className="rounded border border-ninja-line bg-ninja-black/60 px-3 py-2 text-ink-dim font-mono break-all whitespace-pre-wrap min-h-[2.5rem]">
							{diff.before
								? diff.before
								: diff.currentRendered
									? diff.currentRendered
									: <span className="text-ink-mute italic">—</span>}
						</div>
					</div>
					<div>
						<div className="text-[10px] tracking-wider uppercase text-gold mb-1">אחרי</div>
						<div className="rounded border border-gold/30 bg-gold/5 px-3 py-2 text-ink font-mono break-all whitespace-pre-wrap min-h-[2.5rem]">
							{diff.after ?? <span className="text-ink-mute italic">—</span>}
						</div>
					</div>
				</div>
			)}

			{diff?.warnings && diff.warnings.length > 0 && (
				<div className="text-xs text-gold mb-2">
					<AlertTriangle className="w-3.5 h-3.5 inline-block me-1" />
					{diff.warnings.join(" · ")}
				</div>
			)}

			{diff?.note && (
				<div className="text-xs text-ink-mute italic mb-2">· {diff.note}</div>
			)}

			{a.error && (
				<div className="text-xs text-blade bg-blade/10 border border-blade/30 rounded px-3 py-1.5 mb-2">
					שגיאה: {a.error}
				</div>
			)}

			<div className="flex items-center justify-between gap-3 pt-2 border-t border-ninja-line">
				<div className="text-[10px] text-ink-mute flex items-center gap-3 flex-wrap">
					{a.dryRunAt && <span>Dry Run: {ago(a.dryRunAt)}</span>}
					{a.executedAt && <span>בוצע: {ago(a.executedAt)}</span>}
					{a.executedBy && <span>ע״י: {a.executedBy}</span>}
					{a.sourceType === "opportunity" && (
						<Link
							href={`/clients/${clientId}/opportunities/${a.sourceId}`}
							className="text-gold hover:text-blade"
						>
							→ הזדמנות
						</Link>
					)}
					{a.sourceType === "content_brief" && (
						<>
							<Link
								href={`/clients/${clientId}/briefs`}
								className="text-gold hover:text-blade"
							>
								→ Brief
							</Link>
							{briefMeta?.strategy && (
								<Link
									href={`/clients/${clientId}/keyword-strategy`}
									className="text-gold hover:text-blade"
								>
									→ אסטרטגיה
								</Link>
							)}
						</>
					)}
				</div>
				<ActionButtons
					clientId={clientId}
					actionId={a.id}
					status={a.status}
					actionType={a.actionType}
				/>
			</div>
		</div>
	);
}

function PilotChecklist({
	readiness,
	clientId,
}: {
	readiness: import("@/lib/execution").ExecutionReadiness;
	clientId: string;
}) {
	// 8-item pre-flight checklist. Each item maps to a single signal from
	// the readiness payload. Last item ("Dry Run completed / Diff reviewed")
	// is informational — it must remain a manual check by Sharon.
	const items: { ok: boolean; label: string; href?: string }[] = [
		{ ok: readiness.pluginReachable, label: "Plugin v0.3 מותקן ונגיש", href: `/clients/${clientId}/settings` },
		{ ok: readiness.tokenPresent, label: "Token + Base URL מעודכנים בפרופיל הלקוח", href: `/clients/${clientId}/settings` },
		{ ok: readiness.writeApiEnabled, label: "Write API פעיל ב-WordPress (kill switch)" },
		{ ok: readiness.executionEnabled, label: "Execution Enabled ב-Analyzer", href: `/clients/${clientId}/settings` },
		{
			ok: readiness.allowedActions.length > 0,
			label: "נבחרו Allowed Actions",
			href: `/clients/${clientId}/settings`,
		},
		{ ok: readiness.pluginVersionOk, label: "גרסת פלאגין ≥ 0.3.0" },
		{
			ok: readiness.dryRunSupported,
			label: "Dry Run נתמך — בצע Dry Run לפני Execute (ידני, לכל פעולה)",
		},
		{
			ok: false, // intentionally manual — surfaces as informational reminder
			label: "Diff נבדק על ידי איש מקצוע לפני לחיצת Execute",
		},
	];

	return (
		<div className="rounded-xl border border-ninja-line bg-ninja-panel/40 p-5 space-y-3">
			<h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-dim">
				<ListChecks className="w-4 h-4 text-gold" />
				Pilot Checklist — לפני הפעלת Execution
			</h3>
			<ul className="space-y-1.5 text-sm">
				{items.map((item, i) => (
					<li key={i} className="flex items-center gap-2.5">
						<span
							className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
								item.ok
									? "bg-go/20 border-go/40 text-go"
									: "bg-ninja-raised border-ninja-line text-ink-mute"
							}`}
						>
							{item.ok ? "✓" : ""}
						</span>
						<span className={item.ok ? "text-ink-dim line-through" : "text-ink"}>{item.label}</span>
						{!item.ok && item.href && (
							<Link href={item.href} className="text-xs text-gold hover:text-blade ms-1">
								פתח
							</Link>
						)}
					</li>
				))}
			</ul>
			<p className="text-[11px] text-ink-mute italic pt-2 border-t border-ninja-line">
				הצ&apos;ק־ליסט הוא מדריך בלבד. ה-Analyzer מאכף את הבדיקות הקריטיות מצד השרת — לא ניתן ליצור או לבצע ExecutionAction
				ללא כל הסעיפים הראשונים.
			</p>
		</div>
	);
}
