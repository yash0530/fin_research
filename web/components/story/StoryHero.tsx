import type { StoryPageData } from "@/lib/story-types";

/** Hero section: kicker, eyebrow, h1, lead paragraph, verdict badge. */
export function StoryHero({ data }: { data: StoryPageData }) {
  const verdictClass = data.hero.verdict.toLowerCase();

  return (
    <header className="hero">
      {data.hero.kicker && <p className="kicker">{data.hero.kicker}</p>}
      {data.hero.eyebrow && (
        <div className="eyebrow">{data.hero.eyebrow}</div>
      )}
      <h1 className="story-h1">{data.title}</h1>
      {data.hero.lead && <p className="lead">{data.hero.lead}</p>}
      <div className={`verdict-badge ${verdictClass}`}>
        {data.hero.verdict} · {data.hero.conviction}
      </div>
    </header>
  );
}
