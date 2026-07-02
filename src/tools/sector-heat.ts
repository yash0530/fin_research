// Sector heat: aggregate per-symbol returns into per-sector temperature. Works
// for either taxonomy (caller supplies the sector code). Pure. Port of theme_heat.py.

import { median } from "../lib/metrics";

export type HeatEntry = { symbol: string; sectorCode: string; retPct: number };

export type SectorHeat = {
  sectorCode: string;
  count: number;
  meanRetPct: number;
  medianRetPct: number;
};

export function sectorHeat(entries: HeatEntry[]): SectorHeat[] {
  const bySector = new Map<string, number[]>();
  for (const e of entries) {
    const arr = bySector.get(e.sectorCode) ?? [];
    arr.push(e.retPct);
    bySector.set(e.sectorCode, arr);
  }
  const out: SectorHeat[] = [];
  for (const [sectorCode, rets] of bySector) {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    out.push({
      sectorCode,
      count: rets.length,
      meanRetPct: mean,
      medianRetPct: median(rets),
    });
  }
  return out.sort((a, b) => b.meanRetPct - a.meanRetPct);
}
