import { getLiveDigest } from "@/lib/live";
import { InsightList } from "@/components/InsightList";
import type { Insight } from "@engine/research/synthesize";

// Reads the LIVE SQLite digest at request time via the tested data layer.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LivePage() {
  const digest = await getLiveDigest();
  if (!digest) {
    return (
      <section>
        <h1>Live digest</h1>
        <p className="muted">
          No database yet. Run <code>npm run seed</code> (and, in production, the morning
          job) to populate it. This route reads the live SQLite DB at request time via the
          tested data-access layer.
        </p>
      </section>
    );
  }
  const data = JSON.parse(digest.dataJson) as { asOf: string; headline: string; insights: Insight[] };
  return (
    <section>
      <h1>
        Live digest <span className="muted">· {data.asOf}</span>
      </h1>
      <div className="panel">
        <strong>{data.headline}</strong>
      </div>
      <InsightList insights={data.insights} />
    </section>
  );
}
