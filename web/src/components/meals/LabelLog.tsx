"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  containerWeightG,
  parseServingLabel,
  priceLabelServing,
  type PackagedFoodRow,
} from "@/lib/nutrition/packaged-foods";

/**
 * Log an amount of a catalog product, priced off its photographed label (#722).
 *
 * The preview is computed with `priceLabelServing`, the same function the server runs, so what
 * is shown is what gets written. The server still re-prices from the stored label — the client
 * sends only the product, the amount and the unit, never macros.
 *
 * The unit list offers only what the label can actually price: weight, servings, the label's own
 * household measure ("1 tsp"), and a whole container when its weight is known. A label that is
 * not "as sold" (dry pasta) asks for confirmation that the amount is in that state, since a
 * plated weight priced off a dry panel is ~3x high.
 */
export function LabelLog({ mealType }: { mealType: string }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<PackagedFoodRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [id, setId] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/packaged-foods")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "catalog failed to load");
        if (live) setCatalog(json.foods as PackagedFoodRow[]);
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const row = catalog?.find((c) => c.id === id) ?? null;

  const units = useMemo(() => {
    if (!row) return ["g"];
    const out = ["g", "oz", "serving"];
    const printed = parseServingLabel(row.serving_label);
    if (printed && !out.includes(printed.unit)) out.push(printed.unit);
    if (containerWeightG(row)) out.push("container");
    return out;
  }, [row]);

  const amount = Number(qty);
  const preview =
    row && qty.trim() !== "" && Number.isFinite(amount) && amount > 0
      ? priceLabelServing(row, amount, unit, confirmed ? row.prep_state : null)
      : null;

  function pick(next: string) {
    setId(next);
    setUnit("g");
    setConfirmed(false);
    setError(null);
    setLogged(null);
  }

  async function log() {
    if (!row || !preview || "refused" in preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/meals/log-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packaged_food_id: row.id,
          qty: amount,
          unit,
          meal_type: mealType,
          confirmed_state: confirmed ? row.prep_state : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to log");
      setLogged(`Logged ${json.notes ?? row.product}.`);
      setQty("");
      setConfirmed(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p style={noteStyle}>Label catalog unavailable: {loadError}</p>;
  if (!catalog) return <p style={noteStyle}>Loading the catalog…</p>;
  if (catalog.length === 0) {
    return <p style={noteStyle}>No products yet — add one under Inventory → Catalog.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <select
        aria-label="Product"
        value={id}
        onChange={(e) => pick(e.target.value)}
        style={fieldStyle}
      >
        <option value="">Choose a product…</option>
        {catalog.map((c) => (
          <option key={c.id} value={c.id}>
            {c.brand} {c.product}
            {c.prep_state !== "as_sold" ? ` (${c.prep_state.replace("_", " ")})` : ""}
          </option>
        ))}
      </select>

      {row && (
        <>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              aria-label="Amount"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder="amount"
              style={{ ...fieldStyle, flex: 1 }}
            />
            <select
              aria-label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              style={{ ...fieldStyle, width: "auto" }}
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {row.prep_state !== "as_sold" && (
            <label style={{ ...noteStyle, display: "flex", gap: "var(--space-2)" }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              This amount is {row.prep_state} weight, not what was on the plate
            </label>
          )}

          {preview && "refused" in preview && <p style={warnStyle}>{preview.refused}</p>}
          {preview && !("refused" in preview) && (
            <p style={noteStyle}>
              {preview.grams} g → {preview.calories} kcal · {preview.protein_g} P ·{" "}
              {preview.carbs_g} C · {preview.fat_g} F
              {preview.exact ? "" : " · container weight inferred from servings"}
            </p>
          )}

          <button
            type="button"
            onClick={log}
            disabled={busy || !preview || "refused" in preview}
            style={btnStyle}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : `Log as ${mealType}`}
          </button>
        </>
      )}

      {error && (
        <p role="alert" style={warnStyle}>
          {error}
        </p>
      )}
      {logged && <p style={noteStyle}>{logged}</p>}
    </div>
  );
}

// 16px text and 44px targets: iOS zooms on focus under 16px (#688).
const fieldStyle: React.CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
  fontSize: 16,
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-1)",
  padding: "0 var(--space-2)",
  minHeight: 44,
  width: "100%",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  minHeight: 44,
  borderRadius: "var(--r-1)",
  border: "1px solid var(--color-primary)",
  background: "var(--color-primary)",
  color: "var(--color-bg)",
  fontSize: "var(--t-micro)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const noteStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  margin: 0,
};

const warnStyle: React.CSSProperties = { ...noteStyle, color: "var(--color-amber)" };
