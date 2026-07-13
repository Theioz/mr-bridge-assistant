import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * OAuth / email-link landing route. GoTrue sends the browser here with a `code`.
 *
 * This route built its OWN Supabase client instead of using the shared one, so it
 * missed both self-host fixes and was the last auth path still broken after the
 * migration — the password-reset link dead-ended here with ?error=auth_error:
 *
 *   - it used NEXT_PUBLIC_SUPABASE_URL server-side. That is the tailnet vhost, and
 *     the app runs on compute-core, which has no route to it — so every exchange
 *     failed with "TypeError: fetch failed". The shared client uses
 *     SUPABASE_INTERNAL_URL.
 *   - it did not pin the cookie name, so it looked for the PKCE code_verifier under
 *     a name the browser never wrote. See urls.ts.
 *
 * Both are fixed by using the shared server client. Do not re-inline
 * createServerClient here.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const explicitNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const next = explicitNext ?? "/dashboard";

  // NOT `new URL(request.url).origin`. Behind Caddy, Next standalone sees its own
  // bind address, so every redirect from this route sent the browser to
  // https://0.0.0.0:3000 — not an address. On Vercel the request URL *was* the public
  // URL, which is why this only surfaced after the migration.
  const origin = process.env.APP_URL || new URL(request.url).origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // The onboarding gate only applies to a PLAIN sign-in. When the caller asked for
      // somewhere specific it is because the link means something specific — a password
      // reset asks for /reset-password — and diverting it strands the user in onboarding
      // with a live session and no way to finish what they clicked. (It sent the owner
      // there: an account with 49 profile keys that simply predates the flag, because
      // ordinary password login never reads it.)
      if (!explicitNext) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: flagRow } = await supabase
            .from("profile")
            .select("value")
            .eq("user_id", user.id)
            .eq("key", "onboarding_completed")
            .maybeSingle();
          if (!flagRow) {
            return NextResponse.redirect(`${origin}/onboarding`);
          }
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    // The old route swallowed this. A bare ?error=auth_error tells you nothing about
    // whether the code was stale, the verifier was missing, or Supabase was unreachable.
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
  } else {
    console.error("[auth/callback] no `code` in callback URL");
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
