import { NextResponse } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Google Health replaces the Fitbit Web API (turned down September 2026).
//
// These scopes are deliberately requested in a SEPARATE consent from the Calendar/Gmail
// flow, against the same OAuth client. Google revokes a refresh token on password change
// if that token carries Gmail scopes — issuing a health-only token keeps the unattended
// fitness sync alive through a password change. `include_granted_scopes: false` is what
// keeps the two tokens from merging.
const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_HEALTH_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Google Health OAuth not configured (missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_HEALTH_OAUTH_REDIRECT_URI)",
      },
      { status: 500 },
    );
  }

  const csrf = crypto.randomUUID();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: false,
    scope: GOOGLE_HEALTH_SCOPES,
    state: csrf,
  });

  const cookieStore = await cookies();
  cookieStore.set("google_health_oauth_csrf", csrf, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes — enough for the OAuth round-trip
    path: "/",
  });

  return NextResponse.redirect(url);
}
