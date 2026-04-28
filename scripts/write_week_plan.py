#!/usr/bin/env python3
"""
Write the weekly workout plan and meal prep task to Supabase.
Reads a JSON payload from stdin produced by the weekly planning agent.

Expected stdin format:
{
  "workout_days": [
    {
      "date": "YYYY-MM-DD",
      "name": "Push Day",
      "warmup": [...],
      "workout": [...],
      "cooldown": [...],
      "notes": "optional"
    }
  ],
  "meal_prep_task": {
    "title": "Meal prep — week of YYYY-MM-DD",
    "priority": "medium",
    "due_date": "YYYY-MM-DD",
    "category": "nutrition",
    "metadata": { "recommendations": [...] }
  }
}

Usage:
  echo '<json>' | python3 scripts/write_week_plan.py
  python3 scripts/write_week_plan.py < plan.json
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, get_owner_user_id
from _notifications import log_notification

SCRIPTS_DIR = Path(__file__).parent


def get_coming_monday(today: date) -> date:
    """Return the nearest upcoming Monday (never today, even if today is Monday)."""
    dow = today.weekday()  # 0=Mon, 6=Sun
    days = (7 - dow) % 7 or 7
    return today + timedelta(days=days)


def send_notification(title: str, message: str) -> None:
    notify_sh = SCRIPTS_DIR / "notify.sh"
    try:
        subprocess.run(
            ["bash", str(notify_sh), "--title", title, "--message", message],
            check=False,
            capture_output=True,
        )
    except Exception as e:
        print(f"[write_week_plan] notify.sh error: {e}", file=sys.stderr)


def main() -> None:
    # Read JSON payload from stdin
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            print("[write_week_plan] Error: no JSON received on stdin", file=sys.stderr)
            sys.exit(1)
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[write_week_plan] Error: invalid JSON — {e}", file=sys.stderr)
        sys.exit(1)

    workout_days = payload.get("workout_days") or []
    meal_prep_task = payload.get("meal_prep_task")

    if not workout_days and not meal_prep_task:
        print(
            "[write_week_plan] Error: payload has neither workout_days nor meal_prep_task",
            file=sys.stderr,
        )
        sys.exit(1)

    client = get_client()
    uid = get_owner_user_id()
    today = date.today()
    next_monday = get_coming_monday(today)
    next_sunday = next_monday + timedelta(days=6)

    # Idempotency — skip entirely if workout plans already exist for the coming week
    existing = (
        client.table("workout_plans")
        .select("id", count="exact")
        .eq("user_id", uid)
        .gte("date", str(next_monday))
        .lte("date", str(next_sunday))
        .execute()
    )
    existing_count = existing.count if existing.count is not None else len(existing.data or [])
    if existing_count > 0:
        print(f"[write_week_plan] Plan already exists for week of {next_monday} — skipping.")
        sys.exit(0)

    errors: list[str] = []

    # Write workout plans
    if workout_days:
        rows = []
        for day in workout_days:
            if not day.get("date"):
                errors.append(f"Skipping workout_day with missing date: {day}")
                continue
            rows.append({
                "user_id": uid,
                "date": day["date"],
                "name": day.get("name"),
                "warmup": day.get("warmup") or [],
                "workout": day.get("workout") or [],
                "cooldown": day.get("cooldown") or [],
                "notes": day.get("notes"),
                "status": "planned",
            })
        if rows:
            resp = client.table("workout_plans").upsert(rows, on_conflict="user_id,date").execute()
            if hasattr(resp, "error") and resp.error:
                errors.append(f"workout_plans upsert failed: {resp.error.message}")
            else:
                print(f"[write_week_plan] Wrote {len(rows)} workout plan(s) for week of {next_monday}.")

    # Write meal prep task
    if meal_prep_task:
        base_metadata = {
            "source": "weekly_planning_agent",
            "week_start": str(next_monday),
        }
        supplied_meta = meal_prep_task.get("metadata") or {}
        task_row = {
            "user_id": uid,
            "title": meal_prep_task.get("title") or f"Meal prep — week of {next_monday}",
            "priority": meal_prep_task.get("priority") or "medium",
            "status": "active",
            "due_date": meal_prep_task.get("due_date") or str(next_monday),
            "category": meal_prep_task.get("category") or "nutrition",
            "metadata": {**base_metadata, **supplied_meta},
        }
        resp = client.table("tasks").insert(task_row).execute()
        if hasattr(resp, "error") and resp.error:
            errors.append(f"tasks insert failed: {resp.error.message}")
        else:
            print(f"[write_week_plan] Wrote meal prep task: \"{task_row['title']}\"")

    if errors:
        for err in errors:
            print(f"[write_week_plan] Error: {err}", file=sys.stderr)
        msg = f"{len(errors)} error(s) writing plan for week of {next_monday}. Check logs."
        send_notification("Weekly Plan — Partial Failure", msg)
        log_notification(client, uid, "weekly_plan_error", "Weekly Plan — Partial Failure", msg)
        sys.exit(1)

    workout_count = len([d for d in workout_days if d.get("date")])
    msg = f"{workout_count} workout(s) + meal prep set for week of {next_monday}."
    send_notification("Weekly Plan Ready", msg)
    log_notification(client, uid, "weekly_plan_ready", "Weekly Plan Ready", msg)
    print(f"[write_week_plan] Done. {msg}")


if __name__ == "__main__":
    main()
