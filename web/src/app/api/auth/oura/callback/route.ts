import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { storeIntegration } from "@/lib/integrations/tokens";
import { OURA_TOKEN_URL, ouraScopes } from "@/lib/sync/oura";

const SETTINGS_URL = "/settings?connected=oura";

// Behind the Caddy reverse proxy, req.nextUrl.origin resolves to the container's bind
// address rather than the public host — same reason google-health/callback does this.
function appOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
}

interface OuraTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings?error=oura_denied", appOrigin(req)));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?error=oura_invalid", appOrigin(req)));
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("oura_oauth_csrf")?.value;
  if (!csrf || csrf !== state) {
    return NextResponse.redirect(new URL("/settings?error=oura_csrf", appOrigin(req)));
  }
  cookieStore.delete("oura_oauth_csrf");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appOrigin(req)));
  }

  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const redirectUri = process.env.OURA_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL("/settings?error=oura_unconfigured", appOrigin(req)));
  }

  let tokens: OuraTokenResponse;
  try {
    const res = await fetch(OURA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`token exchange returned ${res.status}`);
    tokens = (await res.json()) as OuraTokenResponse;
  } catch (e) {
    console.error("[/api/auth/oura/callback] exchange failed", e);
    return NextResponse.redirect(new URL("/settings?error=oura_exchange", appOrigin(req)));
  }

  // The authorization_code grant must return a refresh token — without one the unattended
  // cron sync would stop working the moment the access token expires, which is precisely
  // the silent failure this whole change exists to remove.
  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL("/settings?error=oura_no_refresh_token", appOrigin(req)));
  }

  const db = createServiceClient();
  try {
    await storeIntegration(db, user.id, "oura", {
      refreshToken: tokens.refresh_token,
      scopes: ouraScopes(),
    });
  } catch (e) {
    console.error("[/api/auth/oura/callback] store failed", e);
    return NextResponse.redirect(new URL("/settings?error=oura_store", appOrigin(req)));
  }

  return NextResponse.redirect(new URL(SETTINGS_URL, appOrigin(req)));
}
