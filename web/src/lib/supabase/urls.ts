/**
 * Supabase base URLs — the browser and the server do NOT use the same one.
 *
 * On Vercel + Supabase Cloud both sides sat on the public internet, so one URL
 * served both. Self-hosted, they are on opposite sides of the network:
 *
 *   BROWSER  https://supabase.jl-infra-lab.com
 *            A tailnet vhost served by Caddy on Surface. The browser is on the
 *            tailnet, so this resolves and works.
 *
 *   SERVER   http://host.docker.internal:8000
 *            The app runs on compute-core, which has NO route to Surface's tailnet
 *            IP (ADR 0016 §2 — internal service refs must never use the vhosts).
 *            Using the public URL server-side fails with "TypeError: fetch failed"
 *            on every service-role call, cron run and RSC page.
 *
 * Both terminate at the same GoTrue + PostgREST containers.
 *
 * SUPABASE_INTERNAL_URL is optional: unset (e.g. local dev, or any deployment
 * where the server can reach the public URL) it falls back to the public one, so
 * nothing changes for anyone not behind this split.
 */

/** For server-side clients: service-role, RSC, route handlers, middleware. */
export function supabaseServerUrl(): string {
  return process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

/** For the browser client, and for the CSP connect-src allowlist. */
export function supabasePublicUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

/**
 * The auth-cookie name, pinned explicitly. Do not remove this.
 *
 * @supabase/ssr derives it from the Supabase URL's HOSTNAME — `sb-<ref>-auth-token`.
 * That is fine when both sides use one URL (Vercel + Cloud). Here they do not:
 *
 *   browser -> https://supabase.jl-infra-lab.com  =>  sb-supabase-auth-token
 *   server  -> http://supabase-gateway:8000       =>  sb-supabase-gateway-auth-token
 *
 * So the browser wrote one cookie and the server looked for another. Login SUCCEEDED
 * (GoTrue returned 200 and a session), then middleware found no session, redirected to
 * /login, and the sign-in button just span forever. A pinned name makes both agree.
 */
export const SUPABASE_COOKIE_NAME = "sb-mr-bridge-auth-token";
