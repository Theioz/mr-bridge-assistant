import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSports, type SportsFavorite } from "@/lib/sync/sports";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profileRow } = await supabase
    .from("profile")
    .select("value")
    .eq("user_id", user.id)
    .eq("key", "sports_favorites")
    .single();

  const favorites: SportsFavorite[] = profileRow?.value
    ? (JSON.parse(profileRow.value) as SportsFavorite[])
    : [];

  const result = await syncSports(supabase, user.id, favorites);
  return NextResponse.json(result);
}
