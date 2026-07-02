"use client";

import { useState } from "react";
import { impliedPrice } from "@engine/story/build";
import type { StoryPageData } from "@engine/story/schema";

// Recomputes impliedPrice = revenue × margin × P/E ÷ shares CLIENT-SIDE with the
// engine's exact formula, so archived pages stay deterministic and the sliders
// match the frozen scenario math.
export function ScenarioEstimator({ data }: { data: StoryPageData }) {
  const shares = data.scenarios.base.sharesOut;
  const [rev, setRev] = useState(data.scenarios.base.revenue);
  const [margin, setMargin] = useState(data.scenarios.base.margin);
  const [pe, setPe] = useState(data.scenarios.base.pe);

  const price = impliedPrice({ revenue: rev, margin, pe, sharesOut: shares });
  const upside = data.priceAtBuild > 0 ? ((price - data.priceAtBuild) / data.priceAtBuild) * 100 : 0;

  const preset = (which: "bear" | "base" | "bull") => {
    const s = data.scenarios[which];
    setRev(s.revenue);
    setMargin(s.margin);
    setPe(s.pe);
  };

  return (
    <div className="panel">
      <h2>Scenario estimator</h2>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {(["bear", "base", "bull"] as const).map((w) => (
          <button key={w} onClick={() => preset(w)}>
            {w}
          </button>
        ))}
      </div>
      <label>
        Revenue (${rev.toLocaleString()}M)
        <input type="range" min={15000} max={45000} step={500} value={rev} onChange={(e) => setRev(Number(e.target.value))} />
      </label>
      <label>
        Net margin ({(margin * 100).toFixed(0)}%)
        <input type="range" min={0.05} max={0.5} step={0.01} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
      </label>
      <label>
        P/E ({pe.toFixed(0)}x)
        <input type="range" min={5} max={25} step={1} value={pe} onChange={(e) => setPe(Number(e.target.value))} />
      </label>
      <p style={{ fontSize: "1.25rem", marginTop: "0.75rem" }}>
        Implied price: <strong>${price.toFixed(2)}</strong>{" "}
        <span className={upside >= 0 ? "sev-info" : "sev-critical"}>
          ({upside >= 0 ? "+" : ""}
          {upside.toFixed(1)}% vs ${data.priceAtBuild} at build)
        </span>
      </p>
    </div>
  );
}
