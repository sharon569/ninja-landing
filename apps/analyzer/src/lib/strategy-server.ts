// Phase 14D — Keyword Strategy engine (server-only).
//
// Single public entry: computeKeywordStrategy(targetKeywordId).
// Pure: reads TargetKeyword + Client + GSC + existing Opportunities/Briefs/
// InternalLinks/ExecutionActions and produces a KeywordStrategySummary with
// classification (StrategyType), opportunity score, action plan with Why
// per step, research notes, and measurement plan.
//
// Linked to existing system surfaces:
//  - Each ActionStep can reference an Opportunity / Brief / InternalLink /
//    ExecutionAction so the UI can deep-link.
//  - The engine NEVER creates Opportunities, Briefs, or ExecutionActions
//    automatically. It only proposes and links.

import "server-only";
import { db } from "./db";
import {
	ENGINE_VERSION,
	isSubstantiveActionWhy,
	type ActionStep,
	type KeywordResearchSnapshot,
	type KeywordStrategySummary,
	type MeasurementPlan,
	type ResearchNotes,
	type StrategyType,
} from "./strategy";

// ─── Public entry ────────────────────────────────────────────

export async function computeKeywordStrategy(
	targetKeywordId: string,
): Promise<KeywordStrategySummary> {
	const tk = await db.targetKeyword.findUnique({
		where: { id: targetKeywordId },
		include: { client: true },
	});
	if (!tk) throw new Error(`TargetKeyword ${targetKeywordId} not found`);

	const snapshot = await buildSnapshot(tk);

	// Look up related items in the existing system
	const [opps, briefs, links, execs] = await Promise.all([
		db.opportunity.findMany({
			where: {
				clientId: tk.clientId,
				OR: [
					{ relatedKeyword: tk.keyword },
					{ relatedQuery: tk.keyword },
					snapshot.rankingPage ? { relatedPage: snapshot.rankingPage } : { id: "_never" },
				],
			},
			select: { id: true, type: true, status: true, title: true },
			orderBy: { priorityScore: "desc" },
			take: 10,
		}),
		db.contentBrief.findMany({
			where: {
				clientId: tk.clientId,
				OR: [
					{ targetKeyword: tk.keyword },
					{ relatedQuery: tk.keyword },
				],
			},
			select: { id: true, status: true, targetKeyword: true },
			take: 5,
		}),
		db.internalLinkSuggestion.findMany({
			where: {
				clientId: tk.clientId,
				OR: snapshot.rankingPage
					? [{ targetPage: snapshot.rankingPage }, { suggestedAnchor: { contains: tk.keyword, mode: "insensitive" } }]
					: [{ suggestedAnchor: { contains: tk.keyword, mode: "insensitive" } }],
			},
			select: { id: true, status: true, sourcePage: true, targetPage: true, suggestedAnchor: true },
			take: 5,
		}),
		db.executionAction.findMany({
			where: {
				clientId: tk.clientId,
				targetUrl: snapshot.rankingPage ?? "_never",
			},
			select: { id: true, status: true, actionType: true },
			orderBy: { updatedAt: "desc" },
			take: 5,
		}),
	]);

	const strategyType = classifyStrategy(snapshot);
	const { riskLevel, confidence } = computeRiskAndConfidence(snapshot, strategyType);
	const opportunityScore = computeOpportunityScore({ snapshot, tk, strategyType, confidence });

	const actionPlan = buildActionPlan({
		snapshot,
		strategyType,
		opps,
		briefs,
		links,
	});

	const researchNotes = buildResearchNotes(snapshot, strategyType);
	const measurementPlan = buildMeasurementPlan(snapshot);

	const summary = buildSummary({ snapshot, strategyType, opportunityScore });

	return {
		keyword: tk.keyword,
		strategyType,
		riskLevel,
		confidence,
		opportunityScore,
		summary,
		snapshot,
		actionPlan,
		researchNotes,
		measurementPlan,
		relatedOpportunities: opps.map((o) => o.id),
		relatedBriefs: briefs.map((b) => b.id),
		relatedInternalLinks: links.map((l) => l.id),
		relatedExecutions: execs.map((e) => e.id),
		computedAt: new Date().toISOString(),
		engineVersion: ENGINE_VERSION,
	};
}

// ─── Snapshot ───────────────────────────────────────────────

