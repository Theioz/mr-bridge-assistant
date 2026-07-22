"use client";

import { useState, useTransition } from "react";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import type {
  WorkoutPlan,
  WorkoutExercise,
  StrengthSession,
  StrengthSessionSet,
  ExercisePR,
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
  cancelAction?: (date: string, reason?: string) => Promise<void>;
  prsByExercise?: Record<string, ExercisePR>;
  restTimerEnabled?: boolean;
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

function isRecentPR(achievedAt: string | null): boolean {
  if (!achievedAt) return false;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(achievedAt).getTime() < THIRTY_DAYS_MS;
}

function notationLabel(notation: "per_hand" | "total" | null | undefined): string {
  if (notation === "per_hand") return " / hand";
  if (notation === "total") return " total";
  return "";
}

const DB_PATTERN = /dumbbell|\bdb\b|single.arm/i;

/** Resolves effective notation: explicit field wins; DB exercises fall back to per_hand; everything else null. */
function resolveNotation(ex: WorkoutExercise): "per_hand" | "total" | null {
  if (ex.weight_notation != null) return ex.weight_notation;
  if (!ex.weight_lbs) return null;
  return DB_PATTERN.test(ex.exercise) ? "per_hand" : null;
}

interface ExerciseRowProps {
  ex: WorkoutExercise;
  unit: WeightUnit;
  exercisePR?: ExercisePR | null;
  restTimerEnabled?: boolean;
  // Superset slot ("A1"/"A2") when this row is part of a pair — renders a chip before the name,
  // and suppresses the per-exercise set count (the group header carries the round count instead).
  tag?: string | null;
  loggerContext?: {
    date: string;
    workoutPlanId: string | null;
    exerciseOrder: number;
    setsForThisExercise: StrengthSessionSet[];
    unit: WeightUnit;
  };
}

function ExerciseRow({
  ex,
  unit: _unit,
  exercisePR,
  restTimerEnabled,
  tag,
  loggerContext,
}: ExerciseRowProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Inside a superset the round count lives in the group header, so drop the per-exercise "N sets".
  const setsStr = ex.sets && !tag ? `${ex.sets} sets` : null;
  const repsStr = ex.reps ? `× ${ex.reps}` : null;
  const hasWeight = ex.weight_lbs != null && ex.weight_lbs > 0;
  const notation = resolveNotation(ex);
  const hasDetails = !!(ex.description || (ex.tips && ex.tips.length > 0));

  const recentPRAchievedAt =
    exercisePR != null
      ? ((
          [
            exercisePR.weight_pr_achieved_at ?? null,
            exercisePR.rep_pr_achieved_at ?? null,
            exercisePR.volume_pr_achieved_at ?? null,
          ] as (string | null)[]
        ).find(isRecentPR) ?? null)
      : null;
  const showPRChip = recentPRAchievedAt != null;

  return (
    <div style={{ padding: "var(--space-1) 0" }}>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        {tag && <span style={tagChipStyle}>{tag}</span>}
        <span
          style={{
            fontSize: "var(--t-body)",
            fontWeight: 500,
            color: "var(--color-text)",
          }}
        >
          {ex.exercise}
        </span>
        {showPRChip && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--color-amber)",
              lineHeight: 1,
            }}
          >
            🏆 PR
          </span>
        )}
        {(setsStr || repsStr || hasWeight) && (
          <>
            <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>·</span>
            <span
              className="tnum"
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
              }}
            >
              {[setsStr, repsStr].filter(Boolean).join(" ")}
              {hasWeight && (
                <>
                  {setsStr || repsStr ? " @ " : "@ "}
                  {ex.weight_lbs} lbs
                  {notation && (
                    <span style={{ color: "var(--color-text-faint)" }}>
                      {notationLabel(notation)}
                    </span>
                  )}
                </>
              )}
            </span>
          </>
        )}
        {hasDetails && (
          <button
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            aria-label="Exercise details"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-text-faint)",
              display: "inline-flex",
              alignItems: "center",
              lineHeight: 1,
            }}
          >
            {detailsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      {detailsOpen && hasDetails && (
        <div
          style={{
            marginTop: "var(--space-1)",
            paddingLeft: "var(--space-2)",
            borderLeft: "1px solid var(--rule-soft)",
          }}
        >
          {ex.description && (
            <p
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {ex.description}
            </p>
          )}
          {ex.tips && ex.tips.length > 0 && (
            <ul
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
                margin: "var(--space-1) 0 0",
                paddingLeft: "var(--space-4)",
                lineHeight: 1.5,
              }}
            >
              {ex.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loggerContext && (
        <InlineSetLogger
          date={loggerContext.date}
          workoutPlanId={loggerContext.workoutPlanId}
          exerciseName={ex.exercise}
          exerciseOrder={loggerContext.exerciseOrder}
          targetSets={ex.sets}
          targetReps={ex.reps}
          targetWeightLbs={ex.weight_lbs}
          weightNotation={notation}
          existingSets={loggerContext.setsForThisExercise}
          unit={loggerContext.unit}
          restTimerEnabled={restTimerEnabled}
        />
      )}
    </div>
  );
}

type LoggerBase = {
  date: string;
  workoutPlanId: string | null;
  setsByExercise: Map<string, StrengthSessionSet[]>;
  orderOffset: number;
  unit: WeightUnit;
};

function buildLoggerContext(
  loggerBase: LoggerBase | undefined,
  ex: WorkoutExercise,
  index: number,
) {
  if (!loggerBase) return undefined;
  return {
    date: loggerBase.date,
    workoutPlanId: loggerBase.workoutPlanId,
    exerciseOrder: loggerBase.orderOffset + index,
    setsForThisExercise: loggerBase.setsByExercise.get(ex.exercise.toLowerCase()) ?? [],
    unit: loggerBase.unit,
  };
}

// A phase is a mix of standalone exercises and superset groups. Consecutive exercises whose
// `superset` slot shares a letter (A1/A2 → "A") are one group, run alternated; everything else
// is a single row. Each item keeps its flat index so the set logger still targets the right slot.
type PhaseRow =
  | { kind: "single"; ex: WorkoutExercise; index: number }
  | {
      kind: "superset";
      letter: string;
      rounds: number | null;
      items: { ex: WorkoutExercise; index: number }[];
    };

function supersetLetter(ex: WorkoutExercise): string {
  return ex.superset ? ex.superset.trim().charAt(0).toUpperCase() : "";
}

function groupBySuperset(exercises: WorkoutExercise[]): PhaseRow[] {
  const rows: PhaseRow[] = [];
  let i = 0;
  while (i < exercises.length) {
    const letter = supersetLetter(exercises[i]);
    if (letter) {
      const items = [{ ex: exercises[i], index: i }];
      let j = i + 1;
      while (j < exercises.length && supersetLetter(exercises[j]) === letter) {
        items.push({ ex: exercises[j], index: j });
        j += 1;
      }
      if (items.length >= 2) {
        rows.push({ kind: "superset", letter, rounds: exercises[i].sets ?? null, items });
        i = j;
        continue;
      }
    }
    rows.push({ kind: "single", ex: exercises[i], index: i });
    i += 1;
  }
  return rows;
}

interface SupersetGroupProps {
  letter: string;
  rounds: number | null;
  items: { ex: WorkoutExercise; index: number }[];
  unit: WeightUnit;
  prsByExercise?: Record<string, ExercisePR>;
  restTimerEnabled?: boolean;
  loggerBase?: LoggerBase;
}

// Strong-style superset block: an accent rail links the paired exercises, a header states the
// round count and how to run them, and each exercise keeps its own A1/A2 tag and set logger.
function SupersetGroup({
  letter,
  rounds,
  items,
  unit,
  prsByExercise,
  restTimerEnabled,
  loggerBase,
}: SupersetGroupProps) {
  return (
    <div style={supersetContainerStyle}>
      <div className="flex items-baseline flex-wrap" style={{ gap: "var(--space-2)" }}>
        <span style={supersetChipStyle}>Superset {letter}</span>
        {rounds ? <span style={supersetRoundsStyle}>{rounds} rounds</span> : null}
        <span style={supersetHintStyle}>alternate · ~20s between · ~60s after the pair</span>
      </div>
      <div style={{ marginTop: "var(--space-1)" }}>
        {items.map(({ ex, index }) => (
          <ExerciseRow
            key={index}
            ex={ex}
            tag={ex.superset}
            unit={unit}
            exercisePR={prsByExercise?.[ex.exercise.toLowerCase()] ?? null}
            restTimerEnabled={restTimerEnabled}
            loggerContext={buildLoggerContext(loggerBase, ex, index)}
          />
        ))}
      </div>
    </div>
  );
}

interface PhaseSectionProps {
  label: string;
  exercises: WorkoutExercise[];
  unit: WeightUnit;
  prsByExercise?: Record<string, ExercisePR>;
  restTimerEnabled?: boolean;
  loggerBase?: LoggerBase;
}

function PhaseSection({
  label,
  exercises,
  unit,
  prsByExercise,
  restTimerEnabled,
  loggerBase,
}: PhaseSectionProps) {
  if (exercises.length === 0) return null;
  const rows = groupBySuperset(exercises);
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
      {rows.map((row, ri) => {
        if (row.kind === "superset") {
          return (
            <SupersetGroup
              key={ri}
              letter={row.letter}
              rounds={row.rounds}
              items={row.items}
              unit={unit}
              prsByExercise={prsByExercise}
              restTimerEnabled={restTimerEnabled}
              loggerBase={loggerBase}
            />
          );
        }
        return (
          <ExerciseRow
            key={ri}
            ex={row.ex}
            unit={unit}
            exercisePR={prsByExercise?.[row.ex.exercise.toLowerCase()] ?? null}
            restTimerEnabled={restTimerEnabled}
            loggerContext={buildLoggerContext(loggerBase, row.ex, row.index)}
          />
        );
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
  cancelAction,
  prsByExercise,
  restTimerEnabled = true,
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
  const [cancellingDates, setCancellingDates] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function toggle(date: string) {
    setOpen((prev) => ({ ...prev, [date]: !prev[date] }));
  }

  function handleCancel(date: string, planName: string | null) {
    const label = planName ?? "this workout";
    if (!window.confirm(`Cancel ${label} on ${date}? This will also delete the calendar event.`))
      return;
    setCancellingDates((prev) => new Set(prev).add(date));
    startTransition(async () => {
      await cancelAction?.(date);
      setCancellingDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
    });
  }

  if (days.length === 0) return null;

  return (
    <section className="flex flex-col" style={{ gap: "var(--space-4)", minWidth: 0 }}>
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
                  style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
                >
                  {fmtShortDate(day.date)}
                </span>
                {day.isToday && <TodayPip />}
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  Rest
                </span>
              </div>
            );
          }

          const isCancelled = day.plan.status === "cancelled";
          const isCancelling = cancellingDates.has(day.date);

          if (isCancelled) {
            return (
              <div
                key={day.date}
                className="flex items-center flex-wrap"
                style={{
                  minHeight: 44,
                  padding: "var(--space-3) 0",
                  borderTop: isFirst ? undefined : "1px solid var(--rule-soft)",
                  gap: "var(--space-3)",
                  opacity: 0.45,
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
                  style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
                >
                  {fmtShortDate(day.date)}
                </span>
                {day.plan.name && (
                  <span
                    style={{
                      fontSize: "var(--t-body)",
                      color: "var(--color-text-muted)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textDecoration: "line-through",
                    }}
                  >
                    {day.plan.name}
                  </span>
                )}
                {!day.plan.name && <span style={{ flex: 1 }} />}
                <span
                  style={{
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-faint)",
                    background: "var(--rule-soft)",
                    padding: "2px 6px",
                    borderRadius: "var(--r-1)",
                    flexShrink: 0,
                  }}
                >
                  Cancelled
                </span>
              </div>
            );
          }

          return (
            <div
              key={day.date}
              style={{
                borderTop: isFirst ? undefined : "1px solid var(--rule-soft)",
                opacity: isCancelling ? 0.5 : 1,
                transition: "opacity var(--motion-fast) var(--ease-out-quart)",
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
                  transition: "color var(--motion-fast) var(--ease-out-quart)",
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
                  style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
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
                  <PhaseSection
                    label="Warm-up"
                    exercises={day.plan.warmup}
                    unit={weightUnit}
                    prsByExercise={prsByExercise}
                  />
                  <PhaseSection
                    label="Workout"
                    exercises={day.plan.workout}
                    unit={weightUnit}
                    prsByExercise={prsByExercise}
                    restTimerEnabled={restTimerEnabled}
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
                  <PhaseSection
                    label="Cool-down"
                    exercises={day.plan.cooldown}
                    unit={weightUnit}
                    prsByExercise={prsByExercise}
                  />
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
                      performedOn={day.date}
                      workoutPlanId={day.plan?.id ?? null}
                      initialPerceivedEffort={todaySession?.perceived_effort ?? null}
                      initialNotes={todaySession?.notes ?? null}
                      completedAt={todaySession?.completed_at ?? null}
                    />
                  )}
                  {cancelAction && day.plan.status === "planned" && (
                    <div style={{ marginTop: "var(--space-4)" }}>
                      <button
                        onClick={() => handleCancel(day.date, day.plan!.name)}
                        disabled={isCancelling}
                        className="flex items-center cursor-pointer disabled:opacity-40"
                        style={{
                          gap: "var(--space-1)",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: "var(--color-text-faint)",
                          fontSize: "var(--t-micro)",
                          transition: "color var(--motion-fast) var(--ease-out-quart)",
                        }}
                      >
                        <X size={12} />
                        Cancel workout
                      </button>
                    </div>
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
        color: "var(--accent-text)",
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

const tagChipStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.03em",
  color: "var(--accent-text)",
  background: "var(--rule-soft)",
  borderRadius: 3,
  padding: "1px 4px",
  lineHeight: 1.4,
  flexShrink: 0,
};

const supersetContainerStyle: React.CSSProperties = {
  borderLeft: "2px solid var(--accent)",
  paddingLeft: "var(--space-3)",
  marginTop: "var(--space-1)",
  marginBottom: "var(--space-3)",
};

const supersetChipStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--accent-text)",
};

const supersetRoundsStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  fontVariantNumeric: "tabular-nums",
};

const supersetHintStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--color-text-faint)",
  fontStyle: "italic",
};
