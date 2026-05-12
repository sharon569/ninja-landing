// Phase 15C.3 — recompute every KeywordStrategy for a given client so the
// payload picks up new fields introduced after the row was first persisted
// (e.g. rankingPageIneligibleUrl from Phase 15C.2 scope filtering).
//
// Usage:
//   npx tsx scripts/rebuild-client-strategies.ts <clientId|"levizon"|"all">

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
loadEnv({ path: resolve(__dirname, "..", ".env") });

import { Module } from "module";
const origRequire = Module.prototype.require;
(Module.prototype as { require: typeof origRequire }).require = function (
	this: NodeModule,
	id: string,
) {
	if (id === "server-only") return {};
	return origRequire.call(this, id);
} as typeof origRequire;

async function main() {
	const arg = process.argv[2] ?? "levizon";

	const { db } = await import("../src/lib/db");
	const { computeKeywordStrategy } = await import("../src/lib/strategy-server");

	// Resolve client(s)
	let clientIds: string[];
	if (arg === "all") {
		const all = await db.client.findMany({ select: { id: true } });
		clientIds = all.map((c) => c.id);
	} else {
		const lookup = await db.client.findFirst({
			where: {
				OR: [
					{ id: arg },
					{ name: { contains: arg, mode: "insensitive" } },
					{ baseUrl: { contains: arg, mode: "insensitive" } },
				],
			},
			select: { id: true, name: true, baseUrl: true },
		});
		if (!lookup) {
			console.error(`No client matched "${arg}"`);
			process.exit(1);
		}
		console.log(`Resolved "${arg}" → ${lookup.name} (${lookup.baseUrl})`);
		clientIds = [lookup.id];
	}

	let rebuilt = 0;
	let skipped = 0;
	let failed = 0;

	for (const clientId of clientIds) {
		const strategies = await db.keywordStrategy.findMany({
			where: { clientId },
			select: { id: true, targetKeywordId: true, keyword: true },
		});
		console.log(`\nClient ${clientId} — ${strategies.length} strategies`);

		for (const s of strategies) {
			try {
				const fresh = await computeKeywordStrategy(s.targetKeywordId);
				await db.keywordStrategy.update({
					where: { id: s.id },
					data: {
						strategyType: fresh.strategyType,
						riskLevel: fresh.riskLevel,
						confidence: fresh.confidence,
						opportunityScore: fresh.opportunityScore,
						rankingPage: fresh.snapshot.rankingPage,
						currentPosition: fresh.snapshot.currentPosition,
						currentClicks: fresh.snapshot.clicks28d,
						currentImpressions: fresh.snapshot.impressions28d,
						currentCtr: fresh.snapshot.ctrPct / 100,
						trend: fresh.snapshot.trend,
						targetPageMismatch: fresh.snapshot.targetPageMismatch,
						summary: fresh.summary,
						payload: JSON.stringify(fresh),
					},
				});
				const flagged = fresh.snapshot.rankingPageIneligibleUrl ? " ⚑ rankingPageIneligible" : "";
				console.log(
					`  ✓ ${s.keyword} → ${fresh.strategyType} score=${fresh.opportunityScore}${flagged}`,
				);
				rebuilt++;
			} catch (err) {
				console.error(`  ✗ ${s.keyword}: ${(err as Error).message}`);
				failed++;
			}
		}
		void skipped;
	}

	console.log(`\nDone. rebuilt=${rebuilt} failed=${failed}`);
	process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
