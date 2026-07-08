import { despike } from "@engine/lib/metrics";
import { buildProductionRegistry } from "@engine/tools/factory";
import { execute } from "@engine/tools/types";
import { smaSeries, rsiSeries, macdSeries } from "@engine/lib/chart-math";
import { computeValuationHistory } from "@engine/tools/valuation-history";
import { computeFScore } from "@engine/screens/fscore";
import { computeAccruals } from "@engine/screens/accruals";
import { computeDilution } from "@engine/screens/dilution";
import { computeEarningsTrend } from "@engine/screens/earnings-trend";
import { checkInsiderCluster } from "@engine/screens/insider-cluster";
import { TRIPWIRES } from "@engine/config/tripwires";
import { alertsForSymbol, type FilingEventRow } from "@engine/monitor/tripwires";

// Server-only data loader for tickers, SQLite queries using node:sqlite.
// Follows the digest-data.ts / dossier-data.ts patterns.

export interface TickerListRow {
  symbol: string;
  name: string | null;
  watchlisted: boolean;
  sectors: string[];
  close: number | null;
  change1d: number | null;
  marketCap: number | null;
  forwardPE: number | null;
  trailingPE: number | null;
}

export interface TickerSectorInfo {
  code: string;
  name: string;
  taxonomy: string;
  stage: string;
}

export interface QuarterInfo {
  periodEnd: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  fcf: number | null;
  capex: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  cash: number | null;
  equity: number | null;
  sharesOut: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  cfo: number | null;
  sga: number | null;
  depreciation: number | null;
  receivables: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  retainedEarnings: number | null;
  ppe: number | null;
}

export interface FilingInfo {
  accessionNo: string;
  form: string;
  filedAt: string;
  primaryDoc: string | null;
  cik: string;
  url: string;
}

export interface NewsInfo {
  url: string;
  title: string;
  snippet: string | null;
  source: string | null;
  publishedAt: string | null;
}

export interface CatalystInfo {
  id: number;
  d: string | null;
  kind: string;
  sectorCode: string | null;
  symbol: string | null;
  title: string;
  note: string | null;
}

export interface DossierStateInfo {
  id: string;
  symbol: string;
  status: string;
  updatedAt: number;
  verdict: {
    recommendation: string;
    conviction: string;
    summary: string;
  } | null;
}

export interface RecCallInfo {
  id: number;
  dossierId: string;
  symbol: string;
  action: string;
  conviction: string;
  priceAtCall: number;
  targetLow: number | null;
  targetHigh: number | null;
  stopPrice: number | null;
  governedSizePct: number;
  governorReason: string | null;
  createdAt: string;
}

export interface TickerDetail {
  symbol: string;
  name: string | null;
  class: string;
  watchlisted: boolean;
  cik: string | null;
  marketCap: number | null;
  forwardPE: number | null;
  trailingPE: number | null;
  profitMargin: number | null;
  revenueGrowth: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  beta: number | null;
  eps: number | null;
  yearChange: number | null;
  statsUpdatedAt: string | null;
  sectors: TickerSectorInfo[];
  priceSeries: {
    d: string;
    close: number;
    rawClose: number;
    volume: number;
    ma20: number | null;
    ma50: number | null;
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHist: number | null;
  }[];
  quarters: QuarterInfo[];
  filings: FilingInfo[];
  news: NewsInfo[];
  catalysts: CatalystInfo[];
  dossiers: DossierStateInfo[];
  recCalls: RecCallInfo[];
  dcf?: any;
  qoe?: any;
  technicals?: any;

  // Writable / user state extensions
  buyUnder: number | null;
  disconfirming: string | null;
  thesis: string | null;
  userState: string | null;
  tier: number | null;

  // Additional sections
  insiderTxs: any[];
  filingEvents: any[];
  researchRuns: any[];
  valuationHistory: any;
  activeTripwires: any[];
  screens: {
    fscore: any;
    accruals: any;
    dilution: any;
    earningsTrend: any;
    insiderCluster: any;
  };
  /** Aggregated data-quality warnings from the screen modules (amber-chip fodder). */
  screenWarnings: string[];
}

interface SqlDb {
  prepare(sql: string): {
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Record<string, unknown>[];
  };
  close?: () => void;
}

