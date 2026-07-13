import path from "node:path";
import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const withAnalyze = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Content-Security-Policy is set per-request in src/middleware.ts (with a nonce).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  // Self-host (#476): emit a minimal standalone server bundle (server.js + only
  // the node_modules actually traced as reachable) so the Docker image doesn't
  // need the full dependency tree. Ignored by `next dev`.
  output: "standalone",
  // The standalone trace is rooted at the monorepo root, not web/, or it misses
  // files hoisted to the repo-root node_modules.
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Pin Turbopack's workspace root to this directory (web/).
  // Without this, Turbopack walks up to the repo root (which has its own
  // package-lock.json) and tries to resolve modules from there — causing
  // spurious "Can't resolve 'tailwindcss'" errors and wasted resolution work.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.espncdn.com",
      },
    ],
  },
  experimental: {
    // Cache dynamic route RSC payloads in the client-side router cache.
    // Without this, force-dynamic pages re-fetch on every tab switch (stale=0).
    // With this, a tab you've already visited serves instantly until the window
    // expires. Server actions that call revalidatePath() still bust the cache.
    staleTimes: {
      dynamic: 300, // seconds — covers rapid tab-switching
      static: 180,
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withAnalyze(nextConfig);
