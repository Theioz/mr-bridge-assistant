import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("backlog_sessions")
    .select("*")
    .eq("item_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify item belongs to this user
  const { data: item } = await supabase
    .from("backlog_items")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const body = await req.json();
  const { started_at, finished_at, notes } = body;

  const { data, error } = await supabase
    .from("backlog_sessions")
    .insert({
      item_id: id,
      user_id: user.id,
      started_at: started_at ?? null,
      finished_at: finished_at ?? null,
      notes: notes ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
