// Internal Linking Engine — server-only.
//
// Builds a heuristic graph view of the client's pages from:
//  - the most recent Scan's "orphan-page" / "no-internal-links-out" findings
//    (since the plugin only emits link COUNTS, not the actual link list)
//  - GSC daily rows (per page traffic = authority proxy)
//  - TargetKeyword bank (priority + intent)
//  - Client.targetPages (money pages)
//  - Active Opportunities (relatedPage)
//
// What we CAN do: identify pages that need more incoming links and propose
// authority source pages + anchor candidates.
//
// What we CAN'T do without a Plugin v0.4 (would need actual link/anchor list):
//  - detect "missing anchor opportunity" (source mentions phrase but no link)
//  - detect anchor-text cannibalization
//  - validate that a suggestion doesn't already exist

import "server-only";
import { db } from "./db";

// ─── Internal types ──────────────────────────────────────────────

interface PageInfo {
	url: string;
	title: string | null;
	postType?: string | null;
	isOrphan: boolean;          // incoming_link_count = 0
	hasNoOutgoing: boolean;     // internal_link_count = 0
	gscClicks: number;          // 28-day total
	gscImpressions: number;
	gscTopQuery: string | null;
	gscTopQueryImpressions: number;
	isTargetPage: boolean;      // in client.targetPages
	relatedTargetKeyword?: { keyword: string; priority: string } | null;
	relatedOpportunityIds: string[];
}

interface ClientCtx {
	id: string;
	baseUrl: string;
	targetPages: string[];
	vertical: string | null;
}

export interface Suggestion {
	sourcePage: string;
	sourceTitle: string | null;
	targetPage: string;
	targetTitle: string | null;
	suggestedAnchor: string;
	reason: string;
	evidence: object;
	priorityScore: number;
	impact: "low" | "medium" | "high";
	effort: "low" | "medium" | "high";
	confidence: "low" | "medium" | "high";
	opportunityId?: string | null;
	source: string;
}

export interface AnalyzeLinkResult {
	pagesConsidered: number;
	targets: number;
	sources: number;
	created: number;
	updated: number;
	durationMs: number;
}

// ─── URL helpers ─────────────────────────────────────────────────

function normalizeUrl(u: string): string {
	try {
		const url = new URL(u);
		url.hash = "";
		// strip trailing slash for consistency, but keep root '/'
		if (url.pathname.length > 1 && url.pathname.endsWith("/"))
			url.pathname = url.pathname.slice(0, -1);
		return url.toString();
	} catch {
		return u;
	}
}

function urlPath(u: string): string {
	try {
		return new URL(u).pathname;
	} catch {
		return u;
	}
}

/** Cheap token-overlap "relatedness" between two strings (title/slug). */
function relatednessScore(a: string, b: string): number {
	if (!a || !b) return 0;
	const tokenize = (s: string) =>
		s
			.toLowerCase()
			.replace(/[\/_\-–—,.|]+/g, " ")
			.split(/\s+/)
			.filter((t) => t.length >= 3);
	const A = new Set(tokenize(a));
	const B = new Set(tokenize(b));
	if (A.size === 0 || B.size === 0) return 0;
	let shared = 0;
	for (const t of A) if (B.has(t)) shared++;
	return shared / Math.min(A.size, B.size); // 0..1
}

// ─── Data loaders ────────────────────────────────────────────────

interface AffectedUrl {
	blog_id?: number;
	post_id?: number;
	url?: string;
	post_type?: string;
	title?: string;
	detail?: string;
}

interface ScanFindingPayload {
	ruleId: string;
	affectedUrls?: AffectedUrl[];
}

/**
 * Build the per-URL view we need.  Pre-Plugin-v0.4, we reconstruct from
 * the latest scan's Finding rows (which carry url + title) plus aggregate
 * GSC data per page.
 */
