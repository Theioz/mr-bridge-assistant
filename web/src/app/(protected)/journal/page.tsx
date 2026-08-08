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
import { todayString, daysAgoString } from "@/lib/timezone";
import {
  buildJournalPrompts,
  isGreaseTheGrooveSession,
  type JournalPromptContext,
} from "@/lib/journal/prompts";

async function saveJournalEntry(
  date: string,
  responses: JournalResponses,
  freeWrite: string,
): Promise<{ error?: string }> {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const { error } = await supabase.from("journal_entries").upsert(
    {
      date,
      user_id: user.id,
      responses,
      free_write: freeWrite.trim() || null,
    },
    { onConflict: "date,user_id" },
  );
  if (error) return { error: error.message };
  revalidatePath("/journal");
  return {};
}

/**
 * Gathers the day's signals and turns them into free-write suggestions.
 *
 * Every query is RLS-scoped and best-effort: a failed or empty source narrows the
 * rule set rather than breaking the page, and `buildJournalPrompts` always returns
 * evergreen prompts when nothing notable fires.
 */
async function loadPrompts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  today: string,
  lastEntryDate: string | null,
) {
  const since = daysAgoString(21);

  const [habitRows, registryRows, mealRows, recoveryRows, strengthRows, weightRows, profileRows] =
    await Promise.all([
      supabase.from("habits").select("habit_id,date,completed").gte("date", since),
      // Retired habits keep their rows but must not drive suggestions.
      supabase.from("habit_registry").select("id,name").eq("active", true),
      supabase.from("meal_log").select("date,calories,protein_g").gte("date", since),
      supabase
        .from("recovery_metrics")
        .select("date,readiness,avg_hrv,resting_hr,total_sleep_hrs")
        .gte("date", since)
        .gt("total_sleep_hrs", 0)
        .order("date", { ascending: true }),
      supabase
        .from("strength_sessions")
        .select("performed_on,perceived_effort,strength_session_sets(exercise_name)")
        .gte("performed_on", since),
      supabase.from("fitness_log").select("date,weight_lb").gte("date", since),
      supabase.from("profile").select("key,value").in("key", ["calorie_goal", "protein_goal"]),
    ]);

  const nameById = new Map<string, string>(
    (registryRows.data ?? []).map((r) => [r.id as string, r.name as string]),
  );
  const named = (habitRows.data ?? []).map((h) => ({
    name: nameById.get(h.habit_id as string) ?? "",
    date: h.date as string,
    completed: !!h.completed,
  }));

  // Intake arrives one row per component; the rules want one row per day.
  const intakeByDate = new Map<string, { date: string; calories: number; protein_g: number }>();
  for (const m of mealRows.data ?? []) {
    const day = intakeByDate.get(m.date as string) ?? {
      date: m.date as string,
      calories: 0,
      protein_g: 0,
    };
    day.calories += (m.calories as number) ?? 0;
    day.protein_g += (m.protein_g as number) ?? 0;
    intakeByDate.set(day.date, day);
  }

  const goal = (key: string): number | null => {
    const raw = (profileRows.data ?? []).find((p) => p.key === key)?.value;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const ctx: JournalPromptContext = {
    today,
    alcohol: named.filter((h) => h.name === "No Alcohol"),
    habits: named.filter((h) => h.name && h.name !== "No Alcohol"),
    intake: [...intakeByDate.values()],
    recovery: (recoveryRows.data ?? []) as JournalPromptContext["recovery"],
    strength: (strengthRows.data ?? []).map((s) => {
      const sets = (s.strength_session_sets ?? []) as { exercise_name: string }[];
      return {
        performed_on: s.performed_on as string,
        perceived_effort: (s.perceived_effort as number | null) ?? null,
        isGreaseTheGroove: isGreaseTheGrooveSession(sets.map((set) => set.exercise_name)),
      };
    }),
    weights: (weightRows.data ?? [])
      .filter((w) => w.weight_lb != null)
      .map((w) => ({ date: w.date as string, weight_lb: w.weight_lb as number })),
    lastEntryDate,
    calorieGoal: goal("calorie_goal"),
    proteinGoal: goal("protein_goal"),
  };

  return buildJournalPrompts(ctx);
}

export default async function JournalPage() {
  const supabase = await createClient();
  const today = todayString();

  const [todayResult, allResult] = await Promise.all([
    supabase.from("journal_entries").select("*").eq("date", today).maybeSingle(),
    supabase.from("journal_entries").select("*").order("date", { ascending: false }).limit(31),
  ]);

  const todayEntry = todayResult.data as JournalEntry | null;
  const allEntries = (allResult.data ?? []) as JournalEntry[];
  const lastEntryDate = allEntries.find((e) => e.date < today)?.date ?? null;
  const prompts = await loadPrompts(supabase, today, lastEntryDate);

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
        prompts={prompts}
        saveAction={saveJournalEntry}
      />
    </div>
  );
}
