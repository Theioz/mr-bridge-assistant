"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MealRowDisplay, MealRowEdit, type MealRowEditFields } from "./MealRows";
import { MEAL_ORDER, type MealRow } from "./meals-shared";

// ─── Past Meals (below tabs, always visible) ──────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function PastMeals({
  pastMeals,
  onDelete,
}: {
  pastMeals: MealRow[];
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const byDate = new Map<string, MealRow[]>();
  for (const meal of pastMeals) {
    if (!byDate.has(meal.date)) byDate.set(meal.date, []);
    byDate.get(meal.date)!.push(meal);
  }
  const dates = Array.from(byDate.keys());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<MealRowEditFields>({
    notes: "",
    meal_type: "breakfast",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
    fiber_g: "",
    sugar_g: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  function startEdit(m: MealRow) {
    setEditingId(m.id);
    setEditFields({
      notes: m.notes ?? "",
      meal_type: m.meal_type,
      calories: m.calories != null ? String(m.calories) : "",
      protein_g: m.protein_g != null ? String(m.protein_g) : "",
      carbs_g: m.carbs_g != null ? String(m.carbs_g) : "",
      fat_g: m.fat_g != null ? String(m.fat_g) : "",
      fiber_g: m.fiber_g != null ? String(m.fiber_g) : "",
      sugar_g: m.sugar_g != null ? String(m.sugar_g) : "",
    });
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    await fetch("/api/meals/log", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        notes: editFields.notes || null,
        meal_type: editFields.meal_type,
        calories: editFields.calories ? Number(editFields.calories) : null,
        protein_g: editFields.protein_g ? Number(editFields.protein_g) : null,
        carbs_g: editFields.carbs_g ? Number(editFields.carbs_g) : null,
        fat_g: editFields.fat_g ? Number(editFields.fat_g) : null,
        fiber_g: editFields.fiber_g ? Number(editFields.fiber_g) : null,
        sugar_g: editFields.sugar_g ? Number(editFields.sugar_g) : null,
      }),
    });
    setEditSaving(false);
    setEditingId(null);
    router.refresh();
  }

  return (
    <section style={{ paddingTop: "var(--space-5)", borderTop: "1px solid var(--rule)" }}>
      <h2 className="db-section-label">Past 6 Days</h2>
      <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
        {dates.map((date) => {
          const dayMeals = (byDate.get(date) ?? []).sort(
            (a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9),
          );
          return (
            <div key={date}>
              <p
                className="tnum"
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.04em",
                  marginBottom: "var(--space-2)",
                }}
              >
                {fmtDate(date)}
              </p>
              <div>
                {dayMeals.map((m, i) => (
                  <div key={m.id} style={i > 0 ? { borderTop: "1px solid var(--rule-soft)" } : {}}>
                    {editingId === m.id ? (
                      <MealRowEdit
                        fields={editFields}
                        saving={editSaving}
                        onChange={setEditFields}
                        onSave={() => saveEdit(m.id)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <MealRowDisplay
                        meal={m}
                        onClick={() => startEdit(m)}
                        onDelete={() => onDelete(m.id)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
