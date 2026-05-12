// Content Brief generator — server-only.
//
// Takes an Opportunity (+ client profile + GSC data) and returns a structured,
// practical brief. No external AI call — pure templating + heuristics.

import "server-only";
import { db } from "./db";
import { classifyPage, type ClientScopeConfig } from "./page-scope";

interface ClientProfile {
	id: string;
	name: string;
	baseUrl: string;
	vertical: string | null;
	language: string | null;
	country: string | null;
	serviceAreas: string[];
	targetPages: string[];
	competitors: string[];
	brandVoice: string | null;
}

interface OpportunityForBrief {
	id: string;
	clientId: string;
	type: string;
	title: string;
	description: string;
	evidence: string;
	recommendedAction: string;
	relatedKeyword: string;
	relatedQuery: string;
	relatedPage: string;
}

export interface GeneratedBrief {
	targetKeyword: string;
	relatedQuery?: string;
	relatedPage?: string;
	briefType: string;
	searchIntent: string;
	recommendedTitle?: string;
	recommendedMetaDescription?: string;
	recommendedH1?: string;
	outline?: string;
	secondaryKeywords: string[];
	internalLinks: string[];
	recommendedCTA?: string;
	recommendedSchema?: string;
	contentAngle?: string;
	notes?: string;
}

// ─── Intent inference ────────────────────────────────────────────

function inferIntent(keyword: string, vertical: string | null): string {
	const k = keyword.toLowerCase();
	// Hebrew + English heuristics
	if (/\bvs\b|\bהשוואה|\bהכי טוב|\bהמלצות|\bביקור[תו]|\brec(omm)?(end)?|\bbest|\bvs\.?\b|\btop\b/.test(k))
		return "commercial";
	if (/\b(קנה|הזמנה|הזמן|לקנות|מחיר|buy|order|price|coupon|discount|מבצע|הנחה)\b/.test(k))
		return "transactional";
	if (/\b(איך|מה זה|למה|מתי|how|what|why|when|guide|מדריך|טיפים)\b/.test(k))
		return "informational";
	if (
		/\b(תל אביב|חיפה|ירושלים|ראשון|נתניה|באר שבע|אשדוד|רמת גן|פתח תקווה|near me|ליד|באזור)\b/.test(
			k,
		)
	)
		return "local";
	// Vertical defaults
	if (vertical === "ecommerce") return "commercial";
	if (vertical === "local_business" || vertical === "home_services") return "local";
	if (vertical === "content_site") return "informational";
	return "unknown";
}

function ctaForIntent(intent: string, vertical: string | null): string {
	switch (intent) {
		case "transactional":
			return "כפתור CTA בולט עם פעולה ישירה: 'הזמנה עכשיו' / 'קנה עכשיו' + טופס יצירת קשר מקוצר.";
		case "commercial":
			return "CTA דו-שלבי: 'קבלת הצעת מחיר' / 'דברו איתנו על הפרויקט' עם טופס קצר (שם + טלפון).";
		case "local":
			return "CTA כפול: כפתור 'התקשרו עכשיו' (מספר טלפון רגיש למובייל) + 'קבלו הצעה' עם פרטי אזור שירות.";
		case "informational":
			return vertical === "ecommerce"
				? "CTA רך בסוף המאמר: 'גלו את הקטגוריה המלאה' או 'הצטרפו לניוזלטר'."
				: "CTA רך בסוף המאמר: 'צרו קשר לייעוץ' או 'קראו עוד מאמרים בנושא'.";
		case "navigational":
			return "אין צורך ב-CTA חזק; הקפד שכפתורי הניווט הראשיים נגישים.";
		default:
			return "CTA סטנדרטי: 'יצירת קשר' עם טלפון, מייל, וטופס.";
	}
}

function schemaForVertical(vertical: string | null, briefType: string): string {
	if (briefType === "internal_link_plan" || briefType === "title_meta_update") {
		return "אין שינוי schema — סטטוס מטה-בלבד.";
	}
	switch (vertical) {
		case "ecommerce":
			return "Product (אם עמוד מוצר) או CollectionPage (אם קטגוריה). Add BreadcrumbList.";
		case "local_business":
		case "home_services":
		case "medical":
		case "legal":
		case "professional_services":
		case "restaurant":
		case "automotive":
		case "beauty":
		case "real_estate":
			return "LocalBusiness עם כתובת, טלפון, שעות פעילות. Add Service אם מתאר שירות ספציפי.";
		case "saas":
			return "Product או SoftwareApplication. Add Organization + Offer אם יש מודל מחיר.";
		case "content_site":
			return "Article או BlogPosting. Add Author, datePublished, breadcrumbs.";
		case "education":
			return "Course או EducationalOrganization עם מידע על תכנית הלימודים.";
		case "finance":
			return "FinancialService או FinancialProduct לפי המקרה.";
		default:
			return "WebPage בסיסי. Add BreadcrumbList ו-Organization.";
	}
}

