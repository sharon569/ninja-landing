// Phase 14C — Decision Intelligence engine (server-only).
//
// One public entry: computeDecisionForOpportunity(opportunityId).
// Pure-ish: reads Opportunity, Client profile, GSC data, Keyword Bank.
// Writes only the cached decision fields back to Opportunity, never mutates
// the engine inputs. Designed to be safe to call from page renders, server
// actions, and execution-guard checks alike.
//
// CORE INVARIANT (mirrored in decision.ts:isSubstantiveWhy):
// the engine will NEVER recommend execution unless it can build a
// substantive `whyThisIsBetter` grounded in real GSC numbers OR specific
// query/page context. When it can't, it flips to monitor/research_needed/
// no_change and sets needsHumanReview=true.

import "server-only";
import { db } from "./db";
import {
	DECISION_ENGINE_VERSION,
	isSubstantiveWhy,
	type DecisionSummary,
	type RiskLevel,
	type RiskReason,
	type Confidence,
	type RecommendedNextStep,
	type DecisionBadge,
	type QueryEvidence,
	type PageQueryPortfolio,
	type DataSufficiency,
	type IntentFit,
	type BusinessFit,
	type PositionStatus,
	type TitleJustification,
	type MetaJustification,
	type ContentJustification,
	type MeasurementPlan,
	type WhyNot,
	type SaferAlternative,
} from "./decision";

// Fetcher used by the public entry and the per-section helpers. Kept above
// the OppForDecision type alias so the alias can derive from its return type.
async function fetchOppForDecision(id: string) {
	return await db.opportunity.findUnique({
		where: { id },
		include: {
			client: true,
			baseline: true,
			actionLogs: { orderBy: { createdAt: "desc" }, take: 5 },
		},
	});
}

// Non-null Opportunity shape (with Client + baseline + recent action logs).
type OppForDecision = NonNullable<Awaited<ReturnType<typeof fetchOppForDecision>>>;

// ─── Public entry ────────────────────────────────────────────

export async function computeDecisionForOpportunity(
	opportunityId: string,
	options: { persistCache?: boolean } = {},
): Promise<DecisionSummary> {
	const opp = await fetchOppForDecision(opportunityId);
	if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

	const decision = await computeForRow(opp);

	if (options.persistCache !== false) {
		await db.opportunity.update({
			where: { id: opportunityId },
			data: {
				decisionRiskCache: decision.riskLevel,
				decisionConfidenceCache: decision.confidence,
				decisionNextStepCache: decision.recommendedNextStep,
				decisionComputedAt: new Date(),
			},
		});
	}

	return decision;
}

