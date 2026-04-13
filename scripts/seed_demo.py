#!/usr/bin/env python3
"""
Seed the demo account with realistic data for persona:
  Alex Chen — software engineer, San Francisco

Generates:
  - profile: Alex Chen, SF location, goals
  - habit_registry + habits: 7 habits, ~60% completion over 30 days
  - tasks: 10 tasks (mix of active + completed)
  - fitness_log: 30-day body composition trend (slow improvement arc)
  - workout_sessions: varied workouts over 30 days
  - recovery_metrics: 30 nights of sleep/HRV data
  - study_log: recent entries
  - journal_entries: 4 entries with demo persona tone

Usage:
  python3 scripts/seed_demo.py

Requires DEMO_USER_ID in .env.
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
        {"user_id": DEMO_USER_ID, "key": "name",            "value": "Alex"},
        {"user_id": DEMO_USER_ID, "key": "Identity/Name",   "value": "Alex Chen"},
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
        habit_rows, on_conflict="habit_id,date"
    ).execute()
    print(f"[seed] habits: {len(habit_rows)} completions over 30 days")


def seed_tasks(client):
    tasks = [
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
    rows = [{"user_id": DEMO_USER_ID, **t} for t in tasks]
    client.table("tasks").insert(rows).execute()
    print(f"[seed] tasks: {len(rows)}")


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
        hrv   = int(rng.gauss(52, 8))
        rhr   = int(rng.gauss(58, 3))
        readiness = int(min(100, max(40, rng.gauss(72, 10))))
        sleep_score = int(min(100, max(40, rng.gauss(74, 8))))
        rows.append({
            "user_id":        DEMO_USER_ID,
            "date":           d,
            "total_sleep_hrs":total_sleep,
            "deep_hrs":       deep,
            "rem_hrs":        rem,
            "avg_hrv":        max(25, hrv),
            "resting_hr":     max(45, rhr),
            "readiness":      readiness,
            "sleep_score":    sleep_score,
            "active_cal":     int(rng.gauss(450, 80)),
            "source":         "oura",
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
            "date":     today_minus(1),
            "content":  "Good training week. Hit 4 workouts, sleep has been better since cutting caffeine after 2pm. The search API refactor is almost done — need to ship it by EOD Thursday.",
            "response": "Four workouts in a week with improved sleep consistency is real progress. Cutting late caffeine is one of the highest-ROI sleep interventions — worth keeping. Thursday deadline on the search API: block 2 hours tomorrow morning while focus is high.",
        },
        {
            "date":     today_minus(5),
            "content":  "Struggled with motivation this week. Only made it to the gym twice. Work has been stressful — big deployment went sideways and we spent most of Thursday debugging. Didn't sleep great either.",
            "response": "Deployment incidents are draining — context switches plus the stress carry into recovery. Two workouts during a high-stress week is not a failure, it's appropriate load management. Sleep quality after incidents is usually worse. Prioritize one simple, low-demand workout this weekend to reset.",
        },
        {
            "date":     today_minus(12),
            "content":  "Feeling really good lately. Weight is trending down, workouts feel strong. Starting to think about running a half marathon in the spring.",
            "response": "Trend confirmation: weight down 1.8 lb over three weeks, body fat moving in the right direction. Half marathon in spring is feasible — base mileage is already there from the weekly runs. Recommend picking a specific race date; having it on the calendar changes training discipline.",
        },
        {
            "date":     today_minus(20),
            "content":  "Trying to get back into reading more. Used to read a book a week in college, now barely finish one a month. Too much time on my phone in the evenings.",
            "response": "Reading volume drops when phone use fills the same time slot — they compete directly. The 20-min daily reading habit you added addresses this if applied consistently in the pre-sleep window. Rate yourself on the habit at end of week rather than end of day; it reduces the friction of individual misses.",
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
    client.table("recipes").insert(rows).execute()
    print(f"[seed] recipes: {len(rows)} recipes")


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
    seed_recipes(client)
    print("[seed] Done.")


if __name__ == "__main__":
    main()
