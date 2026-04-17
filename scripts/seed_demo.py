#!/usr/bin/env python3
"""
Seed the demo account with realistic data for persona:
  Demo User — software engineer, San Francisco

Generates:
  - profile: Demo User, SF location, goals
  - habit_registry + habits: 7 habits, ~60% completion over 30 days
  - tasks: 10 tasks (mix of active + completed)
  - fitness_log: 30-day body composition trend (slow improvement arc)
  - workout_sessions: varied workouts over 30 days
  - recovery_metrics: 30 nights of sleep/HRV data
  - study_log: recent entries
  - journal_entries: 4 entries with demo persona tone
  - recipes + meal_log: 5 saved recipes, 14 days of meals with macros
  - notifications: 6 recent notifications
  - workout_plans: Mon–Fri structured plans for the current week
  - chat_sessions + chat_messages: 3 sample conversations
  - stocks_cache: 3 tickers
  - sports_cache: 3 teams
  - strength_sessions + strength_session_sets: recent lifting sessions (issue #249)

Usage:
  python3 scripts/seed_demo.py

Requires DEMO_USER_ID in .env. Every row is written with
user_id = DEMO_USER_ID — never OWNER_USER_ID, never NULL (see issue #133
for the journal-leak regression this discipline prevents).
"""
from __future__ import annotations

import os
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client

DEMO_USER_ID = os.environ.get("DEMO_USER_ID", "")


def require_demo_user_id():
    if not DEMO_USER_ID:
        print("[error] DEMO_USER_ID not set in .env")
        sys.exit(1)


def today_minus(n: int) -> str:
    return str(date.today() - timedelta(days=n))


def seed_profile(client):
    rows = [
        {"user_id": DEMO_USER_ID, "key": "name",            "value": "Demo User"},
        {"user_id": DEMO_USER_ID, "key": "Identity/Name",   "value": "Demo User"},
        {"user_id": DEMO_USER_ID, "key": "Identity/Role",   "value": "Software Engineer"},
        {"user_id": DEMO_USER_ID, "key": "Identity/Location","value": "San Francisco, CA"},
        {"user_id": DEMO_USER_ID, "key": "location_city",   "value": "San Francisco"},
        {"user_id": DEMO_USER_ID, "key": "weight_goal_lbs", "value": "172"},
        {"user_id": DEMO_USER_ID, "key": "body_fat_goal_pct","value": "15"},
        {"user_id": DEMO_USER_ID, "key": "weekly_workout_goal","value": "4"},
        {"user_id": DEMO_USER_ID, "key": "calorie_goal",    "value": "2200"},
        {"user_id": DEMO_USER_ID, "key": "protein_goal",    "value": "165"},
        {"user_id": DEMO_USER_ID, "key": "sleep.goal.hrs",  "value": "8"},
        {"user_id": DEMO_USER_ID, "key": "pantry_staples",  "value": "olive oil, garlic, onions, rice, pasta, canned tomatoes, eggs, chicken breast"},
        {"user_id": DEMO_USER_ID, "key": "dietary_preferences","value": "high protein, moderate carbs; no dietary restrictions"},
        {"user_id": DEMO_USER_ID, "key": "cuisine_preferences","value": "Japanese, Mediterranean, American"},
    ]
    client.table("profile").upsert(rows, on_conflict="user_id,key").execute()
    print(f"[seed] profile: {len(rows)} keys")


def seed_habits(client):
    habit_defs = [
        ("Morning workout", "fitness",  "💪"),
        ("Read 20 min",     "learning", "📖"),
        ("No alcohol",      "health",   "🚫"),
        ("8h sleep",        "recovery", "😴"),
        ("Meditate",        "mindset",  "🧘"),
        ("Code side project","learning","💻"),
        ("Journal",         "mindset",  "📝"),
    ]

    # Insert registry
    registry_rows = [
        {
            "user_id": DEMO_USER_ID,
            "name":    name,
            "category":cat,
            "emoji":   emoji,
            "active":  True,
        }
        for name, cat, emoji in habit_defs
    ]
    resp = client.table("habit_registry").upsert(
        registry_rows, on_conflict="user_id,name"
    ).execute()
    registry = resp.data
    print(f"[seed] habit_registry: {len(registry)} habits")

    # Build id map
    id_map = {r["name"]: r["id"] for r in registry}

    # Generate 30 days of completions at ~60% rate
    # Some habits are slightly more/less consistent for realism
    completion_rates = {
        "Morning workout":  0.55,
        "Read 20 min":      0.70,
        "No alcohol":       0.80,
        "8h sleep":         0.50,
        "Meditate":         0.45,
        "Code side project":0.60,
        "Journal":          0.35,
    }
    rng = random.Random(42)  # deterministic seed
    habit_rows = []
    for days_ago in range(30, 0, -1):
        d = today_minus(days_ago)
        for name, _, _ in habit_defs:
            if rng.random() < completion_rates[name]:
                habit_rows.append({
                    "user_id":   DEMO_USER_ID,
                    "habit_id":  id_map[name],
                    "date":      d,
                    "completed": True,
                })

    client.table("habits").upsert(
        habit_rows, on_conflict="user_id,habit_id,date"
    ).execute()
    print(f"[seed] habits: {len(habit_rows)} completions over 30 days")


