"use client";
// Shared client bits for on-demand runs: a polling hook + a status pill. The hook
// polls the server every ~3s and, when a run finishes (busy → idle), calls
// router.refresh() so server components (digest, dossier list) pull fresh rows.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getRunStatusAction } from "@/app/dossiers/actions";
import type { RunStatus } from "@/lib/run-status";

export function useRunStatus(pollMs = 3000): RunStatus | null {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const router = useRouter();
  const wasBusy = useRef(false);

  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const s = await getRunStatusAction();
        if (!alive) return;
        setStatus(s);
        if (wasBusy.current && !s.busy) router.refresh(); // run just finished → pull fresh data
        wasBusy.current = s.busy;
      } catch {
        /* transient — keep last known status */
      }
    };
    void tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs, router]);

  return status;
}

export function phaseLabel(s: RunStatus | null): string {
  if (!s || !s.busy) return "Idle — nothing running";
  const who = s.symbols?.length ? s.symbols.join(", ") : (s.job ?? "job");
  return s.phase === "booting" ? `Booting model for ${who}…` : `Running ${who}…`;
}

export function RunStatusPill({ status }: { status: RunStatus | null }): React.JSX.Element {
  const busy = !!status?.busy;
  const color = !busy ? "var(--muted, #888)" : status?.phase === "booting" ? "#d98a00" : "#2a8a2a";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        fontFamily: "var(--fmono, monospace)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: busy ? `0 0 6px ${color}` : "none",
        }}
      />
      {phaseLabel(status)}
    </span>
  );
}

const BTN: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  cursor: "pointer",
};

export function runButtonStyle(disabled: boolean): React.CSSProperties {
  return { ...BTN, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" };
}
