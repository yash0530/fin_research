import Link from "next/link";
import { notFound } from "next/navigation";
import { themeView, listThemes, loadCapexScorecard, type CapexScorecard, type RankedDisplayRow } from "@/lib/themes-data";
import { listPendingProposals } from "@/lib/theme-proposals-data";
import { ThemeProposalsSandbox } from "../ThemeProposalsSandbox";
import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { StatStrip } from "@/components/ui/StatStrip";
import { DenseTable, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/DenseTable";
import { ScoreChip } from "@/components/ui/ScoreChip";
import { BandBar } from "@/components/ui/BandBar";
import { Badge } from "@/components/ui/Badge";
import { TierTag } from "@/components/ui/TierTag";
import { Sparkline } from "@/components/ui/Sparkline";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ sub?: string; compare?: string; sandbox?: string }>;
}

function scoreOf(row: RankedDisplayRow, key: "quality" | "valuation" | "momentum"): string {
  const v = row.segments[key];
  return v === null ? "—" : String(v);
}
// Note: BreakdownBar, fscoreFromProvenance, formatCapex, CapexScorecardPanel, RankedTable are omitted here as we're replacing from Props definition down to the beginning of ThemePage. We will keep them exactly as they are.


function BreakdownBar({ row }: { row: RankedDisplayRow }) {
  const segs: { key: "quality" | "valuation" | "momentum"; cls: string }[] = [
    { key: "quality", cls: "breakdown-quality" },
    { key: "valuation", cls: "breakdown-valuation" },
    { key: "momentum", cls: "breakdown-momentum" },
  ];
  return (
    <div className="breakdown-bar" title={`Quality ${scoreOf(row, "quality")} · Valuation ${scoreOf(row, "valuation")} · Momentum ${scoreOf(row, "momentum")}`}>
      {segs.map(({ key, cls }) => {
        const v = row.segments[key];
        return (
          <span
            key={key}
            className={`breakdown-seg ${cls}${v === null ? " breakdown-missing" : ""}`}
            style={{ width: `${Math.max(4, (v ?? 0) / 3)}%` }}
            title={row.subScores[key]}
          />
        );
      })}
    </div>
  );
}

function fscoreFromProvenance(row: RankedDisplayRow): number | null {
  const m = row.subScores.quality.match(/F-Score (\d)\/9/);
  return m ? Number(m[1]) : null;
}

