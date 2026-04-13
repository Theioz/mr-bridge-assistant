#!/usr/bin/env python3
"""
Normalize existing workout_sessions rows to use canonical activity names.

Run once after deploying the ACTIVITY_ALIASES changes in sync-fitbit.py.
Updates rows where the stored activity name differs from the canonical alias.

Usage:
  python3 scripts/normalize_workout_activities.py          # dry-run (print only)
  python3 scripts/normalize_workout_activities.py --yes    # write to Supabase
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, get_owner_user_id

ACTIVITY_ALIASES: dict[str, str] = {
    "Walking": "Walk",
    "Running": "Run",
    "Biking": "Bike",
    "Cycling": "Bike",
    "Outdoor Bike": "Bike",
    "Swimming": "Swim",
    "Hiking": "Hike",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize workout activity names in Supabase")
    parser.add_argument("--yes", "-y", action="store_true", help="Write changes (default: dry-run)")
    args = parser.parse_args()

    client = get_client()
    owner_user_id = get_owner_user_id()

    rows = (
        client.table("workout_sessions")
        .select("id,activity")
        .eq("user_id", owner_user_id)
        .execute()
        .data
    )

    updates: list[tuple[str, str, str]] = []
    for r in rows:
        canonical = ACTIVITY_ALIASES.get(r["activity"])
        if canonical and canonical != r["activity"]:
            updates.append((r["id"], r["activity"], canonical))

    if not updates:
        print("No activity names need normalization.")
        return

    print(f"{'ID':<38}  {'Old':<20}  {'New'}")
    print("-" * 70)
    for uid, old, new in updates:
        print(f"{uid:<38}  {old:<20}  {new}")
    print(f"\n{len(updates)} row(s) to update.")

    if not args.yes:
        print("\nDry run — pass --yes to apply.")
        return

    for uid, _old, new in updates:
        client.table("workout_sessions").update({"activity": new}).eq("id", uid).execute()

    print(f"\n[normalize] Updated {len(updates)} row(s).")


if __name__ == "__main__":
    main()
