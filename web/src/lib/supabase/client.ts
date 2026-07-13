import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_COOKIE_NAME } from "./urls";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Pinned, because the browser and the server reach Supabase on DIFFERENT urls
      // and @supabase/ssr would otherwise derive a different cookie name on each side.
      // See urls.ts.
      cookieOptions: { name: SUPABASE_COOKIE_NAME },
    },
  );
}
