// Phase 15B sanity test — create a brief from a strategy step and dump
// what the engine produced.

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
	const { generateBriefFromStrategyStep } = await import("../src/lib/briefs-server");
	try {
		const brief = await generateBriefFromStrategyStep(strategyId, step);
		if (!brief) {
			console.log("Generator returned null (guardrail or not eligible)");
			process.exit(0);
		}
		console.log(JSON.stringify({
			briefType: brief.briefType,
			targetKeyword: brief.targetKeyword,
			recommendedTitle: brief.recommendedTitle,
			recommendedMetaDescription: brief.recommendedMetaDescription,
			recommendedH1: brief.recommendedH1,
			outline: brief.outline?.slice(0, 400) + (brief.outline && brief.outline.length > 400 ? "..." : ""),
			notes: brief.notes,
			contentAngle: brief.contentAngle,
			strategyContext_preview: JSON.parse(brief.strategyContext).why,
		}, null, 2));
	} catch (err) {
		console.error("ERROR:", (err as Error).message);
		console.error((err as Error).stack);
		process.exit(1);
	}
	process.exit(0);
}
main();
