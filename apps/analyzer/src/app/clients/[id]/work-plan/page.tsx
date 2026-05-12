import { notFound } from "next/navigation";
import Link from "next/link";
import { Sparkles, Layers, ShieldAlert, EyeOff, Activity } from "lucide-react";
import { db } from "@/lib/db";
import { loadWorkPlanWithItems, loadWorkPlanForClient } from "@/lib/work-plan-server";
import {
	GROUP_LABEL,
	GROUP_DESCRIPTION,
	GROUP_TONE,
	PLAN_STATUS_LABEL,
	PLAN_STATUS_TONE,
	APPROVABLE_GROUPS,
	type ItemGroup,
	type PlanSummary,
} from "@/lib/work-plan";
import { BuildPlanButton } from "./BuildPlanButton";
import { ApproveGroupButton } from "./ApproveGroupButton";
import { WorkPlanGroup } from "./WorkPlanGroup";

export const dynamic = "force-dynamic";

export default async function WorkPlanPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const client = await db.client.findUnique({
		where: { id },
		select: { id: true, name: true },
	});
	if (!client) notFound();

	const active = await loadWorkPlanForClient(id);
	const withItems = active ? await loadWorkPlanWithItems(active.id) : null;

	if (!withItems) {
		return (
			<div className="space-y-8">
				<Header clientName={client.name} />
				<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-8 py-16 text-center">
					<Sparkles className="w-8 h-8 mx-auto text-gold mb-3" />
					<h2 className="font-display text-xl text-ink mb-2">אין תוכנית עבודה פעילה</h2>
					<p className="text-sm text-ink-dim max-w-md mx-auto leading-relaxed mb-4">
						בנה תוכנית עבודה כדי שהמערכת תקבץ את כל ה-Opportunities / Strategies / Briefs / קישורים לקבוצות
						מסודרות ותחליט מה בטוח להכין אוטומטית ומה דורש סקירה אנושית.
					</p>
					<BuildPlanButton clientId={id} />
				</div>
			</div>
		);
	}

	const { plan, items } = withItems;
	const summary = plan.summary ? (JSON.parse(plan.summary) as PlanSummary) : null;

	// Group items
	const itemsByGroup: Record<ItemGroup, typeof items> = {
		safe_meta: [],
		quick_wins: [],
		content_expansion: [],
		internal_linking: [],
		human_review: [],
		blocked: [],
		monitor_only: [],
	};
	for (const it of items) {
		const g = it.group as ItemGroup;
		if (itemsByGroup[g]) itemsByGroup[g].push(it);
	}

	const planTone = PLAN_STATUS_TONE[plan.status as keyof typeof PLAN_STATUS_TONE] ?? "neutral";

	return (
		<div className="space-y-8">
			<Header clientName={client.name} />

			{/* Plan header */}
			<section className="rounded-xl border border-ninja-line bg-ninja-panel/60 p-5 space-y-3">
				<div className="flex items-baseline justify-between flex-wrap gap-3">
					<div>
						<h2 className="text-xl font-bold text-ink">{plan.title}</h2>
						<p className="text-xs text-ink-mute mt-1">
							נבנתה ב-{new Date(plan.createdAt).toLocaleString("he-IL")}
							{plan.approvedAt && ` · אושרה ב-${new Date(plan.approvedAt).toLocaleString("he-IL")}`}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<PlanStatusPill status={plan.status} tone={planTone} />
						<BuildPlanButton clientId={id} variant="rebuild" />
					</div>
				</div>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
					<Stat label="סה״כ פריטים" value={plan.totalItems} icon={<Layers className="w-4 h-4" />} />
					<Stat label="בטוחים להכנה" value={plan.safeItemsCount} tone="good" icon={<Sparkles className="w-4 h-4" />} />
					<Stat label="דורש סקירה" value={plan.reviewItemsCount} tone="warn" icon={<ShieldAlert className="w-4 h-4" />} />
					<Stat label="חסומים" value={plan.blockedItemsCount} tone="bad" icon={<EyeOff className="w-4 h-4" />} />
				</div>
				{plan.monitorItemsCount > 0 && (
					<p className="text-xs text-ink-dim pt-2 border-t border-ninja-line">
						<Activity className="w-3.5 h-3.5 inline-block me-1.5 text-go" />
						{plan.monitorItemsCount} פריטים במעקב — לא דורשים פעולה, נשמרים כדי שתראה אותם.
					</p>
				)}
			</section>

			{/* Quick approve bar */}
			<section className="rounded-xl border border-blade/30 bg-blade/5 p-4 space-y-2">
				<div className="text-sm text-ink leading-relaxed">
					<strong>אישור קבוצה = הכנה בלבד.</strong> זה יוצר Briefs / ExecutionActions במצב draft / מאשר קישורים — אבל
					<strong className="text-blade"> לא מריץ Dry Run ולא Execute חי</strong>. כל פעולה ממשית נשארת ידנית בדף Execution.
				</div>
				<div className="flex flex-wrap gap-2 pt-1">
					{APPROVABLE_GROUPS.map((g) => (
						<ApproveGroupButton
							key={g}
							planId={plan.id}
							group={g}
							label={`אשר ${GROUP_LABEL[g]} (${itemsByGroup[g].length})`}
							disabled={itemsByGroup[g].filter((i) => i.decision === "auto_prepare" && i.status === "planned").length === 0}
						/>
					))}
				</div>
			</section>

			{/* Groups */}
			<div className="space-y-4">
				{(["safe_meta", "quick_wins", "content_expansion", "internal_linking", "human_review", "blocked", "monitor_only"] as ItemGroup[]).map((g) => (
					<WorkPlanGroup
						key={g}
						clientId={id}
						planId={plan.id}
						group={g}
						title={GROUP_LABEL[g]}
						description={GROUP_DESCRIPTION[g]}
						tone={GROUP_TONE[g]}
						items={itemsByGroup[g].map((i) => ({
							id: i.id,
							title: i.title,
							summary: i.summary,
							sourceType: i.sourceType,
							sourceId: i.sourceId,
							targetUrl: i.targetUrl,
							actionType: i.actionType,
							riskLevel: i.riskLevel,
							confidence: i.confidence,
							priorityScore: i.priorityScore,
							status: i.status,
							decision: i.decision,
							reason: i.reason,
							blockedReason: i.blockedReason,
							preparedSourceType: i.preparedSourceType,
							preparedSourceId: i.preparedSourceId,
							error: i.error,
						}))}
						approvable={APPROVABLE_GROUPS.includes(g)}
					/>
				))}
			</div>
			{void summary}
		</div>
	);
}

