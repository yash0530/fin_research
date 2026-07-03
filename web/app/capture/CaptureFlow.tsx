"use client";

// The paste-capture cockpit: render → copy → paste → preview → commit.
// Client state machine only; every mutation goes through the server actions
// (which delegate to the tested engine). Styled with story.css classes.

import { useState } from "react";
import type { CaptureItem } from "@engine/capture/parse";
import { renderCaptureAction, parseCaptureAction, commitCaptureAction } from "./actions";

const TEMPLATES = [
  { key: "daily_scan", label: "Daily scan", hint: "watchlist-wide 72h sweep" },
  { key: "theme_deep_dive", label: "Theme deep dive", hint: "supply/demand + players for a theme" },
  { key: "ticker_check", label: "Ticker check", hint: "focused bull/bear on one symbol" },
  { key: "discovery_sweep", label: "Discovery sweep", hint: "find under-covered names" },
] as const;

type Step = "pick" | "copy" | "preview" | "done";

export default function CaptureFlow() {
  const [step, setStep] = useState<Step>("pick");
  const [template, setTemplate] = useState<string>("daily_scan");
  const [ticker, setTicker] = useState("");
  const [focus, setFocus] = useState("");
  const [captureId, setCaptureId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [raw, setRaw] = useState("");
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [parseStatus, setParseStatus] = useState("");
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doRender = () =>
    run(async () => {
      const r = await renderCaptureAction(template, ticker, focus);
      if ("error" in r) throw new Error(r.error);
      setCaptureId(r.captureId);
      setPrompt(r.prompt);
      setStep("copy");
    });

  const doParse = () =>
    run(async () => {
      if (captureId === null) throw new Error("no capture in flight");
      const r = await parseCaptureAction(captureId, raw);
      if ("error" in r) throw new Error(r.error);
      setItems(r.items);
      setParseStatus(r.parseStatus);
      setAccepted(new Set(r.items.map((_, i) => i)));
      setStep("preview");
    });

  const doCommit = () =>
    run(async () => {
      if (captureId === null) throw new Error("no capture in flight");
      const chosen = items.filter((_, i) => accepted.has(i));
      const r = await commitCaptureAction(captureId, chosen);
      if ("error" in r) throw new Error(r.error);
      setSummary(
        `${r.evidence} evidence item(s) · ${r.discoveries} discovery candidate(s) · ${r.catalysts} catalyst(s)`,
      );
      setStep("done");
    });

  const toggle = (i: number) => {
    const next = new Set(accepted);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setAccepted(next);
  };

  return (
    <div className="capture-flow">
      {error && <p className="chip chip-critical">{error}</p>}

      {step === "pick" && (
        <section className="card">
          <h3>1 · Pick a prompt</h3>
          <div className="capture-templates">
            {TEMPLATES.map((t) => (
              <label key={t.key} className={`chip ${template === t.key ? "chip-accent" : ""}`}>
                <input
                  type="radio"
                  name="template"
                  value={t.key}
                  checked={template === t.key}
                  onChange={() => setTemplate(t.key)}
                />{" "}
                {t.label} <span className="muted">— {t.hint}</span>
              </label>
            ))}
          </div>
          {(template === "ticker_check" || template === "theme_deep_dive" || template === "discovery_sweep") && (
            <div className="capture-inputs">
              {template === "ticker_check" && (
                <input placeholder="Ticker (e.g. MU)" value={ticker} onChange={(e) => setTicker(e.target.value)} />
              )}
              <input placeholder="Focus (optional)" value={focus} onChange={(e) => setFocus(e.target.value)} />
            </div>
          )}
          <button disabled={busy} onClick={doRender}>
            Render prompt
          </button>
        </section>
      )}

      {step === "copy" && (
        <section className="card">
          <h3>2 · Copy into Perplexity / Claude / ChatGPT, then paste the reply</h3>
          <pre className="capture-prompt">{prompt}</pre>
          <button disabled={busy} onClick={() => void navigator.clipboard.writeText(prompt)}>
            Copy prompt
          </button>
          <textarea
            placeholder="Paste the assistant's full reply here…"
            rows={10}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <div className="capture-actions">
            <button disabled={busy || !raw.trim()} onClick={doParse}>
              Parse reply
            </button>
            <button className="ghost" disabled={busy} onClick={() => setStep("pick")}>
              Start over
            </button>
          </div>
        </section>
      )}

      {step === "preview" && (
        <section className="card">
          <h3>
            3 · Review parsed items <span className="muted">(parser: {parseStatus})</span>
          </h3>
          {items.length === 0 ? (
            <p className="muted">
              Nothing parseable — the reply must include the JSON block the prompt asked for. Go back and re-paste,
              or start over.
            </p>
          ) : (
            <ul className="capture-items">
              {items.map((it, i) => (
                <li key={i}>
                  <label>
                    <input type="checkbox" checked={accepted.has(i)} onChange={() => toggle(i)} />
                    <span className={`chip chip-${it.kind}`}>{it.kind}</span>
                    {it.ticker && <strong> {it.ticker} </strong>}
                    <span>{it.text}</span>
                    {it.asOf && <span className="muted"> · {it.asOf}</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="capture-actions">
            <button disabled={busy || accepted.size === 0} onClick={doCommit}>
              Commit {accepted.size} item(s)
            </button>
            <button className="ghost" disabled={busy} onClick={() => setStep("copy")}>
              Back
            </button>
          </div>
        </section>
      )}

      {step === "done" && (
        <section className="card">
          <h3>Committed ✓</h3>
          <p>{summary}</p>
          <p className="muted">
            Evidence is citable in dossiers as paste:{captureId}; unknown tickers are in the discovery queue; dated
            items joined the catalyst calendar.
          </p>
          <button
            onClick={() => {
              setStep("pick");
              setRaw("");
              setItems([]);
              setSummary("");
              setCaptureId(null);
            }}
          >
            New capture
          </button>
        </section>
      )}
    </div>
  );
}
