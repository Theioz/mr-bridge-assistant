"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type {
  WorkoutPlan,
  WorkoutExercise,
  StrengthSession,
  StrengthSessionSet,
} from "@/lib/types";
import { todayString, addDays } from "@/lib/timezone";
import type { WeightUnit } from "@/lib/units";
import { InlineSetLogger } from "./inline-set-logger";
import { EndOfWorkoutRecap } from "./end-of-workout-recap";

interface Props {
  plans: WorkoutPlan[];
  completedDates: string[];
  todaySession?: StrengthSession | null;
  todaySets?: StrengthSessionSet[];
  weightUnit?: WeightUnit;
}

interface DaySlot {
  label: string;
  date: string;
  plan: WorkoutPlan | undefined;
  isToday: boolean;
  isCompleted: boolean;
}

function buildWeekDays(plans: WorkoutPlan[], completedDates: string[]): DaySlot[] {
  const todayStr = todayString();
  const dow = (new Date(`${todayStr}T12:00:00Z`).getUTCDay() + 6) % 7;
  const mondayStr = addDays(todayStr, -dow);
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return DAY_LABELS.map((label, i) => {
    const date = addDays(mondayStr, i);
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
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtWeekRange(days: DaySlot[]): string {
  if (days.length === 0) return "";
  return `${fmtShortDate(days[0].date)} – ${fmtShortDate(days[6].date)}`;
}

interface ExerciseRowProps {
  ex: WorkoutExercise;
  loggerContext?: {
    date: string;
    workoutPlanId: string | null;
    exerciseOrder: number;
    setsForThisExercise: StrengthSessionSet[];
    unit: WeightUnit;
  };
}

function ExerciseRow({ ex, loggerContext }: ExerciseRowProps) {
  const details: string[] = [];
  if (ex.sets) details.push(`${ex.sets} sets`);
  if (ex.reps) details.push(`× ${ex.reps}`);
  if (ex.weight_lbs) details.push(`@ ${ex.weight_lbs} lbs`);

  return (
    <div style={{ padding: "var(--space-1) 0" }}>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span
          style={{
            fontSize: "var(--t-body)",
            fontWeight: 500,
            color: "var(--color-text)",
          }}
        >
          {ex.exercise}
        </span>
        {details.length > 0 && (
          <>
            <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>·</span>
            <span
              className="tnum"
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
              }}
            >
              {details.join(" ")}
            </span>
          </>
        )}
      </div>
      {loggerContext && (
        <InlineSetLogger
          date={loggerContext.date}
          workoutPlanId={loggerContext.workoutPlanId}
          exerciseName={ex.exercise}
          exerciseOrder={loggerContext.exerciseOrder}
          targetSets={ex.sets}
          targetReps={ex.reps}
          targetWeightLbs={ex.weight_lbs}
          existingSets={loggerContext.setsForThisExercise}
          unit={loggerContext.unit}
        />
      )}
    </div>
  );
}

interface PhaseSectionProps {
  label: string;
  exercises: WorkoutExercise[];
  loggerBase?: {
    date: string;
    workoutPlanId: string | null;
    setsByExercise: Map<string, StrengthSessionSet[]>;
    orderOffset: number;
    unit: WeightUnit;
  };
}

function PhaseSection({ label, exercises, loggerBase }: PhaseSectionProps) {
  if (exercises.length === 0) return null;
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-faint)",
          paddingBottom: "var(--space-2)",
          marginBottom: "var(--space-2)",
          borderBottom: "1px solid var(--rule-soft)",
        }}
      >
        {label}
      </div>
      {exercises.map((ex, i) => {
        const loggerContext = loggerBase
          ? {
              date: loggerBase.date,
              workoutPlanId: loggerBase.workoutPlanId,
              exerciseOrder: loggerBase.orderOffset + i,
              setsForThisExercise:
                loggerBase.setsByExercise.get(ex.exercise.toLowerCase()) ?? [],
              unit: loggerBase.unit,
            }
          : undefined;
        return <ExerciseRow key={i} ex={ex} loggerContext={loggerContext} />;
      })}
    </div>
  );
}

