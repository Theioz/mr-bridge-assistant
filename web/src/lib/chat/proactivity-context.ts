import { todayString, daysAgoString, USER_TZ } from "@/lib/timezone";
import type { createServiceClient } from "@/lib/supabase/service";

type SupabaseClient = ReturnType<typeof createServiceClient>;

// Each rule returns a signal string or null (null = silent omit).
// All rules run in parallel via Promise.allSettled — a thrown error is treated as null.

export async function ruleHrvDecline(
  userId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("recovery_metrics")
    .select("date, avg_hrv")
    .eq("user_id", userId)
    .eq("source", "oura")
    .not("avg_hrv", "is", null)
    .order("date", { ascending: false })
    .limit(10);
  if (error || !data || data.length < 4) return null;

  const rows = data as { date: string; avg_hrv: number }[];
  const [d0, d1, d2, ...rest] = rows;

  // Each of the last 3 consecutive days must decline by > 5% from the prior day
  const drop0 = (d1.avg_hrv - d0.avg_hrv) / d1.avg_hrv; // d0 is most recent
  const drop1 = (d2.avg_hrv - d1.avg_hrv) / d2.avg_hrv;
  if (drop0 <= 0.05 || drop1 <= 0.05) return null;
  // Need a 3rd point: d2 must also be lower than d3 if available
  if (rows.length >= 4) {
    const d3 = rows[3];
    const drop2 = (d3.avg_hrv - d2.avg_hrv) / d3.avg_hrv;
    if (drop2 <= 0.05) return null;
  }

  const baseline =
    rest.length > 0 ? Math.round(rest.reduce((s, r) => s + r.avg_hrv, 0) / rest.length) : null;

  const baselineNote = baseline !== null ? `, 7-day baseline ${baseline} ms` : "";
  return (
    `HRV declining 3 consecutive days ` +
    `(${Math.round(d2.avg_hrv)} → ${Math.round(d1.avg_hrv)} → ${Math.round(d0.avg_hrv)} ms${baselineNote}). ` +
    `Suggest reduced intensity or rest — do not recommend PR attempts.`
  );
}

export async function ruleHighRpe(
  userId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const sinceStr = daysAgoString(60);
  const { data: sessions, error: sessErr } = await supabase
    .from("strength_sessions")
    .select("id, performed_on")
    .eq("user_id", userId)
    .gte("performed_on", sinceStr)
    .order("performed_on", { ascending: false })
    .limit(5);
  if (sessErr || !sessions || sessions.length < 2) return null;

  const sessionIds = (sessions as { id: string; performed_on: string }[]).map((s) => s.id);
  const { data: sets, error: setsErr } = await supabase
    .from("strength_session_sets")
    .select("session_id, rpe")
    .in("session_id", sessionIds)
    .not("rpe", "is", null);
  if (setsErr || !sets) return null;

  // Group max RPE by session
  const maxRpeBySession = new Map<string, number>();
  for (const s of sets as { session_id: string; rpe: number }[]) {
    const cur = maxRpeBySession.get(s.session_id) ?? 0;
    if (s.rpe > cur) maxRpeBySession.set(s.session_id, s.rpe);
  }

  const orderedSessions = sessions as { id: string; performed_on: string }[];
  const last2 = orderedSessions.slice(0, 2);
  const bothHigh = last2.every((s) => (maxRpeBySession.get(s.id) ?? 0) >= 9);
  if (!bothHigh) return null;

  return (
    `RPE ≥ 9 on working sets in the last 2 strength sessions (${last2[1].performed_on}, ${last2[0].performed_on}). ` +
    `Hold progression — do not suggest weight increases this session.`
  );
}

async function ruleOverdueTasks(userId: string, supabase: SupabaseClient): Promise<string | null> {
  const today = todayString();
  const { data, error } = await supabase
    .from("tasks")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("due_date", "is", null)
    .lt("due_date", today);
  if (error || !data) return null;

  const count = data.length;
  if (count === 0) return null;

  const bucket = count === 1 ? "1 task" : count <= 4 ? `${count} tasks` : `5+ tasks`;
  return `${bucket} overdue. Mention this if the user asks about schedule, priorities, or tasks.`;
}