// Internal — works directly on a fetched opportunity row.
async function computeForRow(opp: OppForDecision): Promise<DecisionSummary> {
	const clientId = opp.clientId;
	const relatedQuery = opp.relatedQuery || "";
	const relatedPage = opp.relatedPage || "";

	// ─── Gather raw evidence ───────────────────────────────

	const gscRows = await db.gscDailyRow.findMany({
		where: {
			clientId,
			OR: [
				relatedQuery ? { query: relatedQuery } : { id: "_never" },
				relatedPage ? { page: relatedPage } : { id: "_never" },
			],
		},
		select: { query: true, page: true, clicks: true, impressions: true, ctr: true, position: true, date: true },
	});

	const oldest = gscRows.length
		? Math.min(...gscRows.map((r) => new Date(r.date).getTime()))
		: 0;
	const daysOfData = oldest
		? Math.ceil((Date.now() - oldest) / 86_400_000)
		: 0;

	const primaryQuery = relatedQuery ? aggregateRows(gscRows.filter((r) => r.query === relatedQuery), relatedQuery) : null;
	const portfolio = relatedPage ? aggregatePortfolio(gscRows.filter((r) => r.page === relatedPage), relatedPage) : null;

	const positionStatus = computePositionStatus(primaryQuery?.position ?? null);
	const dataSufficiency = computeDataSufficiency({
		impressionsCount: primaryQuery?.impressions ?? 0,
		clicksCount: primaryQuery?.clicks ?? 0,
		daysOfData,
		hasQuery: !!relatedQuery,
		hasPage: !!relatedPage,
	});

	const intentFit = computeIntentFit(relatedQuery, opp.client.vertical);
	const businessFit = computeBusinessFit(opp);

	// ─── Risk + confidence ────────────────────────────────

	const { riskLevel, riskReasons } = computeRisk({
		positionStatus,
		portfolio,
		intentFit,
		dataSufficiency,
		vertical: opp.client.vertical,
	});
	const confidence = computeConfidence({
		dataSufficiency,
		intentFit,
		riskLevel,
		portfolio,
	});

	// ─── Per-action-type justifications ──────────────────

	const actionType = opp.approvedActionType;
	let titleJ: TitleJustification | undefined;
	let metaJ: MetaJustification | undefined;
	let contentJ: ContentJustification | undefined;

	if (!actionType || actionType === "title_meta_update" || actionType === "title_change" || actionType === "title_update") {
		titleJ = buildTitleJustification({
			opp,
			primaryQuery,
			portfolio,
			positionStatus,
			confidence,
		});
	}
	if (!actionType || actionType === "title_meta_update" || actionType === "meta_change") {
		metaJ = buildMetaJustification({
			opp,
			primaryQuery,
			positionStatus,
			confidence,
		});
	}
	if (actionType === "content_update" || actionType === "new_content") {
		contentJ = buildContentJustification({
			opp,
			primaryQuery,
			portfolio,
			intentFit,
			confidence,
		});
	}

	// ─── Top-level why ───────────────────────────────────

	const whyThisIsBetter = synthesizeWhy({
		opp,
		primaryQuery,
		portfolio,
		positionStatus,
		titleJ,
		metaJ,
		contentJ,
	});

	// ─── Why not + safer alternative ─────────────────────

	const whyNot = synthesizeWhyNot({
		opp,
		primaryQuery,
		portfolio,
		positionStatus,
		riskReasons,
	});
	const saferAlternative = synthesizeSaferAlternative({
		opp,
		primaryQuery,
		portfolio,
		positionStatus,
		riskLevel,
	});

	// ─── Measurement plan ────────────────────────────────

	const measurementPlan = buildMeasurementPlan({
		opp,
		primaryQuery,
		portfolio,
		positionStatus,
	});

	// ─── Recommended next step (the invariant gate) ──────

	let nextStep: RecommendedNextStep = pickInitialNextStep({
		opp,
		riskLevel,
		confidence,
		positionStatus,
		dataSufficiency,
		intentFit,
		whyThisIsBetter,
	});
	// Hard invariant: empty / generic why → no executable recommendation.
	if (!isSubstantiveWhy(whyThisIsBetter)) {
		nextStep = dataSufficiency.sufficient ? "human_review" : "research_needed";
	}

	const needsHumanReview = computeNeedsHumanReview({
		nextStep,
		riskLevel,
		positionStatus,
		intentFit,
		opp,
		portfolio,
	});

	const badge = computeBadge({ nextStep, riskLevel, confidence });
	const recommendation = synthesizeRecommendation(opp, nextStep);

	return {
		recommendation,
		recommendedNextStep: nextStep,
		badge,
		needsHumanReview,
		riskLevel,
		riskReasons,
		confidence,
		primaryQuery,
		queryPortfolio: portfolio,
		positionStatus,
		intentFit,
		businessFit,
		dataSufficiency,
		whyThisIsBetter,
		whyNot,
		saferAlternative,
		titleJustification: titleJ,
		metaJustification: metaJ,
		contentJustification: contentJ,
		measurementPlan,
		researchNotes: synthesizeResearchNotes({
			opp,
			primaryQuery,
			portfolio,
			positionStatus,
			riskReasons,
			confidence,
			dataSufficiency,
		}),
		computedAt: new Date().toISOString(),
		engineVersion: DECISION_ENGINE_VERSION,
	};
}

// ─── Helper: aggregate GSC rows for a query ──────────────────

function aggregateRows(rows: Array<{ clicks: number; impressions: number; ctr: number; position: number }>, query: string): QueryEvidence | null {
	if (rows.length === 0) return null;
	const impressions = rows.reduce((a, b) => a + b.impressions, 0);
	const clicks = rows.reduce((a, b) => a + b.clicks, 0);
	const weightedPos = impressions > 0
		? rows.reduce((a, b) => a + b.position * b.impressions, 0) / impressions
		: 0;
	const ctrPct = impressions > 0 ? (clicks / impressions) * 100 : 0;
	return {
		query,
		page: null,
		impressions,
		clicks,
		ctrPct,
		position: weightedPos,
	};
}

function aggregatePortfolio(rows: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>, page: string): PageQueryPortfolio {
	const byQuery = new Map<string, { clicks: number; impressions: number; positions: number[]; weights: number[] }>();
	for (const r of rows) {
		const entry = byQuery.get(r.query) ?? { clicks: 0, impressions: 0, positions: [], weights: [] };
		entry.clicks += r.clicks;
		entry.impressions += r.impressions;
		entry.positions.push(r.position);
		entry.weights.push(r.impressions || 1);
		byQuery.set(r.query, entry);
	}

	const topQueries: QueryEvidence[] = [];
	let totalClicks = 0;
	let totalImpressions = 0;
	for (const [q, agg] of byQuery.entries()) {
		const totalWeight = agg.weights.reduce((a, b) => a + b, 0);
		const weightedPos = totalWeight > 0
			? agg.positions.reduce((a, p, i) => a + p * agg.weights[i], 0) / totalWeight
			: 0;
		topQueries.push({
			query: q,
			page,
			impressions: agg.impressions,
			clicks: agg.clicks,
			ctrPct: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
			position: weightedPos,
		});
		totalClicks += agg.clicks;
		totalImpressions += agg.impressions;
	}
	topQueries.sort((a, b) => b.clicks - a.clicks);
	const top5 = topQueries.slice(0, 5);
	const dominantQuery = totalClicks > 0 && top5[0] && top5[0].clicks / totalClicks > 0.5 ? top5[0] : null;
	const dominantShare = totalClicks > 0 && top5[0] ? top5[0].clicks / totalClicks : 0;

	// Protected queries: anything contributing ≥10% of page clicks, plus the dominant query.
	const protectedSet = new Set<string>();
	if (dominantQuery) protectedSet.add(dominantQuery.query);
	for (const q of top5) {
		if (totalClicks > 0 && q.clicks / totalClicks >= 0.1) protectedSet.add(q.query);
	}

	return {
		page,
		totalImpressions28d: totalImpressions,
		totalClicks28d: totalClicks,
		topQueries: top5,
		dominantQuery,
		dominantShare,
		protectedQueries: Array.from(protectedSet),
	};
}