async function buildSnapshot(
	tk: { id: string; clientId: string; keyword: string; intent: string | null; targetUrl: string | null },
): Promise<KeywordResearchSnapshot> {
	// Pull last 28 days of GSC for this exact query. date is YYYY-MM-DD string
	// so we string-compare against the same format — works because YYYY-MM-DD
	// is lexicographically sortable.
	const since = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
	const rows = await db.gscDailyRow.findMany({
		where: { clientId: tk.clientId, query: tk.keyword, date: { gte: since } },
		select: { page: true, clicks: true, impressions: true, ctr: true, position: true, date: true },
	});

	// Aggregate per page
	const byPage = new Map<string | null, { clicks: number; impressions: number; positions: number[]; weights: number[] }>();
	let totalClicks = 0;
	let totalImpressions = 0;
	for (const r of rows) {
		const key = r.page ?? null;
		const e = byPage.get(key) ?? { clicks: 0, impressions: 0, positions: [], weights: [] };
		e.clicks += r.clicks;
		e.impressions += r.impressions;
		e.positions.push(r.position);
		e.weights.push(r.impressions || 1);
		byPage.set(key, e);
		totalClicks += r.clicks;
		totalImpressions += r.impressions;
	}

	// Pick the page with the most clicks (or most impressions if no clicks) as
	// the "ranking page" — what Google actually shows for this query.
	let bestPage: string | null = null;
	let bestScore = -1;
	for (const [page, e] of byPage.entries()) {
		const score = e.clicks * 1000 + e.impressions;
		if (score > bestScore) {
			bestScore = score;
			bestPage = page;
		}
	}
	const bestEntry = bestPage !== null ? byPage.get(bestPage) : null;
	const bestPosition = bestEntry && bestEntry.weights.reduce((a, b) => a + b, 0) > 0
		? bestEntry.positions.reduce((acc, p, i) => acc + p * bestEntry.weights[i], 0) /
			bestEntry.weights.reduce((a, b) => a + b, 0)
		: null;

	const positionBucket = bucketize(bestPosition, totalImpressions);
	const ctrPct = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

	// Trend (14d before vs 14d most recent)
	const trend = computeTrend(rows);

	// Other queries on the ranking page (portfolio of the page that ranks)
	const topQueriesOnRankingPage = bestPage
		? await topQueriesOnPage(tk.clientId, bestPage, since)
		: [];

	// Detect competing pages on the same domain (cannibalization)
	const competingPages = Array.from(byPage.keys())
		.filter((p): p is string => p !== null && p !== bestPage)
		.slice(0, 5);

	// Intent + page fit (heuristic on intent + URL hints)
	const intent = mapIntent(tk.intent, tk.keyword);
	const pageFit = derivePageFit(intent, bestPage, tk.targetUrl);

	return {
		keyword: tk.keyword,
		targetPage: tk.targetUrl,
		rankingPage: bestPage,
		targetPageMismatch: !!(tk.targetUrl && bestPage && !urlsEquivalent(tk.targetUrl, bestPage)),
		currentPosition: bestPosition,
		positionBucket,
		clicks28d: totalClicks,
		impressions28d: totalImpressions,
		ctrPct,
		trend,
		topQueriesOnRankingPage,
		competingPages,
		intent,
		pageFit,
	};
}

function bucketize(pos: number | null, impressions: number): KeywordResearchSnapshot["positionBucket"] {
	if (pos === null || !Number.isFinite(pos)) {
		return impressions > 0 ? "unknown" : "not_ranking";
	}
	if (pos <= 3) return "1-3";
	if (pos <= 5) return "4-5";
	if (pos <= 10) return "6-10";
	if (pos <= 20) return "11-20";
	return "21+";
}

function computeTrend(
	rows: Array<{ clicks: number; impressions: number; date: string }>,
): "up" | "down" | "flat" | "unknown" {
	if (rows.length < 8) return "unknown";
	const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
	const mid = Math.floor(sorted.length / 2);
	const a = sorted.slice(0, mid).reduce((s, r) => s + r.clicks, 0);
	const b = sorted.slice(mid).reduce((s, r) => s + r.clicks, 0);
	if (a === 0 && b === 0) return "flat";
	const ratio = b / Math.max(a, 1);
	if (ratio > 1.2) return "up";
	if (ratio < 0.8) return "down";
	return "flat";
}

async function topQueriesOnPage(clientId: string, page: string, since: string) {
	const rows = await db.gscDailyRow.findMany({
		where: { clientId, page, date: { gte: since } },
		select: { query: true, clicks: true, impressions: true, position: true },
	});
	const byQuery = new Map<string, { clicks: number; impressions: number; positions: number[]; weights: number[] }>();
	for (const r of rows) {
		const e = byQuery.get(r.query) ?? { clicks: 0, impressions: 0, positions: [], weights: [] };
		e.clicks += r.clicks;
		e.impressions += r.impressions;
		e.positions.push(r.position);
		e.weights.push(r.impressions || 1);
		byQuery.set(r.query, e);
	}
	const out = Array.from(byQuery.entries()).map(([query, e]) => {
		const totalWeight = e.weights.reduce((a, b) => a + b, 0);
		const weightedPos = totalWeight > 0
			? e.positions.reduce((acc, p, i) => acc + p * e.weights[i], 0) / totalWeight
			: 0;
		return {
			query,
			clicks: e.clicks,
			impressions: e.impressions,
			ctrPct: e.impressions > 0 ? (e.clicks / e.impressions) * 100 : 0,
			position: weightedPos,
		};
	});
	out.sort((a, b) => b.clicks - a.clicks);
	return out.slice(0, 5);
}

