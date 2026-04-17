import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { todayString, addDays } from "@/lib/timezone";

// Tables to wipe (children first to respect FK constraints)
const TABLES = [
  "chat_messages",
  "chat_sessions",
  "habits",
  "habit_registry",
  "meal_log",
  "recipes",
  "study_log",
  "journal_entries",
  "workout_sessions",
  "recovery_metrics",
  "fitness_log",
  "tasks",
  "timer_state",
  "profile",
] as const;

export async function GET(req: Request) {
  // Protect with CRON_SECRET — Vercel passes this as Authorization header
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demoUserId = process.env.DEMO_USER_ID;
  if (!demoUserId) {
    return NextResponse.json({ error: "DEMO_USER_ID not configured" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const log: Record<string, number> = {};

  // Wipe all demo user data
  for (const table of TABLES) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("user_id", demoUserId);
    if (error) {
      console.error(`[reset-demo] Error deleting from ${table}:`, error.message);
    }
    log[table] = 0; // Supabase delete doesn't return count reliably via service client
  }

  // Reseed via the seed API (calls seed_demo.py server-side via the Python script)
  // Since this runs in Vercel serverless we can't spawn a Python process directly.
  // Instead, inline the seed logic using the Supabase service client.
  const seedResult = await seedDemoData(supabase, demoUserId);

  console.log("[reset-demo] Reset complete.", { deleted: log, seeded: seedResult });
  return NextResponse.json({ ok: true, deleted: log, seeded: seedResult });
}

type SupabaseClient = ReturnType<typeof createServiceClient>;

async function seedDemoData(supabase: SupabaseClient, uid: string) {
  const today = todayString();
  const daysAgo = (n: number) => addDays(today, -n);

  // Profile
  const profileRows = [
    { user_id: uid, key: "name",               value: "Demo User" },
    { user_id: uid, key: "Identity/Name",       value: "Demo User" },
    { user_id: uid, key: "Identity/Role",       value: "Software Engineer" },
    { user_id: uid, key: "Identity/Location",   value: "San Francisco, CA" },
    { user_id: uid, key: "location_city",       value: "San Francisco" },
    { user_id: uid, key: "weight_goal_lbs",     value: "172" },
    { user_id: uid, key: "body_fat_goal_pct",   value: "15" },
    { user_id: uid, key: "weekly_workout_goal", value: "4" },
    { user_id: uid, key: "calorie_goal",        value: "2200" },
    { user_id: uid, key: "protein_goal",        value: "165" },
    { user_id: uid, key: "sleep.goal.hrs",      value: "8" },
    { user_id: uid, key: "pantry_staples",      value: "olive oil, garlic, onions, rice, pasta, canned tomatoes, eggs, chicken breast" },
    { user_id: uid, key: "dietary_preferences", value: "high protein, moderate carbs; no dietary restrictions" },
    { user_id: uid, key: "cuisine_preferences", value: "Japanese, Mediterranean, American" },
  ];
  await supabase.from("profile").upsert(profileRows, { onConflict: "user_id,key" });

  // Habit registry
  const habitDefs = [
    { name: "Morning workout",   category: "fitness",  emoji: "💪" },
    { name: "Read 20 min",       category: "learning", emoji: "📖" },
    { name: "No alcohol",        category: "health",   emoji: "🚫" },
    { name: "8h sleep",          category: "recovery", emoji: "😴" },
    { name: "Meditate",          category: "mindset",  emoji: "🧘" },
    { name: "Code side project", category: "learning", emoji: "💻" },
    { name: "Journal",           category: "mindset",  emoji: "📝" },
  ];
  const { data: registry } = await supabase
    .from("habit_registry")
    .upsert(
      habitDefs.map((h) => ({ user_id: uid, ...h, active: true })),
      { onConflict: "user_id,name" }
    )
    .select("id, name");

  // Habit logs — ~60% completion over 30 days
  if (registry) {
    const rates: Record<string, number> = {
      "Morning workout": 0.55, "Read 20 min": 0.70, "No alcohol": 0.80,
      "8h sleep": 0.50, "Meditate": 0.45, "Code side project": 0.60, "Journal": 0.35,
    };
    const idMap: Record<string, string> = Object.fromEntries(registry.map((r) => [r.name, r.id]));
    const habitRows = [];
    // Deterministic pseudo-random using day + habit index as seed
    for (let dago = 30; dago > 0; dago--) {
      const d = daysAgo(dago);
      for (let hi = 0; hi < habitDefs.length; hi++) {
        const h = habitDefs[hi];
        const hash = ((dago * 31 + hi * 17) % 100) / 100;
        if (hash < rates[h.name]) {
          habitRows.push({ user_id: uid, habit_id: idMap[h.name], date: d, completed: true });
        }
      }
    }
    await supabase.from("habits").upsert(habitRows, { onConflict: "user_id,habit_id,date" });
  }

  // Tasks
  const taskRows = [
    { user_id: uid, title: "Ship v2 of the search API",          priority: "high",   status: "active",    category: "work",     due_date: daysAgo(-3) },
    { user_id: uid, title: "Write design doc for auth refactor", priority: "high",   status: "active",    category: "work",     due_date: daysAgo(-7) },
    { user_id: uid, title: "Set up home gym pull-up bar",        priority: "medium", status: "active",    category: "fitness"  },
    { user_id: uid, title: "Read Designing Data-Intensive Apps", priority: "medium", status: "active",    category: "learning" },
    { user_id: uid, title: "Schedule dentist appointment",       priority: "low",    status: "active",    category: "personal", due_date: daysAgo(-10) },
    { user_id: uid, title: "Migrate PostgreSQL to v16",          priority: "medium", status: "active",    category: "work",     due_date: daysAgo(-14) },
    { user_id: uid, title: "Review PR: rate limiter service",    priority: "high",   status: "completed", category: "work",     completed_at: `${daysAgo(2)}T10:30:00Z` },
    { user_id: uid, title: "Meal prep for the week",            priority: "low",    status: "completed", category: "personal", completed_at: `${daysAgo(3)}T18:00:00Z` },
    { user_id: uid, title: "30-min cardio 3x this week",        priority: "medium", status: "completed", category: "fitness",  completed_at: `${daysAgo(1)}T07:15:00Z` },
    { user_id: uid, title: "Update resume",                     priority: "low",    status: "completed", category: "personal", completed_at: `${daysAgo(5)}T20:00:00Z` },
  ];
  await supabase.from("tasks").insert(taskRows);

  // Fitness log — 30-day body comp arc
  const fitnessRows = [];
  for (let i = 0; i < 10; i++) {
    const dago = 30 - i * 3;
    const progress = i / 9;
    const hash = ((i * 37) % 10) / 10 - 0.5;
    fitnessRows.push({
      user_id: uid,
      date: daysAgo(dago),
      weight_lb: Math.round((182.0 - 3.0 * progress + hash * 0.5) * 10) / 10,
      body_fat_pct: Math.round((21.0 - 1.0 * progress + hash * 0.3) * 10) / 10,
      bmi: 26.1,
      muscle_mass_lb: Math.round((182.0 - 3.0 * progress) * 0.79 * 10) / 10,
      visceral_fat: 8.0,
      source: "renpho",
    });
  }
  await supabase.from("fitness_log").upsert(fitnessRows, { onConflict: "user_id,date,source" });

  // Workout sessions
  const workoutTemplates = [
    ["Running",         30, 280, 148, "Neighborhood run"],
    ["Weight Training", 55, 320, 138, "Push day"],
    ["Weight Training", 60, 340, 142, "Pull day"],
    ["Cycling",         45, 390, 155, "Bay trail ride"],
    ["HIIT",            25, 310, 162, "Tabata intervals"],
    ["Weight Training", 50, 310, 135, "Leg day"],
    ["Running",         40, 360, 152, "Tempo run"],
    ["Yoga",            45,  95, 105, "Morning flow"],
  ] as const;
  const workoutRows = [];
  let wcount = 0;
  for (let dago = 28; dago > 1 && wcount < 18; dago--) {
    if ((dago * 13) % 7 > 4) continue; // ~57% of days
    const t = workoutTemplates[(dago * 7 + wcount) % workoutTemplates.length];
    workoutRows.push({
      user_id: uid,
      date: daysAgo(dago),
      start_time: `0${6 + (dago % 3)}:${(dago % 2) === 0 ? "00" : "30"}:00`,
      activity: t[0],
      duration_mins: t[1] + (dago % 5) - 2,
      calories: t[2] + (dago % 10) - 5,
      avg_hr: t[3] + (dago % 8) - 4,
      notes: t[4],
      source: "manual",
    });
    wcount++;
  }
  await supabase.from("workout_sessions").insert(workoutRows);

  // Recovery metrics — 30 nights
  const recoveryRows = [];
  for (let dago = 30; dago > 0; dago--) {
    const dateStr = addDays(today, -dago);
    const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const hashA = ((dago * 11) % 10) / 10;
    const hashB = ((dago * 17) % 10) / 10;
    recoveryRows.push({
      user_id: uid,
      date: daysAgo(dago),
      total_sleep_hrs: Math.round(((isWeekend ? 6.8 : 7.4) + hashA * 1.2 - 0.6) * 100) / 100,
      deep_hrs: Math.round((hashA * 0.4 + 1.3) * 100) / 100,
      rem_hrs: Math.round((hashB * 0.5 + 1.6) * 100) / 100,
      avg_hrv: Math.max(25, Math.round(52 + hashA * 16 - 8)),
      resting_hr: Math.max(45, Math.round(58 + hashB * 6 - 3)),
      readiness: Math.min(100, Math.max(40, Math.round(72 + hashA * 20 - 10))),
      sleep_score: Math.min(100, Math.max(40, Math.round(74 + hashB * 16 - 8))),
      active_cal: Math.round(450 + hashA * 160 - 80),
      source: "oura",
    });
  }
  await supabase.from("recovery_metrics").upsert(recoveryRows, { onConflict: "user_id,date" });

  // Study log
  const studyRows = [
    { user_id: uid, date: daysAgo(2),  subject: "System Design",  duration_mins: 45, notes: "Consistent hashing and distributed caches" },
    { user_id: uid, date: daysAgo(4),  subject: "TypeScript",      duration_mins: 60, notes: "Advanced generics and conditional types" },
    { user_id: uid, date: daysAgo(7),  subject: "System Design",  duration_mins: 50, notes: "Kafka vs RabbitMQ" },
    { user_id: uid, date: daysAgo(10), subject: "Algorithms",      duration_mins: 40, notes: "Binary search and sliding window" },
    { user_id: uid, date: daysAgo(14), subject: "Go",              duration_mins: 75, notes: "Custom HTTP middleware chain" },
  ];
  await supabase.from("study_log").insert(studyRows);

  // Journal
  const journalRows = [
    { user_id: uid, date: daysAgo(1),  content: "Good training week. Hit 4 workouts, sleep has been better since cutting caffeine after 2pm.",   response: "Four workouts with improved sleep is solid progress. Caffeine cut is high-ROI." },
    { user_id: uid, date: daysAgo(5),  content: "Struggled this week — only gym twice, big deployment went sideways Thursday.",                    response: "Two workouts during an incident week is load management, not failure. Rest, then reset." },
    { user_id: uid, date: daysAgo(12), content: "Feeling really good. Weight trending down, workouts strong. Thinking about a half marathon.",     response: "Weight down 1.8 lb over 3 weeks. Half marathon is feasible — pick a race date to anchor training." },
    { user_id: uid, date: daysAgo(20), content: "Trying to read more. Barely finish a book a month now — too much phone in the evenings.",         response: "Phone and reading compete for the same time slot. 20-min daily habit applied in the pre-sleep window breaks it." },
  ];
  await supabase.from("journal_entries").insert(journalRows);

  // Recipes
  const recipeRows = [
    { user_id: uid, name: "High-Protein Chicken Bowl", cuisine: "American",      ingredients: "chicken breast, brown rice, broccoli, olive oil, garlic, soy sauce",        instructions: "Grill chicken, serve over rice with steamed broccoli.", tags: ["high-protein", "meal-prep"] },
    { user_id: uid, name: "Greek Salmon",               cuisine: "Mediterranean", ingredients: "salmon fillet, cucumber, Greek yogurt, dill, lemon, olive oil, spinach",     instructions: "Grill salmon, serve with tzatziki and salad.",           tags: ["high-protein", "mediterranean"] },
    { user_id: uid, name: "Overnight Oats",             cuisine: "American",      ingredients: "rolled oats, Greek yogurt, almond milk, chia seeds, banana, berries",        instructions: "Mix and refrigerate overnight. Top with fruit.",          tags: ["breakfast", "meal-prep"] },
    { user_id: uid, name: "Spicy Tuna Rice Bowl",       cuisine: "Japanese",      ingredients: "tuna, white rice, sriracha, mayo, cucumber, avocado, soy sauce",             instructions: "Mix tuna with sriracha/mayo, build bowl with rice.",      tags: ["quick", "japanese"] },
    { user_id: uid, name: "Turkey Stir Fry",            cuisine: "American",      ingredients: "ground turkey, bell peppers, snap peas, garlic, ginger, soy sauce, rice",   instructions: "Brown turkey, stir-fry veggies, serve over rice.",        tags: ["high-protein", "quick"] },
  ];
  await supabase.from("recipes").insert(recipeRows);

  return { tables: ["profile", "habit_registry", "habits", "tasks", "fitness_log", "workout_sessions", "recovery_metrics", "study_log", "journal_entries", "recipes"] };
}
