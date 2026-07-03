import { listTickers, listSectors } from "@/lib/ticker-data";
import Link from "next/link";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    sector?: string;
    watchlistedOnly?: string;
  }>;
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

export default async function TickersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q || "";
  const sector = params.sector || "";
  const watchlistedOnly = params.watchlistedOnly === "true";

  const tickers = await listTickers({ q, sector, watchlistedOnly });
  const sectors = await listSectors();

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Workstation</div>
        <h1 className="story-h1">Ticker Universe</h1>
        <p className="lead">
          Browse the backfilled asset database. Explore historical prices, filings, and upcoming catalysts.
        </p>
      </header>

      {/* Filter and Search Form */}
      <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
        <form method="GET" action="/tickers" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontWeight: 600 }}>Search Query</label>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search symbol or name..."
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: 'var(--inset)',
                color: 'var(--ink)',
                fontSize: '14px',
                width: '100%',
                outline: 'none',
                fontFamily: 'var(--fbody)'
              }}
            />
          </div>

          <div style={{ minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontWeight: 600 }}>Sector / Membership</label>
            <select
              name="sector"
              defaultValue={sector}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: 'var(--inset)',
                color: 'var(--ink)',
                fontSize: '14px',
                width: '100%',
                outline: 'none',
                fontFamily: 'var(--fbody)'
              }}
            >
              <option value="">All Sectors</option>
              {sectors.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.taxonomy.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: '18px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '14px', cursor: 'pointer', userSelect: 'none', color: 'var(--ink)' }}>
              <input
                type="checkbox"
                name="watchlistedOnly"
                value="true"
                defaultChecked={watchlistedOnly}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
              />
              Watchlist only
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '18px' }}>
            <button
              type="submit"
              className="verdict-badge buy"
              style={{
                border: 'none',
                cursor: 'pointer',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                marginTop: 0,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              Apply Filter
            </button>
            {(q || sector || watchlistedOnly) && (
              <Link
                href="/tickers"
                className="verdict-badge avoid"
                style={{
                  textDecoration: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginTop: 0,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* Tickers Table */}
      {tickers.length === 0 ? (
        <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
          <h2 className="story-h2">No Assets Found</h2>
          <p className="body" style={{ color: 'var(--muted)', margin: '1rem 0' }}>
            No tickers matched the current filters. Adjust your search or try loading the default universe.
          </p>
          <div style={{ marginTop: '1.5rem', maxWidth: '500px', margin: '1.5rem auto 0' }}>
            <div className="eyebrow" style={{ justifyContent: 'center' }}>CLI command to seed or backfill</div>
            <pre style={{
              background: 'var(--inset)',
              color: 'var(--ink)',
              padding: '12px',
              borderRadius: '6px',
              fontFamily: 'var(--fmono)',
              fontSize: '13px',
              overflowX: 'auto',
              border: '1px solid var(--line)',
              textAlign: 'left'
            }}>
              npm run job -- backfill --task=prices10y --symbol=MU
            </pre>
          </div>
        </div>
      ) : (
        <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1rem', overflowX: 'auto', margin: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Symbol</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Watch</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Company Name</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Sector / Membership</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', textAlign: 'right' }}>Last Close</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', textAlign: 'right' }}>1d% Change</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', textAlign: 'right' }}>Market Cap</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', textAlign: 'right' }}>Fwd P/E</th>
              </tr>
            </thead>
            <tbody>
              {tickers.map((row) => {
                const isPos = row.change1d !== null && row.change1d >= 0;
                return (
                  <tr key={row.symbol} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '1rem', fontWeight: 700, fontSize: '16px' }}>
                      <Link href={`/tickers/${row.symbol}`} style={{ color: 'var(--accent-deep)', textDecoration: 'none' }}>
                        {row.symbol}
                      </Link>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '18px', textAlign: 'center', width: '40px' }}>
                      {row.watchlisted ? (
                        <span style={{ color: 'var(--warn)' }} title="Watchlisted">★</span>
                      ) : (
                        <span style={{ color: 'var(--faint)', opacity: 0.3 }} title="Not Watchlisted">☆</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '14px', color: 'var(--ink)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.name ?? "—"}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '13px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {row.sectors.map((sec) => {
                          const isAi = sec.startsWith("ai_");
                          return (
                            <span
                              key={sec}
                              style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 500,
                                background: isAi ? 'var(--accent-soft)' : 'var(--surface-2)',
                                color: isAi ? 'var(--accent-deep)' : 'var(--muted)',
                                border: `1px solid ${isAi ? 'color-mix(in srgb, var(--accent-deep) 20%, transparent)' : 'var(--line)'}`
                              }}
                            >
                              {formatSectorCode(sec)}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '14px', fontFamily: 'var(--fmono)', textAlign: 'right' }}>
                      {row.close !== null ? `$${row.close.toFixed(2)}` : "—"}
                    </td>
                    <td
                      className="num"
                      style={{
                        padding: '1rem',
                        fontSize: '14px',
                        fontFamily: 'var(--fmono)',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: row.change1d === null ? 'var(--muted)' : isPos ? 'var(--pos)' : 'var(--neg)'
                      }}
                    >
                      {row.change1d !== null ? (
                        <>
                          {isPos ? "+" : ""}
                          {row.change1d.toFixed(2)}%
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '14px', fontFamily: 'var(--fmono)', textAlign: 'right', color: 'var(--muted)' }}>
                      {formatMarketCap(row.marketCap)}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '14px', fontFamily: 'var(--fmono)', textAlign: 'right', color: 'var(--muted)' }}>
                      {row.forwardPE !== null ? row.forwardPE.toFixed(1) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CLI Tips panel */}
      <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.5rem', marginTop: '2rem' }}>
        <h3 className="story-h2" style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
          CLI Workstation Tips
        </h3>
        <p className="body dim" style={{ fontSize: '13px' }}>
          This interface is a read-only display of local cache tables. Run the following engine CLI commands in the repository root to control data sync:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ background: 'var(--inset)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--fmono)', fontWeight: 'bold', color: 'var(--accent-deep)' }}>Queue Dossier Deep-Dive</span>
            <pre style={{ margin: '4px 0 0', fontSize: '12px', fontFamily: 'var(--fmono)', overflowX: 'auto' }}>
              npm run job -- dossier --symbols=MU
            </pre>
          </div>
          <div style={{ background: 'var(--inset)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--fmono)', fontWeight: 'bold', color: 'var(--accent-deep)' }}>Backfill 10y Historical Prices</span>
            <pre style={{ margin: '4px 0 0', fontSize: '12px', fontFamily: 'var(--fmono)', overflowX: 'auto' }}>
              npm run job -- backfill --task=prices10y --symbol=NVDA
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