// ─── Position-based risk ─────────────────────────────────────

function computePositionStatus(avg: number | null): PositionStatus {
	if (avg === null || !Number.isFinite(avg)) {
		return { avgPosition: null, bucket: "unknown", risk: "medium", advice: "אין מספיק נתונים על מיקום ממוצע — שינוי יבוצע בעיוורון" };
	}
	const pos = Math.round(avg * 10) / 10;
	if (pos <= 3) {
		return {
			avgPosition: pos,
			bucket: "1-3",
			risk: "high",
			advice: `מיקום ${pos} (Top 3). שינוי אגרסיבי של Title/H1 עלול לפגוע — מומלץ Meta בלבד או internal links.`,
		};
	}
	if (pos <= 5) {
		return {
			avgPosition: pos,
			bucket: "4-5",
			risk: "medium",
			advice: `מיקום ${pos} (Top 5). אפשר שינוי עדין; לחזק תוכן ולא לשנות כיוון.`,
		};
	}
	if (pos <= 15) {
		return {
			avgPosition: pos,
			bucket: "6-15",
			risk: "low",
			advice: `מיקום ${pos} — Quick Win zone. שיפור Title/Meta/Content בטוח יחסית.`,
		};
	}
	return {
		avgPosition: pos,
		bucket: "16+",
		risk: "low",
		advice: `מיקום ${pos}. אפשר שינוי משמעותי יותר; ייתכן שדרוש תוכן חדש.`,
	};
}

// ─── Data sufficiency ────────────────────────────────────────

function computeDataSufficiency(args: {
	impressionsCount: number;
	clicksCount: number;
	daysOfData: number;
	hasQuery: boolean;
	hasPage: boolean;
}): DataSufficiency {
	const missing: string[] = [];
	if (!args.hasQuery) missing.push("query לא ידועה");
	if (!args.hasPage) missing.push("page לא ידוע");
	if (args.daysOfData < 14) missing.push(`רק ${args.daysOfData} ימי GSC (פחות מ-14)`);
	if (args.impressionsCount < 100) missing.push(`רק ${args.impressionsCount} חשיפות (פחות מ-100)`);

	const sufficient = missing.length === 0;
	return {
		sufficient,
		impressionsCount: args.impressionsCount,
		clicksCount: args.clicksCount,
		daysOfData: args.daysOfData,
		missing,
	};
}

// ─── Intent + business fit ───────────────────────────────────

function computeIntentFit(query: string, vertical: string | null): IntentFit {
	if (!query) {
		return {
			queryIntent: "unknown",
			pageType: "unknown",
			fit: "unknown",
			reasoning: "אין query מקושר — לא ניתן להעריך כוונת חיפוש.",
		};
	}
	const q = query.toLowerCase();
	let intent: IntentFit["queryIntent"] = "informational";
	if (/(מחיר|לקנות|הזמנה|order|buy|price|sale|מבצע|deal)/i.test(q)) intent = "transactional";
	else if (/(שירות|לעשות|תיקון|חברה|service|repair|company|near\s+me|בקרבת|אזור)/i.test(q)) intent = "commercial";
	else if (/(מה זה|איך|למה|how|what|why|guide|tutorial|הסבר)/i.test(q)) intent = "informational";

	const isLocalVertical = vertical === "local_business" || vertical === "medical" || vertical === "legal" || vertical === "home_services";
	const fit: IntentFit["fit"] = isLocalVertical && intent === "commercial" ? "match"
		: vertical === "ecommerce" && intent === "transactional" ? "match"
			: vertical === "content_site" && intent === "informational" ? "match"
				: vertical && intent ? "partial"
					: "unknown";

	return {
		queryIntent: intent,
		pageType: "unknown",
		fit,
		reasoning: `הביטוי "${query}" נראה ${intent === "transactional" ? "טרנזקציוני" : intent === "commercial" ? "מסחרי" : intent === "informational" ? "מידעי" : "מעורב"} — מתאים ${fit === "match" ? "מצוין" : fit === "partial" ? "חלקית" : "פחות"} לסוג העסק (${vertical ?? "לא מוגדר"}).`,
	};
}

