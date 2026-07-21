"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KitchenPlannedMeal } from "./KitchenPanel";
import { addWeightConversions } from "@/lib/units";

/**
 * The click-in view for a planned meal: what's in it, and what it costs you.
 *
 * A plan carries no macros of its own — it points at a recipe or a cook, and those own the
 * numbers (see .claude/rules/data-sources.md). So this reads through whichever one is attached:
 *   recipe-backed  -> the recipe's ingredients + USDA macros (per serving if it splits)
 *   cook-backed    -> the cook's macros for one portion
 *   freeform       -> nothing to show, because nothing was specified. "Tilapia x2 + rice" never
 *                     recorded how much tilapia or how much rice. The fix isn't to guess here;
 *                     it's to write the amounts down once as a recipe — which is what the form
 *                     below does, resolving USDA macros and adopting this plan in one step.
 */

interface Macros {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
}

function round(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

function MacroLine({ m, label, portions }: { m: Macros; label: string; portions?: number }) {
  const div = portions && portions > 1 ? portions : 1;
  const cal = m.calories == null ? null : Math.round(m.calories / div);
  const p = round(m.protein_g == null ? null : m.protein_g / div);
  const c = round(m.carbs_g == null ? null : m.carbs_g / div);
  const f = round(m.fat_g == null ? null : m.fat_g / div);
  if (cal == null && p == null) return null;
  return (
    <div style={macroRowStyle}>
      <span style={macroLabelStyle}>{label}</span>
      <span style={macroValsStyle}>
        {cal != null ? `${cal} kcal` : "—"}
        {p != null ? ` · ${p}g P` : ""}
        {c != null ? ` · ${c}g C` : ""}
        {f != null ? ` · ${f}g F` : ""}
      </span>
    </div>
  );
}

export function PlannedMealDetail({ meal }: { meal: KitchenPlannedMeal }) {
  const router = useRouter();
  const recipe = meal.recipes;
  const cook = meal.cooks;

  // ── Recipe-backed ──────────────────────────────────────────────────────────
  if (recipe) {
    const hasMacros = !!recipe.macros_computed_at;
    const typ = recipe.typical_portions ?? null;
    return (
      <div style={detailBoxStyle}>
        {recipe.ingredients ? (
          <div style={{ marginBottom: "var(--space-3)" }}>
            <p style={sectionLabelStyle}>Ingredients</p>
            <p style={ingredientsStyle}>{addWeightConversions(recipe.ingredients)}</p>
          </div>
        ) : (
          <p style={mutedStyle}>No ingredients recorded for this recipe yet.</p>
        )}
        {recipe.instructions && (
          <div style={{ marginBottom: hasMacros ? "var(--space-3)" : 0 }}>
            <p style={sectionLabelStyle}>How to make it</p>
            <p style={ingredientsStyle}>{recipe.instructions}</p>
          </div>
        )}
        {hasMacros ? (
          <>
            {typ && typ > 1 && <MacroLine m={recipe} label="Per serving" portions={typ} />}
            <MacroLine m={recipe} label={typ && typ > 1 ? `Whole recipe (${typ})` : "This meal"} />
            {recipe.macros_confidence && recipe.macros_confidence !== "high" && (
              <p style={confidenceStyle}>
                {recipe.macros_confidence} confidence — amounts are estimates, not measured.
              </p>
            )}
          </>
        ) : (
          <p style={mutedStyle}>Macros not resolved yet for this recipe.</p>
        )}
      </div>
    );
  }

  // ── Cook-backed (leftovers) ─────────────────────────────────────────────────
  if (cook) {
    return (
      <div style={detailBoxStyle}>
        <p style={sectionLabelStyle}>From the fridge</p>
        <p style={ingredientsStyle}>
          {cook.name} · {cook.portions_remaining} of {cook.portions} portion
          {cook.portions === 1 ? "" : "s"} left
        </p>
        <MacroLine m={cook} label="One portion" portions={cook.portions > 0 ? cook.portions : 1} />
      </div>
    );
  }

  // ── Freeform: nothing specified. Offer to make it a recipe. ──────────────────
  return <FreeformConvert meal={meal} onDone={() => router.refresh()} />;
}

function FreeformConvert({ meal, onDone }: { meal: KitchenPlannedMeal; onDone: () => void }) {
  const [name, setName] = useState(meal.name ?? "");
  const [ingredients, setIngredients] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !ingredients.trim()) {
      setError("Add a name and at least one ingredient with an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    setWarn(null);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ingredients: ingredients.trim(),
          resolve: true,
          link_plan_id: meal.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that");
        return;
      }
      if (data.macrosError) {
        // Recipe was saved and linked, but USDA couldn't resolve every amount. Refresh anyway —
        // the plan now shows the ingredients; the numbers can be tightened later.
        setWarn(data.macrosError);
        setTimeout(onDone, 1400);
        return;
      }
      onDone();
    } catch {
      setError("Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={detailBoxStyle}>
      <p style={mutedStyle}>
        This meal has no amounts recorded. Write them down once and it becomes a reusable recipe
        with macros.
      </p>
      <label style={sectionLabelStyle} htmlFor={`name-${meal.id}`}>
        Recipe name
      </label>
      <input
        id={`name-${meal.id}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
        placeholder="Tilapia & rice"
      />
      <label
        style={{ ...sectionLabelStyle, marginTop: "var(--space-3)" }}
        htmlFor={`ing-${meal.id}`}
      >
        Ingredients — one per line, with amounts
      </label>
      <textarea
        id={`ing-${meal.id}`}
        value={ingredients}
        onChange={(e) => setIngredients(e.target.value)}
        rows={4}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        placeholder={"2 tilapia fillets\n1 cup cooked white rice"}
      />
      {error && <p style={errorStyle}>{error}</p>}
      {warn && (
        <p style={confidenceStyle}>Saved, but some amounts were too vague for USDA: {warn}</p>
      )}
      <button type="button" onClick={save} disabled={busy} style={saveButtonStyle(busy)}>
        {busy ? "Saving…" : "Save as recipe"}
      </button>
    </div>
  );
}

const detailBoxStyle: React.CSSProperties = {
  padding: "var(--space-3) 0 var(--space-4)",
  borderTop: "1px solid var(--rule-soft)",
};

const sectionLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--t-micro)",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "var(--space-1)",
};

const ingredientsStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  color: "var(--color-text)",
  lineHeight: 1.6,
  whiteSpace: "pre-line",
};

const mutedStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  color: "var(--color-text-muted)",
  lineHeight: 1.6,
  marginBottom: "var(--space-3)",
};

const macroRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  padding: "var(--space-1) 0",
};

const macroLabelStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
};

const macroValsStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  color: "var(--color-text)",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
};

const confidenceStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  fontStyle: "italic",
  marginTop: "var(--space-2)",
};

const errorStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-danger)",
  marginTop: "var(--space-2)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: "var(--t-meta)",
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-1)",
  padding: "var(--space-2)",
};

function saveButtonStyle(pending: boolean): React.CSSProperties {
  return {
    marginTop: "var(--space-3)",
    fontFamily: "var(--font-body), system-ui, sans-serif",
    fontSize: "var(--t-micro)",
    fontWeight: 500,
    color: "var(--color-text-on-cta)",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--r-1)",
    padding: "0 var(--space-4)",
    minHeight: 36,
    cursor: pending ? "wait" : "pointer",
    opacity: pending ? 0.5 : 1,
  };
}