def seed_tasks(client):
    # Parent tasks inserted first so we can capture IDs for subtasks
    parent_tasks = [
        # Active
        {"title": "Ship v2 of the search API",         "priority": "high",   "status": "active",    "category": "work",     "due_date": today_minus(-3)},
        {"title": "Write design doc for auth refactor","priority": "high",   "status": "active",    "category": "work",     "due_date": today_minus(-7)},
        {"title": "Set up home gym pull-up bar",       "priority": "medium", "status": "active",    "category": "fitness",  "due_date": None},
        {"title": "Read Designing Data-Intensive Apps","priority": "medium", "status": "active",    "category": "learning", "due_date": None},
        {"title": "Schedule dentist appointment",      "priority": "low",    "status": "active",    "category": "personal", "due_date": today_minus(-10)},
        {"title": "Migrate PostgreSQL to v16",         "priority": "medium", "status": "active",    "category": "work",     "due_date": today_minus(-14)},
        # Completed
        {"title": "Review PR: rate limiter service",  "priority": "high",   "status": "completed", "category": "work",     "due_date": None, "completed_at": f"{today_minus(2)}T10:30:00Z"},
        {"title": "Meal prep for the week",           "priority": "low",    "status": "completed", "category": "personal", "due_date": None, "completed_at": f"{today_minus(3)}T18:00:00Z"},
        {"title": "30-min cardio 3x this week",       "priority": "medium", "status": "completed", "category": "fitness",  "due_date": None, "completed_at": f"{today_minus(1)}T07:15:00Z"},
        {"title": "Update resume",                    "priority": "low",    "status": "completed", "category": "personal", "due_date": None, "completed_at": f"{today_minus(5)}T20:00:00Z"},
    ]
    parent_rows = [{"user_id": DEMO_USER_ID, **t} for t in parent_tasks]
    resp = client.table("tasks").insert(parent_rows).execute()
    id_map = {r["title"]: r["id"] for r in resp.data}

    # Subtasks referencing parent_id
    subtask_defs = [
        # Under "Ship v2 of the search API"
        ("Ship v2 of the search API", [
            {"title": "Update OpenAPI spec",          "priority": "high",   "status": "completed", "category": "work", "completed_at": f"{today_minus(4)}T11:00:00Z"},
            {"title": "Add rate-limit headers to v2", "priority": "high",   "status": "active",    "category": "work"},
            {"title": "Write migration guide",        "priority": "medium", "status": "active",    "category": "work"},
        ]),
        # Under "Migrate PostgreSQL to v16"
        ("Migrate PostgreSQL to v16", [
            {"title": "Test upgrade on staging",      "priority": "high",   "status": "completed", "category": "work", "completed_at": f"{today_minus(6)}T14:00:00Z"},
            {"title": "Schedule maintenance window",  "priority": "medium", "status": "active",    "category": "work"},
        ]),
    ]
    subtask_rows = []
    for parent_title, children in subtask_defs:
        pid = id_map.get(parent_title)
        if pid:
            for child in children:
                subtask_rows.append({"user_id": DEMO_USER_ID, "parent_id": pid, **child})

    if subtask_rows:
        client.table("tasks").insert(subtask_rows).execute()

    total = len(parent_rows) + len(subtask_rows)
    print(f"[seed] tasks: {len(parent_rows)} tasks + {len(subtask_rows)} subtasks = {total} total")


def seed_fitness(client):
    # 30-day body composition arc: slow improvement
    # Start: 182 lb, 21% BF → End: 179 lb, 20% BF
    rng = random.Random(7)
    fitness_rows = []
    for days_ago in range(30, 0, -3):  # every 3 days = 10 entries
        d = today_minus(days_ago)
        progress = (30 - days_ago) / 30.0  # 0 → 1 over time
        weight = round(182.0 - (3.0 * progress) + rng.uniform(-0.5, 0.5), 1)
        bf_pct = round(21.0 - (1.0 * progress) + rng.uniform(-0.3, 0.3), 1)
        bmi    = round(weight / (70.0 / 0.453592) / (1.78 ** 2) * 703, 1)
        lean   = round(weight * (1 - bf_pct / 100), 1)
        fitness_rows.append({
            "user_id":       DEMO_USER_ID,
            "date":          d,
            "weight_lb":     weight,
            "body_fat_pct":  bf_pct,
            "bmi":           bmi,
            "muscle_mass_lb":lean,
            "visceral_fat":  8.0,
            "source":        "renpho",
        })
    client.table("fitness_log").upsert(fitness_rows, on_conflict="user_id,date,source").execute()
    print(f"[seed] fitness_log: {len(fitness_rows)} body comp entries")


def seed_workouts(client):
    rng = random.Random(13)
    workout_templates = [
        ("Running",          30,  280, 148, "Neighborhood run, good pace"),
        ("Weight Training",  55,  320, 138, "Push day: bench, shoulder press, triceps"),
        ("Weight Training",  60,  340, 142, "Pull day: rows, pulldowns, curls"),
        ("Cycling",          45,  390, 155, "Outdoor ride around the bay trail"),
        ("HIIT",             25,  310, 162, "Tabata intervals"),
        ("Weight Training",  50,  310, 135, "Leg day: squats, RDLs, lunges"),
        ("Running",          40,  360, 152, "Tempo run, 5K in 24 min"),
        ("Yoga",             45,   95, 105, "Morning flow, recovery session"),
    ]
    rows = []
    used_days: set[int] = set()
    for days_ago in range(28, 1, -1):
        if len(rows) >= 18:
            break
        # ~4x/week = skip some days
        if rng.random() > 0.57:
            continue
        if days_ago in used_days:
            continue
        used_days.add(days_ago)
        activity, dur, cal, hr, notes = rng.choice(workout_templates)
        rows.append({
            "user_id":      DEMO_USER_ID,
            "date":         today_minus(days_ago),
            "start_time":   f"0{rng.randint(6,8)}:{'0' if rng.randint(0,1) else '3'}0:00",
            "activity":     activity,
            "duration_mins":dur + rng.randint(-5, 5),
            "calories":     cal + rng.randint(-20, 20),
            "avg_hr":       hr  + rng.randint(-5, 5),
            "notes":        notes,
            "source":       "manual",
        })
    client.table("workout_sessions").insert(rows).execute()
    print(f"[seed] workout_sessions: {len(rows)} sessions")