async function openDb(): Promise<SqlDb | null> {
  try {
    const mod = await import("node:sqlite");
    const file = (
      process.env.DATABASE_URL ?? "file:../data/engine.db"
    ).replace(/^file:/, "");
    const db = new mod.DatabaseSync(file, { readOnly: true });
    return db as unknown as SqlDb;
  } catch {
    return null;
  }
}

function closeDb(db: SqlDb): void {
  if (typeof db.close === "function") db.close();
}

/**
 * Helper to build SEC filings URLs.
 */
export function getFilingUrl(cik: string, accessionNo: string, primaryDoc: string | null): string {
  if (!primaryDoc) return "#";
  const cleanCik = cik.replace(/^0+/, "");
  const cleanAccession = accessionNo.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${cleanAccession}/${primaryDoc}`;
}

/**
 * List tickers with filters: q, sector, watchlistedOnly.
 */
export async function listTickers(filters: {
  q?: string;
  sector?: string;
  watchlistedOnly?: boolean;
}): Promise<TickerListRow[]> {
  const db = await openDb();
  if (!db) return [];

  try {
    const sectorRows = db.prepare("SELECT symbol, sectorCode FROM TickerSector").all();
    const sectorsMap = new Map<string, string[]>();
    for (const r of sectorRows) {
      const sym = r.symbol as string;
      const sec = r.sectorCode as string;
      if (!sectorsMap.has(sym)) {
        sectorsMap.set(sym, []);
      }
      sectorsMap.get(sym)!.push(sec);
    }

    let sql = `
      WITH LatestPrices AS (
        SELECT symbol, close, d,
               ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY d DESC) as rn
        FROM Price
      ),
      TickerPrices AS (
        SELECT
          p1.symbol,
          p1.close as latest_close,
          p2.close as prev_close
        FROM LatestPrices p1
        LEFT JOIN LatestPrices p2 ON p1.symbol = p2.symbol AND p2.rn = 2
        WHERE p1.rn = 1
      )
      SELECT
        t.symbol,
        t.name,
        t.watchlisted,
        t.marketCap,
        t.forwardPE,
        t.trailingPE,
        tp.latest_close,
        tp.prev_close
      FROM Ticker t
      LEFT JOIN TickerPrices tp ON t.symbol = tp.symbol
    `;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.watchlistedOnly) {
      conditions.push("t.watchlisted = 1");
    }

    if (filters.q) {
      conditions.push("(t.symbol LIKE ? OR t.name LIKE ?)");
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }

    if (filters.sector) {
      sql += " JOIN TickerSector ts_filter ON t.symbol = ts_filter.symbol";
      conditions.push("ts_filter.sectorCode = ?");
      params.push(filters.sector);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY t.symbol ASC";

    const rows = db.prepare(sql).all(...params);

    return rows.map((row) => {
      const symbol = row.symbol as string;
      const latestClose = row.latest_close !== null ? (row.latest_close as number) : null;
      const prevClose = row.prev_close !== null ? (row.prev_close as number) : null;

      let change1d: number | null = null;
      if (latestClose !== null && prevClose !== null && prevClose > 0) {
        change1d = ((latestClose - prevClose) / prevClose) * 100;
      }

      return {
        symbol,
        name: (row.name as string) ?? null,
        watchlisted: (row.watchlisted as number) === 1,
        sectors: sectorsMap.get(symbol) ?? [],
        close: latestClose,
        change1d,
        marketCap: row.marketCap !== null ? (row.marketCap as number) : null,
        forwardPE: row.forwardPE !== null ? (row.forwardPE as number) : null,
        trailingPE: row.trailingPE !== null ? (row.trailingPE as number) : null,
      };
    });
  } catch (err) {
    console.error("Error in listTickers:", err);
    return [];
  } finally {
    closeDb(db);
  }
}

/**
 * Load ticker detail cockpit data.
 */
export async function tickerDetail(
  symbol: string,
  range: string = "1y"
): Promise<TickerDetail | null> {
  const db = await openDb();
  if (!db) return null;

  try {
    // 1. Fetch Ticker metadata
    const tRow = db.prepare("SELECT * FROM Ticker WHERE symbol = ?").get(symbol);
    if (!tRow) return null;

    // 2. Fetch Sector Info
    const sectorRows = db.prepare(`
      SELECT s.code, s.name, s.taxonomy, s.stage
      FROM Sector s
      JOIN TickerSector ts ON s.code = ts.sectorCode
      WHERE ts.symbol = ?
    `).all(symbol);

    const sectors: TickerSectorInfo[] = sectorRows.map((r) => ({
      code: r.code as string,
      name: r.name as string,
      taxonomy: r.taxonomy as string,
      stage: r.stage as string,
    }));

    // 3. Fetch Prices (Fetch up to 2600 bars for the client RangeTabs: 3M, 1Y, 3Y, 10Y)
    const priceRows = db.prepare(`
      SELECT d, close, volume FROM Price
      WHERE symbol = ?
      ORDER BY d DESC
      LIMIT 2600
    `).all(symbol);

    const chronPrices = priceRows.reverse();
    const dates = chronPrices.map((r) => r.d as string);
    const rawCloses = chronPrices.map((r) => r.close as number);
    const rawVolumes = chronPrices.map((r) => (r.volume as number) ?? 0);
    const despikedCloses = despike(rawCloses);

    const rawPriceSeries = dates.map((d, idx) => ({
      d,
      close: despikedCloses[idx],
      rawClose: rawCloses[idx],
      volume: rawVolumes[idx],
    }));

    // Pre-calculate indicators on the full series
    const closes = rawPriceSeries.map((p) => p.close);
    const ma20Vals = smaSeries(closes, 20);
    const ma50Vals = smaSeries(closes, 50);
    const rsi14Vals = rsiSeries(closes, 14);
    const macdVals = macdSeries(closes, 12, 26, 9);

    const priceSeries = rawPriceSeries.map((p, idx) => ({
      ...p,
      ma20: ma20Vals[idx],
      ma50: ma50Vals[idx],
      rsi: rsi14Vals[idx],
      macd: macdVals[idx]?.macd ?? null,
      macdSignal: macdVals[idx]?.signal ?? null,
      macdHist: macdVals[idx]?.histogram ?? null,
    }));

    // 4. Fetch Quarters (last 60 to have enough history for 40 quarters after merging)
    const quarterRows = db.prepare(`
      SELECT * FROM FundamentalsQuarter
      WHERE symbol = ?
      ORDER BY periodEnd DESC
      LIMIT 60
    `).all(symbol);

    const mergedRows: any[] = [];
    for (const r of quarterRows) {
      let mergedWithExisting = false;
      const rDate = new Date(r.periodEnd as string);
      for (const existing of mergedRows) {
        const eDate = new Date(existing.periodEnd as string);
        const diffDays = Math.abs(rDate.getTime() - eDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays <= 7) {
          for (const col of Object.keys(existing)) {
            if (existing[col] === null && r[col] !== null) {
              existing[col] = r[col];
            }
          }
          mergedWithExisting = true;
          break;
        }
      }
      if (!mergedWithExisting) {
        mergedRows.push({ ...r });
      }
    }

    // Sort chronologically for screens
    const sortedQuartersForScreens = [...mergedRows].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

    // Slice up to 40 quarters for the UI table
    const quarters: QuarterInfo[] = mergedRows.slice(0, 40).map((r: any) => {
      const revenue = r.revenue !== null ? (r.revenue as number) : null;
      const grossProfit = r.grossProfit !== null ? (r.grossProfit as number) : null;
      const operatingIncome = r.operatingIncome !== null ? (r.operatingIncome as number) : null;
      const netIncome = r.netIncome !== null ? (r.netIncome as number) : null;

      const grossMargin = revenue && grossProfit ? (grossProfit / revenue) * 100 : null;
      const operatingMargin = revenue && operatingIncome ? (operatingIncome / revenue) * 100 : null;
      const profitMargin = revenue && netIncome ? (netIncome / revenue) * 100 : null;

      return {
        periodEnd: r.periodEnd as string,
        revenue,
        grossProfit,
        operatingIncome,
        netIncome,
        fcf: r.fcf !== null ? (r.fcf as number) : null,
        capex: r.capex !== null ? (r.capex as number) : null,
        totalAssets: r.totalAssets !== null ? (r.totalAssets as number) : null,
        totalDebt: r.totalDebt !== null ? (r.totalDebt as number) : null,
        cash: r.cash !== null ? (r.cash as number) : null,
        equity: r.equity !== null ? (r.equity as number) : null,
        sharesOut: r.sharesOut !== null ? (r.sharesOut as number) : null,
        grossMargin,
        operatingMargin,
        profitMargin,
        cfo: r.cfo !== null ? (r.cfo as number) : null,
        sga: r.sga !== null ? (r.sga as number) : null,
        depreciation: r.depreciation !== null ? (r.depreciation as number) : null,
        receivables: r.receivables !== null ? (r.receivables as number) : null,
        currentAssets: r.currentAssets !== null ? (r.currentAssets as number) : null,
        currentLiabilities: r.currentLiabilities !== null ? (r.currentLiabilities as number) : null,
        retainedEarnings: r.retainedEarnings !== null ? (r.retainedEarnings as number) : null,
        ppe: r.ppe !== null ? (r.ppe as number) : null,
      };
    });

    // 5. Fetch Filings (last 10, core financial forms only)
    const filingRows = db.prepare(`
      SELECT accessionNo, form, filedAt, primaryDoc, cik
      FROM EdgarFiling
      WHERE symbol = ? AND form IN ('10-K', '10-Q', '8-K', 'DEF 14A')
      ORDER BY filedAt DESC
      LIMIT 10
    `).all(symbol);

    const filings: FilingInfo[] = filingRows.map((r) => {
      const acc = r.accessionNo as string;
      const cik = r.cik as string;
      const doc = r.primaryDoc as string | null;
      return {
        accessionNo: acc,
        form: r.form as string,
        filedAt: r.filedAt as string,
        primaryDoc: doc,
        cik,
        url: getFilingUrl(cik, acc, doc),
      };
    });

    // 6. Fetch News (last 15)
    const newsRows = db.prepare(`
      SELECT url, title, snippet, source, publishedAt
      FROM NewsItem
      WHERE symbol = ?
      ORDER BY publishedAt DESC, fetchedAt DESC
      LIMIT 15
    `).all(symbol);

    const news: NewsInfo[] = newsRows.map((r) => ({
      url: r.url as string,
      title: r.title as string,
      snippet: (r.snippet as string) ?? null,
      source: (r.source as string) ?? null,
      publishedAt: (r.publishedAt as string) ?? null,
    }));

    // 7. Fetch Catalysts
    const sectorCodes = sectors.map((s) => s.code);
    let catalystsQuery = `
      SELECT id, d, kind, sectorCode, symbol, title, note
      FROM Catalyst
      WHERE symbol = ?
    `;
    const paramsList: unknown[] = [symbol];

    if (sectorCodes.length > 0) {
      catalystsQuery += ` OR sectorCode IN (${sectorCodes.map(() => "?").join(",")})`;
      paramsList.push(...sectorCodes);
    }
    catalystsQuery += " ORDER BY d ASC";

    const catalystRows = db.prepare(catalystsQuery).all(...paramsList);
    const catalysts: CatalystInfo[] = catalystRows.map((r) => ({
      id: r.id as number,
      d: (r.d as string) ?? null,
      kind: r.kind as string,
      sectorCode: (r.sectorCode as string) ?? null,
      symbol: (r.symbol as string) ?? null,
      title: r.title as string,
      note: (r.note as string) ?? null,
    }));

    // 8. Fetch Dossiers from _dossier_state
    const dossierRows = db.prepare(`
      SELECT id, symbol, status, json, updatedAt
      FROM _dossier_state
      WHERE symbol = ?
      ORDER BY updatedAt DESC
    `).all(symbol);

    const dossiers: DossierStateInfo[] = dossierRows.map((r) => {
      let verdict: DossierStateInfo["verdict"] = null;
      if (typeof r.json === "string") {
        try {
          const parsed = JSON.parse(r.json);
          if (parsed && parsed.verdict) {
            verdict = {
              recommendation: parsed.verdict.recommendation ?? "",
              conviction: parsed.verdict.conviction ?? "",
              summary: parsed.verdict.summary ?? "",
            };
          }
        } catch {
          // ignore
        }
      }
      return {
        id: r.id as string,
        symbol: r.symbol as string,
        status: r.status as string,
        updatedAt: r.updatedAt as number,
        verdict,
      };
    });

    // 9. Fetch RecCalls
    const recCallRows = db.prepare(`
      SELECT id, dossierId, symbol, action, conviction, priceAtCall, targetLow, targetHigh, stopPrice, governedSizePct, governorReason, createdAt
      FROM RecCall
      WHERE symbol = ?
      ORDER BY createdAt DESC
    `).all(symbol);

    const recCalls: RecCallInfo[] = recCallRows.map((r) => ({
      id: r.id as number,
      dossierId: r.dossierId as string,
      symbol: r.symbol as string,
      action: r.action as string,
      conviction: r.conviction as string,
      priceAtCall: r.priceAtCall as number,
      targetLow: r.targetLow !== null ? (r.targetLow as number) : null,
      targetHigh: r.targetHigh !== null ? (r.targetHigh as number) : null,
      stopPrice: r.stopPrice !== null ? (r.stopPrice as number) : null,
      governedSizePct: r.governedSizePct as number,
      governorReason: (r.governorReason as string) ?? null,
      createdAt: r.createdAt as string,
    }));

    // 10. Fetch WatchlistEntry and Candidate details
    const wlRow = db.prepare("SELECT buyUnder, disconfirming, thesis FROM WatchlistEntry WHERE symbol = ?").get(symbol) as any;
    const candRow = db.prepare("SELECT userState, tier FROM Candidate WHERE symbol = ?").get(symbol) as any;

    const buyUnder = wlRow ? (wlRow.buyUnder as number) : null;
    const disconfirming = wlRow ? (wlRow.disconfirming as string) : null;
    const thesis = wlRow ? (wlRow.thesis as string) : null;
    const userState = candRow ? (candRow.userState as string) : null;
    const tier = candRow ? (candRow.tier as number) : null;

    // 11. Fetch Insider Transactions
    const insiderTxRows = db.prepare(`
      SELECT filerName, filerRole, txDate, code, shares, price, value, tenPercentOwner, tenB51
      FROM InsiderTx
      WHERE symbol = ?
      ORDER BY txDate DESC
      LIMIT 100
    `).all(symbol);

    const insiderTxs = insiderTxRows.map((r) => ({
      filerName: r.filerName as string,
      filerRole: r.filerRole as string,
      txDate: r.txDate as string,
      code: r.code as string,
      shares: r.shares as number,
      price: r.price as number,
      value: r.value as number,
      tenPercentOwner: (r.tenPercentOwner as number) === 1,
      tenB51: (r.tenB51 as number) === 1,
    }));

    // 12. Fetch classified FilingEvent rows
    const filingEventRows = db.prepare(`
      SELECT id, accessionNo, form, item, kind, headline, snippet, severity, filedAt
      FROM FilingEvent
      WHERE symbol = ?
      ORDER BY filedAt DESC
    `).all(symbol);

    const filingEvents = filingEventRows.map((r) => ({
      id: r.id as number,
      accessionNo: r.accessionNo as string,
      form: r.form as string,
      item: r.item as string,
      kind: r.kind as string,
      headline: r.headline as string,
      snippet: r.snippet as string,
      severity: r.severity as string,
      filedAt: r.filedAt as string,
    }));

    // 13. Fetch ResearchRun history
    const researchRunRows = db.prepare(`
      SELECT id, runType, target, budgetSeconds, elapsedSeconds, status, profile, createdAt, completedAt, artifactPath, errorMessage
      FROM ResearchRun
      WHERE target = ?
      ORDER BY createdAt DESC
    `).all(symbol);

    const researchRuns = researchRunRows.map((r) => ({
      id: r.id as string,
      runType: r.runType as string,
      target: r.target as string,
      budgetSeconds: r.budgetSeconds as number,
      elapsedSeconds: r.elapsedSeconds as number,
      status: r.status as string,
      profile: r.profile as string,
      createdAt: r.createdAt as string,
      completedAt: r.completedAt as string | null,
      artifactPath: r.artifactPath as string | null,
      errorMessage: r.errorMessage as string | null,
    }));

    // 14. Tripwire surfacing for the "WHAT KILLS IT?" quadrant — the tested
    // @engine/monitor mapping (rule scope + 8-K 4.02 always-critical + non-routine
    // filing-diff events), instead of ad-hoc reader logic.
    const ruleEvents = db.prepare("SELECT ruleId, firedAt, severity, message FROM RuleEvent WHERE acked = 0").all() as any[];
    const activeTripwires = alertsForSymbol(
      symbol,
      sectors.map((s) => ({ code: s.code, taxonomy: s.taxonomy })),
      ruleEvents.map((r) => ({
        ruleId: r.ruleId as string,
        severity: r.severity as string,
        message: r.message as string,
        firedAt: r.firedAt as string,
      })),
      filingEvents.map((e) => ({ ...e, symbol })) as FilingEventRow[],
      TRIPWIRES,
    ).map((a) => ({
      ruleId: a.id,
      firedAt: a.firedAt,
      severity: a.severity,
      message: a.message,
      source: a.source,
    }));

    // 15. Valuation corridor ladder
    let valuationHistory = null;
    if (priceSeries.length > 0 && sortedQuartersForScreens.length > 0) {
      try {
        valuationHistory = computeValuationHistory(priceSeries, sortedQuartersForScreens);
      } catch (err) {
        console.error("Error computing valuation history:", err);
      }
    }

    // 16. Screens on the fly
    const screens = {
      fscore: computeFScore(sortedQuartersForScreens),
      accruals: computeAccruals(sortedQuartersForScreens),
      dilution: computeDilution(sortedQuartersForScreens),
      earningsTrend: computeEarningsTrend(sortedQuartersForScreens),
      insiderCluster: checkInsiderCluster(
        insiderTxs.map((tx) => ({
          filerName: tx.filerName,
          filerRole: tx.filerRole,
          txDate: tx.txDate,
          value: tx.value,
          tenPercentOwner: tx.tenPercentOwner ? 1 : 0,
          tenB51: tx.tenB51 ? 1 : 0,
        })),
        tRow.marketCap !== null ? (tRow.marketCap as number) : null
      ),
    };

    // Thread the screens' data-quality warnings through instead of dropping them.
    const screenWarnings: string[] = [
      ...((screens.fscore?.warnings as string[]) ?? []),
      ...((screens.accruals?.warnings as string[]) ?? []),
      ...((screens.dilution?.warnings as string[]) ?? []),
      ...((screens.earningsTrend?.warnings as string[]) ?? []),
    ];

    // 17. Execute DCF, QoE and Technicals tools (old structure)
    const registry = buildProductionRegistry(db as any);
    const dcfTool = registry.get("dcf");
    const qoeTool = registry.get("qoe");
    const techTool = registry.get("technicals");

    let dcf: any = null;
    let qoe: any = null;
    let technicals: any = null;

    if (dcfTool) {
      try {
        const res = await execute(dcfTool, { symbol });
        if (!res.error && res.data && res.data.data_status !== "missing") {
          dcf = res.data;
        }
      } catch (err) {
        console.error("Error executing DCF tool:", err);
      }
    }
    if (qoeTool) {
      try {
        const res = await execute(qoeTool, { symbol });
        if (!res.error && res.data && res.data.data_status !== "missing") {
          qoe = res.data;
        }
      } catch (err) {
        console.error("Error executing QoE tool:", err);
      }
    }
    if (techTool) {
      try {
        const res = await execute(techTool, { symbol });
        if (!res.error && res.data && res.data.data_status !== "missing") {
          technicals = res.data;
        }
      } catch (err) {
        console.error("Error executing Technicals tool:", err);
      }
    }

    return {
      symbol: tRow.symbol as string,
      name: (tRow.name as string) ?? null,
      class: (tRow.class as string) ?? "stock",
      watchlisted: (tRow.watchlisted as number) === 1,
      cik: (tRow.cik as string) ?? null,
      marketCap: tRow.marketCap !== null ? (tRow.marketCap as number) : null,
      forwardPE: tRow.forwardPE !== null ? (tRow.forwardPE as number) : null,
      trailingPE: tRow.trailingPE !== null ? (tRow.trailingPE as number) : null,
      profitMargin: tRow.profitMargin !== null ? (tRow.profitMargin as number) : null,
      revenueGrowth: tRow.revenueGrowth !== null ? (tRow.revenueGrowth as number) : null,
      fiftyTwoWeekHigh: tRow.fiftyTwoWeekHigh !== null ? (tRow.fiftyTwoWeekHigh as number) : null,
      fiftyTwoWeekLow: tRow.fiftyTwoWeekLow !== null ? (tRow.fiftyTwoWeekLow as number) : null,
      beta: tRow.beta !== null ? (tRow.beta as number) : null,
      eps: tRow.eps !== null ? (tRow.eps as number) : null,
      yearChange: tRow.yearChange !== null ? (tRow.yearChange as number) : null,
      statsUpdatedAt: (tRow.statsUpdatedAt as string) ?? null,
      sectors,
      priceSeries,
      quarters,
      filings,
      news,
      catalysts,
      dossiers,
      recCalls,
      dcf,
      qoe,
      technicals,

      // User state
      buyUnder,
      disconfirming,
      thesis,
      userState,
      tier,

      // Rich data additions
      insiderTxs,
      filingEvents,
      researchRuns,
      valuationHistory,
      activeTripwires,
      screens,
      screenWarnings,
    };
  } catch (err) {
    console.error("Error loading tickerDetail:", err);
    return null;
  } finally {
    closeDb(db);
  }
}

export interface SectorListRow {
  code: string;
  name: string;
  taxonomy: string;
}

/**
 * List all GICS and AI sectors.
 */
export async function listSectors(): Promise<SectorListRow[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const rows = db.prepare("SELECT code, name, taxonomy FROM Sector ORDER BY name ASC").all();
    return rows.map((r) => ({
      code: r.code as string,
      name: r.name as string,
      taxonomy: r.taxonomy as string,
    }));
  } catch {
    return [];
  } finally {
    closeDb(db);
  }
}

export interface WatchlistSidebarRow {
  symbol: string;
  name: string | null;
  close: number | null;
  change1d: number | null;
  closes: number[];
}

/**
 * List watchlisted tickers with their latest 30 despiked closes for sparklines.
 */
export async function watchlistSidebar(): Promise<WatchlistSidebarRow[]> {
  const db = await openDb();
  if (!db) return [];

  try {
    const tickers = db.prepare("SELECT symbol, name FROM Ticker WHERE watchlisted = 1 ORDER BY symbol ASC").all();
    if (tickers.length === 0) return [];

    const symbols = tickers.map(t => t.symbol as string);
    const placeholders = symbols.map(() => "?").join(",");

    const priceRows = db.prepare(`
      WITH RankedPrices AS (
        SELECT symbol, close, d,
               ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY d DESC) as rn
        FROM Price
        WHERE symbol IN (${placeholders})
      )
      SELECT symbol, close, d
      FROM RankedPrices
      WHERE rn <= 30
      ORDER BY symbol ASC, d ASC
    `).all(...symbols);

    const pricesBySymbol = new Map<string, { close: number; d: string }[]>();
    for (const r of priceRows) {
      const sym = r.symbol as string;
      if (!pricesBySymbol.has(sym)) {
        pricesBySymbol.set(sym, []);
      }
      pricesBySymbol.get(sym)!.push({
        close: r.close as number,
        d: r.d as string,
      });
    }

    return tickers.map((t) => {
      const sym = t.symbol as string;
      const symPrices = pricesBySymbol.get(sym) ?? [];
      const rawCloses = symPrices.map((p) => p.close);
      const despikedCloses = despike(rawCloses);

      const latestClose = despikedCloses.length > 0 ? despikedCloses[despikedCloses.length - 1] : null;
      const prevClose = despikedCloses.length > 1 ? despikedCloses[despikedCloses.length - 2] : null;

      let change1d: number | null = null;
      if (latestClose !== null && prevClose !== null && prevClose > 0) {
        change1d = ((latestClose - prevClose) / prevClose) * 100;
      }

      return {
        symbol: sym,
        name: (t.name as string) ?? null,
        close: latestClose,
        change1d,
        closes: despikedCloses,
      };
    });
  } catch (err) {
    console.error("Error in watchlistSidebar:", err);
    return [];
  } finally {
    closeDb(db);
  }
}
