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
          "recipes(id, name, calories, macros_computed_at), " +
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

const STATUSES = ["planned", "eaten", "skipped"] as const;
type PlanStatus = (typeof STATUSES)[number];

/**
 * Record what actually happened to a planned meal.
 *
 * `POST /api/meals/eat` requires a `cook_id` — it exists to log macros that are already known.
 * But most planned meals point at no cook: they're a recipe not yet made, or freeform text.
 * Those had no way to be marked anything at all, so the plan could only ever describe intent,
 * never outcome, and every unlogged day looked identical to a day that never happened.
 *
 * This carries no macros and logs no meal. It records a decision. A skipped meal is data —
 * it's how the plan learns it was wrong, and a plan nobody can contradict is a plan nobody
 * corrects. For a cook-backed meal prefer /api/meals/eat, which also decrements the fridge.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!STATUSES.includes(body.status as PlanStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    // Service client bypasses RLS, so user_id is the ownership check — not decoration.
    const db = createServiceClient();
    const { data, error } = await db
      .from("meal_plans")
      .update({ status: body.status })
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select("id, status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ meal: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update meal plan";
    console.error("[PATCH /api/meal-plan]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
