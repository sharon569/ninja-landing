import { notFound } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { db } from "@/lib/db";
import { typeLabel, IMPACT_RESULT_LABELS } from "@/lib/opportunities";

export const dynamic = "force-dynamic";

export default async function ImpactPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const client = await db.client.findUnique({ where: { id } });
	if (!client) notFound();

	const opps = await db.opportunity.findMany({
		where: {
			clientId: id,
			status: { in: ["monitoring", "manually_applied", "impact_reviewed"] },
		},
		orderBy: { manuallyAppliedAt: "desc" },
		include: {
			baseline: true,
			impactReviews: { orderBy: { reviewWindow: "asc" } },
		},
	});

	// Summary counters across all reviews
	const allReviews = opps.flatMap((o) => o.impactReviews);
	const counts = {
		monitoring: opps.length,
		improved: allReviews.filter((r) => r.result === "improved").length,
		neutral: allReviews.filter((r) => r.result === "neutral").length,
		declined: allReviews.filter((r) => r.result === "declined").length,
		notEnoughData: allReviews.filter((r) => r.result === "not_enough_data" || r.result === "needs_more_time").length,
	};

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-go border border-go/30 bg-go/10 px-2.5 py-1 rounded-full mb-2">
						IMPACT TRACKING
					</span>
					<h1 className="font-display text-3xl text-ink">
						מעקב <span className="text-brand-gradient">השפעה</span>
					</h1>
					<p className="text-sm text-ink-dim max-w-2xl mt-2">
						פעולות שאושרו וסומנו כבוצעו ידנית, ומדידת ההשפעה שלהן על ה-GSC ב-7 / 14 / 30 ימים.
					</p>
				</div>
				<Link
					href={`/clients/${id}/opportunities`}
					className="inline-flex items-center gap-1.5 text-xs text-ink-dim hover:text-gold"
				>
					ההזדמנויות הפעילות
					<ArrowRight className="w-3 h-3" />
				</Link>
			</div>

			{/* Summary chips */}
			<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
				<Chip label="במעקב" value={counts.monitoring} />
				<Chip label="השתפרו" value={counts.improved} tone="good" />
				<Chip label="ניטרליות" value={counts.neutral} />
				<Chip label="ירדו" value={counts.declined} tone="bad" />
				<Chip label="אין מספיק נתונים" value={counts.notEnoughData} tone="mute" />
			</div>

			{opps.length === 0 ? (
				<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-8 py-16 text-center">
					<Activity className="w-8 h-8 mx-auto text-gold mb-3" />
					<h2 className="font-display text-xl text-ink mb-2">אין פעולות במעקב</h2>
					<p className="text-sm text-ink-dim max-w-md mx-auto leading-relaxed">
						אחרי שתאשר הזדמנות וצסמן אותה כבוצעה ידנית, היא תופיע כאן עם snapshot של נתוני ה-GSC שלפני הביצוע — ותוכל לבדוק את ההשפעה אחרי 7/14/30 ימים.
					</p>
				</div>
			) : (
				<div className="space-y-4">
					{opps.map((o) => (
						<article
							key={o.id}
							className="rounded-xl border border-ninja-line bg-ninja-panel/60 overflow-hidden"
						>
							<header className="px-5 py-4 border-b border-ninja-line flex items-start gap-4">
								<div className="flex-1 min-w-0">
									<div className="flex flex-wrap items-baseline gap-2 mb-1">
										<h3 className="text-base font-semibold text-ink truncate">
											{o.title}
										</h3>
										<span className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
											{typeLabel(o.type)}
										</span>
									</div>
									<div className="text-xs text-ink-dim flex flex-wrap gap-x-4 gap-y-0.5">
										{o.manuallyAppliedAt && (
											<span>
												בוצע ב-
												<span className="text-ink">
													{new Date(o.manuallyAppliedAt).toLocaleDateString("he-IL")}
												</span>
											</span>
										)}
										{o.manualActionUrl && (
											<a
												href={o.manualActionUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center gap-1 text-gold hover:text-blade font-mono"
												dir="ltr"
											>
												{new URL(o.manualActionUrl).pathname}
												<ExternalLink className="w-3 h-3" />
											</a>
										)}
									</div>
									{o.manualActionNote && (
										<p className="text-xs text-ink mt-2 leading-relaxed">{o.manualActionNote}</p>
									)}
								</div>
							</header>

							{/* Baseline + reviews */}
							<div className="p-5 space-y-4">
								{o.baseline ? (
									<>
										<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
											Baseline · {o.baseline.baselineStartDate} → {o.baseline.baselineEndDate}
										</div>
										<div className="grid grid-cols-4 gap-3">
											<BaselineCell label="קליקים" value={o.baseline.clicks.toLocaleString()} />
											<BaselineCell label="חשיפות" value={o.baseline.impressions.toLocaleString()} />
											<BaselineCell label="CTR" value={`${(o.baseline.ctr * 100).toFixed(2)}%`} />
											<BaselineCell label="מיקום" value={o.baseline.position.toFixed(1)} />
										</div>
									</>
								) : (
									<div className="text-xs text-ink-dim">לא נשמר Baseline. סמן שוב את הפעולה כבוצעה כדי לרענן.</div>
								)}

								{/* Reviews per window */}
								<div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-ninja-line">
									{["7d", "14d", "30d"].map((w) => {
										const r = o.impactReviews.find((x) => x.reviewWindow === w);
										return <ReviewCell key={w} reviewWindow={w} review={r} />;
									})}
								</div>
							</div>
						</article>
					))}
				</div>
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
	tone?: "neutral" | "good" | "bad" | "mute";
}) {
	const color =
		tone === "good"
			? "text-go"
			: tone === "bad"
				? "text-blade"
				: tone === "mute"
					? "text-ink-mute"
					: "text-ink";
	return (
		<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 px-4 py-3">
			<div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-mute">{label}</div>
			<div className={`font-display text-2xl tabular-nums mt-1 ${color}`}>{value}</div>
		</div>
	);
}

function BaselineCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-ninja-line bg-ninja-raised/40 px-3 py-2">
			<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">{label}</div>
			<div className="text-sm text-ink mt-0.5 tabular-nums">{value}</div>
		</div>
	);
}

