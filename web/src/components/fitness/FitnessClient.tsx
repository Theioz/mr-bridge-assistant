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
type Tab = "overview" | "workouts" | "records";

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="db-section-label" style={{ flexShrink: 0 }}>
      {children}
    </h2>
  );
}

const sectionStyle: React.CSSProperties = {
  paddingBottom: "var(--space-7)",
  borderBottom: "1px solid var(--rule-soft)",
};

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
  const [activeTab, setActiveTab] = useState<Tab>("overview");

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

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "workouts", label: "This Week's Workouts" },
    { id: "records", label: "Records" },
  ];

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
      {/* ── Tab bar ── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--rule-soft)",
          gap: 0,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: "none",
              border: "none",
              borderBottom:
                activeTab === tab.id ? "2px solid var(--color-amber)" : "2px solid transparent",
              marginBottom: "-1px",
              padding: "var(--space-3) var(--space-5)",
              fontSize: "var(--t-small)",
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "var(--color-text)" : "var(--color-text-faint)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ Overview tab ══ */}
      {activeTab === "overview" && (
        <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
          {/* Body Composition — full-width */}
          <section className="flex flex-col" style={{ ...sectionStyle, gap: "var(--space-3)" }}>
            <SectionLabel>Body Composition</SectionLabel>
            <BodyCompTrends
              data={fitnessData}
              windowKey={windowKey}
              weightGoal={weightGoal}
              bodyFatGoal={bodyFatGoal}
            />
          </section>

          {/* Activity — full-width */}
          <section className="flex flex-col" style={{ ...sectionStyle, gap: "var(--space-3)" }}>
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

          {/* Recovery — full-width */}
          <section className="flex flex-col" style={{ ...sectionStyle, gap: "var(--space-3)" }}>
            <SectionLabel>Recovery</SectionLabel>
            <RecoveryTrends trends={recoveryAll} />
          </section>

          {/* Recent Sessions */}
          {recentSessions.length > 0 && (
            <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
              <SectionLabel>Recent Sessions</SectionLabel>
              <RecentSessionsList sessions={recentSessions} unit={weightUnit} />
            </section>
          )}
        </div>
      )}

      {/* ══ This Week's Workouts tab ══ */}
      {activeTab === "workouts" && (
        <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
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
      )}

      {/* ══ Records tab ══ */}
      {activeTab === "records" && (
        <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
          {/* Personal Records */}
          <section className="flex flex-col" style={{ ...sectionStyle, gap: "var(--space-3)" }}>
            <SectionLabel>Personal Records</SectionLabel>
            {exercisePRs.length > 0 ? (
              <PersonalRecords prs={exercisePRs} unit={weightUnit} />
            ) : (
              <p
                style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)", margin: 0 }}
              >
                No PRs logged yet.
              </p>
            )}
          </section>

          {/* Top Exercises */}
          {topExercises.length > 0 && (
            <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
              <SectionLabel>Top Exercises</SectionLabel>
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
