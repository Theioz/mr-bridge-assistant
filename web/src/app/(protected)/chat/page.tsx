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

  // Find or create today's web session
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

    if (existing) session = existing as ChatSession;
  }

  if (!session) {
    const { data: created } = await supabase
      .from("chat_sessions")
      .insert({ device: "web" })
      .select()
      .single();
    session = created as ChatSession;
  }

  let initialMessages: Message[] = [];
  if (session?.id) {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id,role,content,created_at")
      .eq("session_id", session.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (msgs) {
      initialMessages = (msgs as ChatMessage[]).reverse().map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: new Date(m.created_at),
      }));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1
          className="font-heading font-semibold"
          style={{ fontSize: 24, color: "var(--color-text)" }}
        >
          Chat
        </h1>
        <a
          href="/chat?new=1"
          className="text-xs transition-colors duration-150 hover:text-[#E2E8F0]"
          style={{ color: "var(--color-text-muted)" }}
        >
          New session
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
