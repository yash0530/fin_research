"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function TickerJump() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid focusing if user is typing in another input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = val.trim().toUpperCase();
    if (symbol) {
      router.push(`/tickers/${symbol}`);
      setVal("");
      inputRef.current?.blur();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="ticker-jump">
      <input
        ref={inputRef}
        type="text"
        placeholder="Jump to symbol... [/]"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="ticker-jump-input"
      />
    </form>
  );
}
