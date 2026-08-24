import { NextResponse } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Scopes requested in a single consent flow. Calendar only, as of #693.
//
// gmail.readonly was dropped in #693 along with the package-tracking and important-email
// widgets — nothing reads the mailbox any more, so nothing should ask for it.
//
// IMPORTANT: removing it here narrows only NEW grants. Google does not shrink an existing
// grant, so a refresh token issued before #693 keeps its Gmail scope until the account
// re-consents. `include_granted_scopes: false` below is what makes a fresh authorization
// issue a correctly narrowed token rather than re-federating the old scope set; the
// integrations settings page flags a stale grant until the user disconnects and reconnects.
//
// The fitness.* scopes were removed in #607: the Google Fit REST API is deprecated and
// its sync was folded into Google Health, which is consented separately via
// /api/auth/google-health/start.
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
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
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Google OAuth not configured (missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_OAUTH_REDIRECT_URI)",
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
    scope: GOOGLE_SCOPES,
    state: csrf,
  });

  const cookieStore = await cookies();
  cookieStore.set("google_oauth_csrf", csrf, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes — enough for the OAuth round-trip
    path: "/",
  });

  return NextResponse.redirect(url);
}
