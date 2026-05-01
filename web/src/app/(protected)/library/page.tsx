export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { BacklogItem, MediaType, BacklogStatus, AllCounts, StatusCounts } from "@/lib/types";
import LibraryClient from "./LibraryClient";

export const metadata: Metadata = {
  title: "Library",
  description: "Your personal media library — games, shows, movies, and books.",
};

function buildCounts(rows: { media_type: string; status: string }[]): AllCounts {
  const empty = (): StatusCounts => ({
    active: 0,
    backlog: 0,
    paused: 0,
    finished: 0,
    dropped: 0,
    total: 0,
  });
  const result: AllCounts = {
    all: empty(),
    game: empty(),
    show: empty(),
    movie: empty(),
    book: empty(),
  };
  for (const row of rows) {
    const t = row.media_type as MediaType;
    const s = row.status as BacklogStatus;
    if (result[t]) {
      result[t][s]++;
      result[t].total++;
    }
    result.all[s]++;
    result.all.total++;
  }
  return result;
}

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: countRows }, { data: items }] = await Promise.all([
    // Lightweight count query — only two string columns, no metadata
    supabase.from("backlog_items").select("media_type, status").eq("user_id", user.id),
    // First page of items for the "all" tab
    supabase
      .from("backlog_items")
      .select("*")
      .eq("user_id", user.id)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .range(0, 49),
  ]);

  const initialCounts = buildCounts(countRows ?? []);

  return (
    <LibraryClient initialItems={(items ?? []) as BacklogItem[]} initialCounts={initialCounts} />
  );
}
