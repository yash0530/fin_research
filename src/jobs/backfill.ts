// Generic resumable backfill orchestrator. The live Yahoo/EDGAR fetchers plug
// into `fetchOne`; this module owns the hard parts that must be correct:
// resumability (skip already-done symbols) and catch-per-item (one symbol's
// failure is recorded, never fatal). Pure control flow → fully testable with fakes.

export type BackfillDeps<T> = {
  symbols: string[];
  /** True if this symbol was completed on a prior run (BackfillProgress = done). */
  isDone: (symbol: string) => boolean;
  /** Fetch this symbol's rows. May throw / reject — the orchestrator catches. */
  fetchOne: (symbol: string) => Promise<T[]>;
  /** Persist rows (chunked INSERT OR IGNORE in the real impl). */
  write: (symbol: string, rows: T[]) => void | Promise<void>;
  markDone: (symbol: string, rows: number) => void;
  markError: (symbol: string, err: string) => void;
  /** Optional per-item pause (rate-limit friendliness). */
  onEach?: () => Promise<void>;
};

export type BackfillSummary = {
  done: number;
  errors: number;
  skipped: number;
  rows: number;
};

export async function runBackfill<T>(deps: BackfillDeps<T>): Promise<BackfillSummary> {
  let done = 0;
  let errors = 0;
  let skipped = 0;
  let rows = 0;

  for (const symbol of deps.symbols) {
    if (deps.isDone(symbol)) {
      skipped += 1;
      continue; // resumable: never redo completed work
    }
    try {
      const fetched = await deps.fetchOne(symbol);
      await deps.write(symbol, fetched);
      deps.markDone(symbol, fetched.length);
      rows += fetched.length;
      done += 1;
    } catch (e) {
      // catch-per-item: record and keep going
      deps.markError(symbol, e instanceof Error ? e.message : String(e));
      errors += 1;
    }
    if (deps.onEach) await deps.onEach();
  }

  return { done, errors, skipped, rows };
}
