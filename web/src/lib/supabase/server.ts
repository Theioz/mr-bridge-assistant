import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { supabaseServerUrl, SUPABASE_COOKIE_NAME } from "./urls";

export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseServerUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    // Must match the browser's cookie name — see urls.ts.
    cookieOptions: { name: SUPABASE_COOKIE_NAME },
    cookies: {
      getAll: () => cookieStore.getAll(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAll: (cookiesToSet: { name: string; value: string; options?: any }[]) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies — expected, not an error
        }
      },
    },
  });
});