function computeBusinessFit(opp: OppForDecision): BusinessFit {
	const warnings: string[] = [];
	const c = opp.client;
	const matchesClientVertical = !!c.vertical;
	if (!c.vertical) warnings.push("vertical של הלקוח לא מוגדר — מומלץ למלא בהגדרות");
	if (!c.brandVoice) warnings.push("brandVoice לא מוגדר — מומלץ למלא כדי שהמלצות תוכן יהיו מותאמות");
	if (c.vertical === "medical" || c.vertical === "legal") {
		warnings.push("תחום YMYL — שינויי תוכן דורשים סקירה אנושית מקצועית");
	}
	return {
		matchesClientVertical,
		matchesServiceArea: c.serviceAreas.length > 0 ? true : "unknown",
		matchesBrandVoice: c.brandVoice ? "unknown" : false,
		matchesPagePurpose: "unknown",
		warnings,
	};
}

// ─── Risk + confidence aggregation ───────────────────────────

function computeRisk(args: {
	positionStatus: PositionStatus;
	portfolio: PageQueryPortfolio | null;
	intentFit: IntentFit;
	dataSufficiency: DataSufficiency;
	vertical: string | null;
}): { riskLevel: RiskLevel; riskReasons: RiskReason[] } {
	const reasons: RiskReason[] = [];

	if (args.positionStatus.bucket === "1-3") reasons.push("top_3_position");
	else if (args.positionStatus.bucket === "4-5") reasons.push("top_5_position");

	if (args.portfolio?.dominantQuery) reasons.push("traffic_concentration");
	if (args.portfolio && args.portfolio.topQueries.length >= 3 && args.portfolio.totalClicks28d > 50) {
		reasons.push("multiple_winning_queries");
	}
	if (args.portfolio && args.portfolio.totalClicks28d > 100) reasons.push("high_click_page");

	if (args.intentFit.fit === "mismatch") reasons.push("intent_mismatch");
	if (args.intentFit.queryIntent === "unknown") reasons.push("intent_unclear");

	if (!args.dataSufficiency.sufficient) reasons.push("insufficient_data");

	if (args.vertical === "medical" || args.vertical === "legal") reasons.push("ymyl_vertical");
	if (args.vertical === "medical" || args.vertical === "legal") reasons.push("brand_voice_sensitive");

	const severeReasons: RiskReason[] = ["ymyl_vertical", "top_3_position", "intent_mismatch"];
	const mediumReasons: RiskReason[] = ["top_5_position", "traffic_concentration", "multiple_winning_queries", "high_click_page"];

	const hasSevere = reasons.some((r) => severeReasons.includes(r));
	const hasMedium = reasons.some((r) => mediumReasons.includes(r));

	let riskLevel: RiskLevel;
	if (hasSevere && hasMedium) riskLevel = "critical";
	else if (hasSevere) riskLevel = "high";
	else if (hasMedium) riskLevel = "medium";
	else riskLevel = "low";

	return { riskLevel, riskReasons: reasons };
}

function computeConfidence(args: {
	dataSufficiency: DataSufficiency;
	intentFit: IntentFit;
	riskLevel: RiskLevel;
	portfolio: PageQueryPortfolio | null;
}): Confidence {
	if (!args.dataSufficiency.sufficient) return "low";
	if (args.intentFit.fit === "mismatch" || args.intentFit.queryIntent === "unknown") return "low";
	if (args.riskLevel === "critical") return "low";
	if (args.riskLevel === "high") return "medium";
	if (args.portfolio?.dominantQuery && args.portfolio.dominantShare > 0.7) return "medium";
	return "high";
}

// ─── Justifications ──────────────────────────────────────────

function buildTitleJustification(args: {
	opp: OppForDecision;
	primaryQuery: QueryEvidence | null;
	portfolio: PageQueryPortfolio | null;
	positionStatus: PositionStatus;
	confidence: Confidence;
}): TitleJustification {
	const opp = args.opp;
	const pq = args.primaryQuery;

	// Note: We don't have the current title text here without a plugin probe.
	// The Why-layer still works because it references the QUERY situation
	// rather than dueling title strings — the strict title comparison is
	// added inside the PrepareExecutionModal which has both before/after.

	const weaknesses: string[] = [];
	const advantages: string[] = [];
	const scs: string[] = [];

	if (pq) {
		scs.push(
			`הביטוי "${pq.query}" קיבל ${fmt(pq.impressions)} חשיפות ב-28 הימים האחרונים, ${fmt(pq.clicks)} קליקים, CTR ${pq.ctrPct.toFixed(1)}%, מיקום ממוצע ${pq.position.toFixed(1)}.`,
		);
		if (pq.ctrPct < expectedCtrForPosition(pq.position) * 0.6) {
			weaknesses.push(`ה-CTR (${pq.ctrPct.toFixed(1)}%) נמוך משמעותית מהציפייה במיקום ${pq.position.toFixed(1)} (~${expectedCtrForPosition(pq.position).toFixed(1)}%)`);
			advantages.push("שיפור הניסוח של ה-Title צפוי להעלות CTR מבלי לשנות את הכיוון");
		}
	}

	const protectedQueries = args.portfolio?.protectedQueries ?? [];

	const riskNotes: string[] = [];
	if (args.positionStatus.bucket === "1-3") riskNotes.push("העמוד כבר מדורג Top 3 — שינוי אגרסיבי לא מומלץ");
	if (args.portfolio?.dominantQuery) riskNotes.push(`${(args.portfolio.dominantShare * 100).toFixed(0)}% מהקליקים של העמוד מגיעים מ-"${args.portfolio.dominantQuery.query}"`);

	const why = synthesizeTitleWhy({ opp, primaryQuery: pq, portfolio: args.portfolio, advantages, weaknesses, scs, riskNotes });

	return {
		currentTitle: null,
		currentTitleStrengths: [],
		currentTitleWeaknesses: weaknesses,
		suggestedTitle: null,
		suggestedTitleAdvantages: advantages,
		searchConsoleSupport: scs.join(" "),
		protectedQueries,
		riskNotes,
		whyThisIsBetter: why,
		confidence: args.confidence,
	};
}

