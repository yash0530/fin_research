// News-tape merge: combine local + fetched news into one deduped, newest-first,
// capped tape. Pure. Dedup is by id first, then by normalized title (the same
// story from two feeds). Port of news_tape.py's merge behaviour.

export type NewsRow = {
  id: string;
  title: string;
  source: string;
  publishedAt: string; // ISO or YYYY-MM-DD (string-sortable)
  symbol?: string;
  url?: string;
};

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function mergeNewsTape(rows: NewsRow[], opts: { limit?: number } = {}): NewsRow[] {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const deduped: NewsRow[] = [];
  for (const r of rows) {
    if (seenIds.has(r.id)) continue;
    const nt = normalizeTitle(r.title);
    if (nt && seenTitles.has(nt)) continue;
    seenIds.add(r.id);
    if (nt) seenTitles.add(nt);
    deduped.push(r);
  }
  deduped.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  return opts.limit !== undefined ? deduped.slice(0, opts.limit) : deduped;
}