async function loadPageInfo(client: ClientCtx): Promise<Map<string, PageInfo>> {
	const pages = new Map<string, PageInfo>();

	const latestScan = await db.scan.findFirst({
		where: { clientId: client.id },
		orderBy: { ranAt: "desc" },
		include: {
			findings: {
				where: {
					ruleId: { in: ["orphan-page", "no-internal-links-out", "missing-yoast-title", "missing-yoast-description"] },
				},
				select: { ruleId: true, payload: true },
			},
		},
	});

	function getOrCreate(url: string, title: string | null, postType: string | null): PageInfo {
		const norm = normalizeUrl(url);
		let p = pages.get(norm);
		if (!p) {
			p = {
				url: norm,
				title: title || null,
				postType: postType || null,
				isOrphan: false,
				hasNoOutgoing: false,
				gscClicks: 0,
				gscImpressions: 0,
				gscTopQuery: null,
				gscTopQueryImpressions: 0,
				isTargetPage: client.targetPages.includes(norm),
				relatedOpportunityIds: [],
			};
			pages.set(norm, p);
		}
		// Upgrade title if we now know one
		if (!p.title && title) p.title = title;
		if (!p.postType && postType) p.postType = postType;
		return p;
	}

	if (latestScan) {
		for (const f of latestScan.findings) {
			let payload: ScanFindingPayload;
			try {
				payload = JSON.parse(f.payload) as ScanFindingPayload;
			} catch {
				continue;
			}
			for (const u of payload.affectedUrls ?? []) {
				if (!u.url) continue;
				const p = getOrCreate(u.url, u.title ?? null, u.post_type ?? null);
				if (f.ruleId === "orphan-page") p.isOrphan = true;
				if (f.ruleId === "no-internal-links-out") p.hasNoOutgoing = true;
			}
		}
	}

	// Also seed pages from the target list itself (so we never miss them).
	for (const tp of client.targetPages) {
		const norm = normalizeUrl(tp);
		if (!pages.has(norm)) {
			pages.set(norm, {
				url: norm,
				title: null,
				postType: null,
				isOrphan: false,
				hasNoOutgoing: false,
				gscClicks: 0,
				gscImpressions: 0,
				gscTopQuery: null,
				gscTopQueryImpressions: 0,
				isTargetPage: true,
				relatedOpportunityIds: [],
			});
		}
	}

	// GSC: per-page aggregate + top query
	const gscRows = await db.gscDailyRow.findMany({
		where: { clientId: client.id, page: { not: null } },
		select: { page: true, query: true, clicks: true, impressions: true },
	});
	const byPage = new Map<string, { clicks: number; impressions: number; queries: Map<string, number> }>();
	for (const r of gscRows) {
		if (!r.page) continue;
		const norm = normalizeUrl(r.page);
		const cur = byPage.get(norm) ?? { clicks: 0, impressions: 0, queries: new Map() };
		cur.clicks += r.clicks;
		cur.impressions += r.impressions;
		cur.queries.set(r.query, (cur.queries.get(r.query) ?? 0) + r.impressions);
		byPage.set(norm, cur);
	}
	for (const [norm, agg] of byPage) {
		// Seed page if we hadn't seen it in findings.
		const p = pages.get(norm) ?? getOrCreate(norm, null, null);
		p.gscClicks = agg.clicks;
		p.gscImpressions = agg.impressions;
		let top: [string, number] | null = null;
		for (const e of agg.queries) {
			if (!top || e[1] > top[1]) top = e;
		}
		if (top) {
			p.gscTopQuery = top[0];
			p.gscTopQueryImpressions = top[1];
		}
	}

	// Map target keywords to pages (by their declared targetUrl).
	const tks = await db.targetKeyword.findMany({
		where: { clientId: client.id, status: { in: ["active", "ranking", "needs_optimization", "needs_content"] } },
	});
	for (const tk of tks) {
		if (!tk.targetUrl) continue;
		const norm = normalizeUrl(tk.targetUrl);
		const p = pages.get(norm) ?? getOrCreate(norm, null, null);
		p.relatedTargetKeyword = { keyword: tk.keyword, priority: tk.priority };
	}

	// Tag pages that have active opportunities pointing at them.
	const opps = await db.opportunity.findMany({
		where: {
			clientId: client.id,
			status: { in: ["detected", "recommended", "needs_human_review", "approved"] },
			relatedPage: { not: "" },
		},
		select: { id: true, relatedPage: true },
	});
	for (const o of opps) {
		const norm = normalizeUrl(o.relatedPage);
		const p = pages.get(norm) ?? getOrCreate(norm, null, null);
		p.relatedOpportunityIds.push(o.id);
	}

	return pages;
}

