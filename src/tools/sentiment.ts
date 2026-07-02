// Composite 0–10 sentiment from free signals (Reddit public JSON + Finnhub news
// volume + per-ticker RSS count). The SCORING is deterministic and tested here;
// the fetching (rate-limited HTTP) is a separate adapter. Port of sentiment.py's
// composite idea, adapted to free sources.

export type SentimentInputs = {
  redditMentions: number; // mentions in the window
  redditPositiveRatio: number; // 0..1 (share of positive mentions)
  newsVolume: number; // company-news article count
  rssCount: number; // per-ticker RSS item count
};

export type SentimentScore = {
  score: number; // 0..10
  label: "bearish" | "neutral" | "bullish";
  components: { volume: number; polarity: number };
};

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export function sentimentScore(inputs: SentimentInputs): SentimentScore {
  const totalVolume = inputs.redditMentions + inputs.newsVolume + inputs.rssCount;
  // No chatter at all → genuinely neutral (no signal), not bearish.
  if (totalVolume <= 0) {
    return { score: 5, label: "neutral", components: { volume: 0, polarity: 0.5 } };
  }
  // Volume: log-scaled 0..1 (saturates around ~100 items).
  const volume = clamp01(Math.log10(1 + totalVolume) / 2);
  const polarity = clamp01(inputs.redditPositiveRatio);
  // 60% polarity, 40% volume → 0..10.
  const score = clamp01(polarity * 0.6 + volume * 0.4) * 10;
  const label = score >= 6.5 ? "bullish" : score <= 3.5 ? "bearish" : "neutral";
  return { score: Math.round(score * 100) / 100, label, components: { volume, polarity } };
}
