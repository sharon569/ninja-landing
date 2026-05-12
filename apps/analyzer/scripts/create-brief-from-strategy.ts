// Phase 15C — actually persist a Brief from a Strategy step using the
// same engine path the UI button uses (no auth required for tsx).

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
	const strategyId = process.argv[2] ?? "ks_brabantia_pilot";
	const step = parseInt(process.argv[3] ?? "1", 10);

	const { db } = await import("../src/lib/db");
	const { generateBriefFromStrategyStep, actionTypeToBriefType } = await import("../src/lib/briefs-server");

	const strategy = await db.keywordStrategy.findUnique({ where: { id: strategyId } });
	if (!strategy) throw new Error("Strategy not found");

	const payload = JSON.parse(strategy.payload);
	const stepRow = payload.actionPlan.find((s: { stepNumber: number }) => s.stepNumber === step);
	if (!stepRow) throw new Error(`Step ${step} not in strategy`);

	const briefType = actionTypeToBriefType(stepRow.actionType);
	if (!briefType) throw new Error(`actionType ${stepRow.actionType} doesn't map to a briefType`);

	// Dedupe
	const existing = await db.contentBrief.findFirst({
		where: { clientId: strategy.clientId, keywordStrategyId: strategyId, briefType },
		select: { id: true },
	});
	if (existing) {
		console.log(`reused existing brief: ${existing.id}`);
		process.exit(0);
	}

	const generated = await generateBriefFromStrategyStep(strategyId, step);
	if (!generated) throw new Error("Generator returned null");

	const initialStatus =
		strategy.strategyType === "protect_position" ||
		stepRow.risk === "high" ||
		strategy.confidence === "low" ||
		stepRow.requiresHumanReview
			? "needs_human_review"
			: "draft";

	const created = await db.contentBrief.create({
		data: {
			clientId: strategy.clientId,
			sourceType: "keyword_strategy",
			keywordStrategyId: strategyId,
			strategyStepIndex: step,
			strategyContext: generated.strategyContext,
			targetKeyword: generated.targetKeyword,
			relatedQuery: generated.relatedQuery ?? null,
			relatedPage: generated.relatedPage ?? null,
			briefType: generated.briefType,
			searchIntent: generated.searchIntent,
			recommendedTitle: generated.recommendedTitle ?? null,
			recommendedMetaDescription: generated.recommendedMetaDescription ?? null,
			recommendedH1: generated.recommendedH1 ?? null,
			outline: generated.outline ?? null,
			secondaryKeywords: generated.secondaryKeywords,
			internalLinks: generated.internalLinks,
			recommendedCTA: generated.recommendedCTA ?? null,
			recommendedSchema: generated.recommendedSchema ?? null,
			contentAngle: generated.contentAngle ?? null,
			notes: generated.notes ?? null,
			status: initialStatus,
		},
	});

	console.log(`✓ created brief ${created.id} (status=${initialStatus})`);
	console.log(`  briefType=${created.briefType}`);
	console.log(`  recommendedTitle: ${created.recommendedTitle}`);
	console.log(`  recommendedMeta: ${created.recommendedMetaDescription}`);
	console.log(`  recommendedH1: ${created.recommendedH1 || "(empty)"}`);
	process.exit(0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
