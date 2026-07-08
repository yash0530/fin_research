import type { NextConfig } from "next";

// externalDir lets the app import the tested engine from ../src (@engine/*).
// TypeScript type-checking stays ON during build (our verification); eslint is
// skipped only because this sub-app has no eslint config of its own.
const nextConfig: NextConfig = {
  experimental: { externalDir: true },
  eslint: { ignoreDuringBuilds: true },

  // P7 route deletions — old paths → their new homes. Dynamic sub-routes (no
  // stable mapping to a symbol/id) always fall back to "/". `/memos` and
  // `/dossiers` would ideally forward to `/tickers`, but the tickers index page
  // was itself deleted (sidebar search + watchlist replace it) so that target
  // is unresolvable too — both go to "/" to avoid dead-ending on a 404.
  async redirects() {
    return [
      { source: "/screener", destination: "/", permanent: false },
      { source: "/discovery", destination: "/", permanent: false },
      { source: "/signals", destination: "/", permanent: false },
      { source: "/calibration", destination: "/journal", permanent: false },
      { source: "/buylist", destination: "/portfolio", permanent: false },
      { source: "/capture", destination: "/", permanent: false },
      { source: "/live", destination: "/", permanent: false },
      { source: "/digest", destination: "/", permanent: false },
      { source: "/digest/:path*", destination: "/", permanent: false },
      { source: "/story", destination: "/", permanent: false },
      { source: "/story/:path*", destination: "/", permanent: false },
      { source: "/dossiers", destination: "/", permanent: false },
      { source: "/dossiers/:path*", destination: "/", permanent: false },
      { source: "/memos", destination: "/", permanent: false },
      { source: "/memos/:path*", destination: "/", permanent: false },
      { source: "/tickers", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
