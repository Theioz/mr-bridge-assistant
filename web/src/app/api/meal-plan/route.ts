import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { todayString, addDays } from "@/lib/timezone";

/**
 * Planned meals for a window (default: just today, which is what the phone needs).
 *
 * A plan carries no macros of its own — they are read through the cook or recipe it points
 * at, both of which are USDA-derived.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? 1);
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 31) : 1;

  const start = req.nextUrl.searchParams.get("start") ?? todayString();
  const end = addDays(start, days - 1);

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("meal_plans")
      .select(
        "id, date, meal_type, portions, status, name, notes, " +
          "recipes(id, name), " +
          "cooks(id, name, portions, portions_remaining)",
      )
      .eq("user_id", user.id)
      .gte("date", start)
      .lte("date", end)
      .order("date");
    if (error) throw new Error(error.message);

    return NextResponse.json({ meals: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load meal plan";
    console.error("[GET /api/meal-plan]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
