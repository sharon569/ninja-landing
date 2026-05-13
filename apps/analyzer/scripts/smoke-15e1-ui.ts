// Phase 15E.1 — UI smoke test. Mirrors the exact code path of the
// updateKeyword server action (zod parse → db.update + goal-changed
// setAt/setBy logic) WITHOUT calling revalidatePath, which only works
// inside the Next.js runtime. End result: identical DB state to a real
// form submit, so this proves the column writes work round-trip.
import "dotenv/config";
import { Module } from "module";
const requireFn = Module.createRequire(import.meta.url);
const origResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...rest: any[]) {
	if (request === "server-only") return requireFn.resolve("path");
	return origResolve.call(this, request, ...rest);
};

import { z } from "zod";
import { db } from "../src/lib/db";
import {
	INTENT_OPTIONS,
	PRIORITY_OPTIONS,
	STATUS_OPTIONS,
	BUSINESS_VALUE_OPTIONS,
	KEYWORD_GOAL_OPTIONS,
	normalizeKeyword,
} from "../src/lib/keywords";

const CLIENT_ID = "cmp1ioabi000478uemcdt0b6r";

const intentValues = INTENT_OPTIONS.map((o) => o.value) as [string, ...string[]];
const priorityValues = PRIORITY_OPTIONS.map((o) => o.value) as [string, ...string[]];
const statusValues = STATUS_OPTIONS.map((o) => o.value) as [string, ...string[]];
const businessValueValues = BUSINESS_VALUE_OPTIONS.map((o) => o.value) as [string, ...string[]];
const keywordGoalValues = KEYWORD_GOAL_OPTIONS.map((o) => o.value) as [string, ...string[]];

const editSchema = z.object({
	id: z.string().min(1),
	keyword: z.string().min(2).max(200),
	intent: z.enum(intentValues).optional().nullable(),
	priority: z.enum(priorityValues).default("medium"),
	targetUrl: z.string().max(400).optional().nullable(),
	status: z.enum(statusValues).default("active"),
	notes: z.string().max(2000).optional().nullable(),
	businessValue: z.enum(businessValueValues).optional().nullable(),
	keywordGoal: z.enum(keywordGoalValues).optional().nullable(),
	keywordGoalNote: z.string().max(1000).optional().nullable(),
});

async function snapshotCounters() {
	const keywords = await db.targetKeyword.findMany({ where: { clientId: CLIENT_ID } });
	const active = keywords.filter((k) => k.status === "active" || k.status === "ranking");
	return {
		total: keywords.length,
		withGoal: keywords.filter((k) => k.keywordGoal).length,
		withoutGoalActive: active.filter((k) => !k.keywordGoal).length,
		withBusinessValue: keywords.filter((k) => k.businessValue).length,
		manualOverride: keywords.filter((k) => k.masterPageManualOverride).length,
	};
}

function nonEmpty(v: unknown): string | null {
	const s = (v ?? "").toString().trim();
	return s.length > 0 ? s : null;
}

async function applyEdit(payload: Record<string, unknown>) {
	// Mirror actions.ts: empty strings collapse to null before zod sees them.
	const normalized = {
		id: nonEmpty(payload.id),
		keyword: nonEmpty(payload.keyword),
		intent: nonEmpty(payload.intent),
		priority: nonEmpty(payload.priority) ?? "medium",
		targetUrl: nonEmpty(payload.targetUrl),
		status: nonEmpty(payload.status) ?? "active",
		notes: nonEmpty(payload.notes),
		businessValue: nonEmpty(payload.businessValue),
		keywordGoal: nonEmpty(payload.keywordGoal),
		keywordGoalNote: nonEmpty(payload.keywordGoalNote),
	};
	const parsed = editSchema.parse(normalized);
	const row = await db.targetKeyword.findUnique({ where: { id: parsed.id } });
	if (!row) throw new Error("keyword not found");
	const goalChanged = (parsed.keywordGoal ?? null) !== (row.keywordGoal ?? null);
	await db.targetKeyword.update({
		where: { id: parsed.id },
		data: {
			keyword: normalizeKeyword(parsed.keyword),
			intent: parsed.intent ?? null,
			priority: parsed.priority,
			targetUrl: parsed.targetUrl ?? null,
			status: parsed.status,
			notes: parsed.notes ?? null,
			businessValue: parsed.businessValue ?? null,
			keywordGoal: parsed.keywordGoal ?? null,
			keywordGoalNote: parsed.keywordGoalNote ?? null,
			...(goalChanged
				? {
					keywordGoalSetAt: parsed.keywordGoal ? new Date() : null,
					keywordGoalSetBy: parsed.keywordGoal ? "operator" : null,
				}
				: {}),
		},
	});
}

