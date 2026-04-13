export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import JournalEditor from "@/components/journal/journal-editor";
import JournalHistory from "@/components/journal/journal-history";
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

  const [todayResult, historyResult] = await Promise.all([
    supabase.from("journal_entries").select("*").eq("date", today).maybeSingle(),
    supabase
      .from("journal_entries")
      .select("*")
      .neq("date", today)
      .order("date", { ascending: false })
      .limit(30),
  ]);

  const todayEntry  = todayResult.data as JournalEntry | null;
  const pastEntries = (historyResult.data ?? []) as JournalEntry[];

  const dateLabel = new Date(today + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
          Journal
        </h1>
        <p className="mt-1" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          {dateLabel}
        </p>
      </div>

      {/* Today's editor */}
      <JournalEditor
        date={today}
        initialResponses={todayEntry?.responses ?? {}}
        initialFreeWrite={todayEntry?.free_write ?? ""}
        saveAction={saveJournalEntry}
      />

      {/* Past entries */}
      {pastEntries.length > 0 && (
        <section>
          <p
            className="text-xs uppercase tracking-widest mb-3"
            style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
          >
            Past Entries
          </p>
          <JournalHistory entries={pastEntries} />
        </section>
      )}
    </div>
  );
}
