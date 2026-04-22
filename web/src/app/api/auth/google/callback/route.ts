import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { storeIntegration } from "@/lib/integrations/tokens";

const SETTINGS_URL = "/settings?connected=google";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings?error=google_denied", req.nextUrl.origin));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?error=google_invalid", req.nextUrl.origin));
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const csrf = cookieStore.get("google_oauth_csrf")?.value;
  if (!csrf || csrf !== state) {
    return NextResponse.redirect(new URL("/settings?error=google_csrf", req.nextUrl.origin));
  }
  cookieStore.delete("google_oauth_csrf");

  // Require authenticated user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI!;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  let tokens;
  try {
    const { tokens: exchanged } = await oauth2Client.getToken(code);
    tokens = exchanged;
  } catch {
    return NextResponse.redirect(new URL("/settings?error=google_exchange", req.nextUrl.origin));
  }

  if (!tokens.refresh_token) {
    // Google only issues a refresh_token on first consent. If it's missing,
    // the user likely connected before without revoking. Show a helpful error.
    return NextResponse.redirect(
      new URL("/settings?error=google_no_refresh_token", req.nextUrl.origin),
    );
  }

  const grantedScopes = tokens.scope?.split(" ") ?? [];

  // Use service client so we can write regardless of RLS
  const db = createServiceClient();
  try {
    await storeIntegration(db, user.id, "google", {
      refreshToken: tokens.refresh_token,
      scopes: grantedScopes,
    });
  } catch {
    return NextResponse.redirect(new URL("/settings?error=google_store", req.nextUrl.origin));
  }

  return NextResponse.redirect(new URL(SETTINGS_URL, req.nextUrl.origin));
}
