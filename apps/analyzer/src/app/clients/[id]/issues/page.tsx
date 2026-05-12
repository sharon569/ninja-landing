import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { CATEGORY_LABELS, CATEGORY_ORDER, type AuditCategory, type Finding } from "@/lib/audit/types";
import { TechAuditButton } from "./TechAuditButton";

export const dynamic = "force-dynamic";

const SEVERITY_DOT: Record<string, string> = {
	high: "bg-blade",
	medium: "bg-gold",
	low: "bg-sky-400",
	info: "bg-zinc-400",
};

const SEVERITY_LABEL: Record<string, string> = {
	high: "קריטי",
	medium: "חשוב",
	low: "מינורי",
	info: "מידע",
};

export default async function AuditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	const latestScan = await db.scan.findFirst({
		where: { clientId: id },
		orderBy: { ranAt: "desc" },
		include: {
			findings: { orderBy: [{ severity: "asc" }, { count: "desc" }] },
		},
	});
	if (!latestScan) {
		const client = await db.client.findUnique({ where: { id } });
		if (!client) notFound();
		return (
			<div className="rounded-xl border-2 border-dashed border-ninja-line-strong bg-ninja-panel/60 px-8 py-16 text-center text-sm text-ink-dim">
				אין סריקה עדיין. להריץ סריקה ראשונה מטאב הסקירה כדי לחשוף את הממצאים.
			</div>
		);
	}

	// Parse findings + group by category in the canonical order.
	const findings = latestScan.findings.map((f) => ({
		dbId: f.id,
		severity: f.severity,
		count: f.count,
		parsed: JSON.parse(f.payload) as Finding,
	}));

	const byCategory = new Map<AuditCategory, typeof findings>();
	for (const f of findings) {
		const cat = f.parsed.category;
		const list = byCategory.get(cat) ?? [];
		list.push(f);
		byCategory.set(cat, list);
	}

	const sections = CATEGORY_ORDER
		.map((cat) => ({
			category: cat,
			label: CATEGORY_LABELS[cat],
			findings: byCategory.get(cat) ?? [],
			totalAffected: (byCategory.get(cat) ?? []).reduce((s, f) => s + f.count, 0),
		}))
		.filter((s) => s.findings.length > 0);

	const totalAffected = findings.reduce((s, f) => s + f.count, 0);

	const techFindingsCount = findings.filter((f) => f.parsed.ruleId.startsWith("tech_")).length;

	return (
		<div className="space-y-10">
			{/* Top summary line */}
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-sm text-ink-dim">
						{findings.length} סוגי ממצאים ב-{sections.length} קטגוריות, משפיעים על{" "}
						<span className="font-semibold text-ink tabular-nums">{totalAffected.toLocaleString()}</span> דפים.
						{techFindingsCount > 0 && (
							<>
								{" "}· <span className="text-gold">{techFindingsCount} טכניים</span>
							</>
						)}
					</p>
					<p className="text-xs text-ink-dim mt-1">
						מתוך סריקה ב-{new Date(latestScan.ranAt).toLocaleString("he-IL")}
					</p>
				</div>
				<TechAuditButton clientId={id} />
			</div>

			{/* Section per category */}
			{sections.map((section, idx) => (
				<section key={section.category} className="space-y-4">
					<header className="flex items-baseline justify-between border-b border-ninja-line pb-2">
						<div className="flex items-baseline gap-3">
							<span className="text-xs font-mono text-ink-mute tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
							<h2 className="text-base font-semibold text-ink">{section.label}</h2>
						</div>
						<div className="text-xs text-ink-dim tabular-nums">
							{section.findings.length} ממצאים · {section.totalAffected.toLocaleString()} דפים
						</div>
					</header>
					<div className="space-y-2">
						{section.findings.map((f) => (
							<Link
								key={f.dbId}
								href={`/clients/${id}/issues/${f.dbId}`}
								className="group flex items-start gap-5 rounded-lg border border-ninja-line bg-ninja-panel/60 px-5 py-4 hover:border-ninja-line-strong transition-colors"
							>
								<div className="flex items-center gap-2 pt-1 shrink-0 w-24">
									<span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[f.severity]}`} />
									<span className="text-xs uppercase tracking-wider text-ink-dim">
										{SEVERITY_LABEL[f.severity] ?? f.severity}
									</span>
								</div>
								<div className="flex-1 min-w-0">
									<h3 className="text-sm font-medium text-ink">{f.parsed.title}</h3>
									<p className="text-xs text-ink-dim mt-1 leading-relaxed">{f.parsed.description}</p>
								</div>
								<div className="flex items-center gap-3 shrink-0">
									<span className="text-sm font-semibold text-ink tabular-nums">
										{f.count.toLocaleString()}
									</span>
									<ArrowRight className="w-4 h-4 text-ink-mute group-hover:text-ink-dim transition-colors" />
								</div>
							</Link>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
