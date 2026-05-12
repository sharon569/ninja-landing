import { notFound } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { classifyPage, type ClientScopeConfig, type PageClassification } from "@/lib/page-scope";
import { OpportunityRow } from "../opportunities/OpportunityRow";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const client = await db.client.findUnique({ where: { id } });
	if (!client) notFound();

	const opportunities = await db.opportunity.findMany({
		where: {
			clientId: id,
			status: { in: ["recommended", "needs_human_review"] },
		},
		orderBy: [{ priorityScore: "desc" }, { detectedAt: "desc" }],
	});

	// Phase 15C.3 — classify each opportunity's relatedPage so OpportunityRow
	// can render the "Ignored for SEO" badge on historical rows.
	const scopeCfg: ClientScopeConfig = {
		targetPages: client.targetPages,
		seoIgnoredUrls: client.seoIgnoredUrls,
		seoIgnoredPatterns: client.seoIgnoredPatterns,
		seoForcedTargetUrls: client.seoForcedTargetUrls,
	};
	const classificationCache = new Map<string, PageClassification>();
	function classify(url: string): PageClassification | null {
		if (!url) return null;
		const cached = classificationCache.get(url);
		if (cached) return cached;
		const c = classifyPage(url, scopeCfg);
		classificationCache.set(url, c);
		return c;
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-gold border border-gold/30 bg-gold/10 px-2.5 py-1 rounded-full mb-2">
						APPROVAL QUEUE
					</span>
					<h1 className="font-display text-3xl text-ink">
						ממתינות <span className="text-brand-gradient">להחלטה</span>
					</h1>
					<p className="text-sm text-ink-dim max-w-2xl mt-2">
						רק הזדמנויות בסטטוס &quot;מומלץ&quot; או &quot;דורש סקירה ידנית&quot; — דברים שמחכים שתחליט. אישור משנה סטטוס בלבד; אין יישום אוטומטי.
					</p>
				</div>
				<Link
					href={`/clients/${id}/opportunities`}
					className="inline-flex items-center gap-1.5 text-xs text-ink-dim hover:text-gold"
				>
					כל ההזדמנויות
					<ArrowRight className="w-3 h-3" />
				</Link>
			</div>

			{opportunities.length === 0 ? (
				<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-8 py-16 text-center">
					<ClipboardCheck className="w-8 h-8 mx-auto text-go mb-3" />
					<h2 className="font-display text-xl text-ink mb-2">אין משהו שדורש החלטה כרגע</h2>
					<p className="text-sm text-ink-dim max-w-md mx-auto leading-relaxed">
						כל ההזדמנויות כבר אושרו, נדחו, או שעדיין לא הורצה ניתוח. חזור לעמוד ההזדמנויות והרץ ניתוח חדש.
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{opportunities.map((o) => (
						<OpportunityRow
							key={o.id}
							clientId={id}
							pageScope={classify(o.relatedPage)}
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
								approvedActionType: o.approvedActionType,
								approvalNote: o.approvalNote,
								approvedAt: o.approvedAt,
								manuallyAppliedAt: o.manuallyAppliedAt,
								manualActionNote: o.manualActionNote,
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}
