export interface FixtureOHLCV {
  d: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartEvent {
  type: "insider" | "journal" | "earnings";
  date: string;
  value?: number; // insider transaction value in USD
  label?: string;
}

// Generate ~120 synthetic stock price bars (roughly 6 months of daily data)
export const syntheticOHLCV: FixtureOHLCV[] = [];
let currentPrice = 150.0;
const startDate = new Date("2026-01-02");

for (let i = 0; i < 120; i++) {
  // Add weekdays only
  while (startDate.getDay() === 0 || startDate.getDay() === 6) {
    startDate.setDate(startDate.getDate() + 1);
  }

  const d = startDate.toISOString().split("T")[0];
  
  // Random walk with an upward drift
  const drift = 0.15;
  const vol = 2.0;
  const change = (Math.random() - 0.45) * vol + drift;
  const open = parseFloat((currentPrice + (Math.random() - 0.5) * 0.5).toFixed(2));
  const close = parseFloat((open + change).toFixed(2));
  const low = parseFloat((Math.min(open, close) - Math.random() * 1.5).toFixed(2));
  const high = parseFloat((Math.max(open, close) + Math.random() * 1.5).toFixed(2));
  const volume = Math.floor(100000 + Math.random() * 900000);

  syntheticOHLCV.push({ d, open, high, low, close, volume });
  currentPrice = close;

  startDate.setDate(startDate.getDate() + 1);
}

export const syntheticEvents: ChartEvent[] = [
  { type: "earnings", date: "2026-02-15", label: "Q4 Earnings EPS +12%" },
  { type: "earnings", date: "2026-05-15", label: "Q1 Earnings EPS +8%" },
  { type: "insider", date: "2026-03-10", value: 50000, label: "CEO Buy $50k" },
  { type: "insider", date: "2026-04-05", value: 1200000, label: "VP Sell $1.2M" },
  { type: "insider", date: "2026-06-01", value: 15000, label: "Director Buy $15k" },
  { type: "journal", date: "2026-03-25", label: "Added to Watchlist (Thesis: GenAI Adoption)" },
  { type: "journal", date: "2026-05-20", label: "Re-reviewed dossier after earnings beat" },
];
