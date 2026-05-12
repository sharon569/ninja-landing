// Phase 15D.-1 — Master Page resolver (server-only).
//
// One public entry: resolveMasterPage(targetKeywordId, options?)
//   Decides, for one keyword, which page should be the "Master Page" — the
//   canonical URL we want to rank for this keyword. Persists the answer back
//   to TargetKeyword so the Keyword Bank UI + Work Plan + Brief generator can
//   read it cheaply.
//
// Resolution cascade (highest priority first):
//   1. operator-set TargetKeyword.targetUrl                  → confidence=high
//   2. client.seoForcedTargetUrls / client.targetPages       → confidence=high
//   3. scan-derived URL/title slug match against keyword     → confidence=medium
//   4. GSC ranking page (only if SEO eligible AND its
//      classified page type matches the keyword's intent)    → confidence=medium
//   5. otherwise                                             → unknown
//
// recommendedPageAction is decided after the master page is picked. Brand
// keywords go to brand_protection; commercial/transactional keywords with a
// resolved category page get optimize_master_page; etc.

import "server-only";
import { db } from "./db";
import { classifyPage, type ClientScopeConfig } from "./page-scope";
import {
	classifyUrlPageType,
	type MasterPageType,
	type MasterPageConfidence,
	type TargetPageMatchStatus,
	type RecommendedPageAction,
} from "./master-page";

// ─── Types ────────────────────────────────────────────────

export interface ResolvedMasterPage {
	keyword: string;
	masterPage: string | null;
	masterPageType: MasterPageType;
	masterPageConfidence: MasterPageConfidence;
	masterPageReason: string;
	rankingPage: string | null;
	rankingPageType: MasterPageType;
	targetPageMatchStatus: TargetPageMatchStatus;
	recommendedPageAction: RecommendedPageAction;
	pageTypeMismatch: boolean;
	candidates: Array<{ url: string; title: string; postType: string; score: number; reason: string }>;
}

// ─── Scan-derived URL catalog ─────────────────────────────

interface ScanUrl {
	url: string;
	title: string;
	postType: string;
	slug: string;
}

/**
 * Pull a unique list of URLs the latest scan saw, with title + post_type.
 * Sourced from finding payloads (`affectedUrls`) — no need to refetch the
 * full scan blob.
 */
async function loadScanCatalog(clientId: string): Promise<ScanUrl[]> {
	const latest = await db.scan.findFirst({
		where: { clientId },
		orderBy: { ranAt: "desc" },
		include: { findings: { select: { payload: true } } },
	});
	if (!latest) return [];

	const map = new Map<string, ScanUrl>();
	for (const f of latest.findings) {
		let parsed: { affectedUrls?: Array<{ url: string; title?: string; post_type?: string; slug?: string }> };
		try {
			parsed = JSON.parse(f.payload);
		} catch {
			continue;
		}
		for (const a of parsed.affectedUrls ?? []) {
			if (!a.url || map.has(a.url)) continue;
			let slug = a.slug ?? "";
			if (!slug) {
				try {
					slug = new URL(a.url).pathname.split("/").filter(Boolean).pop() ?? "";
				} catch {}
			}
			map.set(a.url, {
				url: a.url,
				title: a.title ?? "",
				postType: a.post_type ?? "unknown",
				slug,
			});
		}
	}
	return Array.from(map.values());
}

// Map a WordPress post_type to our MasterPageType taxonomy.
function postTypeToMasterPageType(postType: string, url: string): MasterPageType {
	switch (postType) {
		case "product":
			return "product";
		case "product_cat":
		case "product_category":
			return "category";
		case "page":
			// Could be anything — fall back to URL heuristic
			return classifyUrlPageType(url);
		case "post":
			return "blog_article";
		case "service":
			return "service";
		default:
			return classifyUrlPageType(url);
	}
}

// ─── Slug / title match scoring ───────────────────────────

function normalizeForMatch(s: string): string {
	return s
		.toLowerCase()
		.replace(/[-_/]+/g, " ")
		.replace(/[%][0-9a-f]{2}/g, " ") // strip URL encoding artifacts
		.replace(/\s+/g, " ")
		.trim();
}

function tokenize(s: string): string[] {
	return normalizeForMatch(s).split(/\s+/).filter((t) => t.length > 1);
}

