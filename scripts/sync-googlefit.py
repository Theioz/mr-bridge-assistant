#!/usr/bin/env python3
"""
Sync weight data from Google Fit into memory/fitness_log.md Baseline Metrics.
Usage: python3 scripts/sync-googlefit.py [--days 7]

Note: Workout data is sourced from Fitbit (scripts/sync-fitbit.py) — Google Fit
workout tracking is unreliable due to background step/activity noise.

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


def get_credentials():
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/fitness.body.read"],
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
    parser = argparse.ArgumentParser(description="Sync Google Fit weight to fitness_log.md")
    parser.add_argument("--days", type=int, default=7, help="Number of days to fetch (default: 7)")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    if not FITNESS_LOG.exists():
        print(f"[error] {FITNESS_LOG} not found. Copy fitness_log.template.md first.")
        sys.exit(1)

    print(f"[sync-googlefit] Fetching weight for last {args.days} days...")
    creds = get_credentials()
    print("[sync-googlefit] Authenticated.")

    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=args.days)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    weight_rows = fetch_weight(creds, start_ms, end_ms)
    existing_weight = existing_dates_in_section("## Baseline Metrics", FITNESS_LOG)
    new_weight = [r for r in weight_rows if r["date"] not in existing_weight]

    if not new_weight:
        print("[sync-googlefit] No new weight data to add.")
        return

    print(f"\nNew weight entries ({len(new_weight)}):")
    for r in sorted(new_weight, key=lambda x: x["date"]):
        print(f"  {r['date']} — {r['weight']}")

    if not args.yes:
        confirm = input("\nWrite to fitness_log.md? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    rows = [
        f"| {r['date']} | {r['weight']} | — | — | — | |"
        for r in sorted(new_weight, key=lambda x: x["date"])
    ]
    insert_rows_after_table("## Baseline Metrics", rows, FITNESS_LOG)
    print(f"[sync-googlefit] Added {len(new_weight)} weight row(s). Commit and push to sync.")


if __name__ == "__main__":
    main()
