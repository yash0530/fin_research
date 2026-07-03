import { runScreen } from "@engine/screener/engine";
import { getScreenerRows } from "@/lib/screener-data";
import Link from "next/link";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  searchParams: Promise<{
    preset?: string;
  }>;
}

const PRESETS = {
  all: {
    name: "All Active Tickers",
    description: "Entire S&P universe and active list without active filters.",
    config: {
      universe: "sp500" as const,
      filters: [],
      sort: { field: "marketCap", dir: "desc" as const },
    }
  },
  ai_infra: {
    name: "AI Infra P/E < 35",
    description: "AI infrastructure universe with forward P/E under 35.",
    config: {
      universe: "ai_infra" as const,
      filters: [{ field: "forwardPE", op: "lt" as const, value: 35 }],
      sort: { field: "marketCap", dir: "desc" as const },
    }
  },
  momentum: {
    name: "52w-High Momentum",
    description: "Stocks within 5% of their 52-week high, sorted by 1-year performance.",
    config: {
      universe: "sp500" as const,
      filters: [{ field: "pctFrom52wHighPct", op: "gte" as const, value: -5 }],
      sort: { field: "yearChangePct", dir: "desc" as const },
    }
  },
  deep_value: {
    name: "Deep Value Margin Leaders",
    description: "Under-valued (P/E < 15) firms with strong profit margins (> 15%).",
    config: {
      universe: "sp500" as const,
      filters: [
        { field: "forwardPE", op: "lt" as const, value: 15 },
        { field: "profitMarginPct", op: "gt" as const, value: 15 }
      ],
      sort: { field: "forwardPE", dir: "asc" as const },
    }
  },
  growth_stars: {
    name: "Growth & Margin Stars",
    description: "Firms with over 20% revenue growth and > 10% profit margin.",
    config: {
      universe: "sp500" as const,
      filters: [
        { field: "revenueGrowthPct", op: "gt" as const, value: 20 },
        { field: "profitMarginPct", op: "gt" as const, value: 10 }
      ],
      sort: { field: "revenueGrowthPct", dir: "desc" as const },
    }
  },
  oversold_momentum: {
    name: "High Beta Pullback (RSI < 45)",
    description: "High beta stocks (> 1.2) experiencing short-term RSI cooling (< 45).",
    config: {
      universe: "sp500" as const,
      filters: [
        { field: "beta", op: "gt" as const, value: 1.2 },
        { field: "rsi", op: "lt" as const, value: 45 }
      ],
      sort: { field: "rsi", dir: "asc" as const },
    }
  },
  watchlist_value: {
    name: "Watchlist PE < 30",
    description: "Watchlisted tickers with forward P/E under 30.",
    config: {
      universe: "watchlist" as const,
      filters: [{ field: "forwardPE", op: "lt" as const, value: 30 }],
      sort: { field: "forwardPE", dir: "asc" as const },
    }
  }
};

type PresetKey = keyof typeof PRESETS;

