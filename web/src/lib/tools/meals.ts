import { tool, jsonSchema } from "ai";
import { todayString } from "@/lib/timezone";
import type { ToolContext } from "./_context";

export function buildMealsTools({ supabase, userId }: ToolContext) {
  return {
    get_recipes: tool({
      description:
        "Search saved recipes by ingredient, name, or tag. Omit query to return all recipes.",
      inputSchema: jsonSchema<{ query?: string }>({
        type: "object",
        properties: {
          query: { type: "string", description: "Ingredient, recipe name, or tag to search for." },
        },
      }),
      execute: async ({ query }) => {
        let req = supabase
          .from("recipes")
          .select("id, name, cuisine, ingredients, instructions, tags");
        if (userId) req = req.eq("user_id", userId);
        if (query) {
          req = req.or(`name.ilike.%${query}%,ingredients.ilike.%${query}%`);
        }
        const { data, error } = await req.order("name");
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    get_today_meals: tool({
      description:
        "Get all meals logged today. Call this before making any claim about what the user has or hasn't eaten today.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        const today = todayString();
        let q = supabase
          .from("meal_log")
          .select("meal_type, notes, calories, protein_g, carbs_g, fat_g, recipes(name)")
          .eq("date", today);
        if (userId) q = q.eq("user_id", userId);
        const { data } = await q;
        return data ?? [];
      },
    }),
  };
}
