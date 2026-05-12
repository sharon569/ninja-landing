// Phase 15D.0 — dry build of a Work Plan for Levizon to verify the
// classifier groups items correctly. Doesn't run approve, doesn't touch
// any external system.

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
	const { buildSeoWorkPlan, loadWorkPlanWithItems } = await import("../src/lib/work-plan-server");

	const client = await db.client.findFirst({
		where: {
			OR: [{ id: arg }, { name: { contains: arg, mode: "insensitive" } }, { baseUrl: { contains: arg, mode: "insensitive" } }],
		},
		select: { id: true, name: true },
	});
	if (!client) {
		console.error(`No client matched "${arg}"`);
		process.exit(1);
	}
	console.log(`Building plan for ${client.name} (${client.id})…`);

	const { planId, summary } = await buildSeoWorkPlan(client.id, "monthly_seo_work", "sanity-script");
	console.log(`\nPlan ${planId}`);
	console.log(`Total: ${summary.totalItems}`);
	console.log(`Safe: ${summary.safeItemsCount}`);
	console.log(`Review: ${summary.reviewItemsCount}`);
	console.log(`Blocked: ${summary.blockedItemsCount}`);
	console.log(`Monitor: ${summary.monitorItemsCount}`);

	console.log(`\nBy group:`);
	for (const [g, info] of Object.entries(summary.byGroup)) {
		const byDec = Object.entries(info.byDecision)
			.map(([d, n]) => `${d}=${n}`)
			.join(" ");
		console.log(`  ${g.padEnd(20)} total=${info.total.toString().padStart(4)}  ${byDec}`);
	}

	// Sample 3 items per group
	const withItems = await loadWorkPlanWithItems(planId);
	if (withItems) {
		const byGroup = new Map<string, typeof withItems.items>();
		for (const it of withItems.items) {
			const arr = byGroup.get(it.group) ?? [];
			arr.push(it);
			byGroup.set(it.group, arr);
		}
		console.log(`\nSample items:`);
		for (const [g, arr] of byGroup) {
			console.log(`\n  [${g}]`);
			for (const it of arr.slice(0, 3)) {
				console.log(`    · ${it.title} → ${it.decision} | risk=${it.riskLevel} confidence=${it.confidence} reason=${it.reason}`);
			}
		}
	}

	process.exit(0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
