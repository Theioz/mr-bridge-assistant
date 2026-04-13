"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

interface Field {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
}

interface Props {
  values: Record<string, string>;
  updateAction: (key: string, value: string) => Promise<void>;
  deleteAction: (key: string) => Promise<void>;
}

const EDITABLE_FIELDS: Field[] = [
  {
    key: "name",
    label: "Display Name",
    placeholder: "e.g. Jason",
    hint: "Used in greetings and briefings",
  },
  {
    key: "location_city",
    label: "Current Location",
    placeholder: "e.g. San Francisco, CA",
    hint: "Overrides home location for weather. Clear to revert to home.",
  },
  {
    key: "Identity/Location",
    label: "Home Location",
    placeholder: "e.g. Los Angeles, CA",
    hint: "Used as the default weather location",
  },
  {
    key: "Identity/Name",
    label: "Identity Name",
    placeholder: "e.g. Jason",
    hint: "Fallback name if Display Name is not set",
  },
];

const NUTRITION_GOAL_FIELDS: Field[] = [
  {
    key: "calorie_goal",
    label: "Daily Calorie Goal",
    placeholder: "e.g. 2000",
    hint: "kcal per day",
  },
  {
    key: "protein_goal",
    label: "Protein Goal",
    placeholder: "e.g. 150",
    hint: "grams per day",
  },
  {
    key: "carbs_goal",
    label: "Carbs Goal",
    placeholder: "e.g. 200",
    hint: "grams per day",
  },
  {
    key: "fat_goal",
    label: "Fat Goal",
    placeholder: "e.g. 65",
    hint: "grams per day",
  },
];

const FITNESS_GOAL_FIELDS: Field[] = [
  {
    key: "weekly_workout_goal",
    label: "Weekly Workout Goal",
    placeholder: "e.g. 4",
    hint: "sessions per week",
  },
  {
    key: "weekly_active_cal_goal",
    label: "Weekly Active Cal Goal",
    placeholder: "e.g. 2500",
    hint: "kcal per week",
  },
  {
    key: "weight_goal_lbs",
    label: "Target Weight",
    placeholder: "e.g. 185",
    hint: "lbs",
  },
  {
    key: "body_fat_goal_pct",
    label: "Target Body Fat",
    placeholder: "e.g. 12",
    hint: "%",
  },
];

interface SuggestedMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function suggestMacros(weightGoal: number, bfGoal: number): SuggestedMacros {
  const leanMass = weightGoal * (1 - bfGoal / 100);
  const protein = Math.round(leanMass * 1.0);        // 1 g / lb lean mass
  const fat     = Math.round(weightGoal * 0.40);     // 0.4 g / lb goal weight
  const calories = Math.round(weightGoal * 15);      // 15× bodyweight — moderate activity
  const carbs   = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

function SuggestedNutritionCard({
  values,
  updateAction,
}: {
  values: Record<string, string>;
  updateAction: (key: string, value: string) => Promise<void>;
}) {
  const weightGoal = parseFloat(values["weight_goal_lbs"] ?? "");
  const bfGoal     = parseFloat(values["body_fat_goal_pct"] ?? "");

  const [applied, setApplied]     = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!weightGoal || !bfGoal || isNaN(weightGoal) || isNaN(bfGoal)) return null;

  const suggested = suggestMacros(weightGoal, bfGoal);

  function applyAll() {
    startTransition(async () => {
      await Promise.all([
        updateAction("calorie_goal", String(suggested.calories)),
        updateAction("protein_goal", String(suggested.protein)),
        updateAction("carbs_goal",   String(suggested.carbs)),
        updateAction("fat_goal",     String(suggested.fat)),
      ]);
      setApplied(true);
      setTimeout(() => setApplied(false), 2500);
    });
  }

  return (
    <div
      className="mx-5 my-3 rounded-lg px-4 py-3 flex items-start justify-between gap-4"
      style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.22)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold mb-1" style={{ color: "var(--color-primary)" }}>
          Suggested daily macros — based on {weightGoal} lb / {bfGoal}% goal
        </p>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {suggested.calories} kcal · {suggested.protein} g protein · {suggested.carbs} g carbs · {suggested.fat} g fat
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--color-text-faint)" }}>
          Formula: 1 g protein/lb lean mass · 0.4 g fat/lb goal weight · 15× bodyweight calories · carbs fill remainder
        </p>
      </div>
      <button
        onClick={applyAll}
        disabled={isPending}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer disabled:opacity-40"
        style={{
          background: applied ? "rgba(16,185,129,0.15)" : "var(--color-primary)",
          color: applied ? "var(--color-positive)" : "#fff",
          border: applied ? "1px solid rgba(16,185,129,0.3)" : "1px solid var(--color-primary)",
        }}
      >
        {isPending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : applied ? (
          <><Check size={12} /> Applied</>
        ) : (
          "Apply"
        )}
      </button>
    </div>
  );
}

function FieldRow({
  field,
  initialValue,
  updateAction,
  deleteAction,
}: {
  field: Field;
  initialValue: string;
  updateAction: (key: string, value: string) => Promise<void>;
  deleteAction: (key: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    startTransition(async () => {
      if (value.trim() === "") {
        await deleteAction(field.key);
      } else {
        await updateAction(field.key, value.trim());
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const isDirty = value !== initialValue;

  return (
    <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <label style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)" }}>
          {field.label}
        </label>
        {field.hint && (
          <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{field.hint}</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          placeholder={field.placeholder}
          className="flex-1 rounded-lg px-3 py-2 text-sm transition-colors duration-150 focus:outline-none"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-primary)";
            e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-primary-dim)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.boxShadow = "none";
          }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
        <button
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          style={{
            background: saved ? "rgba(16,185,129,0.15)" : isDirty ? "var(--color-primary)" : "var(--color-surface-raised)",
            color: saved ? "var(--color-positive)" : isDirty ? "#fff" : "var(--color-text-muted)",
            border: `1px solid ${saved ? "rgba(16,185,129,0.3)" : isDirty ? "var(--color-primary)" : "var(--color-border)"}`,
            minWidth: 72,
          }}
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved ? (
            <><Check size={14} /> Saved</>
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}

export function ProfileForm({ values, updateAction, deleteAction }: Props) {
  return (
    <div className="space-y-6">
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
            Profile
          </p>
        </div>
        {EDITABLE_FIELDS.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            initialValue={values[field.key] ?? ""}
            updateAction={updateAction}
            deleteAction={deleteAction}
          />
        ))}
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
            Fitness Goals
          </p>
        </div>
        {FITNESS_GOAL_FIELDS.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            initialValue={values[field.key] ?? ""}
            updateAction={updateAction}
            deleteAction={deleteAction}
          />
        ))}
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
            Nutrition Goals
          </p>
        </div>
        <SuggestedNutritionCard values={values} updateAction={updateAction} />
        {NUTRITION_GOAL_FIELDS.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            initialValue={values[field.key] ?? ""}
            updateAction={updateAction}
            deleteAction={deleteAction}
          />
        ))}
      </div>
    </div>
  );
}