function mapIntent(stored: string | null, kw: string): KeywordResearchSnapshot["intent"] {
	if (stored && stored !== "unknown") return stored as KeywordResearchSnapshot["intent"];
	const q = kw.toLowerCase();
	if (/(מחיר|לקנות|הזמנה|order|buy|price|sale|מבצע)/i.test(q)) return "transactional";
	if (/(שירות|תיקון|חברה|service|repair|near\s+me|בקרבת|אזור)/i.test(q)) return "commercial";
	if (/(מה זה|איך|למה|how|what|why|guide|הסבר)/i.test(q)) return "informational";
	return "mixed";
}

function derivePageFit(
	intent: KeywordResearchSnapshot["intent"],
	rankingPage: string | null,
	targetPage: string | null,
): KeywordResearchSnapshot["pageFit"] {
	if (!rankingPage) return "unknown";
	const lower = rankingPage.toLowerCase();
	const isProduct = /\/product\/|\/products\//.test(lower);
	const isCategory = /\/category\/|\/categor|product[_-]cat\//.test(lower);
	const isBlog = /\/blog\/|\/articles?\/|\/post\//.test(lower);

	if (intent === "transactional" && isProduct) return "match";
	if (intent === "commercial" && (isProduct || isCategory)) return "match";
	if (intent === "informational" && isBlog) return "match";
	if (intent === "mixed") return "partial";
	if (targetPage && !urlsEquivalent(targetPage, rankingPage)) return "partial";
	return "partial";
}

function urlsEquivalent(a: string, b: string): boolean {
	const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
	return norm(a) === norm(b);
}

// ─── Classification ─────────────────────────────────────────

function classifyStrategy(s: KeywordResearchSnapshot): StrategyType {
	// Cannibalization first — multiple pages competing for the same keyword.
	if (s.competingPages.length >= 2 && s.impressions28d > 100) {
		return "cannibalization_fix";
	}
	if (s.positionBucket === "1-3") return "protect_position";
	if (s.positionBucket === "4-5") return "internal_link_boost";
	if (s.positionBucket === "6-10") {
		// CTR gap → quick win on Title/Meta. Otherwise content boost.
		if (s.ctrPct < expectedCtrAt(s.currentPosition ?? 7) * 0.6) return "quick_win";
		return "content_boost";
	}
	if (s.positionBucket === "11-20") return "content_boost";
	if (s.positionBucket === "21+") {
		if (s.pageFit === "mismatch" || !s.rankingPage) return "new_content_needed";
		return "content_boost";
	}
	if (s.positionBucket === "not_ranking") return "new_content_needed";
	return "monitor_only";
}

function computeRiskAndConfidence(
	s: KeywordResearchSnapshot,
	strategyType: StrategyType,
): { riskLevel: KeywordStrategySummary["riskLevel"]; confidence: KeywordStrategySummary["confidence"] } {
	let risk: KeywordStrategySummary["riskLevel"] = "low";
	if (strategyType === "protect_position" || strategyType === "cannibalization_fix") risk = "high";
	else if (strategyType === "new_content_needed" || strategyType === "technical_blocker") risk = "medium";
	else if (strategyType === "internal_link_boost") risk = "medium";
	else if (s.competingPages.length >= 1) risk = "medium";

	let confidence: KeywordStrategySummary["confidence"] = "high";
	if (s.impressions28d < 100) confidence = "low";
	else if (s.impressions28d < 300) confidence = "medium";
	if (s.positionBucket === "unknown" || s.positionBucket === "not_ranking") confidence = "low";
	if (s.intent === "mixed" || s.intent === "unknown") confidence = "low";
	return { riskLevel: risk, confidence };
}

