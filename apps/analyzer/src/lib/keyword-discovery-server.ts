// Phase 16.2 — Keyword Discovery engine (server-only).
//
// Compares ALL GSC queries for a client against their keyword bank, and
// surfaces high-value queries that should be tracked. Operator approves
// via Telegram or web UI → converted to TargetKeyword → auto-pipeline.
//
// SAFETY: Read-only against GSC data + keyword bank. Never mutates client
// site, never auto-adds keywords. Suggestions must be explicitly approved.

import "server-only";

import { db } from "@/lib/db";
import {
	MIN_IMPRESSIONS,
	MIN_POSITION,
	MAX_POSITION,
	MAX_SUGGESTIONS_PER_RUN,
	type DiscoveryResult,
} from "@/lib/keyword-discovery";
import { isSeoEligible } from "@/lib/page-scope";

// ─── Main ─────────────────────────────────────────────────────

export async function discoverKeywords(clientId: string): Promise<DiscoveryResult> {
	const start = Date.now();

	const client = await db.client.findUnique({
		where: { id: clientId },
		select: {
			id: true,
			name: true,
			baseUrl: true,
			vertical: true,
			seoIgnoredUrls: true,
			seoIgnoredPatterns: true,
			seoForcedTargetUrls: true,
			targetPages: true,
		},
	});

	if (!client) throw new Error(`Client ${clientId} not found`);

	// 1. Aggregate all GSC queries for last 28 days
	const gscAgg = await db.gscDailyRow.groupBy({
		by: ["query", "page"],
		where: { clientId },
		_sum: { clicks: true, impressions: true },
		_avg: { position: true, ctr: true },
		having: {
			impressions: { _sum: { gte: MIN_IMPRESSIONS } },
		},
	});

	// 2. Aggregate by query (best page per query)
	const queryMap = new Map<
		string,
		{
			query: string;
			bestPage: string | null;
			clicks: number;
			impressions: number;
			ctr: number | null;
			position: number | null;
		}
	>();

	for (const row of gscAgg) {
		const q = row.query.toLowerCase().trim();
		const existing = queryMap.get(q);
		const clicks = row._sum.clicks ?? 0;
		const impressions = row._sum.impressions ?? 0;

		if (!existing || impressions > existing.impressions) {
			queryMap.set(q, {
				query: row.query,
				bestPage: row.page ?? null,
				clicks,
				impressions,
				ctr: row._avg.ctr ?? null,
				position: row._avg.position ?? null,
			});
		}
	}

	const totalGscQueries = queryMap.size;

	// 3. Load keyword bank (normalized)
	const keywords = await db.targetKeyword.findMany({
		where: { clientId },
		select: { keyword: true },
	});
	const bankSet = new Set(keywords.map((k) => k.keyword.toLowerCase().trim()));
	const alreadyInBank = [...queryMap.keys()].filter((q) => bankSet.has(q)).length;

	// 4. Filter and score
	const candidates: Array<{
		query: string;
		normalizedQuery: string;
		page: string | null;
		clicks: number;
		impressions: number;
		ctr: number | null;
		position: number | null;
		score: number;
		intent: string | null;
		reason: string;
	}> = [];

	const clientHost = safeHost(client.baseUrl);
	const scopeConfig = {
		targetPages: client.targetPages,
		seoIgnoredUrls: client.seoIgnoredUrls,
		seoIgnoredPatterns: client.seoIgnoredPatterns,
		seoForcedTargetUrls: client.seoForcedTargetUrls,
	};

	let filtered = 0;

	for (const [normalized, data] of queryMap) {
		// Skip if already in bank
		if (bankSet.has(normalized)) continue;

		// Skip if position out of range
		if (data.position !== null && data.position < MIN_POSITION) { filtered++; continue; }
		if (data.position !== null && data.position > MAX_POSITION) { filtered++; continue; }

		// Skip brand/navigational queries
		if (isBrandQuery(normalized, clientHost)) { filtered++; continue; }

		// Skip if best page is not SEO-eligible
		if (data.bestPage) {
			try {
				if (!isSeoEligible(data.bestPage, scopeConfig)) { filtered++; continue; }
			} catch {
				// If scope check fails, allow through
			}
		}

		// Score
		const score = computeScore(data.impressions, data.position, data.ctr);
		const intent = inferIntent(normalized);
		const reason = buildReason(data);

		candidates.push({
			query: data.query,
			normalizedQuery: normalized,
			page: data.bestPage,
			clicks: data.clicks,
			impressions: data.impressions,
			ctr: data.ctr,
			position: data.position,
			score,
			intent,
			reason,
		});
	}

	// Sort by score desc, take top N
	candidates.sort((a, b) => b.score - a.score);
	const top = candidates.slice(0, MAX_SUGGESTIONS_PER_RUN);

	// 5. Upsert suggestions
	let suggested = 0;
	let updated = 0;

	for (const c of top) {
		const existing = await db.keywordSuggestion.findUnique({
			where: {
				clientId_normalizedQuery: { clientId, normalizedQuery: c.normalizedQuery },
			},
			select: { id: true, status: true },
		});

		if (existing) {
			// Don't overwrite approved/rejected/converted
			if (existing.status !== "suggested") continue;

			await db.keywordSuggestion.update({
				where: { id: existing.id },
				data: {
					clicks28d: c.clicks,
					impressions28d: c.impressions,
					ctr: c.ctr,
					position: c.position,
					score: c.score,
					intent: c.intent,
					reason: c.reason,
					page: c.page,
				},
			});
			updated++;
		} else {
			await db.keywordSuggestion.create({
				data: {
					clientId,
					query: c.query,
					normalizedQuery: c.normalizedQuery,
					page: c.page,
					clicks28d: c.clicks,
					impressions28d: c.impressions,
					ctr: c.ctr,
					position: c.position,
					score: c.score,
					intent: c.intent,
					reason: c.reason,
				},
			});
			suggested++;
		}
	}

	return {
		clientId,
		totalGscQueries,
		alreadyInBank,
		filtered,
		suggested,
		updated,
		durationMs: Date.now() - start,
	};
}

