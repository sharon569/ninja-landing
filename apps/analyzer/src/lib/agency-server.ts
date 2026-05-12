// Agency Command Center — server-only loader.
//
// Strict performance budget: one bounded query per resource, NEVER load
// heavy JSON payload columns (Finding.payload, Opportunity.evidence,
// ContentBrief.outline, etc.). Aggregates in memory by clientId.

import "server-only";
import { db } from "./db";
import { calcHealthScore } from "./health-score";
import { calcProfileCompletion } from "./profile";
import { priorityBand } from "./opportunities";
import type {
	ClientSummary,
	AgencyTotals,
	AttentionItem,
	QueueItem,
	Bottlenecks,
	ActivityEntry,
	AgencyDashboard,
} from "./agency";

const ACTIVE_OPP_STATUSES = [
	"detected",
	"recommended",
	"needs_human_review",
	"approved",
];
const MONITORING_OPP_STATUSES = [
	"monitoring",
	"manually_applied",
	"impact_reviewed",
];

function hostOf(baseUrl: string): string {
	try {
		return new URL(baseUrl).host.replace(/^www\./, "");
	} catch {
		return baseUrl;
	}
}

function daysAgo(d: Date | null): number | null {
	if (!d) return null;
	return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export async function loadAgencyDashboard(): Promise<AgencyDashboard> {
	// ─── Bulk queries (no heavy JSON columns) ─────────────────────

	const [
		clients,
		opps,
		briefs,
		links,
		scans,
		keywords,
		impactReviews,
		oppLogs,
		gscAccount,
		gscDailyRows,
	] = await Promise.all([
		db.client.findMany({
			orderBy: { createdAt: "asc" },
			select: {
				id: true,
				name: true,
				baseUrl: true,
				vertical: true,
				language: true,
				country: true,
				serviceAreas: true,
				seoGoals: true,
				targetPages: true,
				competitors: true,
				automationLevel: true,
				createdAt: true,
				lastScanAt: true,
			},
		}),
		db.opportunity.findMany({
			where: {
				status: { in: [...ACTIVE_OPP_STATUSES, ...MONITORING_OPP_STATUSES] },
			},
			select: {
				id: true,
				clientId: true,
				type: true,
				title: true,
				status: true,
				priorityScore: true,
				impact: true,
				relatedKeyword: true,
				relatedPage: true,
				updatedAt: true,
				approvedAt: true,
				manuallyAppliedAt: true,
			},
		}),
		db.contentBrief.findMany({
			where: { status: { in: ["draft", "needs_human_review", "approved"] } },
			select: {
				id: true,
				clientId: true,
				targetKeyword: true,
				recommendedTitle: true,
				briefType: true,
				status: true,
				relatedPage: true,
				createdAt: true,
				updatedAt: true,
			},
		}),
		db.internalLinkSuggestion.findMany({
			where: { status: { in: ["suggested", "needs_human_review", "approved"] } },
			select: {
				id: true,
				clientId: true,
				sourcePage: true,
				targetPage: true,
				targetTitle: true,
				suggestedAnchor: true,
				status: true,
				priorityScore: true,
				impact: true,
				updatedAt: true,
			},
		}),
		// Latest scan per client + high-severity tech finding counts via raw query
		db.scan.findMany({
			orderBy: [{ clientId: "asc" }, { ranAt: "desc" }],
			select: {
				id: true,
				clientId: true,
				ranAt: true,
				findings: {
					where: { ruleId: { startsWith: "tech_" }, severity: "high" },
					select: { id: true },
				},
			},
		}),
		db.targetKeyword.groupBy({
			by: ["clientId"],
			_count: { _all: true },
		}),
		db.impactReview.findMany({
			select: { clientId: true, opportunityId: true, reviewDate: true, result: true },
		}),
		db.opportunityActionLog.findMany({
			orderBy: { createdAt: "desc" },
			take: 30,
			select: {
				id: true,
				clientId: true,
				opportunityId: true,
				actionType: true,
				fromStatus: true,
				toStatus: true,
				note: true,
				createdBy: true,
				createdAt: true,
			},
		}),
		db.gscAccount.findFirst({
			select: { googleEmail: true, updatedAt: true },
		}),
		// For "last GSC data per client" → take most recent fetchedAt per clientId
		db.gscDailyRow.groupBy({
			by: ["clientId"],
			_max: { fetchedAt: true },
		}),
	]);

	// ─── Index aggregates by clientId ──────────────────────────────

	const keywordCount = new Map<string, number>();
	for (const k of keywords) keywordCount.set(k.clientId, k._count._all);

	const gscFetchByClient = new Map<string, Date | null>();
	for (const g of gscDailyRows)
		gscFetchByClient.set(g.clientId, g._max.fetchedAt);

	const latestScanByClient = new Map<
		string,
		{ ranAt: Date; techHighCount: number }
	>();
	for (const s of scans) {
		// `scans` is sorted (clientId asc, ranAt desc) — first per clientId wins
		if (latestScanByClient.has(s.clientId)) continue;
		latestScanByClient.set(s.clientId, {
			ranAt: s.ranAt,
			techHighCount: s.findings.length,
		});
	}

	// Opportunity buckets per client
	interface OppBuckets {
		open: number;
		highImpact: number;
		needsReview: number;
		approvedNotApplied: number;
		monitoring: number;
		pendingImpactReview: number;
	}
	const oppByClient = new Map<string, OppBuckets>();
	const reviewsByOpp = new Map<string, number>(); // count of reviews per opportunityId
	for (const r of impactReviews)
		reviewsByOpp.set(r.opportunityId, (reviewsByOpp.get(r.opportunityId) ?? 0) + 1);

	for (const o of opps) {
		const bucket = oppByClient.get(o.clientId) ?? {
			open: 0,
			highImpact: 0,
			needsReview: 0,
			approvedNotApplied: 0,
			monitoring: 0,
			pendingImpactReview: 0,
		};
		if (ACTIVE_OPP_STATUSES.includes(o.status)) {
			bucket.open++;
			if (priorityBand(o.priorityScore).bucket === "high") bucket.highImpact++;
			if (o.status === "needs_human_review" || o.status === "recommended") bucket.needsReview++;
			if (o.status === "approved" && !o.manuallyAppliedAt) bucket.approvedNotApplied++;
		}
		if (MONITORING_OPP_STATUSES.includes(o.status)) {
			bucket.monitoring++;
			if ((reviewsByOpp.get(o.id) ?? 0) === 0) bucket.pendingImpactReview++;
		}
		oppByClient.set(o.clientId, bucket);
	}

	const briefByClient = new Map<string, { pending: number; approved: number }>();
	for (const b of briefs) {
		const bucket = briefByClient.get(b.clientId) ?? { pending: 0, approved: 0 };
		if (b.status === "draft" || b.status === "needs_human_review") bucket.pending++;
		if (b.status === "approved") bucket.approved++;
		briefByClient.set(b.clientId, bucket);
	}

	const linkByClient = new Map<string, { suggested: number; approved: number }>();
	for (const l of links) {
		const bucket = linkByClient.get(l.clientId) ?? { suggested: 0, approved: 0 };
		if (l.status === "suggested" || l.status === "needs_human_review") bucket.suggested++;
		if (l.status === "approved") bucket.approved++;
		linkByClient.set(l.clientId, bucket);
	}

	// ─── Build ClientSummary[] ────────────────────────────────────

	const summaries: ClientSummary[] = clients.map((c) => {
		const opp = oppByClient.get(c.id) ?? {
			open: 0,
			highImpact: 0,
			needsReview: 0,
			approvedNotApplied: 0,
			monitoring: 0,
			pendingImpactReview: 0,
		};
		const briefBkt = briefByClient.get(c.id) ?? { pending: 0, approved: 0 };
		const linkBkt = linkByClient.get(c.id) ?? { suggested: 0, approved: 0 };
		const scanInfo = latestScanByClient.get(c.id);
		const gscFetch = gscFetchByClient.get(c.id) ?? null;
		const completion = calcProfileCompletion(c);

		const health = calcHealthScore({
			profileCompletionPct: completion.percent,
			openOpportunities: opp.open,
			highImpactOpen: opp.highImpact,
			highSeverityFindings: scanInfo?.techHighCount ?? 0,
			hasKeywordBank: (keywordCount.get(c.id) ?? 0) > 0,
			hasGscSync: gscFetch !== null,
			gscFreshDays: gscFetch ? daysAgo(gscFetch) : null,
			monitoringCount: opp.monitoring,
			improvedReviews: 0, // exact count would require extra query; close enough for agency view
		});

		return {
			id: c.id,
			name: c.name,
			host: hostOf(c.baseUrl),
			vertical: c.vertical,
			language: c.language,
			country: c.country,
			createdAt: c.createdAt.toISOString(),
			lastScanAt: c.lastScanAt?.toISOString() ?? null,
			lastGscRowFetchedAt: gscFetch?.toISOString() ?? null,
			profileCompletionPct: completion.percent,
			healthScore: health.score,
			healthBand: health.band,
			healthColor: health.bandColor,
			openOpps: opp.open,
			highImpactOpps: opp.highImpact,
			needsReviewOpps: opp.needsReview,
			approvedNotApplied: opp.approvedNotApplied,
			monitoringOpps: opp.monitoring,
			pendingImpactReview: opp.pendingImpactReview,
			briefsPending: briefBkt.pending,
			briefsApproved: briefBkt.approved,
			linksSuggested: linkBkt.suggested,
			linksApproved: linkBkt.approved,
			techHighSeverity: scanInfo?.techHighCount ?? 0,
			keywordsCount: keywordCount.get(c.id) ?? 0,
		};
	});

	// ─── Totals ───────────────────────────────────────────────────

	const totals: AgencyTotals = {
		activeClients: summaries.length,
		avgHealthScore: summaries.length
			? Math.round(
					summaries.reduce((s, c) => s + c.healthScore, 0) / summaries.length,
				)
			: 0,
		totalWorkflowOpen: summaries.reduce(
			(s, c) => s + c.openOpps + c.briefsPending + c.linksSuggested,
			0,
		),
		totalHighImpact: summaries.reduce((s, c) => s + c.highImpactOpps, 0),
		totalNeedsReview: summaries.reduce(
			(s, c) => s + c.needsReviewOpps + c.briefsPending + c.linksSuggested,
			0,
		),
		totalMonitoring: summaries.reduce((s, c) => s + c.monitoringOpps, 0),
		totalTechCritical: summaries.reduce((s, c) => s + c.techHighSeverity, 0),
		totalBriefsPending: summaries.reduce((s, c) => s + c.briefsPending, 0),
		healthBands: summaries.reduce(
			(acc, c) => {
				acc[c.healthBand]++;
				return acc;
			},
			{ excellent: 0, good: 0, warn: 0, poor: 0 },
		),
	};

	// ─── Attention list ───────────────────────────────────────────

	const attention: AttentionItem[] = summaries
		.map((c) => {
			const staleGsc = c.lastGscRowFetchedAt
				? daysAgo(new Date(c.lastGscRowFetchedAt))
				: null;
			const staleScan = c.lastScanAt ? daysAgo(new Date(c.lastScanAt)) : null;
			const reasons: string[] = [];
			let urgency = 0;

			if (c.healthBand === "poor") {
				urgency += 30;
				reasons.push("Health Score נמוך");
			} else if (c.healthBand === "warn") {
				urgency += 15;
				reasons.push("Health Score דורש תשומת לב");
			}
			if (c.highImpactOpps > 0) {
				urgency += Math.min(25, c.highImpactOpps * 5);
				reasons.push(`${c.highImpactOpps} High Impact Opportunities`);
			}
			if (c.needsReviewOpps > 0) {
				urgency += Math.min(15, c.needsReviewOpps * 3);
				reasons.push(`${c.needsReviewOpps} פריטים דורשים סקירה`);
			}
			if (c.techHighSeverity > 0) {
				urgency += Math.min(15, c.techHighSeverity * 4);
				reasons.push(`${c.techHighSeverity} בעיות טכניות חמורות`);
			}
			if (c.approvedNotApplied > 0) {
				urgency += Math.min(10, c.approvedNotApplied * 2);
				reasons.push(`${c.approvedNotApplied} אושרו אבל לא בוצעו`);
			}
			if (c.pendingImpactReview > 0) {
				urgency += Math.min(8, c.pendingImpactReview * 2);
				reasons.push(`${c.pendingImpactReview} ממתינים ל-Impact Review`);
			}
			if (staleGsc !== null && staleGsc > 14) {
				urgency += 8;
				reasons.push(`GSC לא סונכרן ${staleGsc} ימים`);
			}
			if (staleScan !== null && staleScan > 14) {
				urgency += 5;
				reasons.push(`סריקה אחרונה לפני ${staleScan} ימים`);
			}

			return {
				clientId: c.id,
				clientName: c.name,
				host: c.host,
				healthScore: c.healthScore,
				healthBand: c.healthBand,
				highImpactOpps: c.highImpactOpps,
				needsReviewOpps: c.needsReviewOpps,
				approvedNotApplied: c.approvedNotApplied,
				techHighSeverity: c.techHighSeverity,
				staleGscDays: staleGsc,
				staleScanDays: staleScan,
				urgencyScore: Math.min(100, urgency),
				reasons,
			} as AttentionItem;
		})
		.filter((a) => a.urgencyScore > 0)
		.sort((a, b) => b.urgencyScore - a.urgencyScore)
		.slice(0, 10);

	// ─── Cross-Client Priority Queue ──────────────────────────────

	const clientById = new Map(summaries.map((c) => [c.id, c]));
	const queue: QueueItem[] = [];

	for (const o of opps) {
		if (!ACTIVE_OPP_STATUSES.includes(o.status)) continue;
		const c = clientById.get(o.clientId);
		if (!c) continue;
		const needsDecision = o.status === "recommended" || o.status === "needs_human_review";
		queue.push({
			id: `opportunity:${o.id}`,
			clientId: o.clientId,
			clientName: c.name,
			sourceType: "opportunity",
			title: o.title,
			priorityScore: o.priorityScore,
			impact: o.impact,
			status: o.status,
			relatedPage: o.relatedPage || undefined,
			relatedKeyword: o.relatedKeyword || undefined,
			needsDecision,
			updatedAt: o.updatedAt.toISOString(),
			link: `/clients/${o.clientId}/opportunities`,
		});
	}
	for (const b of briefs) {
		const c = clientById.get(b.clientId);
		if (!c) continue;
		queue.push({
			id: `content_brief:${b.id}`,
			clientId: b.clientId,
			clientName: c.name,
			sourceType: "content_brief",
			title: b.targetKeyword,
			priorityScore: 50,
			impact: "medium",
			status: b.status,
			relatedPage: b.relatedPage || undefined,
			needsDecision: b.status === "draft" || b.status === "needs_human_review",
			updatedAt: b.updatedAt.toISOString(),
			link: `/clients/${b.clientId}/briefs`,
		});
	}
	for (const l of links) {
		const c = clientById.get(l.clientId);
		if (!c) continue;
		queue.push({
			id: `internal_link:${l.id}`,
			clientId: l.clientId,
			clientName: c.name,
			sourceType: "internal_link",
			title: `${l.targetTitle || l.targetPage} (anchor: "${l.suggestedAnchor}")`,
			priorityScore: l.priorityScore,
			impact: l.impact,
			status: l.status,
			relatedPage: l.targetPage,
			needsDecision: l.status === "suggested" || l.status === "needs_human_review",
			updatedAt: l.updatedAt.toISOString(),
			link: `/clients/${l.clientId}/internal-links`,
		});
	}

	queue.sort((a, b) => {
		// 1. needs decision first
		if (a.needsDecision !== b.needsDecision) return a.needsDecision ? -1 : 1;
		// 2. impact band
		const bandOrder: Record<string, number> = { high: 0, quick: 1, medium: 2, low: 3 };
		const aBand = bandOrder[priorityBand(a.priorityScore).bucket] ?? 9;
		const bBand = bandOrder[priorityBand(b.priorityScore).bucket] ?? 9;
		if (aBand !== bBand) return aBand - bBand;
		// 3. priority score
		if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
		// 4. client health (lower = more urgent)
		const aHealth = clientById.get(a.clientId)?.healthScore ?? 100;
		const bHealth = clientById.get(b.clientId)?.healthScore ?? 100;
		if (aHealth !== bHealth) return aHealth - bHealth;
		// 5. recency
		return b.updatedAt.localeCompare(a.updatedAt);
	});
	const topQueue = queue.slice(0, 20);

	// ─── Bottlenecks ──────────────────────────────────────────────

	const bottlenecks: Bottlenecks = {
		awaitingApprovalOpps: summaries.reduce((s, c) => s + c.needsReviewOpps, 0),
		briefsAwaitingReview: summaries.reduce((s, c) => s + c.briefsPending, 0),
		linksAwaitingReview: summaries.reduce((s, c) => s + c.linksSuggested, 0),
		approvedNotApplied: summaries.reduce((s, c) => s + c.approvedNotApplied, 0),
		monitoringAwaitingReview: summaries.reduce((s, c) => s + c.pendingImpactReview, 0),
		clientsWithoutGscSync: summaries.filter((c) => !c.lastGscRowFetchedAt).length,
		clientsWithoutKeywordBank: summaries.filter((c) => c.keywordsCount === 0).length,
	};

	// ─── Recent Activity (best-effort) ─────────────────────────────

	const activity: ActivityEntry[] = [];

	// From OpportunityActionLog
	for (const log of oppLogs) {
		const c = clientById.get(log.clientId);
		const toneMap: Record<string, ActivityEntry["tone"]> = {
			approved: "good",
			rejected: "bad",
			dismissed: "neutral",
			marked_manual_applied: "good",
			impact_reviewed: "good",
			brief_created: "neutral",
			status_change: "neutral",
			note_added: "neutral",
		};
		activity.push({
			id: `log:${log.id}`,
			clientId: log.clientId,
			clientName: c?.name ?? log.clientId,
			type: log.actionType,
			tone: toneMap[log.actionType] ?? "neutral",
			title: log.note ?? `${log.fromStatus ?? ""} → ${log.toStatus ?? ""}`,
			note: log.createdBy ?? undefined,
			at: log.createdAt.toISOString(),
		});
	}

	// From recently created opportunities (top 5)
	const recentOpps = opps
		.slice()
		.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
		.slice(0, 5);
	for (const o of recentOpps) {
		const c = clientById.get(o.clientId);
		activity.push({
			id: `opp_update:${o.id}`,
			clientId: o.clientId,
			clientName: c?.name ?? o.clientId,
			type: "opportunity",
			tone: "neutral",
			title: o.title,
			at: o.updatedAt.toISOString(),
		});
	}

	activity.sort((a, b) => b.at.localeCompare(a.at));
	const recent = activity.slice(0, 20);

	return {
		clients: summaries,
		totals,
		attention,
		queue: topQueue,
		bottlenecks,
		recent,
	};
}
