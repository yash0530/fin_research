"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { previewBuyListAction, commitBuyCeremonyAction } from "./actions";
import type { PreviewResult } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { DenseTable, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/DenseTable";
import { EmptyState } from "@/components/ui/EmptyState";
import type { HarvestCandidate } from "@/lib/buy-ceremony-data";
import type { SizedItem } from "@/lib/buy-ceremony-data";

// 4-step monthly buy-ceremony wizard, opened as an overlay from /portfolio.
// step1 watchlist harvest -> step2 live governor sizing -> step3 inversion
// checklist -> step4 printable order sheet (MANUAL broker entry only — no
// broker/order code anywhere in this component or its server actions).

const STEP_LABELS = ["Harvest", "Sizing", "Inversion", "Order Sheet"];

export function BuyCeremony({ harvest, onClose }: { harvest: HarvestCandidate[]; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(harvest.filter((c) => c.inBand).map((c) => c.symbol)),
  );
  const [preview, setPreview] = useState<{ capitalUsd: number; deployedUsd: number; cashUsd: number; items: SizedItem[] } | null>(null);
  const [sizingError, setSizingError] = useState<string | null>(null);
  const [sizingBusy, setSizingBusy] = useState(false);
  const [acks, setAcks] = useState({ q1: false, q2: false, q3: false });
  const [notes, setNotes] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitResult, setCommitResult] = useState<{ ok: boolean; error?: string; month?: string } | null>(null);

  const selectedCount = selected.size;

  function toggle(symbol: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  async function goToSizing() {
    setSizingBusy(true);
    setSizingError(null);
    try {
      const res: PreviewResult = await previewBuyListAction(Array.from(selected));
      if (res.ok) {
        setPreview({ capitalUsd: res.capitalUsd, deployedUsd: res.deployedUsd, cashUsd: res.cashUsd, items: res.items });
        setStep(2);
      } else {
        setSizingError(res.error);
      }
    } catch (err: any) {
      setSizingError(err?.message || "Failed to compute sizing");
    } finally {
      setSizingBusy(false);
    }
  }

  const allAcked = acks.q1 && acks.q2 && acks.q3 && notes.trim().length > 0;

  async function commit() {
    if (!preview) return;
    setCommitBusy(true);
    try {
      const res = await commitBuyCeremonyAction(preview.items, notes);
      setCommitResult(res);
      if (res.ok) router.refresh();
    } catch (err: any) {
      setCommitResult({ ok: false, error: err?.message || "Failed to commit" });
    } finally {
      setCommitBusy(false);
    }
  }

  const orderText = useMemo(() => {
    if (!preview) return "";
    const lines = [
      `MONTHLY BUY CEREMONY — ${new Date().toISOString().slice(0, 7)}`,
      `Capital: $${preview.capitalUsd.toLocaleString()}  Deployed: $${preview.deployedUsd.toLocaleString()}  Cash: $${preview.cashUsd.toLocaleString()}`,
      "",
      "RANK  SYMBOL  CONVICTION  GOVERNED%  SHARES  PRICE     PLANNED",
      ...preview.items
        .filter((i) => !i.skipped)
        .map(
          (i) =>
            `#${String(i.rank).padEnd(4)}${i.symbol.padEnd(8)}${i.conviction.padEnd(12)}${String(i.governedSizePct + "%").padEnd(11)}${String(i.shares ?? "—").padEnd(8)}${(i.close !== null ? "$" + i.close.toFixed(2) : "—").padEnd(10)}$${i.plannedUsd}`,
        ),
      "",
      "MANUAL BROKER ENTRY ONLY. This app places no orders and connects to no broker.",
    ];
    return lines.join("\n");
  }, [preview]);

  return (
    <div className="buy-ceremony-overlay" onClick={onClose}>
      <div className="buy-ceremony-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
          <h2>Monthly Buy Ceremony</h2>
          <button onClick={onClose} className="drawer-close">✕</button>
        </div>

        <div className="flex items-center gap-2" style={{ marginBottom: "16px" }}>
          {STEP_LABELS.map((label, idx) => (
            <Badge key={label} variant={idx + 1 === step ? "success" : idx + 1 < step ? "neutral" : "neutral"}>
              {idx + 1}. {label}
            </Badge>
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <p className="meta-dim">
              Step 1 — Harvest: BUY-verdict RecCalls within the candidate age window. In-band names (close at or
              below the watchlist buy-under) are pre-checked.
            </p>
            {harvest.length === 0 ? (
              <EmptyState
                title="No Harvestable Candidates"
                body="No BUY-verdict dossier calls in the age window. Launch research runs on watchlist names from their ticker pages first."
              />
            ) : (
              <DenseTable>
                <TableHead>
                  <TableRow>
                    <TableCell isHeader></TableCell>
                    <TableCell isHeader>Symbol</TableCell>
                    <TableCell isHeader>Conviction</TableCell>
                    <TableCell isHeader numeric>Judge %</TableCell>
                    <TableCell isHeader numeric>Close</TableCell>
                    <TableCell isHeader numeric>Buy-Under</TableCell>
                    <TableCell isHeader>Band</TableCell>
                    <TableCell isHeader numeric>Age (d)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {harvest.map((c) => (
                    <TableRow key={c.symbol}>
                      <TableCell>
                        <input type="checkbox" checked={selected.has(c.symbol)} onChange={() => toggle(c.symbol)} />
                      </TableCell>
                      <TableCell className="font-mono">{c.symbol}</TableCell>
                      <TableCell>{c.conviction}</TableCell>
                      <TableCell numeric>{c.judgeSizePct}%</TableCell>
                      <TableCell numeric>{c.close !== null ? `$${c.close.toFixed(2)}` : "—"}</TableCell>
                      <TableCell numeric>{c.buyUnder !== null ? `$${c.buyUnder.toFixed(2)}` : "—"}</TableCell>
                      <TableCell>
                        {!c.onWatchlist ? (
                          <Badge variant="neutral">not watchlisted</Badge>
                        ) : c.inBand ? (
                          <Badge variant="success">in band</Badge>
                        ) : (
                          <Badge variant="neutral">{c.distancePct !== null ? `${c.distancePct}%` : "—"}</Badge>
                        )}
                      </TableCell>
                      <TableCell numeric>{c.ageDays}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DenseTable>
            )}
            {sizingError && <div className="ui-runstatusbar-err">{sizingError}</div>}
            <div className="flex justify-between">
              <span className="meta-dim">{selectedCount} selected</span>
              <button className="ui-runstatusbar-btn" disabled={selectedCount === 0 || sizingBusy} onClick={goToSizing}>
                {sizingBusy ? "Sizing…" : "Next: Governor Sizing →"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && preview && (
          <div className="flex flex-col gap-3">
            <p className="meta-dim">
              Step 2 — Governor sizing: recomputed live against the current calibration track record
              (src/calibration/governor.ts) and allocated over this month&apos;s ${preview.capitalUsd.toLocaleString()} capital.
            </p>
            <DenseTable>
              <TableHead>
                <TableRow>
                  <TableCell isHeader numeric>#</TableCell>
                  <TableCell isHeader>Symbol</TableCell>
                  <TableCell isHeader numeric>Judge %</TableCell>
                  <TableCell isHeader numeric>Governed %</TableCell>
                  <TableCell isHeader numeric>Planned $</TableCell>
                  <TableCell isHeader>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.items.map((i) => (
                  <TableRow key={i.symbol}>
                    <TableCell numeric>{i.rank}</TableCell>
                    <TableCell className="font-mono">{i.symbol}</TableCell>
                    <TableCell numeric>{i.judgeSizePct}%</TableCell>
                    <TableCell numeric>{i.governedSizePct}%</TableCell>
                    <TableCell numeric>${i.plannedUsd.toLocaleString()}</TableCell>
                    <TableCell>
                      {i.skipped ? (
                        <Badge variant="warning">below min lot</Badge>
                      ) : i.governorReason ? (
                        <Badge variant="warning" className="">
                          <span title={i.governorReason}>capped</span>
                        </Badge>
                      ) : (
                        <Badge variant="success">full size</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DenseTable>
            <div className="flex justify-between">
              <span className="meta-dim">
                Deployed ${preview.deployedUsd.toLocaleString()} · Cash ${preview.cashUsd.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <button className="ui-runstatusbar-btn" onClick={() => setStep(1)}>← Back</button>
              <button className="ui-runstatusbar-btn" onClick={() => setStep(3)}>Next: Inversion Checklist →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <p className="meta-dim">Step 3 — Munger inversion checklist: acknowledge each before printing the order sheet.</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={acks.q1} onChange={(e) => setAcks((a) => ({ ...a, q1: e.target.checked }))} />
              <span style={{ fontSize: "0.8125rem" }}>What would have to be true for this batch to be a mistake a year from now?</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={acks.q2} onChange={(e) => setAcks((a) => ({ ...a, q2: e.target.checked }))} />
              <span style={{ fontSize: "0.8125rem" }}>What structural bias (recency, FOMO, sunk cost) might be driving this sizing?</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={acks.q3} onChange={(e) => setAcks((a) => ({ ...a, q3: e.target.checked }))} />
              <span style={{ fontSize: "0.8125rem" }}>Have the governor caps and skipped/sub-lot items been reviewed and accepted?</span>
            </label>
            <div className="flex flex-col gap-1">
              <label className="ui-stat-label">Disconfirming notes (frozen into each DecisionSnapshot)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="font-mono"
                style={{
                  width: "100%",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--panel-radius)",
                  padding: "8px 12px",
                  fontSize: "12px",
                  color: "var(--fg-primary)",
                  resize: "vertical",
                }}
                placeholder="What would prove this month's batch wrong?"
              />
            </div>
            <div className="flex justify-between">
              <button className="ui-runstatusbar-btn" onClick={() => setStep(2)}>← Back</button>
              <button className="ui-runstatusbar-btn" disabled={!allAcked} onClick={() => setStep(4)}>
                Next: Order Sheet →
              </button>
            </div>
          </div>
        )}

        {step === 4 && preview && (
          <div className="flex flex-col gap-3">
            <div className="ui-badge ui-badge--critical" style={{ display: "block", padding: "10px" }}>
              MANUAL BROKER ENTRY ONLY — this app never places orders or connects to a broker.
            </div>
            <pre className="drawer-textarea" style={{ minHeight: "220px", whiteSpace: "pre-wrap" }}>{orderText}</pre>
            {commitResult && (
              <div className={commitResult.ok ? "drawer-result-ok" : "drawer-result-error"}>
                {commitResult.ok
                  ? `Logged BuyList ${commitResult.month} + JournalEntry/DecisionSnapshot per position.`
                  : commitResult.error}
              </div>
            )}
            <div className="flex justify-between">
              <button className="ui-runstatusbar-btn" onClick={() => setStep(3)} disabled={commitBusy}>← Back</button>
              <div className="flex gap-2">
                <button
                  className="ui-runstatusbar-btn"
                  onClick={() => navigator.clipboard?.writeText(orderText)}
                >
                  Copy to clipboard
                </button>
                <button className="ui-runstatusbar-btn" disabled={commitBusy || commitResult?.ok} onClick={commit}>
                  {commitBusy ? "Logging…" : "Complete Ceremony & Log"}
                </button>
                {commitResult?.ok && (
                  <button className="ui-runstatusbar-btn" onClick={onClose}>Done</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
