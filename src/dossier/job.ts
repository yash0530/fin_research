// The `dossier` job's core, factored out of scripts/job.ts so it is testable with
// a FakeProvider + a temp DB (no network, no llama-server). scripts/job.ts owns
// the LIVE wiring (HttpProvider + real fetchers); this module owns the flow:
//
//   enqueue (dedupe) → drain oldest-first, one at a time → for each dossier build
//   the production tool registry over the real DB, run the resumable debate, then
//   persist the governed RecCall and emit a verdict summary.
//
// currentPrice, memoSummary, and the governor history are all pulled from local
// tables; the size is governed at write time by the calibration governor.

import type { SqlDb } from "../db/migrate";
import type { Provider } from "../analyst/types";
import type { AgentRole } from "../config/settings";
import { settings } from "../config/settings";
import { withLlmLock } from "../analyst/singleflight";
import { Budget } from "../tools/budget";
import { buildProductionRegistry, latestClose, type LiveFetchers } from "../tools/factory";
import { governSize as governorSize } from "../calibration/governor";
import {
  loadRecCallsForGovernor,
  saveRecCall,
  saveStoryPage,
  sectorMemberships,
} from "../db/queries";
import { SqliteDossierStore } from "../db/sqlite-store";
import { analyzerKeyForSectorCode } from "./analyzers";
import { composeStoryPageData } from "../story/from-dossier";
import { narrateStory } from "../story/narrate";
import { enqueueDossier, drainOnce, type EnqueueResult } from "./queue";
import { runDossier, type GovernFn } from "./runner";
import type { DossierState, StageName } from "./state";

export type DossierJobDeps = {
  /** Injected so tests pass a FakeProvider and prod passes HttpProvider(profile). */
  providerFor: (role: AgentRole) => Provider;
  live?: LiveFetchers;
  log?: (msg: string) => void;
  now?: () => number;
  /** As-of date for the catalyst window (defaults to today). */
  asOf?: string;
  /** Narrate the story page (live Qwen prose over already-true facts, thinking OFF).
   *  Off by default so tests never touch an LLM; the live registry turns it on. The
   *  page always renders WITHOUT narration, so a narration failure is swallowed. */
  narrate?: boolean;
};

export type DossierRunResult = {
  id: string;
  symbol: string;
  status: DossierState["status"];
  recommendation?: string;
  conviction?: string;
  judgeSizePct?: number;
  governedSizePct?: number;
  governorReason?: string;
  stages: number;
  wallClockSec: number;
  error?: string;
};

