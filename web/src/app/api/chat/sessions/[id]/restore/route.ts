import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (!session || session.user_id !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase
    .from("chat_sessions")
    .update({ deleted_at: null })
    .eq("id", id);

  return NextResponse.json({ restored: true });
}
