import { computeFScore, screenApplicability } from "../screens/fscore";
import { computeAccruals } from "../screens/accruals";
import { computeDilution } from "../screens/dilution";
import type { FundamentalsQuarter } from "../screens/types";

// Theme ranking: three transparent 0-100 segments (quality / valuation / momentum)
// per name, never a bare composite. Ties are honest (shared rank, tied flag) and
// names missing more than one segment go to a labeled "insufficient data" silo
// instead of being silently ranked last.

export type RankInput = {
  symbol: string;
  /** GICS sector code (g_*) for sector-relative valuation + momentum. */
  sectorCode: string | null;
  /** Quarters oldest→newest (same contract as src/screens). */
  quarters: FundamentalsQuarter[];
  /** Despiked daily closes oldest→newest (≥ ~13 months for momentum). */
  closes: number[];
  marketCap: number | null;
  evToEbit: number | null;
};

export type Segments = {
  quality: number | null;
  valuation: number | null;
  momentum: number | null;
};

export type RankedRow = {
  symbol: string;
  sectorCode: string | null;
  segments: Segments;
  /** Per-factor provenance strings (what the numbers came from). */
  subScores: {
    quality: string;
    valuation: string;
    momentum: string;
  };
  /** Mean of available segments (null when insufficient). */
  composite: number | null;
  rank: number | null;
  tied: boolean;
  insufficientData: boolean;
  /** Which segments are missing and why. */
  missing: string[];
  /** True when the name passes the hard quality gates (F≥7, accruals pass, dilution pass). */
  passesQualityGates: boolean;
  warnings: string[];
};

export type RankResult = {
  ranked: RankedRow[];
  silo: RankedRow[];
  warnings: string[];
};

const TRADING_DAYS_YEAR = 252;
const TRADING_DAYS_MONTH = 21;
const MIN_COHORT = 10;

