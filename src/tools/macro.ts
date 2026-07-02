// Macro context from local benchmark closes (^VIX ^TNX ^IRX DX-Y.NYB + HYG/IEF
// credit proxy). Pure classifier over the latest reads. Port of macro_context.py.

export type MacroInputs = {
  vix?: number; // CBOE volatility
  tnx?: number; // 10y yield (%)
  irx?: number; // 13-week T-bill (%)
  dxy?: number; // dollar index
  hygIefRatio?: number; // high-yield / treasuries — credit appetite
};

export type MacroContext = {
  regime: "risk_on" | "neutral" | "risk_off";
  yieldCurveInverted: boolean | null;
  notes: string[];
};

export function macroContext(inputs: MacroInputs): MacroContext {
  const notes: string[] = [];
  let score = 0; // + = risk-on, - = risk-off

  if (typeof inputs.vix === "number") {
    if (inputs.vix >= 25) {
      score -= 2;
      notes.push(`VIX ${inputs.vix.toFixed(1)} elevated (fear)`);
    } else if (inputs.vix <= 15) {
      score += 1;
      notes.push(`VIX ${inputs.vix.toFixed(1)} calm`);
    }
  }

  let yieldCurveInverted: boolean | null = null;
  if (typeof inputs.tnx === "number" && typeof inputs.irx === "number") {
    yieldCurveInverted = inputs.irx > inputs.tnx;
    if (yieldCurveInverted) {
      score -= 1;
      notes.push(`Yield curve inverted (${inputs.irx.toFixed(2)}% 3m > ${inputs.tnx.toFixed(2)}% 10y)`);
    }
  }

  if (typeof inputs.hygIefRatio === "number" && inputs.hygIefRatio < 0.42) {
    score -= 1;
    notes.push(`Credit proxy HYG/IEF ${inputs.hygIefRatio.toFixed(2)} soft`);
  }

  const regime = score >= 1 ? "risk_on" : score <= -2 ? "risk_off" : "neutral";
  return { regime, yieldCurveInverted, notes };
}
