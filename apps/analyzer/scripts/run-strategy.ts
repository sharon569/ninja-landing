// Phase 15A — operational runner. Computes a KeywordStrategy and dumps the
// full JSON for auditing. Also lets us fix UTF-8 keyword data that bash
// mangled when inserting through the Supabase REST API.

// Load env (the real Frankfurt DB lives in .env, not .env.local).
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
loadEnv({ path: resolve(__dirname, "..", ".env") });

// Shim server-only so plain Node can import server modules.
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
	const newKeyword = process.argv[3]; // optional — if provided, UPDATE the keyword first

	const { db } = await import("../src/lib/db");

	if (newKeyword) {
		const updated = await db.targetKeyword.update({
			where: { id: targetKeywordId },
			data: { keyword: newKeyword },
			select: { id: true, keyword: true },
		});
		console.error(`[updated] ${updated.id} → "${updated.keyword}"`);
	}

	// Show what's actually stored
	const tk = await db.targetKeyword.findUnique({
		where: { id: targetKeywordId },
		select: { id: true, keyword: true, targetUrl: true, intent: true, priority: true },
	});
	console.error("[target keyword row]", tk);

	const { computeKeywordStrategy } = await import("../src/lib/strategy-server");
	try {
		const s = await computeKeywordStrategy(targetKeywordId);
		console.log(JSON.stringify(s, null, 2));
	} catch (err) {
		console.error("ERROR:", (err as Error).message);
		console.error((err as Error).stack);
		process.exit(1);
	}
	process.exit(0);
}

main();
