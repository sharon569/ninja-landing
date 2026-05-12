import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Activity, Inbox, ShieldAlert, Bot } from "lucide-react";
import { db } from "@/lib/db";
import { loadExecutionActionsForClient, getWpCapabilities } from "@/lib/execution-server";
import {
	actionTypeLabel,
	statusLabel,
	statusTone,
	sourceTypeLabel,
	isDryRunOnly,
} from "@/lib/execution";
import { ActionButtons } from "./ActionButtons";

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

	const [actions, caps] = await Promise.all([
		loadExecutionActionsForClient(id),
		getWpCapabilities(id),
	]);

	// Bucket by status
	const buckets = {
		ready: actions.filter((a) => a.status === "dry_run_ready" || a.status === "awaiting_execution_approval"),
		draft: actions.filter((a) => a.status === "draft" || a.status === "dry_run_failed" || a.status === "preview_only"),
		executing: actions.filter((a) => a.status === "executing"),
		executed: actions.filter((a) => ["executed", "rollback_available"].includes(a.status)),
		failed: actions.filter((a) => a.status === "failed"),
		closed: actions.filter((a) => ["cancelled", "rolled_back"].includes(a.status)),
	};

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

			{/* WP Capability status */}
			<WpCapabilityCard caps={caps} />

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
		</div>
	);
}

function Section({
	title,
	items,
	clientId,
	icon,
	emptyHint,
}: {
	title: string;
	items: Array<{
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
	}>;
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
	a: {
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
	};
	clientId: string;
}) {
	const diff = parseDiff(a.diff);
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

			{/* Diff */}
			{diff && (diff.before !== null || diff.after !== null) && (
				<div className="grid md:grid-cols-2 gap-2 text-xs mb-3">
					<div>
						<div className="text-[10px] tracking-wider uppercase text-ink-mute mb-1">לפני</div>
						<div className="rounded border border-ninja-line bg-ninja-black/60 px-3 py-2 text-ink-dim font-mono break-all whitespace-pre-wrap min-h-[2.5rem]">
							{diff.before ?? <span className="text-ink-mute italic">—</span>}
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

function WpCapabilityCard({
	caps,
}: {
	caps:
		| { ok: true; pluginVersion?: string; writeApiEnabled?: boolean; supportedActions?: string[]; yoastActive?: boolean }
		| { ok: false; reason?: string };
}) {
	if (!caps.ok) {
		return (
			<div className="rounded-lg border border-blade/30 bg-blade/10 px-5 py-3 text-sm text-blade">
				<AlertTriangle className="w-4 h-4 inline-block me-2" />
				לא ניתן להתחבר לפלאגין: {(caps as { reason?: string }).reason ?? "לא ידוע"}
			</div>
		);
	}
	const tone = caps.writeApiEnabled ? "border-go/30 bg-go/5 text-go" : "border-gold/30 bg-gold/10 text-gold";
	return (
		<div className={`rounded-lg border px-5 py-3 text-xs ${tone}`}>
			<span className="font-bold">פלאגין v{caps.pluginVersion}</span>
			{" · "}
			{caps.writeApiEnabled ? "Write API פעיל" : "Write API כבוי באתר!"}
			{caps.yoastActive ? " · Yoast פעיל" : " · Yoast לא פעיל"}
			{caps.supportedActions && (
				<span className="text-ink-mute"> · נתמך: {caps.supportedActions.length} סוגי פעולות</span>
			)}
		</div>
	);
}
