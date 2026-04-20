export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ChatPageClient from "@/components/chat/chat-page-client";
import type { ChatMessage, ChatSession } from "@/lib/types";
import type { UIMessage } from "ai";

export const metadata: Metadata = {
  title: "Chat",
  description: "Conversational interface with Mr. Bridge.",
};

export default async function ChatPage() {
  const supabase = await createClient();

  // Load the most recent web session (no pre-creation — new sessions are lazy)
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("device", "web")
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let initialMessages: UIMessage[] = [];
  let initialHasMore = false;
  let initialOldestPosition: number | null = null;
  if (session?.id) {
    const LIMIT = 20;
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id, role, content, parts, created_at, position")
      .eq("session_id", session.id)
      .in("role", ["user", "assistant"])
      .order("position", { ascending: false })
      .limit(LIMIT);

    if (msgs) {
      const ordered = [...(msgs as (ChatMessage & { position: number })[])].reverse();
      initialMessages = ordered.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        // Hydrate from structured `parts` (tool calls, tool results, file
        // attachments round-trip). Fallback to a synthetic text part protects
        // against rows the migration somehow missed.
        parts: (m.parts as UIMessage["parts"] | null) ?? [
          { type: "text" as const, text: m.content },
        ],
        metadata: { createdAt: m.created_at },
      }));
      initialHasMore = msgs.length === LIMIT;
      initialOldestPosition = ordered[0]?.position ?? null;
    }
  }

  return (
    <div className="h-full flex flex-col">
      <ChatPageClient
        initialSessionId={(session as ChatSession | null)?.id ?? null}
        initialMessages={initialMessages}
        initialHasMore={initialHasMore}
        initialOldestPosition={initialOldestPosition}
      />
    </div>
  );
}
