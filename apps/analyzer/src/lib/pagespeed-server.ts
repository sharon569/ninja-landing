// Phase 16.6 — PageSpeed persistence + queries (server-only).
//
// persistSpeedScores() is called from tech-audit-server after PSI runs.
// getSpeedSummary() and getSpeedHistory() power the dashboard + Telegram.

import "server-only";

import { db } from "@/lib/db";
import { cwvRating, type SpeedSummary } from "@/lib/pagespeed";

// ─── Persist ──────────────────────────────────────────────────

export interface PsiScoreInput {
	url: string;
	mobilePerf?: number;
	desktopPerf?: number;
	lcp?: number;       // seconds
	inp?: number;       // ms
	cls?: number;
}

export async function persistSpeedScores(
	clientId: string,
	results: PsiScoreInput[],
): Promise<number> {
	let persisted = 0;

	for (const r of results) {
		if (r.mobilePerf !== undefined) {
			await db.pageSpeedScore.create({
				data: {
					clientId,
					pageUrl: r.url,
					strategy: "mobile",
					performanceScore: r.mobilePerf,
					lcp: r.lcp ?? null,
					inp: r.inp ?? null,
					cls: r.cls ?? null,
				},
			});
			persisted++;
		}

		if (r.desktopPerf !== undefined) {
			await db.pageSpeedScore.create({
				data: {
					clientId,
					pageUrl: r.url,
					strategy: "desktop",
					performanceScore: r.desktopPerf,
				},
			});
			persisted++;
		}
	}

	return persisted;
}

// ─── Summary ──────────────────────────────────────────────────

export async function getSpeedSummary(clientId: string): Promise<SpeedSummary> {
	// Get latest score per (pageUrl, strategy)
	const latestScores = await db.pageSpeedScore.findMany({
		where: { clientId },
		orderBy: { fetchedAt: "desc" },
		take: 200,
	});

	// Dedupe: keep latest per (pageUrl, strategy)
	const seen = new Set<string>();
	const latest: typeof latestScores = [];
	for (const s of latestScores) {
		const key = `${s.pageUrl}::${s.strategy}`;
		if (!seen.has(key)) {
			seen.add(key);
			latest.push(s);
		}
	}

	const mobile = latest.filter((s) => s.strategy === "mobile");
	const desktop = latest.filter((s) => s.strategy === "desktop");

	const avgMobile = mobile.length > 0
		? Math.round(mobile.reduce((sum, s) => sum + s.performanceScore, 0) / mobile.length)
		: null;

	const avgDesktop = desktop.length > 0
		? Math.round(desktop.reduce((sum, s) => sum + s.performanceScore, 0) / desktop.length)
		: null;

	// Worst mobile pages
	const worstPages = [...mobile]
		.sort((a, b) => a.performanceScore - b.performanceScore)
		.slice(0, 5)
		.map((s) => ({ url: s.pageUrl, mobileScore: Math.round(s.performanceScore) }));

	// CWV from mobile scores (use median-ish: first score that has values)
	const withLcp = mobile.find((s) => s.lcp !== null);
	const withInp = mobile.find((s) => s.inp !== null);
	const withCls = mobile.find((s) => s.cls !== null);

	const cwvStatus = {
		lcp: withLcp?.lcp != null ? cwvRating("lcp", withLcp.lcp) : null,
		inp: withInp?.inp != null ? cwvRating("inp", withInp.inp) : null,
		cls: withCls?.cls != null ? cwvRating("cls", withCls.cls) : null,
	};

	const lastFetched = latestScores[0]?.fetchedAt;

	// Count unique pages
	const uniquePages = new Set(mobile.map((s) => s.pageUrl));

	return {
		clientId,
		avgMobileScore: avgMobile,
		avgDesktopScore: avgDesktop,
		pagesAudited: uniquePages.size,
		worstPages,
		cwvStatus,
		lastFetchedAt: lastFetched?.toISOString() ?? null,
	};
}

// ─── History ──────────────────────────────────────────────────

export async function getSpeedHistory(clientId: string, pageUrl: string) {
	return db.pageSpeedScore.findMany({
		where: { clientId, pageUrl },
		orderBy: { fetchedAt: "asc" },
		take: 50,
	});
}
