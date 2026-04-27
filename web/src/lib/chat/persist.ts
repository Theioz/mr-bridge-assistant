import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelMessage } from "ai";

export async function fetchUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ userName: string | null; proactivityEnabled: boolean }> {
  const { data: profileRows } = await supabase
    .from("profile")
    .select("key, value")
    .eq("user_id", userId)
    .in("key", ["name", "proactivity_enabled"]);
  const profileMap: Record<string, string> = {};
  for (const row of profileRows ?? []) profileMap[row.key as string] = row.value as string;
  return {
    userName: profileMap["name"] ?? null,
    proactivityEnabled: profileMap["proactivity_enabled"] !== "0",
  };
}

// Load the last 10 messages from this session as context (#319: was loading
// the FIRST 10 by ordering ascending then limiting — for any session past 10
// turns the model lost recent context, including its own prior tool results).
// Historical context stays text-only — the model needs flat strings from
// history, and `content` is authoritative for that.
export async function loadContextMessages(
  supabase: SupabaseClient,
  sessionId?: string,
): Promise<ModelMessage[]> {
  if (!sessionId) return [];
  const { data } = await supabase
    .from("chat_messages")
    .select("role, content, position")
    .eq("session_id", sessionId)
    .in("role", ["user", "assistant"])
    .order("position", { ascending: false, nullsFirst: false })
    .limit(20);
  if (!data) return [];
  // Filter out empty-content messages — they cause Anthropic 400 errors —
  // then reverse so messages flow oldest→newest into the model.
  return (data as { role: "user" | "assistant"; content: string }[])
    .filter((m) => m.content.trim() !== "")
    .reverse()
    .map((m) => ({ role: m.role, content: m.content })) as ModelMessage[];
}

// Upsert the session row — creates it if it doesn't exist yet (lazy session
// creation for new chats whose UUID was generated client-side before any DB write).
export async function upsertSession(
  supabase: SupabaseClient,
  opts: { sessionId: string; userId: string },
): Promise<void> {
  await supabase.from("chat_sessions").upsert(
    {
      id: opts.sessionId,
      user_id: opts.userId,
      device: "web",
      last_active_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

// Persist the user message before streaming starts so messages survive stream
// errors, timeouts, or aborts (fix for issue #132).
// Includes a dedup guard: skips insert if an identical user message was
// persisted in the last 10 seconds (handles retries — same message re-POSTed
// after a stream error).
export async function persistUserMessage(
  supabase: SupabaseClient,
  opts: {
    sessionId?: string;
    userId?: string;
    content: string;
    parts?: unknown;
  },
): Promise<void> {
  const { sessionId, userId, content, parts } = opts;
  if (!sessionId || !userId || !content.trim()) return;
  try {
    await upsertSession(supabase, { sessionId, userId });

    const { data: recent } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("session_id", sessionId)
      .eq("role", "user")
      .eq("content", content)
      .gte("created_at", new Date(Date.now() - 10_000).toISOString())
      .limit(1)
      .maybeSingle();

    if (!recent) {
      const { data: posRow } = await supabase
        .from("chat_messages")
        .select("position")
        .eq("session_id", sessionId)
        .order("position", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const nextPos = ((posRow?.position as number | null) ?? 0) + 1;

      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        user_id: userId,
        role: "user",
        content,
        parts: parts ?? [{ type: "text", text: content }],
        position: nextPos,
      });
    }
  } catch (err) {
    // Non-fatal — stream proceeds regardless; worst case the message is missing on refresh
    console.error("[chat] early user message persist error:", err);
  }
}

// Record billing-weighted token cost post-stream (#457).
// Caller computes the delta via effectiveTokensForQuota and skips this on
// the demo path (Groq is free). Errors are non-fatal.
export async function recordTurnQuota(
  supabase: SupabaseClient,
  userId: string,
  tokensDelta: number,
): Promise<void> {
  if (tokensDelta <= 0) return;
  const { error: recordErr } = await supabase.rpc("record_quota_tokens", {
    p_user_id: userId,
    p_tokens: tokensDelta,
  });
  if (recordErr) console.error("[chat] record_quota_tokens error:", recordErr);
}

// Persist the assistant message after the stream finishes.
// #342: dual-write — `content` is the preview snapshot (text or #319
// synthesized fallback); `parts` is the structured assistant message
// for round-trip rendering.
export async function persistAssistantMessage(
  supabase: SupabaseClient,
  opts: {
    sessionId: string;
    userId: string;
    content: string;
    parts: unknown;
  },
): Promise<void> {
  const { sessionId, userId, content, parts } = opts;
  const { data: posRow } = await supabase
    .from("chat_messages")
    .select("position")
    .eq("session_id", sessionId)
    .order("position", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const nextPos = ((posRow?.position as number | null) ?? 0) + 1;

  const { error: insertError } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    user_id: userId,
    role: "assistant",
    content,
    parts,
    position: nextPos,
  });
  if (insertError) throw insertError;
}
