import React from "react";

interface TierTagProps {
  tier: 1 | 2 | 3 | string;
  className?: string;
}

export function TierTag({ tier, className = "" }: TierTagProps) {
  let label = `T${tier}`;
  let description = "";
  let modifier = "";

  if (tier === 1 || tier === "1") {
    label = "T1";
    description = "Multi-Trigger";
    modifier = "ui-tiertag--t1";
  } else if (tier === 2 || tier === "2") {
    label = "T2";
    description = "Qualified";
    modifier = "ui-tiertag--t2";
  } else {
    label = "T3";
    description = "Sourced";
    modifier = "ui-tiertag--t3";
  }

  return (
    <span 
      className={`ui-tiertag ${modifier} ${className}`}
      title={description}
    >
      <span>{label}</span>
      {description && <span className="ui-tiertag-desc">({description})</span>}
    </span>
  );
}
