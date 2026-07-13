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
