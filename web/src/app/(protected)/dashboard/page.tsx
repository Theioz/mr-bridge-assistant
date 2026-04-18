export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Daily briefing — weather, schedule, health, tasks, habits, markets, and email.",
};
import { revalidatePath } from "next/cache";
import { todayString, daysAgoString, USER_TZ } from "@/lib/timezone";
import { computeStreaks } from "@/lib/streaks";
import { getWindow } from "@/lib/window";
import DashboardMasthead from "@/components/dashboard/dashboard-masthead";
import DashboardGreeting from "@/components/dashboard/dashboard-greeting";
import DashboardBriefing from "@/components/dashboard/dashboard-briefing";
import BodyFitnessSummary from "@/components/dashboard/body-fitness-summary";
import HealthBreakdown from "@/components/dashboard/health-breakdown";
import TodayScoresStrip from "@/components/dashboard/today-scores-strip";
import HabitsCheckin from "@/components/dashboard/habits-checkin";
import UpcomingBirthdayWidget from "@/components/dashboard/upcoming-birthday";
import ScheduleToday from "@/components/dashboard/schedule-today";
import ImportantEmails from "@/components/dashboard/important-emails";
import TasksSummary from "@/components/dashboard/tasks-summary";
import { WatchlistWidget } from "@/components/dashboard/watchlist-widget";
import { SportsCard } from "@/components/dashboard/sports-card";
import { WindowSelector } from "@/components/ui/window-selector";
import { syncStocks } from "@/lib/sync/stocks";
import { syncSports, type SportsFavorite } from "@/lib/sync/sports";
import type { HabitLog, HabitRegistry, RecoveryMetrics, Task, StocksCache, SportsCache } from "@/lib/types";

