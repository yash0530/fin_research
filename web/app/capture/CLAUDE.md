# web/app/capture/ — Capture route

`page.tsx` renders a `daily_scan` prompt via `@engine/capture/render.renderPrompt` with
the injected watchlist. The live version adds the paste-back textarea → `parseCapture`
preview → per-item accept → commit.
