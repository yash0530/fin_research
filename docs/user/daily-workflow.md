# The Daily Workflow

The goal of ENGINE is to keep your daily research process clean, rigorous, and extremely fast.

## The Daily Jobs

To update the system and generate the daily morning digest:
```bash
npm run job -- overnight
```
This is a lightweight sequence that takes **≈1 minute**:
1. **prices-heal** — heals missing/incomplete price data.
2. **stats** — computes technical and market metrics.
3. **news** — ingests and indexes news/catalysts.
4. **earnings** — checks for and processes recent earnings filings.
5. **rules** — fires pre-defined risk tripwires and divergence rules.
6. **digest** — synthesizes the morning read.

*Note:* In production, a background scheduler daemon runs this command automatically at 6 AM. (Scheduler daemon wiring is currently in progress.)

## The Web UI

To view the dashboard and interact with the data, launch the Next.js local server:
```bash
cd web
npm run dev
```
Open your browser to `http://localhost:3000` to navigate the system:

- **Morning Digest (`/`)**: Your main cockpit containing the morning read, sorted by severity with color-coded chips (`critical`, `warn`, `info`) and explicit provenance.
- **Digest History (`/digest/[date]`)**: Access past digests to review what signals were active on any specific day.
- **Ticker Cockpit (`/tickers` and `/tickers/[symbol]`)**: Detailed pages containing despiked charts, filings, news, and history of past dossiers.
- **Dossiers (`/dossiers` and `/dossiers/[id]`)**: Deep-dive debate reports featuring stage timelines, final verdicts, full debate transcripts, and evidence tables.
- **Flagship Editorial (`/story` and `/story/[id]`)**: Editorial presentations (see the demo at `/story/demo`).
- **Earlier-Stage Features**: `/screener`, `/capture`, and `/buylist` exist in the UI but are earlier-stage (the capture and buylist UIs are not yet fully finished; see [The Capture Channel](capture.md) and [The Monthly Buy-List Ritual](buy-list-ritual.md) for details).

## How to Read the Digest

Every insight in the digest contains:
1. **Severity Chip**: `critical`, `warn`, or `info`.
2. **Computed Text**: A concise statement of what occurred.
3. **Provenance**: A strict reference (e.g. `db:price:MU` or `paste:456`) pointing to the deterministic data point that triggered it.

Insights are grouped into families:
- **breadth**: Market participation metrics (% above 50-day average) with extremes flagged.
- **movers**: The day's biggest despiked gainers and losers.
- **GICS pulse**: Broad sector heat map.
- **AI-lens pulse**: Sector tracking mapped specifically to the 12-subsector AI-infrastructure lens.
- **divergence**: Critical tells when a sector pulls away from the hyperscaler capex funding it. A divergence of ≥30 points is flagged as `critical`.
- **tripwire**: Risk signals that have fired.

**Critical signals are never truncated.** Even if the digest is capped for length, criticals (such as extreme sector divergence or memory-cycle tripwires) are always bubbled to the top.

## A Healthy Rhythm

1. **Every Morning**: Read the overnight digest. Review any `critical` or `warn` flags.
2. **During the Day**: Queue dossiers on names of interest. These run in the background (serializing on the local model server) so they never delay tomorrow's morning digest.
3. **Monthly**: Run the [buy-list ritual](buy-list-ritual.md) to allocate your capital.
4. **Ad-hoc**: Use the [capture channel](capture.md) to import external web research.
