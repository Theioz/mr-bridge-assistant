import { anthropic } from "@ai-sdk/anthropic";
import { Output, ToolLoopAgent } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 30;

const SuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string().describe("Recipe or dish name"),
        description: z
          .string()
          .describe("1–2 sentence description of the dish, cooking method, and why it fits"),
        calories: z.number().describe("Estimated total calories (integer)"),
        protein_g: z.number().describe("Estimated protein in grams"),
        carbs_g: z.number().describe("Estimated carbohydrates in grams"),
        fat_g: z.number().describe("Estimated fat in grams"),
        isSaved: z.boolean().describe("true if this matches a saved recipe in the user's library"),
        recipeId: z
          .string()
          .optional()
          .describe("UUID of the matching saved recipe, if isSaved is true"),
      }),
    )
    .describe("2–3 meal suggestions (return between 1 and 3 items)"),
});

interface PostBody {
  ingredients: string;
  todayMacros: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  goals: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
}

export async function POST(req: Request) {
  // Auth guard
  const serverClient = await createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.ingredients?.trim()) {
    return Response.json({ error: "ingredients is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch saved recipes and dietary preferences in parallel
  const [{ data: savedRecipes }, { data: profileRows }] = await Promise.all([
    supabase
      .from("recipes")
      .select("id, name, cuisine, ingredients, tags")
      .eq("user_id", userId)
      .order("name"),
    supabase.from("profile").select("key, value").eq("user_id", userId),
  ]);

  const profileMap: Record<string, string> = {};
  for (const row of profileRows ?? []) {
    profileMap[row.key] = row.value;
  }

  // Dietary preferences from profile
  const dietaryPrefs = [
    profileMap["dietary_preferences"],
    profileMap["dietary_restrictions"],
    profileMap["cuisine_preferences"],
  ]
    .filter(Boolean)
    .join("; ");

  // Macro budget
  const remaining = {
    calories:
      body.goals.calories != null
        ? Math.max(0, body.goals.calories - body.todayMacros.calories)
        : null,
    protein_g:
      body.goals.protein_g != null
        ? Math.max(0, body.goals.protein_g - body.todayMacros.protein_g)
        : null,
    carbs_g:
      body.goals.carbs_g != null
        ? Math.max(0, body.goals.carbs_g - body.todayMacros.carbs_g)
        : null,
    fat_g: body.goals.fat_g != null ? Math.max(0, body.goals.fat_g - body.todayMacros.fat_g) : null,
  };

  // Saved recipe summary for the prompt
  const savedSummary =
    savedRecipes && savedRecipes.length > 0
      ? savedRecipes.map((r) => `- ${r.name} (id: ${r.id}): ${r.ingredients ?? ""}`).join("\n")
      : "None";

  const instructions =
    "You are a meal planning assistant. Suggest 2–3 meals the user can make right now.";

  const userMessage = `INGREDIENTS ON HAND:
${body.ingredients}

REMAINING MACRO BUDGET FOR TODAY:
${remaining.calories != null ? `Calories: ${remaining.calories} kcal` : "Calorie goal not set"}
${remaining.protein_g != null ? `Protein: ${remaining.protein_g}g` : "Protein goal not set"}
${remaining.carbs_g != null ? `Carbs: ${remaining.carbs_g}g` : "Carbs goal not set"}
${remaining.fat_g != null ? `Fat: ${remaining.fat_g}g` : "Fat goal not set"}

DIETARY PREFERENCES:
${dietaryPrefs || "None specified"}

USER'S SAVED RECIPE LIBRARY (check these first for matches):
${savedSummary}

INSTRUCTIONS:
- Suggest meals that can be made primarily from the listed ingredients
- Assume bare pantry staples are available: salt, pepper, oil, butter, garlic, onion, basic dry spices, soy sauce, stock
- Check the saved recipe library first — if a saved recipe is a good fit, set isSaved=true and recipeId to the recipe's UUID
- Fill remaining slots with original suggestions from your knowledge (isSaved=false)
- Prioritize hitting the remaining macro budget — prefer protein-forward meals if protein budget is large
- Macro estimates should be conservative and realistic
- Keep descriptions concise: cooking method + why it fits the macros`;

  try {
    const agent = new ToolLoopAgent({
      model: anthropic("claude-sonnet-4-6"),
      instructions,
      output: Output.object({ schema: SuggestionsSchema }),
    });
    const { output } = await agent.generate({
      messages: [{ role: "user", content: userMessage }],
    });

    return Response.json(output);
  } catch (err) {
    console.error("[meals/suggest] Claude error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to generate suggestions" },
      { status: 500 },
    );
  }
}
