"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { WorkoutPlan, WorkoutExercise } from "@/lib/types";

interface Props {
  plans: WorkoutPlan[];
  completedDates: string[];
}

interface DaySlot {
  label: string;
  date: string;
  plan: WorkoutPlan | undefined;
  isToday: boolean;
  isCompleted: boolean;
}

function buildWeekDays(plans: WorkoutPlan[], completedDates: string[]): DaySlot[] {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dow = (today.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return DAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    return {
      label,
      date,
      plan: plans.find((p) => p.date === date),
      isToday: date === todayStr,
      isCompleted: completedDates.includes(date),
    };
  });
}

function fmtShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtWeekRange(days: DaySlot[]): string {
  if (days.length === 0) return "";
  return `${fmtShortDate(days[0].date)} – ${fmtShortDate(days[6].date)}`;
}

function ExerciseRow({ ex }: { ex: WorkoutExercise }) {
  const details: string[] = [];
  if (ex.sets) details.push(`${ex.sets} sets`);
  if (ex.reps) details.push(`× ${ex.reps}`);
  if (ex.weight_lbs) details.push(`@ ${ex.weight_lbs} lbs`);

  return (
    <div className="flex items-baseline gap-1.5" style={{ padding: "3px 0" }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)" }}>{ex.exercise}</span>
      {details.length > 0 && (
        <>
          <span style={{ fontSize: 11, color: "var(--color-text-faint, var(--color-text-muted))" }}>·</span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {details.join(" ")}
          </span>
        </>
      )}
    </div>
  );
}

function PhaseSection({ label, exercises }: { label: string; exercises: WorkoutExercise[] }) {
  if (exercises.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        className="text-xs uppercase tracking-widest"
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.07em",
          color: "var(--color-text-faint, var(--color-text-muted))",
          paddingBottom: 5,
          marginBottom: 6,
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {label}
      </div>
      {exercises.map((ex, i) => (
        <ExerciseRow key={i} ex={ex} />
      ))}
    </div>
  );
}

export function WeeklyWorkoutPlan({ plans, completedDates }: Props) {
  const days = buildWeekDays(plans, completedDates);
  const todayDate = new Date().toISOString().slice(0, 10);

  const [open, setOpen] = useState<Record<string, boolean>>(() => ({
    [todayDate]: true,
  }));

  function toggle(date: string) {
    setOpen((prev) => ({ ...prev, [date]: !prev[date] }));
  }

  if (days.length === 0) return null;

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
        >
          Weekly Program
        </p>
        <span style={{ fontSize: 11, color: "var(--color-text-faint, var(--color-text-muted))" }}>
          {fmtWeekRange(days)}
        </span>
      </div>

      {/* Day rows */}
      <div className="flex flex-col gap-1.5">
        {days.map((day) => {
          const isOpen = !!open[day.date];

          if (!day.plan) {
            // Rest day — plain row, no toggle
            return (
              <div
                key={day.date}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", width: 28, flexShrink: 0 }}>
                  {day.label}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-faint, var(--color-text-muted))" }}>
                  {fmtShortDate(day.date)}
                </span>
                {day.isToday && (
                  <span
                    className="text-xs uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full"
                    style={{ fontSize: 10, background: "var(--color-primary)", color: "var(--color-text-on-cta)" }}
                  >
                    Today
                  </span>
                )}
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 12,
                    fontStyle: "italic",
                    color: "var(--color-text-faint, var(--color-text-muted))",
                  }}
                >
                  Rest
                </span>
              </div>
            );
          }

          // Plan day — expandable card
          return (
            <div
              key={day.date}
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--color-border)" }}
            >
              {/* Card header */}
              <button
                onClick={() => toggle(day.date)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer transition-colors duration-150"
                style={{
                  background: "var(--color-surface-raised)",
                  border: "none",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", width: 28, flexShrink: 0 }}>
                  {day.label}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {fmtShortDate(day.date)}
                </span>
                {day.isToday && (
                  <span
                    className="text-xs uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full"
                    style={{ fontSize: 10, background: "var(--color-primary)", color: "var(--color-text-on-cta)", flexShrink: 0 }}
                  >
                    Today
                  </span>
                )}
                {day.plan.name && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--color-text)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {day.plan.name}
                  </span>
                )}
                {!day.plan.name && <span style={{ flex: 1 }} />}
                {day.isCompleted && (
                  <span style={{ color: "var(--color-positive)", fontSize: 14, marginLeft: 4, flexShrink: 0 }}>✓</span>
                )}
                <span style={{ color: "var(--color-text-faint, var(--color-text-muted))", flexShrink: 0 }}>
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {/* Card body */}
              {isOpen && (
                <div
                  style={{
                    padding: "12px 14px 14px",
                    borderTop: "1px solid var(--color-border)",
                    background: "var(--color-bg, var(--color-surface))",
                  }}
                >
                  <PhaseSection label="Warm-up" exercises={day.plan.warmup} />
                  <PhaseSection label="Workout" exercises={day.plan.workout} />
                  <div style={{ marginBottom: 0 }}>
                    <PhaseSection label="Cool-down" exercises={day.plan.cooldown} />
                  </div>
                  {day.plan.notes && (
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8, fontStyle: "italic" }}>
                      {day.plan.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
