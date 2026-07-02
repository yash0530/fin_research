# Getting Started

## What ENGINE is

ENGINE is your **research process**, as software. You invest $2,500 of real capital each
month; ENGINE is how you decide where it goes. It runs locally on your machine (a local
Qwen 3.6 27B model), costs roughly **$0/month** to operate, and produces:

- a **full-market morning digest** — what changed, ranked, with the evidence for each point;
- on-demand **dossiers** — a full bull/bear/judge debate on one stock, ending in a
  sized recommendation;
- a **screener** and a **discovery queue** for finding names;
- a **monthly buy-list ritual** that turns recent BUY calls into a ranked, sized plan for
  your $2,500 — and tracks how those calls actually work out;
- a **paste-capture channel** to fold in free web research (Perplexity/Claude/ChatGPT).

> **ENGINE produces research, not advice.** It has **no** connection to any broker and
> **cannot** place trades — by design, forever. You log the buys you choose to make.

## The one idea to internalize

**The numbers are computed; the words are written on top.** Every insight in the digest,
every claim in a dossier, traces back to a real computed value or a dated source. The
language model narrates facts that are *already true* — it is never the source of a
number. If a claim can't cite evidence, it gets dropped. This is what makes the output
trustworthy enough to put money behind.

## Install & verify

Requirements: Node 20+ and npm.

```bash
cd fin_research
npm install
npm run verify
```

You should see the type-checker pass, the full test suite pass, and
`✓ CLAUDE.md present in all N directories`. That's the core engine, proven on your machine.

To run just the tests: `npm test`. To type-check: `npm run typecheck`.

## The mental model

Think of ENGINE as three organs around one spine:

1. **The spine** — a deterministic synthesis engine that reads your local data and ranks
   what matters, with provenance on every line.
2. **The debate brain** — when you want depth, it runs a multi-agent debate (a bull, a
   bear, a rebuttal, a judge, a risk-officer critique) and produces a sized verdict.
3. **The discipline** — a *calibration governor* that refuses to let any recommendation
   be sized up until its track record has earned it. Early on, everything is capped
   conservatively. That is intended.

## Where to go next

- [The daily workflow](daily-workflow.md) — your morning, in five minutes.
- [Dossiers](dossiers.md) — when you want to go deep on a name.
- [The buy-list ritual](buy-list-ritual.md) — the 1st-of-month routine.
- [The capture channel](capture.md) — pulling in outside research for free.
- [FAQ](faq.md) — safety, cost, troubleshooting.
