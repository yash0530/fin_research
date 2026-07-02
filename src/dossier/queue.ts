import { settings } from "../config/settings";
import { newDossier, type DossierState, type DossierStore } from "./state";

export type EnqueueOpts = {
  sectorCode?: string;
  requestedBy?: DossierState["requestedBy"];
  now?: number;
  dedupeDays?: number;
  idGen?: () => string;
};

export type EnqueueResult = { enqueued: boolean; id: string; reason?: string };

const DAY_MS = 86_400_000;

/** Enqueue a dossier for `symbol`, deduping against a recent non-failed run. */
export function enqueueDossier(
  store: DossierStore,
  symbol: string,
  opts: EnqueueOpts = {},
): EnqueueResult {
  const now = opts.now ?? Date.now();
  const dedupeDays = opts.dedupeDays ?? settings.dossier.dedupeDays;
  const sym = symbol.toUpperCase().trim();

  const recent = store
    .all()
    .find(
      (d) =>
        d.symbol === sym &&
        d.status !== "failed" &&
        now - d.updatedAt < dedupeDays * DAY_MS,
    );
  if (recent) {
    return { enqueued: false, id: recent.id, reason: `deduped against ${recent.id} (<${dedupeDays}d)` };
  }

  const id = opts.idGen ? opts.idGen() : `dsr_${sym}_${now}`;
  store.save(newDossier(id, sym, { sectorCode: opts.sectorCode, requestedBy: opts.requestedBy, now }));
  return { enqueued: true, id };
}

/** Queued dossiers, oldest first. */
export function queued(store: DossierStore): DossierState[] {
  return store
    .all()
    .filter((d) => d.status === "queued")
    .sort((a, b) => a.updatedAt - b.updatedAt);
}

/**
 * Run the single oldest queued dossier (one per tick). The daemon only calls
 * this when no cron job is running, so the morning digest always lands first.
 */
export async function drainOnce(
  store: DossierStore,
  runOne: (id: string) => Promise<DossierState>,
): Promise<string | null> {
  const q = queued(store);
  if (q.length === 0) return null;
  const next = q[0];
  await runOne(next.id);
  return next.id;
}

/** On daemon boot, requeue dossiers stuck "running" beyond the stale threshold. */
export function recoverStale(
  store: DossierStore,
  staleMinutes = settings.dossier.staleRunningMinutes,
  now: number = Date.now(),
): number {
  let recovered = 0;
  for (const d of store.all()) {
    if (d.status === "running" && now - (d.startedAt ?? d.updatedAt) > staleMinutes * 60_000) {
      d.status = "queued";
      d.updatedAt = now;
      store.save(d);
      recovered += 1;
    }
  }
  return recovered;
}
