// Impact baseline + review math (server-only). Pulls from GscDailyRow.

import "server-only";
import { db } from "./db";

interface MatchKey {
	relatedKeyword?: string | null;
	relatedQuery?: string | null;
	relatedPage?: string | null;
}

interface Aggregate {
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
	days: number;
}

/** Aggregate GSC rows matching the opportunity's identity over a date range. */
async function aggregateInRange(
	clientId: string,
	match: MatchKey,
	startDate: string,
	endDate: string,
): Promise<Aggregate> {
	const where: Record<string, unknown> = {
		clientId,
		date: { gte: startDate, lte: endDate },
	};

	const query = match.relatedQuery || match.relatedKeyword;
	if (query) where.query = query.toLowerCase();

	if (match.relatedPage) where.page = match.relatedPage;

	const rows = await db.gscDailyRow.findMany({
		where,
		select: { clicks: true, impressions: true, position: true },
	});

	let clicks = 0;
	let impressions = 0;
	let positionSum = 0;
	for (const r of rows) {
		clicks += r.clicks;
		impressions += r.impressions;
		positionSum += r.position * Math.max(1, r.impressions);
	}
	const weight = Math.max(1, impressions);
	return {
		clicks,
		impressions,
		ctr: impressions > 0 ? clicks / impressions : 0,
		position: rows.length > 0 ? positionSum / weight : 0,
		days: rows.length,
	};
}

function ymdNDaysBefore(d: Date, n: number): string {
	const x = new Date(d);
	x.setUTCDate(x.getUTCDate() - n);
	return x.toISOString().slice(0, 10);
}

function ymd(d: Date): string {
	return d.toISOString().slice(0, 10);
}

/**
 * Snapshot the 28 days of GSC data BEFORE manuallyAppliedAt for this opportunity.
 */
export async function createBaseline(opportunityId: string): Promise<void> {
	const opp = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!opp || !opp.manuallyAppliedAt) return;

	const appliedAt = opp.manuallyAppliedAt;
	const startDate = ymdNDaysBefore(appliedAt, 28);
	const endDate = ymdNDaysBefore(appliedAt, 1); // up to the day before apply

	const agg = await aggregateInRange(
		opp.clientId,
		{
			relatedKeyword: opp.relatedKeyword || null,
			relatedQuery: opp.relatedQuery || null,
			relatedPage: opp.relatedPage || null,
		},
		startDate,
		endDate,
	);

	await db.impactBaseline.upsert({
		where: { opportunityId },
		create: {
			clientId: opp.clientId,
			opportunityId,
			relatedKeyword: opp.relatedKeyword || null,
			relatedQuery: opp.relatedQuery || null,
			relatedPage: opp.relatedPage || null,
			baselineStartDate: startDate,
			baselineEndDate: endDate,
			clicks: agg.clicks,
			impressions: agg.impressions,
			ctr: agg.ctr,
			position: agg.position,
		},
		update: {
			baselineStartDate: startDate,
			baselineEndDate: endDate,
			clicks: agg.clicks,
			impressions: agg.impressions,
			ctr: agg.ctr,
			position: agg.position,
		},
	});
}

/**
 * Compute impact review for one window (7d / 14d / 30d). Stores the row,
 * returns the result classification.
 */
