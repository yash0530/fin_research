import React from "react";

interface BandBarProps {
  current: number;
  low: number;
  high: number;
  buyUnder?: number | null;
  className?: string;
}

export function BandBar({ current, low, high, buyUnder, className = "" }: BandBarProps) {
  const range = high - low;
  const currentPct = range > 0 ? Math.min(Math.max(((current - low) / range) * 100, 0), 100) : 50;
  
  let buyUnderPct: number | null = null;
  if (buyUnder !== undefined && buyUnder !== null && range > 0) {
    buyUnderPct = Math.min(Math.max(((buyUnder - low) / range) * 100, 0), 100);
  }

  const isBelowBuyUnder = buyUnder !== undefined && buyUnder !== null && current <= buyUnder;

  return (
    <div className={`flex flex-col gap-1 w-full ui-bandbar ${className}`}>
      <div className="ui-bandbar-track">
        {/* Buy Under range highlight if any */}
        {buyUnderPct !== null && (
          <div 
            className="ui-bandbar-highlight"
            style={{ width: `${buyUnderPct}%` }}
          />
        )}
        
        {/* Buy Under line tick */}
        {buyUnderPct !== null && (
          <div 
            className="ui-bandbar-tick"
            style={{ left: `${buyUnderPct}%` }}
            title={`Buy Under: ${buyUnder}`}
          />
        )}

        {/* Current price indicator */}
        <div 
          className={`ui-bandbar-marker ${
            isBelowBuyUnder 
              ? "ui-bandbar-marker--below" 
              : "ui-bandbar-marker--above"
          }`}
          style={{ left: `calc(${currentPct}% - 6px)` }}
          title={`Current: ${current}`}
        />
      </div>
      
      <div className="flex justify-between ui-bandbar-labels">
        <span>{low.toFixed(2)}</span>
        {buyUnder !== undefined && buyUnder !== null && (
          <span className="ui-bandbar-labels--buy">Buy &lt; {buyUnder.toFixed(2)}</span>
        )}
        <span>{high.toFixed(2)}</span>
      </div>
    </div>
  );
}
