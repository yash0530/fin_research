"use client";

import { useState, useCallback } from "react";
import type { StoryPageData, CycleStripData, ScenarioPreset } from "@/lib/story-types";
import { impliedPrice } from "@/lib/story-types";
import { CycleStrip } from "./CycleStrip";

/**
 * Interactive scenario estimator — restyled to match reference-micron.html.
 * Math: impliedPrice = revenue × margin × P/E ÷ sharesOut (per engine formula).
 * The sliders let users drag revenue (two quarters), margin, and P/E; preset
 * buttons snap to bear/base/bull scenarios.
 */
export function StoryEstimator({ data }: { data: StoryPageData }) {
  const shares = data.scenarios.base.sharesOut;
  const currentPrice = data.priceAtBuild;

  // Slider state: revenue (two quarters), margin (decimal), pe
  const base = data.scenarios.base;
  const [q1Rev, setQ1Rev] = useState(base.revenue);
  const [q2Rev, setQ2Rev] = useState(
    data.presets && data.presets.length >= 2
      ? data.presets[1].scenario.revenue + 5 // approximate Q2 from bull
      : base.revenue * 1.1
  );
  const [margin, setMargin] = useState(base.margin * 100); // display as %
  const [pe, setPe] = useState(base.pe);

  const marginDec = margin / 100;

  // EPS per quarter = (rev × margin) / shares
  const eps1 = (q1Rev * marginDec) / shares;
  const eps2 = (q2Rev * marginDec) / shares;
  const annualEps = (eps1 + eps2) * 2;
  const price = annualEps * pe;
  const upside = currentPrice > 0 ? ((price / currentPrice) - 1) * 100 : 0;

  // Cycle strip position from P/E: 4 to 25 range → 0..1
  const stripPosition = Math.max(0, Math.min(1, (pe - 4) / 21));

  // Dynamic cycle strip with current marker
  const dynamicStrip: CycleStripData = {
    ...data.cycleStrip,
    position: stripPosition,
  };

  // Regime description
  let regime: string;
  if (pe < 8) {
    regime = "Cyclical-peak zone: earnings near the top, so the market deliberately assigns a low multiple.";
  } else if (pe < 12) {
    regime = "Elevated-peak zone: roughly where Micron trades today (~9.8x), a touch above its classic peak band.";
  } else if (pe < 18) {
    regime = "Mid-cycle zone: this multiple appears as earnings normalize off the peak, or if Micron re-rates as a secular grower.";
  } else {
    regime = "Downturn zone: historically these high multiples coincide with collapsed earnings — a buy-the-dip region, not a high-price one.";
  }

  // Callout: what it takes to reach a target
  const target = 1500;
  const peNeeded = target / annualEps;
  const epsNeeded = target / pe;

  // Preset matching
  const presets = data.presets ?? [
    { label: "Bear", scenario: data.scenarios.bear },
    { label: "Base", scenario: data.scenarios.base },
    { label: "Bull", scenario: data.scenarios.bull },
  ];

  const [activePreset, setActivePreset] = useState<string | null>("Guidance base");

  const applyPreset = useCallback(
    (p: ScenarioPreset) => {
      setQ1Rev(p.scenario.revenue);
      setQ2Rev(p.scenario.revenue * 1.1); // approximate
      setMargin(p.scenario.margin * 100);
      setPe(p.scenario.pe);
      setActivePreset(p.label);
    },
    []
  );

  const handleSliderChange = useCallback(() => {
    setActivePreset(null);
  }, []);

  return (
    <div className="est">
      <div className="est-top">
        <div className="est-price num">
          ${Math.round(price).toLocaleString()}
        </div>
        <div
          className="est-upside num"
          style={{ color: upside >= 0 ? "var(--pos)" : "var(--neg)" }}
        >
          {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% vs current
        </div>
      </div>
      <div className="reln num">
        Current price ${currentPrice.toLocaleString()} · ~{shares.toFixed(2)}B diluted shares · today&apos;s forward P/E ~{data.scenarios.base.pe}x
      </div>

      <div className="chips">
        <div className="chip">
          <div className="k">Q4 FY26 EPS</div>
          <div className="v num">${eps1.toFixed(2)}</div>
        </div>
        <div className="chip">
          <div className="k">Q1 FY27 EPS</div>
          <div className="v num">${eps2.toFixed(2)}</div>
        </div>
        <div className="chip">
          <div className="k">Annualized EPS</div>
          <div className="v num">${Math.round(annualEps).toLocaleString()}</div>
        </div>
      </div>

      <div className="presets">
        {presets.map((p) => (
          <button
            key={p.label}
            className={activePreset === p.label ? "on" : ""}
            onClick={() => applyPreset(p)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="slider-row">
        <label htmlFor="story-q1rev">Q4 FY26 revenue</label>
        <input
          type="range"
          id="story-q1rev"
          min={30}
          max={70}
          step={1}
          value={q1Rev}
          onChange={(e) => {
            setQ1Rev(Number(e.target.value));
            handleSliderChange();
          }}
        />
        <span className="val num">${q1Rev}B</span>
      </div>

      <div className="slider-row">
        <label htmlFor="story-q2rev">Q1 FY27 revenue</label>
        <input
          type="range"
          id="story-q2rev"
          min={30}
          max={80}
          step={1}
          value={q2Rev}
          onChange={(e) => {
            setQ2Rev(Number(e.target.value));
            handleSliderChange();
          }}
        />
        <span className="val num">${q2Rev}B</span>
      </div>

      <div className="slider-row">
        <label htmlFor="story-margin">Net margin</label>
        <input
          type="range"
          id="story-margin"
          min={30}
          max={75}
          step={1}
          value={margin}
          onChange={(e) => {
            setMargin(Number(e.target.value));
            handleSliderChange();
          }}
        />
        <span className="val num">{Math.round(margin)}%</span>
      </div>

      <div className="slider-row">
        <label htmlFor="story-pe">Forward P/E</label>
        <input
          type="range"
          id="story-pe"
          min={4}
          max={25}
          step={0.5}
          value={pe}
          onChange={(e) => {
            setPe(Number(e.target.value));
            handleSliderChange();
          }}
        />
        <span className="val num">{pe.toFixed(1)}x</span>
      </div>

      <CycleStrip data={dynamicStrip} style={{ marginTop: 24 }} />

      <div className="regime">{regime}</div>

      <div className="callout">
        <b>To reach ${target.toLocaleString()} from here:</b>{" "}
        hold this earnings assumption and the forward P/E would need to be{" "}
        <b>{peNeeded.toFixed(1)}x</b> — or hold {pe.toFixed(1)}x and
        annualized EPS would need to climb to{" "}
        <b>${Math.round(epsNeeded).toLocaleString()}</b> (vs $
        {Math.round(annualEps).toLocaleString()} now).
      </div>
    </div>
  );
}
