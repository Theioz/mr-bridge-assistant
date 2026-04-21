"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  FitnessLog,
  WorkoutSession,
  RecoveryMetrics,
  WorkoutPlan,
  StrengthSession,
  StrengthSessionSet,
  ExercisePR,
} from "@/lib/types";
import type { WeightUnit } from "@/lib/units";
import { kgToDisplay } from "@/lib/units";
import type { WindowKey } from "@/lib/window";
import { WeeklyWorkoutPlan } from "./weekly-workout-plan";
import { RecentSessionsList } from "./recent-sessions-list";
import { ExerciseSparkline } from "./exercise-sparkline";
import { BodyCompTrends } from "./body-comp-trends";
import { RecoveryTrends } from "./recovery-trends";
import { ActivityTrends } from "./activity-trends";
import { WorkoutHistoryTable } from "./workout-history-table";

type Tab = "workouts" | "history" | "progress";

interface SparklinePoint {
  performed_on: string;
  top_weight_kg: number | null;
  top_reps: number | null;
}

type SessionWithSets = StrengthSession & { sets: StrengthSessionSet[] };

interface Props {
  // Today tab
  weeklyPlans: WorkoutPlan[];
  completedDates: string[];
  todaySession: SessionWithSets | null;
  todaySets: StrengthSessionSet[];
  weightUnit: WeightUnit;
  cancelAction: (date: string, reason?: string) => Promise<void>;
  // History tab
  recentSessions: SessionWithSets[];
  // Progress tab
  fitnessData: FitnessLog[];
  allWorkouts: WorkoutSession[];
  recoveryAll: RecoveryMetrics[];
  activeCalWindow: { date: string; active_cal: number | null }[];
  topExercises: { name: string; points: SparklinePoint[] }[];
  walkCount: number;
  walkDuration: number;
  weeklyWorkoutGoal: number | null;
  weeklyActiveCalGoal: number | null;
  weightGoal: number | null;
  bodyFatGoal: number | null;
  windowKey: WindowKey;
  days: number;
  weekCount: number;
  // PRs
  exercisePRs: ExercisePR[];
  prCount: number;
}

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: "progress", label: "Dashboard" },
  { id: "workouts", label: "Workouts" },
  { id: "history", label: "History" },
];

