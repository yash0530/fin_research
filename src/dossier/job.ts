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
import { Budget } from "../tools/budget";
import { buildProductionRegistry, latestClose, type LiveFetchers } from "../tools/factory";
import { governSize as governorSize } from "../calibration/governor";
import { loadRecCallsForGovernor, saveRecCall } from "../db/queries";
import { SqliteDossierStore } from "../db/sqlite-store";
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
