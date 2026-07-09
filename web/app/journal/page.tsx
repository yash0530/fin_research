import Link from "next/link";
import { listJournalEntriesWithSnapshots, mistakeTaxonomy } from "@/lib/journal-data";
import { listRecCalls, tierSummary, loadScorecard } from "@/lib/calibration-data";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { TrendNumber } from "@/components/ui/TrendNumber";
import { Disclosure } from "@/components/ui/Disclosure";
import { DenseTable, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/DenseTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatStrip } from "@/components/ui/StatStrip";
import { Stat } from "@/components/ui/Stat";
import { JournalEditor } from "./JournalEditor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Props {
  searchParams: Promise<{ symbol?: string }>;
}

function actionVariant(action: string): "success" | "danger" | "warning" | "neutral" {
  const a = (action || "").toUpperCase();
  if (a === "BUY") return "success";
  if (a === "AVOID" || a === "SELL") return "danger";
  if (a === "TRIM") return "warning";
  return "neutral";
}

function convictionVariant(conviction: string): "success" | "warning" | "danger" | "neutral" {
  const c = (conviction || "").toUpperCase();
  if (c === "HIGH") return "success";
  if (c === "MEDIUM") return "warning";
  if (c === "LOW") return "danger";
  return "neutral";
}

export default async function JournalPage({ searchParams }: Props) {
  const { symbol } = await searchParams;
  const filterSymbol = symbol?.trim().toUpperCase();

  const [allEntries, mistakes, tiers, calls, scorecard] = await Promise.all([
    listJournalEntriesWithSnapshots(),
    mistakeTaxonomy(),
    tierSummary(),
    listRecCalls(),
    loadScorecard("3m"),
  ]);

  const entries = filterSymbol ? allEntries.filter((e) => e.symbol === filterSymbol) : allEntries;

  const quarters = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = quarters.get(e.quarter) ?? [];
    list.push(e);
    quarters.set(e.quarter, list);
  }
  const quarterKeys = Array.from(quarters.keys()).sort().reverse();

  const resolvedCalls = calls.filter(
    (c) => c.outcome1mPct !== null || c.outcome3mPct !== null || c.outcome6mPct !== null || c.outcome1yPct !== null,
  );

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1>Journal</h1>
        <p className="muted mt-1">
          Decision log with frozen provenance, post-trade outcomes, mistake taxonomy, and the governor console.
        </p>
        {filterSymbol && (
          <p className="meta-dim mt-1">
            Filtered to {filterSymbol} · <Link href="/journal">clear filter</Link>
          </p>
        )}
      </header>

      <div className="journal-grid">
        <div className="journal-sidebar-log">
          <Panel>
            <h2>Quarterly Review Board</h2>
            {quarterKeys.length === 0 ? (
              <EmptyState
                title="No Journal Entries"
                body="Log your first decision with the editor, or complete the /portfolio buy ceremony — both write a frozen entry here."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {quarterKeys.map((q) => {
                  const rows = quarters.get(q)!;
                  return (
                    <Disclosure key={q} title={`${q} (${rows.length})`} defaultOpen={quarterKeys.indexOf(q) === 0}>
                      <div className="flex flex-col gap-2">
                        {rows.map((e) => (
                          <div key={e.id} className="journal-entry-row">
                            <div className="flex items-center gap-2">
                              <span className="meta-dim">{e.createdAt.slice(0, 10)}</span>
                              <Link href={`/tickers/${e.symbol}`} className="font-mono font-weight-700">
                                {e.symbol}
                              </Link>
                              <Badge variant={actionVariant(e.action)}>{e.action}</Badge>
                            </div>
                            <p className="text-13 text-secondary mt-1 mb-1">{e.thesis}</p>
                            {e.invalidation && (
                              <p className="meta-dim m-0">Invalidation: {e.invalidation}</p>
                            )}
                            {e.snapshot ? (
                              <Disclosure title="Frozen snapshot">
                                <pre className="m-0 text-11 whitespace-pre-wrap">
                                  {JSON.stringify(e.snapshot, null, 2)}
                                </pre>
                              </Disclosure>
                            ) : (
                              <span className="meta-dim">no frozen snapshot</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </Disclosure>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <h2>Mistake Taxonomy</h2>
            <p className="meta-dim mb-2">
              Journal entries whose nearest prior RecCall resolved with a falsified thesis, grouped by action.
            </p>
            {mistakes.length === 0 ? (
              <EmptyState title="No Falsified Theses Logged" body="Mechanical cross-reference of JournalEntry × RecCall.thesisFalsified — clean so far." />
            ) : (
              <div className="flex gap-2 flex-wrap">
                {mistakes.map((m) => (
                  <Badge key={m.action} variant="warning">
                    {m.action}: {m.count}
                  </Badge>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="journal-editor-canvas">
          <Panel>
            <h2>New Entry</h2>
            <JournalEditor initialSymbol={filterSymbol ?? ""} />
          </Panel>

          <Panel>
            <h2>Post-Trade Outcomes</h2>
            {resolvedCalls.length === 0 ? (
              <EmptyState title="No Resolved Calls Yet" body="Outcomes populate once the weekly outcomes job fills 1m/3m/6m/1y returns on RecCall rows." />
            ) : (
              <div className="flex flex-col gap-2">
                {resolvedCalls.map((c) => (
                  <div key={c.id} className="journal-outcome-card">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Link href={`/tickers/${c.symbol}`} className="font-mono font-weight-700">
                          {c.symbol}
                        </Link>
                        <Badge variant={actionVariant(c.action)}>{c.action}</Badge>
                        <Badge variant={convictionVariant(c.conviction)}>{c.conviction}</Badge>
                      </div>
                      {c.thesisFalsified !== null && (
                        <Badge variant={c.thesisFalsified ? "danger" : "success"}>
                          {c.thesisFalsified ? "thesis falsified" : "thesis held"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1">
                      <span className="meta-dim">1M <TrendNumber value={c.outcome1mPct} /></span>
                      <span className="meta-dim">3M <TrendNumber value={c.outcome3mPct} /></span>
                      <span className="meta-dim">6M <TrendNumber value={c.outcome6mPct} /></span>
                      <span className="meta-dim">1Y <TrendNumber value={c.outcome1yPct} /></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <h2>Calibration / Governor Console</h2>
            <p className="meta-dim mb-2">
              The sizing governor caps the Judge&apos;s recommended position size to 2% until a conviction tier earns
              calibration — at least 5 resolved calls with a 50%+ favorable rate lifts the cap.
            </p>

            {scorecard.insufficient ? (
              <EmptyState
                className="mb-4"
                title="Insufficient Calibration Data"
                body="At least 5 resolved calls are required to compute the Brier score, avoid ledger, and streak statistics."
              />
            ) : (
              <>
                <StatStrip className="mb-4">
                  <Stat
                    label="Brier Score"
                    value={scorecard.brier.brier !== null ? scorecard.brier.brier.toFixed(4) : "—"}
                    subValue={
                      scorecard.brier.meanForecast !== null && scorecard.brier.meanOutcome !== null
                        ? `gap: ${Math.abs(scorecard.brier.meanForecast - scorecard.brier.meanOutcome).toFixed(3)} (F: ${scorecard.brier.meanForecast.toFixed(2)} vs O: ${scorecard.brier.meanOutcome.toFixed(2)})`
                        : "—"
                    }
                  />
                  <Stat
                    label="Avoid Hit Rate"
                    value={`${Math.round(scorecard.avoidLedger.hitRate * 100)}%`}
                    subValue={`${scorecard.avoidLedger.goodAvoids} / ${scorecard.avoidLedger.total} good avoids`}
                  />
                  <Stat
                    label="Current Streak"
                    value={`${scorecard.streaks.current.length} ${scorecard.streaks.current.kind}`}
                    subValue={`longest: ${scorecard.streaks.longestCorrect} correct / ${scorecard.streaks.longestIncorrect} incorrect`}
                  />
                </StatStrip>

                {scorecard.avoidLedger.entries.length > 0 && (
                  <div className="mb-4">
                    <Disclosure title={`Avoid Ledger Log (${scorecard.avoidLedger.entries.length})`}>
                      <DenseTable>
                        <TableHead>
                          <TableRow>
                            <TableCell isHeader>Symbol</TableCell>
                            <TableCell isHeader>Avoided At</TableCell>
                            <TableCell isHeader numeric>Outcome</TableCell>
                            <TableCell isHeader>Verdict</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {scorecard.avoidLedger.entries.map((entry, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <Link href={`/tickers/${entry.symbol}`} className="font-mono">
                                  {entry.symbol}
                                </Link>
                              </TableCell>
                              <TableCell>{entry.createdAt.slice(0, 10)}</TableCell>
                              <TableCell numeric><TrendNumber value={entry.outcomePct} /></TableCell>
                              <TableCell>
                                <Badge variant={entry.correct ? "success" : "danger"}>
                                  {entry.correct ? "Good Avoid" : "Bad Avoid"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </DenseTable>
                    </Disclosure>
                  </div>
                )}
              </>
            )}

            <DenseTable>
              <TableHead>
                <TableRow>
                  <TableCell isHeader>Tier</TableCell>
                  <TableCell isHeader numeric>Resolved / Total</TableCell>
                  <TableCell isHeader numeric>Favorable</TableCell>
                  <TableCell isHeader>Cap Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tiers.map((t) => (
                  <TableRow key={t.tier}>
                    <TableCell>
                      <Badge variant={convictionVariant(t.tier)}>{t.tier}</Badge>
                    </TableCell>
                    <TableCell numeric>{t.resolved} / {t.total}</TableCell>
                    <TableCell numeric>{t.favorableRate !== null ? `${Math.round(t.favorableRate * 100)}%` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.capLifted ? "success" : "neutral"}>{t.capLifted ? "LIFTED" : "2.0% CAPPED"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DenseTable>

            {calls.length > 0 && (
              <Disclosure title={`Full recommendation log (${calls.length})`}>
                <DenseTable>
                  <TableHead>
                    <TableRow>
                      <TableCell isHeader>Symbol</TableCell>
                      <TableCell isHeader>Action</TableCell>
                      <TableCell isHeader numeric>Price</TableCell>
                      <TableCell isHeader numeric>Judge → Governed</TableCell>
                      <TableCell isHeader>Reason</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {calls.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/tickers/${c.symbol}#consensus`} className="font-mono">
                            {c.symbol}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionVariant(c.action)}>{c.action}</Badge>
                        </TableCell>
                        <TableCell numeric>${c.priceAtCall.toFixed(2)}</TableCell>
                        <TableCell numeric>{c.judgeSizePct.toFixed(1)}% → {c.governedSizePct.toFixed(1)}%</TableCell>
                        <TableCell>
                          <span className="meta-dim">{c.governorReason || "—"}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DenseTable>
              </Disclosure>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
