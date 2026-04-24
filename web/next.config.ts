import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const withAnalyze = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://a.espncdn.com https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Report-Only during soak week; flip to Content-Security-Policy to enforce.
  { key: "Content-Security-Policy-Report-Only", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
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
