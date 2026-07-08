import { type LlamaProfile } from "../config/llama";

export interface BudgetConfig {
  maxDebateRounds: number;
  modelProfile: LlamaProfile;
  useFilingDiffs: boolean;
  filingYearsLimit: number;
  maxTickers: number;
  enableAgentCrossVerification: boolean;
}

export function getBudgetConfig(runType: string, budgetSeconds: number): BudgetConfig {
  // clamp budgetSeconds between 15 minutes (900s) and 5 hours (18000s)
  const clampedSeconds = Math.max(900, Math.min(18000, budgetSeconds));
  const hours = clampedSeconds / 3600;

  if (runType === "ticker_dossier") {
    if (hours < 1) {
      return {
        maxDebateRounds: 3,
        modelProfile: "fast",
        useFilingDiffs: false,
        filingYearsLimit: 1,
        maxTickers: 1,
        enableAgentCrossVerification: false,
      };
    } else if (hours <= 2.5) {
      return {
        maxDebateRounds: 5,
        modelProfile: "deep",
        useFilingDiffs: true,
        filingYearsLimit: 3,
        maxTickers: 1,
        enableAgentCrossVerification: false,
      };
    } else {
      return {
        maxDebateRounds: 7,
        modelProfile: "deep",
        useFilingDiffs: true,
        filingYearsLimit: 10,
        maxTickers: 1,
        enableAgentCrossVerification: true,
      };
    }
  }

  if (runType === "theme_sweep") {
    if (hours < 1) {
      return {
        maxDebateRounds: 1,
        modelProfile: "fast",
        useFilingDiffs: false,
        filingYearsLimit: 1,
        maxTickers: 10,
        enableAgentCrossVerification: false,
      };
    } else if (hours <= 2.5) {
      return {
        maxDebateRounds: 3,
        modelProfile: "deep",
        useFilingDiffs: false,
        filingYearsLimit: 1,
        maxTickers: 25,
        enableAgentCrossVerification: false,
      };
    } else {
      return {
        maxDebateRounds: 5,
        modelProfile: "deep",
        useFilingDiffs: true,
        filingYearsLimit: 3,
        maxTickers: 50,
        enableAgentCrossVerification: true,
      };
    }
  }

  // Sensible fallbacks for other run types
  return {
    maxDebateRounds: hours < 1 ? 2 : 4,
    modelProfile: hours < 1 ? "fast" : "deep",
    useFilingDiffs: hours > 2,
    filingYearsLimit: hours < 1 ? 1 : 3,
    maxTickers: hours < 1 ? 5 : 20,
    enableAgentCrossVerification: hours > 3,
  };
}
