import { createClient } from "@/lib/supabase/server";
import { todayString } from "@/lib/timezone";

export interface TodayTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const today = todayString();

  const { data, error } = await supabase
    .from("meal_log")
    .select("calories, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .eq("date", today);

  if (error) {
    console.error("[meals/today-totals] Supabase error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const totals: TodayTotals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const row of data ?? []) {
    totals.calories += row.calories ?? 0;
    totals.protein_g += row.protein_g ?? 0;
    totals.carbs_g += row.carbs_g ?? 0;
    totals.fat_g += row.fat_g ?? 0;
  }

  return Response.json(totals);
}
