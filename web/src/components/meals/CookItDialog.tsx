"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { DrawPlan, PlannedDraw, SkippedLine } from "@/lib/nutrition/inventory-draw";

/**
 * "Cooked it" — record a batch, and move the raw ingredients out of the kitchen.
 *
 * Cooking is a TRANSFER: mass leaves `inventory_items` and arrives in `cooks` as portions.
 * Until this existed the app only ever recorded the arrival, so the fridge kept reporting raw
 * food that had already been cooked.
 *
 * WHY IT CONFIRMS RATHER THAN JUST DOING IT. Inventory has no second source of truth. If a
 * draw lands on the wrong row nothing else in the app will ever contradict it — the count is
 * simply wrong from then on, and looks exactly like a count that is right. So the amounts are
 * shown BEFORE they are applied, together with everything being skipped and why, which turns a
 * bad match from a silent corruption into something visible in the moment.
 *
 * The skip list is not an error list and must not read like one. Most lines will be skipped
 * most of the time — staples have no tracked amount, and a recipe wanting 250 g of black beans
 * against a row holding "4 can" has no honest conversion. Showing them is how the panel stays
 * trustworthy: silence would be indistinguishable from a draw that quietly did nothing.
 */

interface CookItDialogProps {
  recipeId: string;
  recipeName: string;
  /** The recipe's `typical_portions` — what a full batch of it makes. */
  defaultPortions: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCooked: () => void;
}

const SKIP_LABEL: Record<SkippedLine["reason"], string> = {
  staple: "staple",
  "no-weight-in-recipe": "no weight",
  "no-match": "not in kitchen",
  "unconvertible-unit": "no conversion",
  "out-of-stock": "none left",
};

function DrawRow({ draw }: { draw: PlannedDraw }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "var(--space-2)",
        padding: "var(--space-2) 0",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--color-text)" }}>{draw.itemName}</div>
        <div style={{ fontSize: "var(--t-caption)", color: "var(--color-text-faint)" }}>
          {draw.location}
          {/* A name match is the weaker of the two strategies, so it says so. An exact
              fdc_id match needs no annotation — it is the expected case. */}
          {draw.matchMethod === "name" ? " · matched by name" : ""}
          {draw.shortfallGrams > 0 ? ` · ${draw.shortfallGrams} g short` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <div style={{ color: "var(--color-text)" }}>
          −{draw.quantityApplied} {draw.unit}
        </div>
        <div style={{ fontSize: "var(--t-caption)", color: "var(--color-text-faint)" }}>
          {draw.quantityBefore} → {draw.quantityAfter}
        </div>
      </div>
    </div>
  );
}

