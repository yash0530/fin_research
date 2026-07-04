import { loadPortfolio } from "@/lib/portfolio-data";
import PortfolioClient from "./PortfolioClient";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortfolioPage() {
  const positions = await loadPortfolio();

  return <PortfolioClient positions={positions} />;
}
