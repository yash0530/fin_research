import React, { ReactNode } from "react";

interface StatProps {
  label: string;
  value: ReactNode;
  subValue?: ReactNode;
  className?: string;
}

export function Stat({ label, value, subValue, className = "" }: StatProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="ui-stat-label">
        {label}
      </span>
      <span className="ui-stat-value">
        {value}
      </span>
      {subValue && (
        <span className="ui-stat-subvalue">
          {subValue}
        </span>
      )}
    </div>
  );
}
