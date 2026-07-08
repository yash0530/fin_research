import React from "react";
import Link from "next/link";
import { watchlistSidebar } from "../lib/ticker-data";
import { Sparkline } from "./ui/Sparkline";
import { TrendNumber } from "./ui/TrendNumber";

export default async function SidebarWatchlist() {
  const watchlist = await watchlistSidebar();

  if (watchlist.length === 0) {
    return <div className="watchlist-empty">No watchlisted tickers</div>;
  }

  return (
    <div className="watchlist-list">
      {watchlist.map((item) => (
        <Link key={item.symbol} href={`/tickers/${item.symbol}`} className="watchlist-row">
          <div className="watchlist-id">
            <span className="watchlist-sym">{item.symbol}</span>
            <span className="watchlist-name">{item.name}</span>
          </div>
          <div className="watchlist-meta">
            {item.closes.length > 0 && (
              <Sparkline data={item.closes} width={50} height={16} />
            )}
            <TrendNumber value={item.change1d} className="watchlist-trend" showSign={true} />
          </div>
        </Link>
      ))}
    </div>
  );
}
