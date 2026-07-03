// Live probe: exercises the hardened thinking contract end-to-end against the
// real llama-server (http-provider → completeJson → zod). Run:
//   npx tsx scratch/check-live-provider.ts
// Expects llama-server healthy at localhost:8000. Case A intentionally starves
// the token budget to trigger ThinkingBudgetExhausted → downgrade-to-no-think.
import { HttpProvider } from "../src/analyst/http-provider";
import { completeJson } from "../src/analyst/llmjson";
import { PROVIDER_PROFILES } from "../src/config/providers";
import { z } from "zod";

async function main() {
  const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl: fetch as never });
  const schema = z.object({ status: z.string(), sum: z.number() });
  const msg = {
    system: "Return STRICT JSON only.",
    user: 'Return {"status":"ready","sum":<12+30>} exactly.',
  };

  const r1 = await completeJson(p, msg, schema, { thinking: true, maxTokens: 60 });
  console.log(
    "A(downgrade-trigger):",
    JSON.stringify(r1.data),
    "| downgraded:", r1.thinkingDowngraded,
    "| attempts:", r1.attempts,
  );

  const r2 = await completeJson(p, msg, schema, { thinking: true, maxTokens: 4000 });
  console.log(
    "B(thinking-budgeted):",
    JSON.stringify(r2.data),
    "| downgraded:", r2.thinkingDowngraded,
    "| reasoningChars:", r2.result.reasoningChars,
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("LIVE PROBE FAILED:", e);
    process.exit(1);
  },
);
