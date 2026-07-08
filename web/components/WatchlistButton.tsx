"use client";

import React, { useState } from "react";
import { toggleWatchlistAction } from "../app/tickers/[symbol]/actions";

interface Props {
  symbol: string;
  initialWatchlisted: boolean;
}

export function WatchlistButton({ symbol, initialWatchlisted }: Props) {
  const [watchlisted, setWatchlisted] = useState(initialWatchlisted);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    const nextState = !watchlisted;
    try {
      const res = await toggleWatchlistAction(symbol, nextState);
      if (res.ok) {
        setWatchlisted(nextState);
      } else {
        alert(res.error || "Failed to update watchlist");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`ui-rangetabs-btn watchlist-toggle-btn ${watchlisted ? "ui-rangetabs-btn--active" : "ui-rangetabs-btn--inactive"}`}
    >
      <span className={`watchlist-star ${watchlisted ? "watchlist-star--active" : "watchlist-star--inactive"}`}>
        {watchlisted ? "★" : "☆"}
      </span>
      <span>{watchlisted ? "Watchlisted" : "Watch"}</span>
    </button>
  );
}
