import { tool, jsonSchema } from "ai";
import { ok, err } from "./_contract";
import { STRICT_TOOLS } from "./_strict";
import type { ToolContext } from "./_context";

export function buildProfileTools({ supabase, userId }: ToolContext) {
  return {
    get_profile: tool({
      description: "Get all profile key/value entries.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        let q = supabase
          .from("profile")
          .select("key, value, updated_at")
          .order("key", { ascending: true });
        if (userId) q = q.eq("user_id", userId);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    update_profile: tool({
      description:
        "Upsert one or more profile key/value pairs. Use when the user explicitly agrees to save a goal, preference, or personal target. " +
        "For known fitness/nutrition goals use the canonical flat keys (weight_goal_lbs, body_fat_goal_pct, weekly_workout_goal, " +
        "weekly_active_cal_goal, calorie_goal, protein_goal, carbs_goal, fat_goal, fiber_goal) so they surface in the web UI. " +
        "For other goals use dot-notation (sleep.goal.hrs, study.goal.mins_per_day, etc.). " +
        "Always tell the user what you are about to write before calling this tool, then confirm each key that was saved.",
      inputSchema: jsonSchema<{ updates: { key: string; value: string }[] }>({
        type: "object",
        additionalProperties: false,
        required: ["updates"],
        properties: {
          updates: {
            type: "array",
            description: "Key/value pairs to upsert into the profile table.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "value"],
              properties: {
                key: { type: "string", description: "Profile key." },
                value: { type: "string", description: "Value to store (always a string)." },
              },
            },
          },
        },
      }),
      strict: STRICT_TOOLS.update_profile,
      execute: async ({ updates }) => {
        const rows = updates.map(({ key, value }) => ({
          key,
          value,
          ...(userId ? { user_id: userId } : {}),
        }));
        const { data, error: upsertError } = await supabase
          .from("profile")
          .upsert(rows, { onConflict: "user_id,key" })
          .select("key, value, updated_at");
        if (upsertError) return err(upsertError.message);
        if (!data || data.length !== rows.length) {
          return err(
            `Profile upsert returned ${data?.length ?? 0} rows, expected ${rows.length} — values may not be saved.`,
          );
        }
        return ok({ written: data });
      },
    }),
  };
}
