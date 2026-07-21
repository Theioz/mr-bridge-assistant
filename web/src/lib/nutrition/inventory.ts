import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inventory: the raw ingredients on hand — fridge, freezer, pantry.
 *
 * This is the counterpart to `cooks` (prepared leftovers). `cooks` answers "what can I eat
 * without cooking?"; this answers "what do I already have to cook WITH?". The weekly planner
 * reads both first, so it spends the kitchen down — oldest and soonest-to-expire first —
 * before it ever proposes a grocery run.
 *
 * Unlike cooks/recipes, an inventory item carries NO macros. It is a location, a rough
 * quantity and a fresh-window — a shopping and perishability aid, not a nutrition record.
 * Nothing here computes or stores a calorie.
 */

export const INVENTORY_LOCATIONS = ["fridge", "freezer", "pantry", "counter"] as const;
export type InventoryLocation = (typeof INVENTORY_LOCATIONS)[number];

export interface InventoryItemRow {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  location: InventoryLocation;
  category: string | null;
  added_date: string;
  expires_on: string | null;
  notes: string | null;
}

const SELECT = "id, name, quantity, unit, location, category, added_date, expires_on, notes";

/**
 * Everything on hand, grouped-friendly: by location, then soonest-to-expire (staples with no
 * expiry sort last within a location), then name. This ordering is the whole point — the
 * first perishable in the list is the first thing to cook.
 */
export async function listInventory(
  db: SupabaseClient,
  userId: string,
): Promise<InventoryItemRow[]> {
  const { data, error } = await db
    .from("inventory_items")
    .select(SELECT)
    .eq("user_id", userId)
    .order("location", { ascending: true })
    .order("expires_on", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw new Error(`inventory query failed: ${error.message}`);
  return (data ?? []) as InventoryItemRow[];
}

function normalizeLocation(loc: unknown): InventoryLocation {
  if (typeof loc === "string" && (INVENTORY_LOCATIONS as readonly string[]).includes(loc)) {
    return loc as InventoryLocation;
  }
  throw new Error(`location must be one of: ${INVENTORY_LOCATIONS.join(", ")}`);
}

function normalizeQuantity(q: unknown): number | null {
  if (q == null || q === "") return null;
  const n = Number(q);
  if (!Number.isFinite(n) || n < 0) throw new Error("quantity must be a number >= 0");
  return n;
}

export interface InventoryInput {
  name?: string;
  quantity?: number | string | null;
  unit?: string | null;
  location?: string;
  category?: string | null;
  added_date?: string | null;
  expires_on?: string | null;
  notes?: string | null;
}

/** Add something to the kitchen. Name is the only hard requirement. */
export async function createItem(
  db: SupabaseClient,
  userId: string,
  input: InventoryInput,
): Promise<InventoryItemRow> {
  const name = input.name?.trim();
  if (!name) throw new Error("An inventory item needs a name");

  const row = {
    user_id: userId,
    name,
    quantity: normalizeQuantity(input.quantity),
    unit: input.unit?.trim() || null,
    location: input.location ? normalizeLocation(input.location) : "fridge",
    category: input.category?.trim() || null,
    added_date: input.added_date || undefined, // fall back to the column default (today)
    expires_on: input.expires_on || null,
    notes: input.notes?.trim() || null,
  };

  const { data, error } = await db.from("inventory_items").insert(row).select(SELECT).single();
  if (error) throw new Error(`inventory insert failed: ${error.message}`);
  return data as InventoryItemRow;
}

/**
 * Edit an item in place — change the quantity as it's used down, move fridge->freezer when
 * it's frozen, fix an expiry, correct a note. Only the fields supplied are touched.
 */
export async function updateItem(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: InventoryInput,
): Promise<InventoryItemRow> {
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("name" in patch) {
    const n = patch.name?.trim();
    if (!n) throw new Error("name cannot be blank");
    set.name = n;
  }
  if ("quantity" in patch) set.quantity = normalizeQuantity(patch.quantity);
  if ("unit" in patch) set.unit = patch.unit?.trim() || null;
  if ("location" in patch && patch.location != null)
    set.location = normalizeLocation(patch.location);
  if ("category" in patch) set.category = patch.category?.trim() || null;
  if ("expires_on" in patch) set.expires_on = patch.expires_on || null;
  if ("notes" in patch) set.notes = patch.notes?.trim() || null;

  const { data, error } = await db
    .from("inventory_items")
    .update(set)
    .eq("id", id)
    .eq("user_id", userId) // service client bypasses RLS — this IS the ownership check
    .select(SELECT)
    .maybeSingle();
  if (error) throw new Error(`inventory update failed: ${error.message}`);
  if (!data) throw new Error("Item not found");
  return data as InventoryItemRow;
}

/** Used up or thrown out — remove it. */
export async function deleteItem(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from("inventory_items").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`inventory delete failed: ${error.message}`);
}
