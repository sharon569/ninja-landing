// Phase 15A.2 — seed three TargetKeywords spanning different SEO situations
// to validate the strategy engine: Protect / Content Boost / New Content.

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
	const { db } = await import("../src/lib/db");
	const clientId = "cmp1ioabi000478uemcdt0b6r";

	const seeds = [
		{
			id: "tk_misnenet_pilot",
			keyword: "מסננת לכיור",
			intent: "commercial",
			priority: "high",
			// Best guess — let engine see if there's a ranking page
			targetUrl: null,
			note: "Protect candidate — pos 2.8, 0 clicks (suspicious CTR)",
		},
		{
			id: "tk_mishkal_pilot",
			keyword: "משקל דיגיטלי למטבח",
			intent: "transactional",
			priority: "medium",
			targetUrl: null,
			note: "Content boost candidate — pos 17.8, 482 imps, 1 click",
		},
		{
			id: "tk_avizarey_pilot",
			keyword: "אביזרים לאמבטיה",
			intent: "commercial",
			priority: "medium",
			targetUrl: null,
			note: "New content candidate — pos 55+, off-page",
		},
	];

	for (const s of seeds) {
		const result = await db.targetKeyword.upsert({
			where: { id: s.id },
			update: {
				keyword: s.keyword,
				intent: s.intent,
				priority: s.priority,
				status: "active",
				updatedAt: new Date(),
			},
			create: {
				id: s.id,
				clientId,
				keyword: s.keyword,
				intent: s.intent,
				priority: s.priority,
				targetUrl: s.targetUrl,
				status: "active",
			},
		});
		console.log(`✓ ${result.id} → "${result.keyword}" (${s.note})`);
	}
	process.exit(0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