/** 12-1 momentum: 12-month return skipping the most recent month. */
export function twelveMinusOneReturn(closes: number[]): number | null {
  if (closes.length < TRADING_DAYS_YEAR + 1) return null;
  const end = closes[closes.length - 1 - TRADING_DAYS_MONTH];
  const start = closes[closes.length - 1 - TRADING_DAYS_YEAR];
  if (!Number.isFinite(end) || !Number.isFinite(start) || start <= 0) return null;
  return end / start - 1;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Percentile rank of x within xs, 0-100 (fraction of values strictly below + half of ties). */
function percentile(x: number, xs: number[]): number {
  if (xs.length <= 1) return 50;
  let below = 0;
  let ties = 0;
  for (const v of xs) {
    if (v < x) below++;
    else if (v === x) ties++;
  }
  return ((below + (ties - 1) / 2) / (xs.length - 1)) * 100;
}

function ttmRevenue(quarters: FundamentalsQuarter[]): number | null {
  if (quarters.length < 4) return null;
  let sum = 0;
  for (const q of quarters.slice(-4)) {
    if (q.revenue === null || q.revenue === undefined) return null;
    sum += q.revenue;
  }
  return sum > 0 ? sum : null;
}

export function rankTheme(inputs: RankInput[]): RankResult {
  const warnings: string[] = [];

  // Pre-compute per-symbol raw factors.
  const raw = inputs.map((input) => {
    const rowWarnings: string[] = [];
    const applicability = input.sectorCode
      ? screenApplicability([input.sectorCode])
      : { applicable: true as const };

    const fscore = computeFScore(input.quarters);
    const accruals = computeAccruals(input.quarters);
    const dilution = computeDilution(input.quarters);
    const mom = twelveMinusOneReturn(input.closes);

    // Valuation input: EV/EBIT preferred; P/S fallback when EV/EBIT is unusable
    // (negative EBIT → evToEbit null upstream) so the multiple is "suspended", not fatal.
    const ps =
      input.marketCap !== null && input.marketCap > 0
        ? (() => {
            const rev = ttmRevenue(input.quarters);
            return rev !== null ? input.marketCap! / rev : null;
          })()
        : null;

    return { input, applicability, fscore, accruals, dilution, mom, ps, rowWarnings };
  });

  // Sector cohorts for valuation + momentum neutralization.
  const bySector = new Map<string, typeof raw>();
  for (const r of raw) {
    const key = r.input.sectorCode ?? "__none__";
    if (!bySector.has(key)) bySector.set(key, []);
    bySector.get(key)!.push(r);
  }
  for (const [sector, rows] of bySector) {
    if (sector !== "__none__" && rows.length < MIN_COHORT) {
      warnings.push(`sector ${sector} cohort has <${MIN_COHORT} names (${rows.length}) — sector-relative readings are noisy`);
    }
  }

  const rows: RankedRow[] = raw.map((r) => {
    const missing: string[] = [];
    const rowWarnings = [...r.rowWarnings, ...r.fscore.warnings.slice(0, 2)];

    // ── quality (0-100): F-Score 60% + accruals 20% + dilution 20% ──
    let quality: number | null = null;
    let qualityWhy = "not computable";
    if (!r.applicability.applicable) {
      missing.push(`quality: ${r.applicability.reason ?? "screen not applicable to this sector"}`);
    } else if (r.fscore.maxComputable < 5) {
      missing.push(`quality: only ${r.fscore.maxComputable}/9 F-Score tests computable`);
    } else {
      const f = (r.fscore.score / 9) * 60;
      const a = r.accruals.verdict === "pass" ? 20 : r.accruals.verdict === "warn" ? 10 : 0;
      const d = r.dilution.verdict === "pass" ? 20 : 0;
      quality = Math.round(f + a + d);
      qualityWhy = `F-Score ${r.fscore.score}/9 (${r.fscore.maxComputable} computable) · accruals ${r.accruals.verdict}${
        r.accruals.value !== null ? ` (${r.accruals.value.toFixed(3)})` : ""
      } · dilution ${r.dilution.verdict}${r.dilution.value !== null ? ` (${(r.dilution.value * 100).toFixed(1)}% 3y)` : ""}`;
    }

    // ── valuation (0-100): sector-relative cheapness percentile, inverted ──
    let valuation: number | null = null;
    let valuationWhy = "not computable";
    const cohort = bySector.get(r.input.sectorCode ?? "__none__")!;
    const cohortEv = cohort.filter((c) => c.input.evToEbit !== null).map((c) => c.input.evToEbit!) ?? [];
    if (r.input.evToEbit !== null && cohortEv.length >= 2) {
      valuation = Math.round(100 - percentile(r.input.evToEbit, cohortEv));
      valuationWhy = `EV/EBIT ${r.input.evToEbit.toFixed(1)} — cheaper than ${valuation}% of ${r.input.sectorCode ?? "peer"} cohort (${cohortEv.length} names)`;
    } else {
      const cohortPs = cohort.filter((c) => c.ps !== null).map((c) => c.ps!);
      if (r.ps !== null && cohortPs.length >= 2) {
        valuation = Math.round(100 - percentile(r.ps, cohortPs));
        valuationWhy = `EV/EBIT suspended (non-positive EBIT) — P/S ${r.ps.toFixed(2)} fallback, cheaper than ${valuation}% of cohort (${cohortPs.length} names)`;
        rowWarnings.push("valuation on P/S fallback — EV/EBIT suspended");
      } else {
        missing.push("valuation: no usable EV/EBIT or P/S within sector cohort");
      }
    }

    // ── momentum (0-100): 12-1 return minus GICS-sector median, percentile-scaled ──
    let momentum: number | null = null;
    let momentumWhy = "not computable";
    if (r.mom === null) {
      missing.push("momentum: needs ~13 months of closes");
    } else {
      const sectorMoms = cohort.filter((c) => c.mom !== null).map((c) => c.mom!);
      const sectorMed = median(sectorMoms) ?? 0;
      const excess = r.mom - sectorMed;
      const allExcess = raw
        .filter((c) => c.mom !== null)
        .map((c) => {
          const cCohort = bySector.get(c.input.sectorCode ?? "__none__")!;
          const cMed = median(cCohort.filter((x) => x.mom !== null).map((x) => x.mom!)) ?? 0;
          return c.mom! - cMed;
        });
      momentum = Math.round(percentile(excess, allExcess));
      momentumWhy = `12-1 return ${(r.mom * 100).toFixed(1)}% vs sector median ${(sectorMed * 100).toFixed(1)}% (excess ${(excess * 100).toFixed(1)}pp)`;
    }

    const segments: Segments = { quality, valuation, momentum };
    const available = [quality, valuation, momentum].filter((s): s is number => s !== null);
    const insufficientData = available.length < 2;
    const composite = insufficientData
      ? null
      : Math.round((available.reduce((a, b) => a + b, 0) / available.length) * 10) / 10;

    const passesQualityGates =
      r.applicability.applicable &&
      r.fscore.score >= 7 &&
      r.accruals.verdict === "pass" &&
      r.dilution.verdict === "pass";

    return {
      symbol: r.input.symbol,
      sectorCode: r.input.sectorCode,
      segments,
      subScores: { quality: qualityWhy, valuation: valuationWhy, momentum: momentumWhy },
      composite,
      rank: null,
      tied: false,
      insufficientData,
      missing,
      passesQualityGates,
      warnings: rowWarnings,
    };
  });

  const ranked = rows
    .filter((row) => !row.insufficientData)
    .sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
  const silo = rows.filter((row) => row.insufficientData);

  // Standard competition ranking with honest ties (1, 2, 2, 4 …).
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && ranked[i].composite === ranked[i - 1].composite) {
      ranked[i].rank = ranked[i - 1].rank;
      ranked[i].tied = true;
      ranked[i - 1].tied = true;
    } else {
      ranked[i].rank = i + 1;
    }
  }

  return { ranked, silo, warnings };
}

export type ThemeIntelligence = {
  /** Median valuation segment across ranked names (higher = theme is cheaper). */
  aggregateValuationPctile: number | null;
  /** Share of ranked names passing the hard quality gates, 0-100. */
  breadth: number | null;
  rankedCount: number;
  siloCount: number;
};

export function themeIntelligence(result: RankResult): ThemeIntelligence {
  const vals = result.ranked
    .map((r) => r.segments.valuation)
    .filter((v): v is number => v !== null);
  const breadthDen = result.ranked.length;
  return {
    aggregateValuationPctile: median(vals),
    breadth:
      breadthDen === 0
        ? null
        : Math.round((result.ranked.filter((r) => r.passesQualityGates).length / breadthDen) * 100),
    rankedCount: result.ranked.length,
    siloCount: result.silo.length,
  };
}
