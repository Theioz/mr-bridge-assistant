import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { storeIntegration } from "@/lib/integrations/tokens";

const SETTINGS_URL = "/settings?connected=google_health";

// Behind the Caddy reverse proxy, req.nextUrl.origin resolves to the container's bind
// address (http://0.0.0.0:3000) rather than the public host, so redirecting to it lands
// the browser on an unreachable URL. NEXT_PUBLIC_APP_URL is the app's own public origin.
function appOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings?error=google_health_denied", appOrigin(req)));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?error=google_health_invalid", appOrigin(req)));
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const csrf = cookieStore.get("google_health_oauth_csrf")?.value;
  if (!csrf || csrf !== state) {
    return NextResponse.redirect(new URL("/settings?error=google_health_csrf", appOrigin(req)));
  }
  cookieStore.delete("google_health_oauth_csrf");

  // Require authenticated user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appOrigin(req)));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_HEALTH_OAUTH_REDIRECT_URI!;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  let tokens;
  try {
    const { tokens: exchanged } = await oauth2Client.getToken(code);
    tokens = exchanged;
  } catch {
    return NextResponse.redirect(new URL("/settings?error=google_health_exchange", appOrigin(req)));
  }

  if (!tokens.refresh_token) {
    // Google only issues a refresh_token on first consent for a given scope set.
    // If it's missing, revoke the app's access and reconnect.
    return NextResponse.redirect(
      new URL("/settings?error=google_health_no_refresh_token", appOrigin(req)),
    );
  }

  const grantedScopes = tokens.scope?.split(" ") ?? [];

  // Use service client so we can write regardless of RLS
  const db = createServiceClient();
  try {
    await storeIntegration(db, user.id, "google_health", {
      refreshToken: tokens.refresh_token,
      scopes: grantedScopes,
    });
  } catch {
    return NextResponse.redirect(new URL("/settings?error=google_health_store", appOrigin(req)));
  }

  return NextResponse.redirect(new URL(SETTINGS_URL, appOrigin(req)));
}
