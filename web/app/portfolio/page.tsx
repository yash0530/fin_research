import { loadPortfolio, loadWatchlistBandGrid } from "@/lib/portfolio-data";
import { getLatestBuyList } from "@/lib/buylist-data";
import { loadHarvestCandidates, ceremonyDue } from "@/lib/buy-ceremony-data";
import PortfolioClient from "./PortfolioClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortfolioPage() {
  const [positions, watchlist, buyList, harvest] = await Promise.all([
    loadPortfolio(),
    loadWatchlistBandGrid(),
    getLatestBuyList(),
    loadHarvestCandidates(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const { due } = ceremonyDue(buyList?.month ?? null, today);

  return (
    <PortfolioClient
      positions={positions}
      watchlist={watchlist}
      harvest={harvest}
      ceremonyDue={due}
      buyListMonth={buyList?.month ?? null}
    />
  );
}
