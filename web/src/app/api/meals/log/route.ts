import { createClient } from "@/lib/supabase/server";
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
  count?: number;
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const count = typeof body.count === "number" && body.count > 1 ? Math.round(body.count) : 1;

  const rowBase = {
    user_id: user.id,
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
  };

  if (count === 1) {
    const { data, error } = await supabase
      .from("meal_log")
      .insert(rowBase)
      .select()
      .single();

    if (error) {
      console.error("[meals/log] Supabase error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data, { status: 201 });
  }

  const rows = Array.from({ length: count }, () => ({ ...rowBase }));
  const { data, error } = await supabase.from("meal_log").insert(rows).select();

  if (error) {
    console.error("[meals/log] Supabase error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ count: data?.length ?? count }, { status: 201 });
}

interface MealLogPatchBody {
  id: string;
  notes?: string;
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack";
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

export async function PATCH(req: Request) {
  let body: MealLogPatchBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });

  const validTypes = ["breakfast", "lunch", "dinner", "snack"];
  if (body.meal_type && !validTypes.includes(body.meal_type)) {
    return Response.json({ error: "Invalid meal_type" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const updates: Record<string, unknown> = {};
  if (body.notes     !== undefined) updates.notes      = body.notes;
  if (body.meal_type !== undefined) updates.meal_type  = body.meal_type;
  if (body.calories  !== undefined) updates.calories   = body.calories;
  if (body.protein_g !== undefined) updates.protein_g  = body.protein_g;
  if (body.carbs_g   !== undefined) updates.carbs_g    = body.carbs_g;
  if (body.fat_g     !== undefined) updates.fat_g      = body.fat_g;

  const { data, error } = await supabase
    .from("meal_log")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