def seed_recovery(client):
    rng = random.Random(19)
    rows = []
    for days_ago in range(30, 0, -1):
        d = today_minus(days_ago)
        # Simulate a realistic pattern: weekends slightly worse sleep
        weekday = (date.today() - timedelta(days=days_ago)).weekday()  # 0=Mon
        is_weekend = weekday >= 5
        base_sleep = 6.8 if is_weekend else 7.4
        total_sleep = round(base_sleep + rng.uniform(-0.6, 0.6), 2)
        deep  = round(total_sleep * rng.uniform(0.18, 0.22), 2)
        rem   = round(total_sleep * rng.uniform(0.22, 0.27), 2)
        light = round(total_sleep * rng.uniform(0.40, 0.50), 2)
        hrv   = int(rng.gauss(52, 8))
        rhr   = int(rng.gauss(58, 3))
        readiness = int(min(100, max(40, rng.gauss(72, 10))))
        sleep_score = int(min(100, max(40, rng.gauss(74, 8))))
        rows.append({
            "user_id":          DEMO_USER_ID,
            "date":             d,
            "total_sleep_hrs":  total_sleep,
            "deep_hrs":         deep,
            "rem_hrs":          rem,
            "light_hrs":        light,
            "avg_hrv":          max(25, hrv),
            "resting_hr":       max(45, rhr),
            "readiness":        readiness,
            "sleep_score":      sleep_score,
            "active_cal":       int(rng.gauss(450, 80)),
            "steps":            int(rng.gauss(9200, 1800)),
            "activity_score":   int(min(100, max(40, rng.gauss(74, 12)))),
            "spo2_avg":         round(rng.uniform(96.0, 99.0), 1),
            "body_temp_delta":  round(rng.uniform(-0.4, 0.4), 2),
            "source":           "oura",
        })
    client.table("recovery_metrics").upsert(rows, on_conflict="user_id,date").execute()
    print(f"[seed] recovery_metrics: {len(rows)} nights")


def seed_study_log(client):
    entries = [
        {"date": today_minus(2),  "subject": "System Design",     "duration_mins": 45, "notes": "Read chapter on consistent hashing and distributed caches"},
        {"date": today_minus(4),  "subject": "TypeScript",         "duration_mins": 60, "notes": "Worked through advanced generics and conditional types"},
        {"date": today_minus(7),  "subject": "System Design",     "duration_mins": 50, "notes": "Kafka vs RabbitMQ comparison, studied message queue patterns"},
        {"date": today_minus(10), "subject": "Algorithms",         "duration_mins": 40, "notes": "LeetCode: binary search problems, sliding window patterns"},
        {"date": today_minus(14), "subject": "Go",                 "duration_mins": 75, "notes": "Built a small HTTP server with custom middleware chain"},
    ]
    rows = [{"user_id": DEMO_USER_ID, **e} for e in entries]
    client.table("study_log").insert(rows).execute()
    print(f"[seed] study_log: {len(rows)} entries")


def seed_journal(client):
    entries = [
        {
            "date":       today_minus(1),
            "free_write": "Good training week. Hit 4 workouts, sleep has been better since cutting caffeine after 2pm. The search API refactor is almost done — need to ship it by EOD Thursday.",
            "responses":  {"reflection": "Four workouts in a week with improved sleep consistency is real progress. Cutting late caffeine is one of the highest-ROI sleep interventions — worth keeping. Thursday deadline on the search API: block 2 hours tomorrow morning while focus is high."},
        },
        {
            "date":       today_minus(5),
            "free_write": "Struggled with motivation this week. Only made it to the gym twice. Work has been stressful — big deployment went sideways and we spent most of Thursday debugging. Didn't sleep great either.",
            "responses":  {"reflection": "Deployment incidents are draining — context switches plus the stress carry into recovery. Two workouts during a high-stress week is not a failure, it's appropriate load management. Sleep quality after incidents is usually worse. Prioritize one simple, low-demand workout this weekend to reset."},
        },
        {
            "date":       today_minus(12),
            "free_write": "Feeling really good lately. Weight is trending down, workouts feel strong. Starting to think about running a half marathon in the spring.",
            "responses":  {"reflection": "Trend confirmation: weight down 1.8 lb over three weeks, body fat moving in the right direction. Half marathon in spring is feasible — base mileage is already there from the weekly runs. Recommend picking a specific race date; having it on the calendar changes training discipline."},
        },
        {
            "date":       today_minus(20),
            "free_write": "Trying to get back into reading more. Used to read a book a week in college, now barely finish one a month. Too much time on my phone in the evenings.",
            "responses":  {"reflection": "Reading volume drops when phone use fills the same time slot — they compete directly. The 20-min daily reading habit you added addresses this if applied consistently in the pre-sleep window. Rate yourself on the habit at end of week rather than end of day; it reduces the friction of individual misses."},
        },
    ]
    rows = [{"user_id": DEMO_USER_ID, **e} for e in entries]
    client.table("journal_entries").insert(rows).execute()
    print(f"[seed] journal_entries: {len(rows)} entries")


