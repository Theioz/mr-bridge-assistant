import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecipeIngredient } from "@/lib/types";
import {
  STOCK_SELECT,
  declaredGramsPerUnit,
  gramsForIngredient,
  gramsPerUnitFor,
  normalizeFoodName,
  sameFood,
  type StockRow,
} from "./inventory-draw.ts";

/**
 * The grocery list (#4, Phase 1): what the planned recipes need, minus what the kitchen holds,
 * rounded up to whole packs of a PINNED product.
 *
 * Two kinds of matching, deliberately different:
 *   - kitchen stock uses the inventory draw's rules (label, then USDA id, then name), so the list
 *     and "Cooked it" agree on what is in the fridge;
 *   - products are found by IDENTITY ONLY (label, then USDA id). There is no name fallback for
 *     buying: a name match is how "House Napa Cabbage" kimchi gets bought as fresh napa. A line
 *     with no pinned product is reported as `needsPin`, never guessed.
 *
 * Grams are BATCH grams scaled by planned portions / typical_portions, the same scale the draw
 * uses, so the list buys what cooking the plan will later draw.
 */

export interface GroceryProduct {
  id: string;
  asin: string;
  title: string;
  pack_grams: number | null;
  price_cents: number | null;
  fresh: boolean;
  fdc_id: number | null;
  packaged_food_id: string | null;
}

export interface PlannedRecipe {
  name: string;
  /** Planned portions over the window: one meal_plans row = one portion. */
  portions: number;
  typicalPortions: number;
  lines: RecipeIngredient[];
}

export type GroceryStatus =
  /** Something to buy. `product` says what; null + `needsPin` means a product must be picked. */
  | "buy"
  /** The kitchen already holds enough. */
  | "covered"
  /** Matched an untracked staple (salt, oil): assumed on hand. */
  | "staple"
  /** Matched stock whose amount cannot be weighed (`2 box`, no pack weight): look before buying. */
  | "check-stock"
  /** The recipe line has no weight, so there is nothing to compute. */
  | "no-weight"
  | "optional";

export interface GroceryLine {
  ingredient: string;
  recipes: string[];
  fdcId: number | null;
  packagedFoodId: string | null;
  gramsNeeded: number | null;
  gramsOnHand: number;
  gramsToBuy: number;
  status: GroceryStatus;
  product: {
    asin: string;
    title: string;
    packGrams: number | null;
    packs: number;
    estCents: number | null;
    url: string;
  } | null;
  /** A purchase is needed but this food has no pinned product yet. */
  needsPin: boolean;
  detail: string;
}

export interface GroceryList {
  lines: GroceryLine[];
  toBuy: number;
  needsPin: number;
  /** Sum over pinned products with a known price. Partial when any line lacks one. */
  estCents: number;
  estIsPartial: boolean;
  /**
   * Planned recipes with no structured ingredient list (legacy text-only rows). They contribute
   * NOTHING to the list, so a non-empty value means the list is incomplete — shop for these by
   * hand or structure them first. Never empty-by-accident: this is what keeps a silent under-buy
   * from reading as a complete list.
   */
  unlisted: string[];
}

/**
 * A pack may fall this far short of the need before another whole pack is bought. Recipe grams
 * are converted from oz labels and rounded (454 g vs a 453.59 g pound), so an exact ceil buys a
 * second pound of beef for 0.4 g. 3% is well inside how loosely a cook measures.
 */
