"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  catalogFlags,
  panelFromRow,
  PREP_STATES,
  splitServingText,
  type PackagedFoodRow,
  type PrepState,
} from "@/lib/nutrition/packaged-foods";
import { todayString } from "@/lib/timezone";

/**
 * The label catalog: the packaged products this kitchen buys, each priced off its own photographed
 * Nutrition Facts panel instead of a USDA proxy (#722).
 *
 * Entry is the panel AS PRINTED — per serving, the only form a label comes in. The server divides
 * it to per 100 g exactly once (`labelToPer100g`), so nothing here does gram arithmetic. A photo of
 * the panel can prefill the form, but it is a transcription to CHECK, not an answer: every number
 * lands in an editable field, and the serving's gram weight is left blank when the label line
 * does not print one rather than converted from "1/2 cup".
 */

type Form = {
  brand: string;
  product: string;
  prep_state: PrepState;
  serving_label: string;
  serving_size_g: string;
  servings_per_container: string;
  net_weight_g: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
  sugarG: string;
  sodiumMg: string;
  label_photographed_on: string;
  upc: string;
  notes: string;
};

const s = (v: number | null | undefined) => (v == null ? "" : String(v));

function emptyForm(): Form {
  return {
    brand: "",
    product: "",
    prep_state: "as_sold",
    serving_label: "",
    serving_size_g: "",
    servings_per_container: "",
    net_weight_g: "",
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    fiberG: "",
    sugarG: "",
    sodiumMg: "",
    label_photographed_on: todayString(),
    upc: "",
    notes: "",
  };
}

function formFromRow(row: PackagedFoodRow): Form {
  const p = panelFromRow(row);
  return {
    brand: row.brand,
    product: row.product,
    prep_state: row.prep_state,
    serving_label: row.serving_label ?? "",
    serving_size_g: s(row.serving_size_g),
    servings_per_container: s(row.servings_per_container),
    net_weight_g: s(row.net_weight_g),
    calories: s(p.calories),
    proteinG: s(p.proteinG),
    carbsG: s(p.carbsG),
    fatG: s(p.fatG),
    fiberG: s(p.fiberG),
    sugarG: s(p.sugarG),
    sodiumMg: s(p.sodiumMg),
    label_photographed_on: row.label_photographed_on,
    upc: row.upc ?? "",
    notes: row.notes ?? "",
  };
}

/** Blank fields go as null; the server validates everything else and says what is wrong. */
function toBody(f: Form) {
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    brand: f.brand,
    product: f.product,
    prep_state: f.prep_state,
    serving_label: f.serving_label || null,
    servings_per_container: n(f.servings_per_container),
    net_weight_g: n(f.net_weight_g),
    label_photographed_on: f.label_photographed_on || null,
    upc: f.upc || null,
    notes: f.notes || null,
    panel: {
      servingSizeG: n(f.serving_size_g),
      calories: n(f.calories),
      proteinG: n(f.proteinG),
      carbsG: n(f.carbsG),
      fatG: n(f.fatG),
      fiberG: n(f.fiberG),
      sugarG: n(f.sugarG),
      sodiumMg: n(f.sodiumMg),
    },
  };
}

