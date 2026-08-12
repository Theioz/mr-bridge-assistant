"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import type { RecipeIngredient, RecipeStep } from "@/lib/types";
import { splitIngredientLines } from "@/lib/units";
import { lexQuantity } from "@/lib/nutrition/quantity";

/**
 * Row-based editor for a recipe's ingredients and method.
 *
 * WHY ROWS AND NOT A TEXTAREA
 *
 * The amount is the whole point. Prose ingredients get routed through a local model to recover
 * {food, amount} pairs, and that model measurably alters the numbers it is asked to repeat — a
 * large egg came back as 105 g against a real ~50 g. Typing 105 into a number input cannot be
 * misread. Everything downstream (`estimateFromStructured`) then skips the model entirely.
 *
 * SEEDING FROM LEGACY TEXT
 *
 * ~65 recipes hold free text. Opening the editor on one runs each line through `lexQuantity` — the
 * same lexer the macro pipeline already trusts — to split "255 g chicken breast" into 255 / g /
 * "chicken breast". Lines it cannot read keep the whole line as the item with a null amount, which
 * renders as an explicit "no amount" warning rather than a silent zero. This matters: a row saved
 * with `quantity: null` is EXCLUDED from macros by design, so a bad seed that looked fine would
 * quietly delete an ingredient from the total.
 *
 * REORDERING IS BUTTONS, NOT DRAG
 *
 * No drag-and-drop dependency exists in this project and hand-rolled DnD is not keyboard
 * operable. Up/down controls reorder from the keyboard, work on touch without a long-press, and
 * cost nothing to maintain. Step numbers are renumbered on save so `step` always matches order.
 */