function ReviewCell({
	reviewWindow,
	review,
}: {
	reviewWindow: string;
	review: {
		clicksBefore: number;
		clicksAfter: number;
		positionBefore: number;
		positionAfter: number;
		ctrBefore: number;
		ctrAfter: number;
		result: string;
		summary: string;
	} | undefined;
}) {
	if (!review) {
		return (
			<div className="rounded-md border border-ninja-line bg-ninja-raised/30 px-3 py-3 text-center">
				<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mb-1">
					{reviewWindow}
				</div>
				<div className="text-xs text-ink-dim">לחץ &quot;בדוק {reviewWindow}&quot; בדף ההזדמנויות</div>
			</div>
		);
	}
	const meta = IMPACT_RESULT_LABELS[review.result] ?? { label: review.result, tone: "mute" };
	const icon =
		review.result === "improved" ? (
			<TrendingUp className="w-3.5 h-3.5 text-go" />
		) : review.result === "declined" ? (
			<TrendingDown className="w-3.5 h-3.5 text-blade" />
		) : (
			<Minus className="w-3.5 h-3.5 text-ink-mute" />
		);
	const toneCls =
		meta.tone === "good"
			? "border-go/30 bg-go/5"
			: meta.tone === "bad"
				? "border-blade/30 bg-blade/5"
				: meta.tone === "warn"
					? "border-gold/30 bg-gold/5"
					: "border-ninja-line bg-ninja-raised/40";
	return (
		<div className={`rounded-md border ${toneCls} px-3 py-3`}>
			<div className="flex items-center justify-between mb-2">
				<span className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
					{reviewWindow}
				</span>
				<span className="inline-flex items-center gap-1 text-[11px] font-bold">
					{icon}
					<span className="text-ink">{meta.label}</span>
				</span>
			</div>
			<p className="text-xs text-ink-dim leading-relaxed">{review.summary}</p>
		</div>
	);
}
