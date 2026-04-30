export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { BacklogItem } from "@/lib/types";
import LibraryClient from "./LibraryClient";

export const metadata: Metadata = {
  title: "Library",
  description: "Your personal media library — games, shows, movies, and books.",
};

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data } = await supabase
    .from("backlog_items")
    .select("*")
    .eq("user_id", user.id)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  return <LibraryClient initialItems={(data ?? []) as BacklogItem[]} />;
}
