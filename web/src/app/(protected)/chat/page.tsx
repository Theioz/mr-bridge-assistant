export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import ChatInterface from "@/components/chat/chat-interface";
import type { ChatMessage, ChatSession } from "@/lib/types";
import { todayString } from "@/lib/timezone";
import type { Message } from "ai";

export default async function ChatPage() {
  const supabase = await createClient();
  const today = todayString();

  // Find or create today's web session
  let session: ChatSession | null = null;

  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("device", "web")
    .gte("started_at", `${today}T00:00:00`)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    session = existing as ChatSession;
  } else {
    const { data: created } = await supabase
      .from("chat_sessions")
      .insert({ device: "web" })
      .select()
      .single();
    session = created as ChatSession;
  }

  // Load last 20 messages for this session as initial context
  let initialMessages: Message[] = [];
  if (session) {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", session.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(20);

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
    <div className="pt-6">
      <h1 className="text-xl font-semibold text-neutral-100 mb-4">Chat</h1>
      <ChatInterface
        sessionId={session?.id ?? ""}
        initialMessages={initialMessages}
      />
    </div>
  );
}
