import type { Stat } from "@/lib/story-types";

/** Responsive KPI grid tape: label, big value, optional delta with up/down coloring. */
export function StatTape({ stats }: { stats: Stat[] }) {
  return (
    <div className="tape num">
      {stats.map((s, i) => (
        <div className="cell" key={i}>
          <div className="k">{s.label}</div>
          <div className="v">{s.value}</div>
          {s.delta && (
            <div
              className={`d ${s.deltaDirection === "up" ? "up" : s.deltaDirection === "down" ? "down" : ""}`}
            >
              {s.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
