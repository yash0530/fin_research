// Dossier budget: wall-clock + call-count caps. USD is deliberately removed —
// the model is local and free; time and call volume are the real constraints.
// The clock is injectable so budget exhaustion is deterministically testable.

export type BudgetCaps = {
  maxWallClockSec: number;
  maxLlmCalls: number;
  maxToolCalls: number;
};

export type BudgetSnapshot = {
  elapsedSec: number;
  llmCalls: number;
  toolCalls: number;
  exhausted: boolean;
  reason: string | null;
};

export class Budget {
  private readonly caps: BudgetCaps;
  private readonly now: () => number;
  private readonly startedAt: number;
  private llmCalls = 0;
  private toolCalls = 0;

  constructor(caps: BudgetCaps, now: () => number = Date.now) {
    this.caps = caps;
    this.now = now;
    this.startedAt = now();
  }

  chargeLlm(n = 1): void {
    this.llmCalls += n;
  }

  chargeTool(n = 1): void {
    this.toolCalls += n;
  }

  elapsedSec(): number {
    return (this.now() - this.startedAt) / 1000;
  }

  /** The first cap that is hit, or null. */
  reason(): string | null {
    if (this.elapsedSec() >= this.caps.maxWallClockSec) {
      return `wall-clock cap ${this.caps.maxWallClockSec}s reached`;
    }
    if (this.llmCalls >= this.caps.maxLlmCalls) {
      return `LLM-call cap ${this.caps.maxLlmCalls} reached`;
    }
    if (this.toolCalls >= this.caps.maxToolCalls) {
      return `tool-call cap ${this.caps.maxToolCalls} reached`;
    }
    return null;
  }

  exhausted(): boolean {
    return this.reason() !== null;
  }

  snapshot(): BudgetSnapshot {
    return {
      elapsedSec: this.elapsedSec(),
      llmCalls: this.llmCalls,
      toolCalls: this.toolCalls,
      exhausted: this.exhausted(),
      reason: this.reason(),
    };
  }
}
