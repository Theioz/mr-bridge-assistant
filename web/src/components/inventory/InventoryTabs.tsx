"use client";

import { useState } from "react";

import { FridgeView, type FridgeItem } from "./FridgeView";
import { InventoryPanel, type InventoryItem } from "@/components/meals/InventoryPanel";
import { CatalogPanel } from "./CatalogPanel";
import type { PackagedFoodRow } from "@/lib/nutrition/packaged-foods";

/**
 * Two ways to look at the same kitchen.
 *
 * "Kitchen" is visual and READ-ONLY — what have I got, what is in it. "List" keeps every
 * mutation: add, edit, move, remove, and the used-up disclosure. They are not merged because
 * duplicating the edit paths into a second component is how two views drift apart; instead the
 * visual one deliberately owns none of them.
 *
 * Kitchen is the default because it answers the question actually asked while standing in front
 * of the fridge. The toggle is not persisted — a per-viewer preference in localStorage can come
 * back empty in a private window and would need a fallback render anyway, and the default is
 * cheap to re-pick.
 *
 * "Catalog" is not a view of the kitchen but of the LABELS: the packaged products it buys, each
 * with its photographed Nutrition Facts panel (#722). It lives here because that is where the
 * boxes are, and it owns its own edits since no other view touches `packaged_foods`.
 */
export function InventoryTabs({
  items,
  foods,
}: {
  items: (InventoryItem & FridgeItem)[];
  foods: PackagedFoodRow[] | { error: string };
}) {
  const [tab, setTab] = useState<"kitchen" | "list" | "catalog">("kitchen");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Inventory view"
        style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}
      >
        {(
          [
            ["kitchen", "Kitchen"],
            ["list", "List"],
            ["catalog", "Catalog"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              cursor: "pointer",
              fontSize: "var(--t-micro)",
              border: "1px solid var(--rule-soft)",
              background: tab === id ? "var(--rule-soft)" : "transparent",
              color: tab === id ? "var(--color-text)" : "var(--color-text-faint)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "kitchen" && <FridgeView items={items} />}
      {tab === "list" && <InventoryPanel items={items} />}
      {tab === "catalog" &&
        ("error" in foods ? (
          <p role="alert" style={{ fontSize: "var(--t-micro)", color: "var(--color-danger)" }}>
            The catalog failed to load: {foods.error}
          </p>
        ) : (
          <CatalogPanel foods={foods} />
        ))}
    </div>
  );
}
