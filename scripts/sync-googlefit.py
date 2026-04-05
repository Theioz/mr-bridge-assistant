#!/usr/bin/env python3
"""
Sync weight and workout data from Google Fit into memory/fitness_log.md.
Usage: python3 scripts/sync-googlefit.py [--days 7]

Requires: google-auth, google-auth-oauthlib, python-dotenv
  pip3 install google-auth google-auth-oauthlib python-dotenv
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
FITNESS_LOG = ROOT / "memory" / "fitness_log.md"

# Google Fit activity type codes → human-readable names
ACTIVITY_TYPES = {
    1: "Biking", 7: "Walking", 8: "Running", 9: "Running",
    10: "Treadmill run", 13: "Hiking", 15: "Jump rope",
    17: "Kickboxing", 21: "Martial arts", 23: "Pilates",
    28: "Rowing", 29: "Rowing machine", 33: "Skating",
    45: "HIIT", 52: "Swimming", 55: "Tennis",
    59: "Weightlifting", 63: "Yoga", 82: "Strength training",
    108: "Elliptical", 113: "Stair climbing",
}


def get_credentials():
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=[
            "https://www.googleapis.com/auth/fitness.body.read",
            "https://www.googleapis.com/auth/fitness.activity.read",
        ],
    )
    creds.refresh(Request())
    return creds


def fit_post(creds, endpoint, body):
    url = f"https://www.googleapis.com/fitness/v1/users/me/{endpoint}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"[error] Google Fit API returned {e.code}: {e.read().decode()}")
        sys.exit(1)


def fetch_weight(creds, start_ms, end_ms):
    body = {
        "aggregateBy": [{"dataTypeName": "com.google.weight"}],
        "bucketByTime": {"durationMillis": 86400000},
        "startTimeMillis": start_ms,
        "endTimeMillis": end_ms,
    }
    result = fit_post(creds, "dataset:aggregate", body)
    rows = []
    for bucket in result.get("bucket", []):
        date = datetime.fromtimestamp(
            int(bucket["startTimeMillis"]) / 1000, tz=timezone.utc
        ).strftime("%Y-%m-%d")
        for dataset in bucket.get("dataset", []):
            for point in dataset.get("point", []):
                kg = point["value"][0]["fpVal"]
                lbs = round(kg * 2.20462, 1)
                rows.append({"date": date, "weight": f"{lbs} lbs ({kg:.1f} kg)"})
    return rows


def fetch_workouts(creds, start_ms, end_ms):
    body = {
        "aggregateBy": [{"dataTypeName": "com.google.activity.segment"}],
        "bucketByTime": {"durationMillis": 86400000},
        "startTimeMillis": start_ms,
        "endTimeMillis": end_ms,
    }
    result = fit_post(creds, "dataset:aggregate", body)
    rows = []
    for bucket in result.get("bucket", []):
        date = datetime.fromtimestamp(
            int(bucket["startTimeMillis"]) / 1000, tz=timezone.utc
        ).strftime("%Y-%m-%d")
        activities = []
        for dataset in bucket.get("dataset", []):
            for point in dataset.get("point", []):
                atype = point["value"][0]["intVal"]
                start_ns = int(point["startTimeNanos"])
                end_ns = int(point["endTimeNanos"])
                duration_min = round((end_ns - start_ns) / 60_000_000_000)
                if duration_min >= 5:
                    name = ACTIVITY_TYPES.get(atype, f"Activity {atype}")
                    activities.append(f"{name} ({duration_min} min)")
        if activities:
            rows.append({"date": date, "activities": ", ".join(activities)})
    return rows


def existing_dates_in_section(section_header, log_path):
    if not log_path.exists():
        return set()
    text = log_path.read_text()
    idx = text.find(section_header)
    if idx == -1:
        return set()
    dates = set()
    for line in text[idx:].split("\n"):
        if line.startswith("| ") and not line.startswith("| Date") and not line.startswith("| —"):
            parts = [p.strip() for p in line.strip("| \n").split("|")]
            if parts and parts[0]:
                dates.add(parts[0])
    return dates


def insert_rows_after_table(section_header, new_rows, log_path):
    text = log_path.read_text()
    lines = text.split("\n")
    section_line = next(
        (i for i, l in enumerate(lines) if l.strip() == section_header), None
    )
    if section_line is None:
        print(f"[error] Section '{section_header}' not found in {log_path.name}")
        return False
    # Find last table row in this section
    last_table_line = section_line
    for i in range(section_line + 1, len(lines)):
        if lines[i].startswith("|"):
            last_table_line = i
        elif last_table_line > section_line and not lines[i].startswith("|"):
            break
    for j, row in enumerate(new_rows):
        lines.insert(last_table_line + 1 + j, row)
    log_path.write_text("\n".join(lines))
    return True


def main():
    parser = argparse.ArgumentParser(description="Sync Google Fit data to fitness_log.md")
    parser.add_argument("--days", type=int, default=7, help="Number of days to fetch (default: 7)")
    args = parser.parse_args()

    if not FITNESS_LOG.exists():
        print(f"[error] {FITNESS_LOG} not found. Copy fitness_log.template.md first.")
        sys.exit(1)

    print(f"[sync-googlefit] Fetching last {args.days} days from Google Fit...")
    creds = get_credentials()
    print("[sync-googlefit] Authenticated.")

    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=args.days)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    weight_rows = fetch_weight(creds, start_ms, end_ms)
    workout_rows = fetch_workouts(creds, start_ms, end_ms)

    existing_weight = existing_dates_in_section("## Baseline Metrics", FITNESS_LOG)
    existing_workouts = existing_dates_in_section("## Session Log", FITNESS_LOG)

    new_weight = [r for r in weight_rows if r["date"] not in existing_weight]
    new_workouts = [r for r in workout_rows if r["date"] not in existing_workouts]

    if not new_weight and not new_workouts:
        print("[sync-googlefit] No new data to add.")
        return

    if new_weight:
        print(f"\nNew weight entries ({len(new_weight)}):")
        for r in sorted(new_weight, key=lambda x: x["date"]):
            print(f"  {r['date']} — {r['weight']}")

    if new_workouts:
        print(f"\nNew workout entries ({len(new_workouts)}):")
        for r in sorted(new_workouts, key=lambda x: x["date"]):
            print(f"  {r['date']} — {r['activities']}")

    confirm = input("\nWrite to fitness_log.md? [y/N] ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        return

    if new_weight:
        rows = [
            f"| {r['date']} | {r['weight']} | — | |"
            for r in sorted(new_weight, key=lambda x: x["date"])
        ]
        insert_rows_after_table("## Baseline Metrics", rows, FITNESS_LOG)
        print(f"[sync-googlefit] Added {len(new_weight)} weight row(s).")

    if new_workouts:
        rows = [
            f"| {r['date']} | — | {r['activities']} | |"
            for r in sorted(new_workouts, key=lambda x: x["date"])
        ]
        insert_rows_after_table("## Session Log", rows, FITNESS_LOG)
        print(f"[sync-googlefit] Added {len(new_workouts)} workout row(s).")

    print("[sync-googlefit] Done. Commit and push to sync.")


if __name__ == "__main__":
    main()
