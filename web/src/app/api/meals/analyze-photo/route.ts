import { createClient } from "@/lib/supabase/server";
import { estimateFromPhoto } from "@/lib/nutrition/estimate";
import { readNutritionLabel } from "@/lib/nutrition/parse";

/**
 * Meal photo -> macros, and nutrition label -> macros. Was Anthropic vision (#476).
 *
 * Two very different jobs behind one endpoint:
 *
 * - mode=food   The local VLM identifies the foods and portions; USDA FoodData
 *               Central supplies the macros. The model never produces a calorie.
 *               The user's `prompt`/`user_context` is AUTHORITATIVE — a stated
 *               "6oz" is used verbatim rather than re-guessed from pixels, and a
 *               stated dish name settles identification. Portion-from-pixels is
 *               the weakest link, so letting the user hand us what they know is
 *               the single biggest accuracy lever here.
 *
 * - mode=label  Pure OCR. The manufacturer already did the measuring; we just
 *               transcribe. No USDA lookup, no estimation — the most reliable
 *               path in the feature.
 */

export type FoodAnalysis = {
  food_name: string;
  ingredients: string;
  meal_type_guess: "breakfast" | "lunch" | "dinner" | "snack";
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number;
  confidence: "high" | "medium" | "low";
  notes: string;
};

export type NutritionLabel = {
  product_name: string;
  serving_size: string;
  servings_per_container: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  readable: boolean;
  notes: string;
};

function mealTypeByHour(): FoodAnalysis["meal_type_guess"] {
  const tz = process.env.USER_TIMEZONE || "America/Los_Angeles";
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(
      new Date(),
    ),
  );
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

const MAX_SIZE = 5 * 1024 * 1024;
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!imageFile.type.startsWith("image/") || !SUPPORTED_TYPES.includes(imageFile.type)) {
    return Response.json(
      { error: `Unsupported format: ${imageFile.type}. Use JPEG, PNG, or WebP.` },
      { status: 400 },
    );
  }
  if (imageFile.size > MAX_SIZE) {
    return Response.json({ error: "Image too large (max 5MB)" }, { status: 400 });
  }

  // The user's own words about the dish. Either field may carry it depending on
  // which surface posted; both are size-capped.
  const promptRaw = String(formData.get("prompt") ?? "").trim();
  const contextRaw = String(formData.get("user_context") ?? "").trim();
  if (promptRaw.length > 500 || contextRaw.length > 500) {
    return Response.json({ error: "description must be ≤ 500 characters" }, { status: 400 });
  }
  const description = [promptRaw, contextRaw].filter(Boolean).join(". ");

  const mode = formData.get("mode") === "label" ? "label" : "food";

  const base64 = Buffer.from(await imageFile.arrayBuffer()).toString("base64");

  try {
    if (mode === "label") {
      const label = await readNutritionLabel(base64);
      return Response.json(label satisfies NutritionLabel);
    }

    const est = await estimateFromPhoto(base64, { description: description || undefined });

    if (est.items.length === 0) {
      return Response.json(
        {
          error:
            "Could not identify any food. Try describing the dish in the box below the photo " +
            "(e.g. 'beef bolognese with parmesan, about 300g') — a description is used verbatim.",
        },
        { status: 422 },
      );
    }

    const out: FoodAnalysis & { items: typeof est.items } = {
      food_name: est.food_name,
      // Human-readable breakdown of what we actually matched and weighed.
      ingredients: est.items.map((i) => `${i.matched} ~${i.grams}g`).join(", "),
      meal_type_guess: mealTypeByHour(),
      calories: est.totals.calories,
      protein_g: est.totals.protein_g,
      carbs_g: est.totals.carbs_g,
      fat_g: est.totals.fat_g,
      fiber_g: est.totals.fiber_g,
      sugar_g: est.totals.sugar_g,
      sodium_mg: est.totals.sodium_mg,
      confidence: est.confidence,
      notes: description
        ? `${est.notes} Your description was used for identification and any quantities you stated.`
        : `${est.notes} Portions estimated from the image — describe the dish for a better estimate.`,
      items: est.items,
    };

    return Response.json(out);
  } catch (err) {
    console.error("[analyze-photo] failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
