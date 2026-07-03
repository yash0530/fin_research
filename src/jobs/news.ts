// `news` job: Google News RSS per AI-infra sector `newsQuery` + per watchlisted
// symbol, deduped by a URL hash into NewsItem. Port of ResearchEngine/lib/jobs/news.ts
// semantics (query → RSS → items → urlHash dedupe) using `fetch` + fast-xml-parser
// (NO new deps). Never-crash: a failed query is caught (catch-per-item) and the rest
// continue. The RSS PARSER is pure (fixture-tested); the fetcher is injected.

import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { SqlDb } from "../db/migrate";
import { insertNewsItems, type NewsItemRow } from "../db/queries";

export type NewsQuery = { q: string; sectorCode?: string; symbol?: string };

/** Google News RSS search endpoint for a free-text query. */
export function googleNewsUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

/** Stable dedupe key for a news URL. */
export function urlHash(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function pubDateIso(pubDate: unknown): string | null {
  if (typeof pubDate !== "string" || !pubDate) return null;
  const t = new Date(pubDate).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/**
 * Parse a Google News RSS document into NewsItem rows tagged with the query's
 * sector/symbol. Pure — takes the XML text, returns rows (bad items are skipped).
 */
export function parseNewsRss(xml: string, meta: { sectorCode?: string; symbol?: string } = {}): NewsItemRow[] {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  const channel = (doc as { rss?: { channel?: { item?: unknown } } })?.rss?.channel;
  if (!channel) return [];
  const rawItems = channel.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const out: NewsItemRow[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const url = typeof it.link === "string" ? it.link.trim() : "";
    const title = typeof it.title === "string" ? it.title.trim() : "";
    if (!url || !title) continue;
    const src = it.source;
    const source =
      src && typeof src === "object"
        ? String((src as Record<string, unknown>)["#text"] ?? "").trim() || null
        : typeof src === "string"
          ? src.trim() || null
          : null;
    const snippet = typeof it.description === "string" ? stripTags(it.description).slice(0, 500) || null : null;
    out.push({
      urlHash: urlHash(url),
      url,
      title,
      snippet,
      source,
      sectorCode: meta.sectorCode ?? null,
      symbol: meta.symbol ?? null,
      publishedAt: pubDateIso(it.pubDate),
    });
  }
  return out;
}

export type NewsDeps = {
  queries: NewsQuery[];
  /** Fetch the raw RSS XML for a URL. May throw — caught per query. */
  fetchRss: (url: string) => Promise<string>;
};

export async function runNewsJob(db: SqlDb, deps: NewsDeps): Promise<string> {
  if (deps.queries.length === 0) return "no news queries configured";
  let inserted = 0;
  let fetched = 0;
  let errors = 0;
  for (const q of deps.queries) {
    try {
      const xml = await deps.fetchRss(googleNewsUrl(q.q));
      const rows = parseNewsRss(xml, { ...(q.sectorCode ? { sectorCode: q.sectorCode } : {}), ...(q.symbol ? { symbol: q.symbol } : {}) });
      fetched += rows.length;
      // INSERT OR IGNORE by urlHash → only NEW items count as inserted.
      const before = countNews(db);
      insertNewsItems(db, rows);
      inserted += countNews(db) - before;
    } catch {
      errors += 1;
    }
  }
  return `news: ${inserted} new items (${fetched} fetched over ${deps.queries.length} queries${errors ? `, ${errors} query errors` : ""})`;
}

function countNews(db: SqlDb): number {
  const row = db.prepare('SELECT count(*) AS c FROM "NewsItem"').get() as { c: number };
  return row.c;
}
