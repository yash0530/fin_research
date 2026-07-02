// Catalyst calendar filter. Pure: given dated events (local Catalyst rows +
// calendarEvents + a static macro calendar), return upcoming ones for a symbol/
// window, sorted by date. Port of catalyst_lookup.py's local-first path.

export type CatalystEvent = {
  d: string; // YYYY-MM-DD
  kind: string; // earnings | deadline | ipo | product | macro
  symbol?: string;
  title: string;
};

export function upcomingCatalysts(
  events: CatalystEvent[],
  opts: { asOf: string; withinDays?: number; symbol?: string },
): CatalystEvent[] {
  const withinDays = opts.withinDays ?? 45;
  const asOfMs = Date.parse(`${opts.asOf}T00:00:00Z`);
  const horizonMs = asOfMs + withinDays * 86_400_000;
  const sym = opts.symbol?.toUpperCase();

  return events
    .filter((e) => {
      if (!e.d) return false;
      if (sym && e.symbol && e.symbol.toUpperCase() !== sym) return false;
      const t = Date.parse(`${e.d}T00:00:00Z`);
      return Number.isFinite(t) && t >= asOfMs && t <= horizonMs;
    })
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}
