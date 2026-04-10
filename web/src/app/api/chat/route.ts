import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const supabase = createServiceClient();

  // Load the last 20 messages from this session as context
  let contextMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (sessionId) {
    const { data } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(20);
    if (data) {
      contextMessages = data as { role: "user" | "assistant"; content: string }[];
    }
  }

  const systemPrompt = `You are Mr. Bridge, Jason's personal AI assistant.

Style: Direct, structured, high-density. No filler, no emojis, no motivational language.
Quantify wherever possible. Conservative estimates. Lead with the answer, then reasoning.

You have access to Jason's habits, fitness, tasks, and personal data stored in Supabase.
When asked about current data, be specific about what you know vs. what you'd need to look up.`;

  // Strip extra fields (parts, id, etc.) that useChat adds — Anthropic only wants role + content
  const cleanMessages = messages.map((m: { role: "user" | "assistant"; content: string }) => ({
    role: m.role,
    content: m.content,
  }));

  const result = streamText({
    model: anthropic("claude-3-5-sonnet-20241022"),
    system: systemPrompt,
    messages: [...contextMessages, ...cleanMessages],
    onFinish: async ({ text }) => {
      if (!sessionId) return;

      const lastUserMessage = messages[messages.length - 1];

      await supabase.from("chat_messages").insert([
        {
          session_id: sessionId,
          role: "user",
          content: lastUserMessage.content,
        },
        {
          session_id: sessionId,
          role: "assistant",
          content: text,
        },
      ]);

      await supabase
        .from("chat_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", sessionId);
    },
  });

  return result.toDataStreamResponse();
}
