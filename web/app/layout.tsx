import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "ENGINE — research workstation",
  description: "Local-first investment research. Research, not advice.",
};

const NAV = [
  { href: "/", label: "Digest" },
  { href: "/screener", label: "Screener" },
  { href: "/dossiers", label: "Dossiers" },
  { href: "/buylist", label: "Buy list" },
  { href: "/story/mu", label: "Story" },
  { href: "/capture", label: "Capture" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="shell">
          <span className="brand">ENGINE</span>
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <main>
          {children}
          <p className="disclaimer">
            ENGINE produces <strong>research, not advice</strong>. No broker APIs, no order
            placement, no execution — ever. Demo pages render fixture data through the real,
            tested engine functions; live-data wiring is tracked in TASKS.md.
          </p>
        </main>
      </body>
    </html>
  );
}
