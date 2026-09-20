import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { OURA_AUTHORIZE_URL, ouraScopes } from "@/lib/sync/oura";

// Oura deprecated Personal Access Tokens; OAuth2 is the replacement. This mirrors the
// Google Health flow (api/auth/google-health/start) rather than inventing a second shape.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.OURA_CLIENT_ID;
  const redirectUri = process.env.OURA_OAUTH_REDIRECT_URI;
  if (!clientId || !process.env.OURA_CLIENT_SECRET || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Oura OAuth not configured (missing OURA_CLIENT_ID, OURA_CLIENT_SECRET, or OURA_OAUTH_REDIRECT_URI)",
      },
      { status: 500 },
    );
  }

  const csrf = crypto.randomUUID();
  const url = new URL(OURA_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", ouraScopes().join(" "));
  url.searchParams.set("state", csrf);

  const cookieStore = await cookies();
  cookieStore.set("oura_oauth_csrf", csrf, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes — enough for the OAuth round-trip
    path: "/",
  });

  return NextResponse.redirect(url.toString());
}
