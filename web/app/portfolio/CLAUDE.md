# web/app/portfolio/ — Portfolio Monitor

Page `/portfolio` displays active positions, calculates P&L, renders mechanical decay signals (`stop_breach`, `drawdown`, `below_cost`, `target_reached`), and presents manual thesis invalidation checklists based on dossier verdicts.

## Files
- `page.tsx` — Server-side page loader (routes to PortfolioClient).
- `actions.ts` — Server actions for adding, updating, and removing positions in the engine database.
- `PositionForm.tsx` — Client-side component for adding and editing positions.
- `PortfolioClient.tsx` — Client-side cockpit rendering totals, interactive table, active position dossier verdicts, and invalidation checklists.
