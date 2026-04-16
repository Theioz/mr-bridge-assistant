export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import JournalTabs from "@/components/journal/journal-tabs";

export const metadata: Metadata = {
  title: "Journal",
  description: "Guided journal entries and history.",
};
import type { JournalEntry, JournalResponses } from "@/lib/types";
import { todayString } from "@/lib/timezone";

async function saveJournalEntry(
  date: string,
  responses: JournalResponses,
  freeWrite: string
): Promise<{ error?: string }> {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const { error } = await supabase
    .from("journal_entries")
    .upsert(
      {
        date,
        user_id: user.id,
        responses,
        free_write: freeWrite.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date,user_id" }
    );
  if (error) return { error: error.message };
  revalidatePath("/journal");
  return {};
}

export default async function JournalPage() {
  const supabase = await createClient();
  const today = todayString();

  const [todayResult, allResult] = await Promise.all([
    supabase.from("journal_entries").select("*").eq("date", today).maybeSingle(),
    supabase
      .from("journal_entries")
      .select("*")
      .order("date", { ascending: false })
      .limit(31),
  ]);

  const todayEntry  = todayResult.data as JournalEntry | null;
  const allEntries  = (allResult.data ?? []) as JournalEntry[];

  const dateLabel = new Date(today + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="prose-column"
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-7)" }}
    >
      {/* Header */}
      <header>
        <h1
          className="font-heading"
          style={{ fontSize: "var(--t-h1)", fontWeight: 600, color: "var(--color-text)" }}
        >
          Journal
        </h1>
        <p
          className="tnum"
          style={{
            marginTop: "var(--space-1)",
            fontSize: "var(--t-micro)",
            letterSpacing: "0.04em",
            color: "var(--color-text-muted)",
          }}
        >
          {dateLabel}
        </p>
      </header>

      <JournalTabs
        today={today}
        initialResponses={todayEntry?.responses ?? {}}
        initialFreeWrite={todayEntry?.free_write ?? ""}
        allEntries={allEntries}
        saveAction={saveJournalEntry}
      />
    </div>
  );
}
