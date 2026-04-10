#!/usr/bin/env python3
"""
Fetch all data needed for the Mr. Bridge session briefing from Supabase.
Outputs structured text that Claude reads instead of loading markdown files.

Usage: python3 scripts/fetch_briefing_data.py
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client


def fmt_hrs(h) -> str:
    if h is None:
        return "—"
    hours = int(h)
    mins = round((h - hours) * 60)
    return f"{hours}h {mins:02d}m"


def main():
    client = get_client()
    today = str(date.today())
    yesterday = str(date.today() - timedelta(days=1))
    seven_days_ago = str(date.today() - timedelta(days=7))

    # ── Profile ────────────────────────────────────────────────────────────────
    profile_rows = client.table("profile").select("key,value").execute().data
    profile = {r["key"]: r["value"] for r in profile_rows}

    print("## PROFILE")
    for k, v in profile.items():
        print(f"- {k}: {v}")

    # ── Active Tasks ───────────────────────────────────────────────────────────
    tasks = (
        client.table("tasks")
        .select("title,priority,due_date,status")
        .eq("status", "active")
        .order("due_date", desc=False)
        .execute()
        .data
    )
    print("\n## ACTIVE TASKS")
    if tasks:
        for t in tasks:
            due = f" | Due: {t['due_date']}" if t.get("due_date") else ""
            print(f"- [{t.get('priority', '—').upper()}] {t['title']}{due}")
    else:
        print("- None")

    # ── Habits — last 7 days ───────────────────────────────────────────────────
    registry = client.table("habit_registry").select("id,name").eq("active", True).execute().data
    habit_names = {r["id"]: r["name"] for r in registry}

    habit_logs = (
        client.table("habits")
        .select("habit_id,date,completed")
        .gte("date", seven_days_ago)
        .lte("date", today)
        .execute()
        .data
    )

    # Build {habit_name: [True/False/None for each of last 7 days]}
    from collections import defaultdict
    habit_by_name: dict[str, dict[str, bool]] = defaultdict(dict)
    for row in habit_logs:
        name = habit_names.get(row["habit_id"], row["habit_id"])
        habit_by_name[name][row["date"]] = row["completed"]

    dates_7 = [(date.today() - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]

    print("\n## HABITS — LAST 7 DAYS")
    print(f"{'Habit':<20} " + "  ".join(d[5:] for d in dates_7))  # MM-DD headers
    for name in [r["name"] for r in registry]:
        row_data = habit_by_name.get(name, {})
        cells = []
        streak = 0
        for d in reversed(dates_7):
            val = row_data.get(d)
            if val is True:
                streak += 1
            else:
                break
        day_cells = []
        for d in dates_7:
            val = row_data.get(d)
            day_cells.append("Y" if val is True else ("N" if val is False else "—"))
        print(f"{name:<20} " + "    ".join(day_cells) + f"  (streak: {streak})")

    # ── Body Composition — last 2 Renpho entries ──────────────────────────────
    body_comp = (
        client.table("fitness_log")
        .select("date,weight_lb,body_fat_pct,bmi,muscle_mass_lb,visceral_fat,source")
        .not_.is_("body_fat_pct", "null")
        .order("date", desc=True)
        .limit(2)
        .execute()
        .data
    )

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

    # ── Workouts ───────────────────────────────────────────────────────────────
    for label, day in [("YESTERDAY'S ACTIVITY", yesterday), ("TODAY'S ACTIVITY", today)]:
        workouts = (
            client.table("workout_sessions")
            .select("activity,duration_mins,calories,avg_hr,start_time")
            .eq("date", day)
            .order("start_time")
            .execute()
            .data
        )
        print(f"\n## {label} ({day})")
        if workouts:
            for w in workouts:
                hr = f" | Avg HR: {w['avg_hr']}" if w.get("avg_hr") else ""
                print(f"- {w['activity']} — {w['duration_mins']} min, {w['calories']} cal{hr}")
        else:
            print("- None")

    # ── Recovery ───────────────────────────────────────────────────────────────
    recovery = (
        client.table("recovery_metrics")
        .select("*")
        .order("date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    print("\n## RECOVERY (last night)")
    if recovery:
        r = recovery[0]
        print(
            f"Readiness: {r['readiness']} | Sleep: {r['sleep_score']} | "
            f"Total: {fmt_hrs(r['total_sleep_hrs'])} | Deep: {fmt_hrs(r['deep_hrs'])} | "
            f"REM: {fmt_hrs(r['rem_hrs'])} | HRV: {r['avg_hrv']}ms | "
            f"RHR: {r['resting_hr']} bpm | Active Cal: {r['active_cal']} — {r['date']}"
        )
        if r.get("readiness") and r["readiness"] < 70:
            severity = "critical — rest day recommended" if r["readiness"] < 50 else "low — consider deload or rest day"
            print(f"FLAG: Readiness {severity}")
    else:
        print("No recovery data. Run: python3 scripts/sync-oura.py --yes")

    # ── Study Log — recent ─────────────────────────────────────────────────────
    study = (
        client.table("study_log")
        .select("date,subject,duration_mins,notes")
        .gte("date", seven_days_ago)
        .order("date", desc=True)
        .execute()
        .data
    )
    if study:
        print("\n## RECENT STUDY LOG")
        for s in study:
            dur = f"{s['duration_mins']} min" if s.get("duration_mins") else "—"
            notes = f" — {s['notes']}" if s.get("notes") else ""
            print(f"- {s['date']} | {s['subject']} | {dur}{notes}")


if __name__ == "__main__":
    main()
