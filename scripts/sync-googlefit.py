#!/usr/bin/env python3
"""
Sync weight data from Google Fit to Supabase (fitness_log table).
Usage: python3 scripts/sync-googlefit.py [--days 7] [--yes]

Note: Workout data is sourced from Fitbit (scripts/sync-fitbit.py) — Google Fit
workout tracking is unreliable due to background step/activity noise.

Requires: google-auth, google-auth-oauthlib, python-dotenv, supabase
  pip3 install google-auth google-auth-oauthlib python-dotenv supabase
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, upsert, log_sync, urlopen_with_retry


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
        return urlopen_with_retry(req)
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
        date_str = datetime.fromtimestamp(
            int(bucket["startTimeMillis"]) / 1000, tz=timezone.utc
        ).strftime("%Y-%m-%d")
        for dataset in bucket.get("dataset", []):
            for point in dataset.get("point", []):
                kg = point["value"][0]["fpVal"]
                lbs = round(kg * 2.20462, 1)
                rows.append({"date": date_str, "weight_lb": lbs})
    return rows


def existing_dates(client) -> set:
    rows = client.table("fitness_log").select("date").eq("source", "google_fit").execute().data
    return {r["date"] for r in rows}


def main():
    parser = argparse.ArgumentParser(description="Sync Google Fit weight to Supabase")
    parser.add_argument("--days", type=int, default=7, help="Days to fetch (default: 7)")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    print(f"[sync-googlefit] Fetching weight for last {args.days} days...")
    creds = get_credentials()
    print("[sync-googlefit] Authenticated.")

    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=args.days)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    weight_rows = fetch_weight(creds, start_ms, end_ms)

    client = get_client()
    existing = existing_dates(client)
    new_weight = [r for r in weight_rows if r["date"] not in existing]

    if not new_weight:
        print("[sync-googlefit] No new weight data.")
        return

    print(f"\nNew weight entries ({len(new_weight)}):")
    for r in sorted(new_weight, key=lambda x: x["date"]):
        print(f"  {r['date']} — {r['weight_lb']} lb")

    if not args.yes:
        confirm = input("\nWrite to Supabase? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    sb_rows = [
        {"date": r["date"], "weight_lb": r["weight_lb"], "source": "google_fit"}
        for r in sorted(new_weight, key=lambda x: x["date"])
    ]
    written = upsert(client, "fitness_log", sb_rows)
    log_sync(client, "google_fit", "ok", written)
    print(f"[sync-googlefit] Synced {written} row(s) to Supabase.")


if __name__ == "__main__":
    main()
