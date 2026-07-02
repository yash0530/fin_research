import { z } from "zod";
import type { Provider, LlmMessage, LlmResult, CompleteOpts } from "./types";
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
  const { maxAttempts = 2, ...completeOpts } = opts;
  const attempts = Math.max(1, maxAttempts);
  let userMessage = msg.user;
  let lastError = "no JSON object found in output";
  let lastRaw = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await provider.complete({ system: msg.system, user: userMessage }, completeOpts);
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
