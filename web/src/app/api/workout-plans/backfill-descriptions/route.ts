import { createClient } from "@/lib/supabase/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
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

  // Single Haiku call — generate description + tips for all missing exercises at once
  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: z.object({
      exercises: z.array(
        z.object({
          exercise: z.string(),
          description: z.string(),
          tips: z.array(z.string()),
        }),
      ),
    }),
    prompt:
      `For each of the following exercises, write a 1–3 sentence description of how to perform it ` +
      `and 2–4 short tips covering form cues, muscles targeted, or common mistakes. ` +
      `Return them in the same order as the input list.\n\n` +
      `Exercises: ${exerciseList.join(", ")}`,
  });

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