function siteHost(url: string): string {
	try {
		return new URL(url).host.replace(/^www\./, "");
	} catch {
		return url;
	}
}

// ─── Outline templates by intent + brief type ────────────────────

function outlineFor(intent: string, briefType: string, keyword: string): string {
	if (briefType === "faq_section") {
		return [
			`## אזור שאלות ותשובות (FAQ) על ${keyword}`,
			`- **מה זה ${keyword} ולמה זה חשוב?**`,
			`- **איך בוחרים את ה-${keyword} הנכון?**`,
			`- **כמה זה עולה?**`,
			`- **כמה זמן זה לוקח?**`,
			`- **האם יש אחריות?**`,
		].join("\n");
	}
	if (briefType === "title_meta_update") {
		return "אין צורך במבנה תוכן חדש — שינוי Title/Meta בלבד. ראה המלצות בשדות ייעודיים.";
	}
	if (briefType === "internal_link_plan") {
		return "ראה internalLinks — תוכנית קישורים נפרדת ולא outline תוכן.";
	}

	const base = (h2s: string[]) =>
		[`## ${keyword}`, ...h2s.map((h) => `## ${h}`)].join("\n");

	switch (intent) {
		case "informational":
			return base([
				`מה זה ${keyword}? — הקדמה והגדרה`,
				`מתי כדאי / מתי לא — מקרי שימוש עיקריים`,
				`איך לבחור ${keyword} — 3-5 קריטריונים מרכזיים`,
				`טעויות נפוצות שצריך להימנע מהן`,
				`שאלות נפוצות`,
				`סיכום + הצעדים הבאים`,
			]);
		case "commercial":
			return base([
				`מהם היתרונות של ${keyword}`,
				`השוואה — ${keyword} מול אלטרנטיבות`,
				`מה לבדוק לפני שבוחרים`,
				`טווח מחירים — מה משפיע על העלות`,
				`למה אנחנו — נקודות בידול עיקריות`,
				`שאלות נפוצות`,
			]);
		case "transactional":
			return base([
				`למה לקנות אצלנו — נקודות אמון מהירות`,
				`מה כלול בשירות / מה במחיר`,
				`תהליך ההזמנה (שלב אחר שלב)`,
				`מבצעים והנחות אם קיימים`,
				`עדויות לקוחות`,
				`שאלות נפוצות + טופס יצירת קשר`,
			]);
		case "local":
			return base([
				`${keyword} — מה אנחנו עושים`,
				`אזורי שירות שאנחנו מכסים`,
				`למה לבחור בנו (ניסיון, אחריות, זמני תגובה)`,
				`עדויות לקוחות מהאזור`,
				`שאלות נפוצות`,
				`טופס יצירת קשר + מפה`,
			]);
		default:
			return base([
				`${keyword} — סקירה`,
				`למי זה מתאים`,
				`איך זה עובד`,
				`מה הצעד הבא`,
			]);
	}
}

// ─── Title / Meta templates ──────────────────────────────────────

// Phase 15C — Hebrew-aware title builder.
// Rules (validated against the Brabantia pilot):
//   1. If the keyword is Hebrew but the brand is purely English, drop the
//      brand entirely. Better a clean Hebrew title than mixed Hebrew + Latin
//      "Levizon Market" plonked onto a Hebrew SERP listing.
//   2. Use ONE separator throughout the title — " - " (Hebrew-friendly).
//      The old templates mixed "|" and "—" which read sloppy.
//   3. Avoid generic boilerplate suffixes ("הזמנה אונליין", "מחיר משתלם",
//      "משלוח מהיר") unless they appear in client.brandVoice/notes. For
//      ecommerce + transactional keywords, prefer the more useful Hebrew
//      pattern "{keyword} - דגמים, צבעים ומחירים".
function isHebrew(s: string): boolean {
	return /[֐-׿]/.test(s);
}

