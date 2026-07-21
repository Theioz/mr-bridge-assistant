// Mr. Bridge service worker — app-shell caching only.
// Caches Next.js static assets (/_next/static/*) and Google Fonts.
// No API, auth, or navigation caching — those always hit the network.

// NOTE: Turbopack's static chunk filenames are NOT reliably content-hashed, so a new deploy can
// ship changed code under a filename the cache already holds. A cache-FIRST strategy therefore
// served stale JS indefinitely (a deploy's changes never reached the browser until the SW cache
// was cleared by hand). Two guards now prevent that: the cache version is bumped on any change
// that could poison it (the activate handler deletes every other cache), and the fetch strategy
// is stale-while-revalidate — the cache is refreshed from the network on every request, so a
// changed asset is picked up on the next load instead of never.
const CACHE = "mb-static-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isCacheableStatic(url) {
  if (url.origin === self.location.origin) {
    return (
      url.pathname.startsWith("/_next/static/") ||
      url.pathname === "/icon.svg" ||
      url.pathname.startsWith("/icon-") ||
      url.pathname === "/manifest.json"
    );
  }
  return (
    url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (!isCacheableStatic(url)) return;

  // Stale-while-revalidate: serve the cache immediately when present, but always fetch in the
  // background and overwrite the cache, so the *next* load gets fresh code. With no cache yet,
  // wait on the network. Offline falls back to whatever is cached.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok && (res.type === "basic" || res.type === "cors")) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
