import type { NextConfig } from "next";

// externalDir lets the app import the tested engine from ../src (@engine/*).
// TypeScript type-checking stays ON during build (our verification); eslint is
// skipped only because this sub-app has no eslint config of its own.
const nextConfig: NextConfig = {
  experimental: { externalDir: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