function titleFor(keyword: string, vertical: string | null, intent: string, clientName: string): string {
	const brand = clientName.trim();
	const kwIsHebrew = isHebrew(keyword);
	const brandIsHebrew = isHebrew(brand);
	// Mixed-language penalty: if keyword is Hebrew but brand is pure Latin,
	// the operator will add a Hebrew alias manually before publishing.
	const useBrand = !kwIsHebrew || brandIsHebrew;
	const brandSuffix = useBrand && brand ? ` | ${brand}` : "";

	// Intent-driven body. Single " - " separator only.
	let body: string;
	if (intent === "transactional") {
		body = vertical === "ecommerce"
			? `${keyword} - דגמים, צבעים ומחירים`
			: `${keyword} - מחירים והזמנה`;
	} else if (intent === "commercial") {
		body = `${keyword} - השוואה, מחירים ובחירה`;
	} else if (intent === "local") {
		body = `${keyword} - שירות באזור שלכם`;
	} else if (intent === "informational") {
		body = vertical === "content_site"
			? `${keyword}: כל מה שצריך לדעת`
			: `${keyword} - מדריך מקצועי`;
	} else {
		body = keyword;
	}
	return `${body}${brandSuffix}`;
}

function metaDescFor(keyword: string, intent: string, vertical: string | null): string {
	switch (intent) {
		case "transactional":
			return `קנה ${keyword} אונליין במחיר תחרותי, משלוח מהיר ושירות אישי. הזמנה ב-3 קליקים.`;
		case "commercial":
			return `מחפש ${keyword}? המדריך שלנו עוזר לך לבחור נכון: מה לבדוק, על מה לוותר, ולמה חשוב להתחיל עכשיו.`;
		case "local":
			return `${keyword} בשירות מקצועי, אחריות מלאה, וזמני תגובה מהירים. הצעת מחיר חינם — דברו איתנו עכשיו.`;
		case "informational":
			return `כל מה שצריך לדעת על ${keyword}: הסבר מקצועי, דוגמאות, וטעויות נפוצות. ${vertical === "content_site" ? "מאמר מעמיק שמסביר הכל בפשטות." : "מבית מקצועי ומנוסה."}`;
		default:
			return `${keyword} — מידע מקיף, מקצועי וברור. צרו קשר לפרטים נוספים.`;
	}
}

function h1For(keyword: string, briefType: string): string {
	if (briefType === "title_meta_update") return ""; // not in scope
	if (briefType === "expand_existing_content") return `${keyword} — מדריך מעמיק`;
	if (briefType === "optimize_existing_page") return keyword;
	if (briefType === "faq_section") return ""; // section, not page H1
	return keyword;
}

// ─── Secondary keywords ──────────────────────────────────────────

async function deriveSecondaryKeywords(
	clientId: string,
	keyword: string,
	relatedPage: string,
): Promise<string[]> {
	// 1) Modifier variants
	const modifiers = ["מחיר", "המלצות", "השוואה", "ביקורות", "טיפים", "מדריך"];
	const variants = modifiers.map((m) => `${keyword} ${m}`);

	// 2) Top GSC queries that share the same page (if known)
	const out: string[] = [...variants];
	if (relatedPage) {
		const rows = await db.gscDailyRow.findMany({
			where: { clientId, page: relatedPage, NOT: { query: keyword.toLowerCase() } },
			orderBy: { impressions: "desc" },
			take: 200,
		});
		const seen = new Set<string>(variants.map((v) => v.toLowerCase()));
		const grouped = new Map<string, number>();
		for (const r of rows) {
			grouped.set(r.query, (grouped.get(r.query) ?? 0) + r.impressions);
		}
		const sorted = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
		for (const [q] of sorted) {
			if (seen.has(q.toLowerCase())) continue;
			if (out.length >= 12) break;
			out.push(q);
			seen.add(q.toLowerCase());
		}
	}
	return out.slice(0, 12);
}

// ─── Internal link suggestions ───────────────────────────────────

function deriveInternalLinks(
	client: ClientProfile,
	relatedPage: string,
): string[] {
	// Format: "sourceOrTargetUrl|anchor|reason"
	const targets = client.targetPages.filter((p) => p !== relatedPage).slice(0, 5);
	return targets.map((p) => {
		const path = (() => {
			try {
				return new URL(p).pathname;
			} catch {
				return p;
			}
		})();
		return `${p}|${path.replace(/[/-]/g, " ").trim() || "עמוד עיקרי"}|מקשר לעמוד מטרה חשוב — מחזק את אישיות העמוד הנוכחי בעיני גוגל`;
	});
}