def seed_recipes(client):
    recipes = [
        {
            "name":         "High-Protein Chicken Bowl",
            "cuisine":      "American",
            "ingredients":  "chicken breast 6oz, brown rice 1 cup cooked, broccoli 1 cup, olive oil, garlic, soy sauce, sesame oil",
            "instructions": "Season chicken with garlic and olive oil, grill or pan-sear 6 min/side. Serve over rice with steamed broccoli. Drizzle soy sauce and sesame oil.",
            "tags":         ["high-protein", "meal-prep", "quick"],
        },
        {
            "name":         "Greek Salmon with Tzatziki",
            "cuisine":      "Mediterranean",
            "ingredients":  "salmon fillet 6oz, cucumber, Greek yogurt, dill, lemon, garlic, olive oil, cherry tomatoes, spinach",
            "instructions": "Marinate salmon in lemon, olive oil, garlic. Grill 4 min/side. Make tzatziki: grated cucumber + yogurt + dill + garlic. Serve with salad.",
            "tags":         ["high-protein", "omega-3", "mediterranean"],
        },
        {
            "name":         "Overnight Oats",
            "cuisine":      "American",
            "ingredients":  "rolled oats 1/2 cup, Greek yogurt 1/2 cup, almond milk 1/2 cup, chia seeds 1 tbsp, banana, honey, mixed berries",
            "instructions": "Combine oats, yogurt, milk, chia seeds in jar. Refrigerate overnight. Top with banana and berries before eating.",
            "tags":         ["breakfast", "meal-prep", "high-protein"],
        },
        {
            "name":         "Spicy Tuna Rice Bowl",
            "cuisine":      "Japanese",
            "ingredients":  "tuna canned 5oz, white rice 1 cup cooked, sriracha, mayo 1 tbsp, cucumber, avocado, soy sauce, sesame seeds",
            "instructions": "Mix tuna with sriracha and mayo. Build bowl: rice base, tuna, sliced cucumber, avocado. Top with soy sauce and sesame seeds.",
            "tags":         ["quick", "japanese", "high-protein"],
        },
        {
            "name":         "Turkey and Veggie Stir Fry",
            "cuisine":      "American",
            "ingredients":  "ground turkey 8oz, bell peppers 2, snap peas 1 cup, onion, garlic, ginger, soy sauce, oyster sauce, sesame oil, brown rice",
            "instructions": "Brown turkey in wok. Add garlic, ginger, onion, peppers, snap peas. Stir fry 5 min. Add sauces, toss, serve over rice.",
            "tags":         ["high-protein", "meal-prep", "quick"],
        },
    ]
    rows = [{"user_id": DEMO_USER_ID, **r} for r in recipes]
    resp = client.table("recipes").insert(rows).execute()
    print(f"[seed] recipes: {len(rows)} recipes")
    # Return name → id map for meal_log seeding
    return {r["name"]: r["id"] for r in resp.data}


def seed_meal_log(client, recipe_ids: dict):
    """14 days of meals with realistic macros. Some entries reference saved recipes."""
    rng = random.Random(31)

    # (meal_type, recipe_name_or_None, notes, cal, protein, carbs, fat, fiber, sugar, sodium)
    meal_templates = [
        ("breakfast", "Overnight Oats",              "Pre-workout",              420, 28, 54, 10, 7, 22, 180),
        ("breakfast", None,                           "Scrambled eggs + toast",   380, 30, 32,  9, 2,  4, 520),
        ("breakfast", None,                           "Greek yogurt + granola",   350, 22, 42,  8, 3, 18, 210),
        ("lunch",     "High-Protein Chicken Bowl",    "Meal prep",                540, 48, 52,  9, 5,  3, 680),
        ("lunch",     "Spicy Tuna Rice Bowl",         None,                       490, 42, 50,  8, 3,  2, 760),
        ("lunch",     None,                           "Turkey wrap + side salad", 510, 38, 45, 12, 4,  6, 890),
        ("dinner",    "Greek Salmon with Tzatziki",   None,                       520, 46, 18, 24, 3,  5, 640),
        ("dinner",    "Turkey and Veggie Stir Fry",   "Extra rice",               580, 50, 58, 12, 6,  8, 820),
        ("dinner",    None,                           "Steak + roasted potatoes", 650, 52, 44, 22, 4,  3, 740),
        ("snack",     None,                           "Protein shake",            180, 25,  8,  4, 1,  5, 220),
        ("snack",     None,                           "Apple + peanut butter",    210,  6, 28,  9, 4, 18,  80),
    ]

    rows = []
    for days_ago in range(14, 0, -1):
        d = today_minus(days_ago)
        # 2–3 meals + occasional snack per day
        daily_templates = rng.sample(meal_templates[:3], 1)      # 1 breakfast
        daily_templates += rng.sample(meal_templates[3:6], 1)    # 1 lunch
        daily_templates += rng.sample(meal_templates[6:9], 1)    # 1 dinner
        if rng.random() < 0.55:
            daily_templates += rng.sample(meal_templates[9:], 1) # occasional snack

        for meal_type, recipe_name, notes, cal, protein, carbs, fat, fiber, sugar, sodium in daily_templates:
            rid = recipe_ids.get(recipe_name) if recipe_name else None
            rows.append({
                "user_id":   DEMO_USER_ID,
                "date":      d,
                "meal_type": meal_type,
                "recipe_id": rid,
                "notes":     notes,
                "calories":  cal  + rng.randint(-30, 30),
                "protein_g": round(protein + rng.uniform(-3, 3), 1),
                "carbs_g":   round(carbs   + rng.uniform(-5, 5), 1),
                "fat_g":     round(fat     + rng.uniform(-2, 2), 1),
                "fiber_g":   round(fiber   + rng.uniform(-0.5, 0.5), 1),
                "sugar_g":   round(sugar   + rng.uniform(-0.8, 0.8), 1),
                "sodium_mg": sodium + rng.randint(-80, 80),
                "source":    "manual",
            })

    # Idempotent re-run: upsert on (user_id, date, meal_type, recipe_id).
    # recipe_id is nullable; Postgres treats NULLs as distinct, so ad-hoc meals
    # on the same day/meal_type don't collide — matches real logging patterns.
    client.table("meal_log").upsert(
        rows, on_conflict="user_id,date,meal_type,recipe_id"
    ).execute()
    print(f"[seed] meal_log: {len(rows)} entries over 14 days")


