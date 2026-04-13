import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: msgs, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("session_id", id)
    .in("role", ["user", "assistant"])
    .order("position", { ascending: true, nullsFirst: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: msgs ?? [] });
}