// ─── Brief-type selection ────────────────────────────────────────

function selectBriefType(
	opp: OpportunityForBrief,
	hasTargetUrl: boolean,
): { briefType: string; angle: string } {
	switch (opp.type) {
		case "target_keyword_not_ranking":
			return hasTargetUrl
				? { briefType: "expand_existing_content", angle: "עמוד יעד הוגדר אבל לא מקבל ranking — חיזוק תוכן." }
				: { briefType: "new_landing_page", angle: "אין עמוד יעד — יצירת עמוד נחיתה חדש שיתאים לשאילתה." };
		case "target_keyword_needs_content":
			return { briefType: "new_article", angle: "תוכן חדש שיתאים לכוונת החיפוש." };
		case "target_keyword_needs_optimization":
			return { briefType: "optimize_existing_page", angle: "העמוד מדורג אבל לא מספיק — נדרשת אופטימיזציה ממוקדת." };
		case "high_impressions_no_clicks":
			return { briefType: "title_meta_update", angle: "הרבה חשיפות, אפס קליקים — Title/Meta לא מתאימים לכוונת החיפוש." };
		case "quick_win_position":
			return { briefType: "expand_existing_content", angle: "במרחק נגיעה מעמוד 1 — נדרש חיזוק תוכן + קישורים פנימיים." };
		case "low_ctr":
			return { briefType: "title_meta_update", angle: "המיקום בסדר, ה-CTR נמוך — Title/Meta חזקים יותר." };
		case "content_gap":
			return { briefType: "new_article", angle: "פער תוכן — נושא שלם חסר באתר." };
		case "internal_link_opportunity":
			return { briefType: "internal_link_plan", angle: "הזדמנות חיזוק עמוד דרך קישורים פנימיים מתואמים." };
		default:
			return { briefType: "new_article", angle: "ברירת מחדל — מאמר חדש לכיסוי הנושא." };
	}
}

// ─── Main generator ──────────────────────────────────────────────

export async function generateBriefFromOpportunity(
	opportunityId: string,
): Promise<GeneratedBrief | null> {
	const opp = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!opp) return null;
	const client = await db.client.findUnique({ where: { id: opp.clientId } });
	if (!client) return null;

	const keyword = (opp.relatedKeyword || opp.relatedQuery || "").trim();
	if (!keyword) return null;

	// Pull target keyword bank entry if exists (for context)
	const tk = await db.targetKeyword.findFirst({
		where: { clientId: opp.clientId, keyword: keyword.toLowerCase() },
	});
	const inferredTargetUrl = tk?.targetUrl || opp.relatedPage || "";

	// Phase 15C.2 — SEO Crawl Scope gate. Refuse to brief utility / legal /
	// system pages. Caller surfaces a Hebrew explanation; we return null so
	// the same call site that handles "no actionType match" also handles
	// "ineligible page".
	if (inferredTargetUrl) {
		const scopeCfg: ClientScopeConfig = {
			targetPages: client.targetPages,
			seoIgnoredUrls: client.seoIgnoredUrls,
			seoIgnoredPatterns: client.seoIgnoredPatterns,
			seoForcedTargetUrls: client.seoForcedTargetUrls,
		};
		const cls = classifyPage(inferredTargetUrl, scopeCfg);
		if (!cls.isSeoEligible) {
			console.log(
				`[briefs] refused to create brief for ineligible page: ${inferredTargetUrl} (${cls.scope})`,
			);
			return null;
		}
	}

	const { briefType, angle } = selectBriefType(opp as OpportunityForBrief, !!inferredTargetUrl);
	const intent = inferIntent(keyword, client.vertical);

	const profile: ClientProfile = {
		id: client.id,
		name: client.name,
		baseUrl: client.baseUrl,
		vertical: client.vertical,
		language: client.language,
		country: client.country,
		serviceAreas: client.serviceAreas,
		targetPages: client.targetPages,
		competitors: client.competitors,
		brandVoice: client.brandVoice,
	};

	const secondaryKeywords = await deriveSecondaryKeywords(
		opp.clientId,
		keyword,
		inferredTargetUrl,
	);
	const internalLinks = deriveInternalLinks(profile, inferredTargetUrl);

	const brief: GeneratedBrief = {
		targetKeyword: keyword,
		relatedQuery: opp.relatedQuery || undefined,
		relatedPage: inferredTargetUrl || undefined,
		briefType,
		searchIntent: intent,
		recommendedTitle: titleFor(keyword, client.vertical, intent, client.name),
		recommendedMetaDescription: metaDescFor(keyword, intent, client.vertical),
		recommendedH1: h1For(keyword, briefType),
		outline: outlineFor(intent, briefType, keyword),
		secondaryKeywords,
		internalLinks,
		recommendedCTA: ctaForIntent(intent, client.vertical),
		recommendedSchema: schemaForVertical(client.vertical, briefType),
		contentAngle: `${angle}${client.brandVoice ? ` טון: ${client.brandVoice}.` : ""}`,
		notes: [
			`מקור: הזדמנות "${opp.title}" (${opp.type}).`,
			client.serviceAreas.length > 0
				? `אזורי שירות לאזכור: ${client.serviceAreas.slice(0, 5).join(", ")}.`
				: "",
			client.competitors.length > 0
				? `מתחרים לבדיקה לפני כתיבה: ${client.competitors.slice(0, 3).join(", ")}.`
				: "",
			`דומיין: ${siteHost(client.baseUrl)}.`,
		]
			.filter(Boolean)
			.join(" "),
	};

	return brief;
}

