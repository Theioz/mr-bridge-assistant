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
  if (session?.id) {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", session.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (msgs) {
      initialMessages = (msgs as ChatMessage[]).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: new Date(m.created_at),
      }));
    }
  }

  return (
    <div className="h-full flex flex-col">
      <ChatPageClient
        initialSessionId={(session as ChatSession | null)?.id ?? null}
        initialMessages={initialMessages}
      />
    </div>
  );
}