function computeOpportunityScore(args: {
	snapshot: KeywordResearchSnapshot;
	tk: { priority: string; status: string };
	strategyType: StrategyType;
	confidence: KeywordStrategySummary["confidence"];
}): number {
	const s = args.snapshot;
	let score = 0;

	// Impressions weight (0..40)
	if (s.impressions28d >= 5000) score += 40;
	else if (s.impressions28d >= 1000) score += 30;
	else if (s.impressions28d >= 300) score += 20;
	else if (s.impressions28d >= 100) score += 10;

	// Position weight (0..25) — proximity to top
	if (s.positionBucket === "1-3") score += 25;
	else if (s.positionBucket === "4-5") score += 22;
	else if (s.positionBucket === "6-10") score += 20;
	else if (s.positionBucket === "11-20") score += 12;
	else if (s.positionBucket === "21+") score += 5;

	// CTR gap potential (0..15) — Quick Win bonus
	if (s.currentPosition !== null) {
		const expected = expectedCtrAt(s.currentPosition);
		const gap = expected - s.ctrPct;
		if (gap >= expected * 0.5) score += 15;
		else if (gap >= expected * 0.25) score += 8;
		else if (gap > 0) score += 3;
	}

	// Priority weight (0..10)
	const priority = args.tk.priority;
	if (priority === "critical") score += 10;
	else if (priority === "high") score += 7;
	else if (priority === "medium") score += 3;

	// Intent fit / page fit (0..10)
	if (s.pageFit === "match") score += 10;
	else if (s.pageFit === "partial") score += 5;

	// Confidence dampener
	if (args.confidence === "low") score = Math.round(score * 0.6);
	else if (args.confidence === "medium") score = Math.round(score * 0.85);

	// Strategy type adjustments
	if (args.strategyType === "monitor_only" || args.strategyType === "not_worth_targeting_now") {
		score = Math.min(score, 35);
	}

	return Math.max(0, Math.min(100, score));
}

function expectedCtrAt(position: number): number {
	if (position <= 1.5) return 27;
	if (position <= 2.5) return 15;
	if (position <= 3.5) return 11;
	if (position <= 5) return 7;
	if (position <= 8) return 4;
	if (position <= 12) return 2;
	if (position <= 20) return 1;
	return 0.5;
}

// ─── Action plan ────────────────────────────────────────────