async function ruleHabitAtRisk(userId: string, supabase: SupabaseClient): Promise<string | null> {
  // Only fire after 18:00 local time
  const localHour = parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: USER_TZ }).format(
      new Date(),
    ),
    10,
  );
  if (localHour < 18) return null;

  const today = todayString();
  const thirtyDaysAgo = daysAgoString(30);

  const [registryResult, logsResult] = await Promise.all([
    supabase
      .from("habit_registry")
      .select("id, name")
      .eq("user_id", userId)
      .eq("active", true)
      .lte("created_at", thirtyDaysAgo),
    supabase
      .from("habits")
      .select("habit_id")
      .eq("user_id", userId)
      .eq("date", today)
      .eq("completed", true),
  ]);
  if (registryResult.error || !registryResult.data) return null;

  const completedToday = new Set(
    (logsResult.data ?? []).map((l: { habit_id: string }) => l.habit_id),
  );
  const atRisk = (registryResult.data as { id: string; name: string }[]).filter(
    (h) => !completedToday.has(h.id),
  );
  if (atRisk.length === 0) return null;

  const names = atRisk.map((h) => h.name).join(", ");
  return (
    `Habit streak at risk (established habits not yet logged today, past 18:00 local): ${names}. ` +
    `Prompt the user to log these if not already done.`
  );
}

export async function ruleSleepDeficit(
  userId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("recovery_metrics")
    .select("date, total_sleep_hrs")
    .eq("user_id", userId)
    .eq("source", "oura")
    .not("total_sleep_hrs", "is", null)
    .order("date", { ascending: false })
    .limit(2);
  if (error || !data || data.length < 2) return null;

  const rows = data as { date: string; total_sleep_hrs: number }[];
  if (rows[0].total_sleep_hrs >= 6 || rows[1].total_sleep_hrs >= 6) return null;

  return (
    `Sleep deficit: ${rows[1].total_sleep_hrs.toFixed(1)} h and ${rows[0].total_sleep_hrs.toFixed(1)} h over the last 2 nights (both < 6 h). ` +
    `Flag recovery risk if the user asks about energy, training intensity, or performance.`
  );
}

async function ruleWeightVsGoal(userId: string, supabase: SupabaseClient): Promise<string | null> {
  const [weightResult, goalResult] = await Promise.all([
    supabase
      .from("fitness_log")
      .select("date, weight_lb")
      .eq("user_id", userId)
      .not("weight_lb", "is", null)
      .order("date", { ascending: false })
      .limit(6),
    supabase
      .from("profile")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "fitness_goal")
      .maybeSingle(),
  ]);
  if (weightResult.error || !weightResult.data || weightResult.data.length < 5) return null;

  const goal = (goalResult.data?.value as string | undefined) ?? "";
  if (goal !== "lose_weight" && goal !== "build_muscle") return null;

  const entries = (weightResult.data as { date: string; weight_lb: number }[]).slice(0, 5);
  // Oldest is at index 4, newest at index 0
  const allMovingOpposite =
    goal === "lose_weight"
      ? entries.every((_, i) => i === 4 || entries[i].weight_lb >= entries[i + 1].weight_lb)
      : entries.every((_, i) => i === 4 || entries[i].weight_lb <= entries[i + 1].weight_lb);

  if (!allMovingOpposite) return null;

  const direction = goal === "lose_weight" ? "upward" : "downward";
  const goalLabel = goal === "lose_weight" ? "weight loss" : "muscle gain";
  const oldest = entries[4].weight_lb.toFixed(1);
  const newest = entries[0].weight_lb.toFixed(1);
  return (
    `Body weight trending ${direction} over last 5 weigh-ins (${oldest} → ${newest} lb), ` +
    `counter to ${goalLabel} goal. Surface this if the user asks about nutrition or body composition.`
  );
}

/**
 * Runs all proactivity rules in parallel and returns a formatted context block,
 * or an empty string if no signals fire (or proactivity is disabled).
 * Never throws — all errors are caught and treated as silent omits.
 */
export async function buildProactivityContext(
  userId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const results = await Promise.allSettled([
    ruleHrvDecline(userId, supabase),
    ruleHighRpe(userId, supabase),
    ruleOverdueTasks(userId, supabase),
    ruleHabitAtRisk(userId, supabase),
    ruleSleepDeficit(userId, supabase),
    ruleWeightVsGoal(userId, supabase),
  ]);

  const signals: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) signals.push(`- ${r.value}`);
  }
  if (signals.length === 0) return "";

  return [
    "Verified signals from database (do not fabricate additional context — these are the only facts available):",
    ...signals,
    "Surface these proactively when the user's message touches a related topic, or if no other topic is raised, mention the highest-priority signal in your first response.",
  ].join("\n");
}