function buildMetaJustification(args: {
	opp: OppForDecision;
	primaryQuery: QueryEvidence | null;
	positionStatus: PositionStatus;
	confidence: Confidence;
}): MetaJustification {
	const pq = args.primaryQuery;
	const issue = pq && pq.ctrPct < expectedCtrForPosition(pq.position) * 0.6
		? `ה-Meta הנוכחי לא מצליח למשוך הקלקה — CTR ${pq.ctrPct.toFixed(1)}% במיקום ${pq.position.toFixed(1)} (ציפייה ~${expectedCtrForPosition(pq.position).toFixed(1)}%)`
		: "ה-Meta הנוכחי לא נמדד מעמיק — חסר מידע ספציפי לשיפור";

	const why = pq
		? `המיקום של "${pq.query}" יציב סביב ${pq.position.toFixed(1)} עם ${fmt(pq.impressions)} חשיפות, אבל רק ${fmt(pq.clicks)} קליקים (CTR ${pq.ctrPct.toFixed(1)}%). שינוי Meta Description מאפשר שיפור CTR בלי לסכן את המיקום הקיים — זה התנהגות סטנדרטית של Google שלא מבסס דירוגים על Meta.`
		: "";

	return {
		currentMeta: null,
		currentMetaIssue: issue,
		suggestedMetaAdvantages: ["ניסוח שמדגיש ערך/CTA", "אורך נכון ל-SERP", "התאמה לכוונת החיפוש"],
		expectedCtrImpact: pq ? `שיפור CTR צפוי בטווח של 0.5%-2% מבלי לשנות מיקום` : "לא ניתן להעריך — אין מספיק נתוני query",
		intentFit: pq ? `הביטוי "${pq.query}" מצדיק Meta ממוקד-תועלת` : "לא ידוע",
		businessFit: args.opp.client.vertical ? `מתאים לתחום ${args.opp.client.vertical}` : "vertical של הלקוח לא הוגדר",
		riskNotes: args.positionStatus.bucket === "1-3" ? ["העמוד כבר Top 3 — אל תשנה את המיקוד, רק את הניסוח"] : [],
		whyThisIsBetter: why,
		confidence: args.confidence,
	};
}

function buildContentJustification(args: {
	opp: OppForDecision;
	primaryQuery: QueryEvidence | null;
	portfolio: PageQueryPortfolio | null;
	intentFit: IntentFit;
	confidence: Confidence;
}): ContentJustification {
	const pq = args.primaryQuery;
	const gscEvidence = pq
		? `${fmt(pq.impressions)} חשיפות, ${fmt(pq.clicks)} קליקים, CTR ${pq.ctrPct.toFixed(1)}%, מיקום ${pq.position.toFixed(1)} עבור "${pq.query}".`
		: "אין נתוני GSC ספציפיים — תוכן צריך להישען על Keyword Bank ופרופיל הלקוח.";
	return {
		currentContentGap: pq ? `חסר תוכן ממוקד לביטוי "${pq.query}" — חשיפות גבוהות אך CTR נמוך` : "לא ידוע",
		searchIntentReasoning: args.intentFit.reasoning,
		gscEvidence,
		recommendedContentBlock: `הוספת פסקה/H2 שעונה ישירות על "${pq?.query ?? "הביטוי"}" עם פרטים ספציפיים (לא גנריים)`,
		whyThisContentHelps: pq
			? `העמוד נמשך בחיפושים על "${pq.query}" אבל לא ממיר. תוכן נוסף שעונה ישירות על הכוונה ישפר engagement ויחזק רלוונטיות.`
			: "",
		whyNotOnlyMetaChange: "Meta מתאים לשיפור CTR בלבד; שיפור תוכן נדרש כשהבעיה היא relevance/depth, לא הצגה.",
		whyNotNewPage: args.portfolio?.dominantQuery
			? `העמוד כבר מצליח על "${args.portfolio.dominantQuery.query}". יצירת עמוד חדש לאותו נושא תגרום לקניבליזציה.`
			: "אין סיבה ליצור עמוד חדש כל עוד הקיים יכול להתחזק.",
		businessFit: args.opp.client.brandVoice
			? `יש להקפיד על טון "${args.opp.client.brandVoice}"`
			: "brandVoice לא מוגדר — מומלץ למלא בהגדרות",
		riskNotes: args.portfolio?.dominantQuery
			? [`לא לשנות את הכיוון של העמוד — הוא מצליח על "${args.portfolio.dominantQuery.query}"`]
			: [],
		successMeasurement: pq
			? `בדיקה של CTR ו-clicks על "${pq.query}" אחרי 7/14/30 ימים, ומעקב על שאר הביטויים שב-portfolio`
			: "מעקב כללי על clicks/impressions של העמוד",
		confidence: args.confidence,
	};
}

