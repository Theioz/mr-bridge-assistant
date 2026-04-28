import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

function buildCSP(nonce: string): string {
  // 'strict-dynamic' trusts scripts loaded by nonce-bearing scripts; host allowlists
  // are ignored by CSP3 browsers when strict-dynamic is present but left for fallback.
  const scriptSrc = isDev
    ? `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'nonce-${nonce}' 'strict-dynamic'`;

  // Dev: Next.js HMR injects <style> tags without nonces. We need 'unsafe-inline'
  // to allow them — but the CSP spec silently drops 'unsafe-inline' when a nonce
  // is also present. Omit the nonce from style-src-elem in dev so 'unsafe-inline'
  // actually takes effect. Production keeps the strict nonce-only policy.
  const styleSrcElem = isDev
    ? `style-src-elem 'self' 'unsafe-inline'`
    : `style-src-elem 'nonce-${nonce}' 'self'`;

  return [
    "default-src 'self'",
    scriptSrc,
    // style-src-elem governs <style> tags; style-src-attr governs style= attributes
    // (Radix UI portals set inline positioning styles that cannot carry a nonce).
    styleSrcElem,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: https://a.espncdn.com https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // Generate a per-request nonce and forward it to RSC via x-nonce request header
  // so layout.tsx can read it with headers() if needed.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const requestHeadersWithNonce = new Headers(request.headers);
  requestHeadersWithNonce.set("x-nonce", nonce);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeadersWithNonce } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll: (cookiesToSet: { name: string; value: string; options?: any }[]) => {
          // Must update both request and response cookies for token rotation to work
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Re-create with nonce headers so x-nonce is still forwarded after token rotation.
          supabaseResponse = NextResponse.next({ request: { headers: requestHeadersWithNonce } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session — do not remove this call
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/api/auth/") ||
    request.nextUrl.pathname.startsWith("/api/cron/") ||
    request.nextUrl.pathname.startsWith("/api/internal/");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  supabaseResponse.headers.set("Content-Security-Policy", buildCSP(nonce));
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|.*\\.(?:svg|png|jpg|ico|css|js)$).*)",
  ],
};
