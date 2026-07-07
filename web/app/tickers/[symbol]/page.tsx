import { tickerDetail } from "@/lib/ticker-data";
import { StatTape } from "@/components/story/StatTape";
import TickerPriceChart from "@/components/TickerPriceChart";
import Link from "next/link";
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
  const validRanges = ["1d", "5d", "1m", "3m", "1y", "3y", "5y"];
  const activeRange = range && validRanges.includes(range) ? range : "1y";

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
          <pre style={{
            background: 'var(--inset)',
            color: 'var(--ink)',
            padding: '12px',
            borderRadius: '6px',
            fontFamily: 'var(--fmono)',
            fontSize: '14px',
            overflowX: 'auto',
            border: '1px solid var(--line)',
            textAlign: 'left'
          }}>
            npm run job -- backfill --task=fundamentals --symbol={symbol.toUpperCase()}
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

  // Build StatTape statistics array
  const stats = [
    { label: "Market Cap", value: formatMarketCap(detail.marketCap) },
    { label: "Trailing P/E", value: detail.trailingPE !== null ? `${detail.trailingPE.toFixed(1)}x` : "—" },
    { label: "Forward P/E", value: detail.forwardPE !== null ? `${detail.forwardPE.toFixed(1)}x` : "—" },
    { label: "Beta (1y)", value: detail.beta !== null ? detail.beta.toFixed(2) : "—" },
    { label: "EPS (ttm)", value: detail.eps !== null ? `$${detail.eps.toFixed(2)}` : "—" },
    { label: "52W Range", value: detail.fiftyTwoWeekLow && detail.fiftyTwoWeekHigh ? `$${detail.fiftyTwoWeekLow.toFixed(0)} - $${detail.fiftyTwoWeekHigh.toFixed(0)}` : "—" },
    {
      label: "Year Change",
      value: detail.yearChange !== null ? `${detail.yearChange.toFixed(1)}%` : "—",
      delta: detail.yearChange !== null ? `${detail.yearChange >= 0 ? "+" : ""}${detail.yearChange.toFixed(1)}%` : undefined,
      deltaDirection: detail.yearChange === null ? undefined : (detail.yearChange >= 0 ? "up" as const : "down" as const),
    },
  ];

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      {/* Cockpit Header */}
      <header className="hero" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="kicker" style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{detail.symbol}</span>
              {detail.watchlisted ? (
                <span className="verdict-badge hold" style={{ margin: 0, padding: '2px 8px', textTransform: 'uppercase', fontSize: '10px', color: 'var(--warn)', background: 'rgba(168,118,27,0.1)' }}>★ Watchlisted</span>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--faint)' }}>☆ Not watchlisted</span>
              )}
            </div>
            <h1 className="story-h1" style={{ margin: '8px 0 12px 0' }}>{detail.name ?? detail.symbol}</h1>
            
            {/* Sector / Membership Chips */}
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
                      border: `1px solid ${isAi ? 'color-mix(in srgb, var(--accent-deep) 20%, transparent)' : 'var(--line)'}`
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
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '4px' }}>Last Close Price</div>
            <div className="story-h1" style={{ margin: 0, fontFamily: 'var(--fdisp)', fontSize: '3.2rem', fontWeight: 600 }}>
              {latestPrice ? `$${latestPrice.close.toFixed(2)}` : "—"}
            </div>
            {pctChange1d !== null && (
              <div style={{
                fontFamily: 'var(--fmono)',
                fontSize: '15px',
                fontWeight: 600,
                color: isPos ? 'var(--pos)' : 'var(--neg)',
                marginTop: '4px'
              }}>
                {isPos ? "+" : ""}
                {pctChange1d.toFixed(2)}% (1d)
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.3fr', gap: '2rem' }}>
        {/* Left Column: Chart, Stats, Fundamentals, Dossier */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Price Chart Panel */}
          <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.5rem', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h3 className="story-h2" style={{ fontSize: '1.1rem', margin: 0 }}>Historical Price Trend</h3>
                <span className="body dim" style={{ fontSize: '12px' }}>Despiked close series over selected timeframe</span>
              </div>
              <div className="presets" style={{ display: 'flex', gap: '4px', margin: 0 }}>
                {["1d", "5d", "1m", "3m", "1y", "3y", "5y"].map((r) => (
                  <Link
                    key={r}
                    href={`?range=${r}`}
                    className={activeRange === r ? "on" : ""}
                    style={{
                      textDecoration: 'none',
                      fontFamily: 'var(--fmono)',
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      background: activeRange === r ? 'var(--accent-soft)' : 'var(--surface)',
                      color: activeRange === r ? 'var(--accent-deep)' : 'var(--ink)',
                      border: `1px solid ${activeRange === r ? 'var(--accent)' : 'var(--line-2)'}`
                    }}
                  >
                    {r.toUpperCase()}
                  </Link>
                ))}
              </div>
            </div>

            {priceCount > 0 ? (
              <TickerPriceChart data={detail.priceSeries} />
            ) : (
              <div style={{ height: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--inset)', borderRadius: '8px', border: '1px dashed var(--line)' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>No historical price data backfilled</span>
                <pre style={{ background: 'var(--surface)', padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--line)', marginTop: '12px', fontSize: '11px', fontFamily: 'var(--fmono)' }}>
                  npm run job -- backfill --task=prices10y --symbol={detail.symbol}
                </pre>
              </div>
            )}
          </div>

          {/* Quant Analytics Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 className="story-h2" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', margin: 0 }}>Quant Cockpit Analytics</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              
              {/* 1. DCF Valuation Panel */}
              <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px', margin: 0 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', fontWeight: 600 }}>DCF Valuation</span>
                    {detail.dcf && detail.dcf.upsidePctBase != null && (
                      <span className={`verdict-badge ${detail.dcf.upsidePctBase >= 0 ? 'buy' : 'avoid'}`} style={{ fontSize: '10px', padding: '2px 8px', margin: 0 }}>
                        {detail.dcf.upsidePctBase >= 0 ? '+' : ''}{detail.dcf.upsidePctBase.toFixed(1)}% Base Upside
                      </span>
                    )}
                  </div>
                  {detail.dcf && detail.dcf.fairValueRange ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Fair Value (Base):</span>
                        <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--fdisp)' }}>
                          {detail.dcf.fairValueRange.base != null ? `$${detail.dcf.fairValueRange.base.toFixed(2)}` : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--faint)', marginBottom: '12px' }}>
                        <span>Bear: {detail.dcf.fairValueRange.bear != null ? `$${detail.dcf.fairValueRange.bear.toFixed(2)}` : '—'}</span>
                        <span>Bull: {detail.dcf.fairValueRange.bull != null ? `$${detail.dcf.fairValueRange.bull.toFixed(2)}` : '—'}</span>
                      </div>
                      {/* Visual gauge showing current price vs bear/base/bull */}
                      {latestPrice && detail.dcf.fairValueRange.bear != null && detail.dcf.fairValueRange.bull != null && (
                        <div style={{ width: '100%', marginTop: '8px' }}>
                          <div style={{ height: '4px', background: 'var(--line)', borderRadius: '2px', position: 'relative' }}>
                            {(() => {
                              const bear = detail.dcf.fairValueRange.bear!;
                              const bull = detail.dcf.fairValueRange.bull!;
                              const current = latestPrice.close;
                              const pct = Math.max(0, Math.min(100, ((current - bear) / (bull - bear)) * 100));
                              return (
                                <div style={{
                                  position: 'absolute',
                                  left: `${pct}%`,
                                  top: '-4px',
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  background: 'var(--accent-deep)',
                                  border: '2px solid var(--surface)',
                                  transform: 'translateX(-50%)',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }} title={`Current Price: $${current.toFixed(2)} (${pct.toFixed(0)}% of range)`} />
                              );
                            })()}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--faint)', marginTop: '4px' }}>
                            <span>Bear</span>
                            <span style={{ color: 'var(--accent-deep)', fontWeight: 600 }}>Current Price</span>
                            <span>Bull</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '1rem 0', textAlign: 'center' }}>
                      No FCF or shares data to run DCF model.
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Quality of Earnings (QoE) Panel */}
              <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px', margin: 0 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', fontWeight: 600 }}>Quality of Earnings</span>
                    {detail.qoe && detail.qoe.altmanZone && (
                      <span className={`verdict-badge ${
                        detail.qoe.altmanZone === 'safe' ? 'buy' : detail.qoe.altmanZone === 'grey' ? 'hold' : 'avoid'
                      }`} style={{ fontSize: '10px', padding: '2px 8px', margin: 0 }}>
                        Z-Zone: {detail.qoe.altmanZone.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {detail.qoe ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Piotroski F-Score:</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: detail.qoe.piotroskiF >= 7 ? 'var(--pos)' : detail.qoe.piotroskiF <= 3 ? 'var(--neg)' : 'var(--ink)' }}>
                          {detail.qoe.piotroskiF != null ? `${detail.qoe.piotroskiF}/9` : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Altman Z-Score:</span>
                        <span style={{ fontSize: '14px', fontWeight: 700 }}>
                          {detail.qoe.altmanZ != null ? detail.qoe.altmanZ.toFixed(2) : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Beneish M-Score:</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: detail.qoe.beneishFlag === 'likely_manipulator' ? 'var(--neg)' : 'var(--pos)' }}>
                          {detail.qoe.beneishM != null ? detail.qoe.beneishM.toFixed(2) : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Sloan Accrual Ratio:</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: detail.qoe.accrualRatio != null && Math.abs(detail.qoe.accrualRatio) > 0.1 ? 'var(--neg)' : 'var(--ink)' }}>
                          {detail.qoe.accrualRatio != null ? `${(detail.qoe.accrualRatio * 100).toFixed(1)}%` : '—'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '1rem 0', textAlign: 'center' }}>
                      No fundamentals data to run QoE metrics.
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Technical Momentum Panel */}
              <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px', margin: 0 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', fontWeight: 600 }}>Technical Momentum</span>
                    {detail.technicals && detail.technicals.maCross && (
                      <span className={`verdict-badge ${
                        detail.technicals.maCross.state === 'bullish' ? 'buy' : detail.technicals.maCross.state === 'bearish' ? 'avoid' : 'hold'
                      }`} style={{ fontSize: '10px', padding: '2px 8px', margin: 0 }}>
                        {detail.technicals.maCross.state === 'bullish' ? 'Golden Cross' : detail.technicals.maCross.state === 'bearish' ? 'Death Cross' : 'No Regime'}
                      </span>
                    )}
                  </div>
                  {detail.technicals ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>RSI (14d):</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: detail.technicals.rsi14 > 70 ? 'var(--neg)' : detail.technicals.rsi14 < 30 ? 'var(--pos)' : 'var(--ink)' }}>
                          {detail.technicals.rsi14 != null ? detail.technicals.rsi14.toFixed(1) : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>50-day SMA:</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--fmono)' }}>
                          {detail.technicals.sma50 != null ? `$${detail.technicals.sma50.toFixed(2)}` : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>200-day SMA:</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--fmono)' }}>
                          {detail.technicals.sma200 != null ? `$${detail.technicals.sma200.toFixed(2)}` : '—'}
                        </span>
                      </div>
                      {detail.technicals.macd && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>MACD Hist:</span>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: detail.technicals.macd.histogram >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                            {detail.technicals.macd.histogram != null ? detail.technicals.macd.histogram.toFixed(3) : '—'}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '1rem 0', textAlign: 'center' }}>
                      No price history to run technical analysis.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Stat Tape (Key Metrics) */}
          <div style={{ margin: 0 }}>
            <h3 className="story-h2" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '0.5rem' }}>Key Metrics</h3>
            <StatTape stats={stats} />
          </div>

          {/* Fundamentals Table */}
          <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.5rem', margin: 0 }}>
            <h3 className="story-h2" style={{ fontSize: '1.1rem', borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>Quarterly Financials</h3>
            {detail.quarters.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)' }}>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)' }}>Quarter End</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>Revenue</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>Gross Margin</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>Op Margin</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>Net Margin</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>FCF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.quarters.map((q) => (
                      <tr key={q.periodEnd} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '0.75rem', fontSize: '13px', fontWeight: 600 }}>{q.periodEnd}</td>
                        <td style={{ padding: '0.75rem', fontSize: '13px', fontFamily: 'var(--fmono)', textAlign: 'right' }}>
                          {formatFinancialAmount(q.revenue)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '13px', fontFamily: 'var(--fmono)', textAlign: 'right', color: q.grossMargin !== null && q.grossMargin < 0 ? 'var(--neg)' : 'var(--ink)' }}>
                          {q.grossMargin !== null ? `${q.grossMargin.toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '13px', fontFamily: 'var(--fmono)', textAlign: 'right', color: q.operatingMargin !== null && q.operatingMargin < 0 ? 'var(--neg)' : 'var(--ink)' }}>
                          {q.operatingMargin !== null ? `${q.operatingMargin.toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '13px', fontFamily: 'var(--fmono)', textAlign: 'right', color: q.profitMargin !== null && q.profitMargin < 0 ? 'var(--neg)' : 'var(--ink)' }}>
                          {q.profitMargin !== null ? `${q.profitMargin.toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '13px', fontFamily: 'var(--fmono)', textAlign: 'right', fontWeight: 500, color: q.fcf !== null && q.fcf < 0 ? 'var(--neg)' : 'var(--pos)' }}>
                          {formatFinancialAmount(q.fcf)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--inset)', borderRadius: '8px', border: '1px dashed var(--line)' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>No fundamental filings quarter data backfilled</span>
                <pre style={{ background: 'var(--surface)', padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--line)', marginTop: '12px', fontSize: '11px', fontFamily: 'var(--fmono)' }}>
                  npm run job -- backfill --task=fundamentals --symbol={detail.symbol}
                </pre>
              </div>
            )}
          </div>

          {/* Dossiers & RecCalls History */}
          <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.5rem', margin: 0 }}>
            <h3 className="story-h2" style={{ fontSize: '1.1rem', borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>Agentic Research History</h3>
            
            {detail.dossiers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {detail.dossiers.map((dos) => {
                  let badgeClass = "hold";
                  if (dos.verdict?.recommendation === "BUY") badgeClass = "buy";
                  else if (dos.verdict?.recommendation === "AVOID") badgeClass = "avoid";
                  else if (dos.verdict?.recommendation === "TRIM") badgeClass = "avoid";

                  return (
                    <div key={dos.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px', background: 'var(--inset)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Link href={`/dossiers/${dos.id}`} style={{ fontWeight: 600, color: 'var(--accent-deep)', textDecoration: 'none', fontSize: '14px' }}>
                            Dossier: {dos.id}
                          </Link>
                          <span style={{ fontSize: '11px', color: 'var(--faint)' }}>({new Date(dos.updatedAt).toLocaleDateString()})</span>
                        </div>
                        {dos.verdict ? (
                          <div style={{ fontSize: '13px', marginTop: '6px', color: 'var(--ink)' }}>
                            <strong>Verdict:</strong> {dos.verdict.summary}
                          </div>
                        ) : (
                          <div style={{ fontSize: '13px', marginTop: '4px', color: 'var(--muted)' }}>
                            Status: <span style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 600 }}>{dos.status}</span>
                          </div>
                        )}
                      </div>
                      {dos.verdict && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span className={`verdict-badge ${badgeClass}`} style={{ margin: 0, padding: '2px 8px', fontSize: '10px' }}>
                            {dos.verdict.recommendation} ({dos.verdict.conviction})
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--inset)', borderRadius: '8px', border: '1px dashed var(--line)' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>No deep research dossiers compiled yet. Trigger a live, multi-agent debate to synthesize a research consensus.</span>
                <pre style={{ background: 'var(--surface)', padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--line)', marginTop: '12px', fontSize: '11px', fontFamily: 'var(--fmono)' }}>
                  npm run job -- dossier --symbols={detail.symbol}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Catalysts, Filings, News */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Catalysts */}
          <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.25rem', margin: 0 }}>
            <h3 className="story-h2" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>Upcoming Catalysts</h3>
            {detail.catalysts.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {detail.catalysts.map((c) => (
                  <li key={c.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className="num" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-deep)' }}>{c.d ? formatDate(c.d) : "TBD"}</span>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: '3px' }}>{c.kind}</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)', marginTop: '3px' }}>{c.title}</div>
                    {c.note && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{c.note}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0.5rem 0' }}>No catalysts cataloged for this asset or sector.</p>
            )}
          </div>

          {/* SEC Filings */}
          <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.25rem', margin: 0 }}>
            <h3 className="story-h2" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>Recent SEC Filings</h3>
            {detail.filings.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {detail.filings.slice(0, 5).map((f) => (
                  <li key={f.accessionNo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
                    <div>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: 'var(--accent-deep)', textDecoration: 'none' }}>
                        {f.form}
                      </a>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatDate(f.filedAt)}</div>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--faint)', fontFamily: 'var(--fmono)' }} title="Accession Number">{f.accessionNo.slice(-6)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div>
                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0.5rem 0' }}>No Edgar filings found in cache.</p>
                <pre style={{ background: 'var(--inset)', padding: '6px', borderRadius: '4px', fontSize: '10px', fontFamily: 'var(--fmono)', whiteSpace: 'pre-wrap', border: '1px solid var(--line)' }}>
                  npm run job -- backfill --task=edgar_index --symbol={detail.symbol}
                </pre>
              </div>
            )}
          </div>

          {/* News Feed */}
          <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.25rem', margin: 0 }}>
            <h3 className="story-h2" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>Recent News</h3>
            {detail.news.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {detail.news.map((n, idx) => (
                  <li key={idx} style={{ borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
                    <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', display: 'block', lineHeight: 1.4 }}>
                      {n.title}
                    </a>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                      <span>{n.source ?? "Web"}</span>
                      <span>{n.publishedAt ? formatDate(n.publishedAt) : "—"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0.5rem 0' }}>No recent news articles logged for this symbol.</p>
            )}
          </div>
        </div>
      </div>

      {/* Return to universe */}
      <div style={{ marginTop: '3rem', borderTop: '1px solid var(--line)', paddingTop: '1.5rem' }}>
        <Link href="/tickers" style={{ color: 'var(--accent-deep)', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
          ← Back to Ticker Universe Index
        </Link>
      </div>
    </div>
  );
}
