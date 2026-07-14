#!/usr/bin/env python3
"""
Sync Google Health workouts + body composition to Supabase.
  workout_sessions — activity/HR data, incl. per-session heart-rate zones
  fitness_log      — body weight, body fat %, derived BMI (source: "google_health")

Replaces sync-fitbit.py and sync-googlefit.py (#607). The Fitbit Web API is turned
down September 2026 and the Google Fit REST API is deprecated; both are superseded
by the Google Health API (health.googleapis.com/v4).

Auth: reuses the existing Google OAuth client, but a SEPARATE consent — the token is
stored under provider "google_health", not "google". Connect it via /settings; there is
no CLI setup flow (unlike Fitbit, which needed its own app registration).

Usage:
  python3 scripts/sync-google-health.py             # last 7 days
  python3 scripts/sync-google-health.py --days 30
  python3 scripts/sync-google-health.py --yes       # skip confirmation
  python3 scripts/sync-google-health.py --probe     # print what would be written

Requires: python-dotenv, supabase
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
import os

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, get_owner_user_id, upsert
from _sync_log import log_sync, urlopen_with_retry
from _integrations import load_integration

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
HEALTH_API_BASE = "https://health.googleapis.com/v4"

# Google Health serves the same underlying device data that Fitbit and Google Fit did,
# so dedup must consider rows written under the retired source labels — otherwise every
# workout already stored as "fitbit" would be re-inserted as "google_health" at cutover.
WORKOUT_SOURCES = ["google_health", "fitbit"]
BODY_SOURCES = ["google_health", "fitbit_body", "google_fit"]

# Fitbit returned display strings ("Walking"); Google returns an exerciseType enum
# across 182 values. Alias the ones that had canonical names, title-case the rest.
ACTIVITY_ALIASES = {
    "WALKING": "Walk",
    "RUNNING": "Run",
    "TREADMILL_RUNNING": "Run",
    "BIKING": "Bike",
    "BIKING_STATIONARY": "Bike",
    "MOUNTAIN_BIKING": "Bike",
    "ELECTRIC_BIKE": "Bike",
    "SWIMMING": "Swim",
    "SWIMMING_POOL": "Swim",
    "SWIMMING_OPEN_WATER": "Swim",
    "HIKING": "Hike",
    "WEIGHTLIFTING": "Strength",
    "STRENGTH_TRAINING": "Strength",
}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def get_access_token(client, user_id: str) -> str:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        sys.exit("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in .env")

    integration = load_integration(client, user_id, "google_health")
    if not integration or not integration.get("refresh_token"):
        sys.exit("Google Health not connected — authorize via /settings")

    body = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": integration["refresh_token"],
        "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request(
        GOOGLE_TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return urlopen_with_retry(req)["access_token"]


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def list_data_points(access_token: str, data_type: str, filter_expr: str | None = None,
                     page_size: int = 100) -> list[dict]:
    """dataPoints.list, following pagination. `exercise` caps pageSize at 25."""
    points: list[dict] = []
    page_token: str | None = None

    while True:
        params = {"pageSize": str(page_size)}
        if filter_expr:
            params["filter"] = filter_expr
        if page_token:
            params["pageToken"] = page_token

        url = f"{HEALTH_API_BASE}/users/me/dataTypes/{data_type}/dataPoints?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}"})
        data = urlopen_with_retry(req)

        points.extend(data.get("dataPoints") or [])
        page_token = data.get("nextPageToken")
        if not page_token:
            return points


def civil_range_filter(field: str, start_str: str, end_str: str) -> str:
    """Civil (local wall-clock) time filter. Upper bound is exclusive.

    Note the filter uses the snake_case data-type name while the URL path uses
    kebab-case — e.g. path `body-fat`, filter `body_fat.sample_time.civil_time`.
    """
    return f'{field} >= "{start_str}T00:00:00" AND {field} < "{end_str}T00:00:00"'


# ---------------------------------------------------------------------------
# Parsing — the API hands back civil (local) date/time directly, which is the
# equivalent of Fitbit's local timestamps. No offset arithmetic needed.
# ---------------------------------------------------------------------------

def local_datetime(utc_time: str | None, utc_offset: str | None) -> datetime | None:
    """The user's wall-clock time for an observation.

    The API accepts `civil_*` fields in a FILTER but does not return them in the
    response — an interval carries only `startTime` (UTC) and `startUtcOffset`
    (a google-duration like "-25200s"). Verified against live data: startTime
    2026-07-11T00:16:17Z with offset -25200s is a workout logged at 17:16 on 07-10.
    Reading the documented `civilStartTime` instead yields None and silently drops
    every row.
    """
    if not utc_time:
        return None
    try:
        dt = datetime.fromisoformat(utc_time.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt + timedelta(seconds=duration_secs(utc_offset))


def local_date(dt: datetime | None) -> str | None:
    return dt.strftime("%Y-%m-%d") if dt else None


def local_time(dt: datetime | None) -> str | None:
    return dt.strftime("%H:%M:%S") if dt else None


def duration_secs(d: str | None) -> float:
    """google-duration — '3600s', possibly fractional."""
    if not d:
        return 0.0
    try:
        return float(str(d).rstrip("s"))
    except ValueError:
        return 0.0


def fmt_hr_zones(zones: dict | None) -> str | None:
    """Google's four zones (Light/Moderate/Vigorous/Peak) replace Fitbit's three
    (Fat Burn/Cardio/Peak). Ordered hardest-first, as fmt_hr_zones did for Fitbit."""
    if not zones:
        return None
    ordered = [
        ("Peak", duration_secs(zones.get("peakTime"))),
        ("Vigorous", duration_secs(zones.get("vigorousTime"))),
        ("Moderate", duration_secs(zones.get("moderateTime"))),
        ("Light", duration_secs(zones.get("lightTime"))),
    ]
    parts = [f"{name}: {round(secs / 60)}m" for name, secs in ordered if secs > 0]
    return " | ".join(parts) if parts else None


def normalize_activity(exercise_type: str | None, display_name: str | None) -> str:
    if not exercise_type or exercise_type == "EXERCISE_TYPE_UNSPECIFIED":
        return display_name or "Unknown"
    if exercise_type in ACTIVITY_ALIASES:
        return ACTIVITY_ALIASES[exercise_type]
    return " ".join(w.capitalize() for w in exercise_type.split("_"))


def time_to_mins(t: str | None) -> int | None:
    if not t:
        return None
    h, m, *_ = t.split(":")
    return int(h) * 60 + int(m)


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------

def fetch_body(access_token: str, start_str: str, end_excl: str) -> list[dict]:
    """Weight + body fat, keyed by local date. BMI is derived — Google Health has no
    `bmi` data type (Fitbit supplied one directly), so it needs weight + height."""
    weights = list_data_points(
        access_token, "weight",
        civil_range_filter("weight.sample_time.civil_time", start_str, end_excl))
    fats = list_data_points(
        access_token, "body-fat",
        civil_range_filter("body_fat.sample_time.civil_time", start_str, end_excl))
    # Height changes rarely and is only needed for BMI — take the latest on file.
    heights = list_data_points(access_token, "height", None, 1)

    height_mm = ((heights[0].get("height") or {}).get("heightMillimeters")
                 if heights else None)
    height_m = height_mm / 1000 if height_mm else None

    by_date: dict[str, dict] = {}
    for p in weights:
        w = p.get("weight") or {}
        st = w.get("sampleTime") or {}
        date = local_date(local_datetime(st.get("physicalTime"), st.get("utcOffset")))
        grams = w.get("weightGrams")
        if date and grams is not None:
            by_date.setdefault(date, {})["weight_kg"] = grams / 1000
    for p in fats:
        f = p.get("bodyFat") or {}
        st = f.get("sampleTime") or {}
        date = local_date(local_datetime(st.get("physicalTime"), st.get("utcOffset")))
        pct = f.get("percentage")
        if date and pct is not None:
            by_date.setdefault(date, {})["fat_pct"] = pct

    rows = []
    for date, m in sorted(by_date.items()):
        if "weight_kg" not in m:
            continue
        kg = m["weight_kg"]
        row = {
            "date": date,
            "weight_lb": round(kg * 2.20462, 1),
            "body_fat_pct": round(m["fat_pct"], 1) if "fat_pct" in m else None,
            "bmi": round(kg / (height_m ** 2), 1) if height_m else None,
            # `{}`, not None — fitness_log.metadata is `jsonb NOT NULL DEFAULT '{}'`,
            # and a DEFAULT only applies when the column is omitted.
            "metadata": {},
        }
        rows.append(row)
    return rows


def fetch_workouts(access_token: str, start_str: str, end_excl: str) -> list[dict]:
    points = list_data_points(
        access_token, "exercise",
        civil_range_filter("exercise.interval.civil_start_time", start_str, end_excl),
        page_size=25)  # exercise caps pageSize at 25

    rows = []
    for p in points:
        ex = p.get("exercise")
        if not ex:
            continue
        interval = ex.get("interval") or {}
        start_local = local_datetime(interval.get("startTime"), interval.get("startUtcOffset"))
        date = local_date(start_local)
        if not date:
            continue

        # activeDuration excludes pauses; Fitbit's `duration` did not.
        duration_min = round(duration_secs(ex.get("activeDuration")) / 60)
        if duration_min < 5:
            continue

        start_time = local_time(start_local)
        metrics = ex.get("metricsSummary") or {}
        avg_hr = metrics.get("averageHeartRateBeatsPerMinute")
        calories = metrics.get("caloriesKcal")
        activity = normalize_activity(ex.get("exerciseType"), ex.get("displayName"))

        rows.append({
            "date": date,
            "start_time": start_time,
            "activity": activity,
            "duration_mins": duration_min,
            "calories": round(calories) if calories is not None else None,
            "avg_hr": int(avg_hr) if avg_hr is not None else None,
            "source": "google_health",
            "metadata": {"hr_zones": fmt_hr_zones(metrics.get("heartRateZoneDurations"))},
            "_key": f"{date}|{start_time}|{activity}",
        })
    return rows


# ---------------------------------------------------------------------------
# Dedup against existing rows
# ---------------------------------------------------------------------------

def existing_body_dates(client, user_id: str) -> set[str]:
    """Dates already carrying body fat % from any source, or already written by a
    body-composition source (including the retired Fitbit / Google Fit labels)."""
    rich = (client.table("fitness_log").select("date")
            .eq("user_id", user_id).not_.is_("body_fat_pct", "null").execute().data)
    known = (client.table("fitness_log").select("date")
             .eq("user_id", user_id).in_("source", BODY_SOURCES).execute().data)
    return {r["date"] for r in rich} | {r["date"] for r in known}


def filter_new_workouts(client, user_id: str, rows: list[dict]) -> list[dict]:
    """Exact-key dedup, then a ±5 min same-date overlap check.

    Unlike the Fitbit sync, an overlapping row is never replaced: the existing row is
    the same workout already stored under the old source label, so swapping it would
    churn history for no gain.
    """
    existing = (client.table("workout_sessions")
                .select("id,date,start_time,activity,avg_hr,duration_mins,source")
                .eq("user_id", user_id).in_("source", WORKOUT_SOURCES).execute().data)

    existing_keys = {f"{r['date']}|{r['start_time']}|{r['activity']}" for r in existing}
    candidates = [r for r in rows if r["_key"] not in existing_keys]

    by_date: dict[str, list[dict]] = {}
    for r in existing:
        by_date.setdefault(r["date"], []).append(r)

    OVERLAP_MINS = 5
    new_rows = []
    for row in candidates:
        new_mins = time_to_mins(row["start_time"])
        overlapped = False
        for ex in by_date.get(row["date"], []):
            ex_mins = time_to_mins(ex["start_time"])
            if new_mins is None or ex_mins is None:
                continue
            if abs(new_mins - ex_mins) <= OVERLAP_MINS:
                overlapped = True
                break
        if not overlapped:
            new_rows.append(row)
    return new_rows


# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Google Health to Supabase")
    parser.add_argument("--days", type=int, default=7, help="days back to sync")
    parser.add_argument("--yes", action="store_true", help="skip confirmation")
    parser.add_argument("--probe", action="store_true", help="print without writing")
    args = parser.parse_args()

    client = get_client()
    owner_user_id = get_owner_user_id()
    access_token = get_access_token(client, owner_user_id)

    end = datetime.now()
    start_str = (end - timedelta(days=args.days)).strftime("%Y-%m-%d")
    # The filter's upper bound is exclusive, so it must land on the day AFTER today
    # for today's own samples to be included.
    end_excl = (end + timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"[sync-google-health] Fetching body composition {start_str} to {end_excl} (excl)...")
    body_rows = fetch_body(access_token, start_str, end_excl)

    print(f"[sync-google-health] Fetching workouts {start_str} to {end_excl} (excl)...")
    workout_rows = fetch_workouts(access_token, start_str, end_excl)

    if args.probe:
        print(f"\n[probe] {len(body_rows)} body row(s):")
        for r in body_rows:
            print(f"  {r['date']} — weight={r['weight_lb']} lb | fat={r['body_fat_pct']} | BMI={r['bmi']}")
        print(f"\n[probe] {len(workout_rows)} workout row(s):")
        for r in workout_rows:
            zones = r["metadata"]["hr_zones"] or "no zones"
            print(f"  {r['date']} {r['start_time']} — {r['activity']} "
                  f"({r['duration_mins']} min, {r['calories']} cal, HR {r['avg_hr']}) [{zones}]")
        return

    skip_dates = existing_body_dates(client, owner_user_id)
    new_body = [r for r in body_rows if r["date"] not in skip_dates]
    new_workouts = filter_new_workouts(client, owner_user_id, workout_rows)

    if new_body:
        print(f"\nNew body composition entries ({len(new_body)}):")
        for r in new_body:
            parts = [f"weight={r['weight_lb']} lb"]
            if r["body_fat_pct"] is not None:
                parts.append(f"fat={r['body_fat_pct']}%")
            if r["bmi"] is not None:
                parts.append(f"BMI={r['bmi']}")
            print(f"  {r['date']} — {' | '.join(parts)}")

    if new_workouts:
        print(f"\nNew workout entries ({len(new_workouts)}):")
        for r in new_workouts:
            hr_info = f" | Avg HR: {r['avg_hr']}" if r["avg_hr"] else ""
            print(f"  {r['date']} {r['start_time']} — {r['activity']} "
                  f"({r['duration_mins']} min, {r['calories']} cal{hr_info})")

    if not new_body and not new_workouts:
        print("[sync-google-health] No new data.")
        return

    if not args.yes:
        if input("\nWrite to Supabase? [y/N] ").strip().lower() != "y":
            print("Aborted.")
            return

    written = 0
    if new_body:
        rows = [{**r, "source": "google_health", "user_id": owner_user_id} for r in new_body]
        written += upsert(client, "fitness_log", rows)
        print(f"[sync-google-health] Synced {len(rows)} body row(s) to fitness_log.")

    if new_workouts:
        rows = [{k: v for k, v in r.items() if k != "_key"} | {"user_id": owner_user_id}
                for r in new_workouts]
        written += upsert(client, "workout_sessions", rows)
        print(f"[sync-google-health] Synced {len(rows)} workout row(s) to workout_sessions.")

    log_sync(client, "google_health", "ok", written)


if __name__ == "__main__":
    main()
