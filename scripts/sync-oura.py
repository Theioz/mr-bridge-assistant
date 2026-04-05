#!/usr/bin/env python3
"""
Sync Oura Ring recovery metrics into memory/fitness_log.md.
Usage: python3 scripts/sync-oura.py [--days 7]

Requires: python-dotenv
  pip3 install python-dotenv

Get your Oura personal access token at: https://cloud.ouraring.com/personal-access-tokens
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
FITNESS_LOG = ROOT / "memory" / "fitness_log.md"
RECOVERY_HEADER = "## Recovery Metrics"
RECOVERY_TABLE_HEADER = "| Date | Readiness | Sleep Score | Avg HRV | Resting HR | Notes |"
RECOVERY_TABLE_SEP   = "|------|-----------|-------------|---------|------------|-------|"


def oura_get(endpoint, start_date, end_date):
    token = os.environ.get("OURA_ACCESS_TOKEN", "")
    if not token:
        print("[error] OURA_ACCESS_TOKEN not set in .env")
        sys.exit(1)
    url = f"https://api.ouraring.com/v2/usercollection/{endpoint}?start_date={start_date}&end_date={end_date}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"[error] Oura API {endpoint} returned {e.code}: {e.read().decode()}")
        sys.exit(1)


def fetch_readiness(start, end):
    data = oura_get("daily_readiness", start, end)
    return {d["day"]: d["score"] for d in data.get("data", [])}


def fetch_sleep(start, end):
    """Returns sleep score and avg HRV (ms) and avg resting HR per day."""
    data = oura_get("daily_sleep", start, end)
    result = {}
    for d in data.get("data", []):
        result[d["day"]] = {
            "score": d.get("score", "—"),
            "hrv": d.get("contributors", {}).get("hrv_balance", "—"),
        }
    return result


def fetch_resting_hr(start, end):
    """Returns average resting heart rate per day from daily_readiness contributors."""
    data = oura_get("daily_readiness", start, end)
    return {
        d["day"]: d.get("contributors", {}).get("resting_heart_rate", "—")
        for d in data.get("data", [])
    }


def existing_recovery_dates(log_path):
    if not log_path.exists():
        return set()
    text = log_path.read_text()
    idx = text.find(RECOVERY_HEADER)
    if idx == -1:
        return set()
    dates = set()
    for line in text[idx:].split("\n"):
        if line.startswith("| ") and not line.startswith("| Date") and not line.startswith("| —") and not line.startswith("|---"):
            parts = [p.strip() for p in line.strip("| \n").split("|")]
            if parts and parts[0] and len(parts[0]) == 10:
                dates.add(parts[0])
    return dates


def ensure_recovery_section(log_path):
    text = log_path.read_text()
    if RECOVERY_HEADER not in text:
        addition = f"\n{RECOVERY_HEADER}\n{RECOVERY_TABLE_HEADER}\n{RECOVERY_TABLE_SEP}\n"
        log_path.write_text(text.rstrip() + "\n" + addition)


def insert_recovery_rows(new_rows, log_path):
    text = log_path.read_text()
    lines = text.split("\n")
    section_line = next(
        (i for i, l in enumerate(lines) if l.strip() == RECOVERY_HEADER), None
    )
    if section_line is None:
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
    parser = argparse.ArgumentParser(description="Sync Oura recovery metrics to fitness_log.md")
    parser.add_argument("--days", type=int, default=7, help="Number of days to fetch (default: 7)")
    args = parser.parse_args()

    if not FITNESS_LOG.exists():
        print(f"[error] {FITNESS_LOG} not found. Copy fitness_log.template.md first.")
        sys.exit(1)

    end = datetime.now()
    start = end - timedelta(days=args.days)
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")

    print(f"[sync-oura] Fetching {start_str} to {end_str}...")

    readiness = fetch_readiness(start_str, end_str)
    sleep = fetch_sleep(start_str, end_str)
    rhr = fetch_resting_hr(start_str, end_str)

    all_dates = sorted(set(readiness) | set(sleep))
    existing = existing_recovery_dates(FITNESS_LOG)
    new_dates = [d for d in all_dates if d not in existing]

    if not new_dates:
        print("[sync-oura] No new data to add.")
        return

    print(f"\nNew recovery entries ({len(new_dates)}):")
    for d in new_dates:
        r = readiness.get(d, "—")
        s = sleep.get(d, {}).get("score", "—")
        h = sleep.get(d, {}).get("hrv", "—")
        hr = rhr.get(d, "—")
        print(f"  {d} — Readiness: {r} | Sleep: {s} | HRV: {h} | RHR: {hr}")

    confirm = input("\nWrite to fitness_log.md? [y/N] ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        return

    ensure_recovery_section(FITNESS_LOG)

    rows = []
    for d in new_dates:
        r = readiness.get(d, "—")
        s = sleep.get(d, {}).get("score", "—")
        h = sleep.get(d, {}).get("hrv", "—")
        hr = rhr.get(d, "—")
        rows.append(f"| {d} | {r} | {s} | {h} | {hr} | |")

    insert_recovery_rows(rows, FITNESS_LOG)
    print(f"[sync-oura] Added {len(new_dates)} row(s). Commit and push to sync.")


if __name__ == "__main__":
    main()
