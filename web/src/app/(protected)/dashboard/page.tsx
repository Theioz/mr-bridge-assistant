export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { collapseSeriesOccurrences } from "@/lib/tasks/collapse";
import { BLOCKER_EMBED, partitionBlocked } from "@/lib/tasks/blockers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Daily check-in — food, workout, habits, health, schedule, tasks, markets.",
};
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { todayString, daysAgoString, USER_TZ } from "@/lib/timezone";
import { computeStreaks } from "@/lib/streaks";
import { getWindow } from "@/lib/window";
import DashboardMasthead from "@/components/dashboard/dashboard-masthead";
import DashboardGreeting from "@/components/dashboard/dashboard-greeting";
import DashboardBriefing from "@/components/dashboard/dashboard-briefing";
import {
  LazyBodyFitnessSummary as BodyFitnessSummary,
  LazyHealthBreakdown as HealthBreakdown,
} from "@/components/dashboard/lazy-chart-widgets";
import TodayScoresStrip from "@/components/dashboard/today-scores-strip";
import HabitsCheckin from "@/components/dashboard/habits-checkin";
import UpcomingBirthdayWidget from "@/components/dashboard/upcoming-birthday";
import ScheduleToday from "@/components/dashboard/schedule-today";
import TasksSummary from "@/components/dashboard/tasks-summary";
import { WatchlistWidget } from "@/components/dashboard/watchlist-widget";
import { SportsCard } from "@/components/dashboard/sports-card";
import { WindowSelector } from "@/components/ui/window-selector";
import ReentryCard, { REENTRY_DISMISS_COOKIE } from "@/components/dashboard/reentry-card";
import TravelNote from "@/components/dashboard/travel-note";
import TodayFood from "@/components/dashboard/today-food";
import TodayWorkout, { type TodayWorkoutPlan } from "@/components/dashboard/today-workout";
import type { KitchenPlannedMeal } from "@/components/meals/KitchenPanel";
import {
  MACRO_GOAL_KEYS,
  macroGoalsFromProfile,
  sumMacroTotals,
  type MacroRow,
} from "@/lib/nutrition/daily-macros";
import { MEAL_PLAN_SELECT, pickNextPlannedMeal } from "@/lib/nutrition/next-meal";
import { getHandLoggingSignal } from "@/lib/reentry-query";
import { getCurrentStay } from "@/lib/travel/current-stay";
import { stayCity } from "@/lib/travel/stay";
import { syncStocks } from "@/lib/sync/stocks";
import { syncSports, type SportsFavorite } from "@/lib/sync/sports";
import type {
  HabitLog,
  HabitRegistry,
  RecoveryMetrics,
  Task,
  StocksCache,
  SportsCache,
} from "@/lib/types";

async function refreshStocks(): Promise<{ rateLimited: boolean }> {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rateLimited: false };

  const { data: profileRow } = await supabase
    .from("profile")
    .select("value")
    .eq("user_id", user.id)
    .eq("key", "stock_watchlist")
    .single();

  const tickers: string[] = profileRow?.value ? (JSON.parse(profileRow.value) as string[]) : [];

  let rateLimited = false;
  if (tickers.length > 0) {
    const result = await syncStocks(supabase, user.id, tickers);
    rateLimited = !!result.rateLimited;
  }

  revalidatePath("/dashboard");
  return { rateLimited };
}

async function refreshSports() {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profileRow } = await supabase
    .from("profile")
    .select("value")
    .eq("user_id", user.id)
    .eq("key", "sports_favorites")
    .single();

  const favorites: SportsFavorite[] = profileRow?.value
    ? (JSON.parse(profileRow.value) as SportsFavorite[])
    : [];

  if (favorites.length > 0) {
    await syncSports(supabase, user.id, favorites);
  }

  revalidatePath("/dashboard");
}

async function toggleHabit(habitId: string, date: string, completed: boolean) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("habits")
    .upsert(
      { user_id: user.id, habit_id: habitId, date, completed },
      { onConflict: "habit_id,date" },
    );
  revalidatePath("/dashboard");
  revalidatePath("/habits");
  revalidatePath("/weekly");
}

