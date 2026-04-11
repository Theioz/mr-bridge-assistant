export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import JournalFlow from "@/components/journal/journal-flow";
import JournalHistory from "@/components/journal/journal-history";
import type { JournalEntry, JournalResponses } from "@/lib/types";
import { todayString } from "@/lib/timezone";

async function saveJournalEntry(
  date: string,
  responses: JournalResponses
): Promise<{ error?: string }> {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase
    .from("journal_entries")
    .upsert(
      { date, responses, updated_at: new Date().toISOString() },
      { onConflict: "date" }
    );
  if (error) return { error: error.message };
  revalidatePath("/journal");
  return {};
}

export default async function JournalPage() {
  const supabase = await createClient();
  const today = todayString();

  const [todayResult, historyResult] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("*")
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("journal_entries")
      .select("*")
      .neq("date", today)
      .order("date", { ascending: false })
      .limit(14),
  ]);

  const todayEntry = todayResult.data as JournalEntry | null;
  const pastEntries = (historyResult.data ?? []) as JournalEntry[];

  return (
    <div className="pt-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Journal</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {todayEntry ? "Today's entry is saved." : "Take 5 minutes to reflect on today."}
        </p>
      </div>

      <section>
        <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Today</h2>
        <JournalFlow
          date={today}
          initialResponses={todayEntry?.responses ?? {}}
          saveAction={saveJournalEntry}
        />
      </section>

      {pastEntries.length > 0 && (
        <section>
          <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Past Entries</h2>
          <JournalHistory entries={pastEntries} />
        </section>
      )}
    </div>
  );
}
