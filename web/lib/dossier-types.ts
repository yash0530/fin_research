/**
 * Mirrored Dossier/RecCall types (from src/dossier/state.ts + src/dossier/schemas.ts).
 * Web must NOT import from root src/; shapes are kept in sync manually.
 */

/* ── Stage / Status ─────────────────────────────────── */

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
  | "memo";

export interface StageRecord {
  name: StageName;
  output: unknown;
  at: number;
}

/* ── Claim / Verdict / Debate ──────────────────────── */

export interface Claim {
  claim: string;
  evidence_refs: string[];
  confidence: "high" | "medium" | "low";
}

export interface Verdict {
  summary: string;
  recommendation: "BUY" | "HOLD" | "TRIM" | "AVOID";
  conviction: "HIGH" | "MEDIUM" | "LOW";
  bull_case: Claim[];
  bear_case: Claim[];
  what_would_change_mind: string[];
  target_price_range: {
    low: number;
    high: number;
    timeframe: string;
  };
  trade_plan: {
    position_size_pct: number;
    stop_price: number | null;
    rationale: string;
  };
}

export interface BullThesis {
  thesis_md: string;
  points: Claim[];
}

export interface BearThesis {
  independent_bear_md: string;
  attack_md: string;
  points: Claim[];
}

export interface Rebuttal {
  rebuttal_md: string;
}

export interface Critique {
  should_revise_verdict: boolean;
  revision_suggestion: string;
  notes_md: string;
}

export interface MemoDelta {
  delta_summary: string;
  sections: Record<string, string>;
}

/* ── ToolResult (just enough for evidence table) ───── */

export interface ToolResult {
  tool: string;
  confidence?: string;
  data_status?: string;
  [key: string]: unknown;
}

/* ── DossierState (the JSON blob from _dossier_state) ─ */

export interface DossierState {
  id: string;
  symbol: string;
  sectorCode?: string;
  status: DossierStatus;
  stages: Partial<Record<StageName, StageRecord>>;
  toolCalls: ToolResult[];
  verdict?: Verdict;
  recCall?: RecCallInline;
  bull?: BullThesis;
  bear?: BearThesis;
  rebuttal?: Rebuttal;
  critique?: Critique;
  memo?: MemoDelta;
  error?: string;
  droppedClaims?: number;
  requestedBy?: string;
  startedAt?: number;
  updatedAt: number;
}

/** RecCall as embedded in DossierState.json (inline in stateJson). */
export interface RecCallInline {
  dossierId: string;
  symbol: string;
  action: string;
  conviction: string;
  priceAtCall: number;
  targetLow: number;
  targetHigh: number;
  stopPrice: number | null;
  judgeSizePct: number;
  governedSizePct: number;
  governorReason: string;
  model: string;
  thinkingMode: boolean;
  createdAt: number;
  outcome1mPct: number | null;
  outcome3mPct: number | null;
  outcome6mPct: number | null;
  outcome1yPct: number | null;
  thesisFalsified: boolean | null;
}

/** RecCall row from the RecCall table. */
export interface RecCallRow {
  id: number;
  dossierId: string;
  symbol: string;
  action: string;
  conviction: string;
  priceAtCall: number;
  targetLow: number | null;
  targetHigh: number | null;
  stopPrice: number | null;
  judgeSizePct: number;
  governedSizePct: number;
  governorReason: string | null;
  createdAt: string;
}

/** Hydrated dossier for the detail page. */
export interface HydratedDossier {
  id: string;
  symbol: string;
  status: DossierStatus;
  startedAt: number | null;
  updatedAt: number;
  stages: Partial<Record<StageName, StageRecord>>;
  verdict: Verdict | null;
  bull: BullThesis | null;
  bear: BearThesis | null;
  rebuttal: Rebuttal | null;
  critique: Critique | null;
  memo: MemoDelta | null;
  toolCalls: ToolResult[];
  error: string | null;
  recCall: RecCallRow | null;
  wallClockMs: number | null;
}

/** Dossier list row for the queue table. */
export interface DossierListRow {
  id: string;
  symbol: string;
  status: DossierStatus;
  action: string | null;
  conviction: string | null;
  governedSizePct: number | null;
  startedAt: number | null;
  updatedAt: number;
  wallClockMs: number | null;
}
