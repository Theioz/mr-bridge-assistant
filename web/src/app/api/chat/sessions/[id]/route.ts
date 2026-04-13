import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const before = url.searchParams.get("before"); // position cursor
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);

  let query = supabase
    .from("chat_messages")
    .select("id, role, content, created_at, position")
    .eq("session_id", id)
    .in("role", ["user", "assistant"])
    .order("position", { ascending: false }) // newest first
    .limit(limit);

  if (before) query = query.lt("position", parseInt(before));

  const { data: msgs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reverse so the slice displays oldest→newest
  const ordered = (msgs ?? []).reverse();

  return NextResponse.json({
    messages: ordered,
    hasMore: (msgs ?? []).length === limit,
    oldestPosition: ordered[0]?.position ?? null,
  });
}
