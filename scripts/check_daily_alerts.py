#!/usr/bin/env python3
"""
Daily task due-date push notifications.

Queries tasks table for active tasks with due_date <= today and fires one
notify.sh call per task. Distinguishes "due today" vs "overdue". Runs at most
once per day — tracked via profile key task_alerts_last_notified.

Requires: supabase, python-dotenv
"""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _supabase import get_client

NOTIFY_SCRIPT = ROOT / "scripts" / "notify.sh"
CLICK_PATH = "/tasks"


def get_profile_value(client, key: str) -> str | None:
    rows = (
        client.table("profile")
        .select("value")
        .eq("key", key)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["value"] if rows else None


def set_profile_value(client, key: str, value: str) -> None:
    client.table("profile").upsert({"key": key, "value": value}, on_conflict="key").execute()


def main() -> None:
    try:
        client = get_client()
    except Exception as e:
        print(f"[check_daily_alerts] Supabase connection error: {e}", file=sys.stderr)
        return

    today_str = date.today().isoformat()

    # Once-per-day guard
    last_notified = get_profile_value(client, "task_alerts_last_notified")
    if last_notified == today_str:
        return

    # Query active tasks with a due date on or before today
    try:
        rows = (
            client.table("tasks")
            .select("id, name, due_date")
            .eq("status", "active")
            .not_("due_date", "is", None)
            .lte("due_date", today_str)
            .order("due_date", desc=False)
            .execute()
            .data
        )
    except Exception as e:
        print(f"[check_daily_alerts] tasks query error: {e}", file=sys.stderr)
        return

    if not rows:
        # Still mark as run so we don't re-query all day
        set_profile_value(client, "task_alerts_last_notified", today_str)
        return

    fired = 0
    for task in rows:
        due = task.get("due_date", "")
        name = task.get("name", "(unnamed task)")
        is_today = due == today_str
        title = "Task Due Today" if is_today else "Task Overdue"
        message = f"{name} — due {due}" if not is_today else f"{name} — due today"
        app_url = os.environ.get("APP_URL", "").rstrip("/")
        cmd = ["bash", str(NOTIFY_SCRIPT), "--title", title, "--message", message]
        if app_url:
            cmd += ["--click-url", f"{app_url}{CLICK_PATH}"]
        try:
            subprocess.run(cmd, check=True)
            fired += 1
        except Exception as e:
            print(f"[check_daily_alerts] notify error for task '{name}': {e}", file=sys.stderr)

    set_profile_value(client, "task_alerts_last_notified", today_str)
    if fired:
        print(f"[check_daily_alerts] Fired {fired} task alert(s).")


if __name__ == "__main__":
    main()
