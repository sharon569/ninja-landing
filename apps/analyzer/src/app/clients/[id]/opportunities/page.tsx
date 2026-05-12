import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { priorityBand } from "@/lib/opportunities";
import { OpportunityRow } from "./OpportunityRow";
import { AnalyzeButton } from "./AnalyzeButton";
import { Filters } from "./Filters";

export const dynamic = "force-dynamic";

interface SearchParams {
	type?: string;
	status?: string;
	impact?: string;
	effort?: string;
	confidence?: string;
	keywordOnly?: string;
}

export default async function OpportunitiesPage({
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

	const filter: Record<string, unknown> = { clientId: id };
	if (sp.type) filter.type = sp.type;
	if (sp.status) filter.status = sp.status;
	else
		filter.status = {
			in: ["detected", "recommended", "needs_human_review", "approved", "monitoring"],
		};
	if (sp.impact) filter.impact = sp.impact;
	if (sp.effort) filter.effort = sp.effort;
	if (sp.confidence) filter.confidence = sp.confidence;
	if (sp.keywordOnly === "1") filter.relatedKeyword = { not: "" };

	const opportunities = await db.opportunity.findMany({
		where: filter,
		orderBy: [{ priorityScore: "desc" }, { detectedAt: "desc" }],
	});

	// Summary counts — across ALL active (ignore filters for the headline numbers)
	const allActive = await db.opportunity.findMany({
		where: {
			clientId: id,
			status: { in: ["detected", "recommended", "needs_human_review", "approved"] },
		},
		select: { priorityScore: true, status: true, relatedKeyword: true },
	});
	const counts = {
		total: allActive.length,
		high: allActive.filter((o) => priorityBand(o.priorityScore).bucket === "high").length,
		quickWin: allActive.filter((o) => priorityBand(o.priorityScore).bucket === "quick").length,
		needsReview: allActive.filter((o) => o.status === "needs_human_review").length,
		keywordRelated: allActive.filter((o) => o.relatedKeyword.length > 0).length,
	};

	const lastDetected = opportunities[0]?.detectedAt;

	return (
		<div className="space-y-8">
			{/* Header */}
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full mb-2">
						OPPORTUNITY ENGINE
					</span>
					<h1 className="font-display text-3xl text-ink">
						הזדמנויות <span className="text-brand-gradient">SEO</span>
					</h1>
					<p className="text-sm text-ink-dim max-w-2xl mt-2">
						מנוע אוטומטי שמנתח את נתוני Google Search Console, את מילות היעד שהוגדרו, ואת הפרופיל העסקי של הלקוח — ומציע פעולות לפי עדיפות. אישור פעולה כרגע משנה סטטוס בלבד; לא מבצע שינויים חיים באתר.
					</p>
				</div>
				<AnalyzeButton clientId={id} />
			</div>

			{/* Summary chips */}
			<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
				<SummaryChip label="סה״כ פעילות" value={counts.total} />
				<SummaryChip label="High Impact" value={counts.high} tone="bad" />
				<SummaryChip label="Quick Wins" value={counts.quickWin} tone="warn" />
				<SummaryChip label="Needs Review" value={counts.needsReview} tone="warn" />
				<SummaryChip label="קשורות למילות יעד" value={counts.keywordRelated} tone="neutral" />
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Filters />
				{lastDetected && (
					<span className="text-[11px] text-ink-mute">
						ניתוח אחרון: {new Date(lastDetected).toLocaleString("he-IL")}
					</span>
				)}
			</div>

			{/* List */}
			{opportunities.length === 0 ? (
				<EmptyState />
			) : (
				<div className="space-y-3">
					{opportunities.map((o) => (
						<OpportunityRow
							key={o.id}
							row={{
								id: o.id,
								type: o.type,
								title: o.title,
								description: o.description,
								evidence: o.evidence,
								recommendedAction: o.recommendedAction,
								priorityScore: o.priorityScore,
								impact: o.impact,
								effort: o.effort,
								confidence: o.confidence,
								status: o.status,
								relatedKeyword: o.relatedKeyword,
								relatedPage: o.relatedPage,
								relatedQuery: o.relatedQuery,
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function SummaryChip({
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
		<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 px-4 py-3">
			<div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-mute">
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
			<Sparkles className="w-8 h-8 mx-auto text-gold mb-3" />
			<h2 className="font-display text-xl text-ink mb-2">עדיין אין הזדמנויות לתצוגה</h2>
			<p className="text-sm text-ink-dim max-w-md mx-auto leading-relaxed">
				לחץ על &quot;נתח הזדמנויות SEO&quot; כדי שהמערכת תסרוק את כל נתוני ה-GSC, מילות היעד והפרופיל של הלקוח, ותציג פעולות מומלצות.
			</p>
		</div>
	);
}
