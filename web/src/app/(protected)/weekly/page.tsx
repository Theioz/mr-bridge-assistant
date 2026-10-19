export const dynamic = "force-dynamic";

import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { todayString, getLast7Days, startOfDayRFC3339, addDays } from "@/lib/timezone";
import { computeScorecard, PROJECTION_WINDOW_DAYS, type Scorecard } from "@/lib/scorecard";
import { computeStreaks } from "@/lib/streaks";
import { getHabitIcon } from "@/lib/habit-icons";
import { weeklyCompletion } from "@/lib/habits/weekly-completion";

export const metadata: Metadata = {
  title: "Weekly",
  description: "Weekly review — habits, workouts, and recovery trends.",
};
import type { HabitRegistry, WorkoutSession, RecoveryMetrics, FitnessLog } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtDayShort(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
  });
}

function avg(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => n != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toString();
}

function deltaText(latest: number | null, prior: number | null, decimals = 1): string {
  if (latest == null || prior == null) return "—";
  const diff = latest - prior;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(decimals)}`;
}

function deltaClass(latest: number | null, prior: number | null, higherIsBetter: boolean): string {
  if (latest == null || prior == null) return "delta-flat";
  const diff = latest - prior;
  if (Math.abs(diff) < 0.0001) return "delta-flat";
  const positive = higherIsBetter ? diff > 0 : diff < 0;
  return positive ? "delta-good" : "delta-bad";
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────

// Every panel on the page is clamped to this height so the 2-column grid reads
// as a uniform set of cells. Overflowing content scrolls inside the panel with
// a bottom fade mask so tall sections (Tasks, Training) don't push the page
// height past short sections (Body composition, Journal).
const PANEL_HEIGHT = 440;

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col" style={{ minWidth: 0, height: PANEL_HEIGHT }}>
      <h2 className="db-section-label" style={{ flexShrink: 0 }}>
        {title}
        {meta && <span className="meta">{meta}</span>}
      </h2>
      <div
        className="scroll-fade-mask"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingBottom: "var(--space-4)",
          paddingRight: "var(--space-2)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

// ── Scorecard ─────────────────────────────────────────────────────────────────

/**
 * The program's week in plain numbers (lib/scorecard.ts — the same definitions as the Sunday
 * push, scripts/_scorecard.py). Its own fetch so it streams alongside the grid; every window is
 * derived from `today`, a user-timezone date string.
 */
async function ScorecardRow({ today }: { today: string }) {
  const supabase = await createClient();
  const start = addDays(today, -6);
  // 28 days covers the landing projection and, inside it, the prior-week weight mean.
  const fitnessStart = addDays(today, -(PROJECTION_WINDOW_DAYS - 1));

  const [profileRes, fitnessRes, sessionsRes, recoveryRes, mealsRes, plansRes] = await Promise.all([
    supabase.from("profile").select("key,value"),
    supabase
      .from("fitness_log")
      .select("date,weight_lb")
      .not("weight_lb", "is", null)
      .gte("date", fitnessStart)
      .lte("date", today),
    // Programmed sessions only: walk pull-ups are logged as strength_sessions with no plan id
    // and would otherwise count as lifting days.
    supabase
      .from("strength_sessions")
      .select("performed_on")
      .not("workout_plan_id", "is", null)
      .gte("performed_on", start)
      .lte("performed_on", today),
    supabase.from("recovery_metrics").select("date,steps").gte("date", start).lte("date", today),
    supabase
      .from("meal_log")
      .select("date,calories,protein_g,standard_drinks,origin")
      .gte("date", start)
      .lte("date", today),
    supabase.from("meal_plans").select("date,is_cheat").gte("date", start).lte("date", today),
  ]);

  const profile: Record<string, string> = {};
  for (const row of (profileRes.data ?? []) as { key: string; value: string }[]) {
    profile[row.key] = row.value;
  }

  const card = computeScorecard({
    today,
    profile,
    fitness: fitnessRes.data ?? [],
    sessions: sessionsRes.data ?? [],
    recovery: recoveryRes.data ?? [],
    meals: mealsRes.data ?? [],
    plans: plansRes.data ?? [],
  });

  return <ScorecardPanels card={card} />;
}

function fmtLimit(value: string, limit: number | null, prefix = "/"): React.ReactNode {
  return (
    <>
      {value}
      {limit != null && (
        <span style={{ color: "var(--color-text-faint)" }}>
          {" "}
          {prefix} {limit}
        </span>
      )}
    </>
  );
}

const scoreLabel: React.CSSProperties = {
  paddingTop: "var(--space-3)",
  paddingBottom: "var(--space-3)",
  borderTop: "1px solid var(--rule-soft)",
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  verticalAlign: "baseline",
};
const scoreValue: React.CSSProperties = {
  ...scoreLabel,
  color: "var(--color-text)",
  textAlign: "right",
  whiteSpace: "nowrap",
};

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <tr>
      <td style={scoreLabel}>{name}</td>
      <td className="tnum" style={scoreValue}>
        {children}
      </td>
    </tr>
  );
}

function ScorecardPanels({ card }: { card: Scorecard }) {
  const breached = new Set(card.breaches);
  const over = (b: Scorecard["breaches"][number]): React.CSSProperties | undefined =>
    breached.has(b) ? { color: "var(--accent)" } : undefined;

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-2"
      style={{
        gap: "var(--space-7)",
        paddingBottom: "var(--space-7)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <Panel title="Scorecard" meta=" · last 7 days">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <tbody>
            <Row name="Weight, 7-day mean">
              {card.weight7 != null ? `${fmtNum(card.weight7, 1)} lb` : "—"}
              {card.delta != null && (
                <span style={{ color: "var(--color-text-faint)" }}>
                  {" "}
                  · {deltaText(card.weight7, card.prev7)} vs prior
                </span>
              )}
            </Row>
            <Row name="Plan line">
              {card.expected != null ? `${fmtNum(card.expected, 1)} lb` : "—"}
            </Row>
            <Row name="Landing at 4-week trend">
              {card.goal == null
                ? "no goal set"
                : card.landing
                  ? `${fmtNum(card.goal, 0)} lb by ${fmtDate(card.landing)}`
                  : card.weight7 != null
                    ? "not trending down"
                    : "—"}
            </Row>
            <Row name="Lifting sessions">
              {fmtLimit(String(card.sessions), card.sessionsTarget)}
            </Row>
            <Row name={`Days at ${card.stepsGoal.toLocaleString()}+ steps`}>
              {fmtLimit(String(card.stepsDays), 7)}
            </Row>
            <Row name="Food days logged">{fmtLimit(String(card.daysLogged), 7)}</Row>
            <Row name="Avg intake, logged days">
              {card.avgKcal != null
                ? `${fmtNum(card.avgKcal)} kcal · ${fmtNum(card.avgProtein)} g protein`
                : "—"}
            </Row>
            <Row name="Cheat meals">{card.cheatMeals}</Row>
            <Row name="Delivery orders">
              {card.deliveryN}
              {card.deliveryN > 0 && (
                <span style={{ color: "var(--color-text-faint)" }}>
                  {" "}
                  · {card.deliveryKcal.toLocaleString()} kcal
                </span>
              )}
            </Row>
          </tbody>
        </table>
      </Panel>

      <Panel
        title="Alcohol"
        meta={card.breaches.length ? ` · over: ${card.breaches.join(", ")}` : undefined}
      >
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <tbody>
            <Row name="Standard drinks">
              <span style={over("weekly cap")}>{fmtLimit(String(card.drinks), card.cap)}</span>
            </Row>
            <Row name="Dry days">
              <span style={over("dry days")}>
                {fmtLimit(String(card.dryDays), card.dryMin, "· min")}
              </span>
            </Row>
            <Row name="Most in one day">
              <span style={over("per occasion")}>
                {fmtLimit(String(card.maxDay), card.perOccasion, "· limit")}
              </span>
            </Row>
            <Row name="Alcohol kcal">{card.alcoholKcal.toLocaleString()}</Row>
            <Row name="Share of food deficit">
              {card.alcoholSharePct != null ? `${fmtNum(card.alcoholSharePct)}%` : "—"}
            </Row>
          </tbody>
        </table>
        <p
          style={{
            marginTop: "var(--space-3)",
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
          }}
        >
          Unlogged days count as dry. Deficit share needs 5+ logged food days; standard drink = 14 g
          ethanol.
        </p>
      </Panel>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

async function WeeklyGrid({
  today,
  weekStart,
  last7Days,
}: {
  today: string;
  weekStart: string;
  last7Days: string[];
}) {
  const supabase = await createClient();

  const [
    habitRegistryRes,
    weekHabitsRes,
    allCompletedRes,
    completedTasksRes,
    activeTasksRes,
    workoutsRes,
    recoveryRes,
    fitnessLatestRes,
    fitnessWeekAgoRes,
    journalCountRes,
  ] = await Promise.all([
    supabase.from("habit_registry").select("id,name,emoji,category,icon_key").eq("active", true),
    supabase
      .from("habits")
      .select("habit_id,date,completed")
      .gte("date", weekStart)
      .lte("date", today),
    supabase
      .from("habits")
      .select("habit_id,date")
      .eq("completed", true)
      .order("date", { ascending: false }),
    supabase
      .from("tasks")
      .select("id,title,priority,completed_at")
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .gte("completed_at", startOfDayRFC3339(weekStart)),
    supabase.from("tasks").select("id,title,priority,status,due_date").eq("status", "active"),
    supabase
      .from("workout_sessions")
      .select("date,activity,duration_mins,calories")
      .gte("date", weekStart)
      .lte("date", today)
      .order("date", { ascending: true }),
    supabase
      .from("recovery_metrics")
      .select("date,readiness,sleep_score,avg_hrv")
      .eq("source", "oura")
      .gte("date", weekStart)
      .lte("date", today)
      .order("date", { ascending: true }),
    // Most recent body comp entry overall
    supabase
      .from("fitness_log")
      .select("date,weight_lb,body_fat_pct")
      .not("body_fat_pct", "is", null)
      .order("date", { ascending: false })
      .limit(1),
    // Closest entry at or before weekStart (i.e. ~7 days ago)
    supabase
      .from("fitness_log")
      .select("date,weight_lb,body_fat_pct")
      .not("body_fat_pct", "is", null)
      .lte("date", weekStart)
      .order("date", { ascending: false })
      .limit(1),
    // Journal count — head:true means we only need the count, not rows
    supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .gte("date", weekStart)
      .lte("date", today),
  ]);

  // ── Habits ────────────────────────────────────────────────────────────────

  const habitRegistry = (habitRegistryRes.data ?? []) as Pick<
    HabitRegistry,
    "id" | "name" | "emoji" | "category" | "icon_key"
  >[];
  const weekHabits = (weekHabitsRes.data ?? []) as {
    habit_id: string;
    date: string;
    completed: boolean;
  }[];
  const allCompleted = (allCompletedRes.data ?? []) as { habit_id: string; date: string }[];
  const habitStreaks = computeStreaks(allCompleted, today);

  // Shared with the /habits Weekly Completion ring — same window, same counting rule (#761).
  const habitWeek = weeklyCompletion(
    habitRegistry.map((h) => h.id),
    weekHabits,
    last7Days,
  );
  const habitCompletedDates = new Map(habitWeek.perHabit.map((h) => [h.habitId, h.dates]));

  const habitSummaries = habitRegistry
    .map((h) => ({
      habit: h,
      hits: habitCompletedDates.get(h.id)?.size ?? 0,
      streak: habitStreaks[h.id]?.current ?? 0,
    }))
    .sort((a, b) => b.hits - a.hits || a.habit.name.localeCompare(b.habit.name));

  const totalPossible = habitWeek.possible;
  const totalHits = habitWeek.completed;
  const habitPct = habitWeek.pct;

  // ── Tasks ─────────────────────────────────────────────────────────────────

  type CompletedTask = {
    id: string;
    title: string;
    priority: string | null;
    completed_at: string | null;
  };
  type ActiveTask = {
    id: string;
    title: string;
    priority: string | null;
    status: string;
    due_date: string | null;
  };

  const completedTasks = (completedTasksRes.data ?? []) as CompletedTask[];
  const activeTasks = (activeTasksRes.data ?? []) as ActiveTask[];
  const overdueTasks = activeTasks.filter((t) => t.due_date != null && t.due_date < today);

  // ── Workouts ──────────────────────────────────────────────────────────────

  const allWorkouts = (workoutsRes.data ?? []) as Pick<
    WorkoutSession,
    "date" | "activity" | "duration_mins" | "calories"
  >[];
  const workouts = allWorkouts.filter((w) => !/walk/i.test(w.activity));
  const walkWorkouts = allWorkouts.filter((w) => /walk/i.test(w.activity));
  const totalDuration = workouts.reduce((s, w) => s + (w.duration_mins ?? 0), 0);
  const totalCalories = workouts.reduce((s, w) => s + (w.calories ?? 0), 0);
  const walkDuration = walkWorkouts.reduce((s, w) => s + (w.duration_mins ?? 0), 0);

  // ── Recovery ─────────────────────────────────────────────────────────────

  const recoveryRows = (recoveryRes.data ?? []) as Pick<
    RecoveryMetrics,
    "date" | "readiness" | "sleep_score" | "avg_hrv"
  >[];
  const avgReadiness = avg(recoveryRows.map((r) => r.readiness));
  const avgSleep = avg(recoveryRows.map((r) => r.sleep_score));
  const avgHrv = avg(recoveryRows.map((r) => r.avg_hrv));
  const recoveryByDate = new Map(recoveryRows.map((r) => [r.date, r]));

  // ── Body composition ──────────────────────────────────────────────────────

  type FitnessPoint = Pick<FitnessLog, "date" | "weight_lb" | "body_fat_pct">;
  const fitnessLatest = ((fitnessLatestRes.data ?? [])[0] ?? null) as FitnessPoint | null;
  const fitnessWeekAgo = ((fitnessWeekAgoRes.data ?? [])[0] ?? null) as FitnessPoint | null;

  const weightDiff =
    fitnessLatest?.weight_lb != null && fitnessWeekAgo?.weight_lb != null
      ? fitnessLatest.weight_lb - fitnessWeekAgo.weight_lb
      : null;
  const bodyFatDiff =
    fitnessLatest?.body_fat_pct != null && fitnessWeekAgo?.body_fat_pct != null
      ? fitnessLatest.body_fat_pct - fitnessWeekAgo.body_fat_pct
      : null;

  // ── Journal ───────────────────────────────────────────────────────────────

  const journalCount = (journalCountRes.count ?? 0) as number;
  const journalMissed = Math.max(0, 7 - journalCount);

  // ── Shared table tokens ──────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    paddingBottom: "var(--space-3)",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-faint)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
  const tdBase: React.CSSProperties = {
    paddingTop: "var(--space-3)",
    paddingBottom: "var(--space-3)",
    borderTop: "1px solid var(--rule-soft)",
    fontSize: "var(--t-micro)",
    color: "var(--color-text)",
    verticalAlign: "baseline",
  };
  const tdMuted: React.CSSProperties = { ...tdBase, color: "var(--color-text-muted)" };
  const tdFaint: React.CSSProperties = { ...tdBase, color: "var(--color-text-faint)" };

  // Training meta
  const trainingMeta =
    allWorkouts.length === 0
      ? " · none logged"
      : ` · ${workouts.length} session${workouts.length === 1 ? "" : "s"}${
          totalDuration > 0 ? ` · ${fmtDuration(totalDuration)}` : ""
        }${totalCalories > 0 ? ` · ${Math.round(totalCalories).toLocaleString()} kcal` : ""}`;

  const recoveryMeta =
    recoveryRows.length === 0
      ? " · no data"
      : ` · ${recoveryRows.length} day${recoveryRows.length === 1 ? "" : "s"}${
          avgReadiness != null ? ` · readiness ${fmtNum(avgReadiness)}` : ""
        }${avgSleep != null ? ` · sleep ${fmtNum(avgSleep)}` : ""}${
          avgHrv != null ? ` · HRV ${fmtNum(avgHrv)}ms` : ""
        }`;

  const rowStyle: React.CSSProperties = {
    gap: "var(--space-7)",
    paddingBottom: "var(--space-7)",
    borderBottom: "1px solid var(--rule-soft)",
  };
  const rowStyleLast: React.CSSProperties = { gap: "var(--space-7)" };

  return (
    <>
      {/* ── Row 1: Habits + Tasks ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={rowStyle}>
        <Panel
          title="Habits"
          meta={
            habitRegistry.length === 0
              ? " · none active"
              : ` · ${totalHits}/${totalPossible} · ${habitPct}%`
          }
        >
          {habitRegistry.length === 0 ? (
            <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>
              No active habits.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Habit</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Mon–Sun</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Hits</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {habitSummaries.map(({ habit, hits, streak }) => {
                    const completed = habitCompletedDates.get(habit.id) ?? new Set<string>();
                    const Icon = getHabitIcon(habit);
                    return (
                      <tr key={habit.id}>
                        <td style={{ ...tdBase, fontWeight: 500 }}>
                          <span
                            className="inline-flex items-center"
                            style={{ gap: "var(--space-2)" }}
                          >
                            <Icon
                              className="w-3.5 h-3.5"
                              style={{ color: "var(--color-text-faint)" }}
                              aria-hidden
                            />
                            <span className="truncate">{habit.name}</span>
                          </span>
                        </td>
                        <td style={{ ...tdBase, textAlign: "center" }}>
                          <span
                            className="inline-flex"
                            style={{ gap: 4 }}
                            aria-label={`${hits} of 7 days completed`}
                          >
                            {last7Days.map((d) => {
                              const hit = completed.has(d);
                              const isToday = d === today;
                              return (
                                <span
                                  key={d}
                                  title={`${fmtDate(d)}: ${hit ? "done" : "missed"}`}
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: 3,
                                    background: hit ? "var(--color-text)" : "var(--rule)",
                                    opacity: hit ? 0.85 : 1,
                                    outline: isToday ? "1.5px solid var(--accent)" : "none",
                                    outlineOffset: isToday ? 2 : 0,
                                    display: "inline-block",
                                  }}
                                />
                              );
                            })}
                          </span>
                        </td>
                        <td
                          className="tnum"
                          style={{ ...tdMuted, textAlign: "right", whiteSpace: "nowrap" }}
                        >
                          {hits}/7
                        </td>
                        <td
                          className="tnum"
                          style={{ ...tdFaint, textAlign: "right", whiteSpace: "nowrap" }}
                        >
                          {streak > 0 ? `${streak}d` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Tasks"
          meta={` · ${completedTasks.length} done · ${activeTasks.length} active${
            overdueTasks.length > 0 ? ` · ${overdueTasks.length} overdue` : ""
          }`}
        >
          {completedTasks.length === 0 && activeTasks.length === 0 ? (
            <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>
              Inbox clear.
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
              {completedTasks.length > 0 && (
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--color-text-faint)",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    Closed this week
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {completedTasks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-baseline"
                        style={{
                          gap: "var(--space-3)",
                          padding: "var(--space-3) 0",
                          borderTop: "1px solid var(--rule-soft)",
                          fontSize: "var(--t-micro)",
                        }}
                      >
                        <span style={{ color: "var(--color-positive)", flexShrink: 0 }} aria-hidden>
                          ✓
                        </span>
                        <span
                          className="flex-1 truncate"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {t.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeTasks.length > 0 && (
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--color-text-faint)",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    Still active
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {activeTasks.map((t) => {
                      const overdue = t.due_date != null && t.due_date < today;
                      return (
                        <li
                          key={t.id}
                          className="flex items-baseline"
                          style={{
                            gap: "var(--space-3)",
                            padding: "var(--space-3) 0",
                            borderTop: "1px solid var(--rule-soft)",
                            fontSize: "var(--t-micro)",
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 999,
                              background: overdue ? "var(--accent)" : "var(--rule)",
                              flexShrink: 0,
                              marginTop: 6,
                            }}
                          />
                          <span
                            className="flex-1 truncate"
                            style={{
                              color: overdue ? "var(--color-text)" : "var(--color-text-muted)",
                            }}
                          >
                            {t.title}
                          </span>
                          {t.due_date && (
                            <span
                              className="tnum"
                              style={{
                                fontSize: "var(--t-micro)",
                                color: overdue ? "var(--accent)" : "var(--color-text-faint)",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                              }}
                            >
                              {fmtDate(t.due_date)}
                              {overdue ? " · overdue" : ""}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Row 2: Training + Recovery ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={rowStyle}>
        <Panel title="Training" meta={trainingMeta}>
          {allWorkouts.length === 0 ? (
            <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>
              No sessions logged this week.
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
              {workouts.length > 0 && (
                <table
                  className="w-full"
                  style={{ borderCollapse: "collapse", tableLayout: "auto" }}
                >
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: "5.5rem" }}>Date</th>
                      <th style={thStyle}>Activity</th>
                      <th style={{ ...thStyle, textAlign: "right", width: "3.5rem" }}>Dur</th>
                      <th style={{ ...thStyle, textAlign: "right", width: "4.5rem" }}>Cal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workouts.map((w, i) => (
                      <tr key={i}>
                        <td className="tnum" style={tdMuted}>
                          {fmtDate(w.date)}
                        </td>
                        <td
                          style={{
                            ...tdBase,
                            textTransform: "capitalize",
                            wordBreak: "break-word",
                          }}
                        >
                          {w.activity}
                        </td>
                        <td className="tnum" style={{ ...tdMuted, textAlign: "right" }}>
                          {w.duration_mins != null ? `${w.duration_mins}m` : "—"}
                        </td>
                        <td className="tnum" style={{ ...tdMuted, textAlign: "right" }}>
                          {w.calories != null ? Math.round(w.calories).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {walkWorkouts.length > 0 && (
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--color-text-faint)",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    Walks · {walkWorkouts.length}
                    {walkDuration > 0 ? ` · ${fmtDuration(walkDuration)}` : ""}
                  </p>
                  <table
                    className="w-full"
                    style={{ borderCollapse: "collapse", tableLayout: "auto" }}
                  >
                    <tbody>
                      {walkWorkouts.map((w, i) => (
                        <tr key={i}>
                          <td className="tnum" style={{ ...tdFaint, width: "5.5rem" }}>
                            {fmtDate(w.date)}
                          </td>
                          <td
                            style={{
                              ...tdMuted,
                              textTransform: "capitalize",
                              wordBreak: "break-word",
                            }}
                          >
                            {w.activity}
                          </td>
                          <td
                            className="tnum"
                            style={{ ...tdFaint, textAlign: "right", width: "3.5rem" }}
                          >
                            {w.duration_mins != null ? `${w.duration_mins}m` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Recovery" meta={recoveryMeta}>
          {recoveryRows.length === 0 ? (
            <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>
              No recovery data for this week.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Day</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Readiness</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Sleep</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>HRV</th>
                  </tr>
                </thead>
                <tbody>
                  {last7Days.map((d) => {
                    const r = recoveryByDate.get(d);
                    const isToday = d === today;
                    return (
                      <tr key={d}>
                        <td
                          className="tnum"
                          style={{
                            ...tdMuted,
                            color: isToday ? "var(--color-text)" : "var(--color-text-muted)",
                            fontWeight: isToday ? 500 : 400,
                          }}
                        >
                          {fmtDayShort(d)} {fmtDate(d)}
                          {isToday && (
                            <span
                              className="tnum"
                              style={{
                                marginLeft: "var(--space-2)",
                                fontSize: 10,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--accent)",
                              }}
                            >
                              Today
                            </span>
                          )}
                        </td>
                        <td
                          className="tnum"
                          style={{
                            ...tdBase,
                            textAlign: "right",
                            color:
                              r?.readiness != null
                                ? "var(--color-text)"
                                : "var(--color-text-faint)",
                          }}
                        >
                          {r?.readiness != null ? r.readiness : "—"}
                        </td>
                        <td
                          className="tnum"
                          style={{
                            ...tdBase,
                            textAlign: "right",
                            color:
                              r?.sleep_score != null
                                ? "var(--color-text)"
                                : "var(--color-text-faint)",
                          }}
                        >
                          {r?.sleep_score != null ? r.sleep_score : "—"}
                        </td>
                        <td
                          className="tnum"
                          style={{
                            ...tdBase,
                            textAlign: "right",
                            color:
                              r?.avg_hrv != null ? "var(--color-text)" : "var(--color-text-faint)",
                          }}
                        >
                          {r?.avg_hrv != null ? Math.round(r.avg_hrv) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Row 3: Body composition + Journal ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={rowStyleLast}>
        <Panel
          title="Body composition"
          meta={fitnessLatest ? ` · ${fmtDate(fitnessLatest.date)}` : " · no data"}
        >
          {fitnessLatest == null ? (
            <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>
              No body composition data.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Metric</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Latest</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Prior</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ ...tdBase, fontWeight: 500 }}>Weight</td>
                      <td className="tnum" style={{ ...tdBase, textAlign: "right" }}>
                        {fmtNum(fitnessLatest.weight_lb, 1)}{" "}
                        <span style={{ color: "var(--color-text-faint)" }}>lb</span>
                      </td>
                      <td className="tnum" style={{ ...tdFaint, textAlign: "right" }}>
                        {fitnessWeekAgo?.weight_lb != null
                          ? `${fmtNum(fitnessWeekAgo.weight_lb, 1)} lb`
                          : "—"}
                      </td>
                      <td
                        className={`tnum ${deltaClass(
                          fitnessLatest.weight_lb ?? null,
                          fitnessWeekAgo?.weight_lb ?? null,
                          false,
                        )}`}
                        style={{ ...tdBase, textAlign: "right" }}
                      >
                        {deltaText(
                          fitnessLatest.weight_lb ?? null,
                          fitnessWeekAgo?.weight_lb ?? null,
                        )}
                        {weightDiff != null ? " lb" : ""}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ ...tdBase, fontWeight: 500 }}>Body fat</td>
                      <td className="tnum" style={{ ...tdBase, textAlign: "right" }}>
                        {fmtNum(fitnessLatest.body_fat_pct, 1)}{" "}
                        <span style={{ color: "var(--color-text-faint)" }}>%</span>
                      </td>
                      <td className="tnum" style={{ ...tdFaint, textAlign: "right" }}>
                        {fitnessWeekAgo?.body_fat_pct != null
                          ? `${fmtNum(fitnessWeekAgo.body_fat_pct, 1)}%`
                          : "—"}
                      </td>
                      <td
                        className={`tnum ${deltaClass(
                          fitnessLatest.body_fat_pct ?? null,
                          fitnessWeekAgo?.body_fat_pct ?? null,
                          false,
                        )}`}
                        style={{ ...tdBase, textAlign: "right" }}
                      >
                        {deltaText(
                          fitnessLatest.body_fat_pct ?? null,
                          fitnessWeekAgo?.body_fat_pct ?? null,
                        )}
                        {bodyFatDiff != null ? "%" : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {fitnessWeekAgo && (
                <p
                  className="tnum"
                  style={{
                    marginTop: "var(--space-3)",
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-faint)",
                  }}
                >
                  Prior measurement · {fmtDate(fitnessWeekAgo.date)}
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel
          title="Journal"
          meta={` · ${journalCount} entr${journalCount === 1 ? "y" : "ies"}${
            journalMissed > 0 ? ` · ${journalMissed} missed` : ""
          }`}
        >
          <div className="flex items-baseline" style={{ gap: "var(--space-4)" }}>
            <span
              className="tnum font-heading"
              style={{
                fontSize: 52,
                lineHeight: 1,
                fontWeight: 600,
                color: journalCount > 0 ? "var(--color-text)" : "var(--color-text-faint)",
                letterSpacing: "-0.02em",
              }}
            >
              {journalCount}
            </span>
            <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
              <p
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                }}
              >
                {journalCount === 7
                  ? "Full week of entries."
                  : journalCount >= 5
                    ? "Strong consistency."
                    : journalCount >= 3
                      ? "Halfway there."
                      : journalCount > 0
                        ? "Room to build."
                        : "Nothing logged."}
              </p>
              <p
                className="tnum"
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-faint)",
                }}
              >
                {journalMissed} day{journalMissed !== 1 ? "s" : ""} without a note
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

export default async function WeeklyPage() {
  const today = todayString();
  // One list of user-timezone dates drives the label, every query and the habit maths, the
  // same list /habits uses (#761).
  const last7Days = getLast7Days();
  const weekStart = last7Days[0];
  const rangeLabel = `${fmtDate(weekStart)} – ${fmtDate(today)}`;

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
      <header>
        <h1
          className="font-heading"
          style={{
            fontSize: "var(--t-h1)",
            fontWeight: 600,
            color: "var(--color-text)",
            letterSpacing: "-0.02em",
          }}
        >
          Weekly Review
        </h1>
        <p
          className="tnum"
          style={{
            marginTop: "var(--space-1)",
            fontSize: "var(--t-micro)",
            letterSpacing: "0.04em",
            color: "var(--color-text-muted)",
          }}
        >
          {rangeLabel}
        </p>
      </header>
      <Suspense fallback={<div style={{ minHeight: 1320 }} />}>
        <ScorecardRow today={today} />
        <WeeklyGrid today={today} weekStart={weekStart} last7Days={last7Days} />
      </Suspense>
    </div>
  );
}
