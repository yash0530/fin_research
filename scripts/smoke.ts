#!/usr/bin/env tsx
// End-to-end smoke of the deterministic pipeline — no network, no LLM, no DB.
// Exits non-zero if any check fails. Run: npm run smoke.

import { synthesize } from "../src/research/synthesize";
import { runScreen, type TickerRow } from "../src/screener/engine";
import { FakeProvider } from "../src/analyst/fake-provider";
import { ToolRegistry } from "../src/tools/registry";
import { Budget } from "../src/tools/budget";
import type { Tool } from "../src/tools/types";
import { InMemoryDossierStore, newDossier } from "../src/dossier/state";
import { runDossier } from "../src/dossier/runner";
import { buildBuyList } from "../src/buylist/build";

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  \u2713 ${msg}`);
  } else {
    console.error(`  \u2717 ${msg}`);
    failures += 1;
  }
}

async function main(): Promise<void> {
  console.log("digest:");
  const digest = synthesize({
    asOf: "2026-07-02",
    breadth: { pctAbove50dma: 27, advancers: 130, decliners: 370 },
    tripwires: [{ id: "mem_exit", severity: "critical", message: "Memory exit", evidence: "manual:capex_flag=-1" }],
  });
  check(digest.insights.length > 0, `${digest.insights.length} insights`);
  check(digest.insights.every((i) => i.evidence.length > 0), "provenance on every insight");
  check(/critical/.test(digest.headline), `headline flags critical: "${digest.headline}"`);

  console.log("screener:");
  const universe: TickerRow[] = [
    { symbol: "MU", gicsCode: "g_info_tech", aiCodes: ["ai_memory"], marketCap: 130, forwardPE: 11, watchlisted: true },
    { symbol: "JPM", gicsCode: "g_financials", aiCodes: [], marketCap: 600, forwardPE: 12 },
  ];
  const screen = runScreen(universe, { universe: "ai_infra", filters: [{ field: "forwardPE", op: "lt", value: 20 }] });
  check(screen.matched.length === 1 && screen.matched[0].symbol === "MU", "ai_infra + PE<20 → MU");

  console.log("dossier:");
  const fundamentals: Tool = { name: "fundamentals", describe: () => "f", run: async () => ({ data: { current_price: 90 }, sources: [{ label: "local" }] }) };
  const provider = new FakeProvider([
    '{"done":true,"summary":"ok","next_calls":[{"tool":"fundamentals","args":{}}]}',
    '{"thesis_md":"HBM","points":[{"claim":"rev up","evidence_refs":["fundamentals"]}]}',
    '{"independent_bear_md":"cycle","attack_md":"c","points":[]}',
    '{"rebuttal_md":"priced in"}',
    '{"summary":"Buy","recommendation":"BUY","conviction":"HIGH","bull_case":[{"claim":"rev up","evidence_refs":["fundamentals"]}],"bear_case":[],"what_would_change_mind":["a","b","c"],"target_price_range":{"low":110,"high":150,"timeframe":"12m"},"trade_plan":{"position_size_pct":12,"stop_price":80,"rationale":"x"}}',
    '{"should_revise_verdict":false}',
    '{"delta_summary":"u","sections":{}}',
  ]);
  const store = new InMemoryDossierStore();
  store.save(newDossier("dsr_MU", "MU", { sectorCode: "ai_memory" }));
  const dossier = await runDossier("dsr_MU", {
    store,
    registry: new ToolRegistry().register(fundamentals),
    providerFor: () => provider,
    budget: new Budget({ maxWallClockSec: 2700, maxLlmCalls: 24, maxToolCalls: 40 }),
    currentPrice: 90,
  });
  check(dossier.status === "done", "dossier completed");
  check(dossier.verdict?.recommendation === "BUY", "verdict = BUY");
  check(dossier.recCall?.governedSizePct === 2, "governor capped unproven tier to 2%");

  console.log("buy-list:");
  const list = buildBuyList(
    [{ symbol: "MU", dossierId: "dsr_MU", action: "BUY", conviction: "HIGH", judgeSizePct: 12, governedSizePct: 2, governorReason: "capped", ageDays: 1 }],
    { capitalUsd: 2500, minLotUsd: 100, maxAgeDays: 45 },
  );
  check(list.deployedUsd + list.cashUsd === 2500, "allocation conserves $2500");

  if (failures > 0) {
    console.error(`\nSMOKE FAILED: ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nSMOKE PASSED.");
}

main().catch((e) => {
  console.error("SMOKE ERROR:", e);
  process.exit(1);
});
