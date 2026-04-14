import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
