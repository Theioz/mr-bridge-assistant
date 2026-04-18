import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-request context threaded through every tool factory.
 *
 * `supabase` is the service-role client (tools bypass RLS and scope by
 * explicit `user_id` column filters — consistent with the pre-split
 * pattern in the route).
 *
 * `isDemo` gates tools that return stubbed data (gmail, calendar,
 * certain workout paths) vs real external calls.
 *
 * `sessionId` is only consumed by `get_session_history`, which walks
 * the current chat session's message history. Other tools ignore it.
 */
export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  isDemo: boolean;
  sessionId?: string;
}
