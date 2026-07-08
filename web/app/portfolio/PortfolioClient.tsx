"use client";

import { useState } from "react";
import Link from "next/link";
import PositionForm from "./PositionForm";
import { removePositionAction } from "./actions";
import { BuyCeremony } from "./BuyCeremony";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { TrendNumber } from "@/components/ui/TrendNumber";
import { TierTag } from "@/components/ui/TierTag";
import { DenseTable, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/DenseTable";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PortfolioPosition, WatchlistBandGridRow } from "@/lib/portfolio-data";
import type { HarvestCandidate } from "@/lib/buy-ceremony-data";

interface PortfolioClientProps {
  positions: PortfolioPosition[];
  watchlist: WatchlistBandGridRow[];
  harvest: HarvestCandidate[];
  ceremonyDue: boolean;
  buyListMonth: string | null;
}

function thesisHealth(findings: PortfolioPosition["findings"]): { label: string; variant: "success" | "warning" | "danger" } {
  if (findings.some((f) => f.severity === "critical")) return { label: "Weakening", variant: "danger" };
  if (findings.some((f) => f.severity === "warn")) return { label: "Watch", variant: "warning" };
  return { label: "Solid", variant: "success" };
}

function findingVariant(severity: string): "success" | "warning" | "danger" {
  if (severity === "critical") return "danger";
  if (severity === "warn") return "warning";
  return "success";
}

export default function PortfolioClient({ positions, watchlist, harvest, ceremonyDue, buyListMonth }: PortfolioClientProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(positions.length > 0 ? positions[0].symbol : null);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [error, setError] = useState("");

  const handleRemove = async (symbol: string) => {
    if (!confirm(`Remove the ${symbol} position?`)) return;
    setError("");
    try {
      const res = await removePositionAction(symbol);
      if (!res.ok) {
        setError(res.error || "Failed to remove position");
      } else {
        if (selectedSymbol === symbol) {
          const remaining = positions.filter((p) => p.symbol !== symbol);
          setSelectedSymbol(remaining.length > 0 ? remaining[0].symbol : null);
        }
        if (editingPosition?.symbol === symbol) setEditingPosition(null);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    }
  };

  const activePosition = positions.find((p) => p.symbol === selectedSymbol);

  const totalCostBasis = positions.reduce((s, p) => s + p.costBasis, 0);
  const totalMarketValue = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const totalPnlPct = totalCostBasis > 0 ? ((totalMarketValue - totalCostBasis) / totalCostBasis) * 100 : null;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1>Portfolio</h1>
        <p className="muted mt-1">
          Held positions, watchlist buy-band proximity, and the monthly buy ceremony.
        </p>
      </header>

      {error && <div className="ui-runstatusbar-err">{error}</div>}

      <div className="portfolio-grid">
        <div className="portfolio-held-cards">
          <Panel>
            <div className="flex items-center justify-between">
              <h2>Held Positions</h2>
              {positions.length > 0 && (
                <span className="meta-dim">
                  ${totalMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} ·{" "}
                  <TrendNumber value={totalPnlPct} />
                </span>
              )}
            </div>
            {positions.length === 0 ? (
              <EmptyState
                title="No Held Positions"
                body="Add your first position below to start tracking thesis-decay signals and P&L."
              />
            ) : (
              <DenseTable>
                <TableHead>
                  <TableRow>
                    <TableCell isHeader>Symbol</TableCell>
                    <TableCell isHeader numeric>Entry</TableCell>
                    <TableCell isHeader numeric>Current</TableCell>
                    <TableCell isHeader numeric>P&amp;L</TableCell>
                    <TableCell isHeader>Thesis</TableCell>
                    <TableCell isHeader>Decay</TableCell>
                    <TableCell isHeader>Journal</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {positions.map((row) => {
                    const isSelected = row.symbol === selectedSymbol;
                    const health = thesisHealth(row.findings);
                    return (
                      <TableRow
                        key={row.symbol}
                        onClick={() => setSelectedSymbol(row.symbol)}
                        className={`cursor-pointer ${isSelected ? "table-row-selected" : ""}`}
                      >
                        <TableCell>
                          <Link href={`/tickers/${row.symbol}`} onClick={(e) => e.stopPropagation()} className="font-mono font-weight-700">
                            {row.symbol}
                          </Link>
                        </TableCell>
                        <TableCell numeric>${row.avgCost.toFixed(2)}</TableCell>
                        <TableCell numeric>
                          {row.currentPrice !== null ? (
                            `$${row.currentPrice.toFixed(2)}`
                          ) : (
                            <Badge variant="warning" title="Missing: latest close price">no price</Badge>
                          )}
                        </TableCell>
                        <TableCell numeric>
                          <TrendNumber value={row.pnlPct} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={health.variant}>{health.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {row.findings.length === 0 ? (
                              <span className="meta-dim">clean</span>
                            ) : (
                              row.findings.map((f, idx) => (
                                <Badge key={idx} variant={findingVariant(f.severity)} className="" >
                                  <span title={f.message}>{f.kind.replace("_", " ")}</span>
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Link href={`/journal?symbol=${row.symbol}`} className="meta-dim">
                            log →
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </DenseTable>
            )}
          </Panel>

          {activePosition && (
            <Panel>
              <h3 className="text-table-header">Latest Verdict — {activePosition.symbol}</h3>
              {activePosition.latestVerdict ? (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={activePosition.latestVerdict.action === "BUY" ? "success" : activePosition.latestVerdict.action === "AVOID" ? "danger" : "neutral"}>
                      {activePosition.latestVerdict.action} · {activePosition.latestVerdict.conviction}
                    </Badge>
                    {activePosition.latestVerdict.governedSizePct !== null && (
                      <span className="meta-dim">governed {activePosition.latestVerdict.governedSizePct}%</span>
                    )}
                  </div>
                  <div className="meta-dim">
                    Target ${activePosition.latestVerdict.targetLow ?? "—"}–${activePosition.latestVerdict.targetHigh ?? "—"} · Stop{" "}
                    {activePosition.latestVerdict.stopPrice !== null ? `$${activePosition.latestVerdict.stopPrice.toFixed(2)}` : "none"}
                  </div>
                  {activePosition.latestVerdict.what_would_change_mind.length > 0 && (
                    <div>
                      <div className="ui-stat-label mb-1">What would change my mind</div>
                      <ul className="m-0 pl-18 text-13 text-secondary">
                        {activePosition.latestVerdict.what_would_change_mind.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Link href={`/tickers/${activePosition.symbol}#consensus`} className="meta-dim">
                    View full dossier consensus →
                  </Link>
                </div>
              ) : (
                <EmptyState
                  title="No Verdict Yet"
                  body={`No dossier verdict recorded for ${activePosition.symbol}. Launch a research run from its ticker page.`}
                />
              )}
            </Panel>
          )}

          <Panel>
            <h3 className="text-table-header">{editingPosition ? `Edit ${editingPosition.symbol}` : "Add Position"}</h3>
            <PositionForm
              initialSymbol={editingPosition?.symbol || ""}
              initialQty={editingPosition?.qty}
              initialAvgCost={editingPosition?.avgCost}
              initialOpenedAt={editingPosition?.openedAt}
              onSuccess={() => setEditingPosition(null)}
              onCancel={editingPosition ? () => setEditingPosition(null) : undefined}
            />
            {positions.length > 0 && (
              <div className="flex flex-col gap-1 mt-3">
                {positions.map((p) => (
                  <div key={p.symbol} className="flex items-center justify-between">
                    <span className="font-mono text-12">{p.symbol}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingPosition(p)} className="ui-runstatusbar-btn">Edit</button>
                      <button onClick={() => handleRemove(p.symbol)} className="ui-runstatusbar-btn">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="portfolio-watchlist-grid">
          <Panel>
            <h2>Watchlist Valuation Bands</h2>
            {watchlist.length === 0 ? (
              <EmptyState
                title="No Watchlist Entries"
                body="Watch a ticker from its cockpit page and set a buy-under price to populate this grid."
              />
            ) : (
              <DenseTable>
                <TableHead>
                  <TableRow>
                    <TableCell isHeader>Symbol</TableCell>
                    <TableCell isHeader numeric>Current</TableCell>
                    <TableCell isHeader numeric>Buy-Under</TableCell>
                    <TableCell isHeader numeric>Distance</TableCell>
                    <TableCell isHeader>Tier</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {watchlist.map((row) => (
                    <TableRow key={row.symbol}>
                      <TableCell>
                        <Link href={`/tickers/${row.symbol}`} className="font-mono">
                          {row.symbol}
                        </Link>
                      </TableCell>
                      <TableCell numeric>
                        {row.close !== null ? (
                          `$${row.close.toFixed(2)}`
                        ) : (
                          <Badge variant="warning" title="Missing: latest close price">no price</Badge>
                        )}
                      </TableCell>
                      <TableCell numeric>{row.buyUnder !== null ? `$${row.buyUnder.toFixed(2)}` : "—"}</TableCell>
                      <TableCell numeric>
                        {row.distancePct !== null ? (
                          <Badge variant={row.inBand ? "success" : "neutral"}>
                            {row.inBand ? "in band" : `${row.distancePct > 0 ? "+" : ""}${row.distancePct}%`}
                          </Badge>
                        ) : (
                          <Badge
                            variant="warning"
                            title={`Missing: ${[row.close === null ? "close price" : null, row.buyUnder === null ? "buy-under" : null].filter(Boolean).join(", ") || "distance inputs"}`}
                          >
                            n/a
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{row.tier !== null ? <TierTag tier={String(row.tier)} /> : <span className="muted">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DenseTable>
            )}
          </Panel>
        </div>

        <div className="portfolio-governor-ctrl">
          <Panel>
            <div className="flex items-center justify-between">
              <div>
                <h2>Monthly Buy Ceremony</h2>
                <p className="meta-dim mt-1">
                  {buyListMonth
                    ? `Last run: ${buyListMonth}`
                    : "No buy list recorded yet."}
                  {" "}· {harvest.length} BUY-verdict candidate{harvest.length === 1 ? "" : "s"} available to harvest.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {ceremonyDue && <Badge variant="warning">DUE</Badge>}
                <button onClick={() => setWizardOpen(true)} className="ui-runstatusbar-btn">
                  {ceremonyDue ? "Run buy ceremony" : "Open buy ceremony"}
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {wizardOpen && <BuyCeremony harvest={harvest} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
