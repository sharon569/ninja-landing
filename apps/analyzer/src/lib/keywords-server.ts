import "server-only";
import { db } from "./db";
import type { KeywordPerf } from "./keywords";

/**
 * Aggregate GSC performance for a list of keywords (matched by exact `query =
 * lowercase(keyword)`).  Returns a map keyword → perf, with zeroed entries for
 * keywords that have no matching GSC data.
 */
export async function loadKeywordPerformance(
	clientId: string,
	keywords: string[],
): Promise<Map<string, KeywordPerf>> {
	if (keywords.length === 0) return new Map();

	const lowered = keywords.map((k) => k.toLowerCase());
	const rows = await db.gscDailyRow.findMany({
		where: { clientId, query: { in: lowered } },
		select: { query: true, clicks: true, impressions: true, position: true },
	});

	const agg = new Map<string, { clicks: number; impressions: number; positionSum: number; days: number }>();
	for (const r of rows) {
		const q = r.query.toLowerCase();
		const prev = agg.get(q) ?? { clicks: 0, impressions: 0, positionSum: 0, days: 0 };
		prev.clicks += r.clicks;
		prev.impressions += r.impressions;
		// Weight position by impressions so high-traffic days dominate.
		prev.positionSum += r.position * Math.max(1, r.impressions);
		prev.days += 1;
		agg.set(q, prev);
	}

	const out = new Map<string, KeywordPerf>();
	for (const k of keywords) {
		const a = agg.get(k.toLowerCase());
		if (!a) {
			out.set(k, { clicks: 0, impressions: 0, ctr: 0, position: 0, days: 0 });
			continue;
		}
		const totalImpressionWeight = Math.max(1, a.impressions);
		out.set(k, {
			clicks: a.clicks,
			impressions: a.impressions,
			ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
			position: a.days > 0 ? a.positionSum / totalImpressionWeight : 0,
			days: a.days,
		});
	}
	return out;
}