export async function computeImpactReview(
	opportunityId: string,
	reviewWindow: "7d" | "14d" | "30d",
): Promise<{ result: string; summary: string }> {
	const opp = await db.opportunity.findUnique({
		where: { id: opportunityId },
		include: { baseline: true },
	});
	if (!opp || !opp.manuallyAppliedAt) {
		return {
			result: "not_enough_data",
			summary: "הפעולה לא סומנה כבוצעה ידנית — אין מתי להשוות.",
		};
	}
	const baseline = opp.baseline;
	if (!baseline) {
		return {
			result: "not_enough_data",
			summary: "חסר Baseline — לא נוצר snapshot בעת הסימון. סמן שוב כדי ליצור.",
		};
	}

	const windowDays = reviewWindow === "7d" ? 7 : reviewWindow === "14d" ? 14 : 30;
	const appliedAt = opp.manuallyAppliedAt;
	const windowEnd = new Date(appliedAt);
	windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays);

	// If the window hasn't passed yet → not ready.
	if (Date.now() < windowEnd.getTime()) {
		const daysLeft = Math.ceil((windowEnd.getTime() - Date.now()) / 86_400_000);
		const summary = `נשארו עוד כ-${daysLeft} ימים עד שאפשר להעריך את החלון ${reviewWindow}. סנן שוב אחרי שהזמן יחלוף וגם בוצע סנכרון GSC.`;
		await db.impactReview.upsert({
			where: { opportunityId_reviewWindow: { opportunityId, reviewWindow } },
			create: {
				clientId: opp.clientId,
				opportunityId,
				reviewWindow,
				clicksBefore: baseline.clicks,
				clicksAfter: 0,
				impressionsBefore: baseline.impressions,
				impressionsAfter: 0,
				ctrBefore: baseline.ctr,
				ctrAfter: 0,
				positionBefore: baseline.position,
				positionAfter: 0,
				result: "needs_more_time",
				summary,
			},
			update: { result: "needs_more_time", summary, reviewDate: new Date() },
		});
		return { result: "needs_more_time", summary };
	}

	const startDate = ymd(appliedAt);
	const endDate = ymd(windowEnd);

	const after = await aggregateInRange(
		opp.clientId,
		{
			relatedKeyword: opp.relatedKeyword || null,
			relatedQuery: opp.relatedQuery || null,
			relatedPage: opp.relatedPage || null,
		},
		startDate,
		endDate,
	);

	// Insufficient data after — GSC sync hasn't pulled this range yet.
	if (after.days < Math.max(3, Math.floor(windowDays / 2))) {
		const summary =
			"אין עדיין מספיק נתוני GSC עבור התקופה אחרי הפעולה. הרץ סנכרון GSC ובדוק שוב.";
		await db.impactReview.upsert({
			where: { opportunityId_reviewWindow: { opportunityId, reviewWindow } },
			create: {
				clientId: opp.clientId,
				opportunityId,
				reviewWindow,
				clicksBefore: baseline.clicks,
				clicksAfter: after.clicks,
				impressionsBefore: baseline.impressions,
				impressionsAfter: after.impressions,
				ctrBefore: baseline.ctr,
				ctrAfter: after.ctr,
				positionBefore: baseline.position,
				positionAfter: after.position,
				result: "not_enough_data",
				summary,
			},
			update: {
				clicksAfter: after.clicks,
				impressionsAfter: after.impressions,
				ctrAfter: after.ctr,
				positionAfter: after.position,
				result: "not_enough_data",
				summary,
				reviewDate: new Date(),
			},
		});
		return { result: "not_enough_data", summary };
	}

	// Classify. Multiple signals.
	const clicksDelta = after.clicks - baseline.clicks;
	const impressionsDelta = after.impressions - baseline.impressions;
	const positionDelta = baseline.position - after.position; // positive = improved (lower position #)
	const ctrDelta = after.ctr - baseline.ctr;

	const clicksImproved = baseline.clicks > 0
		? clicksDelta / baseline.clicks >= 0.15
		: after.clicks >= 5;
	const clicksDeclined = baseline.clicks > 0 && clicksDelta / baseline.clicks <= -0.15;
	const positionImproved = positionDelta >= 1.5;
	const positionDeclined = positionDelta <= -1.5;
	const ctrImproved = ctrDelta >= 0.005; // half-percentage-point absolute

	let result: string;
	if (clicksImproved || positionImproved || ctrImproved) result = "improved";
	else if (clicksDeclined || positionDeclined) result = "declined";
	else result = "neutral";

	// Hebrew summary
	const parts: string[] = [];
	if (clicksDelta !== 0)
		parts.push(`קליקים: ${baseline.clicks} → ${after.clicks} (${clicksDelta > 0 ? "+" : ""}${clicksDelta})`);
	if (positionDelta !== 0)
		parts.push(`מיקום: ${baseline.position.toFixed(1)} → ${after.position.toFixed(1)} (${positionDelta > 0 ? "שיפור" : "ירידה"} של ${Math.abs(positionDelta).toFixed(1)})`);
	if (Math.abs(ctrDelta) >= 0.001)
		parts.push(`CTR: ${(baseline.ctr * 100).toFixed(1)}% → ${(after.ctr * 100).toFixed(1)}%`);
	if (impressionsDelta !== 0)
		parts.push(`חשיפות: ${baseline.impressions.toLocaleString()} → ${after.impressions.toLocaleString()}`);

	let summary = parts.length > 0 ? parts.join(" · ") : "אין שינויים מובהקים בנתונים.";

	// Phase 14C — if there's a successful ExecutionAction with a snapshot,
	// evaluate against its measurementPlan and append the verdict to the
	// summary so the operator sees "primary metric improved AND protected
	// queries held" (or where they didn't).
	const execAction = await db.executionAction.findFirst({
		where: {
			sourceType: "opportunity",
			sourceId: opportunityId,
			status: { in: ["executed", "rollback_available", "finalized"] },
		},
		orderBy: { executedAt: "desc" },
		select: { decisionSnapshot: true },
	});
	if (execAction?.decisionSnapshot) {
		try {
			const decision = JSON.parse(execAction.decisionSnapshot);
			const mp = decision.measurementPlan;
			if (mp?.primaryMetric) {
				const goalMet = mp.primaryMetric === "ctr"
					? ctrImproved
					: mp.primaryMetric === "clicks"
						? clicksImproved
						: mp.primaryMetric === "position"
							? positionImproved
							: clicksImproved;
				summary += ` · יעד מדידה (${mp.primaryMetric}): ${goalMet ? "הושג ✓" : "טרם הושג"}`;
				if (mp.protectedMetrics?.length) {
					summary += ` · מוגנים לבדיקה: ${mp.protectedMetrics.length}`;
				}
			}
		} catch {
			/* snapshot unparseable — ignore */
		}
	}

	await db.impactReview.upsert({
		where: { opportunityId_reviewWindow: { opportunityId, reviewWindow } },
		create: {
			clientId: opp.clientId,
			opportunityId,
			reviewWindow,
			clicksBefore: baseline.clicks,
			clicksAfter: after.clicks,
			impressionsBefore: baseline.impressions,
			impressionsAfter: after.impressions,
			ctrBefore: baseline.ctr,
			ctrAfter: after.ctr,
			positionBefore: baseline.position,
			positionAfter: after.position,
			result,
			summary,
		},
		update: {
			clicksAfter: after.clicks,
			impressionsAfter: after.impressions,
			ctrAfter: after.ctr,
			positionAfter: after.position,
			result,
			summary,
			reviewDate: new Date(),
		},
	});

	// Mark the opportunity as impact_reviewed if at least one window has a definitive result.
	if (result === "improved" || result === "declined") {
		await db.opportunity.update({
			where: { id: opportunityId },
			data: { status: "impact_reviewed", impactReviewedAt: new Date() },
		});
	}

	return { result, summary };
}
