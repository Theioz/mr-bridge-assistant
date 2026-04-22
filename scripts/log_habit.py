#!/usr/bin/env python3
"""
Log habit completions to Supabase.
Called by the log-habit skill after writing to memory/habits.md.

Usage:
    python3 scripts/log_habit.py --habits floss workout --date 2026-04-10
    python3 scripts/log_habit.py --habits japanese coding  # defaults to today
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, get_owner_user_id
from _sync_log import log_sync

HABIT_ALIASES = {
    "floss": "Floss",
    "workout": "Workout",
    "japanese": "Japanese study",
    "japanese study": "Japanese study",
    "coding": "Coding",
    "reading": "Reading",
    "water": "Water",
    "sleep": "Sleep",
}


def main():
    parser = argparse.ArgumentParser(description="Log habits to Supabase")
    parser.add_argument("--habits", nargs="+", required=True, help="Habit names (case-insensitive)")
    parser.add_argument("--date", default=str(date.today()), help="Date (YYYY-MM-DD, default: today)")
    args = parser.parse_args()

    client = get_client()
    owner_user_id = get_owner_user_id()

    # Fetch habit registry (owner only)
    registry = client.table("habit_registry").select("id,name").eq("user_id", owner_user_id).execute().data
    habit_id_map = {r["name"].lower(): r["id"] for r in registry}

    rows = []
    unrecognized = []
    for h in args.habits:
        canonical = HABIT_ALIASES.get(h.lower())
        if not canonical:
            canonical = h.strip().title()
        hid = habit_id_map.get(canonical.lower())
        if not hid:
            unrecognized.append(h)
            continue
        rows.append({
            "user_id": owner_user_id,
            "habit_id": hid,
            "date": args.date,
            "completed": True,
        })

    if unrecognized:
        print(f"[log-habit] Unrecognized habits (skipped): {', '.join(unrecognized)}", file=sys.stderr)

    if not rows:
        print("[log-habit] No valid habits to log.", file=sys.stderr)
        sys.exit(1)

    resp = client.table("habits").upsert(rows, on_conflict="habit_id,date").execute()
    written = len(resp.data)
    log_sync(client, "log_habit", "ok", written)
    logged = [r["habit_id"] for r in resp.data]
    # Print names for confirmation
    id_to_name = {r["id"]: r["name"] for r in registry}
    names = [id_to_name.get(hid, hid) for hid in logged]
    print(f"[log-habit] Logged to Supabase: {', '.join(names)} on {args.date}")


if __name__ == "__main__":
    main()
