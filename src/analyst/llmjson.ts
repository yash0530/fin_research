import { z } from "zod";
import type { Provider, LlmMessage, LlmResult, CompleteOpts } from "./types";
import { ThinkingBudgetExhausted } from "./types";
import { jsonsafe } from "./jsonsafe";

/**
 * The retry-with-validation-error harness, extracted from ResearchEngine's
 * runAnalyst so every dossier agent shares one battle-tested path:
 *
 *   provider.complete -> jsonsafe -> zod.safeParse
 *     -> on failure, re-ask with the validation error appended, up to maxAttempts
 *     -> on final failure, throw LlmJsonError carrying the last raw output
 *
 * This is the core reliability net for an unbenchmarked local model: a single
 * malformed response costs one retry, not a crashed pipeline.
 */

export class LlmJsonError extends Error {
  readonly raw: string;
  readonly attempts: number;
  constructor(message: string, raw: string, attempts: number) {
    super(message);
    this.name = "LlmJsonError";
    this.raw = raw;
    this.attempts = attempts;
  }
}

export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ")
    .slice(0, 500);
}

export type CompleteJsonResult<T> = {
  data: T;
  raw: string;
  attempts: number;
  model: string;
  result: LlmResult;
  /** True when the call had to degrade to enable_thinking:false after the
   *  reasoning trace consumed the whole token budget (see ThinkingBudgetExhausted). */
  thinkingDowngraded: boolean;
};

export type CompleteJsonOpts = CompleteOpts & {
  /** Total attempts including the first. Default 2 (one retry). */
  maxAttempts?: number;
};

export async function completeJson<S extends z.ZodTypeAny>(
  provider: Provider,
  msg: LlmMessage,
  schema: S,
  opts: CompleteJsonOpts = {},
): Promise<CompleteJsonResult<z.infer<S>>> {
  const { maxAttempts = 2, ...restOpts } = opts;
  const attempts = Math.max(1, maxAttempts);
  let completeOpts: CompleteOpts = restOpts;
  let thinkingDowngraded = false;
  let userMessage = msg.user;
  let lastError = "no JSON object found in output";
  let lastRaw = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    let result: LlmResult;
    try {
      result = await provider.complete({ system: msg.system, user: userMessage }, completeOpts);
    } catch (e) {
      // A thinking call that spent its whole budget reasoning returns empty
      // content. The server is fine — degrade to enable_thinking:false once
      // (a deterministic answer beats no answer) without consuming an attempt.
      if (e instanceof ThinkingBudgetExhausted && completeOpts.thinking === true && !thinkingDowngraded) {
        thinkingDowngraded = true;
        completeOpts = { ...completeOpts, thinking: false };
        attempt--;
        continue;
      }
      throw e;
    }
    lastRaw = result.text;
    const parsed = jsonsafe(result.text);
    if (parsed !== null) {
      const validated = schema.safeParse(parsed);
      if (validated.success) {
        return {
          data: validated.data,
          raw: result.text,
          attempts: attempt + 1,
          model: result.model,
          result,
          thinkingDowngraded,
        };
      }
      lastError = formatZodError(validated.error);
    } else {
      lastError = "no JSON object found in output";
    }
    // Re-ask with the concrete validation failure appended.
    userMessage = `${msg.user}\n\nYour previous output failed validation: ${lastError}\nReturn ONLY valid JSON matching the schema — no prose, no code fences.`;
  }

  throw new LlmJsonError(
    `LLM JSON validation failed after ${attempts} attempt(s): ${lastError}`,
    lastRaw,
    attempts,
  );
}