def seed_notifications(client):
    """Recent notifications spanning the past week — mix of types, some read."""
    rows = [
        {
            "user_id": DEMO_USER_ID,
            "type":    "hrv_alert",
            "title":   "HRV declining",
            "body":    "HRV has dropped 3 consecutive days (58 → 52 → 46 ms). Prioritize recovery today.",
            "sent_at": f"{today_minus(1)}T07:05:00Z",
            "read_at": f"{today_minus(1)}T07:31:00Z",
        },
        {
            "user_id": DEMO_USER_ID,
            "type":    "task_due",
            "title":   "Task overdue: Schedule dentist appointment",
            "body":    "This task was due 10 days ago and is still open.",
            "sent_at": f"{today_minus(2)}T09:00:00Z",
            "read_at": None,
        },
        {
            "user_id": DEMO_USER_ID,
            "type":    "journal_reminder",
            "title":   "Journal reminder",
            "body":    "You haven't journaled in 4 days.",
            "sent_at": f"{today_minus(3)}T20:00:00Z",
            "read_at": f"{today_minus(3)}T20:45:00Z",
        },
        {
            "user_id": DEMO_USER_ID,
            "type":    "weather",
            "title":   "Rain expected today",
            "body":    "0.4 in of rain forecast for San Francisco. Move outdoor run indoors or reschedule.",
            "sent_at": f"{today_minus(4)}T06:30:00Z",
            "read_at": f"{today_minus(4)}T06:32:00Z",
        },
        {
            "user_id": DEMO_USER_ID,
            "type":    "task_due",
            "title":   "Task due soon: Ship v2 of the search API",
            "body":    "Due in 3 days.",
            "sent_at": f"{today_minus(0)}T09:00:00Z",
            "read_at": None,
        },
        {
            "user_id": DEMO_USER_ID,
            "type":    "birthday",
            "title":   "Upcoming birthday",
            "body":    "Mom's birthday is in 5 days.",
            "sent_at": f"{today_minus(0)}T08:00:00Z",
            "read_at": None,
        },
    ]
    client.table("notifications").insert(rows).execute()
    print(f"[seed] notifications: {len(rows)} entries")


