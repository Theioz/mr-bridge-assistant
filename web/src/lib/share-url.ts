/**
 * Public base URL for share links (`/share/*`).
 *
 * These links are handed to people OUTSIDE the tailnet, so they must resolve on
 * the public hostname — NOT `APP_URL`, which is the tailnet-only app host and
 * would be unreachable for the recipient.
 *
 * Precedence:
 *   SHARE_BASE_URL   the public share host (e.g. https://share.jl-infra-lab.com)
 *   APP_URL          fallback for local dev / single-host deploys
 *
 * Previously this derived the origin from the SUPABASE url:
 *   NEXT_PUBLIC_SUPABASE_URL.replace(".supabase.co", ".vercel.app")
 * which inferred the app's public origin from the *database* URL. That only ever
 * worked on Vercel-with-Supabase-Cloud, and silently emits a garbage hostname on
 * any other deployment.
 */
export function shareBaseUrl(): string {
  const base = process.env.SHARE_BASE_URL || process.env.APP_URL || "";
  return base.replace(/\/+$/, ""); // no trailing slash — callers append `/share/...`
}

// ── Share URL builders ──────────────────────────────────────────────────────
//
// Every share link in the app is built here — the API routes and the client components alike
// (#761). The client copies used to build their own: the Library header used
// `window.location.origin`, i.e. whatever host the OWNER had open (the tailnet name — useless to
// the recipient, and read during render, so server and client HTML disagreed), and the item
// detail page used `APP_URL`, the tailnet host again.
//
// `shareBaseUrl()` reads server-only env, so a client component cannot call it. Server
// components resolve it once and pass the string down as `base`.
//
// Two routes, two token kinds:
//   /share/library/<token>  the whole library; token is profile `library_share_token`
//   /share/backlog/<token>  ONE item; token is `backlog_items.share_token`. This is the only
//                           route that resolves an item token — /share/library/<item token>
//                           would 404 — so it is current, not legacy, despite the old name.

/** Public URL of the whole-library share page. */
export function libraryShareUrl(token: string, base: string = shareBaseUrl()): string {
  return `${base}/share/library/${encodeURIComponent(token)}`;
}

/** Public URL of a single library item's share page. */
export function itemShareUrl(token: string, base: string = shareBaseUrl()): string {
  return `${base}/share/backlog/${encodeURIComponent(token)}`;
}
