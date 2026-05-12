// Phase 15A — persist the audited strategy to the DB so Sharon can see it
// on /clients/[id]/keyword-strategy. Run with:
//   npx tsx scripts/persist-strategy.ts <targetKeywordId> [strategyId]

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
	const targetKeywordId = process.argv[2] ?? "tk_brabantia_pilot";
	const strategyId = process.argv[3] ?? "ks_brabantia_pilot";

	const { db } = await import("../src/lib/db");
	const { computeKeywordStrategy } = await import("../src/lib/strategy-server");

	const s = await computeKeywordStrategy(targetKeywordId);
	console.log("strategyType:", s.strategyType, "score:", s.opportunityScore);

	const tk = await db.targetKeyword.findUnique({
		where: { id: targetKeywordId },
		select: { clientId: true },
	});
	if (!tk) throw new Error("TargetKeyword not found");

	const common = {
		clientId: tk.clientId,
		targetKeywordId,
		keyword: s.keyword,
		strategyType: s.strategyType,
		riskLevel: s.riskLevel,
		confidence: s.confidence,
		opportunityScore: s.opportunityScore,
		rankingPage: s.snapshot.rankingPage,
		currentPosition: s.snapshot.currentPosition,
		currentClicks: s.snapshot.clicks28d,
		currentImpressions: s.snapshot.impressions28d,
		currentCtr: s.snapshot.ctrPct / 100,
		trend: s.snapshot.trend,
		targetPageMismatch: s.snapshot.targetPageMismatch,
		summary: s.summary,
		payload: JSON.stringify(s),
	};

	await db.keywordStrategy.upsert({
		where: { id: strategyId },
		update: { ...common, updatedAt: new Date() },
		create: { id: strategyId, ...common },
	});
	console.log("saved strategy", strategyId);
	process.exit(0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