// ─── Convert suggestion to TargetKeyword ──────────────────────

export async function convertSuggestion(
	suggestionId: string,
	actor: string,
): Promise<{ keywordId: string }> {
	const suggestion = await db.keywordSuggestion.findUnique({
		where: { id: suggestionId },
	});

	if (!suggestion) throw new Error("Suggestion not found");
	if (suggestion.status === "converted") throw new Error("Already converted");

	// Create TargetKeyword
	const keyword = await db.targetKeyword.create({
		data: {
			clientId: suggestion.clientId,
			keyword: suggestion.normalizedQuery,
			intent: suggestion.intent,
			priority: suggestion.score >= 70 ? "high" : suggestion.score >= 40 ? "medium" : "low",
			targetUrl: suggestion.page,
			status: "active",
			notes: `Discovered from GSC. ${suggestion.reason}`,
		},
	});

	// Mark suggestion as converted
	await db.keywordSuggestion.update({
		where: { id: suggestionId },
		data: {
			status: "converted",
			convertedKeywordId: keyword.id,
		},
	});

	return { keywordId: keyword.id };
}

export async function rejectSuggestion(suggestionId: string): Promise<void> {
	await db.keywordSuggestion.update({
		where: { id: suggestionId },
		data: { status: "rejected" },
	});
}

// ─── Scoring ──────────────────────────────────────────────────

function computeScore(
	impressions: number,
	position: number | null,
	ctr: number | null,
): number {
	let score = 0;

	// Impressions: 0-40 points (log scale)
	score += Math.min(40, Math.round(Math.log10(Math.max(1, impressions)) * 13));

	// Position proximity: 0-25 points (closer to top = higher)
	if (position !== null) {
		if (position <= 10) score += 25;
		else if (position <= 20) score += 20;
		else if (position <= 30) score += 12;
		else score += 5;
	}

	// CTR gap: 0-15 points (low CTR relative to position = title/meta opportunity)
	if (ctr !== null && position !== null) {
		const expectedCtr = expectedCtrForPosition(position);
		if (ctr < expectedCtr * 0.7) score += 15;
		else if (ctr < expectedCtr * 0.85) score += 8;
	}

	// Priority boost: 0-10 points for position 6-15 (quick win zone)
	if (position !== null && position >= 6 && position <= 15) {
		score += 10;
	}

	return Math.min(100, score);
}

function expectedCtrForPosition(position: number): number {
	if (position <= 1) return 0.30;
	if (position <= 2) return 0.15;
	if (position <= 3) return 0.10;
	if (position <= 5) return 0.06;
	if (position <= 10) return 0.03;
	if (position <= 20) return 0.01;
	return 0.005;
}

// ─── Intent ───────────────────────────────────────────────────

function inferIntent(query: string): string | null {
	const q = query.toLowerCase();

	// Hebrew transactional
	if (/קנ[הי]|מחיר|הזמנ[הת]|משלוח|עלות|זול/.test(q)) return "transactional";
	// English transactional
	if (/\b(buy|price|order|cheap|deal|discount|coupon|shop)\b/.test(q)) return "transactional";

	// Hebrew commercial
	if (/השוואה|מומלץ|טוב ביותר|ביקורת|שירות/.test(q)) return "commercial";
	// English commercial
	if (/\b(best|review|compare|vs|top|recommend)\b/.test(q)) return "commercial";

	// Hebrew informational
	if (/איך|מה זה|למה|מדריך|הסבר|דרכים/.test(q)) return "informational";
	// English informational
	if (/\b(how|what|why|guide|tutorial|tips|learn)\b/.test(q)) return "informational";

	// Hebrew local
	if (/ליד|באזור|בתל אביב|בירושלים|בחיפה|near me/.test(q)) return "local";

	return null;
}

// ─── Brand Detection ──────────────────────────────────────────

function isBrandQuery(query: string, clientHost: string): boolean {
	const q = query.toLowerCase();
	// Check if query contains the domain name (minus TLD)
	const domainParts = clientHost.split(".");
	const brandName = domainParts[0]; // e.g., "levizon" from "levizon.co.il"

	if (brandName.length >= 3 && q.includes(brandName)) return true;

	// Common navigational patterns
	if (/\b(login|signin|sign in|dashboard|admin|account)\b/.test(q)) return true;

	return false;
}

// ─── Reason Builder ───────────────────────────────────────────

function buildReason(data: {
	impressions: number;
	clicks: number;
	position: number | null;
	ctr: number | null;
}): string {
	const parts: string[] = [];

	parts.push(`${data.impressions.toLocaleString()} חיפושים/חודש`);

	if (data.position !== null) {
		parts.push(`מיקום ${Math.round(data.position)}`);
	}

	if (data.position !== null && data.position >= 6 && data.position <= 15) {
		parts.push("באזור ה-Quick Win");
	}

	if (data.ctr !== null && data.position !== null) {
		const expected = expectedCtrForPosition(data.position);
		if (data.ctr < expected * 0.7) {
			parts.push("CTR נמוך — פוטנציאל לשיפור כותרת");
		}
	}

	return parts.join(" · ");
}

// ─── Helpers ──────────────────────────────────────────────────

function safeHost(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return url.toLowerCase();
	}
}
