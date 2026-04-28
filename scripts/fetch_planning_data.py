#!/usr/bin/env python3
"""
Fetch prior-week health and fitness data for the weekly planning agent.
Outputs structured context that the scheduled agent reads before producing
the coming week's workout plan and meal prep task.

Usage: python3 scripts/fetch_planning_data.py
"""
from __future__ import annotations

import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, get_owner_user_id


def fmt_hrs(h) -> str:
    if h is None:
        return "—"
    hours = int(h)
    mins = round((h - hours) * 60)
    return f"{hours}h {mins:02d}m"


def get_coming_monday(today: date) -> date:
    """Return the nearest upcoming Monday (never today, even if today is Monday)."""
    dow = today.weekday()  # 0=Mon, 6=Sun
    days = (7 - dow) % 7 or 7
    return today + timedelta(days=days)


def main():
    client = get_client()
    uid = get_owner_user_id()
    today = date.today()

    next_monday = get_coming_monday(today)
    prior_monday = next_monday - timedelta(days=7)
    prior_sunday = next_monday - timedelta(days=1)
    prior_monday_str = str(prior_monday)
    prior_sunday_str = str(prior_sunday)

    # ── Query functions ─────────────────────────────────────────────────────────

    def q_profile():
        return client.table("profile").select("key,value").eq("user_id", uid).execute().data

    def q_workout_sessions():
        return (
            client.table("workout_sessions")
            .select("date,activity,duration_mins,calories,avg_hr,notes")
            .eq("user_id", uid)
            .gte("date", prior_monday_str)
            .lte("date", prior_sunday_str)
            .order("date")
            .execute()
            .data
        )

    def q_recovery():
        return (
            client.table("recovery_metrics")
            .select("date,readiness,sleep_score,total_sleep_hrs,deep_hrs,rem_hrs,avg_hrv,resting_hr")
            .eq("user_id", uid)
            .eq("source", "oura")
            .gte("date", prior_monday_str)
            .lte("date", prior_sunday_str)
            .order("date")
            .execute()
            .data
        )

    def q_meal_log():
        return (
            client.table("meal_log")
            .select("date,meal_type,notes,recipe_id")
            .eq("user_id", uid)
            .gte("date", prior_monday_str)
            .lte("date", prior_sunday_str)
            .order("date")
            .execute()
            .data
        )

    def q_fitness_log():
        return (
            client.table("fitness_log")
            .select("date,weight_lb,body_fat_pct,muscle_mass_lb,bmi,visceral_fat")
            .eq("user_id", uid)
            .not_.is_("body_fat_pct", "null")
            .order("date", desc=True)
            .limit(2)
            .execute()
            .data
        )

    def q_habit_registry():
        return (
            client.table("habit_registry")
            .select("id,name")
            .eq("active", True)
            .eq("user_id", uid)
            .execute()
            .data
        )

    def q_habits():
        return (
            client.table("habits")
            .select("habit_id,date,completed")
            .eq("user_id", uid)
            .gte("date", prior_monday_str)
            .lte("date", prior_sunday_str)
            .execute()
            .data
        )

    def q_prior_workout_plans():
        return (
            client.table("workout_plans")
            .select("date,name,status,notes")
            .eq("user_id", uid)
            .gte("date", prior_monday_str)
            .lte("date", prior_sunday_str)
            .order("date")
            .execute()
            .data
        )

    # ── Parallel execution ──────────────────────────────────────────────────────

    tier1 = {
        "profile":               q_profile,
        "workout_sessions":      q_workout_sessions,
        "recovery":              q_recovery,
        "meal_log":              q_meal_log,
        "fitness_log":           q_fitness_log,
        "habit_registry":        q_habit_registry,
        "prior_workout_plans":   q_prior_workout_plans,
    }

    results: dict = {}

    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(fn): key for key, fn in tier1.items()}
        for fut in as_completed(futs):
            key = futs[fut]
            try:
                results[key] = fut.result()
            except Exception as e:
                print(f"[fetch_planning_data] Warning: {key} query failed: {e}", file=sys.stderr)
                results[key] = None

        # Tier 2 — habits (needs registry for formatting) + recipes (conditional on meal_log)
        tier2_futs: dict = {pool.submit(q_habits): "habits"}
        recipe_ids = []
        if results.get("meal_log"):
            recipe_ids = list({m["recipe_id"] for m in results["meal_log"] if m.get("recipe_id")})
        if recipe_ids:
            def q_recipes(ids=recipe_ids):
                return (
                    client.table("recipes")
                    .select("id,name")
                    .in_("id", ids)
                    .execute()
                    .data
                )
            tier2_futs[pool.submit(q_recipes)] = "recipes"
        else:
            results["recipes"] = []

        for fut in as_completed(tier2_futs):
            key = tier2_futs[fut]
            try:
                results[key] = fut.result()
            except Exception as e:
                print(f"[fetch_planning_data] Warning: {key} query failed: {e}", file=sys.stderr)
                results[key] = None

    # ── Print sections ──────────────────────────────────────────────────────────

    print(
        f"## PLANNING CONTEXT — coming week {next_monday} to {next_monday + timedelta(days=6)}\n"
        f"## (prior week data: {prior_monday_str} to {prior_sunday_str})"
    )

    # Profile
    profile_rows = results.get("profile") or []
    profile = {r["key"]: r["value"] for r in profile_rows}
    print("\n## PROFILE")
    if profile:
        for k, v in profile.items():
            print(f"- {k}: {v}")
    else:
        print("No profile data.")

    # Body composition
    body_comp = results.get("fitness_log") or []
    print("\n## BODY COMPOSITION (most recent entry)")
    if body_comp:
        latest = body_comp[0]
        print(
            f"Weight: {latest['weight_lb']} lb | Body Fat: {latest['body_fat_pct']}% | "
            f"Muscle: {latest['muscle_mass_lb']} lb | BMI: {latest['bmi']} — {latest['date']}"
        )
        if len(body_comp) > 1:
            prev = body_comp[1]
            dw = (
                round(latest["weight_lb"] - prev["weight_lb"], 1)
                if latest["weight_lb"] and prev["weight_lb"]
                else None
            )
            dbf = (
                round(latest["body_fat_pct"] - prev["body_fat_pct"], 1)
                if latest["body_fat_pct"] and prev["body_fat_pct"]
                else None
            )
            if dw is not None or dbf is not None:
                parts = []
                if dw is not None:
                    parts.append(f"Weight {'+' if dw > 0 else ''}{dw} lb")
                if dbf is not None:
                    parts.append(f"Fat {'+' if dbf > 0 else ''}{dbf}%")
                print(f"Delta vs prior: {' | '.join(parts)}")
    else:
        print("No body composition data available.")

    # Prior week activity
    sessions = results.get("workout_sessions") or []
    print(f"\n## PRIOR WEEK ACTIVITY ({prior_monday_str} – {prior_sunday_str})")
    if sessions:
        for s in sessions:
            hr = f" | Avg HR: {s['avg_hr']}" if s.get("avg_hr") else ""
            notes = f" — {s['notes']}" if s.get("notes") else ""
            print(f"- {s['date']} | {s['activity']} — {s['duration_mins']} min, {s['calories']} cal{hr}{notes}")
    else:
        print("No activity logged for prior week.")

    # Prior week planned workouts vs actual
    plans = results.get("prior_workout_plans") or []
    print("\n## PRIOR WEEK PLANNED WORKOUTS")
    if plans:
        for p in plans:
            status_flag = "" if p["status"] == "completed" else f" [{p['status'].upper()}]"
            name = p.get("name") or "Unnamed"
            print(f"- {p['date']} | {name}{status_flag}")
    else:
        print("No workout plans found for prior week.")

    # Recovery
    recovery = results.get("recovery") or []
    print("\n## RECOVERY — PRIOR WEEK")
    if recovery:
        for r in recovery:
            def v(val, suffix=""):
                return f"{val}{suffix}" if val is not None else "—"
            print(
                f"- {r['date']} | Readiness: {v(r['readiness'])} | Sleep: {v(r['sleep_score'])} | "
                f"Total: {fmt_hrs(r['total_sleep_hrs'])} | HRV: {v(r['avg_hrv'], 'ms')} | "
                f"RHR: {v(r['resting_hr'], ' bpm')}"
            )
        readiness_vals = [r["readiness"] for r in recovery if r.get("readiness") is not None]
        if readiness_vals:
            avg_r = round(sum(readiness_vals) / len(readiness_vals))
            min_r = min(readiness_vals)
            print(f"  Avg readiness: {avg_r} | Min: {min_r}")
            if min_r < 50:
                print("  FLAG: Critically low readiness on at least one day — consider deload week.")
            elif avg_r < 65:
                print("  FLAG: Consistently low readiness — consider reducing volume.")
    else:
        print("No recovery data for prior week — Oura sync may not have run.")

    # Habits
    registry = results.get("habit_registry") or []
    habit_names = {r["id"]: r["name"] for r in registry}
    habit_logs = results.get("habits") or []
    habit_by_name: dict[str, dict[str, bool]] = defaultdict(dict)
    for row in habit_logs:
        name = habit_names.get(row["habit_id"], row["habit_id"])
        habit_by_name[name][row["date"]] = row["completed"]

    dates_prior = [(prior_monday + timedelta(days=i)).isoformat() for i in range(7)]
    print("\n## HABITS — PRIOR WEEK")
    if registry:
        for row in registry:
            name = row["name"]
            row_data = habit_by_name.get(name, {})
            completed = sum(1 for d in dates_prior if row_data.get(d) is True)
            day_cells = []
            for d in dates_prior:
                val = row_data.get(d)
                day_cells.append("Y" if val is True else ("N" if val is False else "—"))
            print(f"- {name}: {completed}/7 — {' '.join(day_cells)}")
    else:
        print("No habits tracked.")

    # Meal log
    meal_logs = results.get("meal_log") or []
    recipe_names: dict[str, str] = {rec["id"]: rec["name"] for rec in (results.get("recipes") or [])}
    print("\n## MEALS — PRIOR WEEK")
    if meal_logs:
        for m in meal_logs:
            label = (
                recipe_names.get(m["recipe_id"], m.get("notes") or "—")
                if m.get("recipe_id")
                else (m.get("notes") or "—")
            )
            print(f"- {m['date']} | {m.get('meal_type', '—')} | {label}")
    else:
        print("No meals logged for prior week.")

    # Coming week dates
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    print(f"\n## COMING WEEK — dates available for scheduling")
    for i, day_name in enumerate(day_names):
        d = next_monday + timedelta(days=i)
        print(f"- {d} ({day_name})")


if __name__ == "__main__":
    main()