export default async function DashboardPage() {
  const today = todayString();
  const [supabase, { key: windowKey, days }] = await Promise.all([createClient(), getWindow()]);

  const [
    fitnessTrendRes,
    recoveryLatestRes,
    recoveryTrendsRes,
    habitRegistryRes,
    todayHabitsRes,
    allCompletedRes,
    profileRes,
    tasksRes,
    stocksRes,
    sportsRes,
    sportsFavoritesRes,
    todayPlansRes,
    todayMealLogRes,
    todayWorkoutRes,
    handLogging,
    stay,
    cookieStore,
  ] = await Promise.all([
    // Windowed weight + body fat trend
    supabase
      .from("fitness_log")
      .select("date,weight_lb,body_fat_pct")
      .gte("date", daysAgoString(days - 1))
      .order("date", { ascending: true }),
    // The ONE recovery row the whole page reads: the most recent one, today included.
    // This used to be two queries — the latest row capped to `date < today` for Health
    // Breakdown, and today's row for the strip above it — so on any morning after the sync
    // the page showed two readiness scores from two different days with two different
    // recommendations (#761). Oura finalises readiness and sleep for a night when the ring
    // syncs in the morning; only day-long counters (steps, calories) are still filling in,
    // and the row's date is shown next to them.
    supabase
      .from("recovery_metrics")
      .select("*")
      .eq("source", "oura")
      .order("date", { ascending: false })
      .limit(1),
    // Windowed recovery trend (HRV, sleep stages, steps, calories, RHR, SpO2)
    supabase
      .from("recovery_metrics")
      .select("*")
      .eq("source", "oura")
      .gte("date", daysAgoString(days - 1))
      .order("date", { ascending: true }),
    supabase.from("habit_registry").select("id,name,emoji,category,icon_key").eq("active", true),
    supabase.from("habits").select("*").eq("date", today),
    supabase
      .from("habits")
      .select("habit_id,date")
      .eq("completed", true)
      .order("date", { ascending: false }),
    supabase
      .from("profile")
      .select("key,value")
      .in("key", [
        "name",
        "Identity/Name",
        "weight_goal_lbs",
        "body_fat_goal_pct",
        "weekly_active_cal_goal",
        ...MACRO_GOAL_KEYS,
      ]),
    supabase
      .from("tasks")
      .select(`*, ${BLOCKER_EMBED}`)
      .is("parent_id", null)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase.from("stocks_cache").select("*").order("ticker", { ascending: true }),
    supabase.from("sports_cache").select("*"),
    supabase.from("profile").select("value").eq("key", "sports_favorites").maybeSingle(),
    // ── Today's food: today's plan rows (same shape KitchenPanel reads) and what's been logged.
    supabase.from("meal_plans").select(MEAL_PLAN_SELECT).eq("date", today),
    supabase
      .from("meal_log")
      .select("meal_type, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g")
      .eq("date", today),
    supabase.from("workout_plans").select("name, status, workout").eq("date", today).maybeSingle(),
    // ── Re-entry: newest hand-entered log across meals, habits, strength, journal.
    getHandLoggingSignal(supabase, today),
    // ── Travel: a "Stay at …" calendar event covering today. Null on any failure or after
    // 2.5 s, so a slow Google never holds the page.
    supabase.auth
      .getUser()
      .then(({ data }) => (data.user ? getCurrentStay(supabase, data.user.id) : null))
      .catch(() => null),
    cookies(),
  ]);

  // ── Wrangling ──────────────────────────────────────────────────────────────
  const latestRecovery = ((recoveryLatestRes.data ?? [])[0] ?? null) as RecoveryMetrics | null;
  const recoveryTrends = (recoveryTrendsRes.data ?? []) as RecoveryMetrics[];

  const fitnessData = (fitnessTrendRes.data ?? []) as {
    date: string;
    weight_lb: number | null;
    body_fat_pct: number | null;
  }[];

  const habitRegistry = (habitRegistryRes.data ?? []) as Pick<
    HabitRegistry,
    "id" | "name" | "emoji" | "category" | "icon_key"
  >[];
  const todayLogs = (todayHabitsRes.data ?? []) as HabitLog[];
  const allCompleted = (allCompletedRes.data ?? []) as { habit_id: string; date: string }[];
  const habitStreaks = computeStreaks(allCompleted, today);

  // Same collapse as /tasks — otherwise the "N active" count and the top-tasks list both treat a
  // fortnight of generated occurrences as a fortnight of separate chores.
  // Blocked tasks (#470) are left out, as on /tasks: they cannot be started yet.
  const tasks = partitionBlocked(
    collapseSeriesOccurrences((tasksRes.data ?? []) as Task[], today),
  ).ready.sort(
    (a, b) =>
      (({ high: 0, medium: 1, low: 2 })[a.priority ?? "low"] ?? 2) -
      ({ high: 0, medium: 1, low: 2 }[b.priority ?? "low"] ?? 2),
  );

  const stocksRows = (stocksRes.data ?? []) as StocksCache[];
  const sportsRows = (sportsRes.data ?? []) as SportsCache[];
  const sportsFavorites: SportsFavorite[] = sportsFavoritesRes.data?.value
    ? (JSON.parse(sportsFavoritesRes.data.value) as SportsFavorite[])
    : [];

  const nameRows = (profileRes.data ?? []) as { key: string; value: string }[];
  const userName =
    nameRows.find((r) => r.key === "name")?.value ??
    nameRows.find((r) => r.key === "Identity/Name")?.value ??
    null;
  const goalNum = (key: string): number | null => {
    const raw = nameRows.find((r) => r.key === key)?.value;
    if (raw == null) return null;
    const n = parseFloat(raw);
    return isNaN(n) ? null : n;
  };
  const weightGoal = goalNum("weight_goal_lbs");
  const bodyFatGoal = goalNum("body_fat_goal_pct");
  const weeklyActiveCalGoal = goalNum("weekly_active_cal_goal");

  // ── Today's food ────────────────────────────────────────────────────────────
  const macroGoals = macroGoalsFromProfile(
    Object.fromEntries(nameRows.map((r) => [r.key, r.value])),
  );
  const todayMealLog = (todayMealLogRes.data ?? []) as (MacroRow & {
    meal_type: string | null;
  })[];
  const macroTotals = sumMacroTotals(todayMealLog);
  const nextMeal = pickNextPlannedMeal(
    (todayPlansRes.data ?? []) as unknown as KitchenPlannedMeal[],
    todayMealLog.map((m) => m.meal_type),
  );
  const todayWorkout = (todayWorkoutRes.data ?? null) as TodayWorkoutPlan | null;

  // ── Travel + re-entry ──────────────────────────────────────────────────────
  const traveling = stay !== null;
  // Travel explains a quiet stretch on its own, and "plan the next 2 days" is the wrong ask from
  // a hotel — so the re-entry card waits until the trip is over.
  const showReentry =
    handLogging.reentry && !traveling && cookieStore.get(REENTRY_DISMISS_COOKIE)?.value !== today;

  const hour = parseInt(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: USER_TZ }),
  );
  const timeOfDay = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const greeting = userName ? `${timeOfDay}, ${userName}` : `Good ${timeOfDay}`;

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: USER_TZ,
  });

  const rowStyle: React.CSSProperties = {
    gap: "var(--space-7)",
    paddingBottom: "var(--space-7)",
    borderBottom: "1px solid var(--rule-soft)",
  };
  const rowStyleLast: React.CSSProperties = { gap: "var(--space-7)" };

  return (
    <div className="flex flex-col print:flex-col" style={{ gap: "var(--space-7)" }}>
      {/* ── Masthead: brand + date + window selector + refresh (desktop) ── */}
      <div className="print:order-1" data-reveal data-stagger="0">
        <DashboardMasthead
          dateStr={dateStr}
          windowKey={windowKey}
          refreshStocks={refreshStocks}
          refreshSports={refreshSports}
        />
      </div>

      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <div data-reveal data-stagger="1">
        <DashboardGreeting greeting={greeting} />
      </div>

      {/* ── Re-entry: one calm, forward-only card after a quiet stretch (lib/reentry.ts) ── */}
      {showReentry && (
        <div className="print:hidden" data-reveal data-stagger="1">
          <ReentryCard today={today} logHref={nextMeal ? "#todays-food" : "/meals"} />
        </div>
      )}

      {/* ── Travel note + weather (the forecast follows the stay while traveling) ── */}
      <div className="flex flex-col" style={{ gap: "var(--space-2)" }} data-reveal data-stagger="1">
        {stay && <TravelNote city={stayCity(stay)} until={stay.end} />}
        <DashboardBriefing />
      </div>

      {/* ── Today's food: next planned meal (one-tap "Ate this") + macros vs targets ──
          Meals are the most-used feature and were absent from the dashboard (issue 761). */}
      <div className="print:order-2" style={rowStyle} data-reveal data-stagger="2">
        <TodayFood
          nextMeal={nextMeal}
          goals={macroGoals}
          totals={macroTotals}
          traveling={traveling}
        />
      </div>

      {/* ── Today's workout + Habits ─────────────────────────────────── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 print:order-3"
        style={rowStyle}
        data-reveal
        data-stagger="2"
      >
        <TodayWorkout plan={todayWorkout} />
        <HabitsCheckin
          registry={habitRegistry}
          todayLogs={todayLogs}
          streaks={habitStreaks}
          toggleAction={toggleHabit}
          date={today}
        />
      </div>

      {/* Mobile-only sticky time-range selector — it drives the recovery/health charts below,
          so it sits directly above them. Solid page background (issue 761): it used to be
          transparent with an 8px backdrop blur so the watercolor canvas read through, but a
          blur that light leaves text and charts plainly legible as they scroll underneath,
          so the bar read as content overlapping content. --color-bg is the same paper the
          page sits on, in both themes; the hairline marks where the bar ends. */}
      <div
        className="lg:hidden print:hidden"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--color-bg)",
          borderBottom: "1px solid var(--rule)",
          marginLeft: "-20px",
          marginRight: "-20px",
          padding: "8px 20px",
        }}
      >
        <WindowSelector current={windowKey} />
      </div>

      {/* ── Readiness hero — the same row Health Breakdown reads ───── */}
      {latestRecovery && (
        <div className="print:order-6" data-reveal data-stagger="3">
          <TodayScoresStrip recovery={latestRecovery} today={today} />
        </div>
      )}

      {/* ── Readiness focal + Health Breakdown ───────────────────────── */}
      <div className="print:order-5" data-reveal data-stagger="3">
        <HealthBreakdown
          recovery={latestRecovery}
          trends={recoveryTrends}
          fitnessData={fitnessData}
          windowLabel={windowKey.toUpperCase()}
          weightGoal={weightGoal}
          bodyFatGoal={bodyFatGoal}
          weeklyActiveCalGoal={weeklyActiveCalGoal}
        />
      </div>

      {/* ── Body & Fitness 7-day summary ─────────────────────────────── */}
      <div style={rowStyle} data-reveal data-stagger="4">
        <BodyFitnessSummary fitnessData={fitnessData} trends={recoveryTrends} />
      </div>

      {/* ── Schedule (+ birthday) + Tasks ────────────────────────────── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 print:order-4"
        style={rowStyle}
        data-reveal
        data-stagger="5"
      >
        <div className="flex flex-col" style={{ gap: "var(--space-5)", minWidth: 0 }}>
          <ScheduleToday />
          <UpcomingBirthdayWidget />
        </div>
        <TasksSummary tasks={tasks} />
      </div>

      {/* ── Watchlist + Sports — last (last row, no trailing rule) ───── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 print:order-8"
        style={rowStyleLast}
        data-reveal
        data-stagger="6"
      >
        <WatchlistWidget
          rows={stocksRows}
          hasApiKey={!!process.env.POLYGON_API_KEY}
          refreshAction={refreshStocks}
        />
        <SportsCard
          rows={sportsRows}
          favorites={sportsFavorites.map((f) => ({
            team_id: f.team_id,
            name: f.name,
            league: f.league,
            badge: f.badge,
            color: f.color,
          }))}
          refreshAction={refreshSports}
        />
      </div>
    </div>
  );
}
