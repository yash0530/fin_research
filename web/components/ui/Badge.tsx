import React, { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "success" | "danger" | "warning" | "critical" | "neutral";
  className?: string;
  /** Hover tooltip — the data-quality chip pattern puts the missing fields here. */
  title?: string;
}

export function Badge({ children, variant = "neutral", className = "", title }: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`} title={title}>
      {children}
    </span>
  );
}
