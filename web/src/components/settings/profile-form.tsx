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
            Nutrition Goals
          </p>
        </div>
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
