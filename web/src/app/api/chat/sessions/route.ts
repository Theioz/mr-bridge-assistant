import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export interface SessionPreview {
  id: string;
  device: string | null;
  started_at: string;
  last_active_at: string;
  deleted_at: string | null;
  preview: string | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const purgeCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  void supabase.from("chat_sessions").delete().lt("deleted_at", purgeCutoff);

  const { data: sessions, error } = await supabase
    .from("chat_sessions")
    .select("id, device, started_at, last_active_at, deleted_at")
    .eq("device", "web")
    .order("last_active_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
      const preview = raw ? raw.slice(0, 60).trim() + (raw.length > 60 ? "\u2026" : "") : null;

      return { ...session, preview } as SessionPreview;
    }),
  );

  const withMessages = previews.filter((s) => s.preview !== null);

  return NextResponse.json({ sessions: withMessages });
}
