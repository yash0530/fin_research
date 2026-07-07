# src/config/ — typed configuration

All the knobs. Editing config (not code) should be enough to swap models, retune
budgets, or add a sector.

## Files

- `llama.ts` — **single source of truth for the local llama-server**: the endpoint
  (`LLAMA_BASE_URL`/`LLAMA_HEALTH_URL`, dialed as `localhost`, bound as `127.0.0.1`) AND
  the on-demand launch command (`llamaLaunchArgv()` — the exact MTP/flash-attn/64K argv
  ported from the retired launchd plist) + boot/stop timeouts. `providers.ts` imports
  `LLAMA_BASE_URL` from here so the URL is defined once. All values env-overridable.
- `providers.ts` — `PROVIDER_PROFILES`. Each profile declares `protocol`, `baseUrl`,
  `model`, `maxTokens`, and — new vs. the old ENGINE — **`contextWindow`** and
  **`thinkingMode`**. `qwen_local` is primary; `gemma4_local` is the documented
  future "small model" seam (unused until a role override points at it);
  `gemini_compat` is the connectivity-only fallback.
- `settings.ts` — the tuning surface:
  - `models = { default: "qwen_local", overrides: {} }` — **per-role routing**.
    Every `AgentRole` inherits `default`; repoint one via `overrides` (one line).
  - `resolveProfile(role)` / `resolveProfileName(role)` / `thinkingForRole(role)`
    (thinking ON for reasoning roles, OFF for narration/synthesis).
  - `dossier` (wall-clock/call caps — no USD), `evidence` (context budget in chars),
    `prices` (Yahoo throttle), `buylist` ($2500/min-lot), `edgar` (8 req/s).
- `sectors.ts` — two coexisting taxonomies: `GICS_SEEDS` (11, base map, driver 0) and
  `AI_INFRA_SEEDS` (12, deep lens, drivers 1–5). `GICS_NAME_TO_CODE` maps S&P CSV rows.
  `AI_INFRA_TICKERS` is the ported AI-infra membership (donor union → `ai_*` codes);
  `aiInfraLinks()` flattens it to deduped `{symbol,code}` links; `CREDIT_BENCHMARKS`
  are the sector-less HYG/IEF proxies.
- `tripwires.ts` — the `TRIPWIRES` rule table (config DATA) the `src/rules/` engine
  interprets: drawdown / consecutive-monthly / flag-equals / ratio-change / compound.

## Invariants

- Adding a provider = a new profile here + a key in `.env`. Never a code change.
- The dossier context guard reads `contextWindow` from the **active** profile — never a
  hardcoded 64K — so a different local model just works.

## Tests

`settings.test.ts` (4): default routes every role to Qwen; a sparse override repoints
one role; unknown profile throws; thinking-by-role is correct.
