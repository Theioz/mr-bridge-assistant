import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const FITBIT_SCOPES = "activity heartrate sleep weight";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.FITBIT_CLIENT_ID;
  const redirectUri = process.env.FITBIT_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Fitbit OAuth not configured (missing FITBIT_CLIENT_ID or FITBIT_OAUTH_REDIRECT_URI)",
      },
      { status: 500 },
    );
  }

  const csrf = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: FITBIT_SCOPES,
    state: csrf,
  });

  const cookieStore = await cookies();
  cookieStore.set("fitbit_oauth_csrf", csrf, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(`https://www.fitbit.com/oauth2/authorize?${params}`);
}
