import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

export const maxDuration = 30;

const FoodAnalysisSchema = z.object({
  food_name: z.string().describe("Name of the dish or food item"),
  ingredients: z
    .string()
    .describe(
      "Comma-separated list of visible ingredients and their estimated quantities, e.g. 'chicken breast ~150g, white rice ~1 cup, broccoli ~½ cup, olive oil ~1 tbsp'"
    ),
  meal_type_guess: z
    .enum(["breakfast", "lunch", "dinner", "snack"])
    .describe("Best guess for meal type based on the food"),
  calories: z.number().int().describe("Estimated total calories for the visible portion"),
  protein_g: z.number().describe("Estimated protein in grams"),
  carbs_g: z.number().describe("Estimated carbohydrates in grams"),
  fat_g: z.number().describe("Estimated fat in grams"),
  fiber_g: z.number().describe("Estimated dietary fiber in grams"),
  sodium_mg: z.number().int().describe("Estimated sodium in milligrams"),
  confidence: z.enum(["high", "medium", "low"]).describe("Confidence level of the analysis"),
  notes: z
    .string()
    .describe("Brief caveats or assumptions, e.g. 'portion size estimated from plate context'"),
});

export type FoodAnalysis = z.infer<typeof FoodAnalysisSchema>;

export async function POST(req: Request) {
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

  // Validate file type
  if (!imageFile.type.startsWith("image/")) {
    return Response.json({ error: "File must be an image" }, { status: 400 });
  }

  // Limit to 10 MB to avoid excessive token costs
  const MAX_SIZE = 10 * 1024 * 1024;
  if (imageFile.size > MAX_SIZE) {
    return Response.json({ error: "Image must be under 10 MB" }, { status: 400 });
  }

  // Read into memory — never stored, analyzed in-transit only
  const arrayBuffer = await imageFile.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = imageFile.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  try {
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: FoodAnalysisSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: base64,
              mimeType,
            },
            {
              type: "text",
              text: `Analyze this food photo and estimate its nutritional content.

Instructions:
- Identify the dish name and list all visible ingredients with estimated quantities
- Estimate macros and micros for the total visible portion (what would be eaten)
- Use conservative estimates — do not inflate
- If multiple items are present, sum the totals
- Set confidence to "high" only if the food is clearly identifiable and portion is estimable
- Set confidence to "low" if the image is unclear, the food is ambiguous, or portion size is very uncertain
- Include any key assumptions in notes (e.g. "sauce not included", "estimated half-plate portion")
- If this is not a food image, set food_name to "Unknown", ingredients to "unknown", and all numeric values to 0`,
            },
          ],
        },
      ],
    });

    return Response.json(object);
  } catch (err) {
    console.error("[analyze-photo] Claude error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
