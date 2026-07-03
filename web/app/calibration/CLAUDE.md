# web/app/calibration/ — the sizing-trust dashboard

Read-only page over `RecCall`: per-conviction-tier table (calls, resolved, favorable
rate, governor status — 2% cap until ≥5 resolved at ≥50% favorable, mirroring
src/calibration/governor.ts), the full calls log with pending outcome states, and a
short sizing-trust explainer. Data via `web/lib/calibration-data.ts` (semantics
manually mirrored from src/calibration — keep in sync).
