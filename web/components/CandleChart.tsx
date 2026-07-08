"use client";

import React, { useState, useRef } from "react";
import { RangeTabs } from "./ui/RangeTabs";
import { Panel } from "./ui/Panel";

export interface ChartEvent {
  type: "insider" | "journal" | "earnings";
  date: string;
  value?: number; // insider tx value in USD
  label?: string;
}

export interface CandleData {
  d: string;
  close: number;
  rawClose: number;
  open?: number;
  high?: number;
  low?: number;
  volume: number;
  ma20: number | null;
  ma50: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
}

interface Props {
  priceSeries: CandleData[];
  events?: ChartEvent[];
  className?: string;
}

export default function CandleChart({ priceSeries = [], events = [], className = "" }: Props) {
  const [selectedRange, setSelectedRange] = useState<string>("1Y");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // 1. Fully parse price data to generate open/high/low if missing
  const parsedPrices: Required<CandleData>[] = priceSeries.map((item, idx) => {
    const open = item.open ?? (idx > 0 ? priceSeries[idx - 1].close : item.close);
    const change = Math.abs(item.close - open);
    const high = item.high ?? (Math.max(open, item.close) + Math.max(change * 0.25, item.close * 0.003));
    const low = item.low ?? (Math.min(open, item.close) - Math.max(change * 0.25, item.close * 0.003));
    return {
      ...item,
      open,
      high,
      low,
      ma20: item.ma20 ?? null,
      ma50: item.ma50 ?? null,
      rsi: item.rsi ?? null,
      macd: item.macd ?? null,
      macdSignal: item.macdSignal ?? null,
      macdHist: item.macdHist ?? null,
    };
  });

  // 2. Slice visible data based on RangeTabs (3M, 1Y, 3Y, 10Y)
  let visiblePrices = parsedPrices;
  if (selectedRange === "3M") {
    visiblePrices = parsedPrices.slice(-63);
  } else if (selectedRange === "1Y") {
    visiblePrices = parsedPrices.slice(-252);
  } else if (selectedRange === "3Y") {
    visiblePrices = parsedPrices.slice(-756);
  } else if (selectedRange === "10Y") {
    visiblePrices = parsedPrices.slice(-2520);
  }

  const N = visiblePrices.length;

  // 3. Layout constraints
  const WIDTH = 840;
  const HEIGHT = 540;
  const MARGIN_LEFT = 55;
  const MARGIN_RIGHT = 55;
  const INNER_WIDTH = WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

  // Pane Y allocations
  const PRICE_TOP = 25;
  const PRICE_HEIGHT = 205;
  const PRICE_BOTTOM = PRICE_TOP + PRICE_HEIGHT;

  const VOL_TOP = 245;
  const VOL_HEIGHT = 50;
  const VOL_BOTTOM = VOL_TOP + VOL_HEIGHT;

  const RSI_TOP = 310;
  const RSI_HEIGHT = 65;
  const RSI_BOTTOM = RSI_TOP + RSI_HEIGHT;

  const MACD_TOP = 390;
  const MACD_HEIGHT = 85;
  const MACD_BOTTOM = MACD_TOP + MACD_HEIGHT;

  // 4. Calculate domains in visible range
  const visibleCloses = visiblePrices.map((p) => p.close);
  const visibleHighs = visiblePrices.map((p) => p.high);
  const visibleLows = visiblePrices.map((p) => p.low);
  const visibleMAs = visiblePrices.flatMap((p) => [p.ma20, p.ma50].filter((v): v is number => v !== null));

  let priceMin = Math.min(...visibleLows, ...visibleMAs);
  let priceMax = Math.max(...visibleHighs, ...visibleMAs);
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  } else {
    const pad = (priceMax - priceMin) * 0.05;
    priceMin = Math.max(0, priceMin - pad);
    priceMax = priceMax + pad;
  }

  const volMax = Math.max(...visiblePrices.map((p) => p.volume), 1);

  const rsiMin = 0;
  const rsiMax = 100;

  const visibleMacd = visiblePrices.flatMap((p) => [p.macd, p.macdSignal, p.macdHist].filter((v): v is number => v !== null));
  let macdMaxAbs = Math.max(...visibleMacd.map(Math.abs), 0.1);
  if (isNaN(macdMaxAbs)) macdMaxAbs = 1.0;

  // 5. Scaling helpers
  const scaleX = (idx: number) => MARGIN_LEFT + (idx + 0.5) * (INNER_WIDTH / Math.max(1, N));
  const scalePriceY = (val: number) => PRICE_BOTTOM - ((val - priceMin) / (priceMax - priceMin)) * PRICE_HEIGHT;
  const scaleVolY = (val: number) => VOL_BOTTOM - (val / volMax) * VOL_HEIGHT;
  const scaleRsiY = (val: number) => RSI_BOTTOM - ((val - rsiMin) / (rsiMax - rsiMin)) * RSI_HEIGHT;
  const scaleMacdY = (val: number) => {
    const mid = MACD_TOP + MACD_HEIGHT / 2;
    return mid - (val / macdMaxAbs) * (MACD_HEIGHT / 2);
  };

  // 6. Interactive crosshair tracking
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgRef.current || N === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const innerX = clientX - MARGIN_LEFT;
    
    if (innerX >= 0 && innerX <= INNER_WIDTH) {
      const idx = Math.floor((innerX / INNER_WIDTH) * N);
      const clampedIdx = Math.max(0, Math.min(N - 1, idx));
      setHoveredIdx(clampedIdx);
    } else {
      setHoveredIdx(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
  };

  // Resolve current active readout point
  const activeIdx = hoveredIdx !== null ? hoveredIdx : N - 1;
  const activePoint = visiblePrices[activeIdx] ?? null;

  // Find events on active date
  const activeEvents = activePoint ? events.filter((evt) => evt.date === activePoint.d) : [];

  // Generate grid ticks
  const generatePriceTicks = () => {
    const ticks = [];
    const step = (priceMax - priceMin) / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(priceMin + step * i);
    }
    return ticks;
  };

  const priceTicks = generatePriceTicks();
  const rsiTicks = [30, 50, 70];
  const macdTicks = [-macdMaxAbs * 0.7, 0, macdMaxAbs * 0.7];

  // Helper for generating line paths
  const generatePath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
  };

  // Technical lines paths
  const ma20Points = visiblePrices
    .map((p, idx) => (p.ma20 ? { x: scaleX(idx), y: scalePriceY(p.ma20) } : null))
    .filter((p): p is { x: number; y: number } => p !== null);

  const ma50Points = visiblePrices
    .map((p, idx) => (p.ma50 ? { x: scaleX(idx), y: scalePriceY(p.ma50) } : null))
    .filter((p): p is { x: number; y: number } => p !== null);

  const rsiPoints = visiblePrices
    .map((p, idx) => (p.rsi ? { x: scaleX(idx), y: scaleRsiY(p.rsi) } : null))
    .filter((p): p is { x: number; y: number } => p !== null);

  const macdPoints = visiblePrices
    .map((p, idx) => (p.macd !== null ? { x: scaleX(idx), y: scaleMacdY(p.macd) } : null))
    .filter((p): p is { x: number; y: number } => p !== null);

  const signalPoints = visiblePrices
    .map((p, idx) => (p.macdSignal !== null ? { x: scaleX(idx), y: scaleMacdY(p.macdSignal) } : null))
    .filter((p): p is { x: number; y: number } => p !== null);

  // Time Axis Labeling logic: select ~5 dates to show on bottom axis
  const getXAxisLabels = () => {
    if (N === 0) return [];
    const labels = [];
    const step = Math.max(1, Math.floor(N / 5));
    for (let i = 0; i < N; i += step) {
      labels.push({ idx: i, date: visiblePrices[i].d });
    }
    // Always include the last one if not already included
    if (labels[labels.length - 1]?.idx !== N - 1) {
      labels.push({ idx: N - 1, date: visiblePrices[N - 1].d });
    }
    return labels;
  };

  const xAxisLabels = getXAxisLabels();

  // Event rendering placement helper
  const getEventGlyph = (evt: ChartEvent, idx: number, visibleHigh: number) => {
    const x = scaleX(idx);
    const y = scalePriceY(visibleHigh) - 16;

    if (evt.type === "insider") {
      const val = evt.value ?? 0;
      // Insider scale size: base 11px, up to 22px
      const size = Math.min(22, 11 + (val / 100000) * 1.2);
      return (
        <g key={`evt-${idx}`}>
          <circle cx={x} cy={y} r={size / 2 + 1} fill="var(--bg-app)" stroke="var(--accent-gold)" strokeWidth={1} />
          <text
            x={x}
            y={y + size / 2.8}
            textAnchor="middle"
            fill="var(--accent-gold)"
            fontSize={size}
            fontWeight="bold"
            style={{ cursor: "pointer" }}
          >
            I
            <title>{`Insider Trade:\n${evt.label ?? "Insider Activity"}\nDate: ${evt.date}`}</title>
          </text>
        </g>
      );
    } else if (evt.type === "journal") {
      return (
        <g key={`evt-${idx}`}>
          <circle cx={x} cy={y} r={7} fill="var(--bg-app)" stroke="var(--accent-blue)" strokeWidth={1} />
          <text
            x={x}
            y={y + 3.5}
            textAnchor="middle"
            fill="var(--accent-blue)"
            fontSize={10}
            fontWeight="bold"
            style={{ cursor: "pointer" }}
          >
            J
            <title>{`Journal Entry:\n${evt.label ?? "Timeline Event"}\nDate: ${evt.date}`}</title>
          </text>
        </g>
      );
    } else {
      // Earnings ◇
      return (
        <g key={`evt-${idx}`}>
          <polygon
            points={`${x},${y - 6} ${x + 6},${y} ${x},${y + 6} ${x - 6},${y}`}
            fill="var(--bg-app)"
            stroke="var(--fg-primary)"
            strokeWidth={1.5}
            style={{ cursor: "pointer" }}
          >
            <title>{`Earnings Release:\n${evt.label ?? "Quarterly Earnings"}\nDate: ${evt.date}`}</title>
          </polygon>
        </g>
      );
    }
  };

  return (
    <div className={`panel candle-chart-panel ${className}`} style={{ padding: "16px", margin: "16px 0 0 0" }}>
      {/* Chart Top Header & HUD */}
      <div className="flex justify-between items-center" style={{ borderBottom: "1px solid var(--border-dim)", paddingBottom: "10px", marginBottom: "12px" }}>
        <div>
          <h3 className="story-h2" style={{ fontSize: "0.85rem", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Technical Terminal Chart
          </h3>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <RangeTabs
            options={["3M", "1Y", "3Y", "10Y"]}
            selected={selectedRange}
            onChange={(val) => {
              setSelectedRange(val);
              setHoveredIdx(null);
            }}
          />
        </div>
      </div>

      {/* HUD Readout Bar */}
      {activePoint && (
        <div
          className="grid font-mono"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(85px, 1fr))",
            gap: "8px",
            background: "var(--bg-sidebar)",
            border: "1px solid var(--border-dim)",
            borderRadius: "3px",
            padding: "8px 12px",
            fontSize: "11px",
            color: "var(--fg-secondary)",
            marginBottom: "12px",
            lineHeight: 1.4,
          }}
        >
          <div>
            <span style={{ color: "var(--fg-muted)" }}>DATE:</span>{" "}
            <span style={{ color: "var(--fg-primary)", fontWeight: 600 }}>{activePoint.d}</span>
          </div>
          <div>
            <span style={{ color: "var(--fg-muted)" }}>OPEN:</span>{" "}
            <span style={{ color: "var(--fg-primary)" }}>{activePoint.open.toFixed(2)}</span>
          </div>
          <div>
            <span style={{ color: "var(--fg-muted)" }}>HIGH:</span>{" "}
            <span style={{ color: "var(--green-text)" }}>{activePoint.high.toFixed(2)}</span>
          </div>
          <div>
            <span style={{ color: "var(--fg-muted)" }}>LOW:</span>{" "}
            <span style={{ color: "var(--red-text)" }}>{activePoint.low.toFixed(2)}</span>
          </div>
          <div>
            <span style={{ color: "var(--fg-muted)" }}>CLOSE:</span>{" "}
            <span style={{ color: "var(--fg-primary)", fontWeight: 600 }}>{activePoint.close.toFixed(2)}</span>
          </div>
          <div>
            <span style={{ color: "var(--fg-muted)" }}>VOL:</span>{" "}
            <span>{(activePoint.volume / 1e6).toFixed(2)}M</span>
          </div>
          <div>
            <span style={{ color: "var(--fg-muted)" }}>MA20:</span>{" "}
            <span style={{ color: "#70a6ff" }}>{activePoint.ma20 ? activePoint.ma20.toFixed(2) : "—"}</span>
          </div>
          <div>
            <span style={{ color: "var(--fg-muted)" }}>MA50:</span>{" "}
            <span style={{ color: "var(--accent-gold)" }}>{activePoint.ma50 ? activePoint.ma50.toFixed(2) : "—"}</span>
          </div>
          <div>
            <span style={{ color: "var(--fg-muted)" }}>RSI:</span>{" "}
            <span
              style={{
                color: activePoint.rsi && activePoint.rsi > 70 ? "var(--red-text)" : activePoint.rsi && activePoint.rsi < 30 ? "var(--green-text)" : "#b074f7",
                fontWeight: activePoint.rsi && (activePoint.rsi > 70 || activePoint.rsi < 30) ? 600 : 400,
              }}
            >
              {activePoint.rsi ? activePoint.rsi.toFixed(1) : "—"}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--fg-muted)" }}>MACD:</span>{" "}
            <span style={{ color: "var(--accent-blue)" }}>{activePoint.macd ? activePoint.macd.toFixed(3) : "—"}</span>
          </div>
        </div>
      )}

      {/* Floating details readout for events on hovered date */}
      {activeEvents.length > 0 && (
        <div
          className="font-sans"
          style={{
            background: "var(--bg-elevated)",
            borderLeft: "3px solid var(--accent-gold)",
            borderRadius: "3px",
            padding: "8px 12px",
            fontSize: "11px",
            marginBottom: "12px",
            color: "var(--fg-primary)",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--accent-gold)", textTransform: "uppercase", marginBottom: "4px" }}>
            Filing / Insider / Journal Events on {activePoint?.d}
          </div>
          {activeEvents.map((evt, idx) => (
            <div key={idx} style={{ padding: "2px 0" }}>
              <span style={{ fontWeight: 600, color: evt.type === "insider" ? "var(--accent-gold)" : evt.type === "journal" ? "var(--accent-blue)" : "var(--fg-primary)" }}>
                [{evt.type.toUpperCase()}]
              </span>{" "}
              {evt.label}
            </div>
          ))}
        </div>
      )}

      {/* SVG Canvas Area */}
      <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
        <svg
          ref={svgRef}
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ display: "block", background: "var(--bg-app)", userSelect: "none" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Defs for clipping and grid lines */}
          <defs>
            <clipPath id="chart-area-clip">
              <rect x={MARGIN_LEFT} y={0} width={INNER_WIDTH} height={HEIGHT} />
            </clipPath>
          </defs>

          {/* ==================== PANEL OUTLINES & LABELS ==================== */}
          {/* Price Pane */}
          <rect x={MARGIN_LEFT} y={PRICE_TOP} width={INNER_WIDTH} height={PRICE_HEIGHT} fill="none" stroke="var(--border-dim)" strokeWidth={1} />
          <text x={MARGIN_LEFT + 10} y={PRICE_TOP + 15} fontSize={10} fill="var(--fg-muted)" fontWeight="600" fontFamily="var(--font-sans)">
            PRICE & OVERLAYS
          </text>

          {/* Volume Pane */}
          <rect x={MARGIN_LEFT} y={VOL_TOP} width={INNER_WIDTH} height={VOL_HEIGHT} fill="none" stroke="var(--border-dim)" strokeWidth={1} />
          <text x={MARGIN_LEFT + 10} y={VOL_TOP + 15} fontSize={10} fill="var(--fg-muted)" fontWeight="600" fontFamily="var(--font-sans)">
            VOLUME
          </text>

          {/* RSI Pane */}
          <rect x={MARGIN_LEFT} y={RSI_TOP} width={INNER_WIDTH} height={RSI_HEIGHT} fill="none" stroke="var(--border-dim)" strokeWidth={1} />
          <text x={MARGIN_LEFT + 10} y={RSI_TOP + 15} fontSize={10} fill="var(--fg-muted)" fontWeight="600" fontFamily="var(--font-sans)">
            RSI (14)
          </text>

          {/* MACD Pane */}
          <rect x={MARGIN_LEFT} y={MACD_TOP} width={INNER_WIDTH} height={MACD_HEIGHT} fill="none" stroke="var(--border-dim)" strokeWidth={1} />
          <text x={MARGIN_LEFT + 10} y={MACD_TOP + 15} fontSize={10} fill="var(--fg-muted)" fontWeight="600" fontFamily="var(--font-sans)">
            MACD (12, 26, 9)
          </text>

          {/* ==================== PRICE PANE ELEMENTS ==================== */}
          {/* Price Grid & Y-Axis */}
          {priceTicks.map((tick, i) => {
            const y = scalePriceY(tick);
            return (
              <g key={`price-grid-${i}`}>
                <line x1={MARGIN_LEFT} y1={y} x2={WIDTH - MARGIN_RIGHT} y2={y} stroke="var(--border-dim)" strokeDasharray="2 4" strokeWidth={0.5} />
                <text x={MARGIN_LEFT - 8} y={y + 3.5} textAnchor="end" fontSize={9} fill="var(--fg-muted)" fontFamily="var(--font-mono)">
                  ${tick.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Candles */}
          {visiblePrices.map((item, idx) => {
            const x = scaleX(idx);
            const yHigh = scalePriceY(item.high);
            const yLow = scalePriceY(item.low);
            const yOpen = scalePriceY(item.open);
            const yClose = scalePriceY(item.close);
            
            const isBullish = item.close >= item.open;
            const color = isBullish ? "var(--green-text)" : "var(--red-text)";
            const fill = isBullish ? "none" : "var(--red-text)";
            
            // Candle body rect dimensions
            const candleWidth = Math.max(1.5, (INNER_WIDTH / Math.max(1, N)) * 0.7);
            const rectY = Math.min(yOpen, yClose);
            const rectHeight = Math.max(1, Math.abs(yOpen - yClose));

            return (
              <g key={`candle-${idx}`}>
                {/* Wicks */}
                <line x1={x} y1={yLow} x2={x} y2={yHigh} stroke={color} strokeWidth={1} />
                {/* Body */}
                <rect
                  x={x - candleWidth / 2}
                  y={rectY}
                  width={candleWidth}
                  height={rectHeight}
                  fill={fill}
                  stroke={color}
                  strokeWidth={1.2}
                />
              </g>
            );
          })}

          {/* Moving Average Lines */}
          {ma20Points.length > 0 && (
            <path d={generatePath(ma20Points)} fill="none" stroke="#70a6ff" strokeWidth={1.2} />
          )}
          {ma50Points.length > 0 && (
            <path d={generatePath(ma50Points)} fill="none" stroke="var(--accent-gold)" strokeWidth={1.2} />
          )}

          {/* Event Glyphs Placement */}
          {visiblePrices.map((item, idx) => {
            const dayEvents = events.filter((e) => e.date === item.d);
            return dayEvents.map((evt, eIdx) => getEventGlyph(evt, idx, item.high));
          })}

          {/* ==================== VOLUME PANE ELEMENTS ==================== */}
          {visiblePrices.map((item, idx) => {
            const x = scaleX(idx);
            const yVol = scaleVolY(item.volume);
            const isBullish = item.close >= item.open;
            const fill = isBullish ? "var(--green-bg)" : "var(--red-bg)";
            const stroke = isBullish ? "var(--green-border)" : "var(--red-border)";
            const barWidth = Math.max(1.5, (INNER_WIDTH / Math.max(1, N)) * 0.7);

            return (
              <rect
                key={`vol-${idx}`}
                x={x - barWidth / 2}
                y={yVol}
                width={barWidth}
                height={VOL_BOTTOM - yVol}
                fill={fill}
                stroke={stroke}
                strokeWidth={0.5}
              />
            );
          })}
          <text x={WIDTH - MARGIN_RIGHT + 6} y={VOL_TOP + 12} fontSize={9} fill="var(--fg-muted)" fontFamily="var(--font-mono)">
            MAX: {(volMax / 1e6).toFixed(1)}M
          </text>

          {/* ==================== RSI PANE ELEMENTS ==================== */}
          {/* RSI horizontal bands (30, 70) */}
          <line x1={MARGIN_LEFT} y1={scaleRsiY(70)} x2={WIDTH - MARGIN_RIGHT} y2={scaleRsiY(70)} stroke="var(--red-border)" strokeWidth={1} strokeDasharray="3 3" />
          <line x1={MARGIN_LEFT} y1={scaleRsiY(50)} x2={WIDTH - MARGIN_RIGHT} y2={scaleRsiY(50)} stroke="var(--border-dim)" strokeWidth={0.5} strokeDasharray="1 4" />
          <line x1={MARGIN_LEFT} y1={scaleRsiY(30)} x2={WIDTH - MARGIN_RIGHT} y2={scaleRsiY(30)} stroke="var(--green-border)" strokeWidth={1} strokeDasharray="3 3" />
          
          {rsiTicks.map((tick) => (
            <text key={`rsi-tick-${tick}`} x={MARGIN_LEFT - 8} y={scaleRsiY(tick) + 3} textAnchor="end" fontSize={9} fill="var(--fg-muted)" fontFamily="var(--font-mono)">
              {tick}
            </text>
          ))}

          {/* RSI line */}
          {rsiPoints.length > 0 && (
            <path d={generatePath(rsiPoints)} fill="none" stroke="#b074f7" strokeWidth={1.2} />
          )}

          {/* ==================== MACD PANE ELEMENTS ==================== */}
          {/* Zero line */}
          <line x1={MARGIN_LEFT} y1={scaleMacdY(0)} x2={WIDTH - MARGIN_RIGHT} y2={scaleMacdY(0)} stroke="var(--border-dim)" strokeWidth={1} />
          
          {/* MACD Y ticks */}
          {macdTicks.map((tick, idx) => (
            <text key={`macd-tick-${idx}`} x={MARGIN_LEFT - 8} y={scaleMacdY(tick) + 3} textAnchor="end" fontSize={9} fill="var(--fg-muted)" fontFamily="var(--font-mono)">
              {tick.toFixed(2)}
            </text>
          ))}

          {/* Histogram bars */}
          {visiblePrices.map((item, idx) => {
            if (item.macdHist === null) return null;
            const x = scaleX(idx);
            const yZero = scaleMacdY(0);
            const yHist = scaleMacdY(item.macdHist);
            const isPositive = item.macdHist >= 0;
            const color = isPositive ? "var(--green-text)" : "var(--red-text)";
            const fill = isPositive ? "var(--green-bg)" : "var(--red-bg)";
            const barWidth = Math.max(1, (INNER_WIDTH / Math.max(1, N)) * 0.6);

            return (
              <rect
                key={`macd-hist-${idx}`}
                x={x - barWidth / 2}
                y={isPositive ? yHist : yZero}
                width={barWidth}
                height={Math.max(1, Math.abs(yZero - yHist))}
                fill={fill}
                stroke={color}
                strokeWidth={0.5}
              />
            );
          })}

          {/* MACD and Signal lines */}
          {macdPoints.length > 0 && (
            <path d={generatePath(macdPoints)} fill="none" stroke="var(--accent-blue)" strokeWidth={1.2} />
          )}
          {signalPoints.length > 0 && (
            <path d={generatePath(signalPoints)} fill="none" stroke="var(--accent-gold)" strokeWidth={1.2} />
          )}

          {/* ==================== TIMELINE BOTTOM AXIS ==================== */}
          <line x1={MARGIN_LEFT} y1={HEIGHT - 45} x2={WIDTH - MARGIN_RIGHT} y2={HEIGHT - 45} stroke="var(--border-dim)" strokeWidth={1} />
          
          {xAxisLabels.map((lbl, idx) => {
            const x = scaleX(lbl.idx);
            return (
              <g key={`x-lbl-${idx}`}>
                <line x1={x} y1={HEIGHT - 45} x2={x} y2={HEIGHT - 40} stroke="var(--border-dim)" strokeWidth={1} />
                <text
                  x={x}
                  y={HEIGHT - 25}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--fg-muted)"
                  fontFamily="var(--font-mono)"
                >
                  {lbl.date}
                </text>
              </g>
            );
          })}

          {/* ==================== INTERACTIVE CROSSHAIR LINE ==================== */}
          {hoveredIdx !== null && (
            <line
              x1={scaleX(hoveredIdx)}
              y1={PRICE_TOP}
              x2={scaleX(hoveredIdx)}
              y2={MACD_BOTTOM}
              stroke="var(--accent-blue)"
              strokeWidth={1}
              strokeDasharray="4 4"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>

      <div className="disclaimer" style={{ fontSize: "10px", marginTop: "10px", color: "var(--fg-muted)", border: "none", paddingTop: "0" }}>
        * Hover the chart to inspect crosshair values. Insider transactions `I` are size-proportional to USD value.
      </div>
    </div>
  );
}
