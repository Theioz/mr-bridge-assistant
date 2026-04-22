import { anthropic } from "@ai-sdk/anthropic";
import { Output, ToolLoopAgent } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const FoodAnalysisSchema = z.object({
  food_name: z.string().describe("Name of the dish or food item"),
  ingredients: z
    .string()
    .describe(
      "Comma-separated list of visible ingredients and their estimated quantities, e.g. 'chicken breast ~150g, white rice ~1 cup, broccoli ~½ cup, olive oil ~1 tbsp'",
    ),
  meal_type_guess: z
    .enum(["breakfast", "lunch", "dinner", "snack"])
    .describe("Best guess for meal type based on the food"),
  calories: z.number().describe("Estimated total calories for the visible portion (integer)"),
  protein_g: z.number().describe("Estimated protein in grams"),
  carbs_g: z.number().describe("Estimated carbohydrates in grams"),
  fat_g: z.number().describe("Estimated fat in grams"),
  fiber_g: z
    .number()
    .nullable()
    .describe("Estimated dietary fiber in grams, or null if not applicable (e.g. pure fat/oil)"),
  sugar_g: z
    .number()
    .nullable()
    .describe("Estimated sugar in grams, or null if not applicable (e.g. plain protein/fat)"),
  sodium_mg: z.number().describe("Estimated sodium in milligrams (integer)"),
  confidence: z.enum(["high", "medium", "low"]).describe("Confidence level of the analysis"),
  notes: z
    .string()
    .describe("Brief caveats or assumptions, e.g. 'portion size estimated from plate context'"),
});

export type FoodAnalysis = z.infer<typeof FoodAnalysisSchema>;

const NutritionLabelSchema = z.object({
  product_name: z.string().describe("Product or food name if visible on the label"),
  serving_size: z.string().describe("Serving size as printed, e.g. '1 cup (240ml)' or '28g'"),
  servings_per_container: z.number().nullable().describe("Servings per container if printed"),
  calories: z.number().describe("Calories per serving as printed (integer)"),
  protein_g: z.number().describe("Protein in grams per serving"),
  carbs_g: z.number().describe("Total carbohydrates in grams per serving"),
  fat_g: z.number().describe("Total fat in grams per serving"),
  fiber_g: z.number().nullable().describe("Dietary fiber in grams per serving"),
  sugar_g: z.number().nullable().describe("Total sugars in grams per serving"),
  sodium_mg: z.number().nullable().describe("Sodium in milligrams per serving"),
  readable: z.boolean().describe("Whether the label was clearly readable"),
  notes: z
    .string()
    .describe(
      "Any caveats, e.g. 'label partially obscured' or 'daily value % used where grams not shown'",
    ),
});

export type NutritionLabel = z.infer<typeof NutritionLabelSchema>;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const imageFile = formData.get("image");
  if (!imageFile || !(imageFile instanceof File)) {
    return Response.json({ error: "No image file provided" }, { status: 400 });
  }

  const userPromptRaw = formData.get("prompt");
  const userPrompt = typeof userPromptRaw === "string" ? userPromptRaw.trim() : "";

  const modeRaw = formData.get("mode");
  const mode = modeRaw === "label" ? "label" : "food";

  // Validate file type
  if (!imageFile.type.startsWith("image/")) {
    return Response.json({ error: "File must be an image" }, { status: 400 });
  }

  // Reject unsupported formats (e.g. HEIC) that Claude cannot process
  const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!SUPPORTED_TYPES.includes(imageFile.type)) {
    return Response.json(
      { error: `Unsupported format: ${imageFile.type}. Use JPEG, PNG, or WebP.` },
      { status: 415 },
    );
  }

  // 4 MB backstop — Vercel's hard limit is 4.5 MB; client compresses first
  const MAX_SIZE = 4 * 1024 * 1024;
  if (imageFile.size > MAX_SIZE) {
    return Response.json({ error: "Image must be under 4 MB" }, { status: 413 });
  }

  // Read into memory — never stored, analyzed in-transit only
  const arrayBuffer = await imageFile.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = imageFile.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  try {
    if (mode === "label") {
      const agent = new ToolLoopAgent({
        model: anthropic("claude-sonnet-4-6"),
        instructions:
          "Read the nutrition facts label in this image precisely. Extract the exact printed values — do not estimate. If a value is not clearly legible, set it to null. Set readable to false if the label is too blurry, obscured, or not a nutrition facts label.",
        output: Output.object({ schema: NutritionLabelSchema }),
      });
      const { output } = await agent.generate({
        messages: [
          {
            role: "user",
            content: [{ type: "image", image: base64, mediaType: mimeType }],
          },
        ],
      });

      return Response.json({ mode: "label", ...output });
    }

    const foodAgent = new ToolLoopAgent({
      model: anthropic("claude-sonnet-4-6"),
      instructions: `Analyze this food photo and estimate its nutritional content.
Instructions:
- Identify the dish name and list all visible ingredients with estimated quantities
- Estimate macros and micros for the total visible portion (what would be eaten)
- Use conservative estimates — do not inflate
- If multiple items are present, sum the totals
- If the user provided context below, use it to improve accuracy (e.g. specific ingredients, portion size, cooking method)
- Set confidence to "high" only if the food is clearly identifiable and portion is estimable
- Set confidence to "low" if the image is unclear, the food is ambiguous, or portion size is very uncertain
- Include any key assumptions in notes (e.g. "sauce not included", "estimated half-plate portion")
- If this is not a food image, set food_name to "Unknown", ingredients to "unknown", and all numeric values to 0`,
      output: Output.object({ schema: FoodAnalysisSchema }),
    });
    const { output } = await foodAgent.generate({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: base64, mediaType: mimeType },
            ...(userPrompt ? [{ type: "text" as const, text: `User context: ${userPrompt}` }] : []),
          ],
        },
      ],
    });

    return Response.json({ mode: "food", ...output });
  } catch (err) {
    console.error("[analyze-photo] Claude error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