// ─── Top-level synthesizers ─────────────────────────────────

function synthesizeWhy(args: {
	opp: OppForDecision;
	primaryQuery: QueryEvidence | null;
	portfolio: PageQueryPortfolio | null;
	positionStatus: PositionStatus;
	titleJ?: TitleJustification;
	metaJ?: MetaJustification;
	contentJ?: ContentJustification;
}): string {
	// Prefer the most specific available justification.
	if (args.contentJ?.whyThisContentHelps) return args.contentJ.whyThisContentHelps;
	if (args.titleJ?.whyThisIsBetter) return args.titleJ.whyThisIsBetter;
	if (args.metaJ?.whyThisIsBetter) return args.metaJ.whyThisIsBetter;

	const pq = args.primaryQuery;
	if (!pq) return ""; // INVARIANT: empty → engine flips to research_needed

	// Generic-but-grounded fallback referencing real numbers
	return `הביטוי "${pq.query}" קיבל ${fmt(pq.impressions)} חשיפות ב-28 הימים האחרונים, ${fmt(pq.clicks)} קליקים, CTR ${pq.ctrPct.toFixed(1)}%, מיקום ממוצע ${pq.position.toFixed(1)}. לפי הנתונים יש מקום לשיפור הצגת התוצאה בלי לסכן את המיקום הקיים.`;
}

function synthesizeTitleWhy(args: {
	opp: OppForDecision;
	primaryQuery: QueryEvidence | null;
	portfolio: PageQueryPortfolio | null;
	advantages: string[];
	weaknesses: string[];
	scs: string[];
	riskNotes: string[];
}): string {
	const parts: string[] = [];
	if (args.scs.length) parts.push(args.scs.join(" "));
	if (args.weaknesses.length) parts.push(`חולשה זוהתה: ${args.weaknesses.join("; ")}.`);
	if (args.advantages.length) parts.push(`היתרון הצפוי: ${args.advantages.join("; ")}.`);
	if (args.portfolio?.dominantQuery) {
		parts.push(`חשוב לשמור על "${args.portfolio.dominantQuery.query}" שמביא ${(args.portfolio.dominantShare * 100).toFixed(0)}% מהקליקים של העמוד.`);
	}
	return parts.join(" ");
}

function synthesizeWhyNot(args: {
	opp: OppForDecision;
	primaryQuery: QueryEvidence | null;
	portfolio: PageQueryPortfolio | null;
	positionStatus: PositionStatus;
	riskReasons: RiskReason[];
}): WhyNot {
	const possibleRisks: string[] = [];
	const whatCouldGoWrong: string[] = [];
	const whatToProtect: string[] = [];

	if (args.positionStatus.bucket === "1-3") {
		possibleRisks.push("העמוד כבר ב-Top 3");
		whatCouldGoWrong.push("שינוי אגרסיבי יכול להוריד דירוג שכבר עובד");
	}
	if (args.portfolio?.dominantQuery) {
		whatToProtect.push(`"${args.portfolio.dominantQuery.query}" (${fmt(args.portfolio.dominantQuery.clicks)} קליקים)`);
	}
	for (const q of args.portfolio?.protectedQueries ?? []) {
		if (!whatToProtect.includes(q)) whatToProtect.push(`"${q}"`);
	}

	const saferSummary = args.positionStatus.bucket === "1-3"
		? "להתחיל ב-Meta Description בלבד, ולעקוב 14 ימים לפני שינוי Title"
		: args.portfolio?.dominantQuery
			? "לחזק את העמוד בתוכן/קישורים פנימיים במקום לשנות Title"
			: "להריץ Dry Run ולבדוק את ה-diff מול הסיכון";

	const whenToAvoid = args.riskReasons.includes("ymyl_vertical")
		? "אם זה תחום YMYL (רפואי/משפטי/פיננסי), מומלץ סקירה מקצועית לפני כל שינוי"
		: args.positionStatus.bucket === "1-3"
			? "אם כל המדדים יציבים והכל עובד, אל תיגע"
			: "אם אין מספיק נתוני GSC או שהביטוי לא מתאים לעסק";

	return {
		possibleRisks,
		whatCouldGoWrong,
		whatToProtect,
		saferAlternativeSummary: saferSummary,
		whenToAvoidThisChange: whenToAvoid,
	};
}

