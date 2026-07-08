import React, { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Panel({ children, className = "", id }: PanelProps) {
  return (
    <div
      id={id}
      className={`panel ${className}`}
    >
      {children}
    </div>
  );
}
