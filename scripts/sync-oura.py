#!/usr/bin/env python3
"""
Sync Oura Ring recovery metrics into memory/fitness_log.md.
Usage:
  python3 scripts/sync-oura.py [--days 7] [--yes]

Pulls per-night detail: total sleep, deep/REM/light breakdown, avg HRV (ms),
resting HR, bedtime, and active calories for the day.

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
RECOVERY_TABLE_HEADER = "| Date | Bedtime | Total Sleep | Deep | REM | Avg HRV | Resting HR | Readiness | Sleep Score | Active Cal | Notes |"
RECOVERY_TABLE_SEP   = "|------|---------|-------------|------|-----|---------|------------|-----------|-------------|------------|-------|"


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


def fmt_duration(seconds):
    if not seconds or seconds == "—":
        return "—"
    h = int(seconds) // 3600
    m = (int(seconds) % 3600) // 60
    return f"{h}h {m:02d}m"


def fmt_time(iso):
    """Format ISO datetime to HH:MM local-ish (strip timezone offset)."""
    if not iso:
        return "—"
    try:
        # e.g. "2026-04-04T22:30:00-07:00" → "22:30"
        t = iso[11:16]
        return t
    except Exception:
        return "—"


def fetch_sleep_detail(start, end):
    """Detailed per-night sleep data from /sleep endpoint."""
    data = oura_get("sleep", start, end)
    result = {}
    for d in data.get("data", []):
        # Only count long_sleep periods (exclude naps)
        if d.get("type") not in ("long_sleep", "sleep"):
            continue
        day = d.get("day")
        if not day:
            continue
        result[day] = {
            "bedtime": fmt_time(d.get("bedtime_start")),
            "total": fmt_duration(d.get("total_sleep_duration")),
            "deep": fmt_duration(d.get("deep_sleep_duration")),
            "rem": fmt_duration(d.get("rem_sleep_duration")),
            "hrv": round(d["average_hrv"], 1) if d.get("average_hrv") else "—",
            "rhr": d.get("lowest_heart_rate", "—"),
        }
    return result


def fetch_readiness(start, end):
    data = oura_get("daily_readiness", start, end)
    return {d["day"]: d.get("score", "—") for d in data.get("data", [])}


def fetch_sleep_scores(start, end):
    data = oura_get("daily_sleep", start, end)
    return {d["day"]: d.get("score", "—") for d in data.get("data", [])}


def fetch_active_calories(start, end):
    data = oura_get("daily_activity", start, end)
    return {d["day"]: d.get("active_calories", "—") for d in data.get("data", [])}


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
    else:
        # Update table header if it's the old schema
        if RECOVERY_TABLE_HEADER not in text:
            lines = text.split("\n")
            for i, line in enumerate(lines):
                if line.strip() == RECOVERY_HEADER:
                    # Replace next two lines (old header + sep)
                    if i + 2 < len(lines) and lines[i + 1].startswith("|"):
                        lines[i + 1] = RECOVERY_TABLE_HEADER
                        lines[i + 2] = RECOVERY_TABLE_SEP
                        break
            log_path.write_text("\n".join(lines))


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
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    if not FITNESS_LOG.exists():
        print(f"[error] {FITNESS_LOG} not found.")
        sys.exit(1)

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
    existing = existing_recovery_dates(FITNESS_LOG)
    new_dates = [d for d in all_dates if d not in existing]

    if not new_dates:
        print("[sync-oura] No new data.")
        return

    print(f"\nNew recovery entries ({len(new_dates)}):")
    for d in new_dates:
        sd = sleep_detail.get(d, {})
        print(
            f"  {d} — Readiness: {readiness.get(d, '—')} | Sleep: {sleep_scores.get(d, '—')} | "
            f"Total: {sd.get('total', '—')} | Deep: {sd.get('deep', '—')} | REM: {sd.get('rem', '—')} | "
            f"HRV: {sd.get('hrv', '—')}ms | RHR: {sd.get('rhr', '—')} | Active Cal: {active_cal.get(d, '—')}"
        )

    if not args.yes:
        confirm = input("\nWrite to fitness_log.md? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    ensure_recovery_section(FITNESS_LOG)

    rows = []
    for d in new_dates:
        sd = sleep_detail.get(d, {})
        rows.append(
            f"| {d} | {sd.get('bedtime', '—')} | {sd.get('total', '—')} | "
            f"{sd.get('deep', '—')} | {sd.get('rem', '—')} | {sd.get('hrv', '—')} | "
            f"{sd.get('rhr', '—')} | {readiness.get(d, '—')} | {sleep_scores.get(d, '—')} | "
            f"{active_cal.get(d, '—')} | |"
        )

    insert_recovery_rows(rows, FITNESS_LOG)
    print(f"[sync-oura] Added {len(new_dates)} row(s). Commit and push to sync.")


if __name__ == "__main__":
    main()
