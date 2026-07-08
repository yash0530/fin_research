import React, { ReactNode } from "react";

interface StatStripProps {
  children: ReactNode;
  className?: string;
}

export function StatStrip({ children, className = "" }: StatStripProps) {
  return (
    <div className={`ui-statstrip ${className}`}>
      {children}
    </div>
  );
}
