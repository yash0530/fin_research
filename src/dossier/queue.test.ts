import { describe, it, expect } from "vitest";
import { InMemoryDossierStore, newDossier } from "./state";
import { enqueueDossier, queued, drainOnce, recoverStale } from "./queue";

const DAY = 86_400_000;

describe("dossier queue", () => {
  it("enqueues, then dedupes a repeat within the window", () => {
    const store = new InMemoryDossierStore();
    const t = 1_000_000_000_000;
    const a = enqueueDossier(store, "MU", { now: t, idGen: () => "id-a" });
    expect(a.enqueued).toBe(true);
    const b = enqueueDossier(store, "mu", { now: t + 2 * DAY, dedupeDays: 14 });
    expect(b.enqueued).toBe(false);
    expect(b.id).toBe("id-a");
    expect(b.reason).toMatch(/deduped/);
  });

  it("re-enqueues after the dedupe window passes", () => {
    const store = new InMemoryDossierStore();
    const t = 1_000_000_000_000;
    enqueueDossier(store, "MU", { now: t, idGen: () => "id-a", dedupeDays: 14 });
    const c = enqueueDossier(store, "MU", { now: t + 15 * DAY, idGen: () => "id-c", dedupeDays: 14 });
    expect(c.enqueued).toBe(true);
    expect(c.id).toBe("id-c");
  });

  it("drainOnce runs the oldest queued dossier", async () => {
    const store = new InMemoryDossierStore();
    store.save(newDossier("old", "AAA", { now: 1 }));
    store.save(newDossier("new", "BBB", { now: 2 }));
    const ran: string[] = [];
    const id = await drainOnce(store, async (i) => {
      ran.push(i);
      const s = store.load(i)!;
      s.status = "done";
      store.save(s);
      return s;
    });
    expect(id).toBe("old");
    expect(ran).toEqual(["old"]);
    expect(queued(store).map((d) => d.id)).toEqual(["new"]);
  });

  it("drainOnce returns null on an empty queue", async () => {
    const store = new InMemoryDossierStore();
    expect(await drainOnce(store, async () => newDossier("x", "X"))).toBeNull();
  });

  it("recovers stale running dossiers on boot", () => {
    const store = new InMemoryDossierStore();
    const now = 10_000_000;
    const s = newDossier("stuck", "MU", { now: now - 100 * 60_000 });
    s.status = "running";
    s.startedAt = now - 100 * 60_000; // 100 min ago
    store.save(s);
    const n = recoverStale(store, 90, now);
    expect(n).toBe(1);
    expect(store.load("stuck")?.status).toBe("queued");
  });
});