/**
 * Score how well a scan URL matches a keyword. Returns 0–100.
 * Higher = better. We use simple Hebrew/Latin token overlap (no
 * transliteration to keep it deterministic; the scan catalog already
 * contains Hebrew-encoded URLs that we can match Hebrew tokens against).
 */
function matchScore(keyword: string, candidate: ScanUrl): number {
	const kwTokens = tokenize(keyword);
	if (kwTokens.length === 0) return 0;

	const candidateText = `${candidate.title} ${candidate.slug} ${decodeURIComponent(candidate.url)}`;
	const candTokens = new Set(tokenize(candidateText));

	let matched = 0;
	for (const t of kwTokens) {
		if (candTokens.has(t)) matched++;
		else if (Array.from(candTokens).some((c) => c.includes(t) || t.includes(c))) matched += 0.5;
	}
	const coverage = matched / kwTokens.length;
	let base = Math.round(coverage * 100);

	// Bonus when the candidate is a category vs a deep product — for plain
	// commercial keywords we prefer category landings.
	const pageType = postTypeToMasterPageType(candidate.postType, candidate.url);
	if (pageType === "category") base += 10;
	if (pageType === "product") base -= 5;
	if (pageType === "blog_article") base -= 10;

	return Math.max(0, Math.min(100, base));
}

// ─── Intent → expected page type ───────────────────────────

function expectedMasterPageType(intent: string | null, keyword: string): MasterPageType[] {
	switch (intent) {
		case "transactional":
		case "commercial":
			return ["category", "product"];
		case "informational":
			return ["blog_article"];
		case "navigational":
			return ["homepage", "brand_page"];
		case "local":
			return ["service", "category"];
		default:
			// brand keyword fallback heuristic — short keyword (1-2 tokens, mostly Latin/Hebrew brand-like)
			if (tokenize(keyword).length <= 2) return ["category", "brand_page", "product"];
			return ["category", "product", "blog_article"];
	}
}

// Detect "brand-like" keywords. Used to route to brand_protection action.
function looksLikeBrandKeyword(keyword: string, clientName: string): boolean {
	const kw = normalizeForMatch(keyword);
	const brand = normalizeForMatch(clientName);
	if (!brand) return false;
	if (kw === brand) return true;
	if (brand.includes(kw) && kw.length >= 4) return true;
	if (kw.includes(brand) && brand.length >= 3) return true;
	return false;
}

// ─── Public entry ────────────────────────────────────────

