"use client";

import { useState, useTransition } from "react";

const WORKOUT_TYPES = [
  { id: "strength", label: "Strength training" },
  { id: "cardio", label: "Cardio" },
  { id: "hiit", label: "HIIT" },
  { id: "calisthenics", label: "Calisthenics" },
  { id: "yoga", label: "Yoga & Flexibility" },
  { id: "mixed", label: "Mixed" },
];

const EQUIPMENT_PRESETS = [
  { id: "barbells", label: "Barbells & free weights" },
  { id: "cables", label: "Cables & machines" },
  { id: "bands", label: "Resistance bands" },
  { id: "pullup_bar", label: "Pull-up bar" },
  { id: "cardio_machines", label: "Cardio machines" },
  { id: "bodyweight", label: "Bodyweight only" },
];

const PRESET_IDS = new Set(EQUIPMENT_PRESETS.map((p) => p.id));

function getEquipmentLabel(id: string): string {
  return EQUIPMENT_PRESETS.find((p) => p.id === id)?.label ?? id;
}

interface Props {
  restTimerEnabled: boolean;
  updateAction: (key: string, value: string) => Promise<void>;
  initialWorkoutPrefs: string[];
  initialEquipment: string[];
  saveWorkoutPrefsAction: (prefs: string[], equip: string[]) => Promise<void>;
}