function synthesizeSaferAlternative(args: {
	opp: OppForDecision;
	primaryQuery: QueryEvidence | null;
	portfolio: PageQueryPortfolio | null;
	positionStatus: PositionStatus;
	riskLevel: RiskLevel;
}): SaferAlternative | null {
	if (args.riskLevel === "low") return null;
	const steps: string[] = [];
	if (args.positionStatus.bucket === "1-3") {
		steps.push("לעדכן Meta Description בלבד");
		steps.push("להמתין 14 ימים");
		steps.push("לבדוק שינויי CTR ו-position");
		steps.push("רק אם CTR לא השתפר, לשקול שינוי Title");
	} else if (args.portfolio?.dominantQuery) {
		steps.push(`לא לגעת בכותרת המרכזית — היא מצליחה על "${args.portfolio.dominantQuery.query}"`);
		steps.push("להוסיף פסקה/H2 שעונה על הביטוי החדש");
		steps.push("לחזק קישורים פנימיים לעמוד הזה מביטויים תומכים");
	} else {
		steps.push("להריץ Dry Run ולוודא שה-diff נראה הגיוני");
		steps.push("לשמור Baseline לפני Execute");
		steps.push("Impact Review אחרי 14 ימים");
	}
	return {
		summary: steps[0],
		steps,
		expectedBenefit: "שיפור מבוקר בלי סיכון של נסיגה",
	};
}

function buildMeasurementPlan(args: {
	opp: OppForDecision;
	primaryQuery: QueryEvidence | null;
	portfolio: PageQueryPortfolio | null;
	positionStatus: PositionStatus;
}): MeasurementPlan {
	const pq = args.primaryQuery;
	const baseProtected = args.portfolio?.protectedQueries ?? [];
	const primaryMetric: MeasurementPlan["primaryMetric"] =
		pq && args.positionStatus.bucket !== "16+" && pq.ctrPct < expectedCtrForPosition(pq.position) * 0.6
			? "ctr"
			: args.positionStatus.bucket === "16+"
				? "position"
				: "clicks";

	const expectedOutcome = pq
		? primaryMetric === "ctr"
			? `CTR של "${pq.query}" צפוי לעלות מ-${pq.ctrPct.toFixed(1)}% לכיוון ${(expectedCtrForPosition(pq.position) * 0.8).toFixed(1)}% תוך 14 ימים`
			: primaryMetric === "position"
				? `מיקום של "${pq.query}" צפוי לעלות מ-${pq.position.toFixed(1)}`
				: `קליקים של "${pq.query}" צפויים לעלות מעל ${pq.clicks}`
		: "מעקב כללי על העמוד";

	const failureSignal = pq
		? `${primaryMetric} של "${pq.query}" יורד, או אחד מהביטויים המוגנים מאבד יותר מ-15% מהקליקים`
		: "אובדן clicks מהעמוד או מהביטויים המוגנים";

	return {
		primaryQuery: pq?.query ?? null,
		relatedPage: args.portfolio?.page ?? null,
		primaryMetric,
		expectedOutcome,
		failureSignal,
		windows: ["7d", "14d", "30d"],
		protectedMetrics: baseProtected,
	};
}

function pickInitialNextStep(args: {
	opp: OppForDecision;
	riskLevel: RiskLevel;
	confidence: Confidence;
	positionStatus: PositionStatus;
	dataSufficiency: DataSufficiency;
	intentFit: IntentFit;
	whyThisIsBetter: string;
}): RecommendedNextStep {
	if (!args.dataSufficiency.sufficient) return "research_needed";
	if (args.intentFit.fit === "mismatch") return "no_change";
	if (args.riskLevel === "critical") return "human_review";
	if (args.riskLevel === "high" && args.confidence === "low") return "human_review";
	if (args.riskLevel === "high") return "human_review";
	if (args.positionStatus.bucket === "1-3") return "monitor";
	if (args.confidence === "low") return "monitor";
	if (args.positionStatus.bucket === "6-15") return "quick_win";
	return "safe_to_execute";
}

function computeNeedsHumanReview(args: {
	nextStep: RecommendedNextStep;
	riskLevel: RiskLevel;
	positionStatus: PositionStatus;
	intentFit: IntentFit;
	opp: OppForDecision;
	portfolio: PageQueryPortfolio | null;
}): boolean {
	if (args.nextStep === "human_review") return true;
	if (args.riskLevel === "critical" || args.riskLevel === "high") return true;
	if (args.positionStatus.bucket === "1-3") return true;
	if (args.opp.client.vertical === "medical" || args.opp.client.vertical === "legal") return true;
	if (args.intentFit.fit === "mismatch") return true;
	if (args.portfolio?.dominantQuery && args.portfolio.dominantShare > 0.7) return true;
	return false;
}

