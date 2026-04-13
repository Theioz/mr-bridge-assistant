#!/usr/bin/env python3
"""
Fetch all data needed for the Mr. Bridge session briefing from Supabase.
Outputs structured text that Claude reads instead of loading markdown files.

Usage: python3 scripts/fetch_briefing_data.py
"""
from __future__ import annotations

import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, get_owner_user_id
from fetch_weather import fetch_weather, format_weather_line


def fmt_hrs(h) -> str:
    if h is None:
        return "—"
    hours = int(h)
    mins = round((h - hours) * 60)
    return f"{hours}h {mins:02d}m"


def main():
    client = get_client()
    uid = get_owner_user_id()
    today = str(date.today())
    yesterday = str(date.today() - timedelta(days=1))
    seven_days_ago = str(date.today() - timedelta(days=7))

    # ── Query functions (closures) ─────────────────────────────────────────────

    def q_profile():
        return client.table("profile").select("key,value").eq("user_id", uid).execute().data

    def q_tasks():
        return (
            client.table("tasks")
            .select("title,priority,due_date,status")
            .eq("user_id", uid)
            .eq("status", "active")
            .order("due_date", desc=False)
            .execute()
            .data
        )

    def q_habit_registry():
        return client.table("habit_registry").select("id,name").eq("active", True).eq("user_id", uid).execute().data

    def q_habits():
        return (
            client.table("habits")
            .select("habit_id,date,completed")
            .eq("user_id", uid)
            .gte("date", seven_days_ago)
            .lte("date", today)
            .execute()
            .data
        )

    def q_fitness_log():
        return (
            client.table("fitness_log")
            .select("date,weight_lb,body_fat_pct,bmi,muscle_mass_lb,visceral_fat,source")
            .eq("user_id", uid)
            .not_.is_("body_fat_pct", "null")
            .order("date", desc=True)
            .limit(2)
            .execute()
            .data
        )

    def q_workout_yesterday():
        return (
            client.table("workout_sessions")
            .select("activity,duration_mins,calories,avg_hr,start_time")
            .eq("user_id", uid)
            .eq("date", yesterday)
            .order("start_time")
            .execute()
            .data
        )

    def q_workout_today():
        return (
            client.table("workout_sessions")
            .select("activity,duration_mins,calories,avg_hr,start_time")
            .eq("user_id", uid)
            .eq("date", today)
            .order("start_time")
            .execute()
            .data
        )

    def q_recovery():
        return (
            client.table("recovery_metrics")
            .select("*")
            .eq("user_id", uid)
            .order("date", desc=True)
            .limit(1)
            .execute()
            .data
        )

    def q_study_log():
        return (
            client.table("study_log")
            .select("date,subject,duration_mins,notes")
            .eq("user_id", uid)
            .gte("date", seven_days_ago)
            .order("date", desc=True)
            .execute()
            .data
        )

    def q_meal_log():
        return (
            client.table("meal_log")
            .select("date,meal_type,notes,recipe_id")
            .eq("user_id", uid)
            .gte("date", seven_days_ago)
            .order("date", desc=True)
            .execute()
            .data
        )

    def q_weather():
        # Fetch profile first so fetch_weather doesn't make a second profile query
        # (profile is fetched in the same tier1 batch; if it races we fall back gracefully)
        try:
            return fetch_weather(client=client)
        except Exception as e:
            return {"error": str(e)}

    def q_recipes(recipe_ids: list):
        return (
            client.table("recipes")
            .select("id,name")
            .in_("id", recipe_ids)
            .execute()
            .data
        )

    # ── Parallel execution ─────────────────────────────────────────────────────

    tier1 = {
        "profile":            q_profile,
        "tasks":              q_tasks,
        "habit_registry":     q_habit_registry,
        "fitness_log":        q_fitness_log,
        "workout_yesterday":  q_workout_yesterday,
        "workout_today":      q_workout_today,
        "recovery":           q_recovery,
        "study_log":          q_study_log,
        "meal_log":           q_meal_log,
        "weather":            q_weather,
    }

    results: dict = {}

    with ThreadPoolExecutor(max_workers=10) as pool:
        # Tier 1 — all 9 independent queries in parallel
        futs = {pool.submit(fn): key for key, fn in tier1.items()}
        for fut in as_completed(futs):
            key = futs[fut]
            try:
                results[key] = fut.result()
            except Exception as e:
                print(f"[fetch_briefing_data] Warning: {key} query failed: {e}", file=sys.stderr)
                results[key] = None

        # Tier 2 — habits (depends on registry for formatting) + recipes (conditional)
        tier2_futs: dict = {pool.submit(q_habits): "habits"}
        recipe_ids = []
        if results.get("meal_log"):
            recipe_ids = list({m["recipe_id"] for m in results["meal_log"] if m.get("recipe_id")})
        if recipe_ids:
            tier2_futs[pool.submit(lambda ids=recipe_ids: q_recipes(ids))] = "recipes"
        else:
            results["recipes"] = []

        for fut in as_completed(tier2_futs):
            key = tier2_futs[fut]
            try:
                results[key] = fut.result()
            except Exception as e:
                print(f"[fetch_briefing_data] Warning: {key} query failed: {e}", file=sys.stderr)
                results[key] = None

    # ── Print sections (identical format, fixed order) ─────────────────────────

    # Profile
    profile_rows = results.get("profile") or []
    profile = {r["key"]: r["value"] for r in profile_rows}
    print("## PROFILE")
    for k, v in profile.items():
        print(f"- {k}: {v}")

    # Weather
    weather = results.get("weather") or {}
    print("\n## WEATHER")
    if weather.get("error"):
        print(f"Unavailable: {weather['error']}")
    elif weather:
        print(format_weather_line(weather))
        if weather.get("precip_in") and weather["precip_in"] > 0.1:
            print("Rain expected — plan accordingly")
        loc = weather.get("location", "")
        if loc:
            print(f"Location: {loc}")
    else:
        print("Unavailable")

    # Active Tasks
    tasks = results.get("tasks") or []
    print("\n## ACTIVE TASKS")
    if tasks:
        for t in tasks:
            due = f" | Due: {t['due_date']}" if t.get("due_date") else ""
            print(f"- [{t.get('priority', '—').upper()}] {t['title']}{due}")
    else:
        print("- None")

    # Habits — last 7 days
    registry = results.get("habit_registry") or []
    habit_names = {r["id"]: r["name"] for r in registry}
    habit_logs = results.get("habits") or []

    habit_by_name: dict[str, dict[str, bool]] = defaultdict(dict)
    for row in habit_logs:
        name = habit_names.get(row["habit_id"], row["habit_id"])
        habit_by_name[name][row["date"]] = row["completed"]

    dates_7 = [(date.today() - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    print("\n## HABITS — LAST 7 DAYS")
    print(f"{'Habit':<20} " + "  ".join(d[5:] for d in dates_7))
    for row in registry:
        name = row["name"]
        row_data = habit_by_name.get(name, {})
        streak = 0
        for d in reversed(dates_7):
            if row_data.get(d) is True:
                streak += 1
            else:
                break
        day_cells = []
        for d in dates_7:
            val = row_data.get(d)
            day_cells.append("Y" if val is True else ("N" if val is False else "—"))
        print(f"{name:<20} " + "    ".join(day_cells) + f"  (streak: {streak})")

    # Body Composition
    body_comp = results.get("fitness_log") or []
    print("\n## BODY COMPOSITION (last Renpho entry)")
    if body_comp:
        latest = body_comp[0]
        print(
            f"Weight: {latest['weight_lb']} lb | Body Fat: {latest['body_fat_pct']}% | "
            f"Muscle: {latest['muscle_mass_lb']} lb | BMI: {latest['bmi']} | "
            f"Visceral: {latest['visceral_fat']} — {latest['date']}"
        )
        if len(body_comp) > 1:
            prev = body_comp[1]
            dw = round(latest["weight_lb"] - prev["weight_lb"], 1) if latest["weight_lb"] and prev["weight_lb"] else None
            dbf = round(latest["body_fat_pct"] - prev["body_fat_pct"], 1) if latest["body_fat_pct"] and prev["body_fat_pct"] else None
            if dw is not None or dbf is not None:
                delta_parts = []
                if dw is not None:
                    delta_parts.append(f"Weight {'+' if dw > 0 else ''}{dw} lb")
                if dbf is not None:
                    delta_parts.append(f"Fat {'+' if dbf > 0 else ''}{dbf}%")
                print(f"Delta vs prior: {' | '.join(delta_parts)}")
    else:
        print("No Renpho data available.")

    # Workouts
    for label, key in [("YESTERDAY'S ACTIVITY", "workout_yesterday"), ("TODAY'S ACTIVITY", "workout_today")]:
        day = yesterday if key == "workout_yesterday" else today
        workouts = results.get(key) or []
        print(f"\n## {label} ({day})")
        if workouts:
            for w in workouts:
                hr = f" | Avg HR: {w['avg_hr']}" if w.get("avg_hr") else ""
                print(f"- {w['activity']} — {w['duration_mins']} min, {w['calories']} cal{hr}")
        else:
            print("- None")

    # Recovery
    recovery = results.get("recovery") or []
    print("\n## RECOVERY (last night)")
    if recovery:
        r = recovery[0]
        def v(val, suffix=""):
            return f"{val}{suffix}" if val is not None else "—"
        print(
            f"Readiness: {v(r['readiness'])} | Sleep: {v(r['sleep_score'])} | "
            f"Total: {fmt_hrs(r['total_sleep_hrs'])} | Deep: {fmt_hrs(r['deep_hrs'])} | "
            f"REM: {fmt_hrs(r['rem_hrs'])} | HRV: {v(r['avg_hrv'], 'ms')} | "
            f"RHR: {v(r['resting_hr'], ' bpm')} | Active Cal: {v(r['active_cal'])} — {r['date']}"
        )
        if r.get("readiness") and r["readiness"] < 70:
            severity = "critical — rest day recommended" if r["readiness"] < 50 else "low — consider deload or rest day"
            print(f"FLAG: Readiness {severity}")
    else:
        print("No recovery data. Run: python3 scripts/sync-oura.py --yes")

    # Study Log
    study = results.get("study_log") or []
    if study:
        print("\n## RECENT STUDY LOG")
        for s in study:
            dur = f"{s['duration_mins']} min" if s.get("duration_mins") else "—"
            notes = f" — {s['notes']}" if s.get("notes") else ""
            print(f"- {s['date']} | {s['subject']} | {dur}{notes}")

    # Meal Log
    meal_logs = results.get("meal_log") or []
    if meal_logs:
        recipe_names: dict[str, str] = {}
        for rec in (results.get("recipes") or []):
            recipe_names[rec["id"]] = rec["name"]

        print("\n## RECENT MEALS (last 7 days)")
        for m in meal_logs:
            label = recipe_names.get(m["recipe_id"], m.get("notes") or "—") if m.get("recipe_id") else (m.get("notes") or "—")
            print(f"- {m['date']} | {m.get('meal_type', '—')} | {label}")


if __name__ == "__main__":
    main()
