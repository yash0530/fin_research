import React from "react";

interface TrendNumberProps {
  value: number | null;
  className?: string;
  showSign?: boolean;
  suffix?: string;
}

export function TrendNumber({ value, className = "", showSign = true, suffix = "%" }: TrendNumberProps) {
  if (value === null || isNaN(value)) {
    return <span className={`ui-trend ui-trend--muted ${className}`}>—</span>;
  }

  const isPositive = value > 0;
  const isNegative = value < 0;
  
  let colorModifier = "ui-trend--neutral";
  if (isPositive) {
    colorModifier = "ui-trend--positive";
  } else if (isNegative) {
    colorModifier = "ui-trend--negative";
  }

  let formattedValue = Math.abs(value).toFixed(2);
  let sign = "";
  if (isPositive && showSign) sign = "+";
  if (isNegative) sign = "-";

  return (
    <span className={`ui-trend ${colorModifier} ${className}`}>
      {sign}{formattedValue}{suffix}
    </span>
  );
}
