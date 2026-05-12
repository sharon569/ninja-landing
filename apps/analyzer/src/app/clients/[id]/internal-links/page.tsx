import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { db } from "@/lib/db";
import { linkPriorityBand, SUGGESTION_STATUS_OPTIONS } from "@/lib/internal-links";
import { SuggestionRow } from "./SuggestionRow";
import { AnalyzeButton } from "./AnalyzeButton";

export const dynamic = "force-dynamic";

interface SearchParams {
	status?: string;
	impact?: string;
	confidence?: string;
	targetOnly?: string;
	orphanOnly?: string;
}

export default async function InternalLinksPage({
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

	const where: Record<string, unknown> = { clientId: id };
	if (sp.status) where.status = sp.status;
	else
		where.status = {
			in: ["suggested", "needs_human_review", "approved"],
		};
	if (sp.impact) where.impact = sp.impact;
	if (sp.confidence) where.confidence = sp.confidence;
	if (sp.targetOnly === "1") {
		const tpSet = new Set(client.targetPages);
		// We can't easily filter inside Prisma for "in targetPages list" without raw —
		// post-load filter is fine since suggestion volume is bounded.
		where.targetPage = { in: Array.from(tpSet) };
	}
	if (sp.orphanOnly === "1") {
		where.source = "detectOrphanPageSupport";
	}

	const suggestions = await db.internalLinkSuggestion.findMany({
		where,
		orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
		take: 200,
	});

	const allActive = await db.internalLinkSuggestion.findMany({
		where: { clientId: id, status: { in: ["suggested", "needs_human_review", "approved"] } },
		select: { priorityScore: true, status: true, source: true, targetPage: true },
	});

	const counts = {
		total: allActive.length,
		highImpact: allActive.filter((s) => linkPriorityBand(s.priorityScore).bucket === "high").length,
		orphanSupport: allActive.filter((s) => s.source === "detectOrphanPageSupport").length,
		targetBoost: allActive.filter((s) => s.source === "detectTargetPageBoost").length,
		approved: allActive.filter((s) => s.status === "approved").length,
	};

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full mb-2">
						INTERNAL LINKING
					</span>
					<h1 className="font-display text-3xl text-ink">
						קישורים <span className="text-brand-gradient">פנימיים</span>
					</h1>
					<p className="text-sm text-ink-dim max-w-2xl mt-2">
						מנוע שמזהה אילו עמודים זקוקים לקישורים פנימיים נוספים, ומציע מאיפה לחבר אותם עם anchor text מומלץ. אישור הצעה לא מוסיף קישור לאתר — רק מסמן שהמערכת אישרה את הפעולה לביצוע ידני.
					</p>
				</div>
				<AnalyzeButton clientId={id} />
			</div>

			{/* Summary chips */}
			<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
				<Chip label="סה״כ הצעות פעילות" value={counts.total} />
				<Chip label="High Impact" value={counts.highImpact} tone="bad" />
				<Chip label="תמיכה ביתומים" value={counts.orphanSupport} tone="warn" />
				<Chip label="חיזוק עמודי יעד" value={counts.targetBoost} tone="warn" />
				<Chip label="מאושרות" value={counts.approved} tone="good" />
			</div>

			{/* Filters */}
			<form className="flex flex-wrap items-center gap-2 text-xs">
				<Select name="status" defaultValue={sp.status ?? ""}>
					<option value="">סטטוסים פעילים</option>
					{SUGGESTION_STATUS_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</Select>
				<Select name="impact" defaultValue={sp.impact ?? ""}>
					<option value="">כל ההשפעות</option>
					<option value="high">Impact: גבוהה</option>
					<option value="medium">Impact: בינונית</option>
					<option value="low">Impact: נמוכה</option>
				</Select>
				<Select name="confidence" defaultValue={sp.confidence ?? ""}>
					<option value="">כל ה-Confidence</option>
					<option value="high">Confidence: גבוה</option>
					<option value="medium">Confidence: בינוני</option>
					<option value="low">Confidence: נמוך</option>
				</Select>
				<label className="inline-flex items-center gap-2 text-ink-dim cursor-pointer">
					<input
						type="checkbox"
						name="targetOnly"
						value="1"
						defaultChecked={sp.targetOnly === "1"}
						className="accent-blade"
					/>
					רק עמודי יעד
				</label>
				<label className="inline-flex items-center gap-2 text-ink-dim cursor-pointer">
					<input
						type="checkbox"
						name="orphanOnly"
						value="1"
						defaultChecked={sp.orphanOnly === "1"}
						className="accent-blade"
					/>
					רק עמודים יתומים
				</label>
				<button
					type="submit"
					className="rounded-md border border-ninja-line bg-ninja-raised px-3 py-1.5 text-ink hover:border-gold"
				>
					סנן
				</button>
			</form>

			{suggestions.length === 0 ? (
				<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-8 py-16 text-center">
					<Link2 className="w-8 h-8 mx-auto text-gold mb-3" />
					<h2 className="font-display text-xl text-ink mb-2">אין עדיין הצעות לתצוגה</h2>
					<p className="text-sm text-ink-dim max-w-md mx-auto leading-relaxed">
						לחץ &quot;נתח קישורים פנימיים&quot; כדי שהמערכת תסרוק את העמודים, ה-GSC, ומילות היעד, ותציע פעולות לפי עדיפות.
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{suggestions.map((s) => (
						<SuggestionRow
							key={s.id}
							row={{
								id: s.id,
								sourcePage: s.sourcePage,
								sourceTitle: s.sourceTitle,
								targetPage: s.targetPage,
								targetTitle: s.targetTitle,
								suggestedAnchor: s.suggestedAnchor,
								reason: s.reason,
								evidence: s.evidence,
								priorityScore: s.priorityScore,
								impact: s.impact,
								effort: s.effort,
								confidence: s.confidence,
								status: s.status,
								source: s.source,
							}}
						/>
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
			<div className={`font-display text-2xl tabular-nums mt-1 ${color}`}>{value}</div>
		</div>
	);
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select
			{...props}
			className="bg-ninja-raised border border-ninja-line text-ink rounded-md px-2.5 py-1.5 focus:outline-none focus:border-blade/60"
		/>
	);
}
