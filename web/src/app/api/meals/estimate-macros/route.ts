import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 20;

const MacroEstimateSchema = z.object({
  food_name: z.string().describe("Cleaned-up name of the dish or food item"),
  meal_type_guess: z
    .enum(["breakfast", "lunch", "dinner", "snack"])
    .describe("Best guess for meal type based on the food"),
  calories: z.number().int().describe("Estimated total calories for the described portion"),
  protein_g: z.number().describe("Estimated protein in grams"),
  carbs_g: z.number().describe("Estimated carbohydrates in grams"),
  fat_g: z.number().describe("Estimated fat in grams"),
  fiber_g: z.number().describe("Estimated dietary fiber in grams"),
  sodium_mg: z.number().int().describe("Estimated sodium in milligrams"),
  confidence: z.enum(["high", "medium", "low"]).describe("Confidence level of the estimate"),
  notes: z.string().describe("Brief caveats, e.g. 'portion size assumed standard serving'"),
});

export type MacroEstimate = z.infer<typeof MacroEstimateSchema>;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ingredients: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.ingredients?.trim()) {
    return Response.json({ error: "ingredients is required" }, { status: 400 });
  }

  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: MacroEstimateSchema,
      messages: [
        {
          role: "user",
          content: `Estimate the nutritional content of a meal with these ingredients:

"${body.ingredients.trim()}"

Instructions:
- Use the listed ingredients and quantities to estimate macros
- If quantities are missing, assume a standard single serving
- Use conservative estimates — do not inflate
- Set confidence to "high" if ingredients and quantities are clearly specified
- Set confidence to "low" if ingredients are vague or quantities are absent
- Include any key assumptions in notes`,
        },
      ],
    });

    return Response.json(object);
  } catch (err) {
    console.error("[estimate-macros] Claude error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Estimation failed" },
      { status: 500 }
    );
  }
}