function buildActionPlan(args: {
	snapshot: KeywordResearchSnapshot;
	strategyType: StrategyType;
	opps: Array<{ id: string; type: string; status: string; title: string }>;
	briefs: Array<{ id: string; status: string; targetKeyword: string }>;
	links: Array<{ id: string; status: string; targetPage: string; sourcePage: string; suggestedAnchor: string }>;
}): ActionStep[] {
	const s = args.snapshot;
	const steps: ActionStep[] = [];
	let n = 1;

	const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(Math.round(n));
	const ctrGap = s.currentPosition !== null
		? Math.max(0, expectedCtrAt(s.currentPosition) - s.ctrPct)
		: 0;

	const protectedQueries = s.topQueriesOnRankingPage
		.filter((q) => q.query !== s.keyword && q.clicks > 0)
		.slice(0, 3)
		.map((q) => q.query);

	switch (args.strategyType) {
		case "protect_position":
			steps.push({
				stepNumber: n++,
				actionType: "monitor",
				action: "מעקב יומי על המיקום והקליקים של הביטוי",
				why: `הביטוי "${s.keyword}" מדורג ${s.currentPosition?.toFixed(1) ?? "?"} (Top 3) עם ${fmt(s.clicks28d)} קליקים מתוך ${fmt(s.impressions28d)} חשיפות. כל שינוי אגרסיבי מסכן את הביצוע הקיים. ראשית — לוודא שאין נסיגה לא מוסברת.`,
				expectedImpact: "שמירה על המיקום הקיים, זיהוי מוקדם של ירידה",
				risk: "low",
				effort: "low",
				priority: "high",
				requiresHumanReview: false,
				suggestedTiming: "now",
			});
			if (ctrGap > 1) {
				steps.push({
					stepNumber: n++,
					actionType: "meta_description_update",
					action: "עדכון Meta Description בלבד (לא Title) כדי לשפר CTR",
					why: `ה-CTR (${s.ctrPct.toFixed(1)}%) נמוך מהציפייה במיקום ${s.currentPosition?.toFixed(1)} (~${expectedCtrAt(s.currentPosition ?? 0).toFixed(1)}%). Meta Description לא משפיע על מיקום אז זה השינוי הבטוח ביותר בקטגוריה הזו. שמור על ${protectedQueries.length ? `הביטויים המוגנים: ${protectedQueries.map((q) => `"${q}"`).join(", ")}` : "התוכן הקיים שמביא קליקים"}.`,
					expectedImpact: `שיפור CTR עד ${(ctrGap * 0.5).toFixed(1)}% תוך 14 ימים, ללא ירידה במיקום`,
					risk: "low",
					effort: "low",
					priority: "high",
					requiresHumanReview: true,
					suggestedTiming: "now",
				});
			}
			steps.push({
				stepNumber: n++,
				actionType: "no_change",
				action: "לא לשנות Title/H1 בשלב הזה",
				why: `העמוד כבר ב-Top 3 על "${s.keyword}". שינוי Title הוא הסיכון הגדול ביותר לאיבוד המיקום הזה. ${protectedQueries.length ? `מעבר לכך, העמוד מקבל קליקים גם מ-${protectedQueries.length} ביטויים נוספים: ${protectedQueries.map((q) => `"${q}"`).join(", ")}.` : ""} שינוי Title עלול להזיק לאחד מהם.`,
				expectedImpact: "מניעת נסיגה",
				risk: "low",
				effort: "low",
				priority: "high",
				requiresHumanReview: false,
				suggestedTiming: "now",
			});
			break;

		case "quick_win":
			steps.push({
				stepNumber: n++,
				actionType: "title_meta_update",
				action: `עדכון Title שמדגיש את "${s.keyword}" בתחילת המשפט, עם CTA ברור`,
				why: `הביטוי במיקום ${s.currentPosition?.toFixed(1)} (Top 10) עם ${fmt(s.impressions28d)} חשיפות אבל CTR של רק ${s.ctrPct.toFixed(1)}% — נמוך משמעותית מהציפייה (~${expectedCtrAt(s.currentPosition ?? 7).toFixed(1)}%). שיפור הצגת ה-Title צפוי להעלות CTR בלי לסכן את המיקום. ${protectedQueries.length ? `שמור על: ${protectedQueries.map((q) => `"${q}"`).join(", ")}.` : ""}`,
				expectedImpact: `עלייה ב-CTR מ-${s.ctrPct.toFixed(1)}% לכיוון ${(expectedCtrAt(s.currentPosition ?? 7) * 0.7).toFixed(1)}% תוך 14 ימים, וצפי לעלייה הדרגתית במיקום ל-4-5`,
				risk: "medium",
				effort: "low",
				priority: "high",
				requiresHumanReview: true,
				suggestedTiming: "now",
				relatedSurface: args.opps[0] ? { opportunityId: args.opps[0].id } : undefined,
			});
			steps.push({
				stepNumber: n++,
				actionType: "internal_linking",
				action: `הוספת 2-3 קישורים פנימיים מעמודים קרובים אלוfו עם anchor שמכיל את "${s.keyword}" או וריאציה`,
				why: `העמוד כבר מקבל ${fmt(s.clicks28d)} קליקים אז יש בסיס. חיזוק authority פנימי בעדינות יכול לדחוף את המיקום ל-Top 5 בלי שינוי חזיתי באתר. בחר מקורות מעמודים שמדורגים על ביטויים קרובים.`,
				expectedImpact: "תמיכה הדרגתית במיקום, נמדדת ב-30 ימים",
				risk: "low",
				effort: "low",
				priority: "high",
				requiresHumanReview: false,
				suggestedTiming: "after_step",
				relatedSurface: args.links[0] ? { internalLinkId: args.links[0].id } : undefined,
			});
			steps.push({
				stepNumber: n++,
				actionType: "monitor",
				action: "Impact Review אחרי 14 ימים — להחליט אם להמשיך לתוכן",
				why: `אחרי שינוי Title + internal links, נחכה ${fmt(14)} ימים. אם המיקום עלה ל-5 ומעלה — להישאר על מעקב. אם נשאר ב-6-10, להוסיף הרחבת תוכן.`,
				expectedImpact: "החלטה מבוססת נתונים על המשך",
				risk: "low",
				effort: "low",
				priority: "medium",
				requiresHumanReview: false,
				suggestedTiming: "after_30d",
			});
			break;

		case "content_boost":
			steps.push({
				stepNumber: n++,
				actionType: "content_expansion",
				action: `הוספת פסקה/H2 שעונה ישירות על "${s.keyword}" עם פרטים ספציפיים`,
				why: `העמוד במיקום ${s.currentPosition?.toFixed(1)} (${POSITION_BUCKET_HEBREW(s.positionBucket)}) עם ${fmt(s.impressions28d)} חשיפות אבל רק ${fmt(s.clicks28d)} קליקים. במיקום הזה Title/Meta יעזרו פחות — צריך לחזק את התשובה שגוגל רואה כדי לעלות למעלה. ${s.intent === "informational" ? "כוונת החיפוש מידעית — תוכן מעמיק הוא הדרך." : "תוכן ספציפי יותר יעזור לטרגוט מדויק."}`,
				expectedImpact: "עלייה הדרגתית במיקום מ-" + (s.currentPosition?.toFixed(1) ?? "?") + " ל-6-10 תוך 30 ימים",
				risk: "medium",
				effort: "medium",
				priority: "high",
				requiresHumanReview: true,
				suggestedTiming: "now",
				relatedSurface: args.briefs[0] ? { briefId: args.briefs[0].id } : undefined,
			});
			steps.push({
				stepNumber: n++,
				actionType: "internal_linking",
				action: `הוספת 3 קישורים פנימיים מעמודים שמדורגים על ביטויים קרובים, עם anchor שמכיל את "${s.keyword}"`,
				why: `קישורים פנימיים מעוצמים יותר משמעותית במיקומים 11-20 מאשר Title — אם העמוד עמוק, גוגל פשוט לא מוצא אותו. ${fmt(s.impressions28d)} חשיפות מראות שיש interest, חסר signal.`,
				expectedImpact: "חיזוק authority של העמוד, עלייה הדרגתית במיקום",
				risk: "low",
				effort: "medium",
				priority: "high",
				requiresHumanReview: false,
				suggestedTiming: "now",
				relatedSurface: args.links[0] ? { internalLinkId: args.links[0].id } : undefined,
			});
			if (ctrGap > 0.5) {
				steps.push({
					stepNumber: n++,
					actionType: "title_meta_update",
					action: "עדכון Title שמרני אחרי הרחבת התוכן",
					why: `אחרי שיפור התוכן, Title מעודכן יכול לסגור את ה-CTR gap (${ctrGap.toFixed(1)}% מתחת לציפייה). לעשות זאת *אחרי* החיזוק, לא לפני — כדי שגוגל יראה את ההקשר החדש כשהוא יחזק את הדירוג.`,
					expectedImpact: "סגירת CTR gap + תמיכה בעלייה במיקום",
					risk: "medium",
					effort: "low",
					priority: "medium",
					requiresHumanReview: true,
					suggestedTiming: "after_30d",
				});
			}
			break;

		case "internal_link_boost":
			steps.push({
				stepNumber: n++,
				actionType: "internal_linking",
				action: `הוספת 3-5 קישורים פנימיים לעמוד הזה מעמודים שמקבלים תנועה`,
				why: `העמוד במיקום ${s.currentPosition?.toFixed(1)} (Top 5) עם ${fmt(s.clicks28d)} קליקים — קרוב מאוד אבל לא בפסגה. שינוי Title באזור הזה מסוכן (יכול לזרוק ל-6-10). חיזוק authority פנימי הוא הצעד הבטוח: anchor טבעי שמכיל את "${s.keyword}" או וריאציה.`,
				expectedImpact: "עלייה הדרגתית מ-" + (s.currentPosition?.toFixed(1) ?? "?") + " לכיוון Top 3 תוך 30 ימים",
				risk: "low",
				effort: "medium",
				priority: "high",
				requiresHumanReview: false,
				suggestedTiming: "now",
				relatedSurface: args.links[0] ? { internalLinkId: args.links[0].id } : undefined,
			});
			if (ctrGap > 1) {
				steps.push({
					stepNumber: n++,
					actionType: "meta_description_update",
					action: "שיפור Meta Description בלבד — לא Title",
					why: `במיקום Top 5, ה-CTR (${s.ctrPct.toFixed(1)}%) רחוק מהציפייה (~${expectedCtrAt(s.currentPosition ?? 4).toFixed(1)}%). Meta בלבד יכול לסגור פער בלי לסכן את המיקום.`,
					expectedImpact: "שיפור CTR עד +1.5% בלי שינוי במיקום",
					risk: "low",
					effort: "low",
					priority: "medium",
					requiresHumanReview: true,
					suggestedTiming: "after_step",
				});
			}
			break;

		case "new_content_needed":
			steps.push({
				stepNumber: n++,
				actionType: "new_landing_page",
				action: `יצירת עמוד נחיתה ייעודי עבור "${s.keyword}"`,
				why: s.rankingPage
					? `העמוד שמדורג היום (${s.rankingPage}) מתאים חלקית בלבד לכוונת החיפוש (intent=${s.intent}). מיקום ${s.currentPosition?.toFixed(1) ?? "?"} ו-${fmt(s.impressions28d)} חשיפות מראים ביקוש, אבל ה-fit לא מספיק כדי לעלות. עמוד ייעודי שעונה ישירות יביא ביצועים טובים יותר.`
					: `אין עמוד באתר שגוגל מדרג על "${s.keyword}". יצירת עמוד ייעודי היא הצעד היחיד שיכול להתחיל לדרג. ${fmt(s.impressions28d)} חשיפות מראות שגוגל ניסה לדרג משהו — צריך לתת לו אופציה טובה.`,
				expectedImpact: "תחילת דירוג תוך 30-60 ימים אם העמוד באיכות גבוהה",
				risk: "high",
				effort: "high",
				priority: "high",
				requiresHumanReview: true,
				suggestedTiming: "now",
				relatedSurface: args.briefs[0] ? { briefId: args.briefs[0].id } : undefined,
			});
			break;

		case "cannibalization_fix":
			steps.push({
				stepNumber: n++,
				actionType: "cannibalization_fix",
				action: `החלטה: מאחד את ${s.competingPages.length + 1} העמודים שמתחרים על "${s.keyword}", או מבדיל ביניהם בכוונת חיפוש`,
				why: `יש ${s.competingPages.length + 1} עמודים שמדורגים על "${s.keyword}" (העמוד הראשי: ${s.rankingPage}, מתחרים: ${s.competingPages.slice(0, 2).join(", ")}). זה מחליש את כולם — גוגל לא יודע למי לתת אוטוריטה. צריך להחליט: מאחד (canonical + 301) או להבדיל את הכוונה.`,
				expectedImpact: "אחרי מיזוג, הדירוג של העמוד שנשאר צפוי לעלות במיקום אחד או יותר",
				risk: "high",
				effort: "high",
				priority: "high",
				requiresHumanReview: true,
				suggestedTiming: "now",
			});
			steps.push({
				stepNumber: n++,
				actionType: "monitor",
				action: "מעקב על המיקום של כל העמודים המתחרים אחרי המיזוג/הבידול",
				why: `אחרי שינוי כל כך משמעותי, לוודא ש-301 הוטמע נכון ושאין נסיגה ב-${fmt(s.clicks28d)} הקליקים שכבר מגיעים.`,
				expectedImpact: "אימות שהמיזוג הצליח לפני המשך פעולות",
				risk: "low",
				effort: "low",
				priority: "high",
				requiresHumanReview: false,
				suggestedTiming: "after_30d",
			});
			break;

		case "monitor_only":
			steps.push({
				stepNumber: n++,
				actionType: "monitor",
				action: "מעקב חודשי — אין פעולה נדרשת כרגע",
				why: `הביטוי "${s.keyword}" ב-${POSITION_BUCKET_HEBREW(s.positionBucket)} עם ${fmt(s.impressions28d)} חשיפות. אין מספיק נתונים או הזדמנות ברורה כדי להצדיק פעולה. נחכה לטרנד.`,
				expectedImpact: "זיהוי מוקדם של שינוי",
				risk: "low",
				effort: "low",
				priority: "low",
				requiresHumanReview: false,
				suggestedTiming: "as_needed",
			});
			break;

		case "not_worth_targeting_now":
			steps.push({
				stepNumber: n++,
				actionType: "no_change",
				action: "לסמן את הביטוי כ-paused / not active ב-Keyword Bank",
				why: `הביטוי "${s.keyword}" לא מצדיק השקעה כרגע: מעט חשיפות (${fmt(s.impressions28d)}), אין עמוד מתאים, ו/או business fit נמוך. עדיף להתמקד בביטויים אחרים עד שמשהו ישתנה.`,
				expectedImpact: "פינוי focus לביטויים עם יותר potential",
				risk: "low",
				effort: "low",
				priority: "low",
				requiresHumanReview: false,
				suggestedTiming: "now",
			});
			break;

		case "technical_blocker":
			steps.push({
				stepNumber: n++,
				actionType: "technical_fix",
				action: "תיקון בעיה טכנית שמונעת דירוג",
				why: `העמוד לא מדורג למרות ביקוש (${fmt(s.impressions28d)} חשיפות). יש לבדוק indexability, robots.txt, canonical, ו-status code לפני כל פעולת תוכן.`,
				expectedImpact: "אינדקס נכון של העמוד",
				risk: "medium",
				effort: "medium",
				priority: "high",
				requiresHumanReview: true,
				suggestedTiming: "now",
			});
			break;
	}

	// Filter out steps without substantive why (engine invariant)
	return steps.filter((s) => isSubstantiveActionWhy(s.why));
}

