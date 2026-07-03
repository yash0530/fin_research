import type { CycleStripData } from "@/lib/story-types";

/**
 * Cycle strip: 4 colored bands with a positioned marker + tick labels.
 * Position is 0..1 mapped to the full width.
 */
export function CycleStrip({
  data,
  style,
}: {
  data: CycleStripData;
  style?: React.CSSProperties;
}) {
  const markerPct = `${Math.max(0, Math.min(100, data.position * 100))}%`;

  return (
    <div className="strip-wrap" style={style}>
      <div
        className="strip"
        role="img"
        aria-label={`Cycle position: ${data.stage}, at ${(data.position * 100).toFixed(0)}%`}
      >
        {data.bands.map((band, i) => (
          <div
            key={i}
            style={{ width: `${band.widthPct}%`, background: band.color }}
          />
        ))}
        <div className="mk" style={{ left: markerPct }} />
      </div>
      <div className="ticks">
        {data.bands.map((band, i) => (
          <span key={i} style={{ width: `${band.widthPct}%` }}>
            {band.label}
          </span>
        ))}
      </div>
    </div>
  );
}
