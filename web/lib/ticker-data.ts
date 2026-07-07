import { despike } from "./despike";
import { buildProductionRegistry } from "@engine/tools/factory";
import { execute } from "@engine/tools/types";

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
  priceSeries: { d: string; close: number; rawClose: number }[];
  quarters: QuarterInfo[];
  filings: FilingInfo[];
  news: NewsInfo[];
  catalysts: CatalystInfo[];
  dossiers: DossierStateInfo[];
  recCalls: RecCallInfo[];
  dcf?: any;
  qoe?: any;
  technicals?: any;
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

function safeParseJson<T>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Helper to build SEC filings URLs.
 */
export function getFilingUrl(cik: string, accessionNo: string, primaryDoc: string | null): string {
  if (!primaryDoc) return "#";
  const cleanCik = cik.replace(/^0+/, ""); // CIK directory on SEC can drop leading zeroes or keep them. SEC index requires padded, but archives directory supports padded. Let's keep as is.
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
    // 1. Fetch sector mappings to group in memory
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

    // 2. Base query with window functions to get latest two price points
    // SQLite ROW_NUMBER partition makes it super fast
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

    // 3. Fetch Prices + Despike
    let limit = 260;
    if (range === "1d") limit = 2;
    else if (range === "5d") limit = 5;
    else if (range === "1m") limit = 22;
    else if (range === "3m") limit = 65;
    else if (range === "1y") limit = 260;
    else if (range === "3y") limit = 780;
    else if (range === "5y") limit = 1300;
    const priceRows = db.prepare(`
      SELECT d, close FROM Price
      WHERE symbol = ?
      ORDER BY d DESC
      LIMIT ?
    `).all(symbol, limit);

    // Order chronologically for despike and charting
    const chronPrices = priceRows.reverse();
    const dates = chronPrices.map((r) => r.d as string);
    const rawCloses = chronPrices.map((r) => r.close as number);
    const despikedCloses = despike(rawCloses);

    const priceSeries = dates.map((d, idx) => ({
      d,
      close: despikedCloses[idx],
      rawClose: rawCloses[idx],
    }));

    // 4. Fetch Quarters (last 20 to allow deduplication)
    const quarterRows = db.prepare(`
      SELECT * FROM FundamentalsQuarter
      WHERE symbol = ?
      ORDER BY periodEnd DESC
      LIMIT 20
    `).all(symbol);

    const mergedRows: typeof quarterRows = [];
    for (const r of quarterRows) {
      let mergedWithExisting = false;
      const rDate = new Date(r.periodEnd as string);
      for (const existing of mergedRows) {
        const eDate = new Date(existing.periodEnd as string);
        const diffDays = Math.abs(rDate.getTime() - eDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays <= 7) {
          // Merge fields: fill null values in existing row from r
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

    const quarters: QuarterInfo[] = mergedRows.slice(0, 6).map((r) => {
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
      };
    });

    // 5. Fetch Filings (last 10, core financial forms only, excluding Form 4)
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

    // 7. Fetch Catalysts (upcoming/all for symbol + symbol's sectors)
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
      // parse json to get verdict
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

    // 10. Execute DCF, QoE and Technicals tools
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

