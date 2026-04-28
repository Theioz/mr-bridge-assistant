import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

interface WorkoutExercise {
  exercise: string;
  sets: number;
  reps: string;
  weight_lbs?: number;
  weight_notation?: string;
  description?: string;
  tips?: string[];
}

interface WorkoutDay {
  date: string;
  name?: string;
  warmup?: WorkoutExercise[];
  workout?: WorkoutExercise[];
  cooldown?: WorkoutExercise[];
  notes?: string;
}

interface MealPrepTask {
  title?: string;
  priority?: string;
  due_date?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

function checkAuth(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  return !!(process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`);
}

function getComingMonday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pyDow = (today.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const days = (7 - pyDow) % 7 || 7;
  const monday = new Date(today);
  monday.setDate(monday.getDate() + days);
  return monday;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtHrs(h: number | null | undefined): string {
  if (h == null) return "—";
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

// GET — return prior-week planning context as plain text
export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = process.env.OWNER_USER_ID;
  if (!uid) return NextResponse.json({ error: "OWNER_USER_ID not configured" }, { status: 500 });

  const db = createServiceClient();
  const nextMonday = getComingMonday();
  const priorMonday = addDays(nextMonday, -7);
  const priorSunday = addDays(nextMonday, -1);
  const nextSunday = addDays(nextMonday, 6);
  const [nMon, pMon, pSun, nSun] = [nextMonday, priorMonday, priorSunday, nextSunday].map(
    toDateStr,
  );

  const [profileR, sessionsR, recoveryR, mealLogR, fitnessLogR, registryR, habitsR, priorPlansR] =
    await Promise.allSettled([
      db.from("profile").select("key,value").eq("user_id", uid),
      db
        .from("workout_sessions")
        .select("date,activity,duration_mins,calories,avg_hr,notes")
        .eq("user_id", uid)
        .gte("date", pMon)
        .lte("date", pSun)
        .order("date"),
      db
        .from("recovery_metrics")
        .select("date,readiness,sleep_score,total_sleep_hrs,avg_hrv,resting_hr")
        .eq("user_id", uid)
        .eq("source", "oura")
        .gte("date", pMon)
        .lte("date", pSun)
        .order("date"),
      db
        .from("meal_log")
        .select("date,meal_type,notes,recipe_id")
        .eq("user_id", uid)
        .gte("date", pMon)
        .lte("date", pSun)
        .order("date"),
      db
        .from("fitness_log")
        .select("date,weight_lb,body_fat_pct,muscle_mass_lb,bmi")
        .eq("user_id", uid)
        .not("body_fat_pct", "is", null)
        .order("date", { ascending: false })
        .limit(2),
      db.from("habit_registry").select("id,name").eq("active", true).eq("user_id", uid),
      db
        .from("habits")
        .select("habit_id,date,completed")
        .eq("user_id", uid)
        .gte("date", pMon)
        .lte("date", pSun),
      db
        .from("workout_plans")
        .select("date,name,status,notes")
        .eq("user_id", uid)
        .gte("date", pMon)
        .lte("date", pSun)
        .order("date"),
    ]);

  const get = <T>(r: PromiseSettledResult<{ data: T[] | null }>): T[] =>
    r.status === "fulfilled" ? (r.value.data ?? []) : [];

  const profile = get<{ key: string; value: string }>(profileR);
  const sessions = get<Record<string, unknown>>(sessionsR);
  const recovery = get<Record<string, unknown>>(recoveryR);
  const mealLog = get<Record<string, unknown>>(mealLogR);
  const fitnessLog = get<Record<string, unknown>>(fitnessLogR);
  const registry = get<{ id: string; name: string }>(registryR);
  const habits = get<{ habit_id: string; date: string; completed: boolean }>(habitsR);
  const priorPlans = get<Record<string, unknown>>(priorPlansR);

  // Recipe names for meal log
  const recipeIds = [
    ...new Set(mealLog.filter((m) => m.recipe_id).map((m) => m.recipe_id as string)),
  ];
  let recipeNames: Record<string, string> = {};
  if (recipeIds.length > 0) {
    const { data } = await db.from("recipes").select("id,name").in("id", recipeIds);
    recipeNames = Object.fromEntries(
      (data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
    );
  }

  const lines: string[] = [];
  const v = (val: unknown, suffix = "") => (val != null ? `${val}${suffix}` : "—");

  lines.push(`## PLANNING CONTEXT — coming week ${nMon} to ${nSun}`);
  lines.push(`## (prior week data: ${pMon} to ${pSun})`);

  lines.push("\n## PROFILE");
  if (profile.length > 0) profile.forEach((r) => lines.push(`- ${r.key}: ${r.value}`));
  else lines.push("No profile data.");

  lines.push("\n## BODY COMPOSITION (most recent entry)");
  if (fitnessLog.length > 0) {
    const l = fitnessLog[0] as Record<string, number | null>;
    lines.push(
      `Weight: ${v(l.weight_lb)} lb | Body Fat: ${v(l.body_fat_pct)}% | Muscle: ${v(l.muscle_mass_lb)} lb | BMI: ${v(l.bmi)} — ${l.date}`,
    );
    if (fitnessLog.length > 1) {
      const p = fitnessLog[1] as Record<string, number | null>;
      const dw =
        l.weight_lb != null && p.weight_lb != null
          ? Math.round((l.weight_lb - p.weight_lb) * 10) / 10
          : null;
      const dbf =
        l.body_fat_pct != null && p.body_fat_pct != null
          ? Math.round((l.body_fat_pct - p.body_fat_pct) * 10) / 10
          : null;
      const parts = [];
      if (dw != null) parts.push(`Weight ${dw > 0 ? "+" : ""}${dw} lb`);
      if (dbf != null) parts.push(`Fat ${dbf > 0 ? "+" : ""}${dbf}%`);
      if (parts.length) lines.push(`Delta vs prior: ${parts.join(" | ")}`);
    }
  } else {
    lines.push("No body composition data available.");
  }

  lines.push(`\n## PRIOR WEEK ACTIVITY (${pMon} – ${pSun})`);
  if (sessions.length > 0) {
    for (const s of sessions) {
      const hr = s.avg_hr ? ` | Avg HR: ${s.avg_hr}` : "";
      const notes = s.notes ? ` — ${s.notes}` : "";
      lines.push(
        `- ${s.date} | ${s.activity} — ${s.duration_mins} min, ${s.calories} cal${hr}${notes}`,
      );
    }
  } else {
    lines.push("No activity logged for prior week.");
  }

  lines.push("\n## PRIOR WEEK PLANNED WORKOUTS");
  if (priorPlans.length > 0) {
    for (const p of priorPlans) {
      const flag = p.status === "completed" ? "" : ` [${String(p.status).toUpperCase()}]`;
      lines.push(`- ${p.date} | ${p.name ?? "Unnamed"}${flag}`);
    }
  } else {
    lines.push("No workout plans found for prior week.");
  }

  lines.push("\n## RECOVERY — PRIOR WEEK");
  if (recovery.length > 0) {
    for (const r of recovery) {
      lines.push(
        `- ${r.date} | Readiness: ${v(r.readiness)} | Sleep: ${v(r.sleep_score)} | Total: ${fmtHrs(r.total_sleep_hrs as number)} | HRV: ${v(r.avg_hrv, "ms")} | RHR: ${v(r.resting_hr, " bpm")}`,
      );
    }
    const vals = recovery.filter((r) => r.readiness != null).map((r) => r.readiness as number);
    if (vals.length > 0) {
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      const min = Math.min(...vals);
      lines.push(`  Avg readiness: ${avg} | Min: ${min}`);
      if (min < 50) lines.push("  FLAG: Critically low readiness — consider deload week.");
      else if (avg < 65)
        lines.push("  FLAG: Consistently low readiness — consider reducing volume.");
    }
  } else {
    lines.push("No recovery data for prior week — Oura sync may not have run.");
  }

  lines.push("\n## HABITS — PRIOR WEEK");
  if (registry.length > 0) {
    const byId = Object.fromEntries(registry.map((r) => [r.id, r.name]));
    const habitMap: Record<string, Record<string, boolean>> = {};
    for (const h of habits) {
      const name = byId[h.habit_id] ?? h.habit_id;
      if (!habitMap[name]) habitMap[name] = {};
      habitMap[name][h.date] = h.completed;
    }
    const dates = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(priorMonday, i)));
    for (const reg of registry) {
      const rowData = habitMap[reg.name] ?? {};
      const completed = dates.filter((d) => rowData[d] === true).length;
      const cells = dates.map((d) =>
        rowData[d] === true ? "Y" : rowData[d] === false ? "N" : "—",
      );
      lines.push(`- ${reg.name}: ${completed}/7 — ${cells.join(" ")}`);
    }
  } else {
    lines.push("No habits tracked.");
  }

