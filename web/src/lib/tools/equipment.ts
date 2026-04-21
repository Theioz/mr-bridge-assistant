import { tool, jsonSchema } from "ai";
import type { ToolContext } from "./_context";

interface EquipmentRow {
  equipment_type: string;
  weight_lbs: number | null;
  resistance_level: string | null;
  count: number;
  notes: string | null;
}

export function buildEquipmentTools({ supabase, userId, isDemo }: ToolContext) {
  return {
    get_user_equipment: tool({
      description:
        "Fetch the user's full equipment inventory. Call this before proposing workout weights so exercises stay within available equipment. The returned `maxes` map gives the highest weight_lbs per equipment type — use it to cap weight suggestions.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        if (isDemo) {
          return {
            items: [
              { equipment_type: "dumbbell pair", weight_lbs: 30, resistance_level: null, count: 1, notes: null },
              { equipment_type: "resistance band", weight_lbs: null, resistance_level: "medium", count: 3, notes: null },
            ],
            maxes: { "dumbbell pair": 30 },
          };
        }
        if (!userId) return { error: "Not authenticated" };

        const { data, error } = await supabase
          .from("user_equipment")
          .select("equipment_type, weight_lbs, resistance_level, count, notes")
          .eq("user_id", userId)
          .order("equipment_type", { ascending: true });
        if (error) return { error: error.message };

        const items: EquipmentRow[] = data ?? [];

        // Pre-compute max weight per type so Bridge can cap proposals without aggregating
        const maxes: Record<string, number> = {};
        for (const row of items) {
          if (row.weight_lbs == null) continue;
          const t = row.equipment_type;
          if (maxes[t] === undefined || row.weight_lbs > maxes[t]) {
            maxes[t] = row.weight_lbs;
          }
        }

        return { items, maxes };
      },
    }),
  };
}
