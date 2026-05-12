import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { db } from "@/lib/db";
import { BRIEF_TYPE_OPTIONS, BRIEF_STATUS_OPTIONS } from "@/lib/briefs";
import { BriefRow } from "./BriefRow";

export const dynamic = "force-dynamic";

interface SearchParams {
	status?: string;
	briefType?: string;
	intent?: string;
}

export default async function BriefsPage({
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
	if (sp.briefType) where.briefType = sp.briefType;
	if (sp.intent) where.searchIntent = sp.intent;

	const briefs = await db.contentBrief.findMany({
		where,
		orderBy: { createdAt: "desc" },
	});

	const allBriefs = await db.contentBrief.findMany({
		where: { clientId: id },
		select: { status: true, briefType: true },
	});
	const counts = {
		total: allBriefs.length,
		draft: allBriefs.filter((b) => b.status === "draft").length,
		needsReview: allBriefs.filter((b) => b.status === "needs_human_review").length,
		approved: allBriefs.filter((b) => b.status === "approved").length,
		used: allBriefs.filter((b) => b.status === "used").length,
	};
	const byType = new Map<string, number>();
	for (const b of allBriefs) byType.set(b.briefType, (byType.get(b.briefType) ?? 0) + 1);

	return (
		<div className="space-y-8">
			<div>
				<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full mb-2">
					CONTENT BRIEFS
				</span>
				<h1 className="font-display text-3xl text-ink">
					בריפים <span className="text-brand-gradient">לתוכן SEO</span>
				</h1>
				<p className="text-sm text-ink-dim max-w-2xl mt-2">
					בריפים פנימיים שנוצרים אוטומטית מתוך הזדמנויות SEO. אישור בריף לא מפרסם כלום — רק מסמן שהמערכת אישרה את התוכנית והעבודה מוכנה לביצוע ידני.
				</p>
			</div>

			{/* Summary chips */}
			<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
				<Chip label="סה״כ" value={counts.total} />
				<Chip label="טיוטות" value={counts.draft} />
				<Chip label="ממתינים לסקירה" value={counts.needsReview} tone="warn" />
				<Chip label="מאושרים" value={counts.approved} tone="good" />
				<Chip label="נוצלו" value={counts.used} tone="good" />
			</div>

			{/* By type */}
			{byType.size > 0 && (
				<div className="flex flex-wrap gap-2 text-[11px]">
					{BRIEF_TYPE_OPTIONS.filter((t) => (byType.get(t.value) ?? 0) > 0).map((t) => (
						<span
							key={t.value}
							className="inline-flex items-center gap-1.5 rounded-full border border-ninja-line bg-ninja-raised/40 px-2.5 py-0.5"
						>
							<span className="text-ink-dim">{t.label}</span>
							<span className="text-ink font-bold tabular-nums">{byType.get(t.value)}</span>
						</span>
					))}
				</div>
			)}

			{/* Filters */}
			<form className="flex flex-wrap items-center gap-2 text-xs">
				<Select name="status" defaultValue={sp.status ?? ""}>
					<option value="">כל הסטטוסים</option>
					{BRIEF_STATUS_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</Select>
				<Select name="briefType" defaultValue={sp.briefType ?? ""}>
					<option value="">כל הסוגים</option>
					{BRIEF_TYPE_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</Select>
				<button
					type="submit"
					className="rounded-md border border-ninja-line bg-ninja-raised px-3 py-1.5 text-ink hover:border-gold"
				>
					סנן
				</button>
			</form>

			{briefs.length === 0 ? (
				<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-8 py-16 text-center">
					<FileText className="w-8 h-8 mx-auto text-gold mb-3" />
					<h2 className="font-display text-xl text-ink mb-2">עדיין אין בריפים</h2>
					<p className="text-sm text-ink-dim max-w-md mx-auto leading-relaxed">
						עבור לעמוד הזדמנויות, פתח הזדמנות מתאימה, ולחץ &quot;צור בריף תוכן&quot;. המערכת תייצר תוכנית עבודה מובנית מתוך הקשר העסקי של הלקוח.
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{briefs.map((b) => (
						<BriefRow
							key={b.id}
							row={{
								id: b.id,
								targetKeyword: b.targetKeyword,
								relatedQuery: b.relatedQuery,
								relatedPage: b.relatedPage,
								briefType: b.briefType,
								searchIntent: b.searchIntent,
								recommendedTitle: b.recommendedTitle,
								recommendedMetaDescription: b.recommendedMetaDescription,
								recommendedH1: b.recommendedH1,
								outline: b.outline,
								secondaryKeywords: b.secondaryKeywords,
								internalLinks: b.internalLinks,
								recommendedCTA: b.recommendedCTA,
								recommendedSchema: b.recommendedSchema,
								contentAngle: b.contentAngle,
								notes: b.notes,
								status: b.status,
								createdAt: b.createdAt,
								opportunityId: b.opportunityId,
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
			<div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-mute">{label}</div>
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
