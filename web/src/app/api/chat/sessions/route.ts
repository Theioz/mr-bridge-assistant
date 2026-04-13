import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export interface SessionPreview {
  id: string;
  device: string | null;
  started_at: string;
  last_active_at: string;
  preview: string | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sessions, error } = await supabase
    .from("chat_sessions")
    .select("id, device, started_at, last_active_at")
    .eq("device", "web")
    .order("last_active_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch first user message for each session as preview (batched)
  const sessionList = sessions ?? [];

  const previews = await Promise.all(
    sessionList.map(async (session) => {
      const { data: firstMsg } = await supabase
        .from("chat_messages")
        .select("content")
        .eq("session_id", session.id)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const raw = firstMsg?.content ?? null;
      const preview = raw
        ? raw.slice(0, 60).trim() + (raw.length > 60 ? "\u2026" : "")
        : null;

      return { ...session, preview } as SessionPreview;
    })
  );

  // Omit sessions with no messages yet (empty sessions from old pre-creation flow)
  const withMessages = previews.filter((s) => s.preview !== null);

  return NextResponse.json({ sessions: withMessages });
}
