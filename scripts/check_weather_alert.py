#!/usr/bin/env python3
"""
Check today's weather forecast and fire push notifications for severe conditions.

Alert thresholds:
  - Precipitation  > 0.2 in
  - WMO thunderstorm codes 95–99
  - High temp      > 95°F
  - Low temp       < 28°F
  - Wind speed     > 30 mph

Fires at most once per day — tracked via profile key weather_alert_last_notified.

Requires: supabase, python-dotenv
"""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _supabase import get_client, get_owner_user_id, log_notification
from fetch_weather import fetch_weather

NOTIFY_SCRIPT    = ROOT / "scripts" / "notify.sh"
CLICK_PATH       = "/dashboard"
PRECIP_THRESHOLD = 0.2    # inches
HIGH_THRESHOLD   = 95.0   # °F
LOW_THRESHOLD    = 28.0   # °F
WIND_THRESHOLD   = 30.0   # mph
THUNDER_CODES    = set(range(95, 100))  # WMO 95–99


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


def _fire(title: str, message: str, client=None, user_id: str | None = None) -> bool:
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    cmd = ["bash", str(NOTIFY_SCRIPT), "--title", title, "--message", message]
    if app_url:
        cmd += ["--click-url", f"{app_url}{CLICK_PATH}"]
    try:
        subprocess.run(cmd, check=True)
        print(f"[check_weather_alert] Alert fired: {message}")
        if client and user_id:
            log_notification(client, user_id, "weather", title, message)
        return True
    except Exception as e:
        print(f"[check_weather_alert] notify error: {e}", file=sys.stderr)
        return False


def main() -> None:
    try:
        client = get_client()
    except Exception as e:
        print(f"[check_weather_alert] Supabase connection error: {e}", file=sys.stderr)
        return

    # Once-per-day guard
    today_str = date.today().isoformat()
    last_notified = get_profile_value(client, "weather_alert_last_notified")
    if last_notified == today_str:
        return

    try:
        w = fetch_weather(client=client)
    except RuntimeError as e:
        print(f"[check_weather_alert] Skipping — no location configured: {e}", file=sys.stderr)
        return
    except Exception as e:
        print(f"[check_weather_alert] Weather fetch error: {e}", file=sys.stderr)
        return

    try:
        user_id: str | None = get_owner_user_id()
    except EnvironmentError:
        user_id = None

    # Thunderstorm
    wmo = w.get("wmo_code")
    if wmo is not None and wmo in THUNDER_CODES:
        _fire(
            "Severe Weather Alert",
            f"Thunderstorm forecast today (WMO {wmo}). Check conditions before heading out.",
            client, user_id,
        )

    # Heavy precipitation
    precip = w.get("precip_in") or 0.0
    if precip > PRECIP_THRESHOLD:
        _fire(
            "Rain Alert",
            f'{precip:.1f}" of precipitation forecast today. Plan accordingly.',
            client, user_id,
        )

    # Extreme heat
    high = w.get("high")
    if high is not None and high > HIGH_THRESHOLD:
        _fire(
            "Heat Alert",
            f"High of {high:.0f}°F forecast today. Stay hydrated.",
            client, user_id,
        )

    # Freeze warning
    low = w.get("low")
    if low is not None and low < LOW_THRESHOLD:
        _fire(
            "Freeze Warning",
            f"Low of {low:.0f}°F tonight. Dress warm.",
            client, user_id,
        )

    # High wind
    wind = w.get("wind_mph") or 0.0
    if wind > WIND_THRESHOLD:
        _fire(
            "Wind Alert",
            f"Wind speeds of {wind:.0f} mph forecast today.",
            client, user_id,
        )

    set_profile_value(client, "weather_alert_last_notified", today_str)


if __name__ == "__main__":
    main()
