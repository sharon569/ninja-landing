import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { loadWorkflow, computeCounts, filterByTab } from "@/lib/workflow-server";
import { Tabs } from "./Tabs";
import { WorkflowList } from "./WorkflowList";

export const dynamic = "force-dynamic";

interface SearchParams {
	tab?: string;
}

export default async function WorkflowPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<SearchParams>;
}) {
	const { id } = await params;
	const sp = await searchParams;

	const client = await db.client.findUnique({ where: { id } });
	if (!client) notFound();

	const items = await loadWorkflow(id);
	const counts = computeCounts(items);
	const tab = sp.tab ?? "all";
	const visibleItems = filterByTab(items, tab);

	return (
		<div className="space-y-8">
			<div>
				<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full mb-2">
					WORKFLOW CENTER
				</span>
				<h1 className="font-display text-3xl text-ink">
					מרכז <span className="text-brand-gradient">עבודה SEO</span>
				</h1>
				<p className="text-sm text-ink-dim max-w-2xl mt-2">
					כאן מרוכזות כל הפעולות שממתינות להחלטה, אישור או מעקב — Opportunities, Briefs, Internal Link Suggestions, ופעולות במעקב Impact. תור עבודה ממוקד, לא דוח.
				</p>
			</div>

			{/* Summary chips */}
			<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
				<Chip label="סה״כ פתוחים" value={counts.total} />
				<Chip label="דורש החלטה" value={counts.needsDecision} tone="warn" />
				<Chip label="High Impact" value={counts.highImpact} tone="bad" />
				<Chip label="בריפים" value={counts.content} />
				<Chip label="קישורים פנימיים" value={counts.internalLinks} />
				<Chip label="טכני" value={counts.technical} />
				<Chip label="במעקב" value={counts.monitoring} tone="good" />
			</div>

			{/* Tabs */}
			<Tabs counts={counts} />

			{/* List */}
			{visibleItems.length === 0 ? (
				<EmptyState />
			) : (
				<WorkflowList clientId={id} items={visibleItems} />
			)}
		</div>
	);
}

function Chip({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: number;
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
			<div className={`font-display text-2xl tabular-nums mt-1 ${color}`}>
				{value}
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-8 py-16 text-center">
			<Inbox className="w-8 h-8 mx-auto text-go mb-3" />
			<h2 className="font-display text-xl text-ink mb-2">תור עבודה ריק</h2>
			<p className="text-sm text-ink-dim max-w-md mx-auto leading-relaxed">
				אין כרגע פריטים שדורשים החלטה או נמצאים במעקב. הרץ &quot;נתח הזדמנויות SEO&quot; או &quot;נתח קישורים פנימיים&quot; כדי לייצר פריטי עבודה חדשים.
			</p>
		</div>
	);
}
