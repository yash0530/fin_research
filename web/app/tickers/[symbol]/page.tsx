import { tickerDetail, getFilingUrl } from "@/lib/ticker-data";
import { Panel } from "@/components/ui/Panel";
import { BandBar } from "@/components/ui/BandBar";
import { ScoreChip } from "@/components/ui/ScoreChip";
import { DenseTable, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/DenseTable";
import { Badge } from "@/components/ui/Badge";
import { SectionNav } from "@/components/ui/SectionNav";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { TierTag } from "@/components/ui/TierTag";
import Link from "next/link";
import CandleChart from "@/components/CandleChart";
import { WatchlistButton } from "@/components/WatchlistButton";
import { InversionChecklistForm } from "@/components/InversionChecklistForm";
import { ResearchRunDrawer } from "@/components/ResearchRunDrawer";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Props {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ range?: string }>;
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

function formatMarketCap(val: number | null): string {
  if (val === null || val === undefined) return "—";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toLocaleString()}`;
}

function formatFinancialAmount(val: number | null): string {
  if (val === null || val === undefined) return "—";
  const abs = Math.abs(val);
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default async function TickerDetailPage({ params, searchParams }: Props) {
  const { symbol } = await params;
  const { range } = await searchParams;
  const validRanges = ["3m", "1y", "3y", "10y"];
  const activeRange = range && validRanges.includes(range.toLowerCase()) ? range.toLowerCase() : "1y";

  const detail = await tickerDetail(symbol.toUpperCase(), activeRange);

  if (!detail) {
    return (
      <div className="story-page" style={{ padding: "40px 24px" }}>
        <header className="hero" style={{ textAlign: "center", marginBottom: "40px" }}>
          <div className="eyebrow" style={{ justifyContent: "center" }}>Workstation Error</div>
          <h1 className="story-h1">Ticker {symbol.toUpperCase()} Not Found</h1>
          <p className="lead" style={{ margin: "0 auto 24px", maxWidth: "600px" }}>
            This asset does not exist in the local SQLite database.
          </p>
        </header>

        <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h2 className="story-h2">Populate this ticker</h2>
          <p className="body" style={{ margin: '1rem 0' }}>
            Run the discovery and backfill commands to fetch market data and populate the database tables:
          </p>
          <pre style={{
            background: 'var(--inset)',
            color: 'var(--ink)',
            padding: '12px',
            borderRadius: '6px',
            fontFamily: 'var(--fmono)',
            fontSize: '14px',
            overflowX: 'auto',
            border: '1px solid var(--line)',
            textAlign: 'left',
            marginBottom: '1rem'
          }}>
            npm run job -- backfill --task=prices10y --symbol={symbol.toUpperCase()}
          </pre>
        </div>
      </div>
    );
  }

  // Calculate change details for the header
  const priceCount = detail.priceSeries.length;
  const latestPrice = priceCount > 0 ? detail.priceSeries[priceCount - 1] : null;
  const prevPrice = priceCount > 1 ? detail.priceSeries[priceCount - 2] : null;
  let pctChange1d: number | null = null;
  if (latestPrice && prevPrice && prevPrice.close > 0) {
    pctChange1d = ((latestPrice.close - prevPrice.close) / prevPrice.close) * 100;
  }
  const isPos = pctChange1d !== null && pctChange1d >= 0;

  // Compile event glyphs for CandleChart
  const chartEvents = [
    ...detail.insiderTxs.map(tx => ({
      type: "insider" as const,
      date: tx.txDate,
      value: tx.value,
      label: `${tx.filerName} (${tx.filerRole}) ${tx.code} ${tx.shares.toLocaleString()} shares @ $${tx.price.toFixed(2)} ($${(tx.value/1e3).toFixed(1)}k)`
    })),
    ...detail.filings.filter(f => f.form === "10-K" || f.form === "10-Q").map(f => ({
      type: "earnings" as const,
      date: f.filedAt,
      label: `${f.form} Filed CIK: ${f.cik}`
    })),
    ...detail.recCalls.map(rc => ({
      type: "journal" as const,
      date: rc.createdAt.slice(0, 10),
      label: `Rec Call: ${rc.action} (${rc.conviction}) @ $${rc.priceAtCall}`
    }))
  ];

  // Inversion checklist frozen payload
  const decisionPayload = {
    symbol: detail.symbol,
    currentPrice: latestPrice?.close ?? null,
    buyUnder: detail.buyUnder,
    fscore: detail.screens.fscore.score,
    accruals: detail.screens.accruals.value,
    dilution: detail.screens.dilution.value,
    earningsTrend: detail.screens.earningsTrend.verdict,
    valuationVerdict: detail.valuationHistory?.verdict ?? "suspended",
  };

  // Sections list for anchor navigation
  const navSections = [
    { id: "cockpit", label: "Asset Cockpit" },
    { id: "chart", label: "Interactive Chart" },
    { id: "valuation", label: "Valuation corridor" },
    { id: "fundamentals", label: "Fundamentals" },
    { id: "filings", label: "SEC Filings" },
    { id: "consensus", label: "Research Consensus" },
    { id: "journal", label: "Journal & Inversion" },
  ];

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      {/* Header Banner */}
      <header className="hero" style={{ borderBottom: '1px solid var(--border-dim)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="kicker" style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{detail.symbol}</span>
              <WatchlistButton symbol={detail.symbol} initialWatchlisted={detail.watchlisted} />
              {detail.tier && <TierTag tier={detail.tier as any} />}
            </div>
            <h1 className="story-h1" style={{ margin: '8px 0 12px 0' }}>{detail.name ?? detail.symbol}</h1>
            
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
              {detail.sectors.map((sec) => {
                const isAi = sec.taxonomy === "ai_infra";
                return (
                  <span
                    key={sec.code}
                    className={`verdict-badge ${isAi ? "buy" : ""}`}
                    style={{
                      margin: 0,
                      fontSize: '11px',
                      padding: '4px 10px',
                      background: isAi ? 'var(--accent-soft)' : 'var(--surface-2)',
                      color: isAi ? 'var(--accent-deep)' : 'var(--muted)',
                      border: `1px solid ${isAi ? 'color-mix(in srgb, var(--accent-deep) 20%, transparent)' : 'var(--border-dim)'}`
                    }}
                    title={`${sec.name} (${sec.taxonomy.toUpperCase()})`}
                  >
                    {formatSectorCode(sec.code)}
                  </span>
                );
              })}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: '4px' }}>Last Close Price</div>
            <div className="story-h1" style={{ margin: 0, fontFamily: 'var(--fdisp)', fontSize: '3.2rem', fontWeight: 600 }}>
              {latestPrice ? `$${latestPrice.close.toFixed(2)}` : "—"}
            </div>
            {pctChange1d !== null && (
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '15px',
                fontWeight: 600,
                color: isPos ? 'var(--green-text)' : 'var(--red-text)',
                marginTop: '4px'
              }}>
                {isPos ? "+" : ""}
                {pctChange1d.toFixed(2)}% (1d)
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Grid Layout: 9fr Main scroll + 3fr Sticky Sidebar */}
      <div className="ticker-grid">
        <main className="ticker-main-scroll">
          
          {/* Section 1: Cockpit */}
          <section id="cockpit" className="flex flex-col gap-4">
            <h2 className="story-h2" style={{ borderBottom: "1px solid var(--border-dim)", paddingBottom: "8px", margin: 0 }}>
              Workstation Cockpit
            </h2>
            <div className="grid grid-cols-2 gap-4">
              
              {/* Q1: Buy Zone */}
              <Panel className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="ui-stat-label">BUY-ZONE?</span>
                  <Badge variant={detail.valuationHistory?.verdict === "cheap" ? "success" : detail.valuationHistory?.verdict === "rich" ? "danger" : "neutral"}>
                    {detail.valuationHistory?.verdict?.toUpperCase() ?? "SUSPENDED"}
                  </Badge>
                </div>
                {detail.valuationHistory?.bands?.pe && latestPrice ? (
                  <div className="flex flex-col gap-2">
                    <div style={{ fontSize: "11px", color: "var(--fg-secondary)" }}>
                      Current P/E: <strong>{detail.valuationHistory.current?.pe?.toFixed(1) ?? "—"}x</strong>
                    </div>
                    <BandBar
                      current={detail.valuationHistory.current?.pe ?? 0}
                      low={detail.valuationHistory.bands.pe.low2}
                      high={detail.valuationHistory.bands.pe.high2}
                      buyUnder={detail.buyUnder}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">Valuation Bands Suspended</Badge>
                    <span style={{ fontSize: "10px", color: "var(--fg-muted)" }}>Missing P/E multiple inputs</span>
                  </div>
                )}
              </Panel>

              {/* Q2: Quality */}
              <Panel className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="ui-stat-label">QUALITY?</span>
                  <ScoreChip score={detail.screens.fscore.score} max={detail.screens.fscore.maxComputable} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {detail.screens.accruals.verdict !== "unknown" ? (
                    <Badge variant={detail.screens.accruals.verdict === "pass" ? "success" : detail.screens.accruals.verdict === "warn" ? "warning" : "danger"}>
                      Sloan: {detail.screens.accruals.value ? `${(detail.screens.accruals.value * 100).toFixed(1)}%` : "—"}
                    </Badge>
                  ) : (
                    <Badge variant="warning">Missing Sloan</Badge>
                  )}

                  {detail.screens.dilution.verdict !== "unknown" ? (
                    <Badge variant={detail.screens.dilution.verdict === "pass" ? "success" : "danger"}>
                      Dilution: {detail.screens.dilution.value ? `${detail.screens.dilution.value.toFixed(1)}%` : "—"}
                    </Badge>
                  ) : (
                    <Badge variant="warning">Missing Dilution</Badge>
                  )}

                  {detail.screenWarnings.length > 0 && (
                    <Badge variant="warning" title={detail.screenWarnings.join("; ")}>
                      {detail.screenWarnings.length} data gap{detail.screenWarnings.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </Panel>

              {/* Q3: Why Now */}
              <Panel className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="ui-stat-label">WHY NOW?</span>
                  <Badge variant={detail.screens.earningsTrend.verdict.startsWith("improving") ? "success" : detail.screens.earningsTrend.verdict === "deteriorating" ? "danger" : "neutral"}>
                    {detail.screens.earningsTrend.verdict.replace(/([A-Z])/g, ' $1').toUpperCase()}
                  </Badge>
                </div>
                <div className="flex flex-col gap-1">
                  {detail.screens.insiderCluster.clustered ? (
                    <div style={{ fontSize: "11px", color: "var(--accent-gold)", fontWeight: 600 }}>
                      ⚠️ INSIDER CLUSTER: {detail.screens.insiderCluster.insiders.length} buyers (${(detail.screens.insiderCluster.totalValue / 1e3).toFixed(0)}k ttm)
                    </div>
                  ) : (
                    <div style={{ fontSize: "11px", color: "var(--fg-muted)" }}>No structural insider buying cluster</div>
                  )}
                  {detail.filingEvents.length > 0 ? (
                    <div style={{ fontSize: "10px", color: "var(--fg-secondary)" }}>
                      Latest filing: <strong>{detail.filingEvents[0].form}</strong> ({formatDate(detail.filingEvents[0].filedAt)})
                    </div>
                  ) : (
                    <div style={{ fontSize: "10px", color: "var(--fg-muted)" }}>No recent structural 8-K filings</div>
                  )}
                </div>
              </Panel>

              {/* Q4: What Kills It */}
              <div
                className="panel flex flex-col gap-3"
                style={{
                  background: "var(--red-bg)",
                  borderColor: "var(--red-border)",
                  color: "var(--red-text)",
                  margin: "8px 0"
                }}
              >
                <span className="ui-stat-label" style={{ color: "var(--red-text)" }}>WHAT KILLS IT?</span>
                <div className="flex flex-col gap-1" style={{ fontSize: "11px" }}>
                  {detail.activeTripwires.length > 0 ? (
                    detail.activeTripwires.map((trip: any, idx: number) => (
                      <div key={idx} style={{ fontWeight: 600 }}>
                        🚨 [{String(trip.severity ?? "warn").toUpperCase()}] {trip.message}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "var(--red-text)", opacity: 0.8 }}>No active structural tripwire metrics triggered.</div>
                  )}
                  {detail.disconfirming ? (
                    <div style={{ marginTop: "6px", borderTop: "1px solid var(--red-border)", paddingTop: "4px" }}>
                      <strong>Disconfirming:</strong> {detail.disconfirming}
                    </div>
                  ) : (
                    <div style={{ marginTop: "6px", opacity: 0.6, fontSize: "10px" }}>No custom invalidation checklist logged yet.</div>
                  )}
                </div>
              </div>

            </div>
          </section>

          {/* Section 2: Interactive Chart */}
          <section id="chart">
            <h2 className="story-h2" style={{ borderBottom: "1px solid var(--border-dim)", paddingBottom: "8px", margin: "16px 0 0 0" }}>
              Technical Charts & Pane Math
            </h2>
            <CandleChart priceSeries={detail.priceSeries} events={chartEvents} />
          </section>

          {/* Section 3: Valuation Corridor Ladder */}
          <section id="valuation" className="flex flex-col gap-3">
            <h2 className="story-h2" style={{ borderBottom: "1px solid var(--border-dim)", paddingBottom: "8px", margin: "16px 0 0 0" }}>
              Valuation Corridor Ladder
            </h2>
            {detail.valuationHistory?.bands ? (
              <div className="flex flex-col gap-2">
                <DenseTable>
                  <TableHead>
                    <TableRow>
                      <TableCell isHeader>VALUATION MULTIPLE</TableCell>
                      <TableCell isHeader numeric>CURRENT VALUE</TableCell>
                      <TableCell isHeader numeric>5Y BEAR BAND (-2 MAD)</TableCell>
                      <TableCell isHeader numeric>5Y HIST MEDIAN</TableCell>
                      <TableCell isHeader numeric>5Y BULL BAND (+2 MAD)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* PE */}
                    {detail.valuationHistory.bands.pe && (
                      <TableRow>
                        <TableCell>P/E (Price-to-Earnings)</TableCell>
                        <TableCell numeric style={{ fontWeight: 700 }}>
                          {detail.valuationHistory.current?.pe ? `${detail.valuationHistory.current.pe.toFixed(1)}x` : "—"}
                        </TableCell>
                        <TableCell numeric>{detail.valuationHistory.bands.pe.low2.toFixed(1)}x</TableCell>
                        <TableCell numeric>{detail.valuationHistory.bands.pe.median.toFixed(1)}x</TableCell>
                        <TableCell numeric>{detail.valuationHistory.bands.pe.high2.toFixed(1)}x</TableCell>
                      </TableRow>
                    )}

                    {/* FCF */}
                    {detail.valuationHistory.bands.pfcf && (
                      <TableRow>
                        <TableCell>P/FCF (Price-to-Free Cash Flow)</TableCell>
                        <TableCell numeric style={{ fontWeight: 700 }}>
                          {detail.valuationHistory.current?.pfcf ? `${detail.valuationHistory.current.pfcf.toFixed(1)}x` : "—"}
                        </TableCell>
                        <TableCell numeric>{detail.valuationHistory.bands.pfcf.low2.toFixed(1)}x</TableCell>
                        <TableCell numeric>{detail.valuationHistory.bands.pfcf.median.toFixed(1)}x</TableCell>
                        <TableCell numeric>{detail.valuationHistory.bands.pfcf.high2.toFixed(1)}x</TableCell>
                      </TableRow>
                    )}

                    {/* PS */}
                    {detail.valuationHistory.bands.ps && (
                      <TableRow>
                        <TableCell>P/S (Price-to-Sales)</TableCell>
                        <TableCell numeric style={{ fontWeight: 700 }}>
                          {detail.valuationHistory.current?.ps ? `${detail.valuationHistory.current.ps.toFixed(1)}x` : "—"}
                        </TableCell>
                        <TableCell numeric>{detail.valuationHistory.bands.ps.low2.toFixed(1)}x</TableCell>
                        <TableCell numeric>{detail.valuationHistory.bands.ps.median.toFixed(1)}x</TableCell>
                        <TableCell numeric>{detail.valuationHistory.bands.ps.high2.toFixed(1)}x</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </DenseTable>
                {detail.valuationHistory.verdict === "suspended" && (
                  <div style={{ alignSelf: "flex-start", marginTop: "8px" }}>
                    <Badge variant="warning">
                      Notice: Valuation bands are suspended due to insufficient multiple data.
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="Valuation Corridors" body="No valuation multiple history backfilled to compile bands." />
            )}
          </section>

          {/* Section 4: Fundamentals */}
          <section id="fundamentals" className="flex flex-col gap-3">
            <h2 className="story-h2" style={{ borderBottom: "1px solid var(--border-dim)", paddingBottom: "8px", margin: "16px 0 0 0" }}>
              Quarterly Financials & Accrual Quality
            </h2>
            {detail.quarters.length > 0 ? (
              <div className="flex flex-col gap-4">
                <DenseTable>
                  <TableHead>
                    <TableRow>
                      <TableCell isHeader>QUARTER END</TableCell>
                      <TableCell isHeader numeric>REVENUE</TableCell>
                      <TableCell isHeader numeric>GROSS MARGIN</TableCell>
                      <TableCell isHeader numeric>OP MARGIN</TableCell>
                      <TableCell isHeader numeric>NET INCOME</TableCell>
                      <TableCell isHeader numeric>FCF</TableCell>
                      <TableCell isHeader numeric>SLOAN ACCRUAL</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.quarters.slice(0, 12).map((q) => {
                      const accrual = (q.netIncome !== null && q.cfo !== null && q.totalAssets !== null && q.totalAssets > 0)
                        ? (q.netIncome - q.cfo) / q.totalAssets
                        : null;
                      const isAccrualAnomalous = accrual !== null && Math.abs(accrual) > 0.1;
                      const isFcfDivergent = q.fcf !== null && q.netIncome !== null && q.fcf < 0 && q.netIncome > 0;
                      const isGrossAnomalous = q.grossMargin !== null && q.grossMargin < 0;

                      return (
                        <TableRow key={q.periodEnd}>
                          <TableCell style={{ fontWeight: 600 }}>{q.periodEnd}</TableCell>
                          <TableCell numeric>{formatFinancialAmount(q.revenue)}</TableCell>
                          <TableCell
                            numeric
                            style={{
                              background: isGrossAnomalous ? "var(--amber-bg)" : undefined,
                              color: isGrossAnomalous ? "var(--amber-text)" : undefined,
                              fontWeight: isGrossAnomalous ? 600 : undefined
                            }}
                          >
                            {q.grossMargin !== null ? `${q.grossMargin.toFixed(1)}%` : "—"}
                          </TableCell>
                          <TableCell numeric>{q.operatingMargin !== null ? `${q.operatingMargin.toFixed(1)}%` : "—"}</TableCell>
                          <TableCell numeric>{formatFinancialAmount(q.netIncome)}</TableCell>
                          <TableCell
                            numeric
                            style={{
                              background: isFcfDivergent ? "var(--amber-bg)" : undefined,
                              color: isFcfDivergent ? "var(--amber-text)" : undefined,
                              fontWeight: isFcfDivergent ? 600 : undefined
                            }}
                          >
                            {formatFinancialAmount(q.fcf)}
                          </TableCell>
                          <TableCell
                            numeric
                            style={{
                              background: isAccrualAnomalous ? "var(--amber-bg)" : undefined,
                              color: isAccrualAnomalous ? "var(--amber-text)" : undefined,
                              fontWeight: isAccrualAnomalous ? 600 : undefined
                            }}
                          >
                            {accrual !== null ? `${(accrual * 100).toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </DenseTable>

                {detail.quarters.length > 12 && (
                  <Disclosure title={`Show Full History (${detail.quarters.length - 12} additional quarters)`}>
                    <DenseTable>
                      <TableBody>
                        {detail.quarters.slice(12, 40).map((q) => {
                          const accrual = (q.netIncome !== null && q.cfo !== null && q.totalAssets !== null && q.totalAssets > 0)
                            ? (q.netIncome - q.cfo) / q.totalAssets
                            : null;
                          const isAccrualAnomalous = accrual !== null && Math.abs(accrual) > 0.1;
                          const isFcfDivergent = q.fcf !== null && q.netIncome !== null && q.fcf < 0 && q.netIncome > 0;
                          const isGrossAnomalous = q.grossMargin !== null && q.grossMargin < 0;

                          return (
                            <TableRow key={q.periodEnd}>
                              <TableCell style={{ fontWeight: 600 }}>{q.periodEnd}</TableCell>
                              <TableCell numeric>{formatFinancialAmount(q.revenue)}</TableCell>
                              <TableCell
                                numeric
                                style={{
                                  background: isGrossAnomalous ? "var(--amber-bg)" : undefined,
                                  color: isGrossAnomalous ? "var(--amber-text)" : undefined,
                                  fontWeight: isGrossAnomalous ? 600 : undefined
                                }}
                              >
                                {q.grossMargin !== null ? `${q.grossMargin.toFixed(1)}%` : "—"}
                              </TableCell>
                              <TableCell numeric>{q.operatingMargin !== null ? `${q.operatingMargin.toFixed(1)}%` : "—"}</TableCell>
                              <TableCell numeric>{formatFinancialAmount(q.netIncome)}</TableCell>
                              <TableCell
                                numeric
                                style={{
                                  background: isFcfDivergent ? "var(--amber-bg)" : undefined,
                                  color: isFcfDivergent ? "var(--amber-text)" : undefined,
                                  fontWeight: isFcfDivergent ? 600 : undefined
                                }}
                              >
                                {formatFinancialAmount(q.fcf)}
                              </TableCell>
                              <TableCell
                                numeric
                                style={{
                                  background: isAccrualAnomalous ? "var(--amber-bg)" : undefined,
                                  color: isAccrualAnomalous ? "var(--amber-text)" : undefined,
                                  fontWeight: isAccrualAnomalous ? 600 : undefined
                                }}
                              >
                                {accrual !== null ? `${(accrual * 100).toFixed(1)}%` : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </DenseTable>
                  </Disclosure>
                )}
              </div>
            ) : (
              <EmptyState title="Fundamental Quarters" body="No fundamental records populated. Run backfill fundamentals script." />
            )}
          </section>

          {/* Section 5: SEC Filings */}
          <section id="filings" className="flex flex-col gap-4">
            <h2 className="story-h2" style={{ borderBottom: "1px solid var(--border-dim)", paddingBottom: "8px", margin: "16px 0 0 0" }}>
              Classified SEC Filings & Severity
            </h2>
            
            {detail.filingEvents.filter((e: any) => e.kind !== "filing-diff").length > 0 ? (
              <div className="flex flex-col gap-2">
                {detail.filingEvents.filter((e: any) => e.kind !== "filing-diff").map((evt) => {
                  const isCritical = evt.item === "4.02" || evt.severity === "critical";
                  const badgeVariant = isCritical
                    ? "critical"
                    : evt.severity === "high"
                    ? "danger"
                    : evt.severity === "medium"
                    ? "warning"
                    : "neutral";

                  return (
                    <div className="panel" key={evt.id} style={{ border: "1px solid var(--border-dim)", padding: "12px", background: "var(--bg-surface)", margin: "8px 0" }}>
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={badgeVariant}>
                              {evt.form} - Item {evt.item}
                            </Badge>
                            <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>{formatDate(evt.filedAt)}</span>
                          </div>
                          <h4 style={{ fontSize: "13px", fontWeight: 600, marginTop: "6px", color: "var(--fg-primary)" }}>{evt.headline}</h4>
                          <p style={{ fontSize: "11px", color: "var(--fg-secondary)", margin: "4px 0 0 0" }}>{evt.snippet}</p>
                        </div>
                        <a
                          href={getFilingUrl(detail.cik || "", evt.accessionNo, "doc.html")}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "11px", color: "var(--accent-blue)" }}
                        >
                          View SEC Document ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="SEC Filings Monitor" body="No structural 8-K / filing events logged for this ticker." />
            )}

            {/* 10-K/Q Diff monitor — FilingEvent rows kind "filing-diff" written by the filing_diff research run */}
            <div style={{ marginTop: "8px" }} className="flex flex-col gap-2">
              <h3 className="story-h2" style={{ fontSize: "0.85rem", textTransform: "uppercase" }}>10-K/Q Diff Monitor</h3>
              {detail.filingEvents.filter((e: any) => e.kind === "filing-diff").length > 0 ? (
                detail.filingEvents
                  .filter((e: any) => e.kind === "filing-diff")
                  .map((evt: any) => {
                    const diffVariant =
                      evt.severity === "thesis-relevant" ? "critical" : evt.severity === "notable" ? "warning" : "neutral";
                    return (
                      <div className="panel" key={evt.id} style={{ border: "1px solid var(--border-dim)", padding: "12px", background: "var(--bg-surface)", margin: "4px 0" }}>
                        <div className="flex items-center gap-2">
                          <Badge variant={diffVariant}>{evt.severity.toUpperCase()}</Badge>
                          <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>{formatDate(evt.filedAt)} · {evt.accessionNo}</span>
                        </div>
                        <h4 style={{ fontSize: "13px", fontWeight: 600, marginTop: "6px", color: "var(--fg-primary)" }}>{evt.headline}</h4>
                        <p style={{ fontSize: "11px", color: "var(--fg-secondary)", margin: "4px 0 0 0" }}>{evt.snippet}</p>
                      </div>
                    );
                  })
              ) : (
                <EmptyState
                  title="10-K/Q Diff Monitor"
                  body="No filing diffs yet — launch a filing-diff research run to compare this name's two most recent 10-K/10-Q filings."
                />
              )}
            </div>
          </section>

          {/* Section 6: Research Consensus */}
          <section id="consensus" className="flex flex-col gap-4">
            <h2 className="story-h2" style={{ borderBottom: "1px solid var(--border-dim)", paddingBottom: "8px", margin: "16px 0 0 0" }}>
              Research Consensus Dossiers
            </h2>

            {/* Verdict consensus card */}
            {detail.dossiers.length > 0 && detail.dossiers[0].verdict ? (
              <div className="panel" style={{ border: "1px solid var(--border-muted)", background: "var(--bg-surface)", padding: "16px", margin: "8px 0" }}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="story-h1" style={{ margin: 0 }}>consensus dossier recommendation</h3>
                    <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "4px" }}>
                      Updated: {new Date(detail.dossiers[0].updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant={detail.dossiers[0].verdict.recommendation === "BUY" ? "success" : detail.dossiers[0].verdict.recommendation === "AVOID" ? "danger" : "warning"}>
                    {detail.dossiers[0].verdict.recommendation} ({detail.dossiers[0].verdict.conviction})
                  </Badge>
                </div>
                <p style={{ fontSize: "13px", marginTop: "12px", color: "var(--fg-primary)", lineHeight: 1.5 }}>
                  {detail.dossiers[0].verdict.summary}
                </p>

                {/* Transcript Disclosure */}
                <div style={{ marginTop: "12px" }}>
                  <Disclosure title="Inspect Full Dossier Transcript">
                    <div
                      style={{
                        background: "var(--bg-app)",
                        padding: "12px",
                        border: "1px solid var(--border-dim)",
                        borderRadius: "var(--panel-radius)",
                        whiteSpace: "pre-wrap",
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                        maxHeight: "350px",
                        overflowY: "auto",
                      }}
                    >
                      {detail.dossiers[0].verdict.summary}
                      {"\n\n[Debate transcript available via agy cli deep-dives]"}
                    </div>
                  </Disclosure>
                </div>
              </div>
            ) : (
              <EmptyState title="Consensus Verdict" body="No agentic consensus verdict created yet. Trigger a background research run." />
            )}

            {/* Research run logs */}
            <div className="flex flex-col gap-2">
              <h3 className="story-h2" style={{ fontSize: "0.85rem", textTransform: "uppercase" }}>Research Run History</h3>
              {detail.researchRuns.length > 0 ? (
                <DenseTable>
                  <TableHead>
                    <TableRow>
                      <TableCell isHeader>RUN ID</TableCell>
                      <TableCell isHeader>TYPE</TableCell>
                      <TableCell isHeader>STATUS</TableCell>
                      <TableCell isHeader numeric>DURATION</TableCell>
                      <TableCell isHeader>ARTIFACT</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.researchRuns.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{run.id}</TableCell>
                        <TableCell>{run.runType}</TableCell>
                        <TableCell>
                          <Badge variant={run.status === "COMPLETED" ? "success" : run.status === "FAILED" ? "danger" : "warning"}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell numeric>{run.elapsedSeconds}s / {run.budgetSeconds}s</TableCell>
                        <TableCell style={{ fontSize: "11px" }}>
                          {run.artifactPath ? (
                            <a href={`file://${run.artifactPath}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-blue)" }}>
                              inspect artifact ↗
                            </a>
                          ) : (
                            <span style={{ color: "var(--fg-dim)" }}>none</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DenseTable>
              ) : (
                <div style={{ fontStyle: "italic", fontSize: "11px", color: "var(--fg-muted)" }}>No background runs recorded.</div>
              )}
            </div>
          </section>

          {/* Section 7: Inversion checklist form */}
          <section id="journal">
            <h2 className="story-h2" style={{ borderBottom: "1px solid var(--border-dim)", paddingBottom: "8px", margin: "16px 0 0 0" }}>
              Timeline & Checklist Inversion
            </h2>
            
            <InversionChecklistForm symbol={detail.symbol} payload={decisionPayload} />

            {/* Rec Call history / timeline */}
            <div style={{ marginTop: "16px" }} className="flex flex-col gap-2">
              <h3 className="story-h2" style={{ fontSize: "0.85rem", textTransform: "uppercase" }}>Recommendation Timeline Log</h3>
              {detail.recCalls.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {detail.recCalls.map((rc) => (
                    <div className="panel" key={rc.id} style={{ padding: "10px 12px", border: "1px solid var(--border-dim)", background: "var(--bg-surface)", margin: "8px 0" }}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Badge variant={rc.action === "BUY" ? "success" : rc.action === "AVOID" ? "danger" : "warning"}>
                            {rc.action} ({rc.conviction})
                          </Badge>
                          <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>{formatDate(rc.createdAt)}</span>
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: 600 }}>
                          Price: ${rc.priceAtCall.toFixed(2)}
                        </div>
                      </div>
                      {rc.governorReason && (
                        <div style={{ fontSize: "11px", color: "var(--fg-secondary)", marginTop: "4px" }}>
                          <strong>Reason:</strong> {rc.governorReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontStyle: "italic", fontSize: "11px", color: "var(--fg-muted)" }}>No structural recommendation calls logged.</div>
              )}
            </div>
          </section>

        </main>

        {/* Sidebar: 3fr */}
        <aside className="ticker-sticky-sidebar">
          {/* User state status panel */}
          <div className="panel flex flex-col gap-2" style={{ border: "1px solid var(--border-muted)", margin: "8px 0" }}>
            <span className="ui-stat-label">Asset State Status</span>
            <div className="flex justify-between items-center" style={{ marginTop: "4px" }}>
              <span className="ui-stat-value" style={{ fontSize: "1.1rem" }}>
                {detail.userState ?? "UNIVERSE"}
              </span>
              <Badge variant={detail.userState === "WATCHLIST" ? "success" : "neutral"}>
                {detail.userState === "WATCHLIST" ? "Active Monitoring" : "Inbox Candidate"}
              </Badge>
            </div>
          </div>

          {/* Navigation links rail */}
          <Panel className="flex flex-col gap-2">
            <span className="ui-stat-label" style={{ marginBottom: "6px" }}>Cockpit Navigation</span>
            <SectionNav sections={navSections} />
          </Panel>

          {/* Quick Checklist Shortcut stub */}
          <Panel className="flex flex-col gap-2">
            <span className="ui-stat-label">Inversion Quick Check</span>
            <p style={{ fontSize: "11px", color: "var(--fg-secondary)", margin: 0 }}>
              Use the timeline checklist below to invalidate thesis drivers before making a transaction.
            </p>
            <a href="#journal" style={{ fontSize: "11px", color: "var(--accent-blue)", fontWeight: 600, marginTop: "4px" }}>
              Jump to Checklist Inversion ↓
            </a>
          </Panel>

          {/* Launch background run client drawer */}
          <Panel className="flex flex-col gap-2">
            <span className="ui-stat-label">Agent Automation</span>
            <p style={{ fontSize: "11px", color: "var(--fg-secondary)", margin: 0, marginBottom: "8px" }}>
              Boot a new multi-agent consensus run and save a fresh thesis consensus report.
            </p>
            <ResearchRunDrawer symbol={detail.symbol} />
          </Panel>

          {/* Return to universe */}
          <div style={{ padding: "0 8px" }}>
            <Link href="/tickers" style={{ color: "var(--fg-muted)", fontSize: "11.5px", textDecoration: "none" }}>
              ← Return to Universe Index
            </Link>
          </div>
        </aside>
      </div>

    </div>
  );
}
