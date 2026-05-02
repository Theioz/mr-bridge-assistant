import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function appUrl() {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(".supabase.co", ".vercel.app") ??
    ""
  );
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { randomUUID } = await import("crypto");
  const token = randomUUID();

  const { error } = await supabase
    .from("profile")
    .upsert(
      { user_id: user.id, key: "library_share_token", value: token },
      { onConflict: "user_id,key" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ share_token: token, share_url: `${appUrl()}/share/library/${token}` });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("profile")
    .delete()
    .eq("user_id", user.id)
    .eq("key", "library_share_token");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
