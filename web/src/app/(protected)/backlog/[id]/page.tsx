export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BacklogItem, BacklogSession } from "@/lib/types";
import BacklogDetailClient from "./BacklogDetailClient";

type Props = { params: Promise<{ id: string }> };

export default async function BacklogDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: item } = await supabase
    .from("backlog_items")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) notFound();

  const { data: sessions } = await supabase
    .from("backlog_sessions")
    .select("*")
    .eq("item_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <BacklogDetailClient
      item={item as BacklogItem}
      initialSessions={(sessions ?? []) as BacklogSession[]}
      appUrl={process.env.APP_URL ?? ""}
    />
  );
}