export function RecipeEditor({
  recipe,
  onSaved,
  onCancel,
}: {
  recipe: {
    id: string;
    name: string;
    ingredients: string | null;
    instructions: string | null;
    ingredients_json: RecipeIngredient[] | null;
    steps_json: RecipeStep[] | null;
  };
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [rows, setRows] = useState<RecipeIngredient[]>(() =>
    recipe.ingredients_json?.length ? recipe.ingredients_json : seedRows(recipe.ingredients),
  );
  const [steps, setSteps] = useState<RecipeStep[]>(() =>
    recipe.steps_json?.length ? recipe.steps_json : seedSteps(recipe.instructions),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const missingAmounts = rows.filter((r) => r.item.trim() && r.quantity == null).length;

  function patchRow(i: number, patch: Partial<RecipeIngredient>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }

  async function save() {
    setBusy(true);
    setError(null);
    setWarn(null);
    // Blank rows are dropped rather than rejected — an empty trailing row is how people leave a
    // form, not an error worth blocking a save over.
    const cleanRows = rows
      .filter((r) => r.item.trim())
      .map((r) => ({
        ...r,
        item: r.item.trim(),
        // The API rejects a quantity with no unit, because grams cannot be derived from a bare
        // number. Default to grams rather than bounce the user back for the common case.
        unit: r.quantity != null ? r.unit?.trim() || "g" : null,
      }));
    const cleanSteps = steps
      .filter((s) => s.text.trim())
      .map((s, i) => ({ ...s, step: i + 1, text: s.text.trim() }));

    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients_json: cleanRows,
          steps_json: cleanSteps.length ? cleanSteps : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't save");
        return;
      }
      if (json.macrosError) setWarn(`Saved, but macros didn't resolve: ${json.macrosError}`);
      onSaved?.();
    } catch {
      setError("Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={boxStyle}>
      <p style={labelStyle}>Ingredients</p>
      {rows.map((r, i) => (
        <div key={i} style={rowStyle}>
          <input
            aria-label={`Amount for ingredient ${i + 1}`}
            value={r.quantity ?? ""}
            onChange={(e) =>
              patchRow(i, {
                quantity: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            inputMode="decimal"
            type="number"
            min="0"
            step="any"
            placeholder="qty"
            style={{ ...inputStyle, width: "4.5rem" }}
          />
          <input
            aria-label={`Unit for ingredient ${i + 1}`}
            value={r.unit ?? ""}
            onChange={(e) => patchRow(i, { unit: e.target.value || null })}
            placeholder="g"
            style={{ ...inputStyle, width: "3.5rem" }}
          />
          <input
            aria-label={`Ingredient ${i + 1}`}
            value={r.item}
            onChange={(e) => patchRow(i, { item: e.target.value })}
            placeholder="ground beef, 93/7"
            style={{ ...inputStyle, flex: 1, minWidth: "7rem" }}
          />
          <input
            aria-label={`Prep for ingredient ${i + 1}`}
            value={r.prep ?? ""}
            onChange={(e) => patchRow(i, { prep: e.target.value || null })}
            placeholder="raw / cooked"
            style={{ ...inputStyle, width: "6.5rem" }}
          />
          <input
            aria-label={`USDA id for ingredient ${i + 1}`}
            value={r.fdc_id ?? ""}
            onChange={(e) =>
              patchRow(i, { fdc_id: e.target.value === "" ? null : Number(e.target.value) })
            }
            type="number"
            placeholder="fdc id"
            title="Pin the USDA FoodData Central record so re-resolving can't drift"
            style={{ ...inputStyle, width: "5.5rem" }}
          />
          <IconBtn label="Move up" onClick={() => setRows((rs) => move(rs, i, -1))}>
            <ChevronUp size={13} />
          </IconBtn>
          <IconBtn label="Move down" onClick={() => setRows((rs) => move(rs, i, 1))}>
            <ChevronDown size={13} />
          </IconBtn>
          <IconBtn
            label={`Remove ingredient ${i + 1}`}
            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
          >
            <X size={13} />
          </IconBtn>
        </div>
      ))}
      <button
        type="button"
        style={addBtnStyle}
        onClick={() => setRows((rs) => [...rs, { item: "", quantity: null, unit: "g" }])}
      >
        <Plus size={12} /> Add ingredient
      </button>

      {missingAmounts > 0 && (
        <p style={warnStyle}>
          {missingAmounts} ingredient{missingAmounts === 1 ? "" : "s"} with no amount. Those are
          treated as &ldquo;to taste&rdquo; and left out of the macros — fill the amount in if that
          isn&rsquo;t what you meant.
        </p>
      )}

      <p style={{ ...labelStyle, marginTop: "var(--space-4)" }}>How to make it</p>
      {steps.map((s, i) => (
        <div key={i} style={rowStyle}>
          <span style={stepNumStyle}>{i + 1}.</span>
          <textarea
            aria-label={`Step ${i + 1}`}
            value={s.text}
            onChange={(e) =>
              setSteps((ss) => ss.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
            }
            rows={2}
            placeholder="Brown the beef, then add the aromatics."
            style={{ ...inputStyle, flex: 1, resize: "vertical", fontFamily: "inherit" }}
          />
          <IconBtn label="Move up" onClick={() => setSteps((ss) => move(ss, i, -1))}>
            <ChevronUp size={13} />
          </IconBtn>
          <IconBtn label="Move down" onClick={() => setSteps((ss) => move(ss, i, 1))}>
            <ChevronDown size={13} />
          </IconBtn>
          <IconBtn
            label={`Remove step ${i + 1}`}
            onClick={() => setSteps((ss) => ss.filter((_, j) => j !== i))}
          >
            <X size={13} />
          </IconBtn>
        </div>
      ))}
      <button
        type="button"
        style={addBtnStyle}
        onClick={() => setSteps((ss) => [...ss, { step: ss.length + 1, text: "" }])}
      >
        <Plus size={12} /> Add step
      </button>

      {error && <p style={errorStyle}>{error}</p>}
      {warn && <p style={warnStyle}>{warn}</p>}
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
        <button type="button" onClick={save} disabled={busy} style={saveStyle(busy)}>
          {busy ? "Saving…" : "Save & re-resolve macros"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={cancelStyle}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Legacy text -> editable rows, using the same lexer the macro pipeline uses.
 *
 * A line the lexer cannot read keeps its full text as the item and a null amount, which surfaces
 * in the "no amount" warning above. That is deliberate: silently inventing an amount here would
 * write a number Jason never typed into a column the resolver treats as authoritative.
 */
function seedRows(text: string | null): RecipeIngredient[] {
  const lines = splitIngredientLines(text);
  if (!lines.length) return [{ item: "", quantity: null, unit: "g" }];
  return lines.map((line) => {
    const lexed = lexQuantity(line);
    if (!lexed) return { item: line, quantity: null, unit: null };
    const at = line.indexOf(lexed.source);
    const rest = (at < 0 ? line : line.slice(at + lexed.source.length))
      .trim()
      .replace(/^(of\s+|[,\-–—]\s*)/i, "");
    return { item: rest || line, quantity: lexed.qty, unit: lexed.unit };
  });
}

/** Legacy instructions -> steps. Split on blank lines first, then newlines. */
function seedSteps(text: string | null): RecipeStep[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const chunks = (t.includes("\n\n") ? t.split(/\n{2,}/) : t.split("\n"))
    .map((c) => c.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
  return chunks.map((text, i) => ({ step: i + 1, text }));
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} style={iconBtnStyle}>
      {children}
    </button>
  );
}

const boxStyle: React.CSSProperties = {
  padding: "var(--space-3) 0",
  borderTop: "1px solid var(--rule-soft)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--t-micro)",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "var(--space-2)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "var(--space-1)",
  marginBottom: "var(--space-1)",
};

const inputStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  padding: "0.35em 0.5em",
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-1)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
};

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.3em",
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-1)",
  background: "transparent",
  color: "var(--color-text-muted)",
  cursor: "pointer",
};

const addBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3em",
  fontSize: "var(--t-meta)",
  color: "var(--color-text-muted)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "var(--space-1) 0",
};

const stepNumStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  color: "var(--color-text-muted)",
  width: "1.2rem",
};

const errorStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  color: "var(--color-danger)",
  marginTop: "var(--space-2)",
};

const warnStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  color: "var(--color-text-muted)",
  marginTop: "var(--space-2)",
  lineHeight: 1.5,
};

const saveStyle = (busy: boolean): React.CSSProperties => ({
  fontSize: "var(--t-meta)",
  padding: "0.45em 0.9em",
  borderRadius: "var(--r-1)",
  border: "1px solid var(--rule-soft)",
  background: "var(--color-text)",
  color: "var(--color-bg)",
  opacity: busy ? 0.6 : 1,
  cursor: busy ? "default" : "pointer",
});

const cancelStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  padding: "0.45em 0.9em",
  borderRadius: "var(--r-1)",
  border: "1px solid var(--rule-soft)",
  background: "transparent",
  color: "var(--color-text-muted)",
  cursor: "pointer",
};