// ─── Phase 15B — Brief from KeywordStrategy step ────────────────

/**
 * Maps a Strategy ActionType to the ContentBrief.briefType taxonomy.
 * Returns null when the action isn't appropriate for a brief (monitor,
 * no_change, internal_linking, etc.) — the caller treats null as a
 * guardrail: don't create a brief for this step.
 */
export function actionTypeToBriefType(actionType: string): string | null {
	switch (actionType) {
		case "content_expansion":
			return "expand_existing_content";
		case "new_article":
			return "new_article";
		case "new_landing_page":
			return "new_landing_page";
		case "title_meta_update":
		case "meta_description_update":
			return "title_meta_update";
		default:
			return null;
	}
}

export interface GeneratedStrategyBrief extends GeneratedBrief {
	keywordStrategyId: string;
	strategyStepIndex: number;
	strategyContext: string;
}

interface StrategyStepShape {
	stepNumber: number;
	actionType: string;
	action: string;
	why: string;
	expectedImpact: string;
	risk: string;
	effort: string;
	priority: string;
	requiresHumanReview: boolean;
	suggestedTiming: string;
}

interface StrategyPayloadShape {
	keyword: string;
	strategyType: string;
	riskLevel: string;
	confidence: string;
	opportunityScore: number;
	snapshot: {
		keyword: string;
		targetPage: string | null;
		rankingPage: string | null;
		currentPosition: number | null;
		positionBucket: string;
		clicks28d: number;
		impressions28d: number;
		ctrPct: number;
		intent: string;
		pageFit: string;
	};
	actionPlan: StrategyStepShape[];
	researchNotes: {
		whatWeKnow: string[];
		whatWeDontKnow: string[];
		whatToCheckManually: string[];
		whyThisStrategy: string[];
	};
	measurementPlan: {
		primaryKeyword: string;
		primaryPage: string | null;
		secondaryQueries: string[];
		metrics: string[];
		reviewWindows: string[];
		successCondition: string;
		warningCondition: string;
	};
}

/**
 * Produce a GeneratedStrategyBrief from a KeywordStrategy + the chosen
 * step (by 1-based stepNumber). Reuses Phase 5 templates for the body
 * structure, but the `notes` and `contentAngle` come from the strategy
 * so the writer sees WHY the brief was commissioned.
 *
 * Returns null when the step's actionType doesn't map to a brief type —
 * the caller treats this as a guardrail block.
 */
