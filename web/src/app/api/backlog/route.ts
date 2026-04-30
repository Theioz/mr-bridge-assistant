import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BacklogStatus, MediaType } from "@/lib/types";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as MediaType | null;
  const status = searchParams.get("status") as BacklogStatus | null;

  let q = supabase
    .from("backlog_items")
    .select("*")
    .eq("user_id", user.id)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (type) q = q.eq("media_type", type);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    media_type,
    title,
    creator,
    release_date,
    description,
    cover_url,
    external_id,
    external_source,
    metadata,
    status = "backlog",
  } = body;

  if (!media_type || !title) {
    return NextResponse.json({ error: "media_type and title are required" }, { status: 400 });
  }

  // Assign priority = max+1 within (user_id, media_type)
  const { data: maxRow } = await supabase
    .from("backlog_items")
    .select("priority")
    .eq("user_id", user.id)
    .eq("media_type", media_type)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle();

  const priority = (maxRow?.priority ?? -1) + 1;

  const { data, error } = await supabase
    .from("backlog_items")
    .insert({
      user_id: user.id,
      media_type,
      title,
      creator: creator ?? null,
      release_date: release_date ?? null,
      description: description ?? null,
      cover_url: cover_url ?? null,
      external_id: external_id ?? null,
      external_source: external_source ?? null,
      metadata: metadata ?? null,
      status,
      priority,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
