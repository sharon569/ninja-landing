import { notFound } from "next/navigation";
import Link from "next/link";
import { Inbox, Layers, ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { loadWorkflow, computeCounts, filterByTab } from "@/lib/workflow-server";
import { getActiveWorkPlanSummary } from "@/lib/work-plan-server";
import { PLAN_STATUS_LABEL } from "@/lib/work-plan";
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

	const [items, planSummary] = await Promise.all([
		loadWorkflow(id),
		getActiveWorkPlanSummary(id),
	]);
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

			{/* Active Work Plan banner */}
			{planSummary && (
				<Link
					href={`/clients/${id}/work-plan`}
					className="block rounded-xl border border-gold/30 bg-gold/5 hover:bg-gold/10 p-4 transition-colors"
				>
					<div className="flex items-start justify-between gap-4 flex-wrap">
						<div className="flex items-start gap-3">
							<Layers className="w-5 h-5 text-gold shrink-0 mt-0.5" />
							<div>
								<div className="text-sm font-bold text-ink flex items-center gap-2 flex-wrap">
									תוכנית עבודה פעילה: {planSummary.title}
									<span className="text-[10px] font-bold tracking-wider rounded-full border bg-ninja-raised text-ink-dim border-ninja-line px-2 py-0.5">
										{PLAN_STATUS_LABEL[planSummary.status as keyof typeof PLAN_STATUS_LABEL] ?? planSummary.status}
									</span>
								</div>
								<p className="text-xs text-ink-dim mt-1">
									{planSummary.totalItems} פריטים · {planSummary.safeItemsCount} בטוחים · {planSummary.reviewItemsCount} סקירה · {planSummary.blockedItemsCount} חסומים · {planSummary.monitorItemsCount} במעקב
								</p>
							</div>
						</div>
						<span className="inline-flex items-center gap-1 text-xs text-gold">
							פתח תוכנית עבודה
							<ArrowLeft className="w-3 h-3" />
						</span>
					</div>
				</Link>
			)}
			{!planSummary && (
				<div className="rounded-xl border border-dashed border-gold/30 bg-gold/5 px-4 py-3 text-sm text-ink-dim flex items-center justify-between gap-3 flex-wrap">
					<span>
						<Layers className="w-4 h-4 inline-block me-2 text-gold" />
						עדיין אין תוכנית עבודה פעילה. בנה תוכנית כדי לקבץ את כל הפריטים לקבוצות בטוחות / סקירה / חסום.
					</span>
					<Link href={`/clients/${id}/work-plan`} className="text-xs text-gold hover:text-blade">
						בנה תוכנית →
					</Link>
				</div>
			)}

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
