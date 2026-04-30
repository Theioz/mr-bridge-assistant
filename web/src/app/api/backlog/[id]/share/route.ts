import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

// Generate a share token and return the public URL
export async function POST(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // gen_random_uuid() equivalent — use crypto in Node
  const { randomUUID } = await import("crypto");
  const token = randomUUID();

  const { data, error } = await supabase
    .from("backlog_items")
    .update({ share_token: token })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("share_token")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const appUrl =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(".supabase.co", ".vercel.app") ??
    "";
  const shareUrl = `${appUrl}/share/backlog/${data.share_token}`;
  return NextResponse.json({ share_token: data.share_token, share_url: shareUrl });
}

// Revoke share token
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("backlog_items")
    .update({ share_token: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
