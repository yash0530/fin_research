# FAQ

## Safety & scope

**Can ENGINE place trades?** No. There is no broker integration and there never will be.
ENGINE produces research; you place any trades yourself. This is a hard, permanent
boundary.

**Is this financial advice?** No. It is a personal research tool. Every output is a
computed synthesis or a model's reasoning over evidence — not a recommendation from a
licensed advisor. You own every decision.

**Why does it keep sizing everything at 2%?** The calibration governor caps unproven
conviction tiers at 2% until they earn a track record (≥5 resolved calls, ≥50%
favorable). Early on, that's most things. It's the safety mechanism, working as intended —
it makes a local model earn trust rather than assuming it.

## Cost & model

**What does it cost to run?** Roughly **$0/month**. It uses your local Qwen 3.6 27B model
and free data sources. A cloud provider exists only as a *connectivity* fallback (if the
local server is down), never as a paid quality crutch.

**Why local instead of a frontier cloud model?** Cost ($0), privacy (your research stays
on your machine), and control. On the axes that matter here, the local model is strong;
the governor is what guards against any single call being over-trusted.

**Can I add a second model (e.g. a small one for cheap tasks)?** Yes — it's a config
change (point a role at a new provider profile). Note that two large models can't both be
resident in 64 GB at once, so a second model runs at a smaller quant or is swapped in.

## The output

**Why did a claim disappear from a dossier?** Because it cited no evidence. Claims that
don't reference a real tool result (or a `paste:{id}`) are dropped before you see the
verdict — "no naked numbers."

**A dossier said HOLD/LOW with an error note — what happened?** The model returned
malformed output on the final judgment and the engine used its safe fallback rather than
crash. Re-run it; a single bad response costs one retry, not the whole report.

**How long does a dossier take?** ~20–45 minutes on the local model. Accuracy over speed
is the explicit trade-off.

## Operations

**When is the morning digest ready?** ~6 AM if the laptop was on overnight; otherwise hit
**Run morning** when you open it. The digest's data is computed immediately; the written
narrative fills in once the local model is reachable.

**Will running dossiers delay tomorrow's digest?** No. There's one local model, so work is
serialized — but the morning digest always has priority; dossiers drain in the background
when no scheduled job is running.

**Something looks like a 90% one-day crash — is that real?** Almost certainly a bad data
tick. Every price read path is *despiked* (a value wildly off its local median is
replaced), so these are filtered out of signals rather than presented as real moves.

## For developers

See [`../dev_guide.md`](../dev_guide.md) for architecture, invariants, and how to add
tools/agents/providers. Run `npm run verify` before committing. The master task list is
[`../../TASKS.md`](../../TASKS.md).
