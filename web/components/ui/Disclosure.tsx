"use client";

import React, { useState, ReactNode } from "react";

interface DisclosureProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Disclosure({ title, children, defaultOpen = false, className = "" }: DisclosureProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`ui-disclosure ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="ui-disclosure-trigger"
      >
        <span>{title}</span>
        <svg
          className={`ui-disclosure-icon ${
            isOpen ? "ui-disclosure-icon--open" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {isOpen && (
        <div className="ui-disclosure-content">
          {children}
        </div>
      )}
    </div>
  );
}
