export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import ChatInterface from "@/components/chat/chat-interface";
import type { ChatMessage, ChatSession } from "@/lib/types";
import { todayString } from "@/lib/timezone";
import type { Message } from "ai";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const supabase = await createClient();
  const today = todayString();
  const { new: forceNew } = await searchParams;

  // Find or create today's web session (used as the write target for new messages)
  let session: ChatSession | null = null;

  if (!forceNew) {
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
    }
  }

  if (!session) {
    const { data: created } = await supabase
      .from("chat_sessions")
      .insert({ device: "web" })
      .select()
      .single();
    session = created as ChatSession;
  }

  // Load last 20 messages from the current session only
  let initialMessages: Message[] = [];
  if (session?.id) {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", session.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (msgs) {
      initialMessages = (msgs as ChatMessage[])
        .reverse()
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: new Date(m.created_at),
        }));
    }
  }

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-neutral-100">Chat</h1>
        <a
          href="/chat?new=1"
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          New chat
        </a>
      </div>
      <ChatInterface
        key={session?.id}
        sessionId={session?.id ?? ""}
        initialMessages={initialMessages}
      />
    </div>
  );
}
