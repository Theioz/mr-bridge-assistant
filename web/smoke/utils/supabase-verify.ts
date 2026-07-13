import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is required for smoke verification. See docs/smoke-testing.md.`);
  }
  return v;
}

// Service-role client — bypasses RLS so the smoke can read rows created by
// the test account. Never run this against production Supabase.
export function createSmokeAdminClient(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SMOKE_SUPABASE_SERVICE_KEY");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
