import { positionView, decaySignals } from "@engine/portfolio/decay";
import type { DecayFinding } from "@engine/portfolio/decay";

export interface PortfolioPosition {
  symbol: string;
  qty: number;
  avgCost: number;
  openedAt: string | null;
  currentPrice: number | null;
  marketValue: number | null;
  pnlPct: number | null;
  costBasis: number;
  findings: DecayFinding[];
  latestVerdict: {
    dossierId: string | null;
    action: string | null;
    conviction: string | null;
    governedSizePct: number | null;
    stopPrice: number | null;
    targetLow: number | null;
    targetHigh: number | null;
    what_would_change_mind: string[];
  } | null;
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

export async function loadPortfolio(): Promise<PortfolioPosition[]> {
  const db = await openDb();
  if (!db) return [];

  try {
    // Missing table guard: if Position table doesn't exist, we fail gracefully
    const posRows = db.prepare('SELECT symbol, qty, avgCost, openedAt FROM "Position" ORDER BY symbol ASC').all() as {
      symbol: string;
      qty: number;
      avgCost: number;
      openedAt: string | null;
    }[];

    const results: PortfolioPosition[] = [];

    for (const pos of posRows) {
      const symbol = pos.symbol.toUpperCase();

      // Load latest closes for this symbol (needed for drawdown signal calculations)
      const priceRows = db.prepare(
        'SELECT close, d FROM "Price" WHERE symbol = ? ORDER BY d ASC'
      ).all(symbol) as { close: number; d: string }[];

      const currentPrice = priceRows.length > 0 ? priceRows[priceRows.length - 1].close : null;

      // Load latest RecCall
      let recCallRow: Record<string, unknown> | undefined;
      try {
        recCallRow = db.prepare(
          'SELECT * FROM "RecCall" WHERE symbol = ? ORDER BY createdAt DESC, id DESC LIMIT 1'
        ).get(symbol) as Record<string, unknown> | undefined;
      } catch {
        // RecCall table missing or empty
      }

      // Map DB row to engine's RecCall format for decaySignals
      let recCallObj = null;
      if (recCallRow) {
        recCallObj = {
          dossierId: recCallRow.dossierId as string,
          symbol: recCallRow.symbol as string,
          action: recCallRow.action as any,
          conviction: recCallRow.conviction as any,
          priceAtCall: recCallRow.priceAtCall as number,
          targetLow: (recCallRow.targetLow as number) ?? 0,
          targetHigh: (recCallRow.targetHigh as number) ?? 0,
          stopPrice: (recCallRow.stopPrice as number) ?? null,
          judgeSizePct: recCallRow.judgeSizePct as number,
          governedSizePct: recCallRow.governedSizePct as number,
          governorReason: (recCallRow.governorReason as string) ?? "",
          model: (recCallRow.model as string) ?? "",
          thinkingMode: Boolean(recCallRow.thinkingMode),
          promptVersion: (recCallRow.promptVersion as string) ?? "v1",
          createdAt: recCallRow.createdAt ? new Date(recCallRow.createdAt as string).getTime() : Date.now(),
          outcome1mPct: (recCallRow.outcome1mPct as number) ?? null,
          outcome3mPct: (recCallRow.outcome3mPct as number) ?? null,
          outcome6mPct: (recCallRow.outcome6mPct as number) ?? null,
          outcome1yPct: (recCallRow.outcome1yPct as number) ?? null,
          thesisFalsified: recCallRow.thesisFalsified !== null ? Boolean(recCallRow.thesisFalsified) : null,
        };
      }

      // Load latest done dossier state for what_would_change_mind checklist
      let dossierState = null;
      try {
        const dossierRow = db.prepare(
          'SELECT json FROM "_dossier_state" WHERE symbol = ? AND status = "done" ORDER BY updatedAt DESC LIMIT 1'
        ).get(symbol) as { json: string } | undefined;

        if (dossierRow?.json) {
          dossierState = JSON.parse(dossierRow.json);
        }
      } catch {
        // _dossier_state table missing or empty
      }

      // Compute core metrics using the engine's pure positionView function
      const view = positionView(pos, currentPrice);

      // Compute decay findings
      const findings = decaySignals({
        symbol,
        currentPrice,
        avgCost: pos.avgCost,
        closes: priceRows,
        recCall: recCallObj,
      });

      // Extract what_would_change_mind from RecCall's wwcmJson or dossierState's verdict.what_would_change_mind
      let wwcm: string[] = [];
      if (recCallRow?.wwcmJson) {
        try {
          const parsed = JSON.parse(recCallRow.wwcmJson as string);
          if (Array.isArray(parsed)) {
            wwcm = parsed.map(String);
          }
        } catch {}
      }
      if (wwcm.length === 0 && dossierState?.verdict?.what_would_change_mind) {
        if (Array.isArray(dossierState.verdict.what_would_change_mind)) {
          wwcm = dossierState.verdict.what_would_change_mind.map(String);
        }
      }

      const dossierId = (recCallRow?.dossierId as string) ?? (dossierState?.id as string) ?? null;
      const action = (recCallRow?.action as string) ?? (dossierState?.verdict?.recommendation as string) ?? null;
      const conviction = (recCallRow?.conviction as string) ?? (dossierState?.verdict?.conviction as string) ?? null;
      const governedSizePct = (recCallRow?.governedSizePct as number) ?? (dossierState?.verdict?.trade_plan?.position_size_pct as number) ?? null;
      const stopPrice = (recCallRow?.stopPrice as number) ?? (dossierState?.verdict?.trade_plan?.stop_price as number) ?? null;
      const targetLow = (recCallRow?.targetLow as number) ?? (dossierState?.verdict?.target_price_range?.low as number) ?? null;
      const targetHigh = (recCallRow?.targetHigh as number) ?? (dossierState?.verdict?.target_price_range?.high as number) ?? null;

      results.push({
        symbol,
        qty: pos.qty,
        avgCost: pos.avgCost,
        openedAt: pos.openedAt,
        currentPrice: view.currentPrice,
        marketValue: view.marketValue,
        pnlPct: view.pnlPct,
        costBasis: view.costBasis,
        findings,
        latestVerdict: action ? {
          dossierId,
          action,
          conviction,
          governedSizePct,
          stopPrice,
          targetLow,
          targetHigh,
          what_would_change_mind: wwcm,
        } : null,
      });
    }

    return results;
  } catch (err) {
    console.error("Error loading portfolio:", err);
    return [];
  } finally {
    closeDb(db);
  }
}
