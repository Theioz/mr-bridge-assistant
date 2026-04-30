import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchTmdb } from "@/lib/backlog/tmdb";
import { searchIgdb } from "@/lib/backlog/igdb";
import { searchOpenLibrary } from "@/lib/backlog/openlibrary";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const q = searchParams.get("q")?.trim();

  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });
  if (!type || !["movie", "show", "game", "book"].includes(type)) {
    return NextResponse.json({ error: "type must be movie | show | game | book" }, { status: 400 });
  }

  try {
    let results;
    if (type === "movie") results = await searchTmdb(q, "movie");
    else if (type === "show") results = await searchTmdb(q, "show");
    else if (type === "game") results = await searchIgdb(q);
    else results = await searchOpenLibrary(q);

    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
