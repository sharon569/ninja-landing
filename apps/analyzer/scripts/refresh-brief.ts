// Phase 15C — refresh an existing strategy-source brief's generated fields
// (title / meta / strategyContext / notes / contentAngle). Used after a
// title-template change so the operator sees the new copy without having
// to manually delete + recreate.

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
	const briefId = process.argv[2];
	if (!briefId) {
		console.error("Usage: tsx scripts/refresh-brief.ts <briefId>");
		process.exit(2);
	}
	const { db } = await import("../src/lib/db");
	const { generateBriefFromStrategyStep } = await import("../src/lib/briefs-server");

	const existing = await db.contentBrief.findUnique({ where: { id: briefId } });
	if (!existing) {
		console.error("Brief not found");
		process.exit(1);
	}
	if (existing.sourceType !== "keyword_strategy" || !existing.keywordStrategyId || existing.strategyStepIndex == null) {
		console.error("Brief is not from a Strategy step");
		process.exit(1);
	}

	const fresh = await generateBriefFromStrategyStep(existing.keywordStrategyId, existing.strategyStepIndex);
	if (!fresh) {
		console.error("Generator returned null");
		process.exit(1);
	}

	await db.contentBrief.update({
		where: { id: briefId },
		data: {
			recommendedTitle: fresh.recommendedTitle,
			recommendedMetaDescription: fresh.recommendedMetaDescription,
			recommendedH1: fresh.recommendedH1,
			outline: fresh.outline,
			contentAngle: fresh.contentAngle,
			notes: fresh.notes,
			strategyContext: fresh.strategyContext,
		},
	});
	console.log(`✓ refreshed brief ${briefId}`);
	console.log(`  title:   ${fresh.recommendedTitle}`);
	process.exit(0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
