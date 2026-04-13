#!/usr/bin/env python3
"""
Check today's HRV against a 7-day rolling baseline. Fires a push notification
via notify.sh if today's HRV is more than hrv_alert_threshold% below baseline.

Alert fires at most once per day — tracked via profile key hrv_alert_last_notified.
Threshold is configurable via profile key hrv_alert_threshold (default: 20).

Requires: supabase, python-dotenv
"""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _supabase import get_client

NOTIFY_SCRIPT = ROOT / "scripts" / "notify.sh"
CLICK_PATH = "/dashboard"
DEFAULT_THRESHOLD = 20  # percent


def get_profile_value(client, key: str) -> str | None:
    rows = (
        client.table("profile")
        .select("value")
        .eq("key", key)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["value"] if rows else None


def set_profile_value(client, key: str, value: str) -> None:
    client.table("profile").upsert({"key": key, "value": value}, on_conflict="key").execute()


def main() -> None:
    try:
        client = get_client()
    except Exception as e:
        print(f"[check_hrv_alert] Supabase connection error: {e}", file=sys.stderr)
        return

    # Once-per-day guard
    today_str = date.today().isoformat()
    last_notified = get_profile_value(client, "hrv_alert_last_notified")
    if last_notified == today_str:
        return

    # Read threshold from profile (default 20%)
    threshold_raw = get_profile_value(client, "hrv_alert_threshold")
    try:
        threshold = float(threshold_raw) if threshold_raw else DEFAULT_THRESHOLD
    except ValueError:
        threshold = DEFAULT_THRESHOLD

    # Fetch last 8 days of HRV (desc), filter out nulls
    cutoff = (date.today() - timedelta(days=7)).isoformat()
    rows = (
        client.table("recovery_metrics")
        .select("date, avg_hrv")
        .not_("avg_hrv", "is", None)
        .gte("date", cutoff)
        .order("date", desc=True)
        .limit(8)
        .execute()
        .data
    )

    if not rows:
        return

    # Most recent row = today (or most recent available)
    most_recent_date = rows[0]["date"]
    if most_recent_date != today_str:
        # Oura data lags — today's data isn't in yet, nothing to check
        return

    today_hrv = rows[0]["avg_hrv"]
    if today_hrv is None:
        return

    # Baseline = average of the prior 7 days (rows[1:8])
    baseline_rows = [r["avg_hrv"] for r in rows[1:] if r["avg_hrv"] is not None]
    if len(baseline_rows) < 3:
        # Not enough history to compute a reliable baseline
        return

    baseline = sum(baseline_rows) / len(baseline_rows)
    drop_pct = (baseline - today_hrv) / baseline * 100

    if drop_pct <= threshold:
        return

    # Fire alert
    title = "HRV Drop Alert"
    message = (
        f"HRV is {today_hrv:.0f}ms — {drop_pct:.0f}% below 7-day avg "
        f"({baseline:.0f}ms). Consider rest or deload."
    )
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    cmd = ["bash", str(NOTIFY_SCRIPT), "--title", title, "--message", message]
    if app_url:
        cmd += ["--click-url", f"{app_url}{CLICK_PATH}"]
    try:
        subprocess.run(cmd, check=True)
        set_profile_value(client, "hrv_alert_last_notified", today_str)
        print(f"[check_hrv_alert] Alert fired: {message}")
    except Exception as e:
        print(f"[check_hrv_alert] notify error: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