// ─── Anchor selection ───────────────────────────────────────────

function pickAnchors(target: PageInfo): string[] {
	const out = new Set<string>();

	// 1) From the target keyword bank
	if (target.relatedTargetKeyword) {
		out.add(target.relatedTargetKeyword.keyword);
		out.add(`שירותי ${target.relatedTargetKeyword.keyword}`);
	}

	// 2) From the page's top GSC query
	if (target.gscTopQuery && target.gscTopQueryImpressions >= 20) {
		out.add(target.gscTopQuery);
	}

	// 3) From the title
	if (target.title) {
		// Strip brand suffix patterns
		const cleaned = target.title.replace(/\s*[|·\-—]+\s*[^|·\-—]+$/, "").trim();
		if (cleaned.length >= 3 && cleaned.length <= 80) out.add(cleaned);
	}

	// 4) From slug as fallback
	if (out.size === 0) {
		const path = urlPath(target.url).replace(/^\/|\/$/g, "");
		const last = path.split("/").pop() ?? "";
		const slug = last.replace(/-/g, " ").trim();
		if (slug.length >= 3) out.add(slug);
	}

	// 5) Generic fallback so we always have at least one
	if (out.size === 0) out.add("קראו עוד");

	return Array.from(out).slice(0, 3);
}

// ─── Source ranking ─────────────────────────────────────────────

function rankCandidateSources(
	target: PageInfo,
	allPages: PageInfo[],
	maxSources = 3,
): { source: PageInfo; relatedness: number }[] {
	const candidates = allPages
		.filter((p) => p.url !== target.url)
		.filter((p) => p.gscImpressions >= 30 || p.gscClicks >= 1 || p.title) // need some signal
		.map((p) => {
			const titleRel = relatednessScore(p.title ?? "", target.title ?? "");
			const slugRel = relatednessScore(urlPath(p.url), urlPath(target.url));
			const queryRel = relatednessScore(p.gscTopQuery ?? "", target.gscTopQuery ?? "");
			const relatedness = Math.max(titleRel, slugRel, queryRel);
			return { source: p, relatedness };
		})
		// require *some* relatedness or *significant* authority
		.filter((c) => c.relatedness >= 0.2 || c.source.gscImpressions >= 200)
		.sort((a, b) => {
			// authority first (gscClicks), then relatedness
			const authorityDelta = b.source.gscClicks - a.source.gscClicks;
			if (Math.abs(authorityDelta) > 5) return authorityDelta;
			return b.relatedness - a.relatedness;
		})
		.slice(0, maxSources);

	return candidates;
}

// ─── Priority scoring ───────────────────────────────────────────

function scoreFor(opts: {
	target: PageInfo;
	source: PageInfo;
	relatedness: number;
	reasonClass: "orphan" | "target_boost" | "keyword" | "opportunity" | "authority";
}): { score: number; impact: "low" | "medium" | "high"; confidence: "low" | "medium" | "high" } {
	let s = 30;
	let impact: "low" | "medium" | "high" = "medium";
	let confidence: "low" | "medium" | "high" = "medium";

	// Target weight
	if (opts.target.isTargetPage) {
		s += 20;
		impact = "high";
	}
	if (opts.target.relatedTargetKeyword) {
		s += 10;
		if (opts.target.relatedTargetKeyword.priority === "critical") s += 10;
		else if (opts.target.relatedTargetKeyword.priority === "high") s += 6;
	}
	if (opts.target.relatedOpportunityIds.length > 0) s += 8;
	if (opts.target.isOrphan) {
		s += 10;
		impact = "high";
	} else {
		// Diminishing returns: pages with no traffic + not target = lower priority
		if (!opts.target.isTargetPage && opts.target.gscImpressions < 10) s -= 8;
	}

	// Source authority (capped 0..15)
	const authorityBoost = Math.min(15, Math.floor(Math.log10(opts.source.gscClicks + 1) * 5));
	s += authorityBoost;

	// Relatedness
	s += Math.round(opts.relatedness * 15);

	// Confidence
	if (opts.relatedness >= 0.5 || opts.target.relatedTargetKeyword) confidence = "high";
	else if (opts.relatedness < 0.25 && opts.source.gscClicks < 5) confidence = "low";

	return {
		score: Math.max(0, Math.min(100, s)),
		impact,
		confidence,
	};
}