def seed_workout_plans(client):
    """One week of structured workout plans (Mon–Fri) anchored around today."""
    # Find the most recent Monday as anchor
    today = date.today()
    days_since_monday = today.weekday()  # 0=Mon
    monday = today - timedelta(days=days_since_monday)

    plans = [
        {
            "offset": 0,  # Monday
            "name": "Push Day",
            "warmup": [
                {"exercise": "Arm circles",        "sets": 2, "reps": "30 sec", "notes": "Forward + backward"},
                {"exercise": "Band pull-aparts",   "sets": 2, "reps": "15"},
                {"exercise": "Light DB press",     "sets": 1, "reps": "15",    "weight_lbs": 25},
            ],
            "workout": [
                {"exercise": "Barbell bench press","sets": 4, "reps": "6–8",   "weight_lbs": 185},
                {"exercise": "Incline DB press",   "sets": 3, "reps": "10",    "weight_lbs": 65},
                {"exercise": "Shoulder press",     "sets": 3, "reps": "10",    "weight_lbs": 115},
                {"exercise": "Lateral raises",     "sets": 3, "reps": "15",    "weight_lbs": 20},
                {"exercise": "Tricep pushdowns",   "sets": 3, "reps": "12",    "weight_lbs": 50},
            ],
            "cooldown": [
                {"exercise": "Chest stretch",      "sets": 1, "reps": "60 sec"},
                {"exercise": "Shoulder cross-body","sets": 1, "reps": "30 sec each"},
            ],
            "notes": "Focus on progressive overload — add 5 lb to bench if all 4 sets felt clean.",
        },
        {
            "offset": 1,  # Tuesday
            "name": "Pull Day",
            "warmup": [
                {"exercise": "Cat-cow",            "sets": 2, "reps": "10"},
                {"exercise": "Scapular retractions","sets": 2,"reps": "15"},
                {"exercise": "Face pulls",         "sets": 2, "reps": "15",    "weight_lbs": 30},
            ],
            "workout": [
                {"exercise": "Barbell row",        "sets": 4, "reps": "6–8",   "weight_lbs": 165},
                {"exercise": "Lat pulldown",       "sets": 3, "reps": "10",    "weight_lbs": 130},
                {"exercise": "Seated cable row",   "sets": 3, "reps": "12",    "weight_lbs": 120},
                {"exercise": "DB curl",            "sets": 3, "reps": "12",    "weight_lbs": 35},
                {"exercise": "Hammer curl",        "sets": 2, "reps": "15",    "weight_lbs": 30},
            ],
            "cooldown": [
                {"exercise": "Lat stretch",        "sets": 1, "reps": "45 sec each"},
                {"exercise": "Bicep wall stretch", "sets": 1, "reps": "30 sec each"},
            ],
            "notes": None,
        },
        {
            "offset": 2,  # Wednesday
            "name": "Zone 2 Cardio",
            "warmup": [
                {"exercise": "Easy walk",          "sets": 1, "reps": "5 min"},
            ],
            "workout": [
                {"exercise": "Treadmill run",      "sets": 1, "reps": "35 min", "notes": "HR 130–145 bpm, conversational pace"},
            ],
            "cooldown": [
                {"exercise": "Walk",               "sets": 1, "reps": "5 min"},
                {"exercise": "Hip flexor stretch", "sets": 1, "reps": "45 sec each"},
                {"exercise": "Calf stretch",       "sets": 1, "reps": "30 sec each"},
            ],
            "notes": "Recovery-focused day. Keep HR below 145.",
        },
        {
            "offset": 3,  # Thursday
            "name": "Leg Day",
            "warmup": [
                {"exercise": "Leg swings",         "sets": 2, "reps": "20 each"},
                {"exercise": "Goblet squat",       "sets": 2, "reps": "10",    "weight_lbs": 35},
                {"exercise": "Hip circles",        "sets": 1, "reps": "10 each"},
            ],
            "workout": [
                {"exercise": "Back squat",         "sets": 4, "reps": "6–8",   "weight_lbs": 205},
                {"exercise": "Romanian deadlift",  "sets": 3, "reps": "10",    "weight_lbs": 175},
                {"exercise": "Leg press",          "sets": 3, "reps": "12",    "weight_lbs": 270},
                {"exercise": "Walking lunges",     "sets": 3, "reps": "12 each","weight_lbs": 40},
                {"exercise": "Leg curl",           "sets": 3, "reps": "12",    "weight_lbs": 80},
                {"exercise": "Calf raise",         "sets": 4, "reps": "15",    "weight_lbs": 160},
            ],
            "cooldown": [
                {"exercise": "Pigeon pose",        "sets": 1, "reps": "60 sec each"},
                {"exercise": "Quad stretch",       "sets": 1, "reps": "30 sec each"},
                {"exercise": "Hamstring stretch",  "sets": 1, "reps": "45 sec each"},
            ],
            "notes": "Squat form check: knees tracking over toes, depth to parallel minimum.",
        },
        {
            "offset": 4,  # Friday
            "name": "Upper Accessory + Core",
            "warmup": [
                {"exercise": "Resistance band row","sets": 2, "reps": "15"},
                {"exercise": "Thoracic rotation",  "sets": 2, "reps": "10 each"},
            ],
            "workout": [
                {"exercise": "Pull-ups",           "sets": 4, "reps": "max",   "notes": "Bodyweight — aim for 8+"},
                {"exercise": "DB shoulder press",  "sets": 3, "reps": "12",    "weight_lbs": 55},
                {"exercise": "Cable face pull",    "sets": 3, "reps": "15",    "weight_lbs": 40},
                {"exercise": "Plank",              "sets": 3, "reps": "45 sec"},
                {"exercise": "Dead bug",           "sets": 3, "reps": "10 each"},
                {"exercise": "Cable crunch",       "sets": 3, "reps": "15",    "weight_lbs": 60},
            ],
            "cooldown": [
                {"exercise": "Child's pose",       "sets": 1, "reps": "60 sec"},
                {"exercise": "Doorway chest stretch","sets": 1,"reps": "30 sec each"},
            ],
            "notes": "Deload week option: drop all weights by 20% and focus on form.",
        },
    ]

    rows = []
    for p in plans:
        offset = p.pop("offset")
        plan_date = str(monday + timedelta(days=offset))
        rows.append({
            "user_id":  DEMO_USER_ID,
            "date":     plan_date,
            **p,
        })

    client.table("workout_plans").upsert(rows, on_conflict="user_id,date").execute()
    print(f"[seed] workout_plans: {len(rows)} plans (Mon–Fri current week)")


