export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { todayString, daysAgoString, getLast7Days } from "@/lib/timezone";
import { computeStreaks } from "@/lib/streaks";
import type { HabitRegistry, Task, WorkoutSession, RecoveryMetrics, FitnessLog } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
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

function delta(a: number | null, b: number | null, decimals = 1): string {
  if (a == null || b == null) return "—";
  const diff = a - b;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(decimals)}`;
}

function deltaColor(diff: number | null, higherIsBetter = false): string {
  if (diff == null) return "var(--color-text-muted)";
  if (diff === 0) return "var(--color-text-muted)";
  const positive = higherIsBetter ? diff > 0 : diff < 0;
  return positive ? "var(--color-positive)" : "var(--color-danger)";
}

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-text-muted)";
  if (score >= 80) return "var(--color-positive)";
  if (score >= 60) return "var(--color-warning)";
  return "var(--color-danger)";
}

// ── Section card wrapper ──────────────────────────────────────────────────────

function Card({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {accent && <div style={{ height: 3, background: accent, flexShrink: 0 }} />}
      <div className="p-5 flex flex-col gap-4 flex-1">
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
        >
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

// ── Habit pill strip ──────────────────────────────────────────────────────────

function PillStrip({
  days,
  completedSet,
}: {
  days: string[];
  completedSet: Set<string>;
}) {
  return (
    <div className="flex gap-1">
      {days.map((d) => {
        const hit = completedSet.has(d);
        return (
          <div
            key={d}
            title={`${fmtDate(d)}: ${hit ? "done" : "missed"}`}
            style={{
              width: 24,
              height: 8,
              borderRadius: 4,
              background: hit ? "var(--color-positive)" : "var(--color-surface-raised)",
              border: `1px solid ${hit ? "var(--color-positive)" : "var(--color-border)"}`,
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function WeeklyPage() {
  const supabase = await createClient();
  const today = todayString();
  const weekStart = daysAgoString(6); // inclusive: 7 days ending today
  const last7Days = getLast7Days();   // [oldest, ..., today]

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
    supabase.from("habit_registry").select("id,name,emoji").eq("active", true),
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
      .gte("completed_at", `${weekStart}T00:00:00`),
    supabase
      .from("tasks")
      .select("id,title,priority,status,due_date")
      .eq("status", "active"),
    supabase
      .from("workout_sessions")
      .select("date,activity,duration_mins,calories")
      .gte("date", weekStart)
      .lte("date", today)
      .order("date", { ascending: true }),
    supabase
      .from("recovery_metrics")
      .select("date,readiness,sleep_score,avg_hrv")
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

  const habitRegistry = (habitRegistryRes.data ?? []) as Pick<HabitRegistry, "id" | "name" | "emoji">[];
  const weekHabits    = (weekHabitsRes.data ?? []) as { habit_id: string; date: string; completed: boolean }[];
  const allCompleted  = (allCompletedRes.data ?? []) as { habit_id: string; date: string }[];
  const habitStreaks  = computeStreaks(allCompleted, today);

  // Per-habit: set of completed dates this week
  const habitCompletedDates = new Map<string, Set<string>>();
  for (const { habit_id, date, completed } of weekHabits) {
    if (!completed) continue;
    if (!habitCompletedDates.has(habit_id)) habitCompletedDates.set(habit_id, new Set());
    habitCompletedDates.get(habit_id)!.add(date);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  type CompletedTask = { id: string; title: string; priority: string | null; completed_at: string | null };
  type ActiveTask = { id: string; title: string; priority: string | null; status: string; due_date: string | null };

  const completedTasks = (completedTasksRes.data ?? []) as CompletedTask[];
  const activeTasks    = (activeTasksRes.data ?? []) as ActiveTask[];
  const overdueTasks   = activeTasks.filter((t) => t.due_date != null && t.due_date < today);

  // ── Workouts ──────────────────────────────────────────────────────────────

  const workouts = (workoutsRes.data ?? []) as Pick<WorkoutSession, "date" | "activity" | "duration_mins" | "calories">[];
  const totalDuration = workouts.reduce((s, w) => s + (w.duration_mins ?? 0), 0);
  const totalCalories = workouts.reduce((s, w) => s + (w.calories ?? 0), 0);

  // ── Recovery ─────────────────────────────────────────────────────────────

  const recoveryRows = (recoveryRes.data ?? []) as Pick<RecoveryMetrics, "date" | "readiness" | "sleep_score" | "avg_hrv">[];
  const avgReadiness  = avg(recoveryRows.map((r) => r.readiness));
  const avgSleep      = avg(recoveryRows.map((r) => r.sleep_score));
  const avgHrv        = avg(recoveryRows.map((r) => r.avg_hrv));

  // ── Body composition ──────────────────────────────────────────────────────

  type FitnessPoint = Pick<FitnessLog, "date" | "weight_lb" | "body_fat_pct">;
  const fitnessLatest  = ((fitnessLatestRes.data ?? [])[0] ?? null) as FitnessPoint | null;
  const fitnessWeekAgo = ((fitnessWeekAgoRes.data ?? [])[0] ?? null) as FitnessPoint | null;

  const weightDiff   = fitnessLatest?.weight_lb != null && fitnessWeekAgo?.weight_lb != null
    ? fitnessLatest.weight_lb - fitnessWeekAgo.weight_lb : null;
  const bodyFatDiff  = fitnessLatest?.body_fat_pct != null && fitnessWeekAgo?.body_fat_pct != null
    ? fitnessLatest.body_fat_pct - fitnessWeekAgo.body_fat_pct : null;

  // ── Journal ───────────────────────────────────────────────────────────────

  const journalCount = (journalCountRes.count ?? 0) as number;

  // ── Date range label ──────────────────────────────────────────────────────

  const rangeLabel = `${fmtDate(weekStart)} – ${fmtDate(today)}`;

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div>
        <h1
          className="font-heading font-semibold text-2xl"
          style={{ color: "var(--color-text)" }}
        >
          Weekly Review
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          {rangeLabel}
        </p>
      </div>

      {/* ── Row 1: Habits + Tasks ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Habits */}
        <Card title="Habit Completion" accent="var(--color-primary)">
          {habitRegistry.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-faint)" }}>No active habits.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {habitRegistry.map((habit) => {
                const completedSet = habitCompletedDates.get(habit.id) ?? new Set<string>();
                const hitCount = completedSet.size;
                const streak = habitStreaks[habit.id]?.current ?? 0;
                return (
                  <div key={habit.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {habit.emoji ? `${habit.emoji} ` : ""}{habit.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-xs font-semibold tabular-nums"
                          style={{ color: hitCount >= 6 ? "var(--color-positive)" : hitCount >= 4 ? "var(--color-warning)" : "var(--color-danger)" }}
                        >
                          {hitCount}/7
                        </span>
                        {streak > 0 && (
                          <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                            {streak}d streak
                          </span>
                        )}
                      </div>
                    </div>
                    <PillStrip days={last7Days} completedSet={completedSet} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Tasks */}
        <Card title="Tasks" accent="var(--color-warning)">
          <div className="flex flex-col gap-4">

            {/* Completed this week */}
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
                Completed — {completedTasks.length}
              </p>
              {completedTasks.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-faint)" }}>None this week.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {completedTasks.slice(0, 8).map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <span style={{ color: "var(--color-positive)", fontSize: 12, flexShrink: 0 }}>✓</span>
                      <span className="text-sm truncate" style={{ color: "var(--color-text-muted)" }}>{t.title}</span>
                    </div>
                  ))}
                  {completedTasks.length > 8 && (
                    <p className="text-xs" style={{ color: "var(--color-text-faint)" }}>
                      +{completedTasks.length - 8} more
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Active tasks */}
            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
                Still Active — {activeTasks.length}
              </p>
              {activeTasks.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-text-faint)" }}>Inbox clear.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {activeTasks.slice(0, 5).map((t) => {
                    const overdue = t.due_date != null && t.due_date < today;
                    return (
                      <div key={t.id} className="flex items-center gap-2">
                        {overdue && (
                          <span style={{ color: "var(--color-danger)", fontSize: 10, flexShrink: 0 }}>!</span>
                        )}
                        <span
                          className="text-sm truncate"
                          style={{ color: overdue ? "var(--color-danger)" : "var(--color-text)" }}
                        >
                          {t.title}
                        </span>
                        {t.due_date && (
                          <span className="text-xs shrink-0 ml-auto" style={{ color: overdue ? "var(--color-danger)" : "var(--color-text-muted)" }}>
                            {fmtDate(t.due_date)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {activeTasks.length > 5 && (
                    <p className="text-xs" style={{ color: "var(--color-text-faint)" }}>
                      +{activeTasks.length - 5} more
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Overdue callout */}
            {overdueTasks.length > 0 && (
              <div
                className="rounded-lg px-3 py-2"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <p className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
                  {overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Row 2: Workouts + Recovery ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Workouts */}
        <Card title="Workouts" accent="var(--color-info)">
          {workouts.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-faint)" }}>No sessions logged this week.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Sessions", value: workouts.length.toString() },
                  { label: "Total Time", value: totalDuration > 0 ? `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m` : "—" },
                  { label: "Calories", value: totalCalories > 0 ? `${Math.round(totalCalories).toLocaleString()} kcal` : "—" },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg p-3 text-center"
                    style={{ background: "var(--color-surface-raised)" }}
                  >
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</p>
                    <p className="font-heading font-semibold text-lg mt-0.5" style={{ color: "var(--color-text)" }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Session list */}
              <div className="flex flex-col gap-1">
                {workouts.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span style={{ color: "var(--color-text-muted)", width: "3.5rem", flexShrink: 0, fontSize: 11 }}>
                      {fmtDate(w.date)}
                    </span>
                    <span className="flex-1 truncate" style={{ color: "var(--color-text)" }}>{w.activity}</span>
                    {w.duration_mins != null && (
                      <span className="tabular-nums shrink-0 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {w.duration_mins}m
                      </span>
                    )}
                    {w.calories != null && (
                      <span className="tabular-nums shrink-0 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {Math.round(w.calories)} kcal
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Recovery */}
        <Card title="Recovery Averages" accent={scoreColor(avgReadiness)}>
          {recoveryRows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-faint)" }}>No recovery data for this week.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Big scores */}
              <div className="flex items-end gap-6 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                    Avg Readiness
                  </p>
                  <span
                    className="font-heading font-bold leading-none"
                    style={{ fontSize: 48, color: scoreColor(avgReadiness) }}
                  >
                    {fmtNum(avgReadiness)}
                  </span>
                </div>
                <div className="pb-1">
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                    Avg Sleep
                  </p>
                  <span
                    className="font-heading font-bold leading-none"
                    style={{ fontSize: 36, color: scoreColor(avgSleep) }}
                  >
                    {fmtNum(avgSleep)}
                  </span>
                </div>
                <div className="pb-1">
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                    Avg HRV
                  </p>
                  <span
                    className="font-heading font-bold leading-none"
                    style={{ fontSize: 36, color: "var(--color-info)" }}
                  >
                    {fmtNum(avgHrv)}
                    {avgHrv != null && <span className="text-sm font-normal ml-1" style={{ color: "var(--color-text-muted)" }}>ms</span>}
                  </span>
                </div>
                <div className="ml-auto pb-1 text-right">
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {recoveryRows.length} day{recoveryRows.length !== 1 ? "s" : ""} of data
                  </p>
                </div>
              </div>

              {/* Per-day readiness pills */}
              <div>
                <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>Readiness by day</p>
                <div className="flex gap-2 flex-wrap">
                  {last7Days.map((d) => {
                    const row = recoveryRows.find((r) => r.date === d);
                    return (
                      <div
                        key={d}
                        title={`${fmtDate(d)}: ${row?.readiness != null ? `Readiness ${row.readiness}` : "no data"}`}
                        className="flex flex-col items-center gap-0.5"
                      >
                        <span
                          className="tabular-nums text-xs font-medium"
                          style={{ color: row?.readiness != null ? scoreColor(row.readiness) : "var(--color-text-faint)" }}
                        >
                          {row?.readiness != null ? row.readiness : "—"}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--color-text-faint)" }}>
                          {fmtDate(d).replace(/[A-Za-z]+ /, "")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 3: Body Composition + Journal ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Body Composition */}
        <Card title="Body Composition" accent="var(--color-positive)">
          {fitnessLatest == null ? (
            <p className="text-sm" style={{ color: "var(--color-text-faint)" }}>No body composition data.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Weight */}
                <div
                  className="rounded-lg p-4"
                  style={{ background: "var(--color-surface-raised)" }}
                >
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Weight</p>
                  <p className="font-heading font-bold text-2xl mt-1" style={{ color: "var(--color-text)" }}>
                    {fmtNum(fitnessLatest.weight_lb, 1)}
                    <span className="text-sm font-normal ml-1" style={{ color: "var(--color-text-muted)" }}>lb</span>
                  </p>
                  {weightDiff != null && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: deltaColor(weightDiff, false) }}
                    >
                      {delta(fitnessLatest.weight_lb, fitnessWeekAgo?.weight_lb ?? null)} lb vs {fmtDate(fitnessWeekAgo!.date)}
                    </p>
                  )}
                </div>

                {/* Body Fat */}
                <div
                  className="rounded-lg p-4"
                  style={{ background: "var(--color-surface-raised)" }}
                >
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Body Fat</p>
                  <p className="font-heading font-bold text-2xl mt-1" style={{ color: "var(--color-text)" }}>
                    {fmtNum(fitnessLatest.body_fat_pct, 1)}
                    <span className="text-sm font-normal ml-1" style={{ color: "var(--color-text-muted)" }}>%</span>
                  </p>
                  {bodyFatDiff != null && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: deltaColor(bodyFatDiff, false) }}
                    >
                      {delta(fitnessLatest.body_fat_pct, fitnessWeekAgo?.body_fat_pct ?? null)}% vs {fmtDate(fitnessWeekAgo!.date)}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-xs" style={{ color: "var(--color-text-faint)" }}>
                Last measurement: {fmtDate(fitnessLatest.date)}
              </p>
            </div>
          )}
        </Card>

        {/* Journal */}
        <Card title="Journal" accent="var(--color-primary)">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div
                className="rounded-xl p-5 text-center flex-1"
                style={{ background: "var(--color-surface-raised)" }}
              >
                <p
                  className="font-heading font-bold leading-none"
                  style={{ fontSize: 52, color: journalCount > 0 ? "var(--color-primary)" : "var(--color-text-faint)" }}
                >
                  {journalCount}
                </p>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  entr{journalCount === 1 ? "y" : "ies"} this week
                </p>
              </div>

              <div className="flex flex-col gap-1 text-sm">
                <p style={{ color: "var(--color-text)" }}>
                  {journalCount === 7
                    ? "Perfect week."
                    : journalCount >= 5
                    ? "Strong consistency."
                    : journalCount >= 3
                    ? "Halfway there."
                    : journalCount > 0
                    ? "Room to build."
                    : "Nothing logged."}
                </p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {7 - journalCount} day{7 - journalCount !== 1 ? "s" : ""} missed
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

    </div>
  );
}
