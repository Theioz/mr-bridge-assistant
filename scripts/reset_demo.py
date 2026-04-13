#!/usr/bin/env python3
"""
Reset the demo account: wipe all demo user data, then re-run seed_demo.py.
Called nightly by the Vercel cron job via /api/cron/reset-demo.

Usage:
  python3 scripts/reset_demo.py [--yes]

Requires DEMO_USER_ID in .env.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client

DEMO_USER_ID = os.environ.get("DEMO_USER_ID", "")

# Tables to wipe (in dependency order — children before parents)
TABLES = [
    "chat_messages",
    "chat_sessions",
    "habits",
    "habit_registry",
    "meal_log",
    "recipes",
    "study_log",
    "journal_entries",
    "workout_sessions",
    "recovery_metrics",
    "fitness_log",
    "tasks",
    "timer_state",
    "profile",
]


def wipe_demo_data(client):
    for table in TABLES:
        resp = client.table(table).delete().eq("user_id", DEMO_USER_ID).execute()
        deleted = len(resp.data) if resp.data else 0
        print(f"[reset] {table}: deleted {deleted} rows")


def main():
    if not DEMO_USER_ID:
        print("[error] DEMO_USER_ID not set in .env")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Reset demo account data")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation")
    args = parser.parse_args()

    if not args.yes:
        confirm = input(f"Wipe all data for demo user {DEMO_USER_ID} and reseed? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    client = get_client()
    print(f"[reset] Wiping demo user: {DEMO_USER_ID}")
    wipe_demo_data(client)

    print("[reset] Reseeding...")
    result = subprocess.run(
        [sys.executable, str(Path(__file__).parent / "seed_demo.py")],
        capture_output=False,
    )
    if result.returncode != 0:
        print(f"[reset] seed_demo.py exited with code {result.returncode}")
        sys.exit(result.returncode)

    print("[reset] Demo account reset complete.")


if __name__ == "__main__":
    main()