const PACK_SLACK = 0.03;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Fresh product page — the pinned route Phase 2 adds to cart from. */
export function freshUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}?fpw=alm`;
}

interface Need {
  key: string;
  ingredient: string;
  recipes: Set<string>;
  fdcId: number | null;
  packagedFoodId: string | null;
  nameTokens: Set<string>;
  grams: number;
  hasWeight: boolean;
  optional: boolean;
}

function identityKey(line: RecipeIngredient): string {
  if (line.packaged_food_id) return `pf:${line.packaged_food_id}`;
  if (line.fdc_id) return `fdc:${line.fdc_id}`;
  return `name:${[...normalizeFoodName(line.item)].sort().join(" ")}`;
}

function stockFor(need: Need, stock: StockRow[]): StockRow[] {
  if (need.packagedFoodId) {
    const hit = stock.filter((s) => s.packaged_food_id === need.packagedFoodId);
    if (hit.length) return hit;
  }
  if (need.fdcId) {
    const hit = stock.filter((s) => s.fdc_id === need.fdcId);
    if (hit.length) return hit;
  }
  return stock.filter((s) => sameFood(need.nameTokens, normalizeFoodName(s.name)));
}

function productFor(need: Need, products: GroceryProduct[]): GroceryProduct | null {
  if (need.packagedFoodId) {
    const hit = products.find((p) => p.packaged_food_id === need.packagedFoodId);
    if (hit) return hit;
  }
  if (need.fdcId) return products.find((p) => p.fdc_id === need.fdcId) ?? null;
  return null;
}

/** Pure: no I/O. Everything the list depends on is passed in, which is what makes it testable. */
export function computeGroceryList(
  recipes: PlannedRecipe[],
  stock: StockRow[],
  products: GroceryProduct[],
): GroceryList {
  // 1. Aggregate needs across recipes by identity, so two recipes wanting cod buy one cod line.
  const needs = new Map<string, Need>();
  const unlisted: string[] = [];
  for (const r of recipes) {
    if (r.lines.length === 0) {
      unlisted.push(r.name);
      continue;
    }
    const scale = r.portions / (r.typicalPortions || 1);
    for (const line of r.lines) {
      const key = identityKey(line);
      const grams = gramsForIngredient(line);
      const n = needs.get(key) ?? {
        key,
        ingredient: line.item,
        recipes: new Set<string>(),
        fdcId: line.fdc_id ?? null,
        packagedFoodId: line.packaged_food_id ?? null,
        nameTokens: normalizeFoodName(line.item),
        grams: 0,
        hasWeight: false,
        // Optional only if every recipe that wants it calls it optional.
        optional: true,
      };
      n.recipes.add(r.name);
      n.optional = n.optional && line.optional === true;
      if (grams != null) {
        n.grams += grams * scale;
        n.hasWeight = true;
      }
      needs.set(key, n);
    }
  }

  // 2. Subtract the kitchen and price the remainder in whole packs.
  const lines: GroceryLine[] = [];
  for (const need of needs.values()) {
    const base = {
      ingredient: need.ingredient,
      recipes: [...need.recipes].sort(),
      fdcId: need.fdcId,
      packagedFoodId: need.packagedFoodId,
      gramsNeeded: need.hasWeight ? round1(need.grams) : null,
      gramsOnHand: 0,
      gramsToBuy: 0,
      product: null,
      needsPin: false,
    };

    if (need.optional) {
      lines.push({ ...base, status: "optional", detail: "optional in every recipe using it" });
      continue;
    }

    const matched = stockFor(need, stock);
    const staple = matched.find((s) => s.quantity == null);
    const tracked = matched.filter((s) => s.quantity != null);
    let onHand = 0;
    let unweighable = false;
    for (const s of tracked) {
      const g = gramsPerUnitFor(s.unit, declaredGramsPerUnit(s));
      if (g == null) unweighable = true;
      else onHand += Number(s.quantity) * g;
    }

    if (staple && tracked.length === 0) {
      lines.push({ ...base, status: "staple", detail: `${staple.name} is a staple` });
      continue;
    }
    if (!need.hasWeight) {
      lines.push({
        ...base,
        status: "no-weight",
        detail: matched.length
          ? `no weight on the recipe line; kitchen has ${matched[0].name}`
          : "no weight on the recipe line and nothing in the kitchen matches",
      });
      continue;
    }

    const toBuy = Math.max(0, need.grams - onHand);
    base.gramsOnHand = round1(onHand);
    base.gramsToBuy = round1(toBuy);

    if (toBuy <= 0) {
      lines.push({ ...base, status: "covered", detail: "kitchen holds enough" });
      continue;
    }
    if (unweighable) {
      lines.push({
        ...base,
        status: "check-stock",
        detail: "the kitchen has some, in a unit with no weight — look before buying",
      });
      continue;
    }

    const product = productFor(need, products);
    if (!product) {
      lines.push({
        ...base,
        status: "buy",
        needsPin: true,
        detail:
          need.fdcId || need.packagedFoodId
            ? "no product pinned for this food yet"
            : "recipe line has no USDA id or label, so it cannot be pinned — buy by hand",
      });
      continue;
    }

    const packGrams = product.pack_grams != null ? Number(product.pack_grams) : null;
    const packs = packGrams ? Math.max(1, Math.ceil(toBuy / packGrams - PACK_SLACK)) : 1;
    lines.push({
      ...base,
      status: "buy",
      product: {
        asin: product.asin,
        title: product.title,
        packGrams,
        packs,
        estCents: product.price_cents != null ? product.price_cents * packs : null,
        url: freshUrl(product.asin),
      },
      detail: packGrams
        ? `${packs} x ${packGrams} g covers ${round1(toBuy)} g`
        : "pack weight unknown — buying 1",
    });
  }

  const order: Record<GroceryStatus, number> = {
    buy: 0,
    "check-stock": 1,
    "no-weight": 2,
    covered: 3,
    staple: 4,
    optional: 5,
  };
  lines.sort(
    (a, b) => order[a.status] - order[b.status] || a.ingredient.localeCompare(b.ingredient),
  );

  const buying = lines.filter((l) => l.status === "buy");
  return {
    lines,
    toBuy: buying.length,
    needsPin: buying.filter((l) => l.needsPin).length,
    estCents: buying.reduce((s, l) => s + (l.product?.estCents ?? 0), 0),
    estIsPartial: buying.some((l) => l.product?.estCents == null),
    unlisted: unlisted.sort(),
  };
}

/** Load the window's planned recipes, the kitchen and the pins, then compute. */
export async function getGroceryList(
  db: SupabaseClient,
  userId: string,
  window: { start: string; end: string },
): Promise<GroceryList & { window: { start: string; end: string }; recipeCount: number }> {
  const { data: plans, error } = await db
    .from("meal_plans")
    .select("recipe_id")
    .eq("user_id", userId)
    .eq("status", "planned")
    .not("recipe_id", "is", null)
    .gte("date", window.start)
    .lte("date", window.end);
  if (error) throw new Error(`meal_plans load failed: ${error.message}`);

  const portions = new Map<string, number>();
  for (const p of plans ?? []) {
    const id = p.recipe_id as string;
    portions.set(id, (portions.get(id) ?? 0) + 1);
  }

  const ids = [...portions.keys()];
  const [
    { data: recipeRows, error: rErr },
    { data: stockRows, error: sErr },
    { data: productRows, error: pErr },
  ] = await Promise.all([
    ids.length
      ? db
          .from("recipes")
          .select("id, name, ingredients_json, typical_portions")
          .eq("user_id", userId)
          .in("id", ids)
      : Promise.resolve({ data: [], error: null }),
    db.from("inventory_items").select(STOCK_SELECT).eq("user_id", userId),
    db
      .from("grocery_products")
      .select("id, asin, title, pack_grams, price_cents, fresh, fdc_id, packaged_food_id")
      .eq("user_id", userId),
  ]);
  if (rErr) throw new Error(`recipes load failed: ${rErr.message}`);
  if (sErr) throw new Error(`inventory load failed: ${sErr.message}`);
  if (pErr) throw new Error(`grocery_products load failed: ${pErr.message}`);

  // "Eating out" is the deliberate macro-less placeholder for a meal out: nothing to buy, and
  // flagging it as unlisted every week would teach the reader to ignore that warning.
  const recipes: PlannedRecipe[] = (recipeRows ?? [])
    .filter((r) => r.name !== "Eating out")
    .map((r) => ({
      name: r.name as string,
      portions: portions.get(r.id as string) ?? 0,
      typicalPortions: (r.typical_portions as number | null) ?? 1,
      lines: (r.ingredients_json as RecipeIngredient[] | null) ?? [],
    }));

  return {
    window,
    recipeCount: recipes.length,
    ...computeGroceryList(
      recipes,
      (stockRows ?? []) as unknown as StockRow[],
      (productRows ?? []) as GroceryProduct[],
    ),
  };
}
