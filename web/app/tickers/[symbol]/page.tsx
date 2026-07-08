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
      <div className="story-page error-page">
        <header className="hero text-center mb-10">
          <div className="eyebrow justify-center">Workstation Error</div>
          <h1 className="story-h1">Ticker {symbol.toUpperCase()} Not Found</h1>
          <p className="lead error-lead">
            This asset does not exist in the local SQLite database.
          </p>
        </header>

        <div className="panel error-card max-w-600 mx-auto text-center">
          <h2 className="story-h2">Populate this ticker</h2>
          <p className="body">
            Run the discovery and backfill commands to fetch market data and populate the database tables:
          </p>
          <pre className="error-code-block">
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
    <div className="story-page cockpit-page">
      {/* Header Banner */}
      <header className="hero cockpit-hero">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="kicker text-18 font-weight-700 m-0">{detail.symbol}</span>
              <WatchlistButton symbol={detail.symbol} initialWatchlisted={detail.watchlisted} />
              {detail.tier && <TierTag tier={detail.tier as any} />}
            </div>
            <h1 className="story-h1 cockpit-name-heading">{detail.name ?? detail.symbol}</h1>

            <div className="flex gap-1-5 flex-wrap mt-2">
              {detail.sectors.map((sec) => {
                const isAi = sec.taxonomy === "ai_infra";
                return (
                  <span
                    key={sec.code}
                    className={`verdict-badge ${isAi ? "buy" : ""} cockpit-sector-badge ${isAi ? "cockpit-sector-badge--ai" : "cockpit-sector-badge--default"}`}
                    title={`${sec.name} (${sec.taxonomy.toUpperCase()})`}
                  >
                    {formatSectorCode(sec.code)}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="text-right">
            <div className="cockpit-price-label">Last Close Price</div>
            <div className="story-h1 m-0 cockpit-price-value">
              {latestPrice ? `$${latestPrice.close.toFixed(2)}` : "—"}
            </div>
            {pctChange1d !== null && (
              <div className={`cockpit-price-change ${isPos ? "text-green" : "text-red"}`}>
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
            <h2 className="story-h2 section-heading m-0">
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
                    <div className="text-11 text-secondary">
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
                    <span className="text-10 muted">Missing P/E multiple inputs</span>
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
                    <div className="text-11 text-gold font-weight-600">
                      ⚠️ INSIDER CLUSTER: {detail.screens.insiderCluster.insiders.length} buyers (${(detail.screens.insiderCluster.totalValue / 1e3).toFixed(0)}k ttm)
                    </div>
                  ) : (
                    <div className="text-11 muted">No structural insider buying cluster</div>
                  )}
                  {detail.filingEvents.length > 0 ? (
                    <div className="text-10 text-secondary">
                      Latest filing: <strong>{detail.filingEvents[0].form}</strong> ({formatDate(detail.filingEvents[0].filedAt)})
                    </div>
                  ) : (
                    <div className="text-10 muted">No recent structural 8-K filings</div>
                  )}
                </div>
              </Panel>

              {/* Q4: What Kills It */}
              <div className="panel flex flex-col gap-3 cockpit-kill-card">
                <span className="ui-stat-label cockpit-kill-label">WHAT KILLS IT?</span>
                <div className="flex flex-col gap-1 cockpit-kill-list">
                  {detail.activeTripwires.length > 0 ? (
                    detail.activeTripwires.map((trip: any, idx: number) => (
                      <div key={idx} className="cockpit-kill-item-strong">
                        🚨 [{String(trip.severity ?? "warn").toUpperCase()}] {trip.message}
                      </div>
                    ))
                  ) : (
                    <div className="cockpit-kill-empty">No active structural tripwire metrics triggered.</div>
                  )}
                  {detail.disconfirming ? (
                    <div className="cockpit-kill-disconfirm">
                      <strong>Disconfirming:</strong> {detail.disconfirming}
                    </div>
                  ) : (
                    <div className="cockpit-kill-disconfirm-empty">No custom invalidation checklist logged yet.</div>
                  )}
                </div>
              </div>

            </div>
          </section>

          {/* Section 2: Interactive Chart */}
          <section id="chart">
            <h2 className="story-h2 section-heading mt-4">
              Technical Charts & Pane Math
            </h2>
            <CandleChart priceSeries={detail.priceSeries} events={chartEvents} />
          </section>

          {/* Section 3: Valuation Corridor Ladder */}
          <section id="valuation" className="flex flex-col gap-3">
            <h2 className="story-h2 section-heading mt-4">
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
                        <TableCell numeric className="font-weight-700">
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
                        <TableCell numeric className="font-weight-700">
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
                        <TableCell numeric className="font-weight-700">
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
                  <div className="self-start mt-2">
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
            <h2 className="story-h2 section-heading mt-4">
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
                          <TableCell className="font-weight-600">{q.periodEnd}</TableCell>
                          <TableCell numeric>{formatFinancialAmount(q.revenue)}</TableCell>
                          <TableCell
                            numeric
                            className={isGrossAnomalous ? "cell-anomalous" : ""}
                          >
                            {q.grossMargin !== null ? `${q.grossMargin.toFixed(1)}%` : "—"}
                          </TableCell>
                          <TableCell numeric>{q.operatingMargin !== null ? `${q.operatingMargin.toFixed(1)}%` : "—"}</TableCell>
                          <TableCell numeric>{formatFinancialAmount(q.netIncome)}</TableCell>
                          <TableCell
                            numeric
                            className={isFcfDivergent ? "cell-anomalous" : ""}
                          >
                            {formatFinancialAmount(q.fcf)}
                          </TableCell>
                          <TableCell
                            numeric
                            className={isAccrualAnomalous ? "cell-anomalous" : ""}
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
                              <TableCell className="font-weight-600">{q.periodEnd}</TableCell>
                              <TableCell numeric>{formatFinancialAmount(q.revenue)}</TableCell>
                              <TableCell
                                numeric
                                className={isGrossAnomalous ? "cell-anomalous" : ""}
                              >
                                {q.grossMargin !== null ? `${q.grossMargin.toFixed(1)}%` : "—"}
                              </TableCell>
                              <TableCell numeric>{q.operatingMargin !== null ? `${q.operatingMargin.toFixed(1)}%` : "—"}</TableCell>
                              <TableCell numeric>{formatFinancialAmount(q.netIncome)}</TableCell>
                              <TableCell
                                numeric
                                className={isFcfDivergent ? "cell-anomalous" : ""}
                              >
                                {formatFinancialAmount(q.fcf)}
                              </TableCell>
                              <TableCell
                                numeric
                                className={isAccrualAnomalous ? "cell-anomalous" : ""}
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
            <h2 className="story-h2 section-heading mt-4">
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
                    <div className="panel p-3" key={evt.id}>
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={badgeVariant}>
                              {evt.form} - Item {evt.item}
                            </Badge>
                            <span className="text-11 muted">{formatDate(evt.filedAt)}</span>
                          </div>
                          <h4 className="text-13 font-weight-600 mt-1-5 text-primary">{evt.headline}</h4>
                          <p className="text-11 text-secondary m-0 mt-1">{evt.snippet}</p>
                        </div>
                        <a
                          href={getFilingUrl(detail.cik || "", evt.accessionNo, "doc.html")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-11 text-accent"
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
            <div className="flex flex-col gap-2 mt-2">
              <h3 className="story-h2 subsection-heading">10-K/Q Diff Monitor</h3>
              {detail.filingEvents.filter((e: any) => e.kind === "filing-diff").length > 0 ? (
                detail.filingEvents
                  .filter((e: any) => e.kind === "filing-diff")
                  .map((evt: any) => {
                    const diffVariant =
                      evt.severity === "thesis-relevant" ? "critical" : evt.severity === "notable" ? "warning" : "neutral";
                    return (
                      <div className="panel p-3 mt-1 mb-1" key={evt.id}>
                        <div className="flex items-center gap-2">
                          <Badge variant={diffVariant}>{evt.severity.toUpperCase()}</Badge>
                          <span className="text-11 muted">{formatDate(evt.filedAt)} · {evt.accessionNo}</span>
                        </div>
                        <h4 className="text-13 font-weight-600 mt-1-5 text-primary">{evt.headline}</h4>
                        <p className="text-11 text-secondary m-0 mt-1">{evt.snippet}</p>
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
            <h2 className="story-h2 section-heading mt-4">
              Research Consensus Dossiers
            </h2>

            {/* Verdict consensus card */}
            {detail.dossiers.length > 0 && detail.dossiers[0].verdict ? (
              <div className="panel panel--muted-border">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="story-h1">consensus dossier recommendation</h3>
                    <div className="text-11 muted mt-1">
                      Updated: {new Date(detail.dossiers[0].updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant={detail.dossiers[0].verdict.recommendation === "BUY" ? "success" : detail.dossiers[0].verdict.recommendation === "AVOID" ? "danger" : "warning"}>
                    {detail.dossiers[0].verdict.recommendation} ({detail.dossiers[0].verdict.conviction})
                  </Badge>
                </div>
                <p className="text-13 text-primary mt-3">
                  {detail.dossiers[0].verdict.summary}
                </p>

                {/* Transcript Disclosure */}
                <div className="mt-3">
                  <Disclosure title="Inspect Full Dossier Transcript">
                    <div className="dossier-transcript">
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
              <h3 className="story-h2 subsection-heading">Research Run History</h3>
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
                        <TableCell className="font-mono text-11">{run.id}</TableCell>
                        <TableCell>{run.runType}</TableCell>
                        <TableCell>
                          <Badge variant={run.status === "COMPLETED" ? "success" : run.status === "FAILED" ? "danger" : "warning"}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell numeric>{run.elapsedSeconds}s / {run.budgetSeconds}s</TableCell>
                        <TableCell className="text-11">
                          {run.artifactPath ? (
                            <a href={`file://${run.artifactPath}`} target="_blank" rel="noopener noreferrer" className="text-accent">
                              inspect artifact ↗
                            </a>
                          ) : (
                            <span className="text-dim">none</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DenseTable>
              ) : (
                <div className="italic text-11 muted">No background runs recorded.</div>
              )}
            </div>
          </section>

          {/* Section 7: Inversion checklist form */}
          <section id="journal">
            <h2 className="story-h2 section-heading mt-4">
              Timeline & Checklist Inversion
            </h2>
            
            <InversionChecklistForm symbol={detail.symbol} payload={decisionPayload} />

            {/* Rec Call history / timeline */}
            <div className="flex flex-col gap-2 mt-4">
              <h3 className="story-h2 subsection-heading">Recommendation Timeline Log</h3>
              {detail.recCalls.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {detail.recCalls.map((rc) => (
                    <div className="panel p-10-12" key={rc.id}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Badge variant={rc.action === "BUY" ? "success" : rc.action === "AVOID" ? "danger" : "warning"}>
                            {rc.action} ({rc.conviction})
                          </Badge>
                          <span className="text-11 muted">{formatDate(rc.createdAt)}</span>
                        </div>
                        <div className="text-11 font-weight-600">
                          Price: ${rc.priceAtCall.toFixed(2)}
                        </div>
                      </div>
                      {rc.governorReason && (
                        <div className="text-11 text-secondary mt-1">
                          <strong>Reason:</strong> {rc.governorReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="italic text-11 muted">No structural recommendation calls logged.</div>
              )}
            </div>
          </section>

        </main>

        {/* Sidebar: 3fr */}
        <aside className="ticker-sticky-sidebar">
          {/* User state status panel */}
          <div className="panel flex flex-col gap-2 panel--muted-border">
            <span className="ui-stat-label">Asset State Status</span>
            <div className="flex justify-between items-center mt-1">
              <span className="ui-stat-value ui-stat-value--sm">
                {detail.userState ?? "UNIVERSE"}
              </span>
              <Badge variant={detail.userState === "WATCHLIST" ? "success" : "neutral"}>
                {detail.userState === "WATCHLIST" ? "Active Monitoring" : "Inbox Candidate"}
              </Badge>
            </div>
          </div>

          {/* Navigation links rail */}
          <Panel className="flex flex-col gap-2">
            <span className="ui-stat-label mb-1-5">Cockpit Navigation</span>
            <SectionNav sections={navSections} />
          </Panel>

          {/* Quick Checklist Shortcut stub */}
          <Panel className="flex flex-col gap-2">
            <span className="ui-stat-label">Inversion Quick Check</span>
            <p className="text-11 text-secondary m-0">
              Use the timeline checklist below to invalidate thesis drivers before making a transaction.
            </p>
            <a href="#journal" className="text-11 text-accent font-weight-600 mt-1">
              Jump to Checklist Inversion ↓
            </a>
          </Panel>

          {/* Launch background run client drawer */}
          <Panel className="flex flex-col gap-2">
            <span className="ui-stat-label">Agent Automation</span>
            <p className="text-11 text-secondary m-0 mb-2">
              Boot a new multi-agent consensus run and save a fresh thesis consensus report.
            </p>
            <ResearchRunDrawer symbol={detail.symbol} />
          </Panel>

          {/* Return to universe */}
          <div className="px-2">
            <Link href="/tickers" className="muted text-11-5 no-underline">
              ← Return to Universe Index
            </Link>
          </div>
        </aside>
      </div>

    </div>
  );
}