export type DossierJobResult = {
  enqueued: EnqueueResult[];
  ran: DossierRunResult[];
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * DB-aware sector resolution — the fix for the live MU dossier that routed to the
 * `generic` analyzer. Given a symbol, read its sector memberships and pick the code
 * that lands on a real analyzer lens. Precedence:
 *   1. an explicit seed sectorCode that already maps (caller's intent wins);
 *   2. an AI-infra membership that maps (the deep lens — MU's `ai_memory` → semis);
 *   3. a GICS membership that maps (JPM `g_financials` → banks, XOM `g_energy`, …);
 *   4. undefined → classify() falls through to `generic` (a truly no-data symbol).
 * Deterministic: memberships come back sorted by code, and we return the FIRST
 * mapped candidate in each tier.
 *
 * Seam: this DB read lives in the job layer (which owns the SqlDb); `classify()`
 * stays a pure, DB-free function so the runner and its unit tests need no DB.
 */
export function resolveSectorCode(db: SqlDb, symbol: string, seedSectorCode?: string): string | undefined {
  if (seedSectorCode && analyzerKeyForSectorCode(seedSectorCode)) return seedSectorCode;
  const memberships = sectorMemberships(db, symbol);
  const mappedInTaxonomy = (taxonomy: string): string | undefined =>
    memberships.find((m) => m.taxonomy === taxonomy && analyzerKeyForSectorCode(m.sectorCode))?.sectorCode;
  return mappedInTaxonomy("ai_infra") ?? mappedInTaxonomy("gics") ?? seedSectorCode;
}

/**
 * Build + persist the flagship story page for a completed (or completing) dossier.
 * Deterministic compose first (renders on its own); narration is best-effort prose
 * on top (thinking OFF) that is swallowed on any failure. Idempotent via
 * `saveStoryPage`'s upsert on the unique dossierId.
 */
export async function buildAndPersistStory(
  db: SqlDb,
  state: DossierState,
  deps: { asOf?: string; now?: () => number; providerFor?: (role: AgentRole) => Provider; narrate?: boolean },
): Promise<{ title: string; narrated: boolean }> {
  const data = composeStoryPageData(db, state, {
    ...(deps.asOf ? { asOf: deps.asOf } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });

  let narrativeJson: string | null = null;
  if (deps.narrate && deps.providerFor) {
    try {
      const provider = deps.providerFor("narrator");
      const narrative = await withLlmLock(provider.endpointKey, () => narrateStory(provider, data));
      narrativeJson = JSON.stringify(narrative);
    } catch {
      // The page renders fully without prose — never let narration sink the page.
    }
  }

  saveStoryPage(db, {
    dossierId: state.id,
    symbol: state.symbol,
    title: data.title,
    storyJson: JSON.stringify(data),
    narrativeJson,
  });
  return { title: data.title, narrated: narrativeJson !== null };
}

/** Living-Memo summary for a symbol (null-safe). Returns undefined when absent. */
function loadMemoSummary(db: SqlDb, symbol: string): string | undefined {
  const row = db
    .prepare('SELECT "contentJson" FROM "Memo" WHERE "symbol"=?')
    .get(symbol.toUpperCase()) as { contentJson: string } | undefined;
  if (!row?.contentJson) return undefined;
  // The Memo is a 10-section JSON blob; hand the judge/planner a compact view.
  try {
    const parsed = JSON.parse(row.contentJson) as Record<string, unknown>;
    const summary = (parsed["summary"] ?? parsed["thesis"] ?? row.contentJson) as unknown;
    const text = typeof summary === "string" ? summary : JSON.stringify(parsed);
    return text.slice(0, settings.evidence.maxMemoSectionChars);
  } catch {
    return row.contentJson.slice(0, settings.evidence.maxMemoSectionChars);
  }
}

/** True when a RecCall row already exists for this dossier (avoid unique-clash on rerun). */
function recCallExists(db: SqlDb, dossierId: string): boolean {
  const row = db.prepare('SELECT 1 AS x FROM "RecCall" WHERE "dossierId"=?').get(dossierId) as
    | { x: number }
    | undefined;
  return !!row;
}

/**
 * Enqueue the given symbols (deduped) then drain the queue one dossier at a time.
 * With no symbols, only drains whatever is already queued.
 */
export async function runDossierJob(
  db: SqlDb,
  symbols: string[] | undefined,
  deps: DossierJobDeps,
): Promise<DossierJobResult> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? Date.now;
  const store = new SqliteDossierStore(db);

  const enqueued: EnqueueResult[] = [];
  for (const sym of symbols ?? []) {
    const res = enqueueDossier(store, sym, { requestedBy: "user", now: now() });
    enqueued.push(res);
    log(res.enqueued ? `queued ${sym} → ${res.id}` : `skipped ${sym}: ${res.reason}`);
  }

  const ran: DossierRunResult[] = [];

  const runOne = async (id: string): Promise<DossierState> => {
    const seed = store.load(id);
    if (!seed) throw new Error(`dossier ${id} vanished from the store`);
    const symbol = seed.symbol;
    const startedAt = now();
    log(`▶ dossier ${symbol} (${id}) — starting`);

    // DB-aware sector routing: resolve the analyzer lens from sector memberships
    // (MU → semis) and persist it so classify() + the tool registry both see it.
    const resolvedSector = resolveSectorCode(db, symbol, seed.sectorCode);
    if (resolvedSector && resolvedSector !== seed.sectorCode) {
      seed.sectorCode = resolvedSector;
      store.save(seed);
      log(`  · ${symbol} sector resolved → ${resolvedSector}`);
    }

    const registry = buildProductionRegistry(db, {
      symbol,
      ...(seed.sectorCode ? { sectorCode: seed.sectorCode } : {}),
      ...(deps.asOf ? { asOf: deps.asOf } : {}),
      ...(deps.live ? { live: deps.live } : {}),
      now,
    });

    const currentPrice = latestClose(db, symbol) ?? 0;
    const memoSummary = loadMemoSummary(db, symbol);

    // History-aware governor: cap judge size by the earned track record at this tier.
    const govern: GovernFn = (conviction, judgeSize) => {
      const recs = loadRecCallsForGovernor(db);
      return governorSize(conviction, judgeSize, recs);
    };

    const state = await runDossier(id, {
      store,
      registry,
      providerFor: deps.providerFor,
      budget: new Budget(
        {
          maxWallClockSec: settings.dossier.maxWallClockSec,
          maxLlmCalls: settings.dossier.maxLlmCalls,
          maxToolCalls: settings.dossier.maxToolCalls,
        },
        now,
      ),
      currentPrice,
      ...(memoSummary ? { memoSummary } : {}),
      governSize: govern,
      buildStory: (st) =>
        buildAndPersistStory(db, st, {
          ...(deps.asOf ? { asOf: deps.asOf } : {}),
          now,
          providerFor: deps.providerFor,
          ...(deps.narrate ? { narrate: true } : {}),
        }),
      now,
      onStage: (name: StageName, at: number) =>
        log(`  · ${symbol} stage ${name} @ ${((at - startedAt) / 1000).toFixed(1)}s`),
    });

    const wallClockSec = (now() - startedAt) / 1000;

    // Persist the governed RecCall (the calibration track-record row).
    if (state.status === "done" && state.recCall && !recCallExists(db, id)) {
      saveRecCall(db, state.recCall);
      log(`  ✓ ${symbol} RecCall persisted`);
    }

    const rc = state.recCall;
    const result: DossierRunResult = {
      id,
      symbol,
      status: state.status,
      stages: Object.keys(state.stages).length,
      wallClockSec,
      ...(state.verdict ? { recommendation: state.verdict.recommendation, conviction: state.verdict.conviction } : {}),
      ...(rc ? { judgeSizePct: rc.judgeSizePct, governedSizePct: rc.governedSizePct, governorReason: rc.governorReason } : {}),
      ...(state.error ? { error: state.error } : {}),
    };
    ran.push(result);

    if (state.status === "done" && state.verdict) {
      const v = state.verdict;
      log(
        `■ ${symbol} verdict: ${v.recommendation}/${v.conviction} · size ${num(rc?.judgeSizePct) ?? "?"}% → governed ${num(rc?.governedSizePct) ?? "?"}%` +
          `${rc?.governorReason ? ` (${rc.governorReason})` : ""} · ${result.stages} stages · ${wallClockSec.toFixed(1)}s`,
      );
    } else {
      log(`■ ${symbol} ${state.status}${state.error ? `: ${state.error}` : ""} · ${wallClockSec.toFixed(1)}s`);
    }
    return state;
  };

  // Drain oldest-first, one at a time, until the queue is empty.
  for (;;) {
    const id = await drainOnce(store, runOne);
    if (id === null) break;
  }

  return { enqueued, ran };
}

// ── Story-page backfill (npm run job -- story) ───────────────────────────────

export type StoryBackfillDeps = {
  /** Build a page for exactly this dossier id. */
  dossierId?: string;
  /** Build a page for the latest COMPLETED dossier of each symbol. */
  symbols?: string[];
  providerFor?: (role: AgentRole) => Provider;
  narrate?: boolean;
  asOf?: string;
  now?: () => number;
  log?: (msg: string) => void;
};

export type StoryBackfillResult = { built: string[]; skipped: string[]; errors: string[] };

/**
 * Backfill story pages for ALREADY-COMPLETED dossiers (no debate re-run). Targets:
 *   --dossier=<id>  → that one dossier;
 *   --symbols=A,B   → the latest `done` dossier for each symbol;
 *   (neither)       → every `done` dossier in the store.
 * Idempotent: `saveStoryPage` upserts on the unique dossierId. Never throws for a
 * single bad dossier — errors are collected and reported.
 */
export async function runStoryBackfillJob(db: SqlDb, deps: StoryBackfillDeps): Promise<StoryBackfillResult> {
  const log = deps.log ?? (() => {});
  const store = new SqliteDossierStore(db);
  const result: StoryBackfillResult = { built: [], skipped: [], errors: [] };

  const targets: DossierState[] = [];
  if (deps.dossierId) {
    const st = store.load(deps.dossierId);
    if (!st) {
      result.errors.push(`dossier ${deps.dossierId} not found`);
      return result;
    }
    targets.push(st);
  } else if (deps.symbols && deps.symbols.length > 0) {
    const all = store.all();
    for (const raw of deps.symbols) {
      const sym = raw.toUpperCase().trim();
      const latest = all
        .filter((s) => s.symbol === sym && s.status === "done")
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (latest) targets.push(latest);
      else {
        result.skipped.push(`${sym} (no completed dossier)`);
        log(`skipped ${sym}: no completed dossier`);
      }
    }
  } else {
    targets.push(...store.all().filter((s) => s.status === "done"));
  }

  for (const st of targets) {
    if (st.status !== "done" || !st.verdict) {
      result.skipped.push(`${st.symbol} (${st.id}): ${st.status}${st.verdict ? "" : "/no-verdict"}`);
      log(`skipped ${st.symbol} (${st.id}): not a completed dossier with a verdict`);
      continue;
    }
    try {
      const { title, narrated } = await buildAndPersistStory(db, st, {
        ...(deps.asOf ? { asOf: deps.asOf } : {}),
        ...(deps.now ? { now: deps.now } : {}),
        ...(deps.providerFor ? { providerFor: deps.providerFor } : {}),
        ...(deps.narrate ? { narrate: true } : {}),
      });
      result.built.push(`${st.symbol} (${st.id})`);
      log(`✓ story ${st.symbol} (${st.id}) — "${title}"${narrated ? " +narrative" : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${st.symbol} (${st.id}): ${msg}`);
      log(`✗ story ${st.symbol} (${st.id}): ${msg}`);
    }
  }

  return result;
}
