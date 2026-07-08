"use client";

import { useState } from "react";
import Link from "next/link";
import { watchCandidateAction, archiveCandidateAction } from "@/app/actions";
import { TierTag } from "./ui/TierTag";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { Disclosure } from "./ui/Disclosure";
import type { InboxCandidateRow } from "@/lib/dashboard-data";

// Client island for the dashboard's Sourcing Inbox panel: deduped Candidate rows
// (userState=INBOX, tier 1-2) with +Watch / Archive server actions, plus a
// collapsed "killed by quality" log of tier-3 (sourced-but-unqualified) rows.

function InboxRow({
  row,
  busy,
  onAct,
}: {
  row: InboxCandidateRow;
  busy: boolean;
  onAct: (symbol: string, kind: "watch" | "archive") => void;
}) {
  return (
    <div className="dashboard-inbox-row">
      <div className="flex items-center gap-2">
        <Link href={`/tickers/${row.symbol}`} className="font-mono dashboard-inbox-symbol">
          {row.symbol}
        </Link>
        <TierTag tier={String(row.tier)} />
        {row.close !== null && <span className="meta-dim">${row.close.toFixed(2)}</span>}
        <div className="flex items-center gap-1 flex-wrap">
          {row.triggerTags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="neutral">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          disabled={busy}
          onClick={() => onAct(row.symbol, "watch")}
          className="ui-runstatusbar-btn"
        >
          + Watch
        </button>
        <button
          disabled={busy}
          onClick={() => onAct(row.symbol, "archive")}
          className="ui-runstatusbar-btn"
        >
          Archive
        </button>
      </div>
    </div>
  );
}

export function SourcingInbox({
  rows,
  killedByQuality,
}: {
  rows: InboxCandidateRow[];
  killedByQuality: InboxCandidateRow[];
}) {
  const [items, setItems] = useState(rows);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(symbol: string, kind: "watch" | "archive") {
    setBusy(symbol);
    setError(null);
    try {
      const res = await (kind === "watch" ? watchCandidateAction(symbol) : archiveCandidateAction(symbol));
      if (res.ok) {
        setItems((cur) => cur.filter((r) => r.symbol !== symbol));
      } else {
        setError(res.error || "Action failed");
      }
    } catch (err: any) {
      setError(err?.message || "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="ui-runstatusbar-err">{error}</div>}
      {items.length === 0 ? (
        <EmptyState
          title="Sourcing Inbox Clear"
          body="No new tier-1/2 candidates sourced this week. Run Refresh Data to re-scan the universe for insider clusters, cheap-cohort entrants, and 8-K events."
        />
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((row) => (
            <InboxRow key={row.symbol} row={row} busy={busy === row.symbol} onAct={act} />
          ))}
        </div>
      )}
      {killedByQuality.length > 0 && (
        <Disclosure title={`Killed by quality (${killedByQuality.length})`}>
          <div className="flex flex-col gap-1">
            {killedByQuality.map((row) => (
              <div key={row.symbol} className="dashboard-inbox-row">
                <div className="flex items-center gap-2">
                  <Link href={`/tickers/${row.symbol}`} className="font-mono dashboard-inbox-symbol">
                    {row.symbol}
                  </Link>
                  <span className="meta-dim">{row.qualification || "failed quality gates"}</span>
                </div>
              </div>
            ))}
          </div>
        </Disclosure>
      )}
    </div>
  );
}