async function refreshStocks(): Promise<{ rateLimited: boolean }> {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { rateLimited: false };

  const { data: profileRow } = await supabase
    .from("profile")
    .select("value")
    .eq("user_id", user.id)
    .eq("key", "stock_watchlist")
    .single();

  const tickers: string[] = profileRow?.value
    ? (JSON.parse(profileRow.value) as string[])
    : [];

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
  const { data: { user } } = await supabase.auth.getUser();
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("habits")
    .upsert({ user_id: user.id, habit_id: habitId, date, completed }, { onConflict: "habit_id,date" });
  revalidatePath("/dashboard");
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = todayString();
  const { key: windowKey, days } = await getWindow();

  const [
    fitnessTrendRes,
    recoveryLatestRes,
    todayRecoveryRes,
    recoveryTrendsRes,
    habitRegistryRes,
    todayHabitsRes,
    allCompletedRes,
    profileRes,
    tasksRes,
    stocksRes,
    sportsRes,
    sportsFavoritesRes,
  ] = await Promise.all([
    // Windowed weight + body fat trend
    supabase
      .from("fitness_log")
      .select("date,weight_lb,body_fat_pct")
      .gte("date", daysAgoString(days - 1))
      .order("date", { ascending: true }),
    // Latest full recovery row — capped to before today so a partial same-day
    // sync row does not replace yesterday's complete data in Health Breakdown
    supabase
      .from("recovery_metrics")
      .select("*")
      .lt("date", today)
      .order("date", { ascending: false })
      .limit(1),
    // Today's scores only (for the strip above Health Breakdown)
    supabase
      .from("recovery_metrics")
      .select("date,readiness,sleep_score,source")
      .eq("date", today)
      .limit(1),
    // Windowed recovery trend (HRV, sleep stages, steps, calories, RHR, SpO2)
    supabase
      .from("recovery_metrics")
      .select("*")
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
      ]),
    supabase
      .from("tasks")
      .select("*")
      .is("parent_id", null)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("stocks_cache")
      .select("*")
      .order("ticker", { ascending: true }),
    supabase
      .from("sports_cache")
      .select("*"),
    supabase
      .from("profile")
      .select("value")
      .eq("key", "sports_favorites")
      .maybeSingle(),
  ]);

  // ── Wrangling ──────────────────────────────────────────────────────────────
  const latestRecovery = ((recoveryLatestRes.data ?? [])[0] ?? null) as RecoveryMetrics | null;
  const todayRecoveryRow = (todayRecoveryRes.data ?? [])[0] ?? null;
  // Hide the strip when today's row IS the latest card (avoid duplicate display)
  const todayScores =
    todayRecoveryRow && todayRecoveryRow.date !== latestRecovery?.date
      ? (todayRecoveryRow as Pick<RecoveryMetrics, "date" | "readiness" | "sleep_score" | "source">)
      : null;
  const recoveryTrends = (recoveryTrendsRes.data ?? []) as RecoveryMetrics[];

  const fitnessData = (fitnessTrendRes.data ?? []) as { date: string; weight_lb: number | null; body_fat_pct: number | null }[];

  const habitRegistry = (habitRegistryRes.data ?? []) as Pick<HabitRegistry, "id" | "name" | "emoji" | "category" | "icon_key">[];
  const todayLogs     = (todayHabitsRes.data ?? []) as HabitLog[];
  const allCompleted  = (allCompletedRes.data ?? []) as { habit_id: string; date: string }[];
  const habitStreaks  = computeStreaks(allCompleted, today);

  const tasks = ((tasksRes.data ?? []) as Task[]).sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 }[a.priority ?? "low"] ?? 2) -
      ({ high: 0, medium: 1, low: 2 }[b.priority ?? "low"] ?? 2)
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

  const hour = parseInt(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: USER_TZ })
  );
  const timeOfDay = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const greeting  = userName ? `${timeOfDay}, ${userName}` : `Good ${timeOfDay}`;

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: USER_TZ,
  });

  return (
    <div className="space-y-6 print:flex print:flex-col">

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

      {/* ── Briefing copy (weather + body trend narrative) ──────────── */}
      <div data-reveal data-stagger="1">
        <DashboardBriefing />
      </div>

      {/* Mobile-only sticky time-range selector — transparent so the watercolor
          canvas reads through; backdrop-filter keeps the pills legible when
          long content scrolls behind. */}
      <div
        className="lg:hidden print:hidden"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "transparent",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--rule-soft)",
          marginLeft: "-20px",
          marginRight: "-20px",
          padding: "8px 20px",
        }}
      >
        <WindowSelector current={windowKey} />
      </div>

      {/* ── Birthday (conditionally rendered inside the widget) ──────── */}
      <div className="print:order-7" data-reveal data-stagger="2">
        <UpcomingBirthdayWidget />
      </div>

      {/* ── Today's scores strip (readiness + sleep focal) ─────────── */}
      {todayScores && (
        <div className="print:order-6" data-reveal data-stagger="2">
          <TodayScoresStrip today={todayScores} />
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
      <div data-reveal data-stagger="3">
        <BodyFitnessSummary fitnessData={fitnessData} trends={recoveryTrends} />
      </div>

      {/* ── Schedule today (full width) ──────────────────────────────── */}
      <div className="print:order-2" data-reveal data-stagger="4">
        <ScheduleToday />
      </div>

      {/* ── Tasks + Habits: asymmetric 7/12 + 5/12 split ─────────────── */}
      <div
        className="print:order-3"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "var(--space-6)",
        }}
        data-revamp-split
        data-reveal
        data-stagger="5"
      >
        <TasksSummary tasks={tasks} />
        <HabitsCheckin
          registry={habitRegistry}
          todayLogs={todayLogs}
          streaks={habitStreaks}
          toggleAction={toggleHabit}
          date={today}
        />
      </div>

      {/* ── Emails ───────────────────────────────────────────────────── */}
      <div className="print:order-9" data-reveal data-stagger="6">
        <ImportantEmails />
      </div>

      {/* ── Reference: Watchlist + Sports ────────────────────────────── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:order-8"
        data-reveal
        data-stagger="7"
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
