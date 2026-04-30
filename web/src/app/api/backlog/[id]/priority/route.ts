import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

// PATCH /api/backlog/[id]/priority  body: { priority: number }
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { priority } = body;
  if (typeof priority !== "number") {
    return NextResponse.json({ error: "priority must be a number" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("backlog_items")
    .update({ priority })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, priority")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
