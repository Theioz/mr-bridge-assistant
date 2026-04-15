export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { createClient } from "@/lib/supabase/server";
import ChatPageClient from "@/components/chat/chat-page-client";
import type { ChatMessage, ChatSession } from "@/lib/types";
import type { Message } from "ai";

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

  let initialMessages: Message[] = [];
  let initialHasMore = false;
  let initialOldestPosition: number | null = null;
  if (session?.id) {
    const LIMIT = 20;
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at, position")
      .eq("session_id", session.id)
      .in("role", ["user", "assistant"])
      .order("position", { ascending: false })
      .limit(LIMIT);

    if (msgs) {
      const ordered = [...(msgs as (ChatMessage & { position: number })[])].reverse();
      initialMessages = ordered.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: new Date(m.created_at),
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
