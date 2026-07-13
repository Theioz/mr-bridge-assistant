import { createClient } from "@/lib/supabase/server";
import { chatJSON } from "@/lib/nutrition/parse";
import { todayString, addDays } from "@/lib/timezone";
import type { WorkoutExercise } from "@/lib/types";

type Phase = "warmup" | "workout" | "cooldown";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Current Mon–Sun window
  const todayStr = todayString();
  const dow = (new Date(`${todayStr}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(todayStr, -dow);
  const sunday = addDays(monday, 6);

  const { data: plans, error } = await supabase
    .from("workout_plans")
    .select("id, date, warmup, workout, cooldown")
    .eq("user_id", user.id)
    .gte("date", monday)
    .lte("date", sunday)
    .order("date", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!plans || plans.length === 0) return Response.json({ ok: true, backfilled: 0 });

  // Collect unique exercise names that are missing description across all phases
  const missing = new Set<string>();
  for (const plan of plans) {
    for (const phase of ["warmup", "workout", "cooldown"] as Phase[]) {
      for (const ex of (plan[phase] as WorkoutExercise[]) ?? []) {
        if (!ex.description) missing.add(ex.exercise);
      }
    }
  }

  if (missing.size === 0) return Response.json({ ok: true, backfilled: 0 });

  const exerciseList = [...missing];

  // Local model (#476). This is a pure WRITING task — there is no database of
  // ground truth to look up, so unlike the macro paths there is nothing better to
  // defer to. It also runs at most once per new exercise and the result is stored,
  // so it is never on a hot path.
  const object = await chatJSON<{
    exercises: { exercise: string; description: string; tips: string[] }[];
  }>(
    [
      {
        role: "system",
        content:
          "You write concise, accurate strength-training exercise descriptions. " +
          "For each exercise: a 1-3 sentence description of how to perform it, and 2-4 " +
          "short tips covering form cues, muscles targeted, or common mistakes. " +
          "Return them in the same order as the input list. No motivational filler.",
      },
      { role: "user", content: `Exercises: ${exerciseList.join(", ")}` },
    ],
    {
      type: "object",
      properties: {
        exercises: {
          type: "array",
          items: {
            type: "object",
            properties: {
              exercise: { type: "string" },
              description: { type: "string" },
              tips: { type: "array", items: { type: "string" } },
            },
            required: ["exercise", "description", "tips"],
          },
        },
      },
      required: ["exercises"],
    },
    180_000,
  );

  // Build lookup map from the generated results
  const descByExercise = new Map<string, { description: string; tips: string[] }>();
  for (const item of object.exercises) {
    descByExercise.set(item.exercise.toLowerCase(), {
      description: item.description,
      tips: item.tips,
    });
  }

  // Apply to every plan row and upsert changed rows
  let backfilled = 0;
  for (const plan of plans) {
    let changed = false;
    const updated: Record<Phase, WorkoutExercise[]> = {
      warmup: plan.warmup as WorkoutExercise[],
      workout: plan.workout as WorkoutExercise[],
      cooldown: plan.cooldown as WorkoutExercise[],
    };

    for (const phase of ["warmup", "workout", "cooldown"] as Phase[]) {
      updated[phase] = updated[phase].map((ex) => {
        if (ex.description) return ex;
        const gen = descByExercise.get(ex.exercise.toLowerCase());
        if (!gen) return ex;
        changed = true;
        backfilled++;
        return { ...ex, description: gen.description, tips: gen.tips };
      });
    }

    if (changed) {
      await supabase
        .from("workout_plans")
        .update({
          warmup: updated.warmup,
          workout: updated.workout,
          cooldown: updated.cooldown,
          updated_at: new Date().toISOString(),
        })
        .eq("id", plan.id)
        .eq("user_id", user.id);
    }
  }

  return Response.json({ ok: true, backfilled });
}
