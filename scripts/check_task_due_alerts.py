#!/usr/bin/env python3
"""
Task due-date push notifications with per-task deduplication.

Queries tasks table for active tasks with due_date <= today. Sends one grouped
ntfy.sh notification for overdue tasks and one for due-today tasks. Skips tasks
notified within the last 24 hours — tracked per task ID in profile key
'task_notif_cache' (JSON dict: {task_id: ISO timestamp}).

Requires: supabase, python-dotenv
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _supabase import get_client

NOTIFY_SCRIPT = ROOT / "scripts" / "notify.sh"
CACHE_KEY = "task_notif_cache"
DEDUP_HOURS = 24


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


def load_notif_cache(client) -> dict[str, str]:
    """Return {task_id: iso_timestamp_last_notified} from profile."""
    raw = get_profile_value(client, CACHE_KEY)
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def save_notif_cache(client, cache: dict[str, str]) -> None:
    set_profile_value(client, CACHE_KEY, json.dumps(cache))


def needs_notification(task_id: str, cache: dict[str, str]) -> bool:
    """Return True if the task hasn't been notified within the last 24 hours."""
    last_str = cache.get(str(task_id))
    if not last_str:
        return True
    try:
        last = datetime.fromisoformat(last_str)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - last).total_seconds() / 3600
        return age_hours >= DEDUP_HOURS
    except ValueError:
        return True


def send_notify(title: str, message: str) -> None:
    subprocess.run(
        ["bash", str(NOTIFY_SCRIPT), "--title", title, "--message", message],
        check=True,
    )


def main() -> None:
    try:
        client = get_client()
    except Exception as e:
        print(f"[check_task_due_alerts] Supabase connection error: {e}", file=sys.stderr)
        return

    today_str = date.today().isoformat()

    # Query active tasks with a due date on or before today
    try:
        rows = (
            client.table("tasks")
            .select("id, title, due_date")
            .eq("status", "active")
            .not_("due_date", "is", None)
            .lte("due_date", today_str)
            .order("due_date", desc=False)
            .execute()
            .data
        )
    except Exception as e:
        print(f"[check_task_due_alerts] tasks query error: {e}", file=sys.stderr)
        return

    if not rows:
        return

    cache = load_notif_cache(client)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Partition tasks that need notification into overdue vs due-today buckets.
    # Track task_ids so we can update the cache only for successfully-fired groups.
    overdue_labels: list[str] = []
    overdue_ids: list[str] = []
    due_today_labels: list[str] = []
    due_today_ids: list[str] = []

    for task in rows:
        task_id = str(task.get("id", ""))
        title = task.get("title", "(unnamed)")
        due = task.get("due_date", "")

        if not needs_notification(task_id, cache):
            continue

        if due == today_str:
            due_today_labels.append(title)
            due_today_ids.append(task_id)
        else:
            overdue_labels.append(f"{title} (due {due})")
            overdue_ids.append(task_id)

    if not overdue_ids and not due_today_ids:
        return

    fired = 0

    if overdue_labels:
        try:
            send_notify(
                f"Overdue Tasks ({len(overdue_labels)})",
                "\n".join(overdue_labels),
            )
            for tid in overdue_ids:
                cache[tid] = now_iso
            fired += 1
        except Exception as e:
            print(f"[check_task_due_alerts] notify error (overdue): {e}", file=sys.stderr)

    if due_today_labels:
        try:
            send_notify(
                f"Due Today ({len(due_today_labels)})",
                "\n".join(due_today_labels),
            )
            for tid in due_today_ids:
                cache[tid] = now_iso
            fired += 1
        except Exception as e:
            print(f"[check_task_due_alerts] notify error (due today): {e}", file=sys.stderr)

    if fired:
        save_notif_cache(client, cache)
        print(
            f"[check_task_due_alerts] Fired {fired} notification(s) "
            f"({len(overdue_labels)} overdue, {len(due_today_labels)} due today)."
        )


if __name__ == "__main__":
    main()
