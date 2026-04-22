import { tool, jsonSchema } from "ai";
import { todayString } from "@/lib/timezone";
import { ok, err } from "./_contract";
import type { ToolContext } from "./_context";

export function buildHabitsTools({ supabase, userId }: ToolContext) {
  return {
    get_habits_today: tool({
      description:
        "Get all active habits and their completion status for today (or a specified date).",
      inputSchema: jsonSchema<{ date?: string }>({
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." },
        },
      }),
      execute: async ({ date }) => {
        const targetDate = date ?? todayString();
        let regQ = supabase
          .from("habit_registry")
          .select("id, name, emoji, category")
          .eq("active", true);
        let logQ = supabase
          .from("habits")
          .select("habit_id, completed, notes")
          .eq("date", targetDate);
        if (userId) {
          regQ = regQ.eq("user_id", userId);
          logQ = logQ.eq("user_id", userId);
        }
        const [registryResult, logsResult] = await Promise.all([regQ, logQ]);
        if (registryResult.error) return { error: registryResult.error.message };
        const logMap = new Map(
          (logsResult.data ?? []).map(
            (l: { habit_id: string; completed: boolean; notes: string | null }) => [l.habit_id, l],
          ),
        );
        return (registryResult.data ?? []).map(
          (h: { id: string; name: string; emoji: string | null; category: string | null }) => ({
            id: h.id,
            name: h.name,
            emoji: h.emoji,
            category: h.category,
            completed: logMap.get(h.id)?.completed ?? false,
            notes: logMap.get(h.id)?.notes ?? null,
          }),
        );
      },
    }),

    log_habit: tool({
      description: "Log a habit as completed. Looks up the habit by name from the registry.",
      inputSchema: jsonSchema<{ name: string; date?: string; notes?: string }>({
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Habit name (case-insensitive partial match)." },
          date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." },
          notes: { type: "string", description: "Optional notes." },
        },
      }),
      execute: async ({ name, date, notes }) => {
        const targetDate = date ?? todayString();
        let habQ = supabase
          .from("habit_registry")
          .select("id, name")
          .ilike("name", `%${name}%`)
          .eq("active", true)
          .limit(1);
        if (userId) habQ = habQ.eq("user_id", userId);
        const { data: habits, error: lookupError } = await habQ;
        if (lookupError) return err(lookupError.message);
        if (!habits || habits.length === 0) {
          // Include the user's actual active habits in the error payload (#346).
          // Without this the model fabricates plausible-sounding alternatives
          // instead of citing real ones — a #319-mirror: tool failed honestly
          // but the recovery-suggestion path hallucinated.
          let allQ = supabase
            .from("habit_registry")
            .select("name")
            .eq("active", true)
            .order("name");
          if (userId) allQ = allQ.eq("user_id", userId);
          const { data: active } = await allQ;
          const activeNames = (active ?? []).map((h: { name: string }) => h.name);
          return err(
            `No active habit matching "${name}" found. ` +
              `User's actual active habits: ${activeNames.length ? activeNames.join(", ") : "(none)"}. ` +
              `Suggest one of these, or propose creating a new habit — do not invent names.`,
          );
        }
        const habit = habits[0];
        const { data, error: upsertError } = await supabase
          .from("habits")
          .upsert(
            {
              user_id: userId,
              habit_id: habit.id,
              date: targetDate,
              completed: true,
              notes: notes ?? null,
            },
            // Migration 20260417000001 rekeyed the unique constraint from
            // (habit_id, date) to (user_id, habit_id, date). The other two
            // call sites were updated (seed_demo.py, cron/reset-demo) — this
            // one was missed, so every chat log_habit has been failing with
            // "no unique or exclusion constraint matching..." since that
            // migration landed.
            { onConflict: "user_id,habit_id,date" },
          )
          .select("habit_id, date, completed, notes")
          .single();
        if (upsertError) return err(upsertError.message);
        if (!data) return err("Upsert returned no row — habit may not have been logged.");
        return ok({ habit: habit.name, log: data });
      },
    }),
  };
}
