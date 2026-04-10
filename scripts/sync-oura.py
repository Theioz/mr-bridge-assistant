#!/usr/bin/env python3
"""
Sync Oura Ring recovery metrics to Supabase (recovery_metrics table).
Usage:
  python3 scripts/sync-oura.py [--days 7] [--yes]

Requires: python-dotenv, supabase
  pip3 install python-dotenv supabase

Get your Oura personal access token at: https://cloud.ouraring.com/personal-access-tokens
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request  # used for Request construction
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, upsert, log_sync, urlopen_with_retry


def oura_get(endpoint, start_date, end_date):
    token = os.environ.get("OURA_ACCESS_TOKEN", "")
    if not token:
        print("[error] OURA_ACCESS_TOKEN not set in .env")
        sys.exit(1)
    url = f"https://api.ouraring.com/v2/usercollection/{endpoint}?start_date={start_date}&end_date={end_date}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        return urlopen_with_retry(req)
    except urllib.error.HTTPError as e:
        print(f"[error] Oura API {endpoint} returned {e.code}: {e.read().decode()}")
        sys.exit(1)


def fmt_time(iso):
    """Extract HH:MM:SS from ISO datetime string for Postgres time column."""
    if not iso:
        return None
    try:
        return iso[11:19]  # "HH:MM:SS"
    except Exception:
        return None


def secs_to_hrs(seconds) -> float | None:
    if not seconds:
        return None
    return round(int(seconds) / 3600, 3)


def fetch_sleep_detail(start, end) -> dict:
    data = oura_get("sleep", start, end)
    result = {}
    for d in data.get("data", []):
        if d.get("type") not in ("long_sleep", "sleep"):
            continue
        day = d.get("day")
        if not day:
            continue
        result[day] = {
            "bedtime": fmt_time(d.get("bedtime_start")),
            "total_sleep_hrs": secs_to_hrs(d.get("total_sleep_duration")),
            "deep_hrs": secs_to_hrs(d.get("deep_sleep_duration")),
            "rem_hrs": secs_to_hrs(d.get("rem_sleep_duration")),
            "avg_hrv": int(round(d["average_hrv"])) if d.get("average_hrv") else None,
            "resting_hr": d.get("lowest_heart_rate"),
        }
    return result


def fetch_readiness(start, end) -> dict:
    data = oura_get("daily_readiness", start, end)
    return {d["day"]: d.get("score") for d in data.get("data", [])}


def fetch_sleep_scores(start, end) -> dict:
    data = oura_get("daily_sleep", start, end)
    return {d["day"]: d.get("score") for d in data.get("data", [])}


def fetch_active_calories(start, end) -> dict:
    data = oura_get("daily_activity", start, end)
    return {d["day"]: d.get("active_calories") for d in data.get("data", [])}


def existing_dates(client) -> set:
    rows = client.table("recovery_metrics").select("date").execute().data
    return {r["date"] for r in rows}


def main():
    parser = argparse.ArgumentParser(description="Sync Oura recovery metrics to Supabase")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    end = datetime.now()
    start = end - timedelta(days=args.days)
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")

    print(f"[sync-oura] Fetching {start_str} to {end_str}...")

    sleep_detail = fetch_sleep_detail(start_str, end_str)
    readiness = fetch_readiness(start_str, end_str)
    sleep_scores = fetch_sleep_scores(start_str, end_str)
    active_cal = fetch_active_calories(start_str, end_str)

    all_dates = sorted(set(readiness) | set(sleep_detail))

    client = get_client()
    existing = existing_dates(client)
    new_dates = [d for d in all_dates if d not in existing]

    if not new_dates:
        print("[sync-oura] No new data.")
        return

    print(f"\nNew recovery entries ({len(new_dates)}):")
    for d in new_dates:
        sd = sleep_detail.get(d, {})
        print(
            f"  {d} — Readiness: {readiness.get(d)} | Sleep: {sleep_scores.get(d)} | "
            f"Total: {sd.get('total_sleep_hrs')}h | HRV: {sd.get('avg_hrv')}ms | "
            f"RHR: {sd.get('resting_hr')} | Active Cal: {active_cal.get(d)}"
        )

    if not args.yes:
        confirm = input("\nWrite to Supabase? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    sb_rows = []
    for d in new_dates:
        sd = sleep_detail.get(d, {})
        sb_rows.append({
            "date": d,
            "bedtime": sd.get("bedtime"),
            "total_sleep_hrs": sd.get("total_sleep_hrs"),
            "deep_hrs": sd.get("deep_hrs"),
            "rem_hrs": sd.get("rem_hrs"),
            "avg_hrv": sd.get("avg_hrv"),
            "resting_hr": sd.get("resting_hr"),
            "readiness": readiness.get(d),
            "sleep_score": sleep_scores.get(d),
            "active_cal": active_cal.get(d),
            "source": "oura",
        })

    written = upsert(client, "recovery_metrics", sb_rows, conflict="date")
    log_sync(client, "oura", "ok", written)
    print(f"[sync-oura] Synced {written} row(s) to Supabase.")


if __name__ == "__main__":
    main()