// ─── Detectors ──────────────────────────────────────────────────

function buildSuggestionsForTarget(
	target: PageInfo,
	allPages: PageInfo[],
	reasonClass: "orphan" | "target_boost" | "keyword" | "opportunity" | "authority",
	source: string,
): Suggestion[] {
	const sources = rankCandidateSources(target, allPages);
	if (sources.length === 0) return [];

	const anchors = pickAnchors(target);
	const out: Suggestion[] = [];

	for (const { source: src, relatedness } of sources) {
		const anchor = anchors[0]; // top anchor per pair; bulk-create extra anchors only on demand
		const { score, impact, confidence } = scoreFor({
			target,
			source: src,
			relatedness,
			reasonClass,
		});

		let reason = "";
		switch (reasonClass) {
			case "orphan":
				reason = `העמוד הוא יתום (0 קישורים נכנסים). קישור מ-${urlPath(src.url)} עם authority של ${src.gscClicks.toLocaleString()} קליקים חודשי יחזק אותו.`;
				break;
			case "target_boost":
				reason = `עמוד יעד עסקי שצריך יותר קישורים פנימיים. קישור מעמוד חזק (${urlPath(src.url)}) יעזור.`;
				break;
			case "keyword":
				reason = `העמוד הוא העמוד הראשי למילת היעד ${target.relatedTargetKeyword?.keyword}. קישור פנימי ממוקד מחזק את ה-relevance בעיני גוגל.`;
				break;
			case "opportunity":
				reason = `קיימת הזדמנות SEO פעילה לעמוד הזה. קישור פנימי הוא חלק מהפעולה.`;
				break;
			case "authority":
				reason = `${urlPath(src.url)} הוא עמוד בעל הרבה traffic (${src.gscClicks.toLocaleString()} קליקים). העברת חלק מהכוח לעמוד תורמת לדירוג.`;
				break;
		}

		out.push({
			sourcePage: src.url,
			sourceTitle: src.title,
			targetPage: target.url,
			targetTitle: target.title,
			suggestedAnchor: anchor,
			reason,
			evidence: {
				sourceGscClicks: src.gscClicks,
				sourceGscImpressions: src.gscImpressions,
				targetGscClicks: target.gscClicks,
				targetGscImpressions: target.gscImpressions,
				relatednessScore: Number(relatedness.toFixed(2)),
				targetIsOrphan: target.isOrphan,
				targetIsTargetPage: target.isTargetPage,
				targetKeyword: target.relatedTargetKeyword?.keyword,
				openOpportunities: target.relatedOpportunityIds.length,
			},
			priorityScore: score,
			impact,
			effort: "low", // adding an internal link is always cheap
			confidence,
			opportunityId: target.relatedOpportunityIds[0] ?? null,
			source,
		});
	}
	return out;
}

// ─── Runner ─────────────────────────────────────────────────────