def seed_chat(client):
    """3 sample conversations covering meal Q&A, scheduling, and workout tweaks.
    chat_messages has a `position` column (migration 20260413000005) for deterministic
    ordering inside a session — we set it explicitly starting at 1.
    """
    sessions = [
        {
            "device":     "web",
            "summary":    "Post-workout meal planning",
            "started_at_offset_hrs": 3,
            "messages": [
                ("user",      "What should I eat after today's leg day to hit my protein goal?"),
                ("assistant", "You're at 112 g protein with 53 g left against a 165 g goal. Post-lift target: 40–50 g in the next hour. Options from your saved recipes:\n\n- High-Protein Chicken Bowl — 48 g protein, 540 kcal\n- Greek Salmon with Tzatziki — 46 g protein, 520 kcal\n\nChicken bowl is the cheaper fit: closer to your 2,200 kcal target with the meals already logged."),
                ("user",      "Go with the chicken bowl. Log it."),
                ("assistant", "Logged: High-Protein Chicken Bowl (dinner, 540 kcal, 48 g protein). Daily total now 160 g protein — 5 g from goal."),
            ],
        },
        {
            "device":     "web",
            "summary":    "Finding time for a 30-min review",
            "started_at_offset_hrs": 26,
            "messages": [
                ("user",      "I need 30 minutes this week to review the auth refactor design doc. When's clear?"),
                ("assistant", "Your calendar this week (ignoring focus blocks):\n\n- Tue 2:30–3:00 PM — open\n- Wed 10:00–11:00 AM — open\n- Thu 4:00–4:30 PM — open\n\nThu 4:00 PM is the weakest fit (post-lunch focus dip + Friday deadline pressure). Recommend Tue 2:30 PM — you're sharpest mid-afternoon based on your study log history."),
                ("user",      "Tuesday 2:30 works. Block it."),
                ("assistant", "Blocked: Tue 2:30–3:00 PM \"Review auth refactor design doc\" on your primary calendar. Linked to task \"Write design doc for auth refactor\"."),
            ],
        },
        {
            "device":     "web",
            "summary":    "Pull day swap — lingering soreness",
            "started_at_offset_hrs": 50,
            "messages": [
                ("user",      "Lats and traps still wrecked from Monday. Do I push through pull day tomorrow or swap?"),
                ("assistant", "DOMS in the target muscle group 72+ hours out is a signal, not a virtue — training through it degrades quality and recovery.\n\nOptions:\n\n1. Swap pull → zone 2 cardio (Wed's planned session). Lets lats recover one more day. Lowest risk.\n2. Swap pull → accessory + core (Fri's planned session). Still gets upper-body work in a non-pulling pattern.\n3. Push through at 70% weight. Worst of both — reduced stimulus with continued recovery debt.\n\nRecommendation: option 1. I'll move pull to Wednesday and cardio to tomorrow."),
                ("user",      "Do it."),
                ("assistant", "Updated plan: Tuesday → Zone 2 Cardio (35 min treadmill). Wednesday → Pull Day. Friday's accessory session stays."),
            ],
        },
    ]

    session_rows = [
        {
            "user_id":        DEMO_USER_ID,
            "device":         s["device"],
            "summary":        s["summary"],
            "started_at":     (datetime.utcnow() - timedelta(hours=s["started_at_offset_hrs"])).isoformat() + "Z",
            "last_active_at": (datetime.utcnow() - timedelta(hours=s["started_at_offset_hrs"]) + timedelta(minutes=8)).isoformat() + "Z",
        }
        for s in sessions
    ]
    resp = client.table("chat_sessions").insert(session_rows).execute()
    session_ids = [r["id"] for r in resp.data]

    message_rows = []
    for sid, session in zip(session_ids, sessions):
        for position, (role, content) in enumerate(session["messages"], start=1):
            message_rows.append({
                "user_id":    DEMO_USER_ID,
                "session_id": sid,
                "role":       role,
                "content":    content,
                "position":   position,
            })
    client.table("chat_messages").insert(message_rows).execute()
    print(f"[seed] chat_sessions: {len(session_rows)} sessions, chat_messages: {len(message_rows)} messages")


def seed_stocks(client):
    """Watchlist cache — 3 tickers with recent quote + 20-point sparkline."""
    rng = random.Random(53)

    def sparkline(base_price: float, spread_pct: float = 0.04) -> list[float]:
        pts = []
        price = base_price * (1 - spread_pct / 2)
        for _ in range(20):
            price += rng.uniform(-base_price * 0.008, base_price * 0.008)
            pts.append(round(price, 2))
        return pts

    tickers = [
        ("AAPL", 218.45, 1.82,  0.84),
        ("NVDA", 142.30, -2.15, -1.49),
        ("MSFT", 425.60, 3.40,  0.80),
    ]
    rows = [
        {
            "user_id":    DEMO_USER_ID,
            "ticker":     ticker,
            "price":      price,
            "change_abs": change_abs,
            "change_pct": change_pct,
            "sparkline":  sparkline(price),
        }
        for ticker, price, change_abs, change_pct in tickers
    ]
    client.table("stocks_cache").upsert(rows, on_conflict="user_id,ticker").execute()
    print(f"[seed] stocks_cache: {len(rows)} tickers")


def seed_sports(client):
    """Favorites cache — 3 teams across NBA / NFL / MLS."""
    teams = [
        {
            "team_id": "9",
            "league":  "nba",
            "data": {
                "name":       "Golden State Warriors",
                "abbreviation":"GSW",
                "record":     "28-22",
                "last_game":  {"opponent": "LAL", "result": "W", "score": "118-112", "date": today_minus(1)},
                "next_game":  {"opponent": "DEN", "date": today_minus(-2), "home": True},
            },
        },
        {
            "team_id": "25",
            "league":  "nfl",
            "data": {
                "name":       "San Francisco 49ers",
                "abbreviation":"SF",
                "record":     "11-6",
                "last_game":  {"opponent": "SEA", "result": "W", "score": "27-17", "date": today_minus(5)},
                "next_game":  {"opponent": "DAL", "date": today_minus(-4), "home": False},
            },
        },
        {
            "team_id": "11690",
            "league":  "mls",
            "data": {
                "name":       "San Jose Earthquakes",
                "abbreviation":"SJ",
                "record":     "6-8-4",
                "last_game":  {"opponent": "LA", "result": "D", "score": "1-1", "date": today_minus(3)},
                "next_game":  {"opponent": "POR", "date": today_minus(-6), "home": True},
            },
        },
    ]
    rows = [{"user_id": DEMO_USER_ID, **t} for t in teams]
    client.table("sports_cache").upsert(
        rows, on_conflict="user_id,team_id,league"
    ).execute()
    print(f"[seed] sports_cache: {len(rows)} teams")


