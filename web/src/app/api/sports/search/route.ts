import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSportsProvider } from "@/lib/sync/sports";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ teams: [] });

  try {
    const teams = await getSportsProvider().searchTeams(q);
    return NextResponse.json({ teams });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, teams: [] }, { status: 502 });
  }
}