export default function CookItDialog({
  recipeId,
  recipeName,
  defaultPortions,
  open,
  onOpenChange,
  onCooked,
}: CookItDialogProps) {
  const [portions, setPortions] = useState(defaultPortions);
  const [plan, setPlan] = useState<DrawPlan | null>(null);
  // Starts true: the sheet always opens straight into a fetch, and initializing the state
  // that way keeps the effect below free of a synchronous setState.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-plan whenever the portion count changes: the draw is the ingredient list scaled by
  // portions/typical_portions, so 2 portions of a 4-portion recipe takes half as much.
  //
  // `cancelled` matters because portions is a number input — typing "12" fires at "1" and
  // again at "12", and the slower first response must not overwrite the second's plan with a
  // draw for a batch size the user has already moved past.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cooks/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipe_id: recipeId, portions }),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Couldn't work out what this would use");
          setPlan(null);
        } else {
          setError(null);
          setPlan(body.plan as DrawPlan);
        }
      } catch {
        if (cancelled) return;
        setError("Couldn't work out what this would use");
        setPlan(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId, portions]);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/cooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: recipeId, portions, draw_inventory: true }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't record that cook");
        return;
      }
      onOpenChange(false);
      onCooked();
    } catch {
      setError("Couldn't record that cook");
    } finally {
      setSaving(false);
    }
  }

  const drawCount = plan?.draws.length ?? 0;
  const skipCount = plan?.skips.length ?? 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ position: "fixed", inset: 0, background: "var(--overlay-scrim)", zIndex: 100 }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 101,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--r-2)",
            width: "min(460px, 92vw)",
            maxHeight: "86vh",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
          aria-describedby={undefined}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              padding: "var(--space-4)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <Dialog.Title style={{ fontSize: "var(--t-h3)", color: "var(--color-text)" }}>
                Cooked it
              </Dialog.Title>
              <div style={{ fontSize: "var(--t-caption)", color: "var(--color-text-faint)" }}>
                {recipeName}
              </div>
            </div>
            <Dialog.Close aria-label="Close" style={{ background: "none", border: "none" }}>
              <X size={18} color="var(--color-text-faint)" />
            </Dialog.Close>
          </div>

          <div style={{ padding: "var(--space-4)", overflowY: "auto" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                marginBottom: "var(--space-4)",
                color: "var(--color-text)",
              }}
            >
              <span>Portions it made</span>
              <input
                type="number"
                min={1}
                step={1}
                value={portions}
                onChange={(e) => {
                  setPortions(Math.max(1, Number(e.target.value) || 1));
                  setLoading(true);
                }}
                style={{
                  width: 72,
                  padding: "var(--space-2)",
                  // 16px minimum, or iOS zooms the whole page on focus (#688).
                  fontSize: "16px",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--r-1)",
                }}
              />
              {plan && plan.typicalPortions !== portions ? (
                <span style={{ fontSize: "var(--t-caption)", color: "var(--color-text-faint)" }}>
                  recipe makes {plan.typicalPortions}
                </span>
              ) : null}
            </label>

            {loading ? (
              <div style={{ color: "var(--color-text-faint)" }}>Checking the kitchen…</div>
            ) : null}

            {!loading && plan && drawCount > 0 ? (
              <>
                <div
                  style={{
                    fontSize: "var(--t-caption)",
                    color: "var(--color-text-faint)",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  Will draw from your kitchen
                </div>
                {plan.draws.map((d) => (
                  <DrawRow key={`${d.itemId}-${d.ingredient}`} draw={d} />
                ))}
              </>
            ) : null}

            {!loading && plan && drawCount === 0 ? (
              <div style={{ color: "var(--color-text-faint)" }}>
                Nothing in your kitchen matches this recipe by weight — the cook will still be
                recorded, it just won&apos;t draw anything down.
              </div>
            ) : null}

            {!loading && plan && skipCount > 0 ? (
              <div style={{ marginTop: "var(--space-4)" }}>
                <div
                  style={{
                    fontSize: "var(--t-caption)",
                    color: "var(--color-text-faint)",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  Skipping ({skipCount}) — nothing here is guessed at
                </div>
                {plan.skips.map((s) => (
                  <div
                    key={`${s.ingredient}-${s.reason}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "var(--space-2)",
                      padding: "var(--space-1) 0",
                      fontSize: "var(--t-caption)",
                      color: "var(--color-text-faint)",
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      {s.ingredient}
                      {s.grams != null ? ` · ${s.grams} g` : ""}
                    </span>
                    <span style={{ whiteSpace: "nowrap" }} title={s.detail}>
                      {SKIP_LABEL[s.reason]}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {error ? (
              <div style={{ marginTop: "var(--space-3)", color: "var(--color-danger)" }}>
                {error}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--space-2)",
              padding: "var(--space-4)",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <Dialog.Close
              style={{
                padding: "var(--space-2) var(--space-4)",
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--r-1)",
                color: "var(--color-text)",
              }}
            >
              Cancel
            </Dialog.Close>
            <button
              onClick={confirm}
              disabled={saving || loading}
              style={{
                padding: "var(--space-2) var(--space-4)",
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--r-1)",
                color: "var(--color-text-on-cta)",
              }}
            >
              {saving ? "Recording…" : "Confirm"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
