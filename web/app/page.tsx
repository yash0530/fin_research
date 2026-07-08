import Link from "next/link";
import { loadDashboard } from "@/lib/dashboard-data";
import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge } from "@/components/ui/Badge";
import { TrendNumber } from "@/components/ui/TrendNumber";
import { DenseTable, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/DenseTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SourcingInbox } from "@/components/SourcingInbox";
import { WelcomeBackBanner } from "@/components/WelcomeBackBanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function severityVariant(sev: string): "success" | "danger" | "warning" | "critical" | "neutral" {
  if (sev === "critical") return "critical";
  if (sev === "warn") return "warning";
  return "neutral";
}

export default async function Home() {
  const data = await loadDashboard();
  const { governor, alerts, watchlistBand, catalysts, inbox, killedByQuality, digest } = data;

  const pnl = governor.portfolioCostBasis > 0 ? governor.portfolioMarketValue - governor.portfolioCostBasis : 0;
  const pnlPct = governor.portfolioCostBasis > 0 ? (pnl / governor.portfolioCostBasis) * 100 : null;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1>Action Center</h1>
        <p className="muted" style={{ marginTop: "4px" }}>
          Daily alerts and the weekly Sourcing Inbox — clear both before moving to Themes.
        </p>
      </header>

      {data.staleDays !== null && data.staleDays >= 10 && <WelcomeBackBanner staleDays={data.staleDays} />}

      {/* Header micro-strip: portfolio size vs governor cap */}
      <Panel>
        <StatStrip>
          <Stat
            label="Portfolio value"
            value={`$${governor.portfolioMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            subValue={`${governor.positionsCount} position${governor.positionsCount === 1 ? "" : "s"}`}
          />
          <Stat
            label="Unrealized P&L"
            value={<TrendNumber value={pnlPct} />}
            subValue={`$${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
          <Stat
            label="This month's capital"
            value={governor.monthCapitalUsd !== null ? `$${governor.monthCapitalUsd.toLocaleString()}` : "no buy list yet"}
            subValue={
              governor.monthDeployedUsd !== null
                ? `$${governor.monthDeployedUsd.toLocaleString()} deployed · $${(governor.monthCashUsd ?? 0).toLocaleString()} cash (${governor.monthStatus})`
                : "buy ceremony not run this month"
            }
          />
          {governor.tiers.map((t) => (
            <Stat
              key={t.tier}
              label={`${t.tier} governor`}
              value={t.capLifted ? "cap lifted" : "capped 2%"}
              subValue={t.statusLine}
            />
          ))}
        </StatStrip>
      </Panel>

      <div className="dashboard-grid">
        <div className="dashboard-ideas-inbox">
          <Panel>
            <h2>Sourcing Inbox</h2>
            <p className="meta-dim" style={{ marginBottom: "8px" }}>
              Deduped Candidate rows sourced this week — tier 1 (multi-trigger) and tier 2 (qualified).
            </p>
            <SourcingInbox rows={inbox} killedByQuality={killedByQuality} />
          </Panel>
        </div>

        <div className="dashboard-action-queue">
          <Panel>
            <h2>Action Queue</h2>
            <p className="meta-dim" style={{ marginBottom: "8px" }}>Watchlist names in or near the buy band.</p>
            {watchlistBand.length === 0 ? (
              <EmptyState
                title="No Watchlist Bands"
                body="Add a name to the watchlist and set a buy-under price from its ticker page to populate this queue."
              />
            ) : (
              <div className="flex flex-col gap-1">
                {watchlistBand.slice(0, 8).map((row) => (
                  <div key={row.symbol} className="dashboard-band-row">
                    <Link href={`/tickers/${row.symbol}`} className="font-mono dashboard-inbox-symbol">
                      {row.symbol}
                    </Link>
                    <span className="meta-dim">
                      {row.close !== null ? `$${row.close.toFixed(2)}` : "—"}
                      {row.buyUnder !== null ? ` / $${row.buyUnder.toFixed(2)}` : ""}
                    </span>
                    {row.distancePct !== null ? (
                      <Badge variant={row.inBand ? "success" : "neutral"}>
                        {row.inBand ? "in band" : `${row.distancePct > 0 ? "+" : ""}${row.distancePct}%`}
                      </Badge>
                    ) : (
                      <Badge
                        variant="warning"
                        title={`Missing: ${[row.close === null ? "close price" : null, row.buyUnder === null ? "buy-under" : null].filter(Boolean).join(", ")}`}
                      >
                        {row.close === null ? "no price data" : "no buy-under"}
                      </Badge>
                    )}
                  </div>
                ))}
                {watchlistBand.length > 0 && !watchlistBand.some((r) => r.inBand) && (
                  <p className="meta-dim" style={{ marginTop: "4px" }}>
                    Closest to trigger: {watchlistBand[0].symbol}{" "}
                    {watchlistBand[0].distancePct !== null ? `+${watchlistBand[0].distancePct}%` : ""}
                  </p>
                )}
              </div>
            )}
          </Panel>
        </div>

        <div className="dashboard-tripwire-decay">
          <Panel>
            <h2>Tripwire &amp; Decay Alerts</h2>
            {alerts.length === 0 ? (
              <EmptyState title="No Active Alerts" body="No thesis-decay or tripwire rules have fired recently." />
            ) : (
              <div className="flex flex-col gap-1">
                {alerts.map((a, idx) => (
                  <div key={idx} className="dashboard-alert-row">
                    <Badge variant={severityVariant(a.severity)}>{a.severity.toUpperCase()}</Badge>
                    <span style={{ fontSize: "0.8125rem" }}>
                      {a.symbol && (
                        <Link href={`/tickers/${a.symbol}`} className="font-mono">
                          {a.symbol}
                        </Link>
                      )}{" "}
                      {a.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <h3 style={{ marginTop: "16px" }}>Catalysts (7d)</h3>
            {catalysts.length === 0 ? (
              <p className="meta-dim">Quiet — no dated catalysts in the next 7 days.</p>
            ) : (
              <ul className="themes-catalyst-list">
                {catalysts.map((c, idx) => (
                  <li key={idx} className="meta-dim">
                    {c.d ?? "—"} · {c.symbol ?? "market"} · {c.title}
                  </li>
                ))}
              </ul>
            )}
            {data.capex && (
              <>
                <h3 style={{ marginTop: "16px" }}>Hyperscaler capex</h3>
                <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                  <span className="font-mono" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {data.capex.combinedTtm !== null
                      ? `$${(data.capex.combinedTtm / 1e9).toFixed(0)}B TTM`
                      : "TTM —"}
                  </span>
                  {data.capex.combinedYoyPct !== null ? (
                    <Badge variant={data.capex.combinedYoyPct >= 0 ? "success" : "danger"}>
                      {data.capex.combinedYoyPct >= 0 ? "+" : ""}
                      {data.capex.combinedYoyPct}% YoY
                    </Badge>
                  ) : (
                    <Badge variant="warning" title={data.capex.warnings.join("; ")}>YoY unavailable</Badge>
                  )}
                  {data.capex.names.map((n) => (
                    <span key={n.symbol} className="meta-dim" style={{ fontSize: "0.75rem" }}>
                      {n.symbol}{" "}
                      {n.yoyGrowthPct !== null ? `${n.yoyGrowthPct >= 0 ? "+" : ""}${n.yoyGrowthPct}%` : "—"}
                    </span>
                  ))}
                </div>
                <p className="meta-dim" style={{ marginTop: "4px" }}>
                  Shown because an AI-subtheme name is held or watchlisted.{" "}
                  <Link href="/themes/ai">Full scorecard →</Link>
                </p>
              </>
            )}
          </Panel>
        </div>

        <div className="dashboard-digest-insights">
          <Panel>
            <h2>Digest Insights</h2>
            {!digest ? (
              <EmptyState
                title="No Digest Available"
                body="Run the overnight job (or click Refresh digest in the sidebar) to synthesize the latest market read."
              />
            ) : (
              <div className="flex flex-col gap-2">
                <p className="meta-dim">
                  {digest.d} · {digest.headline}
                </p>
                {digest.data.insights.slice(0, 8).map((i, idx) => (
                  <div key={idx} className="dashboard-insight-row">
                    <Badge variant={severityVariant(i.severity)}>{i.severity.toUpperCase()}</Badge>
                    <div>
                      <div style={{ fontSize: "0.8125rem" }}>{i.text}</div>
                      <div className="evidence">{i.evidence}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="dashboard-calibration">
          <Panel>
            <h2>Calibration</h2>
            {governor.tiers.every((t) => t.total === 0) ? (
              <EmptyState title="No Recommendation Calls Yet" body="Governor tiers populate once dossiers log RecCall verdicts." />
            ) : (
              <div className="flex flex-col gap-2">
                {governor.tiers.map((t) => (
                  <div key={t.tier} className="flex items-center justify-between">
                    <span className="font-sans" style={{ fontSize: "0.8125rem" }}>{t.tier}</span>
                    <Badge variant={t.capLifted ? "success" : "neutral"}>{t.statusLine}</Badge>
                  </div>
                ))}
              </div>
            )}
            <Link href="/journal" className="meta-dim" style={{ display: "inline-block", marginTop: "12px" }}>
              Full governor console →
            </Link>
          </Panel>
        </div>

        <div className="dashboard-portfolio-snap">
          <Panel>
            <h2>Portfolio Snapshot</h2>
            {governor.positionsCount === 0 ? (
              <EmptyState
                title="No Held Positions"
                body="Add a position from the Portfolio page to start tracking thesis-decay and P&L here."
                actions={[{ label: "Go to Portfolio", href: "/portfolio" }]}
              />
            ) : (
              <DenseTable>
                <TableHead>
                  <TableRow>
                    <TableCell isHeader>Symbol</TableCell>
                    <TableCell isHeader numeric>Market value</TableCell>
                    <TableCell isHeader numeric>P&amp;L %</TableCell>
                    <TableCell isHeader>Alerts</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.positions.map((p) => (
                    <TableRow key={p.symbol}>
                      <TableCell>
                        <Link href={`/tickers/${p.symbol}`} className="font-mono">
                          {p.symbol}
                        </Link>
                      </TableCell>
                      <TableCell numeric>
                        {p.marketValue !== null ? (
                          `$${p.marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        ) : (
                          <Badge variant="warning" title="Missing: latest close price">no price</Badge>
                        )}
                      </TableCell>
                      <TableCell numeric>
                        <TrendNumber value={p.pnlPct} />
                      </TableCell>
                      <TableCell>
                        {p.alertCount > 0 ? <Badge variant="warning">{p.alertCount}</Badge> : <span className="muted">clean</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DenseTable>
            )}
            <Link href="/portfolio" className="meta-dim" style={{ display: "inline-block", marginTop: "12px" }}>
              Full portfolio →
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
