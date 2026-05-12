// SEO Opportunity Engine — server-only detectors + analysis runner.
//
// Each detector is a pure function: (DetectorInput) => DetectedOpportunity[].
// The runner loads data once, hands it to every detector, then upserts the
// results by the compound unique key (clientId, type, kw, page, query) so
// re-runs update existing rows instead of duplicating.

import "server-only";
import { db } from "./db";
import { isSeoEligible, type ClientScopeConfig } from "./page-scope";

export interface DetectedOpportunity {
	type: string;
	title: string;
	description: string;
	evidence: object;
	recommendedAction: string;
	impact: "low" | "medium" | "high";
	effort: "low" | "medium" | "high";
	confidence: "low" | "medium" | "high";
	priorityScore: number;
	relatedKeyword?: string;
	relatedPage?: string;
	relatedQuery?: string;
	source: string;
}

interface GscRow {
	date: string;
	query: string;
	page: string | null;
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
}

interface TargetKw {
	keyword: string;
	priority: string;
	status: string;
	targetUrl: string | null;
}

interface ClientCtx {
	id: string;
	targetPages: string[];
}

interface DetectorInput {
	client: ClientCtx;
	gscRows: GscRow[];
	targetKeywords: TargetKw[];
	// Pre-aggregated views
	byQuery: Map<string, GscRow[]>;
	byQueryAndPage: Map<string, GscRow[]>;
	queries: string[];
}

type Detector = (input: DetectorInput) => DetectedOpportunity[];

// ─── Helpers ─────────────────────────────────────────────────────

/** Expected CTR by average position. Industry-standard ballpark, kept conservative. */
function expectedCtr(position: number): number {
	if (position <= 1.5) return 0.32;
	if (position <= 2.5) return 0.18;
	if (position <= 3.5) return 0.12;
	if (position <= 5) return 0.085;
	if (position <= 7) return 0.06;
	if (position <= 10) return 0.04;
	if (position <= 15) return 0.025;
	if (position <= 20) return 0.015;
	return 0.008;
}

function aggregate(rows: GscRow[]) {
	let clicks = 0,
		impressions = 0,
		positionSum = 0;
	for (const r of rows) {
		clicks += r.clicks;
		impressions += r.impressions;
		positionSum += r.position * Math.max(1, r.impressions);
	}
	const totalWeight = Math.max(1, impressions);
	return {
		clicks,
		impressions,
		ctr: impressions > 0 ? clicks / impressions : 0,
		position: rows.length > 0 ? positionSum / totalWeight : 0,
		days: rows.length,
	};
}

function splitByDate(rows: GscRow[]): { recent: GscRow[]; prior: GscRow[] } {
	if (rows.length === 0) return { recent: [], prior: [] };
	const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
	const dates = Array.from(new Set(sorted.map((r) => r.date))).sort();
	const midpoint = dates[Math.floor(dates.length / 2)];
	return {
		prior: sorted.filter((r) => r.date < midpoint),
		recent: sorted.filter((r) => r.date >= midpoint),
	};
}

/** Score boost helpers — keeps the priorityScore math centralised. */
function scoreFromImpact(impact: string): number {
	return { high: 20, medium: 10, low: 0 }[impact] ?? 0;
}
function scoreFromConfidence(confidence: string): number {
	return { high: 15, medium: 5, low: 0 }[confidence] ?? 0;
}
function scoreFromEffort(effort: string): number {
	return -(({ high: 15, medium: 5, low: 0 }[effort]) ?? 0);
}
function scoreFromImpressions(imp: number): number {
	return Math.min(20, Math.log10(imp + 1) * 5);
}

