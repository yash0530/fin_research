# web/components/ui/ — UI Primitives

This directory contains lightweight, server-safe, className-driven UI primitives with minimal props, JSX & CSS tokens only, and no inline colors.

## Primitives

- `Panel.tsx` — Standard crisp-corner panel container (`var(--bg-surface)` + border + radius).
- `Stat.tsx` — Metric display with small uppercase label and large tabular-nums mono value.
- `StatStrip.tsx` — Grid/flex strip for multiple stats.
- `DenseTable.tsx` — High-density financial table with header/body helpers, right-aligned numeric cells, and row hovers.
- `TrendNumber.tsx` — Green/red signed numeric percentage for 1d change or daily returns (with tabular-nums).
- `Badge.tsx` — Severity-ramped text tag (neutral, success, warning, danger, critical) with an optional `title` tooltip — `variant="warning"` + `title="Missing: …"` is the data-quality chip pattern.
- `ScoreChip.tsx` — Piotroski or other scores (`n/9`), color-coded by performance thresholds (Green >= 7, Amber 5-6, Red < 5).
- `BandBar.tsx` — Price position visualization across `[low..high]` range with buy-under ticks.
- `Sparkline.tsx` — Pure SVG lightweight polyline for recent closes, colored by direction.
- `SectionNav.tsx` — Client scroll-spy anchor navigation rail.
- `Disclosure.tsx` — Interactive client component with chevron expansion.
- `EmptyState.tsx` — Retro terminal-style empty state box with descriptive help and quick action shortcuts.
- `RangeTabs.tsx` — Interactive range selector (e.g. `1d`, `5d`, `1y`).
- `TierTag.tsx` — Candidate qualification tier indicator (T1, T2, T3).