export function WeeklyWorkoutPlan({
  plans,
  completedDates,
  todaySession = null,
  todaySets = [],
  weightUnit = "lb",
}: Props) {
  const days = buildWeekDays(plans, completedDates);
  const todayDate = todayString();

  const setsByExercise = new Map<string, StrengthSessionSet[]>();
  for (const set of todaySets) {
    const key = set.exercise_name.toLowerCase();
    const list = setsByExercise.get(key) ?? [];
    list.push(set);
    setsByExercise.set(key, list);
  }
  for (const list of setsByExercise.values()) {
    list.sort((a, b) => a.set_number - b.set_number);
  }

  const [open, setOpen] = useState<Record<string, boolean>>(() => ({
    [todayDate]: true,
  }));

  function toggle(date: string) {
    setOpen((prev) => ({ ...prev, [date]: !prev[date] }));
  }

  if (days.length === 0) return null;

  return (
    <section
      className="flex flex-col"
      style={{ gap: "var(--space-4)", minWidth: 0 }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "var(--t-h2)",
            fontWeight: 600,
            color: "var(--color-text)",
            letterSpacing: "-0.01em",
          }}
        >
          Weekly program
        </h2>
        <span
          className="tnum"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
        >
          {fmtWeekRange(days)}
        </span>
      </div>

      <div className="flex flex-col">
        {days.map((day, idx) => {
          const isOpen = !!open[day.date];
          const isFirst = idx === 0;

          if (!day.plan) {
            return (
              <div
                key={day.date}
                className="flex items-center flex-wrap"
                style={{
                  minHeight: 44,
                  padding: "var(--space-3) 0",
                  borderTop: isFirst ? undefined : "1px solid var(--rule-soft)",
                  gap: "var(--space-3)",
                }}
              >
                <span
                  className="tnum"
                  style={{
                    fontSize: "var(--t-micro)",
                    fontWeight: 600,
                    color: "var(--color-text-muted)",
                    width: 32,
                    flexShrink: 0,
                    letterSpacing: "0.04em",
                  }}
                >
                  {day.label}
                </span>
                <span
                  className="tnum"
                  style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
                >
                  {fmtShortDate(day.date)}
                </span>
                {day.isToday && <TodayPip />}
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-faint)",
                    fontStyle: "italic",
                  }}
                >
                  Rest
                </span>
              </div>
            );
          }

          return (
            <div
              key={day.date}
              style={{
                borderTop: isFirst ? undefined : "1px solid var(--rule-soft)",
              }}
            >
              <button
                onClick={() => toggle(day.date)}
                className="w-full flex items-center text-left cursor-pointer flex-wrap"
                style={{
                  minHeight: 44,
                  padding: "var(--space-3) 0",
                  background: "transparent",
                  border: "none",
                  gap: "var(--space-3)",
                  transition:
                    "color var(--motion-fast) var(--ease-out-quart)",
                  color: "var(--color-text)",
                }}
                aria-expanded={isOpen}
              >
                <span
                  className="tnum"
                  style={{
                    fontSize: "var(--t-micro)",
                    fontWeight: 600,
                    color: "var(--color-text-muted)",
                    width: 32,
                    flexShrink: 0,
                    letterSpacing: "0.04em",
                  }}
                >
                  {day.label}
                </span>
                <span
                  className="tnum"
                  style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
                >
                  {fmtShortDate(day.date)}
                </span>
                {day.isToday && <TodayPip />}
                {day.plan.name && (
                  <span
                    style={{
                      fontSize: "var(--t-body)",
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
                  <span
                    aria-label="Completed"
                    style={{
                      fontSize: "var(--t-micro)",
                      color: "var(--color-positive)",
                      flexShrink: 0,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    ✓
                  </span>
                )}
                <span
                  style={{
                    color: "var(--color-text-faint)",
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {isOpen && (
                <div
                  style={{
                    padding: "var(--space-3) 0 var(--space-4) calc(32px + var(--space-3))",
                  }}
                >
                  <PhaseSection label="Warm-up" exercises={day.plan.warmup} />
                  <PhaseSection
                    label="Workout"
                    exercises={day.plan.workout}
                    loggerBase={
                      day.isToday
                        ? {
                            date: day.date,
                            workoutPlanId: day.plan.id,
                            setsByExercise,
                            orderOffset: 0,
                            unit: weightUnit,
                          }
                        : undefined
                    }
                  />
                  <PhaseSection label="Cool-down" exercises={day.plan.cooldown} />
                  {day.plan.notes && (
                    <p
                      style={{
                        fontSize: "var(--t-micro)",
                        color: "var(--color-text-muted)",
                        marginTop: "var(--space-2)",
                        fontStyle: "italic",
                      }}
                    >
                      {day.plan.notes}
                    </p>
                  )}
                  {day.isToday && (
                    <EndOfWorkoutRecap
                      sessionId={todaySession?.id ?? null}
                      initialPerceivedEffort={todaySession?.perceived_effort ?? null}
                      initialNotes={todaySession?.notes ?? null}
                      completedAt={todaySession?.completed_at ?? null}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TodayPip() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--accent)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--accent)",
        }}
      />
      Today
    </span>
  );
}
