import { latestDigest, listDigests } from "@/lib/digest-data";
import Link from "next/link";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FAMILY_TITLES: Record<string, string> = {
  breadth: "Market Breadth",
  movers: "Top Movers & Decliners",
  gics_pulse: "GICS Sector Pulse",
  ai_pulse: "AI Infrastructure Pulse",
  tripwire: "System Tripwires & Rule Alerts",
  divergence: "Hyperscaler Sector Divergence",
  credit: "Credit & Financing Stress Proxy",
  catalysts: "Near-Term Catalysts (7d)",
  data_health: "System Data Quality & Health",
};

export default async function Home() {
  const digest = await latestDigest();
  const history = await listDigests(7);

  if (!digest) {
    return (
      <div className="story-page" style={{ padding: "40px 24px" }}>
        <header className="hero" style={{ textAlign: "center", marginBottom: "40px" }}>
          <div className="eyebrow" style={{ justifyContent: "center" }}>Workstation Empty State</div>
          <h1 className="story-h1">No Digest Available</h1>
          <p className="lead" style={{ margin: "0 auto 24px", maxWidth: "600px" }}>
            The local database has not been populated with morning digest insights yet.
          </p>
        </header>

        <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h2 className="story-h2">How to populate this page</h2>
          <p className="body" style={{ margin: '1rem 0' }}>
            Run the overnight job to fetch market data, run tripwires, calculate sector momentum, and synthesize the latest digest insights:
          </p>
          <pre style={{
            background: 'var(--inset)',
            color: 'var(--ink)',
            padding: '12px',
            borderRadius: '6px',
            fontFamily: 'var(--fmono)',
            fontSize: '14px',
            overflowX: 'auto',
            border: '1px solid var(--line)'
          }}>
            npm run job -- overnight
          </pre>
          <p className="body" style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '1.5rem' }}>
            This process reads current asset prices, scans watchlist rule triggers, evaluates hyperscaler credit indicators, and writes the synthesized results directly to the local SQLite store.
          </p>
        </div>
      </div>
    );
  }

  // Group insights by family
  const groupedInsights = digest.data.insights.reduce((acc, insight) => {
    const family = insight.family || "general";
    if (!acc[family]) {
      acc[family] = [];
    }
    acc[family].push(insight);
    return acc;
  }, {} as Record<string, typeof digest.data.insights>);

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Morning read · {digest.d}</div>
        <h1 className="story-h1">{digest.headline || "Daily Morning Digest"}</h1>
        <p className="lead">
          Latest deterministic market insights synthesized as of {digest.data.asOf || digest.d}.
        </p>
      </header>

      {/* Navigation Strip */}
      <div className="nav-strip" style={{ display: 'flex', gap: '0.75rem', margin: '1.5rem 0', flexWrap: 'wrap' }}>
        <Link href="/tickers" className="verdict-badge buy" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', marginTop: 0 }}>
          Tickers
        </Link>
        <Link href="/dossiers" className="verdict-badge buy" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', marginTop: 0 }}>
          Dossiers
        </Link>
        <Link href="/calibration" className="verdict-badge buy" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', marginTop: 0 }}>
          Calibration
        </Link>
        <Link href="/screener" className="verdict-badge buy" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', marginTop: 0 }}>
          Screener
        </Link>
        <Link href="/buylist" className="verdict-badge buy" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', marginTop: 0 }}>
          Buy List
        </Link>
        <Link href="/story/mu" className="verdict-badge buy" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', marginTop: 0 }}>
          Story
        </Link>
        <Link href="/capture" className="verdict-badge buy" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', marginTop: 0 }}>
          Capture
        </Link>
      </div>

      {/* Insights Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
        {Object.keys(groupedInsights).length === 0 ? (
          <p className="body muted">No insights found in this digest.</p>
        ) : (
          Object.entries(groupedInsights).map(([family, items]) => (
            <div key={family} className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.5rem', margin: 0 }}>
              <h2 className="story-h2" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '1.15rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {FAMILY_TITLES[family] ?? family.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {items.map((i, idx) => {
                  let badgeClass = "buy";
                  let badgeLabel = "Info";
                  if (i.severity === "critical") {
                    badgeClass = "avoid";
                    badgeLabel = "Critical";
                  } else if (i.severity === "warn") {
                    badgeClass = "hold";
                    badgeLabel = "Warn";
                  }
                  return (
                    <li key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span className={`verdict-badge ${badgeClass}`} style={{ marginTop: '2px', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600, flexShrink: 0 }}>
                          {badgeLabel}
                        </span>
                        <span className="body" style={{ fontWeight: 500, fontSize: '15px', color: 'var(--ink)' }}>{i.text}</span>
                      </div>
                      <div className="evidence" style={{ marginLeft: '0px', padding: '4px 8px', background: 'var(--inset)', borderRadius: '4px', fontFamily: 'var(--fmono)', fontSize: '11px', color: 'var(--muted)', wordBreak: 'break-all' }}>
                        {i.evidence}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* Digest History Strip */}
      {history.length > 0 && (
        <div className="tape" style={{ margin: '3rem 0 1.5rem' }}>
          <div className="cell" style={{ gridColumn: 'span 7' }}>
            <div className="k" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '11px', color: 'var(--muted)', marginBottom: '0.75rem' }}>Digest History</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {history.map((h) => (
                <Link key={h.d} href={`/digest/${h.d}`} className={`verdict-badge ${h.d === digest.d ? 'buy' : 'hold'}`} style={{ textDecoration: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', marginTop: 0 }}>
                  {h.d} {h.d === digest.d ? ' (Current)' : ''}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
