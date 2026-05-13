// Phase 15E.1 — inspect actual DB state for the new TargetKeyword fields.
// Read-only. Safe to run any number of times.
import "dotenv/config";
import { Module } from "module";
const requireFn = Module.createRequire(import.meta.url);
const origResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...rest: any[]) {
	if (request === "server-only") return requireFn.resolve("path");
	return origResolve.call(this, request, ...rest);
};

import { db } from "../src/lib/db";

async function main() {
	const cols: any[] = await db.$queryRawUnsafe(`
		SELECT column_name, data_type, is_nullable, column_default
		FROM information_schema.columns
		WHERE table_schema = 'analyzer'
		  AND table_name = 'TargetKeyword'
		ORDER BY ordinal_position;
	`);
	console.log(`\nTargetKeyword columns in analyzer schema: ${cols.length}`);
	const target = new Set([
		"keywordGoal",
		"keywordGoalNote",
		"keywordGoalSetAt",
		"keywordGoalSetBy",
		"masterPageManualOverride",
		"masterPageOverrideAt",
		"masterPageOverrideBy",
	]);
	for (const c of cols) {
		const flag = target.has(c.column_name) ? " ⬅ Phase 15E.1" : "";
		console.log(
			`  ${c.column_name.padEnd(34)} ${c.data_type.padEnd(14)} null=${c.is_nullable.padEnd(3)} default=${c.column_default ?? "—"}${flag}`,
		);
	}

	const missing = [...target].filter((t) => !cols.find((c) => c.column_name === t));
	console.log(`\nPhase 15E.1 columns present: ${target.size - missing.length}/${target.size}`);
	if (missing.length > 0) {
		console.log(`  MISSING: ${missing.join(", ")}`);
	}

	const migTable: any[] = await db.$queryRawUnsafe(`
		SELECT table_schema, COUNT(*)::int AS count
		FROM information_schema.tables
		WHERE table_name = '_prisma_migrations'
		GROUP BY table_schema;
	`);
	console.log(`\n_prisma_migrations table locations:`, migTable);

	if (migTable.length > 0) {
		const schemaName = migTable[0].table_schema;
		const applied: any[] = await db.$queryRawUnsafe(
			`SELECT migration_name, finished_at IS NOT NULL AS done FROM "${schemaName}"._prisma_migrations ORDER BY started_at DESC LIMIT 5;`,
		);
		console.log("Last 5 entries in _prisma_migrations:");
		console.table(applied);
	}
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => db.$disconnect());