function Header({ clientName }: { clientName: string }) {
	void clientName;
	return (
		<div>
			<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full mb-2">
				SEO WORK PLAN
			</span>
			<h1 className="font-display text-3xl text-ink">
				תוכנית <span className="text-brand-gradient">עבודה SEO</span>
			</h1>
			<p className="text-sm text-ink-dim max-w-2xl mt-2 leading-relaxed">
				תוכנית מקובצת של כל הפעולות הפעילות במערכת — Opportunities, Strategies, Briefs, קישורים — מסווגות לקבוצות בטוחות,
				סקירה אנושית, וחסומים. אישור קבוצה מכין את הפעולות הבאות בלי לבצע שינוי חי באתר.
			</p>
		</div>
	);
}

function PlanStatusPill({ status, tone }: { status: string; tone: "good" | "warn" | "bad" | "neutral" | "mute" }) {
	const cls =
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
		<span className={`inline-flex items-center text-[10px] font-bold tracking-wider rounded-full border px-2.5 py-1 ${cls}`}>
			{PLAN_STATUS_LABEL[status as keyof typeof PLAN_STATUS_LABEL] ?? status}
		</span>
	);
}

function Stat({
	label,
	value,
	tone = "neutral",
	icon,
}: {
	label: string;
	value: number;
	tone?: "good" | "warn" | "bad" | "neutral";
	icon?: React.ReactNode;
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
			<div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.15em] uppercase text-ink-mute">
				{icon}
				{label}
			</div>
			<div className={`font-display text-2xl tabular-nums mt-0.5 ${color}`}>{value}</div>
		</div>
	);
}
