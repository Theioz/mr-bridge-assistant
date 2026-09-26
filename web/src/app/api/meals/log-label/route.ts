import { createClient } from "@/lib/supabase/server";
import { findPackagedFoodsByIds, priceLabelServing } from "@/lib/nutrition/packaged-foods";
import { todayString } from "@/lib/timezone";

/**
 * Log an amount of a catalog product (#722).
 *
 * The client sends WHAT and HOW MUCH; the server prices it off the stored label. It never accepts
 * macros from the client, for the same reason the USDA path takes numbers only from data: the
 * total in the log should be reproducible from the row and the label, not from whatever a form
 * happened to hold.
 */
interface Body {
  packaged_food_id?: unknown;
  qty?: unknown;
  unit?: unknown;
  meal_type?: unknown;
  date?: unknown;
  confirmed_state?: unknown;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.meal_type !== "string" || !MEAL_TYPES.includes(body.meal_type)) {
    return Response.json(
      { error: "meal_type must be breakfast, lunch, dinner, or snack" },
      { status: 400 },
    );
  }
  if (typeof body.packaged_food_id !== "string" || !body.packaged_food_id) {
    return Response.json({ error: "packaged_food_id is required" }, { status: 400 });
  }
  const qty = typeof body.qty === "number" ? body.qty : Number(body.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return Response.json({ error: "qty must be a number > 0" }, { status: 400 });
  }
  const unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : "g";
  const date =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : todayString();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let row;
  try {
    row = (await findPackagedFoodsByIds(supabase, user.id, [body.packaged_food_id])).get(
      body.packaged_food_id,
    );
  } catch (err) {
    console.error("[meals/log-label] catalog read failed:", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  if (!row) return Response.json({ error: "product not found in the catalog" }, { status: 404 });

  const priced = priceLabelServing(
    row,
    qty,
    unit,
    typeof body.confirmed_state === "string" ? body.confirmed_state : null,
  );
  if ("refused" in priced) return Response.json({ error: priced.refused }, { status: 400 });

  const { grams, basis, exact, ...macros } = priced;
  const { data, error } = await supabase
    .from("meal_log")
    .insert({
      user_id: user.id,
      meal_type: body.meal_type,
      date,
      notes: `${row.brand} ${row.product} — ${qty} ${unit} (${grams} g)`,
      ...macros,
      source: "label",
      // The working, so the row can be re-derived and audited: which label, how many grams, how.
      metadata: {
        packaged_food_id: row.id,
        qty,
        unit,
        grams,
        basis,
        exact_portion: exact,
        prep_state: row.prep_state,
        label_photographed_on: row.label_photographed_on,
      },
    })
    .select()
    .single();

  if (error) {
    console.error("[meals/log-label] insert failed:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data, { status: 201 });
}