function POSITION_BUCKET_HEBREW(b: KeywordResearchSnapshot["positionBucket"]): string {
	switch (b) {
		case "1-3": return "Top 3";
		case "4-5": return "Top 5";
		case "6-10": return "Top 10";
		case "11-20": return "עמוד 2";
		case "21+": return "מתחת לעמוד 2";
		case "not_ranking": return "לא מדורג";
		default: return "לא ידוע";
	}
}

// ─── Research notes + measurement ───────────────────────────

function buildResearchNotes(s: KeywordResearchSnapshot, type: StrategyType): ResearchNotes {
	const know: string[] = [];
	const dontKnow: string[] = [];
	const check: string[] = [];
	const why: string[] = [];

	const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(Math.round(n));

	know.push(`"${s.keyword}" — מיקום ${s.currentPosition?.toFixed(1) ?? "?"} (${POSITION_BUCKET_HEBREW(s.positionBucket)}) · ${fmt(s.impressions28d)} חשיפות · ${fmt(s.clicks28d)} קליקים · CTR ${s.ctrPct.toFixed(1)}%`);
	if (s.rankingPage) know.push(`עמוד שמדורג: ${s.rankingPage}`);
	if (s.topQueriesOnRankingPage.length > 0) {
		know.push(`${s.topQueriesOnRankingPage.length} ביטויים נוספים מובילים על אותו עמוד`);
	}
	if (s.competingPages.length > 0) {
		know.push(`${s.competingPages.length} עמודים מתחרים על אותה מילת מפתח`);
	}

	if (s.intent === "mixed" || s.intent === "unknown") dontKnow.push("כוונת החיפוש לא ברורה");
	if (s.impressions28d < 100) dontKnow.push("מעט נתונים — מתחת ל-100 חשיפות ב-28 ימים");
	if (s.targetPageMismatch) dontKnow.push("העמוד שמדורג שונה מ-target page שהוגדר");
	dontKnow.push("מי המתחרים החיצוניים ב-SERP — דורש בדיקה ידנית");

	check.push("לפתוח את ה-SERP ב-incognito ולראות מי בטופ 10");
	check.push("לבדוק האם יש featured snippet / ads / local pack שמורידים CTR");
	if (s.targetPageMismatch && s.targetPage && s.rankingPage) {
		check.push(`להחליט: לחזק את "${s.rankingPage}" (העמוד שמדורג) או לשנות כיוון ל-"${s.targetPage}" (target)`);
	}
	if (type === "cannibalization_fix") {
		check.push(`לבדוק את ${s.competingPages.length} העמודים המתחרים ולהחליט: מיזוג או הבדלה`);
	}

	why.push(`האסטרטגיה מסווגת כ-"${type}" לפי מיקום (${s.positionBucket}), intent (${s.intent}), ו-page fit (${s.pageFit})`);
	if (type === "protect_position") why.push("העמוד כבר מקבל קליקים — הסיכון העיקרי הוא איבוד, לא חוסר");
	if (type === "quick_win") why.push("המיקום + CTR gap מצביעים על פוטנציאל ROI מהיר");
	if (type === "new_content_needed") why.push("אין עמוד מתאים — שינוי Title לעמוד הקיים לא יעזור");

	return {
		whatWeKnow: know,
		whatWeDontKnow: dontKnow,
		whatToCheckManually: check,
		whyThisStrategy: why,
	};
}

