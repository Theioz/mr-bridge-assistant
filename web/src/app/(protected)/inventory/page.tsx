export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { InventoryTabs } from "@/components/inventory/InventoryTabs";
import type { InventoryItem } from "@/components/meals/InventoryPanel";
import type { FridgeItem } from "@/components/inventory/FridgeView";
import { listPackagedFoods, type PackagedFoodRow } from "@/lib/nutrition/packaged-foods";

export const metadata: Metadata = {
  title: "Inventory",
  description: "What's in the fridge, freezer, and pantry.",
};

export default async function InventoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id;

  // Fetched server-side so the panel has no loading flash; router.refresh() re-runs this
  // after every add/edit/move/remove. Oldest and soonest-to-expire first, so what to cook
  // next is always at the top.
  const { data: inventoryData } = userId
    ? await supabase
        .from("inventory_items")
        .select(
          "id, name, quantity, unit, location, category, added_date, expires_on, notes, image_key, macros_per_100g, macros_source",
        )
        .eq("user_id", userId)
        .order("location", { ascending: true })
        .order("expires_on", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true })
    : { data: [] };

  // The label catalog, for the Catalog tab. Same session client, so RLS scopes it to this user.
  // A failure is carried to the tab and SHOWN there — not thrown, which would take the whole
  // kitchen down with it, and not swallowed into an empty list, which would read as "no products".
  let foods: PackagedFoodRow[] | { error: string } = [];
  if (userId) {
    try {
      foods = await listPackagedFoods(supabase, userId);
    } catch (e) {
      console.error("[inventory page] catalog load failed", e);
      foods = { error: (e as Error).message };
    }
  }

  return (
    <div className="max-w-2xl">
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h1
          className="font-heading font-semibold"
          style={{ fontSize: "var(--t-h1)", color: "var(--color-text)" }}
        >
          Inventory
        </h1>
        <p
          className="mt-1"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
        >
          Open a door to see what is in it. Soonest-to-expire first; switch to List to add, edit or
          move anything.
        </p>
      </div>

      <InventoryTabs
        items={(inventoryData ?? []) as unknown as (InventoryItem & FridgeItem)[]}
        foods={foods}
      />
    </div>
  );
}