export function FitnessSettings({
  restTimerEnabled,
  updateAction,
  initialWorkoutPrefs,
  initialEquipment,
  saveWorkoutPrefsAction,
}: Props) {
  const [, startTimerTransition] = useTransition();
  const [, startSaveTransition] = useTransition();

  const [workoutPrefs, setWorkoutPrefs] = useState<string[]>(initialWorkoutPrefs);
  const [equipment, setEquipment] = useState<string[]>(initialEquipment);
  const [equipmentDraft, setEquipmentDraft] = useState("");

  function handleTimerToggle() {
    startTimerTransition(() => {
      updateAction("rest_timer_enabled", restTimerEnabled ? "0" : "1");
    });
  }

  function toggleWorkoutPref(id: string) {
    const next = workoutPrefs.includes(id)
      ? workoutPrefs.filter((p) => p !== id)
      : [...workoutPrefs, id];
    setWorkoutPrefs(next);
    startSaveTransition(() => {
      saveWorkoutPrefsAction(next, equipment);
    });
  }

  function toggleEquipmentPreset(id: string) {
    const next = equipment.includes(id) ? equipment.filter((e) => e !== id) : [...equipment, id];
    setEquipment(next);
    startSaveTransition(() => {
      saveWorkoutPrefsAction(workoutPrefs, next);
    });
  }

  function addEquipmentTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag || equipment.includes(tag)) return;
    const next = [...equipment, tag];
    setEquipment(next);
    startSaveTransition(() => {
      saveWorkoutPrefsAction(workoutPrefs, next);
    });
  }

  function removeEquipmentTag(tag: string) {
    const next = equipment.filter((t) => t !== tag);
    setEquipment(next);
    startSaveTransition(() => {
      saveWorkoutPrefsAction(workoutPrefs, next);
    });
  }

  function handleEquipmentKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEquipmentTag(equipmentDraft);
      setEquipmentDraft("");
    } else if (e.key === "Backspace" && !equipmentDraft) {
      const custom = equipment.filter((t) => !PRESET_IDS.has(t));
      if (custom.length > 0) removeEquipmentTag(custom[custom.length - 1]);
    }
  }

  const customEquipment = equipment.filter((t) => !PRESET_IDS.has(t));

  const chipStyle = (selected: boolean): React.CSSProperties => ({
    minHeight: 36,
    padding: "0 var(--space-3)",
    borderRadius: "var(--r-1)",
    border: selected ? "1px solid var(--accent)" : "1px solid var(--rule)",
    background: selected ? "var(--accent)" : "transparent",
    color: selected ? "var(--color-text-on-cta)" : "var(--color-text)",
    fontSize: "var(--t-meta)",
    fontWeight: 500,
    cursor: "pointer",
    transition:
      "background var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)",
  });

  const sectionStyle: React.CSSProperties = {
    paddingTop: "var(--space-6)",
    paddingBottom: "var(--space-6)",
    borderBottom: "1px solid var(--rule-soft)",
  };

  const subLabelStyle: React.CSSProperties = {
    fontSize: "var(--t-micro)",
    fontWeight: 500,
    color: "var(--color-text)",
    letterSpacing: "0.02em",
    marginBottom: "var(--space-3)",
  };

  return (
    <>
      {/* Rest timer */}
      <section aria-labelledby="fitness-heading" style={sectionStyle}>
        <h2 id="fitness-heading" className="db-section-label">
          Fitness
        </h2>
        <div className="flex items-center" style={{ gap: "var(--space-4)" }}>
          <div
            className="flex items-center p-0.5"
            style={{
              background: "transparent",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-1)",
              gap: 2,
            }}
            role="radiogroup"
            aria-label="Rest timer"
          >
            {(["On", "Off"] as const).map((label) => {
              const selected = label === "On" ? restTimerEnabled : !restTimerEnabled;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={handleTimerToggle}
                  style={{
                    fontFamily: "var(--font-body), system-ui, sans-serif",
                    fontSize: "var(--t-micro)",
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    padding: "0 var(--space-3)",
                    minHeight: 44,
                    minWidth: 48,
                    background: selected ? "var(--accent)" : "transparent",
                    color: selected ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                    border: "none",
                    borderRadius: "var(--r-1)",
                    cursor: "pointer",
                    transition:
                      "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>
            {restTimerEnabled ? "Auto-starts after each logged set" : "Rest timer disabled"}
          </span>
        </div>
      </section>

      {/* Workout preferences */}
      <section aria-labelledby="workout-prefs-heading" style={sectionStyle}>
        <h2 id="workout-prefs-heading" className="db-section-label">
          Workout preferences
        </h2>
        <p style={subLabelStyle}>Types of workouts you do</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {WORKOUT_TYPES.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => toggleWorkoutPref(w.id)}
              style={chipStyle(workoutPrefs.includes(w.id))}
            >
              {w.label}
            </button>
          ))}
        </div>
      </section>

      {/* Equipment */}
      <section aria-labelledby="equipment-heading" style={sectionStyle}>
        <h2 id="equipment-heading" className="db-section-label">
          Equipment
        </h2>
        {/* Custom tags */}
        {customEquipment.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-2)",
              marginBottom: "var(--space-3)",
            }}
          >
            {customEquipment.map((tag) => (
              <span
                key={tag}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--r-1)",
                  border: "1px solid var(--accent)",
                  background: "var(--accent)",
                  color: "var(--color-text-on-cta)",
                  fontSize: "var(--t-micro)",
                  fontWeight: 500,
                }}
              >
                {getEquipmentLabel(tag)}
                <button
                  type="button"
                  onClick={() => removeEquipmentTag(tag)}
                  aria-label={`Remove ${getEquipmentLabel(tag)}`}
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                    fontSize: "var(--t-body)",
                    opacity: 0.7,
                    marginLeft: 2,
                    minWidth: 16,
                    minHeight: 16,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Preset chips */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            marginBottom: "var(--space-3)",
          }}
        >
          {EQUIPMENT_PRESETS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => toggleEquipmentPreset(e.id)}
              style={chipStyle(equipment.includes(e.id))}
            >
              {e.label}
            </button>
          ))}
        </div>
        {/* Custom input */}
        <input
          type="text"
          value={equipmentDraft}
          onChange={(e) => setEquipmentDraft(e.target.value)}
          onKeyDown={handleEquipmentKeyDown}
          placeholder="Add other equipment — press Enter to add"
          className="focus:outline-none input-focus-ring"
          style={{
            background: "transparent",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-1)",
            color: "var(--color-text)",
            fontSize: "var(--t-meta)",
            padding: "0 var(--space-3)",
            minHeight: 44,
            width: "100%",
            transition: "border-color var(--motion-fast) var(--ease-out-quart)",
          }}
        />
      </section>
    </>
  );
}
