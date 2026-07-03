"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Helper to resolve CSS variables at runtime
function resolveCssVar(varExpr: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  if (!varExpr.startsWith("var(")) return varExpr;
  const name = varExpr.replace(/^var\(/, "").replace(/\)$/, "").trim();
  const el = document.querySelector(".story-page");
  if (!el) return fallback;
  const val = getComputedStyle(el).getPropertyValue(name).trim();
  return val || fallback;
}

interface PricePoint {
  d: string;
  close: number;
  rawClose: number;
}

interface Props {
  data: PricePoint[];
}

export default function TickerPriceChart({ data }: Props) {
  // Can't call getComputedStyle during SSR; these are sensible defaults
  const colors = {
    accent: "#0E8C6B",
    pos: "#0E8C6B",
    neg: "#C2403B",
    ink: "#13191B",
    muted: "#586064",
    grid: "rgba(19,25,27,0.06)",
  };

  // Format date for ticks: e.g. "2025-06-15" -> "Jun 25"
  const formatTick = (tickStr: string) => {
    try {
      const date = new Date(tickStr);
      if (isNaN(date.getTime())) return tickStr;
      return date.toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      });
    } catch {
      return tickStr;
    }
  };

  // Custom Tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload as PricePoint;
      const wasSpiked = Math.abs(dataPoint.close - dataPoint.rawClose) > 0.001;

      return (
        <div
          style={{
            background: "var(--surface, #fff)",
            border: "1px solid var(--line, rgba(0,0,0,0.1))",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "13px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            color: "var(--ink, #13191B)",
            fontFamily: "var(--fbody, sans-serif)",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--muted, #586064)", marginBottom: "4px" }}>
            {dataPoint.d}
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div>
              <span style={{ color: "var(--accent, #0E8C6B)", fontWeight: 700 }}>
                Close: ${dataPoint.close.toFixed(2)}
              </span>
            </div>
            {wasSpiked && (
              <div style={{ color: "var(--neg, #C2403B)", fontSize: "11px", fontWeight: 500 }}>
                (Despiked from ${dataPoint.rawClose.toFixed(2)})
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Find min/max for domain spacing
  const closes = data.map((d) => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const pad = (max - min) * 0.05 || 1; // 5% padding
  const domainMin = Math.max(0, min - pad);
  const domainMax = max + pad;

  return (
    <div className="chart-h tall" style={{ width: "100%", height: "300px", marginTop: "1rem" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 5, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent, #0E8C6B)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--accent, #0E8C6B)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="d"
            tickFormatter={formatTick}
            tick={{ fontSize: 11, fill: "var(--muted, #586064)", fontFamily: "var(--fmono)" }}
            axisLine={false}
            tickLine={false}
            dy={8}
          />
          <YAxis
            domain={[domainMin, domainMax]}
            tickFormatter={(val) => `$${val.toFixed(0)}`}
            tick={{ fontSize: 11, fill: "var(--muted, #586064)", fontFamily: "var(--fmono)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="close"
            stroke="var(--accent, #0E8C6B)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#priceGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
