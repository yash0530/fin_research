import React from "react";
import Link from "next/link";
import TickerJump from "./TickerJump";
import SidebarWatchlist from "./SidebarWatchlist";
import CaptureToggle from "./CaptureToggle";
import RunStatusBar from "./RunStatusBar";

export default function Sidebar() {
  const navItems = [
    { href: "/", label: "Dashboard", icon: (
      <svg className="icon-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ) },
    { href: "/themes", label: "Themes", icon: (
      <svg className="icon-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ) },
    { href: "/tickers", label: "Tickers", icon: (
      <svg className="icon-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ) },
    { href: "/portfolio", label: "Portfolio", icon: (
      <svg className="icon-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ) },
    { href: "/journal", label: "Journal", icon: (
      <svg className="icon-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ) }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-name">ENGINE</span>
        <span className="brand-badge">v1.0</span>
      </div>

      <div className="sidebar-search">
        <TickerJump />
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="nav-item">
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
        <CaptureToggle />
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Watchlist</div>
        <div className="sidebar-scroll">
          <SidebarWatchlist />
        </div>
      </div>

      <div className="sidebar-footer">
        <RunStatusBar />
        <div className="sidebar-disclaimer">
          ENGINE is research, not advice. No broker APIs, no order placement, no execution — ever.
        </div>
      </div>
    </aside>
  );
}