function computeBadge(args: { nextStep: RecommendedNextStep; riskLevel: RiskLevel; confidence: Confidence }): DecisionBadge {
	switch (args.nextStep) {
		case "no_change":
			return "do_not_change_yet";
		case "research_needed":
			return "research_needed";
		case "monitor":
			return "monitor_only";
		case "human_review":
			return args.riskLevel === "critical" ? "high_risk" : "needs_human_review";
		case "quick_win":
			return "quick_win";
		case "safe_to_execute":
		default:
			return "safe_to_test";
	}
}

function synthesizeRecommendation(opp: OppForDecision, nextStep: RecommendedNextStep): string {
	switch (nextStep) {
		case "safe_to_execute":
			return `המערכת ממליצה לבצע: ${opp.title}`;
		case "quick_win":
			return `Quick Win — מומלץ לבצע: ${opp.title}`;
		case "human_review":
			return `דורש סקירה אנושית לפני ביצוע: ${opp.title}`;
		case "monitor":
			return `להמשיך לעקוב; אין צורך בשינוי כרגע`;
		case "research_needed":
			return `נדרש מחקר נוסף לפני המלצה לפעולה`;
		case "no_change":
			return `המערכת לא ממליצה על שינוי בשלב זה`;
	}
}

function synthesizeResearchNotes(args: {
	opp: OppForDecision;
	primaryQuery: QueryEvidence | null;
	portfolio: PageQueryPortfolio | null;
	positionStatus: PositionStatus;
	riskReasons: RiskReason[];
	confidence: Confidence;
	dataSufficiency: DataSufficiency;
}): DecisionSummary["researchNotes"] {
	const know: string[] = [];
	const dontKnow: string[] = [];
	const whyAction: string[] = [];
	const whyRisky: string[] = [];
	const checkManually: string[] = [];
	const measureSuccess: string[] = [];

	if (args.primaryQuery) {
		know.push(`"${args.primaryQuery.query}" — ${fmt(args.primaryQuery.impressions)} חשיפות / ${fmt(args.primaryQuery.clicks)} קליקים / מיקום ${args.primaryQuery.position.toFixed(1)}`);
	}
	if (args.portfolio) {
		know.push(`portfolio של העמוד: ${args.portfolio.topQueries.length} ביטויים מובילים, ${fmt(args.portfolio.totalClicks28d)} קליקים סה״כ`);
		if (args.portfolio.dominantQuery) {
			know.push(`ביטוי שולט: "${args.portfolio.dominantQuery.query}" (${(args.portfolio.dominantShare * 100).toFixed(0)}% מהקליקים)`);
		}
	}
	if (args.dataSufficiency.missing.length) {
		for (const m of args.dataSufficiency.missing) dontKnow.push(m);
	}
	if (!args.opp.client.vertical) dontKnow.push("vertical של הלקוח לא מוגדר");
	if (!args.opp.client.brandVoice) dontKnow.push("brandVoice לא מוגדר");

	whyAction.push(args.opp.recommendedAction);

	for (const r of args.riskReasons) {
		whyRisky.push(`${r}`);
	}

	if (args.positionStatus.bucket === "1-3") {
		checkManually.push("לוודא ב-SERP שאין featured snippet / ads שמורידים CTR מבלי קשר לכותרת");
	}
	checkManually.push("לפתוח את העמוד ב-incognito ולבדוק חוויית משתמש");

	measureSuccess.push(args.primaryQuery
		? `CTR של "${args.primaryQuery.query}" אחרי 7/14/30 ימים`
		: "קליקים וחשיפות של העמוד");
	if (args.portfolio?.protectedQueries.length) {
		measureSuccess.push(`לא איבד טראפיק מ-${args.portfolio.protectedQueries.length} ביטויים מוגנים`);
	}

	return {
		whatWeKnow: know,
		whatWeDontKnow: dontKnow,
		whyThisAction: whyAction,
		whyThisIsRisky: whyRisky.length ? whyRisky : ["אין סיכון משמעותי שזוהה"],
		whatToCheckManually: checkManually,
		howWeMeasureSuccess: measureSuccess,
	};
}

// ─── Internals ──────────────────────────────────────────────

function fmt(n: number): string {
	return new Intl.NumberFormat("he-IL").format(Math.round(n));
}

/**
 * Industry rule-of-thumb expected CTR by SERP position (mobile + desktop avg).
 * Used only as a heuristic to detect "underperforming CTR" without external
 * benchmark data.
 */
function expectedCtrForPosition(position: number): number {
	if (position <= 1.5) return 27;
	if (position <= 2.5) return 15;
	if (position <= 3.5) return 11;
	if (position <= 5) return 7;
	if (position <= 8) return 4;
	if (position <= 12) return 2;
	if (position <= 20) return 1;
	return 0.5;
}

