import type { ToolResult } from "../tools/types";
import type { Verdict, BullThesis, BearThesis, Rebuttal, Critique, MemoDelta } from "./schemas";

export type DossierStatus = "queued" | "running" | "done" | "failed";

export type StageName =
  | "classify"
  | "research"
  | "bull"
  | "bear"
  | "rebuttal"
  | "judge"
  | "critique"
  | "judge_rev"
  | "memo"
  | "story";

export type StageRecord = {
  name: StageName;
  output: unknown;
  at: number;
};

/** The persisted recommendation — the calibration track-record row. */
export type RecCall = {
  dossierId: string;
  symbol: string;
  action: Verdict["recommendation"];
  conviction: Verdict["conviction"];
  priceAtCall: number;
  targetLow: number;
  targetHigh: number;
  stopPrice: number | null;
  judgeSizePct: number;
  governedSizePct: number;
  governorReason: string;
  // Provenance for calibration slicing (your requirement #6).
  model: string;
  thinkingMode: boolean;
  /** Prompt version that produced this verdict (settings.dossier.promptVersion). */
  promptVersion: string;
  createdAt: number;
  // Filled later by the outcomes job.
  outcome1mPct: number | null;
  outcome3mPct: number | null;
  outcome6mPct: number | null;
  outcome1yPct: number | null;
  thesisFalsified: boolean | null;
};

export type DossierState = {
  id: string;
  symbol: string;
  sectorCode?: string;
  status: DossierStatus;
  stages: Partial<Record<StageName, StageRecord>>;
  /** Persisted tool outputs — the ledger is rebuilt from these on resume. */
  toolCalls: ToolResult[];
  verdict?: Verdict;
  recCall?: RecCall;
  bull?: BullThesis;
  bear?: BearThesis;
  rebuttal?: Rebuttal;
  critique?: Critique;
  memo?: MemoDelta;
  error?: string;
  droppedClaims?: number;
  requestedBy?: "user" | "digest" | "discovery" | "screener";
  startedAt?: number;
  updatedAt: number;
};

export function newDossier(
  id: string,
  symbol: string,
  opts: { sectorCode?: string; requestedBy?: DossierState["requestedBy"]; now?: number } = {},
): DossierState {
  return {
    id,
    symbol: symbol.toUpperCase().trim(),
    sectorCode: opts.sectorCode,
    status: "queued",
    stages: {},
    toolCalls: [],
    requestedBy: opts.requestedBy ?? "user",
    updatedAt: opts.now ?? Date.now(),
  };
}

export interface DossierStore {
  load(id: string): DossierState | undefined;
  save(state: DossierState): void;
  all(): DossierState[];
}

export class InMemoryDossierStore implements DossierStore {
  private readonly map = new Map<string, DossierState>();

  load(id: string): DossierState | undefined {
    const s = this.map.get(id);
    // Return a structural clone so callers can't mutate persisted state in place.
    return s ? structuredClone(s) : undefined;
  }

  save(state: DossierState): void {
    this.map.set(state.id, structuredClone(state));
  }

  all(): DossierState[] {
    return [...this.map.values()].map((s) => structuredClone(s));
  }
}
