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
import dynamic from "next/dynamic";
import { WeeklyWorkoutPlan } from "./weekly-workout-plan";
import { RecentSessionsList } from "./recent-sessions-list";
import { ExerciseSparkline } from "./exercise-sparkline";
import { WorkoutHistoryTable } from "./workout-history-table";

const ChartSkeleton = ({ height = 200 }: { height?: number }) => (
  <div
    style={{ height, borderRadius: "var(--r-1)", background: "var(--color-surface-2)" }}
    aria-hidden
  />
);

const BodyCompTrends = dynamic(() => import("./body-comp-trends").then((m) => m.BodyCompTrends), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const RecoveryTrends = dynamic(() => import("./recovery-trends").then((m) => m.RecoveryTrends), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const ActivityTrends = dynamic(() => import("./activity-trends").then((m) => m.ActivityTrends), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

interface SparklinePoint {
  performed_on: string;
  top_weight_kg: number | null;
  top_reps: number | null;
}

type SessionWithSets = StrengthSession & { sets: StrengthSessionSet[] };

interface Props {
  weeklyPlans: WorkoutPlan[];
  completedDates: string[];
  todaySession: SessionWithSets | null;
  todaySets: StrengthSessionSet[];
  weightUnit: WeightUnit;
  cancelAction: (date: string, reason?: string) => Promise<void>;
  recentSessions: SessionWithSets[];
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
  exercisePRs: ExercisePR[];
  prCount: number;
  restTimerEnabled: boolean;
}

// Section label + optional scrollable content area
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="db-section-label" style={{ flexShrink: 0 }}>
      {children}
    </h2>
  );
}

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
  weekCount: _weekCount,
  exercisePRs,
  prCount,
  restTimerEnabled,
}: Props) {
  const router = useRouter();

  const prsByExercise: Record<string, ExercisePR> = {};
  for (const pr of exercisePRs) {
    prsByExercise[pr.exercise_name.toLowerCase()] = pr;
  }

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

  const hasMissingDescriptions = weeklyPlans.some((p) =>
    [...p.warmup, ...p.workout, ...p.cooldown].some((ex) => !ex.description),
  );
  useEffect(() => {
    if (!hasMissingDescriptions) return;
    fetch("/api/workout-plans/backfill-descriptions", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.backfilled > 0) router.refresh();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMissingDescriptions]);

  const rowStyle: React.CSSProperties = {
    gap: "var(--space-7)",
    paddingBottom: "var(--space-7)",
    borderBottom: "1px solid var(--rule-soft)",
  };

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
      {/* ── Row 1: Body composition + Activity ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={rowStyle}>
        <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
          <SectionLabel>Body composition</SectionLabel>
          <BodyCompTrends
            data={fitnessData}
            windowKey={windowKey}
            weightGoal={weightGoal}
            bodyFatGoal={bodyFatGoal}
          />
        </section>
        <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
          <SectionLabel>Activity</SectionLabel>
          <ActivityTrends
            sessions={allWorkouts.filter((w) => !/walk/i.test(w.activity))}
            recovery={activeCalWindow}
            days={days}
            weeklyWorkoutGoal={weeklyWorkoutGoal}
            weeklyActiveCalGoal={weeklyActiveCalGoal}
            walkCount={walkCount}
            walkDuration={walkDuration}
          />
        </section>
      </div>

      {/* ── Row 2: Recovery + Personal records ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={rowStyle}>
        <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
          <SectionLabel>Recovery</SectionLabel>
          <RecoveryTrends trends={recoveryAll} />
        </section>
        <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
          <SectionLabel>Personal records</SectionLabel>
          {exercisePRs.length > 0 ? (
            <PersonalRecords prs={exercisePRs} unit={weightUnit} />
          ) : (
            <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)", margin: 0 }}>
              No PRs logged yet.
            </p>
          )}
        </section>
      </div>

      {/* ── Row 3: Workout program (full-width) ─────────────────────── */}
      <section
        className="flex flex-col"
        style={{
          gap: "var(--space-3)",
          minWidth: 0,
          paddingBottom: "var(--space-7)",
          borderBottom: "1px solid var(--rule-soft)",
        }}
      >
        <SectionLabel>This week</SectionLabel>
        <WeeklyWorkoutPlan
          plans={weeklyPlans}
          completedDates={completedDates}
          todaySession={todaySession}
          todaySets={todaySets}
          weightUnit={weightUnit}
          cancelAction={cancelAction}
          prsByExercise={prsByExercise}
          restTimerEnabled={restTimerEnabled}
        />
      </section>

      {/* ── Row 4: Top exercises + Recent sessions ──────────────────── */}
      {(topExercises.length > 0 || recentSessions.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2" style={rowStyle}>
          {topExercises.length > 0 && (
            <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
              <SectionLabel>Top exercises</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "var(--space-5)" }}>
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
          {recentSessions.length > 0 && (
            <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
              <SectionLabel>Recent sessions</SectionLabel>
              <RecentSessionsList sessions={recentSessions} unit={weightUnit} />
            </section>
          )}
        </div>
      )}

      {/* ── Row 5: Full workout history (full-width) ─────────────────── */}
      <section className="flex flex-col" style={{ gap: "var(--space-3)", minWidth: 0 }}>
        <SectionLabel>All workouts</SectionLabel>
        <WorkoutHistoryTable workouts={allWorkouts} />
      </section>
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
  const [now] = useState(() => Date.now());
  const sorted = [...prs].sort((a, b) => a.exercise_name.localeCompare(b.exercise_name));

  return (
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
            {["Exercise", `Weight PR (${unit})`, "Rep PR", `Volume (${unit})`, "Last PR"].map(
              (h) => (
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
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((pr) => {
            const weightDisplay =
              pr.weight_pr_kg != null ? kgToDisplay(pr.weight_pr_kg, unit) : null;
            const repDisplay =
              pr.rep_pr_reps != null
                ? pr.rep_pr_weight_kg != null
                  ? `${pr.rep_pr_reps} @ ${kgToDisplay(pr.rep_pr_weight_kg, unit)} ${unit}`
                  : `${pr.rep_pr_reps} reps`
                : null;
            const volumeDisplay =
              pr.volume_pr_kg != null
                ? Math.round(kgToDisplay(pr.volume_pr_kg, unit) ?? 0).toLocaleString()
                : null;
            const latestDate =
              (
                [pr.weight_pr_achieved_at, pr.rep_pr_achieved_at, pr.volume_pr_achieved_at].filter(
                  Boolean,
                ) as string[]
              )
                .sort()
                .at(-1) ?? null;
            const isRecent = latestDate
              ? now - new Date(latestDate).getTime() < 30 * 24 * 60 * 60 * 1000
              : false;

            return (
              <tr key={pr.exercise_name} style={{ borderBottom: "1px solid var(--rule-soft)" }}>
                <td
                  style={{
                    padding: "var(--space-2) var(--space-3) var(--space-2) 0",
                    color: "var(--color-text)",
                    fontWeight: 500,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                    {isRecent && (
                      <span style={{ color: "var(--color-amber)", fontSize: 10 }}>🏆</span>
                    )}
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
  );
}
