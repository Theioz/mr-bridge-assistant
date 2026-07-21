export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { InventoryPanel, type InventoryItem } from "@/components/meals/InventoryPanel";

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
        .select("id, name, quantity, unit, location, category, added_date, expires_on, notes")
        .eq("user_id", userId)
        .order("location", { ascending: true })
        .order("expires_on", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true })
    : { data: [] };

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
          Fridge, freezer &amp; pantry — soonest-to-expire first. Move to the freezer in one tap so
          nothing turns.
        </p>
      </div>

      <InventoryPanel items={(inventoryData ?? []) as unknown as InventoryItem[]} />
    </div>
  );
}
