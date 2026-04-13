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
  {
    key: "fiber_goal",
    label: "Fiber Goal",
    placeholder: "e.g. 30",
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
  fiber: number;
}

type GoalMode = "lose" | "maintain" | "build";

const GOAL_MODES: { key: GoalMode; label: string; multiplier: number; description: string }[] = [
  { key: "lose",     label: "Lose",     multiplier: 12, description: "12× goal weight — deficit for fat loss" },
  { key: "maintain", label: "Maintain", multiplier: 15, description: "15× goal weight — neutral, hold current composition" },
  { key: "build",    label: "Build",    multiplier: 17, description: "17× goal weight — surplus for muscle gain" },
];

const PROTEIN_OPTIONS: { value: number; label: string }[] = [
  { value: 0.8, label: "0.8 g/lb" },
  { value: 0.9, label: "0.9 g/lb" },
  { value: 1.0, label: "1.0 g/lb" },
];

function suggestMacros(
  weightGoal: number,
  calMultiplier: number,
  proteinPerLb: number,
): SuggestedMacros {
  const calories = Math.round(weightGoal * calMultiplier);
  const protein  = Math.round(weightGoal * proteinPerLb);
  // Fat: 25% of calories — hormonal baseline
  const fat      = Math.round((calories * 0.25) / 9);
  // Carbs: fill remaining calories
  const carbs    = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  // Fiber: mid-range of 25–35 g/day
  const fiber    = 30;
  return { calories, protein, carbs, fat, fiber };
}

function SuggestedNutritionCard({
  values,
  updateAction,
}: {
  values: Record<string, string>;
  updateAction: (key: string, value: string) => Promise<void>;
}) {
  const weightGoal = parseFloat(values["weight_goal_lbs"] ?? "");

  const [mode, setMode]               = useState<GoalMode>("lose");
  const [proteinPerLb, setProteinPerLb] = useState(0.8);
  const [applied, setApplied]         = useState(false);
  const [isPending, startTransition]  = useTransition();

  if (!weightGoal || isNaN(weightGoal)) return null;

  const calMultiplier = GOAL_MODES.find((m) => m.key === mode)!.multiplier;
  const suggested     = suggestMacros(weightGoal, calMultiplier, proteinPerLb);

  function applyAll() {
    startTransition(async () => {
      await Promise.all([
        updateAction("calorie_goal", String(suggested.calories)),
        updateAction("protein_goal", String(suggested.protein)),
        updateAction("carbs_goal",   String(suggested.carbs)),
        updateAction("fat_goal",     String(suggested.fat)),
        updateAction("fiber_goal",   String(suggested.fiber)),
      ]);
      setApplied(true);
      setTimeout(() => setApplied(false), 2500);
    });
  }

  const activeMode = GOAL_MODES.find((m) => m.key === mode)!;

  return (
    <div
      className="mx-5 my-3 rounded-lg px-4 py-4 flex flex-col gap-3"
      style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.22)" }}
    >
      {/* Mode + protein controls */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium shrink-0" style={{ color: "var(--color-primary)" }}>
          Goal
        </span>
        <div className="flex items-center gap-1">
          {GOAL_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => { setMode(m.key); setApplied(false); }}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: mode === m.key ? "var(--color-primary)" : "var(--color-surface-raised)",
                color:      mode === m.key ? "#fff" : "var(--color-text-muted)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <span className="text-xs font-medium shrink-0 ml-2" style={{ color: "var(--color-primary)" }}>
          Protein
        </span>
        <div className="flex items-center gap-1">
          {PROTEIN_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => { setProteinPerLb(o.value); setApplied(false); }}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: proteinPerLb === o.value ? "var(--color-primary)" : "var(--color-surface-raised)",
                color:      proteinPerLb === o.value ? "#fff" : "var(--color-text-muted)",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Computed targets + Apply */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {suggested.calories} kcal · {suggested.protein} g protein · {suggested.carbs} g carbs · {suggested.fat} g fat · {suggested.fiber} g fiber
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-faint)" }}>
            {activeMode.description} · protein {proteinPerLb} g/lb · fat 25% of calories · carbs fill remainder
          </p>
        </div>
        <button
          onClick={applyAll}
          disabled={isPending}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer disabled:opacity-40"
          style={{
            background: applied ? "rgba(16,185,129,0.15)" : "var(--color-primary)",
            color:      applied ? "var(--color-positive)" : "#fff",
            border:     applied ? "1px solid rgba(16,185,129,0.3)" : "1px solid var(--color-primary)",
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