def seed_strength(client):
    """Logged strength sessions + sets (issue #249) — 6 sessions over 3 weeks.
    strength_session_sets has no user_id column; scoping is enforced via the
    parent strength_sessions.user_id through an RLS subquery policy (see
    migration 20260416000000). The seed still references only session IDs
    created with user_id = DEMO_USER_ID, so the FK path is tight.
    """
    sessions_def = [
        # (days_ago, start_hour, duration_mins, perceived_effort, notes, exercises)
        # exercises: list of (name, [(weight_lbs, reps, rpe)])
        (1, 18, 62, 7, "Pull day — felt strong on rows", [
            ("Barbell row",     [(165, 8, 7.0), (165, 8, 7.5), (175, 6, 8.0), (175, 5, 8.5)]),
            ("Lat pulldown",    [(130, 10, 7.0), (130, 10, 7.5), (130, 9, 8.0)]),
            ("Seated cable row",[(120, 12, 7.0), (120, 11, 7.5), (120, 10, 8.0)]),
            ("DB curl",         [(35, 12, 7.0), (35, 11, 7.5), (35, 10, 8.0)]),
        ]),
        (3, 7, 58, 8, "Leg day — squats grinding by set 3", [
            ("Back squat",       [(205, 8, 7.5), (205, 7, 8.0), (205, 6, 8.5), (205, 5, 9.0)]),
            ("Romanian deadlift",[(175, 10, 7.0), (175, 10, 7.5), (175, 9, 8.0)]),
            ("Leg press",        [(270, 12, 7.0), (290, 10, 7.5), (290, 9, 8.0)]),
            ("Walking lunges",   [(40, 12, 7.5), (40, 12, 8.0)]),
        ]),
        (6, 18, 55, 7, "Push day — bench up 5 lb from last week", [
            ("Barbell bench press",[(185, 7, 7.5), (185, 7, 8.0), (185, 6, 8.5), (185, 5, 9.0)]),
            ("Incline DB press",   [(65, 10, 7.0), (65, 10, 7.5), (65, 9, 8.0)]),
            ("Shoulder press",     [(115, 10, 7.5), (115, 9, 8.0), (115, 8, 8.5)]),
            ("Tricep pushdowns",   [(50, 12, 7.0), (50, 12, 7.5), (50, 11, 8.0)]),
        ]),
        (9, 18, 60, 7, "Pull day", [
            ("Barbell row",     [(160, 8, 7.0), (160, 8, 7.5), (170, 6, 8.0), (170, 5, 8.5)]),
            ("Lat pulldown",    [(125, 10, 7.0), (125, 10, 7.5), (125, 9, 8.0)]),
            ("DB curl",         [(35, 12, 7.0), (35, 10, 7.5), (35, 9, 8.0)]),
        ]),
        (11, 7, 56, 8, "Leg day — knees warm today", [
            ("Back squat",       [(200, 8, 7.5), (200, 8, 8.0), (200, 6, 8.5)]),
            ("Romanian deadlift",[(170, 10, 7.0), (170, 10, 7.5), (170, 9, 8.0)]),
            ("Leg press",        [(270, 12, 7.0), (270, 11, 7.5), (270, 10, 8.0)]),
        ]),
        (14, 18, 50, 6, "Push — deload, focus on form", [
            ("Barbell bench press",[(155, 10, 6.5), (155, 10, 7.0), (155, 9, 7.5)]),
            ("Incline DB press",   [(55, 12, 6.5), (55, 12, 7.0), (55, 11, 7.5)]),
            ("Shoulder press",     [(95, 12, 6.5), (95, 12, 7.0), (95, 11, 7.5)]),
        ]),
    ]

    def lbs_to_kg(lbs: float) -> float:
        return round(lbs * 0.453592, 2)

    session_rows = []
    for days_ago, start_hour, duration, rpe, notes, _ in sessions_def:
        start_dt = datetime.combine(date.today() - timedelta(days=days_ago), datetime.min.time()) + timedelta(hours=start_hour)
        end_dt = start_dt + timedelta(minutes=duration)
        session_rows.append({
            "user_id":          DEMO_USER_ID,
            "performed_on":     str(start_dt.date()),
            "started_at":       start_dt.isoformat() + "Z",
            "completed_at":     end_dt.isoformat() + "Z",
            "perceived_effort": rpe,
            "notes":            notes,
        })
    resp = client.table("strength_sessions").insert(session_rows).execute()
    session_ids = [r["id"] for r in resp.data]

    set_rows = []
    for session_id, (_, _, _, _, _, exercises) in zip(session_ids, sessions_def):
        for order, (exercise_name, sets) in enumerate(exercises, start=1):
            for set_number, (weight_lbs, reps, rpe) in enumerate(sets, start=1):
                set_rows.append({
                    "session_id":     session_id,
                    "exercise_name":  exercise_name,
                    "exercise_order": order,
                    "set_number":     set_number,
                    "weight_kg":      lbs_to_kg(weight_lbs),
                    "reps":           reps,
                    "rpe":            rpe,
                    "completed":      True,
                })
    client.table("strength_session_sets").insert(set_rows).execute()
    print(f"[seed] strength_sessions: {len(session_rows)} sessions, strength_session_sets: {len(set_rows)} sets")


def main():
    require_demo_user_id()
    client = get_client()

    print(f"[seed] Seeding demo account: {DEMO_USER_ID}")
    seed_profile(client)
    seed_habits(client)
    seed_tasks(client)
    seed_fitness(client)
    seed_workouts(client)
    seed_recovery(client)
    seed_study_log(client)
    seed_journal(client)
    recipe_ids = seed_recipes(client)
    seed_meal_log(client, recipe_ids)
    seed_notifications(client)
    seed_workout_plans(client)
    seed_chat(client)
    seed_stocks(client)
    seed_sports(client)
    seed_strength(client)
    print("[seed] Done.")


if __name__ == "__main__":
    main()
