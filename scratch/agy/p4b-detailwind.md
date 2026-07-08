# P4b — Purge Tailwind-style classes from UI primitives (corrective batch)

**The defect:** Tailwind is NOT installed in `web/` (check `web/package.json` — no tailwind, no postcss). Yet these files use Tailwind utility classes (`text-xs`, `px-1.5`, `mb-4`, `text-[var(--fg-muted)]`, `bg-[var(--green-bg)]`, `w-4 h-4`, `truncate`, `inline-flex`, …) which resolve to NOTHING — the components render unstyled.

**Files to fix (ONLY these):**
`web/components/ui/Badge.tsx`, `BandBar.tsx`, `DenseTable.tsx`, `Disclosure.tsx`, `EmptyState.tsx`, `Panel.tsx`, `RangeTabs.tsx`, `ScoreChip.tsx`, `SectionNav.tsx`, `Sparkline.tsx`, `Stat.tsx`, `StatStrip.tsx`, `TierTag.tsx`, `TrendNumber.tsx`, and `web/components/RunStatusBar.tsx` — plus `web/app/globals.css` (append only).

Do NOT touch `Sidebar.tsx`, `SidebarWatchlist.tsx`, `TickerJump.tsx`, `CaptureToggle.tsx`, `CaptureDrawer.tsx`, `web/app/layout.tsx` — those are already fixed and show the intended pattern (semantic classes defined in globals.css, e.g. `.watchlist-row`, `.drawer-save`).

**The fix, per file:** replace every Tailwind-style class with a semantic class, and define that class in a new `/* --- UI primitives --- */` section appended to `web/app/globals.css` using ONLY the existing design tokens (`--fg-*`, `--bg-*`, `--border-*`, `--green/red/amber/critical-*`, `--accent-*`, `--panel-radius`, `--font-sans/mono`, `--transition-fast`). Naming: `.ui-<component>` blocks with modifiers, e.g. `.ui-badge`, `.ui-badge--success`, `.ui-stat-label`, `.ui-stat-value`, `.ui-scorechip--green`. Keep every component's props/API and rendered structure EXACTLY as-is — this is a styling-vocabulary swap, not a redesign. Rules:

- Existing legit utilities MAY be kept: `.flex .flex-col .items-center .justify-between .justify-center .gap-1 .gap-2 .gap-3 .gap-4 .w-full .h-full .grid .grid-cols-2 .font-mono .font-sans .font-tabular .text-table-row .text-table-header .meta-dim .kbd-hint .icon-14 .icon-16 .icon-20 .panel .dense-table .skeleton-bar .empty-state-card .empty-state-title .empty-state-body .badge .muted` (all defined in globals.css — verify before relying on one).
- No inline `style={{color: …}}` for colors. Inline style IS allowed only for computed geometry (BandBar marker %, Sparkline SVG attrs, width/height props).
- Severity colors always via the token ramp (bg + border + text triplet like the existing `.drawer-result-error` pattern).
- Font sizes in rem matching the design scale already in globals.css (0.625/0.6875/0.75/0.8125rem…). `tabular-nums` via `font-variant-numeric` or `.font-tabular`.
- After the swap, `grep -nE 'className="[^"]*(text-\[|bg-\[|border-\[|text-xs|text-sm|text-2xl|px-[0-9]|py-[0-9]|mb-[0-9]|mt-[0-9]|w-[0-9]|h-[0-9]|tracking-|inline-flex|truncate|italic|font-bold|font-medium|uppercase|rounded)' web/components/` must return ZERO rows for the fixed files (run it and show the output in ## Result).

## Gates (fix until green)
`cd web && npm run build` · root `npm run typecheck` · `npm test` · `npm run check:claude`. Append `## Result` here (including the grep-zero proof). Do NOT commit.

## Result

All Tailwind-style utility classes have been successfully purged from the specified UI primitive component files and replaced with custom semantic CSS classes inside `web/app/globals.css`.

### Grep-Zero Proof

Running the following command:
```bash
grep -rnE 'className="[^"]*(text-\[|bg-\[|border-\[|text-xs|text-sm|text-2xl|px-[0-9]|py-[0-9]|mb-[0-9]|mt-[0-9]|w-[0-9]|h-[0-9]|tracking-|inline-flex|truncate|italic|font-bold|font-medium|uppercase|rounded)' web/components/
```
Output:
*(empty - 0 rows returned)*

### Gates Verification
1. **Next.js Web Build**: `cd web && npm run build` — Passed (Compiled successfully)
2. **TypeScript Typecheck**: `npm run typecheck` — Passed
3. **Tests Suite**: `npm test` — Passed (499/499 tests passed)
4. **CLAUDE.md Check**: `npm run check:claude` — Passed (CLAUDE.md present in all 65 directories)

