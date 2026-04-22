"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

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
  {
    key: "lose",
    label: "Lose",
    multiplier: 12,
    description: "12× goal weight — deficit for fat loss",
  },
  {
    key: "maintain",
    label: "Maintain",
    multiplier: 15,
    description: "15× goal weight — neutral, hold current composition",
  },
  {
    key: "build",
    label: "Build",
    multiplier: 17,
    description: "17× goal weight — surplus for muscle gain",
  },
];

const PROTEIN_OPTIONS: { value: number; label: string }[] = [
  { value: 1.0, label: "1.0 g/lb" },
  { value: 0.9, label: "0.9 g/lb" },
  { value: 0.8, label: "0.8 g/lb" },
];

function suggestMacros(
  weightGoal: number,
  calMultiplier: number,
  proteinPerLb: number,
): SuggestedMacros {
  const calories = Math.round(weightGoal * calMultiplier);
  const protein = Math.round(weightGoal * proteinPerLb);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const fiber = 30;
  return { calories, protein, carbs, fat, fiber };
}

function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="flex items-center p-0.5"
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        background: "transparent",
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-1)",
        gap: 2,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            style={{
              fontSize: "var(--t-micro)",
              fontWeight: 500,
              letterSpacing: "0.02em",
              padding: "0 var(--space-3)",
              minHeight: 36,
              minWidth: 44,
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
              border: "none",
              borderRadius: "var(--r-1)",
              cursor: "pointer",
              transition:
                "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SuggestedNutritionCallout({
  values,
  updateAction,
}: {
  values: Record<string, string>;
  updateAction: (key: string, value: string) => Promise<void>;
}) {
  const weightGoal = parseFloat(values["weight_goal_lbs"] ?? "");

  const [mode, setMode] = useState<GoalMode>("lose");
  const [proteinPerLb, setProteinPerLb] = useState(1.0);
  const [applied, setApplied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDismissPending, startDismissTransition] = useTransition();

  if (!weightGoal || isNaN(weightGoal)) return null;
  if (values["nutrition_suggestion_dismissed"] === "true") return null;

  const calMultiplier = GOAL_MODES.find((m) => m.key === mode)!.multiplier;
  const suggested = suggestMacros(weightGoal, calMultiplier, proteinPerLb);

  function applyAll() {
    startTransition(async () => {
      await Promise.all([
        updateAction("calorie_goal", String(suggested.calories)),
        updateAction("protein_goal", String(suggested.protein)),
        updateAction("carbs_goal", String(suggested.carbs)),
        updateAction("fat_goal", String(suggested.fat)),
        updateAction("fiber_goal", String(suggested.fiber)),
      ]);
      setApplied(true);
      setTimeout(() => setApplied(false), 2500);
    });
  }

  function dismiss() {
    startDismissTransition(async () => {
      await updateAction("nutrition_suggestion_dismissed", "true");
    });
  }

  const activeMode = GOAL_MODES.find((m) => m.key === mode)!;

  return (
    <div
      className="relative flex flex-col"
      style={{
        background: "var(--color-primary-dim)",
        border: "1px solid var(--accent-soft)",
        borderRadius: "var(--r-1)",
        padding: "var(--space-4)",
        marginTop: "var(--space-3)",
        marginBottom: "var(--space-3)",
        gap: "var(--space-3)",
      }}
    >
      <button
        onClick={dismiss}
        disabled={isDismissPending}
        title="Dismiss"
        className="absolute flex items-center justify-center rounded transition-colors cursor-pointer disabled:opacity-40 hover-text-muted"
        style={{
          top: 8,
          right: 8,
          width: 24,
          height: 24,
          color: "var(--color-text-faint)",
          background: "transparent",
          border: "none",
        }}
      >
        <X size={13} />
      </button>

      <div className="flex flex-wrap items-center" style={{ gap: "var(--space-3)" }}>
        <span
          style={{
            fontSize: "var(--t-micro)",
            fontWeight: 500,
            color: "var(--color-primary)",
            flexShrink: 0,
          }}
        >
          Goal
        </span>
        <PillGroup
          options={GOAL_MODES.map((m) => ({ value: m.key, label: m.label }))}
          value={mode}
          onChange={(v) => {
            setMode(v);
            setApplied(false);
          }}
          ariaLabel="Goal mode"
        />

        <span
          style={{
            fontSize: "var(--t-micro)",
            fontWeight: 500,
            color: "var(--color-primary)",
            flexShrink: 0,
            marginLeft: "var(--space-2)",
          }}
        >
          Protein
        </span>
        <PillGroup
          options={PROTEIN_OPTIONS}
          value={proteinPerLb}
          onChange={(v) => {
            setProteinPerLb(v);
            setApplied(false);
          }}
          ariaLabel="Protein per pound"
        />
      </div>

      <div className="flex items-start justify-between" style={{ gap: "var(--space-4)" }}>
        <div className="flex-1 min-w-0">
          <p
            className="tnum"
            style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
          >
            {suggested.calories} kcal · {suggested.protein} g protein · {suggested.carbs} g carbs ·{" "}
            {suggested.fat} g fat · {suggested.fiber} g fiber
          </p>
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
              marginTop: "var(--space-1)",
            }}
          >
            {activeMode.description} · protein {proteinPerLb} g/lb · fat 25% of calories · carbs
            fill remainder
          </p>
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
              opacity: 0.65,
              marginTop: "var(--space-1)",
            }}
          >
            Rough estimate based on goal weight only — ask in Chat for a more personalized result.
          </p>
        </div>
        <button
          onClick={applyAll}
          disabled={isPending}
          className="flex items-center cursor-pointer disabled:opacity-40"
          style={{
            flexShrink: 0,
            gap: "var(--space-1)",
            padding: "0 var(--space-3)",
            minHeight: 44,
            minWidth: 72,
            background: applied ? "transparent" : "var(--accent)",
            color: applied ? "var(--color-positive)" : "var(--color-text-on-cta)",
            border: applied ? "1px solid var(--color-positive)" : "1px solid var(--accent)",
            borderRadius: "var(--r-1)",
            fontSize: "var(--t-micro)",
            fontWeight: 500,
            letterSpacing: "0.02em",
            transition:
              "background var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)",
          }}
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : applied ? (
            <>
              <Check size={12} /> Applied
            </>
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
  onDirtyChange,
  isFirst,
}: {
  field: Field;
  initialValue: string;
  updateAction: (key: string, value: string) => Promise<void>;
  deleteAction: (key: string) => Promise<void>;
  onDirtyChange?: (key: string, dirty: boolean) => void;
  isFirst?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [baseline, setBaseline] = useState(initialValue);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDirty = value !== baseline;

  useEffect(() => {
    onDirtyChange?.(field.key, isDirty);
    return () => onDirtyChange?.(field.key, false);
  }, [isDirty, field.key, onDirtyChange]);

  async function handleSave() {
    startTransition(async () => {
      const trimmed = value.trim();
      if (trimmed === "") {
        await deleteAction(field.key);
      } else {
        await updateAction(field.key, trimmed);
      }
      setValue(trimmed);
      setBaseline(trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div
      style={{
        paddingTop: "var(--space-3)",
        paddingBottom: "var(--space-3)",
        borderTop: isFirst ? "none" : "1px solid var(--rule-soft)",
      }}
    >
      <div
        className="flex items-start justify-between"
        style={{ gap: "var(--space-3)", marginBottom: "var(--space-2)" }}
      >
        <label
          htmlFor={`field-${field.key}`}
          style={{
            fontSize: "var(--t-meta)",
            fontWeight: 500,
            color: "var(--color-text)",
          }}
        >
          {field.label}
        </label>
        {field.hint && (
          <span
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
              textAlign: "right",
            }}
          >
            {field.hint}
          </span>
        )}
      </div>
      <div className="flex" style={{ gap: "var(--space-2)" }}>
        <input
          id={`field-${field.key}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder={field.placeholder}
          className="flex-1 focus:outline-none input-focus-ring"
          style={{
            background: "transparent",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-1)",
            color: "var(--color-text)",
            fontSize: "var(--t-meta)",
            padding: "0 var(--space-3)",
            minHeight: 44,
            transition: "border-color var(--motion-fast) var(--ease-out-quart)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
        <button
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className="flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default"
          style={{
            gap: "var(--space-1)",
            padding: "0 var(--space-3)",
            minHeight: 44,
            minWidth: 72,
            background: saved ? "transparent" : isDirty ? "var(--accent)" : "transparent",
            color: saved
              ? "var(--color-positive)"
              : isDirty
                ? "var(--color-text-on-cta)"
                : "var(--color-text-muted)",
            border: `1px solid ${
              saved ? "var(--color-positive)" : isDirty ? "var(--accent)" : "var(--rule)"
            }`,
            borderRadius: "var(--r-1)",
            fontSize: "var(--t-micro)",
            fontWeight: 500,
            letterSpacing: "0.02em",
            transition:
              "background var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
          }}
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved ? (
            <>
              <Check size={14} /> Saved
            </>
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}

function RecalculateLink({ deleteAction }: { deleteAction: (key: string) => Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await deleteAction("nutrition_suggestion_dismissed");
        })
      }
      disabled={isPending}
      className="cursor-pointer disabled:opacity-40"
      style={{
        fontSize: "var(--t-micro)",
        color: "var(--color-primary)",
        background: "transparent",
        border: "none",
        padding: 0,
      }}
    >
      {isPending ? (
        <Loader2 size={11} className="animate-spin inline" />
      ) : (
        "Recalculate suggested macros"
      )}
    </button>
  );
}

function SettingsSection({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        paddingTop: "var(--space-6)",
        paddingBottom: "var(--space-6)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ gap: "var(--space-3)", marginBottom: "var(--space-2)" }}
      >
        <h2 className="db-section-label" style={{ margin: 0 }}>
          {label}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}

export function ProfileForm({ values, updateAction, deleteAction }: Props) {
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const handleDirtyChange = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
      const has = prev.has(key);
      if (dirty === has) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  useUnsavedChangesWarning(dirtyKeys.size > 0);

  return (
    <>
      <SettingsSection label="Profile">
        {EDITABLE_FIELDS.map((field, i) => (
          <FieldRow
            key={field.key}
            field={field}
            initialValue={values[field.key] ?? ""}
            updateAction={updateAction}
            deleteAction={deleteAction}
            onDirtyChange={handleDirtyChange}
            isFirst={i === 0}
          />
        ))}
      </SettingsSection>

      <SettingsSection label="Fitness Goals">
        {FITNESS_GOAL_FIELDS.map((field, i) => (
          <FieldRow
            key={field.key}
            field={field}
            initialValue={values[field.key] ?? ""}
            updateAction={updateAction}
            deleteAction={deleteAction}
            onDirtyChange={handleDirtyChange}
            isFirst={i === 0}
          />
        ))}
      </SettingsSection>

      <SettingsSection
        label="Nutrition Goals"
        meta={
          values["nutrition_suggestion_dismissed"] === "true" ? (
            <RecalculateLink deleteAction={deleteAction} />
          ) : undefined
        }
      >
        <SuggestedNutritionCallout values={values} updateAction={updateAction} />
        {NUTRITION_GOAL_FIELDS.map((field, i) => (
          <FieldRow
            key={field.key}
            field={field}
            initialValue={values[field.key] ?? ""}
            updateAction={updateAction}
            deleteAction={deleteAction}
            onDirtyChange={handleDirtyChange}
            isFirst={i === 0}
          />
        ))}
      </SettingsSection>
    </>
  );
}
