// One-off migration: imports clients/scans/findings dumped from the old
// SQLite DB at `agency-tools/analyzer/data/agency.db` into the new Postgres
// (Supabase `analyzer` schema).
//
// Run with: node scripts/migrate-from-sqlite.mjs
// Requires `data/_migration-dump.json` (produced earlier via Python).

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const DUMP_PATH = "data/_migration-dump.json";
const OLD_DATA_DIR = "C:/Users/sharon/projects/agency-tools/analyzer/data";
const NEW_DATA_DIR = "data";

async function main() {
	if (!fs.existsSync(DUMP_PATH)) {
		throw new Error(`Dump not found at ${DUMP_PATH}`);
	}
	const dump = JSON.parse(fs.readFileSync(DUMP_PATH, "utf8"));

	const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
	if (!url) throw new Error("DIRECT_URL / DATABASE_URL not set");

	const c = new Client({ connectionString: url });
	await c.connect();
	console.log("Connected to Postgres");

	// CLIENTS
	for (const row of dump.clients) {
		await c.query(
			`INSERT INTO analyzer."Client" (id, name, "baseUrl", token, "createdAt", "updatedAt", "lastInfo", "lastInfoAt", "lastScanAt")
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			 ON CONFLICT (id) DO NOTHING`,
			[
				row.id,
				row.name,
				row.baseUrl,
				row.token,
				row.createdAt,
				row.updatedAt,
				row.lastInfo,
				row.lastInfoAt,
				row.lastScanAt,
			],
		);
		console.log(`  client: ${row.name}`);
	}

	// SCANS
	for (const row of dump.scans) {
		await c.query(
			`INSERT INTO analyzer."Scan" (id, "clientId", "ranAt", "filePath", summary, "sizeBytes", "durationMs")
			 VALUES ($1,$2,$3,$4,$5,$6,$7)
			 ON CONFLICT (id) DO NOTHING`,
			[
				row.id,
				row.clientId,
				row.ranAt,
				// Normalize to forward-slash path so it's portable
				row.filePath.replace(/\\/g, "/"),
				row.summary,
				row.sizeBytes,
				row.durationMs,
			],
		);
	}
	console.log(`  scans: ${dump.scans.length}`);

	// FINDINGS
	for (const row of dump.findings) {
		await c.query(
			`INSERT INTO analyzer."Finding" (id, "scanId", "ruleId", severity, count, payload, "createdAt")
			 VALUES ($1,$2,$3,$4,$5,$6,$7)
			 ON CONFLICT (id) DO NOTHING`,
			[
				row.id,
				row.scanId,
				row.ruleId,
				row.severity,
				row.count,
				row.payload,
				row.createdAt,
			],
		);
	}
	console.log(`  findings: ${dump.findings.length}`);

	await c.end();
	console.log("DB import done.");

	// Copy scan JSON blobs
	const clientId = dump.clients[0]?.id;
	if (clientId) {
		const src = path.join(OLD_DATA_DIR, clientId);
		const dst = path.join(NEW_DATA_DIR, clientId);
		if (fs.existsSync(src)) {
			fs.mkdirSync(dst, { recursive: true });
			for (const f of fs.readdirSync(src)) {
				fs.copyFileSync(path.join(src, f), path.join(dst, f));
			}
			console.log(`Copied scan blobs to ${dst}`);
		} else {
			console.warn(`No blobs found at ${src}`);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
