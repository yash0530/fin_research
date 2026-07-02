import { describe, it, expect } from "vitest";
import { despike, pctChange } from "./lib/metrics";
import { synthesize, type SynthInput } from "./research/synthesize";
import { runScreen, type TickerRow } from "./screener/engine";
import { FakeProvider } from "./analyst/fake-provider";
import { _resetLocks } from "./analyst/singleflight";
import { ToolRegistry } from "./tools/registry";
import { Budget } from "./tools/budget";
import type { Tool } from "./tools/types";
import { InMemoryDossierStore, newDossier } from "./dossier/state";
import { runDossier } from "./dossier/runner";
import { buildBuyList, type Candidate } from "./buylist/build";
import { buildStory, scenarioPrices } from "./story/build";

// Wires the whole engine together on one deterministic path — no network, no LLM,
// no DB. Proves the modules compose the way the product runs them.
describe("engine pipeline (end-to-end, deterministic)", () => {
  it("prices→despike→synthesize→screen→dossier→governed buy-list→story", async () => {
    _resetLocks();

    // 1) Prices with a bad tick → despike → return feeds the digest.
    const muCloses = [80, 82, 81, 83, 2000 /* bad tick */, 85, 86, 88, 90, 91];
    const clean = despike(muCloses);
    expect(clean[4]).toBeLessThan(200); // spike removed
    const muRet = pctChange(clean[0], clean[clean.length - 1]);
    expect(muRet).not.toBeNull();

    // 2) Deterministic digest with provenance on every insight.
    const synthInput: SynthInput = {
      asOf: "2026-07-02",
      breadth: { pctAbove50dma: 27, advancers: 130, decliners: 370 },
      movers: [{ symbol: "MU", retPct: muRet as number }],
      tripwires: [{ id: "mem_exit", severity: "critical", message: "Memory exit", evidence: "manual:capex_flag=-1" }],
    };
    const digest = synthesize(synthInput);
    expect(digest.headline).toMatch(/critical/);
    for (const i of digest.insights) expect(i.evidence.length).toBeGreaterThan(0);

    // 3) Screener finds MU in the AI-infra universe.
    const universe: TickerRow[] = [
      { symbol: "MU", gicsCode: "g_info_tech", aiCodes: ["ai_memory"], marketCap: 130, forwardPE: 11, watchlisted: true },
      { symbol: "JPM", gicsCode: "g_financials", aiCodes: [], marketCap: 600, forwardPE: 12 },
    ];
    const screen = runScreen(universe, { universe: "ai_infra", filters: [{ field: "forwardPE", op: "lt", value: 20 }] });
    expect(screen.matched.map((r) => r.symbol)).toEqual(["MU"]);

    // 4) Dossier debate (FakeProvider scripted in call order) → BUY verdict + RecCall.
    const fundamentals: Tool = {
      name: "fundamentals",
      describe: () => "local fundamentals",
      run: async () => ({ data: { current_price: 90 }, sources: [{ label: "local" }] }),
    };
    const provider = new FakeProvider([
      '{"done":true,"summary":"ok","next_calls":[{"tool":"fundamentals","args":{},"reason":"need it"}]}',
      '{"thesis_md":"HBM demand","points":[{"claim":"rev up","evidence_refs":["fundamentals"]}]}',
      '{"independent_bear_md":"cycle","attack_md":"cyclical","points":[]}',
      '{"rebuttal_md":"priced in"}',
      '{"summary":"Buy","recommendation":"BUY","conviction":"HIGH","bull_case":[{"claim":"rev up","evidence_refs":["fundamentals"]}],"bear_case":[],"what_would_change_mind":["a","b","c"],"target_price_range":{"low":110,"high":150,"timeframe":"12m"},"trade_plan":{"position_size_pct":12,"stop_price":80,"rationale":"sized"}}',
      '{"should_revise_verdict":false,"revision_suggestion":"","notes_md":"ok"}',
      '{"delta_summary":"updated","sections":{"thesis":"buy"}}',
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
    expect(dossier.status).toBe("done");
    expect(dossier.verdict?.recommendation).toBe("BUY");
    // Governor caps the unproven HIGH tier's 12% → 2%.
    expect(dossier.recCall?.governedSizePct).toBe(2);

    // 5) Buy-list from the RecCall — conservative cap flows through to a cash-heavy plan.
    const candidate: Candidate = {
      symbol: dossier.recCall!.symbol,
      dossierId: dossier.recCall!.dossierId,
      action: dossier.recCall!.action,
      conviction: dossier.recCall!.conviction,
      judgeSizePct: dossier.recCall!.judgeSizePct,
      governedSizePct: dossier.recCall!.governedSizePct,
      governorReason: dossier.recCall!.governorReason,
      ageDays: 1,
    };
    const list = buildBuyList([candidate], { capitalUsd: 2500, minLotUsd: 100, maxAgeDays: 45 });
    // 2% of $2500 = $50 < $100 lot → skipped → all cash (the governor's conservatism).
    expect(list.items[0].skipped).toBe(true);
    expect(list.deployedUsd + list.cashUsd).toBe(2500);

    // 6) Story scenario math is monotonic and deterministic.
    const story = buildStory({
      symbol: "MU",
      title: "Micron",
      asOf: "2026-07-02",
      priceAtBuild: 90,
      hero: { thesis: "cycle turns", verdict: "BUY", conviction: "HIGH" },
      statTape: [],
      cycleStrip: { stage: "inflecting", position: 0.4 },
      scenarios: {
        bear: { revenue: 25000, margin: 0.2, pe: 8, sharesOut: 1100 },
        base: { revenue: 30000, margin: 0.3, pe: 12, sharesOut: 1100 },
        bull: { revenue: 36000, margin: 0.38, pe: 15, sharesOut: 1100 },
      },
      callouts: [],
      footnotes: [],
    });
    const prices = scenarioPrices(story);
    expect(prices.bull).toBeGreaterThan(prices.base);
    expect(prices.base).toBeGreaterThan(prices.bear);
  });
});