  lines.push("\n## MEALS — PRIOR WEEK");
  if (mealLog.length > 0) {
    for (const m of mealLog) {
      const label = m.recipe_id
        ? (recipeNames[m.recipe_id as string] ?? m.notes ?? "—")
        : (m.notes ?? "—");
      lines.push(`- ${m.date} | ${m.meal_type ?? "—"} | ${label}`);
    }
  } else {
    lines.push("No meals logged for prior week.");
  }

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  lines.push("\n## COMING WEEK — dates available for scheduling");
  for (let i = 0; i < 7; i++) lines.push(`- ${toDateStr(addDays(nextMonday, i))} (${dayNames[i]})`);

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// POST — write workout_plans rows + meal prep task
export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = process.env.OWNER_USER_ID;
  if (!uid) return NextResponse.json({ error: "OWNER_USER_ID not configured" }, { status: 500 });

  let body: { workout_days?: WorkoutDay[]; meal_prep_task?: MealPrepTask };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workout_days = [], meal_prep_task } = body;
  if (!workout_days.length && !meal_prep_task) {
    return NextResponse.json(
      { error: "payload has neither workout_days nor meal_prep_task" },
      { status: 400 },
    );
  }

  const db = createServiceClient();
  const nextMonday = getComingMonday();
  const nextMondayStr = toDateStr(nextMonday);
  const nextSundayStr = toDateStr(addDays(nextMonday, 6));

  const { count } = await db
    .from("workout_plans")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .gte("date", nextMondayStr)
    .lte("date", nextSundayStr);

  if (count && count > 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: `Plan already exists for week of ${nextMondayStr}`,
    });
  }

  const errors: string[] = [];

  if (workout_days.length > 0) {
    const rows = workout_days
      .filter((d) => d.date)
      .map((d) => ({
        user_id: uid,
        date: d.date,
        name: d.name ?? null,
        warmup: d.warmup ?? [],
        workout: d.workout ?? [],
        cooldown: d.cooldown ?? [],
        notes: d.notes ?? null,
        status: "planned" as const,
        cancel_reason: null,
        updated_at: new Date().toISOString(),
      }));
    const { error } = await db.from("workout_plans").upsert(rows, { onConflict: "user_id,date" });
    if (error) errors.push(`workout_plans upsert failed: ${error.message}`);
  }

  if (meal_prep_task) {
    const { error } = await db.from("tasks").insert({
      user_id: uid,
      title: meal_prep_task.title ?? `Meal prep — week of ${nextMondayStr}`,
      priority: meal_prep_task.priority ?? "medium",
      status: "active",
      due_date: meal_prep_task.due_date ?? nextMondayStr,
      category: meal_prep_task.category ?? "nutrition",
      metadata: {
        source: "weekly_planning_agent",
        week_start: nextMondayStr,
        ...(meal_prep_task.metadata ?? {}),
      },
    });
    if (error) errors.push(`tasks insert failed: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: `Wrote ${workout_days.filter((d) => d.date).length} workout plan(s) + meal prep task for week of ${nextMondayStr}`,
  });
}