function formatCapex(val: number | null): string {
  if (val === null) return "—";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toLocaleString()}`;
}

function CapexScorecardPanel({ capex }: { capex: CapexScorecard | null }) {
  if (!capex || capex.combinedTtm === null) {
    return (
      <EmptyState
        title="No capex data"
        body="Run Refresh Data to backfill MSFT/AMZN/GOOGL/META fundamentals quarters."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="ui-stat-value">{formatCapex(capex.combinedTtm)}</span>
        {capex.combinedYoyPct !== null ? (
          <Badge variant={capex.combinedYoyPct >= 0 ? "success" : "danger"}>
            {capex.combinedYoyPct >= 0 ? "+" : ""}
            {capex.combinedYoyPct}% YoY
          </Badge>
        ) : (
          <Badge variant="warning" title={capex.warnings.join("; ")}>YoY unavailable</Badge>
        )}
      </div>
      <div className="meta-dim">TTM capex, MSFT+AMZN+GOOGL+META</div>
      <DenseTable>
        <TableBody>
          {capex.names.map((n) => (
            <TableRow key={n.symbol}>
              <TableCell>
                <Link href={`/tickers/${n.symbol}`} className="font-mono">{n.symbol}</Link>
              </TableCell>
              <TableCell numeric>{formatCapex(n.ttmCapex)}</TableCell>
              <TableCell numeric>
                {n.yoyGrowthPct !== null ? (
                  <span className={n.yoyGrowthPct >= 0 ? "sev-ok" : "sev-warn"}>
                    {n.yoyGrowthPct >= 0 ? "+" : ""}
                    {n.yoyGrowthPct}%
                  </span>
                ) : (
                  <Badge variant="warning" title={n.warnings.join("; ") || "YoY growth unavailable"}>—</Badge>
                )}
              </TableCell>
              <TableCell>
                <Sparkline
                  data={n.quarterly.map((q) => q.capex).filter((c): c is number => c !== null)}
                  width={44}
                  height={14}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DenseTable>
      {capex.warnings.length > 0 && (
        <Badge variant="warning" title={capex.warnings.join("; ")}>
          {capex.warnings.length} data note{capex.warnings.length > 1 ? "s" : ""}
        </Badge>
      )}
    </div>
  );
}

function RankedTable({ rows, title }: { rows: RankedDisplayRow[]; title?: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No ranked names"
        body="No tickers in this scope have enough data to rank. Run Refresh Data to pull fundamentals and prices."
      />
    );
  }
  return (
    <div>
      {title && <h3 className="text-table-header themes-compare-title">{title}</h3>}
      <DenseTable>
        <TableHead>
          <TableRow>
            <TableCell isHeader>#</TableCell>
            <TableCell isHeader>Ticker</TableCell>
            <TableCell isHeader>Breakdown</TableCell>
            <TableCell isHeader>Quality</TableCell>
            <TableCell isHeader>Corridor</TableCell>
            <TableCell isHeader>Tags</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const fscore = fscoreFromProvenance(row);
            return (
              <TableRow key={row.symbol}>
                <TableCell numeric>
                  {row.rank}{row.tied ? " (Tied)" : ""}
                </TableCell>
                <TableCell>
                  <Link href={`/tickers/${row.symbol}`} className="font-mono">
                    {row.symbol}
                  </Link>
                  {row.name && <span className="meta-dim themes-ticker-name"> {row.name}</span>}
                </TableCell>
                <TableCell>
                  <BreakdownBar row={row} />
                </TableCell>
                <TableCell>
                  {fscore !== null ? <ScoreChip score={fscore} /> : <span className="muted">—</span>}
                </TableCell>
                <TableCell>
                  {row.close !== null && row.valueLow !== null && row.valueHigh !== null ? (
                    <BandBar current={row.close} low={row.valueLow} high={row.valueHigh} buyUnder={row.buyUnder ?? undefined} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1">
                    {row.tier !== null && <TierTag tier={String(row.tier)} />}
                    {row.triggerTags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="neutral">{tag}</Badge>
                    ))}
                    {row.warnings.length > 0 && (
                      <Badge variant="warning">{row.warnings.length} data note{row.warnings.length > 1 ? "s" : ""}</Badge>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </DenseTable>
      <div className="themes-why-list">
        {rows.slice(0, 10).map((row) => (
          <Disclosure key={row.symbol} title={`Why #${row.rank}${row.tied ? " (Tied)" : ""} — ${row.symbol}`}>
            <ul className="themes-why-details">
              <li><strong>Quality:</strong> {row.subScores.quality}</li>
              <li><strong>Valuation:</strong> {row.subScores.valuation}</li>
              <li><strong>Momentum:</strong> {row.subScores.momentum}</li>
              {row.missing.map((m) => <li key={m} className="sev-warn">Missing — {m}</li>)}
              {row.warnings.map((w) => <li key={w} className="sev-warn">Note — {w}</li>)}
            </ul>
          </Disclosure>
        ))}
      </div>
    </div>
  );
}

