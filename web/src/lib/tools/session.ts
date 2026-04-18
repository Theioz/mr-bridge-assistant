import { tool, jsonSchema } from "ai";
import type { ToolContext } from "./_context";

/**
 * Tools that reflect on the current chat session — they walk the session's
 * own history. Separate from domain tools because their dependency is the
 * request's `sessionId`, not a data domain.
 */
export function buildSessionTools({ supabase, sessionId }: ToolContext) {
  return {
    get_session_history: tool({
      description: "Fetch earlier messages from this chat session. Use when the user references something said earlier that isn't in the current context window. Always ask the user before calling: \"Should I pull earlier messages from this session for more context?\"",
      inputSchema: jsonSchema<{ limit?: number }>({
        type: "object",
        properties: {
          limit: { type: "number", description: "How many messages to fetch (max 40). Defaults to 20." },
        },
      }),
      execute: async ({ limit = 20 }) => {
        if (!sessionId) return { error: "No session ID available." };
        const { data } = await supabase
          .from("chat_messages")
          .select("role, content, created_at")
          .eq("session_id", sessionId)
          .in("role", ["user", "assistant"])
          .order("position", { ascending: true, nullsFirst: false })
          .limit(Math.min(limit, 40));
        return data ?? [];
      },
    }),
  };
}