export function FitnessClient({
  weeklyPlans,
  completedDates,
  todaySession,
  todaySets,
  weightUnit,
  cancelAction,
  recentSessions,
  fitnessData,
  allWorkouts,
  recoveryAll,
  activeCalWindow,
  topExercises,
  walkCount,
  walkDuration,
  weeklyWorkoutGoal,
  weeklyActiveCalGoal,
  weightGoal,
  bodyFatGoal,
  windowKey,
  days,
  weekCount,
  exercisePRs,
  prCount,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("progress");

  // Build a lookup map from the PRs array (keyed by lowercase exercise name)
  const prsByExercise: Record<string, ExercisePR> = {};
  for (const pr of exercisePRs) {
    prsByExercise[pr.exercise_name.toLowerCase()] = pr;
  }

  // Backfill PRs on first load if none exist yet
  useEffect(() => {
    if (prCount > 0) return;
    fetch("/api/exercise-prs/backfill", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.sessions_processed > 0) router.refresh();
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
      {/* Tab bar */}
      <div
        className="flex items-center"
        style={{
          gap: "var(--space-1)",
          borderBottom: "1px solid var(--rule-soft)",
          paddingBottom: 0,
        }}
      >
        {TAB_LABELS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              background: "transparent",
              border: "none",
              padding: "var(--space-2) var(--space-3)",
              fontSize: "var(--t-micro)",
              fontWeight: tab === id ? 600 : 400,
              color: tab === id ? "var(--color-text)" : "var(--color-text-faint)",
              cursor: "pointer",
              borderBottom: tab === id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
              transition: "color var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Workouts tab — focused workout surface */}
      {tab === "workouts" && (
        <WeeklyWorkoutPlan
          plans={weeklyPlans}
          completedDates={completedDates}
          todaySession={todaySession}
          todaySets={todaySets}
          weightUnit={weightUnit}
          cancelAction={cancelAction}
          prsByExercise={prsByExercise}
        />
      )}

      {/* History tab — session log + sparklines + PRs */}
      {tab === "history" && (
        <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
          <RecentSessionsList sessions={recentSessions} unit={weightUnit} />
          {topExercises.length > 0 && (
            <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
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
                Top exercises
              </h2>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                style={{ gap: "var(--space-5)" }}
              >
                {topExercises.map((ex) => (
                  <ExerciseSparkline
                    key={ex.name}
                    exerciseName={ex.name}
                    points={ex.points}
                    unit={weightUnit}
                  />
                ))}
              </div>
            </section>
          )}
          {exercisePRs.length > 0 && (
            <PersonalRecords prs={exercisePRs} unit={weightUnit} />
          )}
        </div>
      )}

      {/* Progress tab — body comp, recovery, activity trends */}
      {tab === "progress" && (
        <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
          <BodyCompTrends
            data={fitnessData}
            windowKey={windowKey}
            weightGoal={weightGoal}
            bodyFatGoal={bodyFatGoal}
          />
          <RecoveryTrends trends={recoveryAll} />
          <ActivityTrends
            sessions={allWorkouts.filter((w) => !/walk/i.test(w.activity))}
            recovery={activeCalWindow}
            days={days}
            weeklyWorkoutGoal={weeklyWorkoutGoal}
            weeklyActiveCalGoal={weeklyActiveCalGoal}
            walkCount={walkCount}
            walkDuration={walkDuration}
          />
          <WorkoutHistoryTable workouts={allWorkouts} />
        </div>
      )}
    </div>
  );
}

function fmtPRDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function PersonalRecords({ prs, unit }: { prs: ExercisePR[]; unit: WeightUnit }) {
  const sorted = [...prs].sort((a, b) =>
    a.exercise_name.localeCompare(b.exercise_name)
  );

  return (
    <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
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
        Personal records
      </h2>
      <div style={{ overflowX: "auto" }}>
        <table
          className="tnum"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "var(--t-micro)",
            color: "var(--color-text-muted)",
          }}
        >
          <thead>
            <tr>
              {["Exercise", `Weight PR (${unit})`, "Rep PR", `Volume (${unit})`, "Last PR"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--color-text-faint)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "var(--space-2) var(--space-3) var(--space-2) 0",
                    borderBottom: "1px solid var(--rule-soft)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((pr) => {
              const weightDisplay = pr.weight_pr_kg != null
                ? kgToDisplay(pr.weight_pr_kg, unit)
                : null;
              const repDisplay = pr.rep_pr_reps != null
                ? pr.rep_pr_weight_kg != null
                  ? `${pr.rep_pr_reps} @ ${kgToDisplay(pr.rep_pr_weight_kg, unit)} ${unit}`
                  : `${pr.rep_pr_reps} reps`
                : null;
              const volumeDisplay = pr.volume_pr_kg != null
                ? Math.round(kgToDisplay(pr.volume_pr_kg, unit) ?? 0).toLocaleString()
                : null;
              const latestDate = ([pr.weight_pr_achieved_at, pr.rep_pr_achieved_at, pr.volume_pr_achieved_at]
                .filter(Boolean) as string[])
                .sort()
                .at(-1) ?? null;
              const isRecent = latestDate
                ? Date.now() - new Date(latestDate).getTime() < 30 * 24 * 60 * 60 * 1000
                : false;

              return (
                <tr key={pr.exercise_name} style={{ borderBottom: "1px solid var(--rule-soft)" }}>
                  <td style={{ padding: "var(--space-2) var(--space-3) var(--space-2) 0", color: "var(--color-text)", fontWeight: 500 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                      {isRecent && <span style={{ color: "var(--color-amber, #f59e0b)", fontSize: 10 }}>🏆</span>}
                      {pr.exercise_name}
                    </span>
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3) var(--space-2) 0" }}>
                    {weightDisplay ?? <span style={{ color: "var(--color-text-faint)" }}>—</span>}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3) var(--space-2) 0" }}>
                    {repDisplay ?? <span style={{ color: "var(--color-text-faint)" }}>—</span>}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3) var(--space-2) 0" }}>
                    {volumeDisplay ?? <span style={{ color: "var(--color-text-faint)" }}>—</span>}
                  </td>
                  <td style={{ padding: "var(--space-2) 0", color: "var(--color-text-faint)" }}>
                    {fmtPRDate(latestDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
