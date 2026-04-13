import { createServiceClient } from "@/lib/supabase/service";
import { todayString } from "@/lib/timezone";

interface MealLogBody {
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  notes?: string;
  date?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
  source?: string;
}

export async function POST(req: Request) {
  let body: MealLogBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validTypes = ["breakfast", "lunch", "dinner", "snack"];
  if (!body.meal_type || !validTypes.includes(body.meal_type)) {
    return Response.json({ error: "meal_type must be breakfast, lunch, dinner, or snack" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("meal_log")
    .insert({
      meal_type: body.meal_type,
      notes: body.notes ?? null,
      date: body.date ?? todayString(),
      calories: body.calories ?? null,
      protein_g: body.protein_g ?? null,
      carbs_g: body.carbs_g ?? null,
      fat_g: body.fat_g ?? null,
      fiber_g: body.fiber_g ?? null,
      sodium_mg: body.sodium_mg ?? null,
      source: body.source ?? "manual",
    })
    .select()
    .single();

  if (error) {
    console.error("[meals/log] Supabase error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}
