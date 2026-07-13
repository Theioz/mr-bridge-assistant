import { createClient } from "@supabase/supabase-js";
import { supabaseServerUrl } from "./urls";

// Service-role client — bypasses RLS. Only use in server-side API routes.
// Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createServiceClient() {
  return createClient(
    // Server-side: must NOT use the public vhost — the node cannot route to it.
    supabaseServerUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