export async function resolveMasterPage(targetKeywordId: string): Promise<ResolvedMasterPage> {
	const tk = await db.targetKeyword.findUnique({
		where: { id: targetKeywordId },
		include: { client: true },
	});
	if (!tk) throw new Error(`TargetKeyword ${targetKeywordId} not found`);

	const client = tk.client;
	const scopeCfg: ClientScopeConfig = {
		targetPages: client.targetPages,
		seoIgnoredUrls: client.seoIgnoredUrls,
		seoIgnoredPatterns: client.seoIgnoredPatterns,
		seoForcedTargetUrls: client.seoForcedTargetUrls,
	};

	// Pull current strategy snapshot to know rankingPage (post-refresh GSC).
	const strategy = await db.keywordStrategy.findFirst({
		where: { clientId: client.id, targetKeywordId },
		orderBy: { updatedAt: "desc" },
	});
	const rankingPage: string | null = strategy?.rankingPage ?? null;
	const rankingPageType = rankingPage ? classifyUrlPageType(rankingPage) : "unknown";

	const expectedTypes = expectedMasterPageType(tk.intent, tk.keyword);

	// ─── Tier 1: operator-set targetUrl ─────────────────────
	if (tk.targetUrl) {
		const scopeOk = classifyPage(tk.targetUrl, scopeCfg).isSeoEligible;
		if (scopeOk) {
			const pt = classifyUrlPageType(tk.targetUrl);
			return finalize({
				tk,
				masterPage: tk.targetUrl,
				masterPageType: pt,
				confidence: "high",
				reason: "operator-set TargetKeyword.targetUrl",
				rankingPage,
				rankingPageType,
				expectedTypes,
				candidates: [],
				clientName: client.name,
			});
		}
		// operator-set but scope-ineligible — note and continue search
	}

	// ─── Tier 2: forced target URLs / client.targetPages ────
	const forcedMatch = [...client.seoForcedTargetUrls, ...client.targetPages].find((u) => {
		const t = normalizeForMatch(u);
		const k = normalizeForMatch(tk.keyword);
		return t.includes(k) || k.split(" ").some((tok) => t.includes(tok));
	});
	if (forcedMatch && classifyPage(forcedMatch, scopeCfg).isSeoEligible) {
		const pt = classifyUrlPageType(forcedMatch);
		return finalize({
			tk,
			masterPage: forcedMatch,
			masterPageType: pt,
			confidence: "high",
			reason: "matched against client.targetPages / forcedTargetUrls",
			rankingPage,
			rankingPageType,
			expectedTypes,
			candidates: [],
			clientName: client.name,
		});
	}

	// ─── Tier 3a: GSC ranking page if it matches expected type ──
	// We prefer GSC over scan-derived matches when the page Google actually
	// ranks is of the right type for the keyword. This avoids picking a deep
	// product page when a real category page already ranks (the bug spotted
	// with "אביזרים לאמבטיה" in QA).
	const catalog = await loadScanCatalog(client.id);
	const scored = catalog
		.filter((c) => classifyPage(c.url, scopeCfg).isSeoEligible)
		.map((c) => {
			const score = matchScore(tk.keyword, c);
			const pageType = postTypeToMasterPageType(c.postType, c.url);
			let typeBonus = 0;
			if (expectedTypes[0] && pageType === expectedTypes[0]) typeBonus += 15;
			else if (expectedTypes.includes(pageType)) typeBonus += 5;
			else typeBonus -= 5;
			return { ...c, pageType, score: score + typeBonus };
		})
		.sort((a, b) => b.score - a.score);

	const top = scored[0];
	const topCandidates = scored
		.slice(0, 5)
		.map((c) => ({
			url: c.url,
			title: c.title,
			postType: c.postType,
			score: c.score,
			reason: c.pageType,
		}));

	const rankingScopeOk = rankingPage && classifyPage(rankingPage, scopeCfg).isSeoEligible;
	const rankingFitsExpected =
		rankingScopeOk && rankingPage && expectedTypes.includes(rankingPageType);

	// Prefer GSC ranking page when its type matches AND no high-confidence
	// scan match outscores it. "High-confidence scan match" = score >= 75
	// AND its page type matches the first-preferred expected type.
	if (rankingFitsExpected && rankingPage) {
		const highConfidenceScanWins =
			top && top.score >= 75 && top.pageType === expectedTypes[0];
		if (!highConfidenceScanWins) {
			return finalize({
				tk,
				masterPage: rankingPage,
				masterPageType: rankingPageType,
				confidence: "high",
				reason: "Google ranks this keyword on this page + page type matches the keyword's expected intent",
				rankingPage,
				rankingPageType,
				expectedTypes,
				candidates: topCandidates,
				clientName: client.name,
			});
		}
	}

	// ─── Tier 3b: high-confidence scan match ────────────────
	if (top && top.score >= 65) {
		const confidence: MasterPageConfidence = top.score >= 85 ? "high" : top.score >= 75 ? "medium" : "low";
		return finalize({
			tk,
			masterPage: top.url,
			masterPageType: top.pageType,
			confidence,
			reason: `scan match (score ${top.score}) · ${top.title || top.slug}`,
			rankingPage,
			rankingPageType,
			expectedTypes,
			candidates: topCandidates,
			clientName: client.name,
		});
	}

	// ─── Tier 4: GSC ranking page as fallback (even if type mismatch) ──
	if (rankingPage && rankingScopeOk) {
		const fits = expectedTypes.includes(rankingPageType);
		if (fits) {
			return finalize({
				tk,
				masterPage: rankingPage,
				masterPageType: rankingPageType,
				confidence: "medium",
				reason: "Google ranks this query here; no stronger scan match",
				rankingPage,
				rankingPageType,
				expectedTypes,
				candidates: topCandidates,
				clientName: client.name,
			});
		}
		// GSC ranking page exists but doesn't fit (e.g. product page for category keyword)
		return finalize({
			tk,
			masterPage: null,
			masterPageType: "unknown",
			confidence: "low",
			reason: `Google ranks on ${rankingPage} (${rankingPageType}) but it doesn't match expected page type for "${tk.keyword}" intent`,
			rankingPage,
			rankingPageType,
			expectedTypes,
			candidates: topCandidates,
			clientName: client.name,
			forceAction: "human_review",
		});
	}

	// ─── Tier 5: nothing ────────────────────────────────────
	return finalize({
		tk,
		masterPage: null,
		masterPageType: "unknown",
		confidence: "unknown",
		reason: "no operator target, no forced URL, no scan match, no GSC ranking page",
		rankingPage,
		rankingPageType,
		expectedTypes,
		candidates: topCandidates,
		clientName: client.name,
		forceAction: "choose_master_page",
	});
}

