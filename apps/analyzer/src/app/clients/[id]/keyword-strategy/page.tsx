import { notFound } from "next/navigation";
import Link from "next/link";
import { Brain, Sparkles, AlertTriangle, TrendingUp, Activity } from "lucide-react";
import { db } from "@/lib/db";
import {
	STRATEGY_STATUS_LABEL,
	STRATEGY_STATUS_TONE,
	STRATEGY_TYPE_LABEL,
	STRATEGY_TYPE_TONE,
	type KeywordStrategySummary,
} from "@/lib/strategy";
import { StrategyCard } from "./StrategyCard";
import { BuildAllButton } from "./BuildAllButton";
import { BuildOneButton } from "./BuildOneButton";

export const dynamic = "force-dynamic";

export default async function KeywordStrategyPage({
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

	const [strategies, keywords] = await Promise.all([
		db.keywordStrategy.findMany({
			where: { clientId: id },
			orderBy: [{ opportunityScore: "desc" }, { updatedAt: "desc" }],
		}),
		db.targetKeyword.findMany({
			where: { clientId: id, status: "active" },
			select: { id: true, keyword: true, priority: true },
			orderBy: { keyword: "asc" },
		}),
	]);

	// Phase 15C — preload briefs already created from these strategies so the
	// StrategyCard can render "פתח Brief" instead of "צור Brief" without
	// requiring a refresh. Indexed by [strategyId][briefType] → briefId.
	const strategyIds = strategies.map((s) => s.id);
	const existingBriefs = strategyIds.length
		? await db.contentBrief.findMany({
				where: {
					clientId: id,
					keywordStrategyId: { in: strategyIds },
				},
				select: { id: true, keywordStrategyId: true, briefType: true, status: true },
			})
		: [];
	const briefsByStrategy = new Map<string, Record<string, { id: string; status: string }>>();
	for (const b of existingBriefs) {
		if (!b.keywordStrategyId) continue;
		const m = briefsByStrategy.get(b.keywordStrategyId) ?? {};
		m[b.briefType] = { id: b.id, status: b.status };
		briefsByStrategy.set(b.keywordStrategyId, m);
	}

	// Keywords that don't yet have a strategy
	const haveStrategy = new Set(strategies.map((s) => s.targetKeywordId));
	const missingStrategy = keywords.filter((k) => !haveStrategy.has(k.id));

	return (
		<div className="space-y-8">
			<div>
				<div className="flex items-center justify-between flex-wrap gap-3">
					<div>
						<div className="flex items-center gap-2">
							<Brain className="w-5 h-5 text-gold" />
							<h2 className="font-display text-2xl text-ink">
								Keyword <span className="text-brand-gradient">Strategy</span>
							</h2>
						</div>
						<p className="text-xs text-ink-dim mt-1 max-w-2xl">
							תוכנית אסטרטגית פר מילת מפתח — סנאפשוט, סיווג, action plan עם הסבר, וניהול מעקב. אין ביצוע חי כאן.
						</p>
					</div>
					{keywords.length > 0 && (
						<BuildAllButton clientId={id} keywordsCount={keywords.length} />
					)}
				</div>
			</div>

			{/* Summary chips */}
			<section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
				<Chip label="סה״כ אסטרטגיות" value={strategies.length} />
				<Chip label="High Potential" value={strategies.filter((s) => s.opportunityScore >= 80).length} tone="good" />
				<Chip label="Quick Win" value={strategies.filter((s) => s.strategyType === "quick_win").length} tone="good" />
				<Chip label="Protect" value={strategies.filter((s) => s.strategyType === "protect_position").length} tone="warn" />
				<Chip label="פעילות" value={strategies.filter((s) => s.status === "active").length} />
				<Chip label="ללא אסטרטגיה" value={missingStrategy.length} tone={missingStrategy.length > 0 ? "warn" : "neutral"} />
			</section>

			{/* Missing strategy block */}
			{missingStrategy.length > 0 && (
				<section className="rounded-lg border border-dashed border-ninja-line bg-ninja-panel/40 p-4 space-y-3">
					<div className="text-sm text-ink">
						<Sparkles className="w-4 h-4 inline-block text-gold me-2" />
						{missingStrategy.length} מילות מפתח עדיין בלי אסטרטגיה
					</div>
					<div className="flex flex-wrap gap-2">
						{missingStrategy.slice(0, 15).map((k) => (
							<BuildOneButton key={k.id} targetKeywordId={k.id} keyword={k.keyword} priority={k.priority} />
						))}
						{missingStrategy.length > 15 && (
							<span className="text-xs text-ink-mute self-center">
								+ {missingStrategy.length - 15} נוספות. השתמש ב-"בנה הכל" למעלה.
							</span>
						)}
					</div>
				</section>
			)}

			{/* Strategies list */}
			<section className="space-y-4">
				{strategies.length === 0 ? (
					<div className="rounded-lg border border-ninja-line bg-ninja-panel/40 px-5 py-10 text-center text-sm text-ink-dim">
						עדיין אין אסטרטגיות. בנה אסטרטגיה למילת מפתח אחת לפחות כדי להתחיל.
					</div>
				) : (
					strategies.map((s) => (
						<StrategyCard
							key={s.id}
							row={{
								id: s.id,
								keyword: s.keyword,
								status: s.status,
								strategyType: s.strategyType,
								riskLevel: s.riskLevel,
								confidence: s.confidence,
								opportunityScore: s.opportunityScore,
								rankingPage: s.rankingPage,
								currentPosition: s.currentPosition,
								currentClicks: s.currentClicks,
								currentImpressions: s.currentImpressions,
								currentCtr: s.currentCtr,
								trend: s.trend,
								targetPageMismatch: s.targetPageMismatch,
								summary: s.summary,
								payload: s.payload,
								updatedAt: s.updatedAt,
							}}
							clientId={id}
							existingBriefsByType={briefsByStrategy.get(s.id) ?? {}}
						/>
					))
				)}
			</section>
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
