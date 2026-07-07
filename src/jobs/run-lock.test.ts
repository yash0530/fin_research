import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireRunLock,
  releaseRunLock,
  readRunLock,
  isRunActive,
  setLockLlamaPid,
} from "./run-lock";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "runlock-"));
  path = join(dir, "run.lock");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("run-lock", () => {
  it("acquires when free and writes readable info", () => {
    const r = acquireRunLock({ ownerPid: 111, job: "dossier", symbols: ["NVDA"] }, { path });
    expect(r.ok).toBe(true);
    const info = readRunLock(path);
    expect(info?.ownerPid).toBe(111);
    expect(info?.job).toBe("dossier");
    expect(info?.symbols).toEqual(["NVDA"]);
    expect(typeof info?.startedAt).toBe("number");
  });

  it("refuses when a LIVE run holds the lock", () => {
    acquireRunLock({ ownerPid: 111, job: "dossier" }, { path, aliveImpl: () => true });
    const r = acquireRunLock(
      { ownerPid: 222, job: "digest" },
      { path, aliveImpl: () => true },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.heldBy.ownerPid).toBe(111);
  });

  it("takes over a STALE lock and reaps the orphaned llama pid", () => {
    // A crashed run: owner 111 dead, but it left llama 8080 resident.
    acquireRunLock(
      { ownerPid: 111, job: "dossier", llamaPid: 8080 },
      { path, aliveImpl: () => true },
    );
    const killed: Array<[number, string]> = [];
    const r = acquireRunLock(
      { ownerPid: 222, job: "dossier" },
      {
        path,
        aliveImpl: (pid) => pid === 8080, // owner 111 is dead; orphan llama 8080 alive
        killImpl: (pid, sig) => killed.push([pid, sig]),
      },
    );
    expect(r.ok).toBe(true);
    expect(killed).toEqual([[8080, "SIGKILL"]]);
    expect(readRunLock(path)?.ownerPid).toBe(222);
  });

  it("isRunActive reflects owner liveness; release removes the file", () => {
    acquireRunLock({ ownerPid: 111, job: "dossier" }, { path });
    expect(isRunActive({ path, aliveImpl: () => true })).toBe(true);
    expect(isRunActive({ path, aliveImpl: () => false })).toBe(false); // stale
    releaseRunLock(path);
    expect(existsSync(path)).toBe(false);
    expect(readRunLock(path)).toBeNull();
  });

  it("setLockLlamaPid updates the held lock", () => {
    acquireRunLock({ ownerPid: 111, job: "dossier" }, { path });
    setLockLlamaPid(31337, path);
    expect(readRunLock(path)?.llamaPid).toBe(31337);
  });
});
