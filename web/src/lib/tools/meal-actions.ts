import type { SupabaseClient } from "@supabase/supabase-js";
import { freshUrl } from "../nutrition/grocery-list.ts";
import { gramsPerUnitFor } from "../nutrition/inventory-draw.ts";
import {
  netWeightFromTitle,
  parseListingPanel,
  reviewListingLabel,
} from "../nutrition/listing-label.ts";
import { PREP_STATES, type PrepState } from "../nutrition/packaged-foods.ts";
import { todayString } from "../timezone.ts";

/**
 * Bodies of the `plan_meals` and `pin_grocery_product` MCP tools (meals.ts).
 *
 * They live apart from the AI SDK tool wrappers so they can be contract-tested (#761): this
 * module has no `ai` or `@/` runtime import, so node's bundler-free test runner loads it
 * directly. meals.ts owns the descriptions and input schemas; behaviour is here.
 */

export interface PlanMealInput {
  date: string;
  meal_type: string;
  cook_id?: string;
  recipe_id?: string;
  name?: string;
  portions?: number;
  notes?: string;
  /** The week's budgeted cheat meal. Omitted = false, matching the column default. */
  is_cheat?: boolean;
}

export async function planMeals(supabase: SupabaseClient, userId: string, meals: PlanMealInput[]) {
  if (!userId) return { error: "No user context" };

  for (const m of meals) {
    if (m.cook_id && m.recipe_id) {
      return {
        error: `${m.date} ${m.meal_type}: pass cook_id OR recipe_id, not both — eating leftovers and cooking fresh are different days of work`,
      };
    }
    if (!m.cook_id && !m.recipe_id) {
      return {
        error: `${m.date} ${m.meal_type}: every planned meal must have a recipe_id or a cook_id — no freeform plans. For a meal out, use the "Eating out" recipe.`,
      };
    }
  }

  const rows = meals.map((m) => ({
    user_id: userId,
    date: m.date,
    meal_type: m.meal_type,
    cook_id: m.cook_id ?? null,
    recipe_id: m.recipe_id ?? null,
    name: m.name ?? null,
    portions: m.portions ?? 1,
    notes: m.notes ?? null,
    // Always written, never left to the default: re-planning a slot replaces the row, and a
    // replacement that silently kept a previous `true` would mislabel the new meal.
    is_cheat: m.is_cheat === true,
    status: "planned",
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("meal_plans")
    .upsert(rows, { onConflict: "user_id,date,meal_type" })
    .select("id, date, meal_type");
  if (error) return { error: error.message };
  return { planned: data?.length ?? 0, meals: data ?? [] };
}

/**
 * The listing's Nutrition Facts panel, as the amazon-cart skill's `read-nutrition.js` read it.
 * Only TEXT crosses the tool boundary: the numbers are parsed here, so the no-macro-numbers
 * invariant of meals.ts holds — the model copies a page, it never asserts a calorie.
 */
export interface ListingLabelInput {
  brand: string;
  product: string;
  /** The panel element's `textContent`, verbatim. */
  panel_text: string;
  /** Which weight the panel describes. Defaults to as_sold. */
  prep_state?: PrepState;
  /** Meat, fish, eggs, dairy: a printed 0 mg sodium is then stored as unknown. */
  animal_protein?: boolean;
}

export interface PinGroceryProductInput {
  asin: string;
  title: string;
  fdc_id?: number;
  packaged_food_id?: string;
  pack_quantity?: number;
  pack_unit?: string;
  price_usd?: number;
  fresh?: boolean;
  notes?: string;
  label?: ListingLabelInput;
}

export type LabelOutcome =
  | { status: "created" | "updated"; packaged_food_id: string; flags: string[] }
  | { status: "kept_photographed"; packaged_food_id: string; flags: string[] }
  | { status: "skipped" | "error"; reason: string };

const LISTING_SOURCE = "amazon_listing";
const norm = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toLowerCase();

/**
 * Write a listing's panel into `packaged_foods`, or find the row it belongs to.
 *
 * A row is the same product when its `metadata.asin` matches or its brand + product does (the
 * catalog's unique index). A photographed or hand-entered row is NEVER overwritten by a listing —
 * it is kept and linked, because a label someone read off the box beats one Amazon keyed in. An
 * earlier listing capture is refreshed, since that is the same source re-read — unless it was
 * edited after capture (Inventory → Catalog), which makes it a person's label from then on.
 */
/**
 * True when a catalog row is still exactly what a listing capture wrote. A capture stamps
 * `metadata.captured_at` and `updated_at` together; a later Catalog-tab edit moves `updated_at`
 * on alone, and from then on the row is a person's label that a listing must not overwrite.
 */
function listingOwned(row: {
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}) {
  if (row.metadata?.source !== LISTING_SOURCE) return false;
  const captured = Date.parse(String(row.metadata?.captured_at ?? ""));
  const updated = Date.parse(String(row.updated_at ?? ""));
  if (!Number.isFinite(captured)) return false;
  return !Number.isFinite(updated) || updated - captured <= 60_000;
}

async function captureListingLabel(
  supabase: SupabaseClient,
  userId: string,
  asin: string,
  title: string,
  label: ListingLabelInput,
  packGrams: number | null,
): Promise<LabelOutcome> {
  if (!label.brand?.trim() || !label.product?.trim()) {
    return { status: "skipped", reason: "label needs a brand and a product name" };
  }
  const prep = label.prep_state ?? "as_sold";
  if (!(PREP_STATES as readonly string[]).includes(prep)) {
    return { status: "skipped", reason: `prep_state must be one of: ${PREP_STATES.join(", ")}` };
  }
  const parsed = parseListingPanel(label.panel_text);
  if (!parsed.ok) return { status: "skipped", reason: parsed.reason };

  const netWeightG = packGrams ?? netWeightFromTitle(title);
  const verdict = reviewListingLabel(parsed.panel, {
    netWeightG,
    animalProtein: label.animal_protein === true,
  });
  if (!verdict.ok) return { status: "skipped", reason: verdict.reason };
  const { per100g, servingsPerContainer, flags } = verdict.review;

  const { data: catalog, error: readErr } = await supabase
    .from("packaged_foods")
    .select("id, brand, product, metadata, updated_at")
    .eq("user_id", userId);
  if (readErr) return { status: "error", reason: readErr.message };
  const rows = (catalog ?? []) as {
    id: string;
    brand: string;
    product: string;
    metadata: Record<string, unknown> | null;
    updated_at: string | null;
  }[];
  const existing =
    rows.find((r) => r.metadata?.asin === asin) ??
    rows.find(
      (r) => norm(r.brand) === norm(label.brand) && norm(r.product) === norm(label.product),
    );

  if (existing && !listingOwned(existing)) {
    return { status: "kept_photographed", packaged_food_id: existing.id, flags: [] };
  }

  const today = todayString();
  const capturedAt = new Date().toISOString();
  const p = parsed.panel;
  const write = {
    brand: label.brand.trim(),
    product: label.product.trim(),
    serving_size_g: p.servingSizeG,
    serving_label: p.servingLabel,
    servings_per_container: servingsPerContainer,
    net_weight_g: netWeightG,
    prep_state: prep,
    ...per100g,
    // Required column. For a listing it records when the panel was READ, and
    // metadata.photographed=false says it was not read off a box.
    label_photographed_on: today,
    notes:
      `Read from the Amazon Fresh listing (ASIN ${asin}) on ${today}, not photographed. ` +
      "Check against the physical label on delivery." +
      (flags.length ? ` Flags: ${flags.join("; ")}.` : ""),
    metadata: {
      source: LISTING_SOURCE,
      asin,
      captured_on: today,
      captured_at: capturedAt,
      photographed: false,
      flags,
      per_serving_as_listed: {
        servings_per_container: p.servingsPerContainer,
        serving_size_g: p.servingSizeG,
        calories: p.calories,
        protein_g: p.proteinG,
        carbs_g: p.carbsG,
        fat_g: p.fatG,
        fiber_g: p.fiberG,
        sugar_g: p.sugarG,
        sodium_mg: p.sodiumMg,
      },
      // The audit trail: the exact text the numbers were parsed from.
      panel_text: label.panel_text.replace(/\s+/g, " ").trim().slice(0, 4000),
    },
  };

  const { data, error } = existing
    ? await supabase
        .from("packaged_foods")
        .update({ ...write, updated_at: capturedAt })
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select("id")
        .single()
    : await supabase
        .from("packaged_foods")
        .insert({ ...write, user_id: userId })
        .select("id")
        .single();
  if (error || !data) return { status: "error", reason: error?.message ?? "no row returned" };
  return {
    status: existing ? "updated" : "created",
    packaged_food_id: (data as { id: string }).id,
    flags,
  };
}

export async function pinGroceryProduct(
  supabase: SupabaseClient,
  userId: string,
  input: PinGroceryProductInput,
) {
  if (!userId) return { error: "No user context" };
  const asin = input.asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return { error: `"${input.asin}" is not an ASIN` };
  if (input.fdc_id == null && !input.packaged_food_id && !input.label) {
    return { error: "Pin to a food: pass fdc_id or packaged_food_id" };
  }

  let packGrams: number | null = null;
  if (input.pack_quantity != null) {
    const factor = gramsPerUnitFor(input.pack_unit ?? null);
    if (factor == null) {
      return { error: `"${input.pack_unit}" is not a weight unit (use g, kg, oz or lb)` };
    }
    packGrams = Math.round(input.pack_quantity * factor * 100) / 100;
  }

  // An explicit packaged_food_id is a deliberate choice of catalog row; a listing never overrides it.
  let label: LabelOutcome | null = null;
  if (input.label) {
    label = input.packaged_food_id
      ? { status: "skipped", reason: "packaged_food_id was given; it wins over the listing" }
      : await captureListingLabel(supabase, userId, asin, input.title, input.label, packGrams);
  }
  const labelId = label && "packaged_food_id" in label ? label.packaged_food_id : null;
  const packagedFoodId = input.packaged_food_id ?? labelId;
  if (input.fdc_id == null && !packagedFoodId) {
    return {
      error:
        "Pin to a food: pass fdc_id or packaged_food_id" +
        (label && "reason" in label ? ` (listing label not usable: ${label.reason})` : ""),
    };
  }

  // One pin per food: drop a different product already pinned to either identity first, so
  // re-pinning replaces rather than tripping a unique index. A pin can carry BOTH an fdc_id and
  // a label, and each has its own unique index.
  const identities: [string, unknown][] = [];
  if (input.fdc_id != null) identities.push(["fdc_id", input.fdc_id]);
  if (packagedFoodId) identities.push(["packaged_food_id", packagedFoodId]);
  const replaced: unknown[] = [];
  for (const [col, val] of identities) {
    const { data, error: delErr } = await supabase
      .from("grocery_products")
      .delete()
      .eq("user_id", userId)
      .eq(col, val)
      .neq("asin", asin)
      .select("asin, title");
    if (delErr) return { error: delErr.message };
    replaced.push(...(data ?? []));
  }

  const row = {
    user_id: userId,
    asin,
    title: input.title,
    pack_grams: packGrams,
    price_cents: input.price_usd != null ? Math.round(input.price_usd * 100) : null,
    price_seen_at: input.price_usd != null ? new Date().toISOString() : null,
    fresh: input.fresh ?? true,
    fdc_id: input.fdc_id ?? null,
    // Omitted rather than nulled when nothing names a label, so re-pinning a product (a new
    // price, say) keeps the label link it already has instead of silently dropping it.
    ...(packagedFoodId ? { packaged_food_id: packagedFoodId } : {}),
    notes: input.notes ?? null,
  };
  const { data, error } = await supabase
    .from("grocery_products")
    .upsert(row, { onConflict: "user_id,asin" })
    .select("asin, title, pack_grams, price_cents, fdc_id, packaged_food_id")
    .single();
  if (error) return { error: error.message };
  return {
    pinned: data,
    url: freshUrl(asin),
    replaced,
    ...(label ? { label } : {}),
  };
}
