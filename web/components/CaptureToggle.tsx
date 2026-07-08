"use client";

import React from "react";

export default function CaptureToggle() {
  const toggle = () => {
    window.dispatchEvent(new CustomEvent("toggle-capture-drawer"));
  };

  return (
    <button onClick={toggle} className="capture-toggle">
      <span className="capture-toggle-label">
        <svg className="icon-14 capture-toggle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        <span>Capture paste</span>
      </span>
      <span className="kbd-hint kbd-chip">[C]</span>
    </button>
  );
}
