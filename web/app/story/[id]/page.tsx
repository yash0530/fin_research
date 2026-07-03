import { loadStoryPage } from "@/lib/story-data";
import { demoStory } from "@/lib/story-types";
import type { StoryPageData } from "@/lib/story-types";
import { StoryHero } from "@/components/story/StoryHero";
import { StatTape } from "@/components/story/StatTape";
import { CycleStrip } from "@/components/story/CycleStrip";
import { EvidenceChart } from "@/components/story/EvidenceChart";
import { StoryEstimator } from "@/components/story/StoryEstimator";
import { Callout } from "@/components/story/Callout";
import { Footnotes } from "@/components/story/Footnotes";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: StoryPageData;
  let isDemo: boolean;

  if (id === "demo") {
    data = demoStory();
    isDemo = true;
  } else {
    const loaded = await loadStoryPage(id);
    if (loaded) {
      data = loaded;
      isDemo = false;
    } else {
      data = demoStory();
      isDemo = true;
    }
  }

  // Split charts into 2-col grid items and full-width items
  const charts = data.charts ?? [];

  return (
    <article className="story-page">
      {isDemo && (
        <div className="demo-banner">
          ⚠ DEMO DATA — this page uses fixture data, not a live database row
        </div>
      )}

      {/* Hero: kicker, eyebrow, h1, lead, verdict badge */}
      <StoryHero data={data} />

      {/* KPI stat tape */}
      <StatTape stats={data.statTape} />

      {/* Cycle strip with marker */}
      <CycleStrip data={data.cycleStrip} />
      {data.cycleStrip.stage && (
        <p className="body dim" style={{ marginTop: 14 }}>
          Where the forward multiple sits today. For a memory maker, a low
          multiple signals a <em>peak</em>, not a bargain — the market is
          pricing in the cycle turning.
        </p>
      )}

      {/* Setup section */}
      {data.setupTitle && (
        <section className="story-section">
          <div className="eyebrow">The setup</div>
          <h2 className="story-h2">{data.setupTitle}</h2>
          {data.setupBody?.map((p, i) => (
            <p
              key={i}
              className={`body${i > 0 ? " dim" : ""}`}
              style={{ marginBottom: i < (data.setupBody?.length ?? 1) - 1 ? 14 : 0 }}
            >
              {p}
            </p>
          ))}
        </section>
      )}

      {/* Evidence section with chart grid */}
      {charts.length > 0 && (
        <section className="story-section">
          <div className="eyebrow">The evidence</div>
          {data.evidenceTitle && (
            <h2 className="story-h2">{data.evidenceTitle}</h2>
          )}
          {data.evidenceBody && (
            <p className="body dim" style={{ maxWidth: "64ch" }}>
              {data.evidenceBody}
            </p>
          )}

          <div className="grid2">
            {charts.map((chart, i) => (
              <div
                key={i}
                className={`card${chart.fullWidth ? " full" : ""}`}
              >
                <h3>{chart.title}</h3>
                <div className="sub">{chart.subtitle}</div>
                {chart.series.length > 1 && (
                  <div className="legend">
                    {chart.series.map((s) => (
                      <span key={s.label}>
                        <i
                          className="swatch"
                          style={{
                            background: s.color ?? "var(--accent)",
                          }}
                        />
                        {s.label}
                      </span>
                    ))}
                  </div>
                )}
                <EvidenceChart chart={chart} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Estimator section */}
      <section className="story-section">
        <div className="eyebrow">The model</div>
        <h2 className="story-h2">Estimate the price yourself</h2>
        <p className="body dim" style={{ maxWidth: "64ch" }}>
          Implied price = annualized forward EPS × forward P/E. Defaults use
          guidance plus estimates. Drag the inputs; the cycle strip shows where
          your multiple sits.
        </p>
        <StoryEstimator data={data} />
      </section>

      {/* Callouts */}
      {data.callouts.length > 0 && (
        <section className="story-section">
          {data.callouts.map((c, i) => (
            <Callout key={i}>{c}</Callout>
          ))}
        </section>
      )}

      {/* Footnotes */}
      <Footnotes notes={data.footnotes} />
    </article>
  );
}
