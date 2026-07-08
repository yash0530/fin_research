"use client";

import { useState } from "react";
import { refreshDigestAction } from "@/app/actions";

// Dashboard banner shown when the latest JobRun/Digest is 10+ days old — offers a
// one-click "while you were out" research run (the existing overnight digest chain:
// data refresh + deterministic synthesis + model narration).

export function WelcomeBackBanner({ staleDays }: { staleDays: number }) {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setMsg(null);
    try {
      const res = await refreshDigestAction();
      setMsg(res.ok ? "Digest run started — this page will update when it finishes." : res.error ?? "Failed to start.");
    } catch {
      setMsg("Failed to start.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="panel dashboard-welcome-banner">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="ui-stat-label">Welcome back</div>
          <div className="text-primary text-14 mt-1">
            It has been <strong>{staleDays} days</strong> since the last data refresh or digest. Prices, filings, and
            the sourcing inbox are stale.
          </div>
        </div>
        <button disabled={pending} onClick={run} className="ui-runstatusbar-btn">
          {pending ? "Starting…" : "Run digest now"}
        </button>
      </div>
      {msg && <div className="meta-dim mt-2">{msg}</div>}
    </div>
  );
}
