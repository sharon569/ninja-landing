import { config as loadEnv } from "dotenv";
import { resolve } from "path";
loadEnv({ path: resolve(__dirname, "..", ".env") });

import { Module } from "module";
const origRequire = Module.prototype.require;
(Module.prototype as { require: typeof origRequire }).require = function (this: NodeModule, id: string) {
  if (id === "server-only") return {};
  return origRequire.call(this, id);
} as typeof origRequire;

async function main() {
  const { db } = await import("../src/lib/db");
  const { resolveAllMasterPages } = await import("../src/lib/master-page-server");
  const c = await db.client.findFirst({ where: { name: { contains: "levizon", mode: "insensitive" } } });
  if (!c) process.exit(1);

  console.log("Resolving master pages for active keywords…");
  const r = await resolveAllMasterPages(c.id);
  console.log(`resolved=${r.resolved} failed=${r.failed}`);

  for (const res of r.results) {
    console.log(`\n── "${res.keyword}" ──`);
    console.log(`  masterPage:       ${res.masterPage ?? "—"}`);
    console.log(`  masterPageType:   ${res.masterPageType}`);
    console.log(`  confidence:       ${res.masterPageConfidence}`);
    console.log(`  rankingPage:      ${res.rankingPage ?? "—"}`);
    console.log(`  rankingPageType:  ${res.rankingPageType}`);
    console.log(`  matchStatus:      ${res.targetPageMatchStatus}`);
    console.log(`  recommendedAction:${res.recommendedPageAction}`);
    console.log(`  pageTypeMismatch: ${res.pageTypeMismatch}`);
    console.log(`  reason:           ${res.masterPageReason}`);
    if (res.candidates.length > 0) {
      console.log(`  top candidates:`);
      for (const cand of res.candidates.slice(0, 3)) {
        console.log(`    · score=${cand.score} ${cand.reason} ${cand.title} ${cand.url}`);
      }
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