export function CatalogPanel({ foods }: { foods: PackagedFoodRow[] }) {
  const router = useRouter();
  // null = closed, "new" = adding, otherwise the id being edited.
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readNote, setReadNote] = useState<string | null>(null);
  const today = todayString();

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  function start(target: "new" | PackagedFoodRow) {
    setError(null);
    setReadNote(null);
    if (target === "new") {
      setForm(emptyForm());
      setOpen("new");
    } else {
      setForm(formFromRow(target));
      setOpen(target.id);
    }
  }

  async function readPhoto(file: File) {
    setBusy(true);
    setError(null);
    setReadNote(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("mode", "label");
      const res = await fetch("/api/meals/analyze-photo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Could not read the label");
      if (!data.readable) {
        throw new Error(`Label wasn't clear enough to read. ${data.notes ?? ""}`.trim());
      }
      const serving = splitServingText(data.serving_size ?? null);
      set({
        product: form.product || data.product_name || "",
        serving_label: serving.label ?? "",
        serving_size_g: s(serving.grams),
        servings_per_container: s(data.servings_per_container),
        calories: s(data.calories),
        proteinG: s(data.protein_g),
        carbsG: s(data.carbs_g),
        fatG: s(data.fat_g),
        fiberG: s(data.fiber_g),
        sugarG: s(data.sugar_g),
        sodiumMg: s(data.sodium_mg),
        label_photographed_on: today,
      });
      setReadNote(
        [
          "Read from the photo — check every number against the label before saving.",
          serving.grams == null
            ? `The serving line ("${data.serving_size ?? "?"}") prints no grams: enter the gram weight.`
            : null,
          "Set the prep state: a dry pasta or rice label must say dry.",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        open === "new" ? "/api/packaged-foods" : `/api/packaged-foods/${open}`,
        {
          method: open === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toBody(form)),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: PackagedFoodRow) {
    if (!window.confirm(`Remove ${row.brand} ${row.product} from the catalog?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/packaged-foods/${row.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const formView = (
    <div
      style={{
        border: "1px solid var(--rule-soft)",
        borderRadius: "var(--r-2)",
        padding: "var(--space-3)",
        marginBottom: "var(--space-4)",
        background: "var(--color-surface)",
      }}
    >
      <label style={{ ...labelStyle, display: "inline-flex", cursor: "pointer" }}>
        <span style={{ ...btnStyle, display: "inline-flex", alignItems: "center" }}>
          {busy ? "Reading…" : "Read from a photo of the label"}
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readPhoto(f);
            e.target.value = "";
          }}
        />
      </label>
      {readNote && <p style={noteStyle}>{readNote}</p>}

      <div style={gridStyle}>
        <Field label="Brand" value={form.brand} onChange={(v) => set({ brand: v })} />
        <Field label="Product" value={form.product} onChange={(v) => set({ product: v })} />
        <label style={labelStyle}>
          Prep state the label describes
          <select
            value={form.prep_state}
            onChange={(e) => set({ prep_state: e.target.value as PrepState })}
            style={inputStyle}
          >
            {PREP_STATES.map((p) => (
              <option key={p} value={p}>
                {p.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Serving as printed (e.g. 2 oz)"
          value={form.serving_label}
          onChange={(v) => set({ serving_label: v })}
        />
        <Field
          label="Serving weight (g)"
          value={form.serving_size_g}
          numeric
          onChange={(v) => set({ serving_size_g: v })}
        />
        <Field
          label="Servings per container"
          value={form.servings_per_container}
          numeric
          onChange={(v) => set({ servings_per_container: v })}
        />
        <Field
          label="Net weight (g), front of pack"
          value={form.net_weight_g}
          numeric
          onChange={(v) => set({ net_weight_g: v })}
        />
      </div>

      <p style={{ ...noteStyle, marginTop: "var(--space-3)" }}>Per serving, as printed</p>
      <div style={gridStyle}>
        <Field
          label="Calories"
          value={form.calories}
          numeric
          onChange={(v) => set({ calories: v })}
        />
        <Field
          label="Protein (g)"
          value={form.proteinG}
          numeric
          onChange={(v) => set({ proteinG: v })}
        />
        <Field label="Carbs (g)" value={form.carbsG} numeric onChange={(v) => set({ carbsG: v })} />
        <Field label="Fat (g)" value={form.fatG} numeric onChange={(v) => set({ fatG: v })} />
        <Field label="Fiber (g)" value={form.fiberG} numeric onChange={(v) => set({ fiberG: v })} />
        <Field label="Sugar (g)" value={form.sugarG} numeric onChange={(v) => set({ sugarG: v })} />
        <Field
          label="Sodium (mg)"
          value={form.sodiumMg}
          numeric
          onChange={(v) => set({ sodiumMg: v })}
        />
      </div>

      <div style={{ ...gridStyle, marginTop: "var(--space-3)" }}>
        <label style={labelStyle}>
          Label photographed on
          <input
            type="date"
            value={form.label_photographed_on}
            onChange={(e) => set({ label_photographed_on: e.target.value })}
            style={inputStyle}
          />
        </label>
        <Field label="Barcode (optional)" value={form.upc} onChange={(v) => set({ upc: v })} />
        <Field label="Notes" value={form.notes} onChange={(v) => set({ notes: v })} />
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
        <button type="button" onClick={save} disabled={busy} style={btnPrimaryStyle}>
          {busy ? "Saving…" : open === "new" ? "Add to catalog" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(null)} disabled={busy} style={btnStyle}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <p style={{ ...noteStyle, marginTop: 0 }}>
        Packaged products priced off their own label. Pin one to a recipe line and that line uses
        the label instead of USDA.
      </p>

      {error && (
        <p role="alert" style={{ ...noteStyle, color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {open === "new" ? (
        formView
      ) : (
        <button
          type="button"
          onClick={() => start("new")}
          style={{ ...btnStyle, marginBottom: "var(--space-4)" }}
        >
          Add a product
        </button>
      )}

      {foods.length === 0 && open !== "new" && (
        <p style={noteStyle}>No products yet. Photograph a Nutrition Facts panel to add one.</p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {foods.map((row) => {
          if (open === row.id) return <li key={row.id}>{formView}</li>;
          const p = panelFromRow(row);
          const flags = catalogFlags(row, today);
          return (
            <li
              key={row.id}
              style={{
                borderBottom: "1px solid var(--rule-soft)",
                padding: "var(--space-3) 0",
              }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--t-body)", color: "var(--color-text)" }}>
                    {row.brand} · {row.product}
                  </div>
                  <div style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>
                    {row.prep_state.replace("_", " ")} · per {row.serving_label ?? "serving"} (
                    {row.serving_size_g} g): {p.calories} kcal · {p.proteinG} P · {p.carbsG} C ·{" "}
                    {p.fatG} F
                  </div>
                  {flags.map((f) => (
                    <div
                      key={f}
                      style={{ fontSize: "var(--t-micro)", color: "var(--color-amber)" }}
                    >
                      {f}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "var(--space-1)", flexShrink: 0 }}>
                  <button type="button" onClick={() => start(row)} disabled={busy} style={btnStyle}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    disabled={busy}
                    style={btnStyle}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={numeric ? "decimal" : undefined}
        style={inputStyle}
      />
    </label>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(9.5rem, 1fr))",
  gap: "var(--space-2)",
  marginTop: "var(--space-3)",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
};

// 16px, not --t-micro: iOS Safari zooms the page on focus of any input under 16px (#688).
const inputStyle: React.CSSProperties = {
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
  padding: "0 var(--space-3)",
  borderRadius: "var(--r-1)",
  border: "1px solid var(--rule-soft)",
  background: "transparent",
  color: "var(--color-text)",
  fontSize: "var(--t-micro)",
  cursor: "pointer",
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  background: "var(--color-primary)",
  borderColor: "var(--color-primary)",
  color: "var(--color-bg)",
};

const noteStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  margin: "var(--space-2) 0",
};
