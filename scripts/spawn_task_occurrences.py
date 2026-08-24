#!/usr/bin/env python3
"""
Materialize upcoming task rows from recurring series (#468).

For each of the owner's series, generates every occurrence date from `last_spawned` (or
`starts_on`) through `today + HORIZON_DAYS`, inserts the missing ones as ordinary `tasks` rows,
and advances `last_spawned`.

Idempotent by construction: `tasks_series_occurrence_uniq` makes a duplicate (series_id,
occurrence_date) impossible at the database level, so a re-run, an overlapping window, or two
concurrent invocations cannot double-create a chore. The pre-read below is an optimisation that
keeps the common case from issuing doomed inserts — it is not the guarantee.

Run:  python3 scripts/spawn_task_occurrences.py [--dry-run] [--horizon N]
Requires: supabase, python-dotenv
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _recurrence import occurrences_between  # noqa: E402
from _supabase import get_client, get_owner_user_id  # noqa: E402

# How far ahead to materialize. Two weeks is enough that the tasks page always shows what is
# coming without the list filling with months of chores nobody has done yet.
HORIZON_DAYS = 14


def parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def spawn_for_series(client, series: dict, today: date, horizon: int, dry_run: bool) -> int:
    """Insert missing occurrences for one series. Returns the number created."""
    series_id = series["id"]
    starts_on = parse_date(series.get("starts_on"))
    ends_on = parse_date(series.get("ends_on"))
    last_spawned = parse_date(series.get("last_spawned"))
    if not starts_on:
        print(f"[spawn] series {series_id} has no starts_on — skipped", file=sys.stderr)
        return 0

    window_end = today + timedelta(days=horizon)

    # Start from the day after the high-water mark so a normal run considers only new dates. On a
    # first run (or after the column is cleared) fall back to starts_on and backfill the window.
    #
    # Deliberately NOT clamped to `today`: a series whose spawner did not run for a few days should
    # still produce the occurrences it owed. Those land in the past and show as overdue, which is
    # correct — the chore genuinely was due and genuinely was not done.
    window_start = last_spawned + timedelta(days=1) if last_spawned else starts_on

    dates = occurrences_between(
        freq=series["freq"],
        interval=series.get("interval") or 1,
        byweekday=series.get("byweekday"),
        starts_on=starts_on,
        ends_on=ends_on,
        window_start=window_start,
        window_end=window_end,
    )
    if not dates:
        return 0

    # Skip dates already materialized. The unique index is the real guard; this just avoids
    # firing inserts we know will conflict.
    existing = {
        row["occurrence_date"]
        for row in (
            client.table("tasks")
            .select("occurrence_date")
            .eq("series_id", series_id)
            .gte("occurrence_date", dates[0].isoformat())
            .lte("occurrence_date", dates[-1].isoformat())
            .execute()
            .data
            or []
        )
    }
    pending = [d for d in dates if d.isoformat() not in existing]

    if dry_run:
        for d in pending:
            print(f"[spawn] would create {series['title']!r} for {d.isoformat()}")
        return len(pending)

    created = 0
    for d in pending:
        try:
            client.table("tasks").insert(
                {
                    "user_id": series["user_id"],
                    "title": series["title"],
                    "priority": series.get("priority"),
                    "list_id": series.get("list_id"),
                    "status": "active",
                    "due_date": d.isoformat(),
                    "series_id": series_id,
                    "occurrence_date": d.isoformat(),
                }
            ).execute()
            created += 1
        except Exception as e:
            # A unique-violation here means another run won the race — that is the index doing its
            # job, not a failure. Anything else is worth seeing, so log and carry on to the next
            # date rather than aborting the whole series.
            msg = str(e)
            if "tasks_series_occurrence_uniq" in msg or "duplicate key" in msg:
                continue
            print(f"[spawn] insert failed for {series_id} {d}: {e}", file=sys.stderr)

    # Advance the high-water mark to the end of the window we just considered, not to the last date
    # created. Otherwise a series with a gap (say a monthly one) re-scans the same empty stretch on
    # every run, and a series that produced nothing never advances at all.
    new_high = min(window_end, ends_on) if ends_on else window_end
    if created or not last_spawned or new_high > last_spawned:
        try:
            client.table("task_series").update({"last_spawned": new_high.isoformat()}).eq(
                "id", series_id
            ).execute()
        except Exception as e:
            # Non-fatal: the next run recomputes from the old mark and the unique index absorbs the
            # repeats. Losing this write costs work, not correctness.
            print(f"[spawn] last_spawned update failed for {series_id}: {e}", file=sys.stderr)

    return created


def main() -> None:
    ap = argparse.ArgumentParser(description="Materialize task occurrences from recurring series.")
    ap.add_argument("--dry-run", action="store_true", help="Print what would be created, write nothing.")
    ap.add_argument("--horizon", type=int, default=HORIZON_DAYS, help=f"Days ahead (default {HORIZON_DAYS}).")
    args = ap.parse_args()

    try:
        client = get_client()
        owner_user_id = get_owner_user_id()
    except Exception as e:
        print(f"[spawn] Supabase connection error: {e}", file=sys.stderr)
        return

    today = date.today()

    try:
        series_rows = (
            client.table("task_series")
            .select("id, user_id, list_id, title, priority, freq, interval, byweekday, starts_on, ends_on, last_spawned")
            .eq("user_id", owner_user_id)
            .execute()
            .data
            or []
        )
    except Exception as e:
        print(f"[spawn] task_series query error: {e}", file=sys.stderr)
        return

    # Drop series whose window has fully closed. Cheaper here than in the query, and it keeps the
    # "past ends_on stops spawning" rule in one obvious place.
    live = [s for s in series_rows if not s.get("ends_on") or parse_date(s["ends_on"]) >= today]

    total = 0
    for s in live:
        try:
            total += spawn_for_series(client, s, today, args.horizon, args.dry_run)
        except Exception as e:
            print(f"[spawn] series {s.get('id')} failed: {e}", file=sys.stderr)

    verb = "would create" if args.dry_run else "created"
    print(f"[spawn] {verb} {total} occurrence(s) across {len(live)} live series ({len(series_rows)} total).")


if __name__ == "__main__":
    main()
