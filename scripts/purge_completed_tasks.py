#!/usr/bin/env python3
"""
Hard-delete completed tasks older than the retention window (#684).

Completed tasks stay browsable and restorable on /tasks for RETENTION_DAYS (scripts/_retention.py),
then this removes them. Nightly, from the compute-core crontab (jl-homelab
`system/cron/compute-core-crontab`), like the other task crons.

What is deleted, exactly:
  - status = 'completed' and completed_at older than RETENTION_DAYS
  - top-level tasks only (parent_id is null). Subtasks go with their parent through
    `tasks.parent_id ... on delete cascade`. A completed subtask of a task that is still active is
    kept, so that task's "2/5" progress does not silently change.
  - a recurring-series occurrence only once its occurrence_date is ALSO before the retention floor.
    The spawners treat "a row exists" as "already materialized", so they never look before the
    floor; this condition is what keeps a purged occurrence from being re-created as an overdue
    chore. A chore ticked off two weeks early would otherwise be purged while its date is still
    inside the spawn window.

Archived tasks are out of scope: they have no archived_at to age them by.

Run:  python3 scripts/purge_completed_tasks.py [--dry-run]
Exit: non-zero on any error, so the cron heartbeat goes red. Silence is not success here: a purge
      that crashed before reading a row looked identical to "nothing old enough" in
      check_task_due_alerts.py's history.
Requires: supabase, python-dotenv
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from _dates import today_local  # noqa: E402
from _retention import RETENTION_DAYS, retention_floor  # noqa: E402
from _supabase import get_client, get_owner_user_id  # noqa: E402

# PostgREST puts `in.(...)` filters in the URL; keep each request comfortably short.
CHUNK = 100


def chunks(items: list[str], n: int = CHUNK):
    for i in range(0, len(items), n):
        yield items[i : i + n]


def main() -> int:
    ap = argparse.ArgumentParser(description="Delete completed tasks past the retention window.")
    ap.add_argument("--dry-run", action="store_true", help="List what would be deleted, delete nothing.")
    args = ap.parse_args()

    try:
        client = get_client()
        owner = get_owner_user_id()
    except Exception as e:
        print(f"[purge] Supabase connection error: {e}", file=sys.stderr)
        return 1

    cutoff = (datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    floor = retention_floor(today_local()).isoformat()

    try:
        candidates = (
            client.table("tasks")
            .select("id, title, completed_at, series_id, occurrence_date")
            .eq("user_id", owner)
            .eq("status", "completed")
            .is_("parent_id", "null")
            .lt("completed_at", cutoff)
            .or_(f"occurrence_date.is.null,occurrence_date.lt.{floor}")
            .order("completed_at")
            .execute()
            .data
            or []
        )
    except Exception as e:
        print(f"[purge] candidate query failed: {e}", file=sys.stderr)
        return 1

    ids = [row["id"] for row in candidates]
    subtask_count = 0
    try:
        for part in chunks(ids):
            rows = client.table("tasks").select("id").in_("parent_id", part).execute().data or []
            subtask_count += len(rows)
    except Exception as e:
        print(f"[purge] subtask count failed: {e}", file=sys.stderr)
        return 1

    if args.dry_run:
        for row in candidates:
            print(f"[purge] would delete {row['title']!r} (completed {row['completed_at'][:10]})")
        print(
            f"[purge] would delete {len(ids)} completed task(s) (+{subtask_count} subtask(s)) "
            f"completed before {cutoff[:10]}."
        )
        return 0

    deleted = 0
    try:
        for part in chunks(ids):
            # Re-check status in the DELETE itself: a task restored between the read above and this
            # write must survive.
            res = (
                client.table("tasks")
                .delete()
                .eq("user_id", owner)
                .eq("status", "completed")
                .in_("id", part)
                .execute()
            )
            deleted += len(res.data or [])
    except Exception as e:
        print(f"[purge] delete failed after {deleted} row(s): {e}", file=sys.stderr)
        return 1

    print(
        f"[purge] deleted {deleted} completed task(s) (+{subtask_count} subtask(s) by cascade) "
        f"completed before {cutoff[:10]}; retention {RETENTION_DAYS} days."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
