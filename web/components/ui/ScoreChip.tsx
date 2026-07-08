import React from "react";

interface ScoreChipProps {
  score: number | null;
  max?: number;
  className?: string;
}

export function ScoreChip({ score, max = 9, className = "" }: ScoreChipProps) {
  if (score === null || isNaN(score)) {
    return (
      <span className={`ui-scorechip ui-scorechip--muted ${className}`}>
        —/{max}
      </span>
    );
  }

  let modifier = "";
  if (score >= 7) {
    modifier = "ui-scorechip--green";
  } else if (score >= 5) {
    modifier = "ui-scorechip--amber";
  } else {
    modifier = "ui-scorechip--red";
  }

  return (
    <span className={`ui-scorechip ${modifier} ${className}`}>
      {score}/{max}
    </span>
  );
}