export default async function ThemePage({ params, searchParams }: Props) {
  const { code } = await params;
  const { sub, compare, sandbox } = await searchParams;
  const compareCodes = compare?.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2);

  const view = await themeView(code, {
    ...(sub ? { subtheme: sub } : {}),
    ...(compareCodes && compareCodes.length === 2 ? { compare: compareCodes } : {}),
  });
  if (!view) notFound();

  const capex = code === "ai" ? await loadCapexScorecard() : null;

  const { theme, subthemes, intelligence, ranked, silo, warnings, catalysts } = view;

  const allActiveThemes = await listThemes();
  const pendingProposals = await listPendingProposals();

  return (
    <div>
      <h1>{theme.name}</h1>

      <Panel className="themes-intel">
        <StatStrip>
          <Stat
            label="Aggregate valuation"
            value={intelligence.aggregateValuationPctile !== null ? `${intelligence.aggregateValuationPctile}th` : "—"}
            subValue="median cheapness percentile"
          />
          <Stat
            label="Breadth"
            value={intelligence.breadth !== null ? `${intelligence.breadth}%` : "—"}
            subValue="passing quality gates"
          />
          <Stat label="Ranked" value={intelligence.rankedCount} subValue={`${intelligence.siloCount} low-data`} />
          <Stat label="Catalysts 72h" value={catalysts.length} />
        </StatStrip>
        {warnings.length > 0 && (
          <div className="themes-warnings">
            {warnings.map((w) => <Badge key={w} variant="warning">{w}</Badge>)}
          </div>
        )}
      </Panel>

      <div className="themes-grid">
        <aside className="themes-tree-navigation">
          {allActiveThemes.length > 1 && (
            <Panel>
              <div className="text-table-header">Active Themes</div>
              <nav className="themes-tree">
                {allActiveThemes.map((t) => (
                  <Link
                    key={t.code}
                    href={`/themes/${t.code}`}
                    className={`themes-tree-item${code === t.code ? " themes-tree-active" : ""}`}
                  >
                    <span>{t.name}</span>
                  </Link>
                ))}
              </nav>
            </Panel>
          )}
          <Panel>
            <div className="text-table-header">Subthemes</div>
            <nav className="themes-tree">
              <Link href={`/themes/${theme.code}`} className={`themes-tree-item${!sub && !sandbox ? " themes-tree-active" : ""}`}>
                <span>All ({subthemes.reduce((a, s) => a + s.tickerCount, 0)})</span>
              </Link>
              {subthemes.map((s) => (
                <Link
                  key={s.code}
                  href={`/themes/${theme.code}?sub=${s.code}`}
                  className={`themes-tree-item${sub === s.code ? " themes-tree-active" : ""}`}
                >
                  <span>{s.name} ({s.tickerCount})</span>
                  {s.spark.length > 1 && <Sparkline data={s.spark} width={44} height={14} />}
                </Link>
              ))}
              <div style={{ margin: "8px 0", borderTop: "1px solid var(--border-dim)" }} />
              <Link
                href={`/themes/${theme.code}?sandbox=1`}
                className={`themes-tree-item${sandbox ? " themes-tree-active" : ""}`}
              >
                <span>Theme Sandbox ({pendingProposals.length})</span>
              </Link>
            </nav>
            <div className="themes-compare-hint meta-dim">
              Compare: append ?compare=subA,subB
            </div>
          </Panel>
          <Panel>
            <div className="text-table-header">Catalysts (72h)</div>
            {catalysts.length === 0 ? (
              <div className="muted themes-no-catalysts">Quiet — no dated catalysts in window.</div>
            ) : (
              <ul className="themes-catalyst-list">
                {catalysts.slice(0, 8).map((c, i) => (
                  <li key={i} className="meta-dim">
                    {c.d ?? "—"} · {c.symbol ?? "theme"} · {c.title}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {theme.code === "ai" && (
            <Panel>
              <div className="text-table-header">Hyperscaler capex</div>
              <CapexScorecardPanel capex={capex} />
            </Panel>
          )}
        </aside>

        <main className="themes-ranked-table">
          {sandbox ? (
            <Panel>
              <h2 style={{ marginBottom: "16px" }}>Theme Proposals Sandbox</h2>
              <ThemeProposalsSandbox proposals={pendingProposals} />
            </Panel>
          ) : view.compare ? (
            <div className="themes-compare-grid">
              {view.compare.map((c) => (
                <Panel key={c.code}>
                  <RankedTable rows={c.ranked} title={c.name} />
                </Panel>
              ))}
            </div>
          ) : (
            <>
              <Panel>
                <RankedTable rows={ranked} />
              </Panel>
              {silo.length > 0 && (
                <Panel>
                  <h3 className="text-table-header">Insufficient data ({silo.length})</h3>
                  <p className="meta-dim">
                    Not ranked — missing more than one scoring segment. Never silently ranked last.
                  </p>
                  <DenseTable>
                    <TableBody>
                      {silo.map((row) => (
                        <TableRow key={row.symbol}>
                          <TableCell>
                            <Link href={`/tickers/${row.symbol}`} className="font-mono">{row.symbol}</Link>
                          </TableCell>
                          <TableCell><span className="muted">{row.missing.join(" · ")}</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </DenseTable>
                </Panel>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