export async function generateBriefFromStrategyStep(
	strategyId: string,
	stepNumber: number,
): Promise<GeneratedStrategyBrief | null> {
	const strategy = await db.keywordStrategy.findUnique({
		where: { id: strategyId },
	});
	if (!strategy) return null;
	const client = await db.client.findUnique({ where: { id: strategy.clientId } });
	if (!client) return null;

	let payload: StrategyPayloadShape;
	try {
		payload = JSON.parse(strategy.payload);
	} catch {
		return null;
	}
	const step = payload.actionPlan.find((s) => s.stepNumber === stepNumber);
	if (!step) return null;

	const briefType = actionTypeToBriefType(step.actionType);
	if (!briefType) return null;

	const keyword = strategy.keyword.trim();
	if (!keyword) return null;

	// Phase 15C.2 — refuse strategy briefs that point at an ineligible page.
	// Snapshot.rankingPage is the brief's relatedPage; if the strategy was
	// rebuilt before this Phase the engine would already have skipped to a
	// secondary page, but defend the boundary anyway in case payload is stale.
	const candidateUrl = strategy.rankingPage ?? "";
	if (candidateUrl) {
		const scopeCfg: ClientScopeConfig = {
			targetPages: client.targetPages,
			seoIgnoredUrls: client.seoIgnoredUrls,
			seoIgnoredPatterns: client.seoIgnoredPatterns,
			seoForcedTargetUrls: client.seoForcedTargetUrls,
		};
		const cls = classifyPage(candidateUrl, scopeCfg);
		if (!cls.isSeoEligible) {
			console.log(
				`[briefs] refused to create strategy-brief for ineligible page: ${candidateUrl} (${cls.scope})`,
			);
			return null;
		}
	}

	const intent = payload.snapshot.intent && payload.snapshot.intent !== "unknown"
		? payload.snapshot.intent
		: inferIntent(keyword, client.vertical);
	const relatedPage = strategy.rankingPage ?? null;

	const profile: ClientProfile = {
		id: client.id,
		name: client.name,
		baseUrl: client.baseUrl,
		vertical: client.vertical,
		language: client.language,
		country: client.country,
		serviceAreas: client.serviceAreas,
		targetPages: client.targetPages,
		competitors: client.competitors,
		brandVoice: client.brandVoice,
	};

	const secondaryKeywords = await deriveSecondaryKeywords(
		strategy.clientId,
		keyword,
		relatedPage ?? "",
	);
	const internalLinks = deriveInternalLinks(profile, relatedPage ?? "");

	const strategyContext = JSON.stringify({
		stepNumber: step.stepNumber,
		actionType: step.actionType,
		action: step.action,
		why: step.why,
		expectedImpact: step.expectedImpact,
		risk: step.risk,
		effort: step.effort,
		priority: step.priority,
		requiresHumanReview: step.requiresHumanReview,
		suggestedTiming: step.suggestedTiming,
		strategyType: payload.strategyType,
		riskLevel: payload.riskLevel,
		confidence: payload.confidence,
		opportunityScore: payload.opportunityScore,
		snapshot: payload.snapshot,
		researchNotes: payload.researchNotes,
		measurementPlan: payload.measurementPlan,
	});

	const notesParts: string[] = [
		`מקור: שלב ${step.stepNumber} באסטרטגיה ל-"${keyword}" (${payload.strategyType}, ${payload.opportunityScore}/100).`,
		`המצב היום: מיקום ${payload.snapshot.currentPosition?.toFixed(1) ?? "?"} (${payload.snapshot.positionBucket}), ${payload.snapshot.impressions28d.toLocaleString("he-IL")} חשיפות, CTR ${payload.snapshot.ctrPct.toFixed(1)}%.`,
		`למה השלב הזה: ${step.why}`,
		`צפי: ${step.expectedImpact}`,
		`סיכון: ${step.risk}.`,
		`מדידה: ${payload.measurementPlan.successCondition}`,
	];
	if (step.requiresHumanReview) {
		notesParts.push("דורש סקירה אנושית לפני יישום.");
	}
	if (payload.measurementPlan.secondaryQueries.length > 0) {
		notesParts.push(
			`לשמור על: ${payload.measurementPlan.secondaryQueries.slice(0, 3).map((q) => `"${q}"`).join(", ")}.`,
		);
	}

	return {
		keywordStrategyId: strategyId,
		strategyStepIndex: stepNumber,
		strategyContext,
		targetKeyword: keyword,
		relatedQuery: payload.snapshot.keyword,
		relatedPage: relatedPage ?? undefined,
		briefType,
		searchIntent: intent,
		recommendedTitle: titleFor(keyword, client.vertical, intent, client.name),
		recommendedMetaDescription: metaDescFor(keyword, intent, client.vertical),
		recommendedH1: h1For(keyword, briefType),
		outline: outlineFor(intent, briefType, keyword),
		secondaryKeywords,
		internalLinks,
		recommendedCTA: ctaForIntent(intent, client.vertical),
		recommendedSchema: schemaForVertical(client.vertical, briefType),
		contentAngle: `${step.action}${client.brandVoice ? ` · טון: ${client.brandVoice}.` : ""}`,
		notes: notesParts.join("\n"),
	};
}

