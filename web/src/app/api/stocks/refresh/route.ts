import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncStocks } from "@/lib/sync/stocks";

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
    .eq("key", "stock_watchlist")
    .single();

  const tickers: string[] = profileRow?.value ? (JSON.parse(profileRow.value) as string[]) : [];

  if (tickers.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const result = await syncStocks(supabase, user.id, tickers);
  return NextResponse.json({ updated: result.updated });
}
