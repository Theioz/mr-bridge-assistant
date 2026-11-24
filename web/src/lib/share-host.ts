/**
 * Scope of the public share host.
 *
 * The app answers on two hostnames: the private app host (`APP_URL`) and the public
 * share host (`SHARE_BASE_URL`), which exists only so `/share/<token>` links work for
 * people outside the private network. The reverse proxy in front of the app already
 * restricts the share host to those paths. This is the same rule enforced a second
 * time, inside the app, so that a proxy rule that is too broad cannot by itself put the
 * rest of the app on the public host.
 *
 * On the share host the app serves `GET`/`HEAD /share/*` and nothing else. Static
 * assets never reach this check: the proxy matcher (src/proxy.ts) excludes them.
 *
 * Inactive unless `SHARE_BASE_URL` is set AND names a different host from `APP_URL` —
 * a single-host deploy, or local dev, has no separate share host to scope.
 */

function hostnameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The dedicated public share hostname, or null when there is none. */
export function shareHostname(): string | null {
  const share = hostnameOf(process.env.SHARE_BASE_URL);
  if (!share) return null;
  return share === hostnameOf(process.env.APP_URL) ? null : share;
}

/**
 * True when this request arrived on the share host and must not be served.
 * `host` is the raw Host header (may carry a port).
 */
export function blockedOnShareHost(
  host: string | null,
  pathname: string,
  method: string,
  shareHost: string | null = shareHostname(),
): boolean {
  if (!shareHost || !host) return false;
  const name = host.toLowerCase().replace(/:\d+$/, "");
  if (name !== shareHost) return false;
  const safeMethod = method === "GET" || method === "HEAD";
  return !(safeMethod && pathname.startsWith("/share/"));
}