export async function analyzeInternalLinks(clientId: string): Promise<AnalyzeLinkResult> {
	const startedAt = Date.now();
	const client = await db.client.findUnique({ where: { id: clientId } });
	if (!client) throw new Error(`Client ${clientId} not found`);

	const ctx: ClientCtx = {
		id: client.id,
		baseUrl: client.baseUrl,
		targetPages: client.targetPages.map(normalizeUrl),
		vertical: client.vertical,
	};

	const pages = await loadPageInfo(ctx);
	const allPages = Array.from(pages.values());

	// Build target list — pages that should *receive* links.
	const targets: { page: PageInfo; reasonClass: "orphan" | "target_boost" | "keyword" | "opportunity" | "authority"; source: string }[] = [];

	for (const p of allPages) {
		if (p.isOrphan)
			targets.push({ page: p, reasonClass: "orphan", source: "detectOrphanPageSupport" });
		if (p.isTargetPage)
			targets.push({ page: p, reasonClass: "target_boost", source: "detectTargetPageBoost" });
		if (p.relatedTargetKeyword)
			targets.push({ page: p, reasonClass: "keyword", source: "detectKeywordPageSupport" });
		if (p.relatedOpportunityIds.length > 0)
			targets.push({ page: p, reasonClass: "opportunity", source: "detectOpportunitySupport" });
	}

	// "Authority relay" detector — for high-authority source pages that aren't yet
	// pointing to any target, suggest one most-related target.
	const authoritySources = allPages
		.filter((p) => p.gscClicks >= 50)
		.sort((a, b) => b.gscClicks - a.gscClicks)
		.slice(0, 10);
	for (const src of authoritySources) {
		// Find most-related target among the "needs help" pool
		let bestTarget: PageInfo | null = null;
		let bestRel = 0;
		for (const p of allPages) {
			if (p.url === src.url) continue;
			if (!(p.isTargetPage || p.relatedTargetKeyword || p.isOrphan)) continue;
			const rel = Math.max(
				relatednessScore(src.title ?? "", p.title ?? ""),
				relatednessScore(urlPath(src.url), urlPath(p.url)),
				relatednessScore(src.gscTopQuery ?? "", p.gscTopQuery ?? ""),
			);
			if (rel > bestRel) {
				bestRel = rel;
				bestTarget = p;
			}
		}
		if (bestTarget && bestRel >= 0.2) {
			targets.push({ page: bestTarget, reasonClass: "authority", source: "detectAuthorityRelay" });
		}
	}

	// Suggestions
	const allSuggestions: Suggestion[] = [];
	const targetSeen = new Map<string, number>(); // cap suggestions per target
	for (const t of targets) {
		const seen = targetSeen.get(t.page.url) ?? 0;
		if (seen >= 4) continue;
		const built = buildSuggestionsForTarget(t.page, allPages, t.reasonClass, t.source);
		for (const s of built) {
			allSuggestions.push(s);
		}
		targetSeen.set(t.page.url, seen + built.length);
	}

	allSuggestions.sort((a, b) => b.priorityScore - a.priorityScore);

	// UPSERT (dedupe by clientId + source + target + anchor)
	let created = 0;
	let updated = 0;
	for (const s of allSuggestions) {
		try {
			const result = await db.internalLinkSuggestion.upsert({
				where: {
					clientId_sourcePage_targetPage_suggestedAnchor: {
						clientId,
						sourcePage: s.sourcePage,
						targetPage: s.targetPage,
						suggestedAnchor: s.suggestedAnchor,
					},
				},
				create: {
					clientId,
					sourcePage: s.sourcePage,
					sourceTitle: s.sourceTitle,
					targetPage: s.targetPage,
					targetTitle: s.targetTitle,
					suggestedAnchor: s.suggestedAnchor,
					reason: s.reason,
					evidence: JSON.stringify(s.evidence),
					priorityScore: s.priorityScore,
					impact: s.impact,
					effort: s.effort,
					confidence: s.confidence,
					status: "suggested",
					opportunityId: s.opportunityId,
					source: s.source,
				},
				update: {
					sourceTitle: s.sourceTitle,
					targetTitle: s.targetTitle,
					reason: s.reason,
					evidence: JSON.stringify(s.evidence),
					priorityScore: s.priorityScore,
					impact: s.impact,
					effort: s.effort,
					confidence: s.confidence,
					opportunityId: s.opportunityId,
					source: s.source,
				},
			});
			if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
			else updated++;
		} catch (err) {
			console.error("upsert failed for link suggestion", err);
		}
	}

	return {
		pagesConsidered: allPages.length,
		targets: targets.length,
		sources: authoritySources.length,
		created,
		updated,
		durationMs: Date.now() - startedAt,
	};
}
