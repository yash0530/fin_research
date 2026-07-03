"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import type { EvidenceChart as EvidenceChartData } from "@/lib/story-types";

// Resolve CSS variable at render time from the .story-page ancestor
function resolveCssVar(varExpr: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  if (!varExpr.startsWith("var(")) return varExpr;
  const name = varExpr.replace(/^var\(/, "").replace(/\)$/, "").trim();
  const el = document.querySelector(".story-page");
  if (!el) return fallback;
  const val = getComputedStyle(el).getPropertyValue(name).trim();
  return val || fallback;
}

// Color palette hooks — resolved once per render
function useChartColors() {
  // Can't call getComputedStyle during SSR; these are sensible defaults
  // that match the light-mode palette. The CSS variables will take over
  // in the actual render.
  return {
    accent: "#0E8C6B",
    warn: "#A8761B",
    neg: "#C2403B",
    ink: "#13191B",
    muted: "#586064",
    grid: "rgba(19,25,27,0.08)",
    greyBar: "#AEB4B6",
    greyBar2: "#CDD2D2",
  };
}

interface Props {
  chart: EvidenceChartData;
}

function BarValueLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  value?: number;
  fmt?: string;
}) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (value === null || value === undefined) return null;
  const fmt = props.fmt ?? "";
  let text: string;
  if (fmt === "$") text = `$${value}`;
  else if (fmt === "x") text = `${value}x`;
  else text = String(value);

  const isNeg = value < 0;
  return (
    <text
      x={x + width / 2}
      y={isNeg ? y + 15 : y - 6}
      textAnchor="middle"
      fontSize={11}
      fontWeight={500}
      fontFamily="'Space Grotesk', system-ui, sans-serif"
      fill="var(--ink, #13191B)"
    >
      {text}
    </text>
  );
}

export function EvidenceChart({ chart }: Props) {
  const colors = useChartColors();
  const hasLines = chart.series.some((s) => s.type === "line");
  const hasBars = chart.series.some((s) => s.type === "bar" || !s.type);

  // Build recharts data array
  const data = chart.labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label };
    chart.series.forEach((s) => {
      point[s.label] = s.data[i];
    });
    return point;
  });

  // Determine bar fill per value (negative = danger color)
  const getBarFill = (value: number, seriesColor?: string): string => {
    if (value < 0) return colors.neg;
    return seriesColor || colors.accent;
  };

  const tickFormatter = chart.yUnit
    ? (v: number) => `${v}${chart.yUnit}`
    : undefined;

  // Pure-line chart (e.g. Margins)
  if (hasLines && !hasBars) {
    return (
      <div className={`chart-h${chart.tall ? " tall" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={colors.grid}
              vertical={false}
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: colors.muted }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: colors.muted }}
              axisLine={false}
              tickLine={false}
              tickFormatter={tickFormatter}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface, #fff)",
                border: "1px solid var(--line, #ccc)",
                borderRadius: 8,
                fontSize: 13,
              }}
              formatter={(value, name) =>
                [`${Number(value)}${chart.yUnit ?? ""}`, String(name)]
              }
            />
            {chart.series.map((s) => (
              <Line
                key={s.label}
                type="monotone"
                dataKey={s.label}
                stroke={s.color ? resolveCssVar(s.color, colors.accent) : colors.accent}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                strokeWidth={2}
                dot={{ r: 3, fill: s.color ? resolveCssVar(s.color, colors.accent) : colors.accent }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Bar chart (default)
  return (
    <div className={`chart-h${chart.tall ? " tall" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={colors.grid}
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: colors.muted }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: colors.muted }}
            axisLine={false}
            tickLine={false}
            tickFormatter={tickFormatter}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface, #fff)",
              border: "1px solid var(--line, #ccc)",
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          {chart.series
            .filter((s) => s.type === "bar" || !s.type)
            .map((s) => (
              <Bar
                key={s.label}
                dataKey={s.label}
                radius={[4, 4, 0, 0]}
                maxBarSize={54}
              >
                {data.map((entry, idx) => {
                  const val = Number(entry[s.label]);
                  return (
                    <Cell
                      key={idx}
                      fill={getBarFill(val, s.color)}
                    />
                  );
                })}
                {chart.showValueLabels && (
                  <LabelList
                    dataKey={s.label}
                    content={(props) => (
                      <BarValueLabel
                        {...(props as { x?: number; y?: number; width?: number; value?: number })}
                        fmt={chart.valueLabelFmt}
                      />
                    )}
                  />
                )}
              </Bar>
            ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