function buildMeasurementPlan(s: KeywordResearchSnapshot): MeasurementPlan {
	const protectedQueries = s.topQueriesOnRankingPage
		.filter((q) => q.query !== s.keyword && q.clicks > 0)
		.map((q) => q.query);

	return {
		baselineDate: new Date().toISOString(),
		primaryKeyword: s.keyword,
		primaryPage: s.rankingPage,
		secondaryQueries: protectedQueries,
		metrics: ["position", "clicks", "impressions", "ctr"],
		reviewWindows: ["7d", "14d", "30d"],
		successCondition: s.positionBucket === "1-3"
			? `המיקום של "${s.keyword}" נשאר ב-Top 3 ו-CTR לא יורד`
			: s.positionBucket === "not_ranking"
				? `"${s.keyword}" מתחיל להיכנס ל-SERP (Top 50) תוך 30 ימים`
				: `המיקום של "${s.keyword}" עולה לפחות בעמדה אחת ו-CTR לא יורד`,
		warningCondition: protectedQueries.length > 0
			? `אחד מהביטויים המוגנים (${protectedQueries.slice(0, 2).join(", ")}) מאבד יותר מ-15% מהקליקים`
			: `המיקום של "${s.keyword}" יורד ביותר מ-2 עמדות, או הקליקים יורדים`,
		nextDecisionPoint: "אחרי 30 ימים — להחליט אם להמשיך, לעצור, או לעבור לאסטרטגיה אחרת",
	};
}

function buildSummary(args: {
	snapshot: KeywordResearchSnapshot;
	strategyType: StrategyType;
	opportunityScore: number;
}): string {
	const s = args.snapshot;
	const pos = s.currentPosition?.toFixed(1) ?? "לא מדורג";
	const score = args.opportunityScore;
	const verdict = score >= 80 ? "High Potential" : score >= 60 ? "Strong Opportunity" : score >= 40 ? "Medium" : "Low / Monitor";

	const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(Math.round(n));

	return `"${s.keyword}" · מיקום ${pos} · ${fmt(s.impressions28d)} חשיפות · ${fmt(s.clicks28d)} קליקים · CTR ${s.ctrPct.toFixed(1)}% — ${verdict} (${score}/100). אסטרטגיה: ${args.strategyType}.`;
}
