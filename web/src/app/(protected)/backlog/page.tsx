export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { BacklogItem } from "@/lib/types";
import BacklogClient from "./BacklogClient";

export const metadata: Metadata = {
  title: "Backlog",
  description: "Track games, shows, movies, and books with metadata, ratings, and session logs.",
};

export default async function BacklogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let items: BacklogItem[] = [];
  if (user) {
    const { data } = await supabase
      .from("backlog_items")
      .select("*")
      .eq("user_id", user.id)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });
    items = (data ?? []) as BacklogItem[];
  }

  return <BacklogClient initialItems={items} />;
}
