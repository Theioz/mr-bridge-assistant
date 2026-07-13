import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { suggestMeals, type SavedRecipe } from "@/lib/nutrition/suggest";

/**
 * Meal suggestions. Was a single claude-sonnet call that picked the dishes AND
 * invented their calorie counts (#476).
 *
 * Now split by competence: saved recipes are matched deterministically on
 * ingredient overlap, the local model proposes new dishes (the one genuinely
 * creative part), and USDA computes the macros for both — through the same
 * pipeline used when you actually log a meal. So a suggestion's numbers now agree
 * with what you'd get after eating it, which was never guaranteed before.
 */

interface PostBody {
  ingredients: string;
  todayMacros: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  goals: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
}

export async function POST(req: Request) {
  const serverClient = await createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
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

  const [{ data: savedRecipes }, { data: profileRows }] = await Promise.all([
    supabase
      .from("recipes")
      .select("id, name, cuisine, ingredients, tags")
      .eq("user_id", userId)
      .order("name"),
    supabase.from("profile").select("key, value").eq("user_id", userId),
  ]);

  const profileMap: Record<string, string> = {};
  for (const row of profileRows ?? []) profileMap[row.key] = row.value;

  const dietary = [
    profileMap["dietary_preferences"],
    profileMap["dietary_restrictions"],
    profileMap["cuisine_preferences"],
  ]
    .filter(Boolean)
    .join("; ");

  // What's left in today's budget. A null goal means "not set" — don't invent one.
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

  try {
    const suggestions = await suggestMeals({
      ingredients: body.ingredients,
      budget: remaining,
      savedRecipes: (savedRecipes ?? []) as SavedRecipe[],
      dietary,
      limit: 3,
    });

    if (suggestions.length === 0) {
      return Response.json(
        { error: "Could not build a suggestion from those ingredients. Try listing a few more." },
        { status: 422 },
      );
    }

    return Response.json({ suggestions });
  } catch (err) {
    console.error("[meals/suggest] failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to generate suggestions" },
      { status: 500 },
    );
  }
}