async function main() {
	console.log("─── Phase 15E.1 · UI smoke ───\n");

	const kw = await db.targetKeyword.findFirst({
		where: { clientId: CLIENT_ID },
		orderBy: { createdAt: "asc" },
	});
	if (!kw) {
		console.error("No keyword found for Levizon.");
		process.exit(1);
	}
	console.log(`Target keyword: "${kw.keyword}" (id=${kw.id})`);
	console.log(`Original state — goal=${kw.keywordGoal ?? "—"} businessValue=${kw.businessValue ?? "—"} note="${kw.keywordGoalNote ?? "—"}"`);

	// Setup — start from a known clean state (null goal) so deltas are deterministic
	console.log("→ Setup: clearing goal/businessValue on the target keyword");
	await applyEdit({
		id: kw.id,
		keyword: kw.keyword,
		intent: kw.intent,
		priority: kw.priority,
		targetUrl: kw.targetUrl,
		status: kw.status,
		notes: kw.notes,
		keywordGoal: "",
		businessValue: "",
		keywordGoalNote: "",
	});
	const before = await snapshotCounters();
	console.log(`Counters after setup: ${JSON.stringify(before)}\n`);

	// Step 1 — write goal+businessValue
	console.log("→ Step 1: write { keywordGoal=defend_top3, businessValue=high, note='smoke' }");
	await applyEdit({
		id: kw.id,
		keyword: kw.keyword,
		intent: kw.intent,
		priority: kw.priority,
		targetUrl: kw.targetUrl,
		status: kw.status,
		notes: kw.notes,
		keywordGoal: "defend_top3",
		businessValue: "high",
		keywordGoalNote: "smoke test — Phase 15E.1 verification",
	});

	const after1 = await db.targetKeyword.findUnique({ where: { id: kw.id } });
	console.log(
		`   after — goal=${after1?.keywordGoal} businessValue=${after1?.businessValue} note="${after1?.keywordGoalNote}" setAt=${after1?.keywordGoalSetAt?.toISOString()} setBy=${after1?.keywordGoalSetBy}`,
	);
	if (
		after1?.keywordGoal !== "defend_top3" ||
		after1?.businessValue !== "high" ||
		!after1?.keywordGoalSetAt ||
		after1?.keywordGoalSetBy !== "operator"
	) {
		throw new Error("Round-trip mismatch after first write");
	}
	console.log("   ✓ DB row matches submitted values\n");

	const mid = await snapshotCounters();
	console.log(`Counters after write: ${JSON.stringify(mid)}`);
	if (mid.withGoal !== before.withGoal + 1 || mid.withBusinessValue !== before.withBusinessValue + 1) {
		throw new Error("Counters did not update as expected");
	}
	console.log("   ✓ counters reflect the new value (delta +1)\n");

	// Step 2 — round-trip a second goal value (verify update path, not just insert)
	console.log("→ Step 2: change goal to monitor_only");
	await applyEdit({
		id: kw.id,
		keyword: kw.keyword,
		intent: kw.intent,
		priority: kw.priority,
		targetUrl: kw.targetUrl,
		status: kw.status,
		notes: kw.notes,
		keywordGoal: "monitor_only",
		businessValue: "high",
		keywordGoalNote: "smoke test — Phase 15E.1 verification",
	});
	const after2 = await db.targetKeyword.findUnique({ where: { id: kw.id } });
	console.log(`   after — goal=${after2?.keywordGoal} setAt=${after2?.keywordGoalSetAt?.toISOString()}`);
	if (after2?.keywordGoal !== "monitor_only") throw new Error("Update path failed");
	if (after2?.keywordGoalSetAt?.getTime() === after1?.keywordGoalSetAt?.getTime()) {
		throw new Error("goalSetAt did not refresh on goal change");
	}
	console.log("   ✓ goal change persisted, setAt refreshed\n");

	// Step 3 — restore to the original DB state (whatever it was before this run)
	console.log(`→ Step 3: restore original state (goal=${kw.keywordGoal ?? "null"} businessValue=${kw.businessValue ?? "null"})`);
	await applyEdit({
		id: kw.id,
		keyword: kw.keyword,
		intent: kw.intent,
		priority: kw.priority,
		targetUrl: kw.targetUrl,
		status: kw.status,
		notes: kw.notes,
		keywordGoal: kw.keywordGoal ?? "",
		businessValue: kw.businessValue ?? "",
		keywordGoalNote: kw.keywordGoalNote ?? "",
	});
	const after3 = await db.targetKeyword.findUnique({ where: { id: kw.id } });
	console.log(`   after restore — goal=${after3?.keywordGoal ?? "null"} businessValue=${after3?.businessValue ?? "null"}`);
	if ((after3?.keywordGoal ?? null) !== (kw.keywordGoal ?? null)) {
		throw new Error("Restore mismatch");
	}
	console.log("   ✓ original state restored\n");

	const final = await snapshotCounters();
	console.log(`Counters final: ${JSON.stringify(final)}`);

	console.log("─── ALL CHECKS PASSED ───");
	console.log("Schema validates, DB writes succeed, goal change tracks setAt, counters update.");
}

main()
	.catch((err) => {
		console.error("\n✗ SMOKE FAILED:", err.message);
		process.exit(1);
	})
	.finally(() => db.$disconnect());
