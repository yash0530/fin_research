import { PROVIDER_PROFILES, type ProviderProfile } from "./providers";

// Central tuning. The routing model is per-agent-role: everything inherits
// `models.default`, and you repoint any single role via `models.overrides`
// (one line, no code change) — e.g. { narrator: "gemma4_local" } later.

export type AgentRole =
  | "planner"
  | "bull"
  | "bear"
  | "rebuttal"
  | "judge"
  | "critique"
  | "memoSynth"
  | "narrator"
  | "classify"
  | "nightly"
  | "monthly"
  | "event";

/** Roles that get thinking-mode ON (accuracy over latency). Narration/synthesis stay OFF. */
const REASONING_ROLES = new Set<AgentRole>([
  "planner",
  "bull",
  "bear",
  "rebuttal",
  "judge",
  "critique",
  "classify",
]);

export const settings = {
  // Model routing — the extensibility seam. All → Qwen for now.
  models: {
    default: "qwen_local" as string,
    overrides: {} as Partial<Record<AgentRole, string>>,
  },

  // Dossier engine caps (USD removed — local model, wall-clock + call-count only).
  dossier: {
    maxWallClockSec: 2700, // 45 min
    maxLlmCalls: 24,
    maxToolCalls: 40,
    autoQueuePerDay: 2,
    dedupeDays: 14,
    plannerMaxIterations: 4,
    staleRunningMinutes: 90,
  },

  // Context budgeting (chars; ~chars/4 ≈ tokens). Trims lowest-confidence first.
  evidence: {
    maxCharsPerTool: 1200,
    maxMemoSectionChars: 500,
    tokenBudgetChars: 48_000 * 4,
  },

  // Yahoo throttle knobs (one place to tune under rate limits).
  prices: {
    backfillConcurrency: 3,
    backfillDelayMs: 800,
    dailyQuoteBatch: 100,
  },

  // Monthly buy-list ritual.
  buylist: {
    capitalUsd: 2500,
    minLotUsd: 100,
    maxCandidateAgeDays: 45,
  },

  // EDGAR etiquette — one shared token bucket for ALL callers.
  edgar: {
    requestsPerSecond: 8,
    userAgentEnv: "EDGAR_USER_AGENT",
  },
};

/** Resolve the profile NAME for a role (override wins, else default). */
export function resolveProfileName(role: AgentRole): string {
  return settings.models.overrides[role] ?? settings.models.default;
}

/** Resolve the full profile for a role. Throws if the named profile is missing. */
export function resolveProfile(role: AgentRole): ProviderProfile {
  const name = resolveProfileName(role);
  const profile = PROVIDER_PROFILES[name];
  if (!profile) {
    throw new Error(`no provider profile '${name}' configured for role '${role}'`);
  }
  return profile;
}

/** Whether a role should run with thinking-mode ON. */
export function thinkingForRole(role: AgentRole): boolean {
  return REASONING_ROLES.has(role);
}
