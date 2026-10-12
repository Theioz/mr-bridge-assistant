import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryLocation } from "./inventory";

/**
 * A delivered Amazon Fresh order, received into the kitchen (#4, Phase 3).
 *
 * Closes Plan → Buy → Cook: every delivered product that has a pin becomes an `inventory_items`
 * row in GRAMS, carrying the pin's `fdc_id` / `packaged_food_id` — so the next "Cooked it" draws
 * it by identity instead of hoping a name matches.
 *
 * Rules, all in planReceipt() so they are tested without a database:
 *   - Matched by ASIN only, through `grocery_products`. An unpinned product is reported, never
 *     guessed (the same no-name-matching rule as the pins themselves).
 *   - Quantity is pack grams × packs. A product sold per item (no pack weight) is stored as a
 *     count, which the draw reports as unweighable rather than inventing a weight.
 *   - Location: what the caller says, else where this food was last kept, else the fridge.
 *   - Idempotent per order: receiving the same order twice adds nothing the second time.
 */

export interface ReceiptItem {
  asin: string;
  packs: number;
  location?: InventoryLocation;
  expires_on?: string | null;
}

export interface PinForReceipt {
  asin: string;
  title: string;
  pack_grams: number | null;
  fdc_id: number | null;
  packaged_food_id: string | null;
}

export interface StockForReceipt {
  fdc_id: number | null;
  packaged_food_id: string | null;
  location: InventoryLocation;
  metadata: { order_id?: string; asin?: string } | null;
}

export interface PlannedRow {
  asin: string;
  name: string;
  quantity: number;
  unit: string;
  location: InventoryLocation;
  expires_on: string | null;
  fdc_id: number | null;
  packaged_food_id: string | null;
  metadata: { source: "amazon_fresh"; asin: string; order_id: string | null; packs: number };
}

export interface ReceiptPlan {
  rows: PlannedRow[];
  skipped: { asin: string; reason: "not-pinned" | "already-received" | "bad-packs" }[];
}

export function planReceipt(
  items: ReceiptItem[],
  pins: PinForReceipt[],
  stock: StockForReceipt[],
  orderId: string | null,
): ReceiptPlan {
  const rows: PlannedRow[] = [];
  const skipped: ReceiptPlan["skipped"] = [];

  for (const item of items) {
    if (!(Number.isInteger(item.packs) && item.packs > 0)) {
      skipped.push({ asin: item.asin, reason: "bad-packs" });
      continue;
    }
    const pin = pins.find((p) => p.asin === item.asin);
    if (!pin) {
      skipped.push({ asin: item.asin, reason: "not-pinned" });
      continue;
    }
    if (
      orderId &&
      stock.some((s) => s.metadata?.order_id === orderId && s.metadata?.asin === item.asin)
    ) {
      skipped.push({ asin: item.asin, reason: "already-received" });
      continue;
    }

    const sameFood = stock.find(
      (s) =>
        (pin.packaged_food_id && s.packaged_food_id === pin.packaged_food_id) ||
        (pin.fdc_id != null && s.fdc_id === pin.fdc_id),
    );
    const grams = pin.pack_grams != null ? Number(pin.pack_grams) * item.packs : null;

    rows.push({
      asin: pin.asin,
      name: pin.title,
      quantity: grams != null ? Math.round(grams * 10) / 10 : item.packs,
      unit: grams != null ? "g" : "each",
      location: item.location ?? sameFood?.location ?? "fridge",
      expires_on: item.expires_on ?? null,
      fdc_id: pin.fdc_id,
      packaged_food_id: pin.packaged_food_id,
      metadata: { source: "amazon_fresh", asin: pin.asin, order_id: orderId, packs: item.packs },
    });
  }
  return { rows, skipped };
}

export async function receiveGroceryOrder(
  db: SupabaseClient,
  userId: string,
  input: { items: ReceiptItem[]; orderId?: string | null },
): Promise<ReceiptPlan & { created: number }> {
  const asins = [...new Set(input.items.map((i) => i.asin.trim().toUpperCase()))];
  const items = input.items.map((i) => ({ ...i, asin: i.asin.trim().toUpperCase() }));

  const [{ data: pins, error: pinErr }, { data: stock, error: stockErr }] = await Promise.all([
    db
      .from("grocery_products")
      .select("asin, title, pack_grams, fdc_id, packaged_food_id")
      .eq("user_id", userId)
      .in("asin", asins),
    db
      .from("inventory_items")
      .select("fdc_id, packaged_food_id, location, metadata, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
  ]);
  if (pinErr) throw new Error(`grocery_products load failed: ${pinErr.message}`);
  if (stockErr) throw new Error(`inventory load failed: ${stockErr.message}`);

  const plan = planReceipt(
    items,
    (pins ?? []) as PinForReceipt[],
    (stock ?? []) as StockForReceipt[],
    input.orderId ?? null,
  );
  if (plan.rows.length === 0) return { ...plan, created: 0 };

  const { error } = await db.from("inventory_items").insert(
    plan.rows.map((r) => ({
      user_id: userId,
      name: r.name,
      quantity: r.quantity,
      unit: r.unit,
      location: r.location,
      expires_on: r.expires_on,
      fdc_id: r.fdc_id,
      packaged_food_id: r.packaged_food_id,
      metadata: r.metadata,
    })),
  );
  if (error) throw new Error(`inventory insert failed: ${error.message}`);
  return { ...plan, created: plan.rows.length };
}