// ─── Finalizer — derives match status + recommended action + persists ──

interface FinalizeArgs {
	tk: { id: string; keyword: string; targetUrl: string | null; intent: string | null };
	masterPage: string | null;
	masterPageType: MasterPageType;
	confidence: MasterPageConfidence;
	reason: string;
	rankingPage: string | null;
	rankingPageType: MasterPageType;
	expectedTypes: MasterPageType[];
	candidates: Array<{ url: string; title: string; postType: string; score: number; reason: string }>;
	clientName: string;
	forceAction?: RecommendedPageAction;
}

async function finalize(a: FinalizeArgs): Promise<ResolvedMasterPage> {
	// targetPageMatchStatus
	let status: TargetPageMatchStatus;
	if (!a.tk.targetUrl) {
		status = a.masterPage ? "master_page_candidate_found" : "target_missing";
	} else if (a.rankingPage && a.tk.targetUrl === a.rankingPage) {
		status = "target_matches_ranking";
	} else if (a.rankingPage && a.tk.targetUrl !== a.rankingPage) {
		status = "target_differs_from_ranking";
	} else {
		status = "master_page_candidate_found";
	}

	// page type mismatch
	const pageTypeMismatch =
		a.masterPage !== null && a.masterPageType !== "unknown" && !a.expectedTypes.includes(a.masterPageType);

	// recommended action
	let action: RecommendedPageAction;
	if (a.forceAction) {
		action = a.forceAction;
	} else if (looksLikeBrandKeyword(a.tk.keyword, a.clientName)) {
		action = "brand_protection";
	} else if (!a.masterPage) {
		action = "choose_master_page";
	} else if (pageTypeMismatch) {
		action = "human_review";
	} else if (a.masterPageType === "category") {
		action = "improve_category_page";
	} else if (a.masterPageType === "product") {
		action = "improve_product_page";
	} else if (a.masterPageType === "blog_article") {
		action = "create_supporting_article";
	} else if (a.masterPageType === "homepage" || a.masterPageType === "brand_page") {
		action = "brand_protection";
	} else {
		action = "optimize_master_page";
	}

	// Persist back to TargetKeyword
	await db.targetKeyword.update({
		where: { id: a.tk.id },
		data: {
			masterPage: a.masterPage,
			masterPageType: a.masterPageType,
			masterPageConfidence: a.confidence,
			masterPageReason: a.reason,
			rankingPage: a.rankingPage,
			rankingPageType: a.rankingPageType,
			targetPageMatchStatus: status,
			recommendedPageAction: action,
			pageTypeMismatch,
			masterPageResolvedAt: new Date(),
		},
	});

	return {
		keyword: a.tk.keyword,
		masterPage: a.masterPage,
		masterPageType: a.masterPageType,
		masterPageConfidence: a.confidence,
		masterPageReason: a.reason,
		rankingPage: a.rankingPage,
		rankingPageType: a.rankingPageType,
		targetPageMatchStatus: status,
		recommendedPageAction: action,
		pageTypeMismatch,
		candidates: a.candidates,
	};
}

// ─── Batch helper for refresh pipeline ──────────────────────

export async function resolveAllMasterPages(clientId: string): Promise<{
	resolved: number;
	failed: number;
	results: ResolvedMasterPage[];
}> {
	const kws = await db.targetKeyword.findMany({
		where: { clientId, status: "active" },
		select: { id: true },
	});
	const results: ResolvedMasterPage[] = [];
	let resolved = 0;
	let failed = 0;
	for (const k of kws) {
		try {
			const r = await resolveMasterPage(k.id);
			results.push(r);
			resolved++;
		} catch (err) {
			console.error(`resolveMasterPage failed for ${k.id}:`, err);
			failed++;
		}
	}
	return { resolved, failed, results };
}
