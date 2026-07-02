# web/app/screener/ — Screener route

`page.tsx` runs `@engine/screener/engine.runScreen` over the demo universe (ai_infra,
forwardPE < 40, sorted by market cap) and renders the matches. Missing-data rows are
excluded by the engine, not the view.
