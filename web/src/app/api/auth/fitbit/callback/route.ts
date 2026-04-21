import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { storeIntegration } from "@/lib/integrations/tokens";

const FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token";
const SETTINGS_URL = "/settings?connected=fitbit";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings?error=fitbit_denied", req.nextUrl.origin));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?error=fitbit_invalid", req.nextUrl.origin));
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const csrf = cookieStore.get("fitbit_oauth_csrf")?.value;
  if (!csrf || csrf !== state) {
    return NextResponse.redirect(new URL("/settings?error=fitbit_csrf", req.nextUrl.origin));
  }
  cookieStore.delete("fitbit_oauth_csrf");

  // Require authenticated user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const clientId = process.env.FITBIT_CLIENT_ID!;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET!;
  const redirectUri = process.env.FITBIT_OAUTH_REDIRECT_URI!;

  const credentials = btoa(`${clientId}:${clientSecret}`);
  let tokenData: Record<string, unknown>;
  try {
    const res = await fetch(FITBIT_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.redirect(
        new URL("/settings?error=fitbit_exchange", req.nextUrl.origin),
      );
    }
    tokenData = await res.json();
  } catch {
    return NextResponse.redirect(new URL("/settings?error=fitbit_exchange", req.nextUrl.origin));
  }

  const refreshToken = tokenData.refresh_token as string | undefined;
  if (!refreshToken) {
    return NextResponse.redirect(
      new URL("/settings?error=fitbit_no_refresh_token", req.nextUrl.origin),
    );
  }

  const grantedScopes = typeof tokenData.scope === "string" ? tokenData.scope.split(" ") : [];

  const db = createServiceClient();
  try {
    await storeIntegration(db, user.id, "fitbit", {
      refreshToken,
      scopes: grantedScopes,
    });
  } catch {
    return NextResponse.redirect(new URL("/settings?error=fitbit_store", req.nextUrl.origin));
  }

  return NextResponse.redirect(new URL(SETTINGS_URL, req.nextUrl.origin));
}
