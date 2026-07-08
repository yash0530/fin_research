"use client";

import React from "react";

interface RangeTabsProps {
  options: string[];
  selected: string;
  onChange: (val: string) => void;
  className?: string;
}

export function RangeTabs({ options, selected, onChange, className = "" }: RangeTabsProps) {
  return (
    <div className={`ui-rangetabs ${className}`}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`ui-rangetabs-btn ${
            selected === opt
              ? "ui-rangetabs-btn--active"
              : "ui-rangetabs-btn--inactive"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