function formatMarketCap(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toLocaleString()}`;
}

function formatSectorCode(code: string): string {
  if (code.startsWith("ai_")) {
    return "AI: " + code.slice(3).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (code.startsWith("g_")) {
    return code.slice(2).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function ScreenerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activePresetKey: PresetKey = (params.preset && PRESETS[params.preset as PresetKey]) 
    ? (params.preset as PresetKey) 
    : "all";

  const preset = PRESETS[activePresetKey];

  const startTime = performance.now();
  const allRows = await getScreenerRows();
  const res = runScreen(allRows, preset.config);
  const endTime = performance.now();
  const elapsedMs = (endTime - startTime).toFixed(1);

  // Helper to determine if a field is active in the current filters or sort
  const isFieldActive = (field: string) => {
    const isFiltered = preset.config.filters.some((f) => f.field === field);
    const isSorted = preset.config.sort?.field === field;
    return isFiltered || isSorted;
  };

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Quantitative Engine</div>
        <h1 className="story-h1">Real-Time Screener</h1>
        <p className="lead">
          Screen the backfilled universe using the engine's real metric resolvers over live SQLite data.
        </p>
      </header>

      {/* Preset buttons */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600, marginBottom: "8px" }}>
          Select Screen Preset
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
            const isActive = key === activePresetKey;
            return (
              <Link
                key={key}
                href={`/screener?preset=${key}`}
                className={`verdict-badge ${isActive ? "buy" : ""}`}
                style={{
                  textDecoration: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginTop: 0,
                  border: isActive ? "1px solid var(--accent)" : "1px solid var(--line)",
                  background: isActive ? "var(--accent-soft)" : "var(--surface)",
                  color: isActive ? "var(--accent-deep)" : "var(--ink)",
                  transition: "all 0.15s ease",
                  boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                }}
              >
                {PRESETS[key].name}
              </Link>
            );
          })}
        </div>
        <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--muted)", fontStyle: "italic" }}>
          {preset.description}
        </div>
      </div>

      {/* Metric explanation & stats */}
      <div style={{ display: "flex", justifyContent: "between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: "12px", marginBottom: "1rem" }}>
        <div className="eyebrow" style={{ fontSize: "12px", color: "var(--muted)" }}>
          {res.scanned} symbols screened in {elapsedMs}ms
        </div>
        <div className="eyebrow" style={{ fontSize: "12px", color: "var(--accent-deep)", marginLeft: "auto" }}>
          Found {res.matchedCount} matches
        </div>
      </div>

      {/* Results table */}
      {res.matched.length === 0 ? (
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
          <h2 className="story-h2">No Matches</h2>
          <p className="body" style={{ color: "var(--muted)", margin: "1rem 0" }}>
            No companies in the active database matched the criteria of this screen.
          </p>
        </div>
      ) : (
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1rem", overflowX: "auto", margin: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--line)" }}>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Symbol</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Company</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Sectors</th>
                
                {/* Dynamically styled table headers */}
                <th style={{ 
                  padding: "0.75rem 1rem", 
                  fontSize: "11px", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em", 
                  color: isFieldActive("marketCap") ? "var(--accent-deep)" : "var(--muted)", 
                  textAlign: "right",
                  background: isFieldActive("marketCap") ? "color-mix(in srgb, var(--accent-deep) 5%, transparent)" : "transparent"
                }}>Mkt Cap</th>
                
                <th style={{ 
                  padding: "0.75rem 1rem", 
                  fontSize: "11px", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em", 
                  color: isFieldActive("forwardPE") ? "var(--accent-deep)" : "var(--muted)", 
                  textAlign: "right",
                  background: isFieldActive("forwardPE") ? "color-mix(in srgb, var(--accent-deep) 5%, transparent)" : "transparent"
                }}>Fwd P/E</th>

                <th style={{ 
                  padding: "0.75rem 1rem", 
                  fontSize: "11px", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em", 
                  color: isFieldActive("trailingPE") ? "var(--accent-deep)" : "var(--muted)", 
                  textAlign: "right",
                  background: isFieldActive("trailingPE") ? "color-mix(in srgb, var(--accent-deep) 5%, transparent)" : "transparent"
                }}>Trl P/E</th>

                <th style={{ 
                  padding: "0.75rem 1rem", 
                  fontSize: "11px", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em", 
                  color: isFieldActive("revenueGrowthPct") ? "var(--accent-deep)" : "var(--muted)", 
                  textAlign: "right",
                  background: isFieldActive("revenueGrowthPct") ? "color-mix(in srgb, var(--accent-deep) 5%, transparent)" : "transparent"
                }}>Rev Growth</th>

                <th style={{ 
                  padding: "0.75rem 1rem", 
                  fontSize: "11px", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em", 
                  color: isFieldActive("profitMarginPct") ? "var(--accent-deep)" : "var(--muted)", 
                  textAlign: "right",
                  background: isFieldActive("profitMarginPct") ? "color-mix(in srgb, var(--accent-deep) 5%, transparent)" : "transparent"
                }}>Profit Margin</th>

                <th style={{ 
                  padding: "0.75rem 1rem", 
                  fontSize: "11px", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em", 
                  color: isFieldActive("beta") ? "var(--accent-deep)" : "var(--muted)", 
                  textAlign: "right",
                  background: isFieldActive("beta") ? "color-mix(in srgb, var(--accent-deep) 5%, transparent)" : "transparent"
                }}>Beta</th>

                <th style={{ 
                  padding: "0.75rem 1rem", 
                  fontSize: "11px", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em", 
                  color: isFieldActive("yearChangePct") ? "var(--accent-deep)" : "var(--muted)", 
                  textAlign: "right",
                  background: isFieldActive("yearChangePct") ? "color-mix(in srgb, var(--accent-deep) 5%, transparent)" : "transparent"
                }}>1y Change</th>

                <th style={{ 
                  padding: "0.75rem 1rem", 
                  fontSize: "11px", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em", 
                  color: isFieldActive("rsi") ? "var(--accent-deep)" : "var(--muted)", 
                  textAlign: "right",
                  background: isFieldActive("rsi") ? "color-mix(in srgb, var(--accent-deep) 5%, transparent)" : "transparent"
                }}>RSI(14)</th>

                <th style={{ 
                  padding: "0.75rem 1rem", 
                  fontSize: "11px", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em", 
                  color: isFieldActive("pctFrom52wHighPct") ? "var(--accent-deep)" : "var(--muted)", 
                  textAlign: "right",
                  background: isFieldActive("pctFrom52wHighPct") ? "color-mix(in srgb, var(--accent-deep) 5%, transparent)" : "transparent"
                }}>from 52wH</th>
              </tr>
            </thead>
            <tbody>
              {res.matched.map((row) => {
                const castRow = row as typeof allRows[number];
                const isPosYear = castRow.yearChangePct != null && castRow.yearChangePct >= 0;
                const isPosRev = castRow.revenueGrowthPct != null && castRow.revenueGrowthPct >= 0;
                const isPosMargin = castRow.profitMarginPct != null && castRow.profitMarginPct >= 0;
                const isRsiOverbought = castRow.rsi != null && castRow.rsi >= 70;
                const isRsiOversold = castRow.rsi != null && castRow.rsi <= 30;

                return (
                  <tr key={castRow.symbol} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: 700, fontSize: "15px" }}>
                      <Link href={`/tickers/${castRow.symbol}`} style={{ color: "var(--accent-deep)", textDecoration: "none" }}>
                        {castRow.symbol}
                      </Link>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "13px", color: "var(--ink)", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {castRow.name ?? "—"}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "12px" }}>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {castRow.gicsCode && (
                          <span style={{
                            fontSize: "9px",
                            padding: "1px 5px",
                            borderRadius: "4px",
                            fontWeight: 500,
                            background: "var(--surface-2)",
                            color: "var(--muted)",
                            border: "1px solid var(--line)"
                          }}>
                            {formatSectorCode(castRow.gicsCode)}
                          </span>
                        )}
                        {castRow.aiCodes.map((ai) => (
                          <span key={ai} style={{
                            fontSize: "9px",
                            padding: "1px 5px",
                            borderRadius: "4px",
                            fontWeight: 500,
                            background: "var(--accent-soft)",
                            color: "var(--accent-deep)",
                            border: "1px solid color-mix(in srgb, var(--accent-deep) 20%, transparent)"
                          }}>
                            {formatSectorCode(ai)}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Columns styled if active */}
                    <td style={{ 
                      padding: "0.75rem 1rem", 
                      fontSize: "13px", 
                      fontFamily: "var(--fmono)", 
                      textAlign: "right",
                      background: isFieldActive("marketCap") ? "color-mix(in srgb, var(--accent-deep) 3%, transparent)" : "transparent"
                    }}>
                      {formatMarketCap(castRow.marketCap)}
                    </td>

                    <td style={{ 
                      padding: "0.75rem 1rem", 
                      fontSize: "13px", 
                      fontFamily: "var(--fmono)", 
                      textAlign: "right",
                      background: isFieldActive("forwardPE") ? "color-mix(in srgb, var(--accent-deep) 3%, transparent)" : "transparent"
                    }}>
                      {castRow.forwardPE != null ? castRow.forwardPE.toFixed(1) : "—"}
                    </td>

                    <td style={{ 
                      padding: "0.75rem 1rem", 
                      fontSize: "13px", 
                      fontFamily: "var(--fmono)", 
                      textAlign: "right",
                      background: isFieldActive("trailingPE") ? "color-mix(in srgb, var(--accent-deep) 3%, transparent)" : "transparent"
                    }}>
                      {castRow.trailingPE != null ? castRow.trailingPE.toFixed(1) : "—"}
                    </td>

                    <td style={{ 
                      padding: "0.75rem 1rem", 
                      fontSize: "13px", 
                      fontFamily: "var(--fmono)", 
                      textAlign: "right",
                      color: castRow.revenueGrowthPct == null ? "var(--muted)" : isPosRev ? "var(--pos)" : "var(--neg)",
                      background: isFieldActive("revenueGrowthPct") ? "color-mix(in srgb, var(--accent-deep) 3%, transparent)" : "transparent"
                    }}>
                      {castRow.revenueGrowthPct != null ? `${isPosRev ? "+" : ""}${castRow.revenueGrowthPct.toFixed(1)}%` : "—"}
                    </td>

                    <td style={{ 
                      padding: "0.75rem 1rem", 
                      fontSize: "13px", 
                      fontFamily: "var(--fmono)", 
                      textAlign: "right",
                      color: castRow.profitMarginPct == null ? "var(--muted)" : isPosMargin ? "var(--ink)" : "var(--neg)",
                      background: isFieldActive("profitMarginPct") ? "color-mix(in srgb, var(--accent-deep) 3%, transparent)" : "transparent"
                    }}>
                      {castRow.profitMarginPct != null ? `${castRow.profitMarginPct.toFixed(1)}%` : "—"}
                    </td>

                    <td style={{ 
                      padding: "0.75rem 1rem", 
                      fontSize: "13px", 
                      fontFamily: "var(--fmono)", 
                      textAlign: "right",
                      background: isFieldActive("beta") ? "color-mix(in srgb, var(--accent-deep) 3%, transparent)" : "transparent"
                    }}>
                      {castRow.beta != null ? castRow.beta.toFixed(2) : "—"}
                    </td>

                    <td style={{ 
                      padding: "0.75rem 1rem", 
                      fontSize: "13px", 
                      fontFamily: "var(--fmono)", 
                      textAlign: "right",
                      color: castRow.yearChangePct == null ? "var(--muted)" : isPosYear ? "var(--pos)" : "var(--neg)",
                      background: isFieldActive("yearChangePct") ? "color-mix(in srgb, var(--accent-deep) 3%, transparent)" : "transparent"
                    }}>
                      {castRow.yearChangePct != null ? `${isPosYear ? "+" : ""}${castRow.yearChangePct.toFixed(1)}%` : "—"}
                    </td>

                    <td style={{ 
                      padding: "0.75rem 1rem", 
                      fontSize: "13px", 
                      fontFamily: "var(--fmono)", 
                      textAlign: "right",
                      fontWeight: (isRsiOverbought || isRsiOversold) ? 600 : 400,
                      color: isRsiOverbought ? "var(--neg)" : isRsiOversold ? "var(--pos)" : "var(--ink)",
                      background: isFieldActive("rsi") ? "color-mix(in srgb, var(--accent-deep) 3%, transparent)" : "transparent"
                    }}>
                      {castRow.rsi != null ? castRow.rsi.toFixed(1) : "—"}
                    </td>

                    <td style={{ 
                      padding: "0.75rem 1rem", 
                      fontSize: "13px", 
                      fontFamily: "var(--fmono)", 
                      textAlign: "right",
                      color: castRow.pctFrom52wHighPct == null ? "var(--muted)" : "var(--neg)",
                      background: isFieldActive("pctFrom52wHighPct") ? "color-mix(in srgb, var(--accent-deep) 3%, transparent)" : "transparent"
                    }}>
                      {castRow.pctFrom52wHighPct != null ? `${castRow.pctFrom52wHighPct.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
