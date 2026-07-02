import { describe, it, expect } from "vitest";
import { z } from "zod";
import { completeJson, LlmJsonError } from "./llmjson";
import { FakeProvider } from "./fake-provider";

const Verdict = z.object({
  recommendation: z.enum(["BUY", "HOLD", "TRIM", "AVOID"]),
  conviction: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

describe("completeJson", () => {
  it("parses a valid response on the first attempt", async () => {
    const p = new FakeProvider(['{"recommendation":"BUY","conviction":"HIGH"}']);
    const out = await completeJson(p, { system: "s", user: "u" }, Verdict);
    expect(out.data).toEqual({ recommendation: "BUY", conviction: "HIGH" });
    expect(out.attempts).toBe(1);
    expect(p.callCount).toBe(1);
  });

  it("salvages prose-wrapped JSON", async () => {
    const p = new FakeProvider(['Sure! {"recommendation":"HOLD","conviction":"LOW"} done']);
    const out = await completeJson(p, { system: "s", user: "u" }, Verdict);
    expect(out.data.recommendation).toBe("HOLD");
  });

  it("retries with the validation error and succeeds on the second attempt", async () => {
    const p = new FakeProvider([
      '{"recommendation":"MAYBE","conviction":"HIGH"}', // invalid enum
      '{"recommendation":"AVOID","conviction":"MEDIUM"}', // valid
    ]);
    const out = await completeJson(p, { system: "s", user: "u" }, Verdict);
    expect(out.data.recommendation).toBe("AVOID");
    expect(out.attempts).toBe(2);
    // The retry prompt must carry the concrete validation failure.
    expect(p.calls[1].msg.user).toContain("failed validation");
  });

  it("throws LlmJsonError after exhausting attempts, preserving the raw output", async () => {
    const p = new FakeProvider(["not json at all"]);
    await expect(completeJson(p, { system: "s", user: "u" }, Verdict, { maxAttempts: 2 }))
      .rejects.toBeInstanceOf(LlmJsonError);
    try {
      await completeJson(p, { system: "s", user: "u" }, Verdict, { maxAttempts: 2 });
    } catch (e) {
      expect((e as LlmJsonError).raw).toBe("not json at all");
      expect((e as LlmJsonError).attempts).toBe(2);
    }
  });

  it("forwards thinking/temperature opts to the provider", async () => {
    const p = new FakeProvider(['{"recommendation":"BUY","conviction":"HIGH"}']);
    await completeJson(p, { system: "s", user: "u" }, Verdict, { thinking: true, temperature: 0.6 });
    expect(p.calls[0].opts).toMatchObject({ thinking: true, temperature: 0.6 });
  });
});