function baseScore(o: {
	impact: string;
	effort: string;
	confidence: string;
	impressions: number;
	targetKeywordBonus?: number;
	targetPageBonus?: number;
}): number {
	const score =
		40 +
		scoreFromImpact(o.impact) +
		scoreFromConfidence(o.confidence) +
		scoreFromEffort(o.effort) +
		scoreFromImpressions(o.impressions) +
		(o.targetKeywordBonus ?? 0) +
		(o.targetPageBonus ?? 0);
	return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Detectors ───────────────────────────────────────────────────

/** A. Low CTR — high impressions, decent position, CTR below expected. */
const detectLowCtr: Detector = ({ byQuery, client, targetKeywords }) => {
	const out: DetectedOpportunity[] = [];
	const tkSet = new Set(targetKeywords.map((k) => k.keyword.toLowerCase()));

	for (const [query, rows] of byQuery) {
		const agg = aggregate(rows);
		if (agg.impressions < 200) continue; // need signal
		if (agg.position > 15) continue;     // weak ranking — different problem
		const expected = expectedCtr(agg.position);
		if (agg.ctr >= expected * 0.7) continue; // within 70% of expected = fine
		const gap = expected - agg.ctr;
		const potentialExtraClicks = Math.round(agg.impressions * gap);
		if (potentialExtraClicks < 5) continue;

		const isTarget = tkSet.has(query);
		const topPage = rows
			.filter((r) => r.page)
			.sort((a, b) => b.impressions - a.impressions)[0]?.page ?? "";

		out.push({
			type: "low_ctr",
			title: `CTR נמוך: "${query}"`,
			description: `שאילתת חיפוש עם ${agg.impressions.toLocaleString()} חשיפות במיקום ${agg.position.toFixed(1)}, אבל רק ${(agg.ctr * 100).toFixed(2)}% הקלקה — נמוך מהמצופה במיקום הזה (~${(expected * 100).toFixed(1)}%). פוטנציאל של כ-${potentialExtraClicks.toLocaleString()} קליקים נוספים בחודש.`,
			evidence: {
				query,
				impressions: agg.impressions,
				clicks: agg.clicks,
				ctr: agg.ctr,
				avgPosition: agg.position,
				expectedCtr: expected,
				potentialExtraClicks,
				topPage,
			},
			recommendedAction:
				"שיפור כותרת ה-Title ותיאור ה-Meta של העמוד שמדורג על השאילתה כדי להגדיל את אחוז ההקלקה. בדוק שהכותרת מתאימה לכוונת החיפוש.",
			impact: "high",
			effort: "low",
			confidence: "high",
			priorityScore: baseScore({
				impact: "high",
				effort: "low",
				confidence: "high",
				impressions: agg.impressions,
				targetKeywordBonus: isTarget ? 15 : 0,
				targetPageBonus: topPage && client.targetPages.includes(topPage) ? 5 : 0,
			}),
			relatedKeyword: isTarget ? query : "",
			relatedPage: topPage,
			relatedQuery: query,
			source: "detectLowCtr",
		});
	}
	return out;
};

/** B. Quick Win Position — queries on page 2 (positions 4-15). */
const detectQuickWinPosition: Detector = ({ byQuery, client, targetKeywords }) => {
	const out: DetectedOpportunity[] = [];
	const tkSet = new Set(targetKeywords.map((k) => k.keyword.toLowerCase()));

	for (const [query, rows] of byQuery) {
		const agg = aggregate(rows);
		if (agg.position < 4 || agg.position > 15) continue;
		if (agg.impressions < 100) continue;

		const isTarget = tkSet.has(query);
		const topPage = rows
			.filter((r) => r.page)
			.sort((a, b) => b.impressions - a.impressions)[0]?.page ?? "";

		// If page 1 (position 3), expected CTR is much higher.
		const ctrAtPage1 = expectedCtr(3);
		const ctrNow = agg.ctr || expectedCtr(agg.position);
		const potentialClicks = Math.round(agg.impressions * (ctrAtPage1 - ctrNow));

		out.push({
			type: "quick_win_position",
			title: `קרוב לדף 1: "${query}"`,
			description: `השאילתה מדורגת במיקום ממוצע ${agg.position.toFixed(1)} עם ${agg.impressions.toLocaleString()} חשיפות. שיפור למיקום 3 צפוי להוסיף כ-${potentialClicks.toLocaleString()} קליקים בחודש.`,
			evidence: {
				query,
				avgPosition: agg.position,
				impressions: agg.impressions,
				clicks: agg.clicks,
				ctr: agg.ctr,
				potentialClicksAtPage1: potentialClicks,
				topPage,
			},
			recommendedAction:
				"חיזוק העמוד שמדורג: העמקת תוכן, הוספת FAQ רלוונטי, חיזוק קישורים פנימיים מעמודים חזקים. שיפור H1 ו-H2 אם הם לא תואמים בדיוק לשאילתה.",
			impact: "high",
			effort: "medium",
			confidence: "medium",
			priorityScore: baseScore({
				impact: "high",
				effort: "medium",
				confidence: "medium",
				impressions: agg.impressions,
				targetKeywordBonus: isTarget ? 15 : 0,
				targetPageBonus: topPage && client.targetPages.includes(topPage) ? 5 : 0,
			}),
			relatedKeyword: isTarget ? query : "",
			relatedPage: topPage,
			relatedQuery: query,
			source: "detectQuickWinPosition",
		});
	}
	return out;
};

/** C. High Impressions, No Clicks — many views, ~0 clicks. */
const detectHighImpressionsNoClicks: Detector = ({ byQuery }) => {
	const out: DetectedOpportunity[] = [];
	for (const [query, rows] of byQuery) {
		const agg = aggregate(rows);
		if (agg.impressions < 500) continue;
		if (agg.clicks > 2) continue;

		const topPage = rows
			.filter((r) => r.page)
			.sort((a, b) => b.impressions - a.impressions)[0]?.page ?? "";

		out.push({
			type: "high_impressions_no_clicks",
			title: `חשיפות גבוהות בלי קליקים: "${query}"`,
			description: `השאילתה מקבלת ${agg.impressions.toLocaleString()} חשיפות במיקום ממוצע ${agg.position.toFixed(1)}, אבל בקושי קליקים. סימן שאו שהכותרת לא מתאימה לכוונת החיפוש, או שהמתחרים בעמוד 1 חזקים בהרבה.`,
			evidence: {
				query,
				impressions: agg.impressions,
				clicks: agg.clicks,
				avgPosition: agg.position,
				topPage,
			},
			recommendedAction:
				"בדוק את 10 התוצאות המתחרות על השאילתה. עדכן כותרת ותיאור כך שיתאימו לכוונת החיפוש. שקול אם זה תפקיד של העמוד הקיים או שצריך עמוד ייעודי.",
			impact: "medium",
			effort: "medium",
			confidence: "medium",
			priorityScore: baseScore({
				impact: "medium",
				effort: "medium",
				confidence: "medium",
				impressions: agg.impressions,
			}),
			relatedPage: topPage,
			relatedQuery: query,
			source: "detectHighImpressionsNoClicks",
		});
	}
	return out;
};

/** D. Declining Clicks — last 14d vs prior 14d. */
const detectDecliningClicks: Detector = ({ byQuery }) => {
	const out: DetectedOpportunity[] = [];
	for (const [query, rows] of byQuery) {
		if (rows.length < 4) continue;
		const { recent, prior } = splitByDate(rows);
		const r = aggregate(recent);
		const p = aggregate(prior);
		if (p.clicks < 10) continue; // need a baseline
		const delta = r.clicks - p.clicks;
		const dropPct = -delta / p.clicks;
		if (dropPct < 0.3) continue; // need ≥30% drop

		const topPage = rows
			.filter((rr) => rr.page)
			.sort((a, b) => b.impressions - a.impressions)[0]?.page ?? "";

		out.push({
			type: "declining_clicks",
			title: `ירידה בקליקים: "${query}"`,
			description: `${p.clicks.toLocaleString()} קליקים בתקופה הקודמת → ${r.clicks.toLocaleString()} עכשיו (ירידה של ${(dropPct * 100).toFixed(0)}%).`,
			evidence: {
				query,
				priorClicks: p.clicks,
				recentClicks: r.clicks,
				priorImpressions: p.impressions,
				recentImpressions: r.impressions,
				priorPosition: p.position,
				recentPosition: r.position,
				dropPct,
				topPage,
			},
			recommendedAction:
				"בדוק אם המיקום ירד, אם המתחרים שינו משהו, אם התוכן התיישן. רענן את העמוד עם תאריך עדכון, מידע חדש, וקישורים פנימיים חזקים יותר.",
			impact: "medium",
			effort: "medium",
			confidence: "medium",
			priorityScore: baseScore({
				impact: "medium",
				effort: "medium",
				confidence: "medium",
				impressions: r.impressions + p.impressions,
			}),
			relatedPage: topPage,
			relatedQuery: query,
			source: "detectDecliningClicks",
		});
	}
	return out;
};

/** E. Declining Position — average position got worse. */
const detectDecliningPosition: Detector = ({ byQuery }) => {
	const out: DetectedOpportunity[] = [];
	for (const [query, rows] of byQuery) {
		if (rows.length < 4) continue;
		const { recent, prior } = splitByDate(rows);
		const r = aggregate(recent);
		const p = aggregate(prior);
		if (p.impressions < 100) continue;
		if (p.position === 0 || r.position === 0) continue;
		const delta = r.position - p.position; // positive = worse
		if (delta < 2) continue;
		if (r.position > 50) continue; // already lost

		const topPage = rows
			.filter((rr) => rr.page)
			.sort((a, b) => b.impressions - a.impressions)[0]?.page ?? "";

		out.push({
			type: "declining_position",
			title: `ירידה במיקום: "${query}"`,
			description: `מיקום ממוצע ירד מ-${p.position.toFixed(1)} ל-${r.position.toFixed(1)} (פער של ${delta.toFixed(1)} מקומות).`,
			evidence: {
				query,
				priorPosition: p.position,
				recentPosition: r.position,
				delta,
				priorImpressions: p.impressions,
				recentImpressions: r.impressions,
				topPage,
			},
			recommendedAction:
				"בדוק האם הופיע מתחרה חדש, האם יש פתאום קניבליזציה פנימית בין עמודים, או שתוכן העמוד צריך עומק נוסף. בדוק קישורים נכנסים.",
			impact: "medium",
			effort: "medium",
			confidence: "medium",
			priorityScore: baseScore({
				impact: "medium",
				effort: "medium",
				confidence: "medium",
				impressions: r.impressions + p.impressions,
			}),
			relatedPage: topPage,
			relatedQuery: query,
			source: "detectDecliningPosition",
		});
	}
	return out;
};

/** F. Target Keyword Not Ranking — keyword in bank, no GSC data at all. */
const detectTargetKeywordNotRanking: Detector = ({ targetKeywords, byQuery }) => {
	const out: DetectedOpportunity[] = [];
	for (const tk of targetKeywords) {
		if (tk.status === "paused" || tk.status === "lost" || tk.status === "won") continue;
		const rows = byQuery.get(tk.keyword);
		if (rows && aggregate(rows).impressions > 30) continue; // already ranking somewhere

		out.push({
			type: "target_keyword_not_ranking",
			title: `מילת יעד שלא מדורגת: "${tk.keyword}"`,
			description: `המילה נמצאת ב-Keyword Bank של הלקוח, אבל לא צוברת חשיפות משמעותיות ב-Search Console. סביר שאין עמוד שמתאים אליה.`,
			evidence: {
				keyword: tk.keyword,
				priority: tk.priority,
				targetUrl: tk.targetUrl,
				impressions: rows ? aggregate(rows).impressions : 0,
			},
			recommendedAction: tk.targetUrl
				? `יש עמוד יעד מוגדר (${tk.targetUrl}) — בדוק שהוא מאופטם למילה, מכיל אותה בכותרת H1 ובמטא, ובעל תוכן רלוונטי. ייתכן שצריך תוכן תומך נוסף.`
				: `אין עדיין עמוד יעד מוגדר למילה. הצעד הראשון: לקבוע איזה עמוד אמור לדרג, או ליצור עמוד חדש.`,
			impact: tk.priority === "critical" || tk.priority === "high" ? "high" : "medium",
			effort: "high",
			confidence: "high",
			priorityScore: baseScore({
				impact: tk.priority === "critical" || tk.priority === "high" ? "high" : "medium",
				effort: "high",
				confidence: "high",
				impressions: 0,
				targetKeywordBonus: 20 + (tk.priority === "critical" ? 10 : tk.priority === "high" ? 5 : 0),
			}),
			relatedKeyword: tk.keyword,
			source: "detectTargetKeywordNotRanking",
		});
	}
	return out;
};

/** G. Target Keyword Needs Optimization — has rankings but weak. */
const detectTargetKeywordNeedsOptimization: Detector = ({ targetKeywords, byQuery, client }) => {
	const out: DetectedOpportunity[] = [];
	for (const tk of targetKeywords) {
		if (tk.status === "paused" || tk.status === "won") continue;
		const rows = byQuery.get(tk.keyword);
		if (!rows || rows.length === 0) continue;
		const agg = aggregate(rows);
		if (agg.impressions < 50) continue;
		if (agg.position <= 3) continue;         // already great
		if (agg.position >= 40) continue;        // too far — handled by "not ranking" effectively

		const topPage = rows
			.filter((r) => r.page)
			.sort((a, b) => b.impressions - a.impressions)[0]?.page ?? "";

		out.push({
			type: "target_keyword_needs_optimization",
			title: `מילת יעד דורשת שיפור: "${tk.keyword}"`,
			description: `מילה יעד מדורגת במיקום ממוצע ${agg.position.toFixed(1)} עם ${agg.impressions.toLocaleString()} חשיפות. יש פוטנציאל ברור לעלייה.`,
			evidence: {
				keyword: tk.keyword,
				avgPosition: agg.position,
				impressions: agg.impressions,
				clicks: agg.clicks,
				ctr: agg.ctr,
				priority: tk.priority,
				targetPage: topPage,
				configuredTargetUrl: tk.targetUrl,
			},
			recommendedAction:
				"חיזוק העמוד המדורג: שיפור הכותרת והמטא, הוספת תוכן עומק, יצירת FAQ סביב המילה, חיזוק קישורים פנימיים. וודא שה-H1 וה-Title מכילים את המילה.",
			impact: tk.priority === "critical" ? "high" : "high",
			effort: "medium",
			confidence: "high",
			priorityScore: baseScore({
				impact: "high",
				effort: "medium",
				confidence: "high",
				impressions: agg.impressions,
				targetKeywordBonus: 15 + (tk.priority === "critical" ? 10 : tk.priority === "high" ? 5 : 0),
				targetPageBonus: topPage && client.targetPages.includes(topPage) ? 5 : 0,
			}),
			relatedKeyword: tk.keyword,
			relatedPage: topPage,
			relatedQuery: tk.keyword,
			source: "detectTargetKeywordNeedsOptimization",
		});
	}
	return out;
};

/** H. Cannibalization — same query, multiple ranking pages. */
const detectCannibalization: Detector = ({ gscRows }) => {
	const out: DetectedOpportunity[] = [];

	// Group: query -> page -> aggregated metrics
	const byQueryPage = new Map<string, Map<string, { clicks: number; impressions: number; positionSum: number }>>();
	for (const r of gscRows) {
		if (!r.page) continue; // pre-Phase-3 rows skip
		const pageMap = byQueryPage.get(r.query) ?? new Map();
		const a = pageMap.get(r.page) ?? { clicks: 0, impressions: 0, positionSum: 0 };
		a.clicks += r.clicks;
		a.impressions += r.impressions;
		a.positionSum += r.position * Math.max(1, r.impressions);
		pageMap.set(r.page, a);
		byQueryPage.set(r.query, pageMap);
	}

	for (const [query, pageMap] of byQueryPage) {
		if (pageMap.size < 2) continue;
		// Only flag if multiple pages have meaningful impressions
		const pages = Array.from(pageMap.entries())
			.map(([page, m]) => ({
				page,
				clicks: m.clicks,
				impressions: m.impressions,
				avgPosition: m.positionSum / Math.max(1, m.impressions),
			}))
			.filter((p) => p.impressions >= 20)
			.sort((a, b) => b.impressions - a.impressions);
		if (pages.length < 2) continue;

		const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
		if (totalImpressions < 100) continue;

		out.push({
			type: "cannibalization",
			title: `קניבליזציה ב-"${query}": ${pages.length} עמודים מתחרים`,
			description: `${pages.length} עמודים שונים באתר מקבלים חשיפות על אותה שאילתה — בסך הכל ${totalImpressions.toLocaleString()} חשיפות מפוצלות. זה מחליש את שניהם בעיני גוגל.`,
			evidence: {
				query,
				totalImpressions,
				pages: pages.slice(0, 5).map((p) => ({
					page: p.page,
					impressions: p.impressions,
					clicks: p.clicks,
					avgPosition: p.avgPosition,
				})),
			},
			recommendedAction:
				"החלט איזה עמוד צריך להיות המרכזי. חזק אותו עם תוכן ושינוי מטא ממוקד; בעמודים המתחרים — הוסף קישור פנימי לעמוד הראשי, או שיתוף תוכן/canonical.",
			impact: "high",
			effort: "high",
			confidence: "medium",
			priorityScore: baseScore({
				impact: "high",
				effort: "high",
				confidence: "medium",
				impressions: totalImpressions,
			}),
			relatedQuery: query,
			source: "detectCannibalization",
		});
	}

	return out;
};

/** I. New Query Growth — query absent in prior half, present in recent half with signal. */
const detectNewQueryGrowth: Detector = ({ byQuery }) => {
	const out: DetectedOpportunity[] = [];
	for (const [query, rows] of byQuery) {
		const { recent, prior } = splitByDate(rows);
		const r = aggregate(recent);
		const p = aggregate(prior);
		if (p.impressions > 5) continue;     // existed before
		if (r.impressions < 80) continue;    // not yet significant

		const topPage = recent
			.filter((rr) => rr.page)
			.sort((a, b) => b.impressions - a.impressions)[0]?.page ?? "";

		out.push({
			type: "new_query_growth",
			title: `שאילתה חדשה צומחת: "${query}"`,
			description: `שאילתה שלא הופיעה בנתונים בעבר, ולאחרונה צוברת ${r.impressions.toLocaleString()} חשיפות. כדאי לבדוק האם יש פה הזדמנות לתוכן ייעודי.`,
			evidence: {
				query,
				recentImpressions: r.impressions,
				recentClicks: r.clicks,
				priorImpressions: p.impressions,
				avgPosition: r.position,
				topPage,
			},
			recommendedAction:
				"בדוק את כוונת החיפוש מאחורי השאילתה ואת המתחרים. החלט האם להרחיב עמוד קיים, ליצור עמוד נחיתה ייעודי, או לכתוב מאמר תומך.",
			impact: "medium",
			effort: "medium",
			confidence: "low",
			priorityScore: baseScore({
				impact: "medium",
				effort: "medium",
				confidence: "low",
				impressions: r.impressions,
			}),
			relatedPage: topPage,
			relatedQuery: query,
			source: "detectNewQueryGrowth",
		});
	}
	return out;
};

const ALL_DETECTORS: Detector[] = [
	detectLowCtr,
	detectQuickWinPosition,
	detectHighImpressionsNoClicks,
	detectDecliningClicks,
	detectDecliningPosition,
	detectTargetKeywordNotRanking,
	detectTargetKeywordNeedsOptimization,
	detectCannibalization,
	detectNewQueryGrowth,
];

// ─── Runner ──────────────────────────────────────────────────────

export interface AnalyzeResult {
	detected: number;
	created: number;
	updated: number;
	staleClosed: number;
	durationMs: number;
}

/** Run all detectors and upsert results into the Opportunity table. */
export async function analyzeOpportunities(clientId: string): Promise<AnalyzeResult> {
	const startedAt = Date.now();
	const client = await db.client.findUnique({ where: { id: clientId } });
	if (!client) throw new Error(`Client ${clientId} not found`);

	const [gscRows, targetKeywords] = await Promise.all([
		db.gscDailyRow.findMany({
			where: { clientId },
			select: { date: true, query: true, page: true, clicks: true, impressions: true, ctr: true, position: true },
		}),
		db.targetKeyword.findMany({ where: { clientId } }),
	]);

	const byQuery = new Map<string, GscRow[]>();
	const byQueryAndPage = new Map<string, GscRow[]>();
	for (const r of gscRows) {
		const q = r.query;
		const arr = byQuery.get(q) ?? [];
		arr.push(r);
		byQuery.set(q, arr);
		if (r.page) {
			const key = `${q}${r.page}`;
			const arr2 = byQueryAndPage.get(key) ?? [];
			arr2.push(r);
			byQueryAndPage.set(key, arr2);
		}
	}

	const input: DetectorInput = {
		client: { id: client.id, targetPages: client.targetPages },
		gscRows,
		targetKeywords: targetKeywords.map((k) => ({
			keyword: k.keyword,
			priority: k.priority,
			status: k.status,
			targetUrl: k.targetUrl,
		})),
		byQuery,
		byQueryAndPage,
		queries: Array.from(byQuery.keys()),
	};

	const allDetected: DetectedOpportunity[] = [];
	for (const detector of ALL_DETECTORS) {
		try {
			allDetected.push(...detector(input));
		} catch (err) {
			console.error(`Detector failed:`, err);
		}
	}

	// Phase 15C.2 — SEO Crawl Scope gate. Skip any opportunity whose related
	// page is not SEO-eligible (cart/checkout/legal/system/business-info-not-
	// target). Detectors that don't carry a page (cannibalization at the query
	// level) still pass through.
	const scopeCfg: ClientScopeConfig = {
		targetPages: client.targetPages,
		seoIgnoredUrls: client.seoIgnoredUrls,
		seoIgnoredPatterns: client.seoIgnoredPatterns,
		seoForcedTargetUrls: client.seoForcedTargetUrls,
	};
	const scopeCache = new Map<string, boolean>();
	function eligible(url: string | undefined): boolean {
		if (!url) return true;
		const hit = scopeCache.get(url);
		if (hit !== undefined) return hit;
		const ok = isSeoEligible(url, scopeCfg);
		scopeCache.set(url, ok);
		return ok;
	}
	const beforeFilter = allDetected.length;
	const filtered = allDetected.filter((o) => eligible(o.relatedPage));
	if (filtered.length < beforeFilter) {
		console.log(
			`[opportunities] scope filter dropped ${beforeFilter - filtered.length} ineligible-page opportunities`,
		);
	}

	// Sort highest priority first so UI is meaningful even mid-write.
	filtered.sort((a, b) => b.priorityScore - a.priorityScore);

	let created = 0;
	let updated = 0;

	// UPSERT each. Compound unique = (clientId, type, kw, page, query).
	for (const o of filtered) {
		const rk = o.relatedKeyword ?? "";
		const rp = o.relatedPage ?? "";
		const rq = o.relatedQuery ?? "";
		try {
			const result = await db.opportunity.upsert({
				where: {
					clientId_type_relatedKeyword_relatedPage_relatedQuery: {
						clientId,
						type: o.type,
						relatedKeyword: rk,
						relatedPage: rp,
						relatedQuery: rq,
					},
				},
				create: {
					clientId,
					type: o.type,
					title: o.title,
					description: o.description,
					evidence: JSON.stringify(o.evidence),
					recommendedAction: o.recommendedAction,
					priorityScore: o.priorityScore,
					impact: o.impact,
					effort: o.effort,
					confidence: o.confidence,
					status: "detected",
					relatedKeyword: rk,
					relatedPage: rp,
					relatedQuery: rq,
					source: o.source,
				},
				update: {
					title: o.title,
					description: o.description,
					evidence: JSON.stringify(o.evidence),
					recommendedAction: o.recommendedAction,
					priorityScore: o.priorityScore,
					impact: o.impact,
					effort: o.effort,
					confidence: o.confidence,
					source: o.source,
					detectedAt: new Date(),
				},
			});
			// Heuristic to count create vs update: if createdAt matches detectedAt, just inserted.
			if (result.createdAt.getTime() === result.detectedAt.getTime()) created++;
			else updated++;
		} catch (err) {
			console.error(`Upsert failed for opportunity:`, o.type, o.relatedQuery, err);
		}
	}

	// Close stale opportunities — same status only, detectedAt older than now-15 min,
	// and no fresh detection in this run. Marks them 'monitoring' so they don't disappear
	// but no longer show in the active list.
	const cutoff = new Date(Date.now() - 15 * 60 * 1000);
	const stale = await db.opportunity.updateMany({
		where: {
			clientId,
			status: "detected",
			detectedAt: { lt: cutoff },
		},
		data: { status: "monitoring" },
	});

	return {
		detected: filtered.length,
		created,
		updated,
		staleClosed: stale.count,
		durationMs: Date.now() - startedAt,
	};
}
