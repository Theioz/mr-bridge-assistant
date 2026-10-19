import type { SupabaseClient } from "@supabase/supabase-js";
import { ethanolKcal, standardDrinks } from "../nutrition/drinks.ts";
import { MEAL_ORIGINS, type MealOrigin } from "../nutrition/origin.ts";
import { ok, err, type ErrResult, type OkResult } from "./_contract.ts";

/**
 * Bodies of the `log_drink` and `log_measurement` MCP tools (program.ts).
 *
 * Kept apart from the AI SDK wrappers for the same reason as meal-actions.ts: no `ai` or `@/`
 * runtime import, so node's bundler-free test runner loads it directly. program.ts owns the
 * descriptions and input schemas; behaviour is here. `today` is passed in rather than read here
 * so the default date stays the repo's user-timezone helper (lib/timezone.ts todayString) without
 * this module importing through the `@/` alias.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The habit a logged drink breaks. Matched case-insensitively, exactly — not a partial match. */
export const NO_ALCOHOL_HABIT = "No Alcohol";

export interface LogDrinkInput {
  date?: string;
  beverage: string;
  volume_ml: number;
  abv_pct: number;
  carbs_g?: number;
  origin?: string;
  notes?: string;
}

export async function logDrink(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  input: LogDrinkInput,
): Promise<
  | OkResult<{
      meal_log_id: string;
      date: string;
      standard_drinks: number;
      calories: number;
      ethanol_kcal: number;
      carbs_g: number;
      habit: string | null;
    }>
  | ErrResult
> {
  if (!userId) return err("No user context");
  const date = input.date ?? today;
  if (!ISO_DATE.test(date)) return err(`date must be YYYY-MM-DD (got "${date}")`);
  const beverage = input.beverage?.trim();
  if (!beverage) return err("beverage is required");
  const carbs = input.carbs_g ?? 0;
  if (!Number.isFinite(carbs) || carbs < 0) return err("carbs_g must be a non-negative number");
  if (input.origin != null && !(MEAL_ORIGINS as readonly string[]).includes(input.origin)) {
    return err(`origin must be one of ${MEAL_ORIGINS.join(", ")}`);
  }

  let drinks: number;
  let alcKcal: number;
  try {
    drinks = standardDrinks(input.volume_ml, input.abv_pct);
    alcKcal = ethanolKcal(input.volume_ml, input.abv_pct);
  } catch (e) {
    return err((e as Error).message);
  }
  const calories = alcKcal + Math.round(carbs * 4);

  const { data: row, error: insertErr } = await supabase
    .from("meal_log")
    .insert({
      user_id: userId,
      date,
      // Alcohol has been logged as `snack` rows all along, so its calories already count toward
      // intake everywhere meal_log is summed. standard_drinks is what marks the row as alcohol.
      meal_type: "snack",
      calories,
      protein_g: 0,
      carbs_g: carbs,
      fat_g: 0,
      standard_drinks: drinks,
      origin: (input.origin as MealOrigin | undefined) ?? null,
      source: "drink_calc",
      notes: input.notes?.trim() ? `${beverage} — ${input.notes.trim()}` : beverage,
    })
    .select("id")
    .single();
  if (insertErr) return err(insertErr.message);
  if (!row) return err("meal_log insert returned no row — the drink may not have been logged.");

  // The drink breaks the day's No Alcohol habit. Missing habit = the user does not track it, which
  // is not a failure of logging the drink. A failed habit write IS reported, though: the drink
  // landed, but the habit would still read as kept.
  const { data: habits, error: lookupErr } = await supabase
    .from("habit_registry")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", NO_ALCOHOL_HABIT)
    .limit(1);
  if (lookupErr) {
    return err(`Drink logged (meal_log ${row.id}), but habit lookup failed: ${lookupErr.message}`);
  }
  const habit = (habits ?? [])[0] as { id: string; name: string } | undefined;
  if (habit) {
    const { error: habitErr } = await supabase.from("habits").upsert(
      { user_id: userId, habit_id: habit.id, date, completed: false },
      // The three-column target is the real unique constraint (migration 20260417000001); a
      // two-column (habit_id,date) target fails with 42P10 — see log_habit in habits.ts.
      { onConflict: "user_id,habit_id,date" },
    );
    if (habitErr) {
      return err(
        `Drink logged (meal_log ${row.id}), but marking "${habit.name}" missed failed: ${habitErr.message}`,
      );
    }
  }

  return ok({
    meal_log_id: row.id as string,
    date,
    standard_drinks: drinks,
    calories,
    ethanol_kcal: alcKcal,
    carbs_g: carbs,
    habit: habit ? `${habit.name} marked not completed` : null,
  });
}

export interface LogMeasurementInput {
  date?: string;
  waist_in?: number;
  notes?: string;
}

export async function logMeasurement(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  input: LogMeasurementInput,
) {
  if (!userId) return err("No user context");
  const date = input.date ?? today;
  if (!ISO_DATE.test(date)) return err(`date must be YYYY-MM-DD (got "${date}")`);
  if (input.waist_in == null && !input.notes?.trim()) {
    return err("Nothing to record: pass waist_in and/or notes");
  }
  // Mirrors the column CHECK (15 < waist_in < 80) so a unit slip (cm for in) is a clear error.
  if (input.waist_in != null && !(input.waist_in > 15 && input.waist_in < 80)) {
    return err(`waist_in must be inches between 15 and 80 (got ${input.waist_in})`);
  }

  const { data, error } = await supabase
    .from("body_measurements")
    .upsert(
      {
        user_id: userId,
        date,
        // Only the fields given: re-logging a day's notes must not null out its waist, and an
        // upsert writes exactly the columns it is handed.
        ...(input.waist_in != null ? { waist_in: Math.round(input.waist_in * 10) / 10 } : {}),
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      },
      { onConflict: "user_id,date" },
    )
    .select("date, waist_in, notes")
    .single();
  if (error) return err(error.message);
  if (!data) return err("Upsert returned no row — the measurement may not have been saved.");
  return ok({ measurement: data });
}
