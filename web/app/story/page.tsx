import { listStoryPages } from "@/lib/story-data";
import Link from "next/link";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function StoryArchive() {
  const rows = await listStoryPages();

  return (
    <div className="story-page">
      <header className="hero">
        <div className="eyebrow">Archive</div>
        <h1 className="story-h1">Story pages</h1>
        <p className="lead">
          Editorial deep-dives built by the engine. Each page freezes a
          company&apos;s fundamentals at a point in time and lets you drag the
          assumptions yourself.
        </p>
      </header>

      {rows.length > 0 ? (
        <ul className="archive-list">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/story/${row.id}`}>
                {row.symbol}: {row.title}
              </Link>
              <div className="meta">
                {row.symbol} · {row.createdAt}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="body dim">
          No story pages in the database yet. Run the engine to generate one, or
          view the demo below.
        </p>
      )}

      <ul className="archive-list">
        <li>
          <Link href="/story/demo">Demo: Micron (MU)</Link>
          <div className="meta">
            MU · fixture data — always available
          </div>
        </li>
      </ul>
    </div>
  );
}
