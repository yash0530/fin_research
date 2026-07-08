import React from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ data, width = 100, height = 30, className = "" }: SparklineProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className={`ui-sparkline ${className}`}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--border-dim)" strokeWidth={1} />
      </svg>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;

  const points = data
    .map((val, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = range > 0 ? height - 2 - ((val - min) / range) * (height - 4) : height / 2;
      return `${x},${y}`;
    })
    .join(" ");

  const isUp = data[data.length - 1] >= data[0];
  const strokeColor = isUp ? "var(--green-text)" : "var(--red-text)";

  return (
    <svg width={width} height={height} className={`ui-sparkline ${className}`}>
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        points={points}
      />
    </svg>
  );
}
