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
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, get_owner_user_id, upsert
from _sync_log import log_sync, urlopen_with_retry
from _integrations import load_integration

# Resolved once in main() from user_integrations
_OURA_TOKEN: str = ""


def oura_get(endpoint: str, start_date: str, end_date: str, required: bool = True) -> dict | None:
    """Fetch an Oura v2 endpoint with start_date/end_date params. Returns None when required=False and a 4xx occurs."""
    token = _OURA_TOKEN
    if not token:
        print("[error] No Oura token — connect via Settings or set OURA_ACCESS_TOKEN in .env")
        sys.exit(1)
    url = (
        f"https://api.ouraring.com/v2/usercollection/{endpoint}"
        f"?start_date={start_date}&end_date={end_date}"
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        return urlopen_with_retry(req)
    except urllib.error.HTTPError as e:
        if not required and e.code in (400, 403, 404, 422):
            print(f"[info] Oura {endpoint} not available ({e.code}) — skipping")
            return None
        print(f"[error] Oura API {endpoint} returned {e.code}: {e.read().decode()}")
        sys.exit(1)


def oura_get_datetime(endpoint: str, start_dt: str, end_dt: str) -> dict | None:
    """Fetch an Oura v2 endpoint with start_datetime/end_datetime params (e.g. heartrate, workout)."""
    token = _OURA_TOKEN
    if not token:
        print("[error] No Oura token — connect via Settings or set OURA_ACCESS_TOKEN in .env")
        sys.exit(1)
    url = (
        f"https://api.ouraring.com/v2/usercollection/{endpoint}"
        f"?start_datetime={start_dt}&end_datetime={end_dt}"
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        return urlopen_with_retry(req)
    except urllib.error.HTTPError as e:
        if e.code in (400, 403, 404, 422):
            print(f"[info] Oura {endpoint} not available ({e.code}) — skipping")
            return None
        print(f"[error] Oura API {endpoint} returned {e.code}: {e.read().decode()}")
        sys.exit(1)


def fmt_time(iso: str | None) -> str | None:
    """Extract HH:MM:SS from ISO datetime string for Postgres time column."""
    if not iso:
        return None
    try:
        return iso[11:19]
    except Exception:
        return None


def secs_to_hrs(seconds) -> float | None:
    if not seconds:
        return None
    return round(int(seconds) / 3600, 3)


def secs_to_mins(seconds) -> float | None:
    if not seconds:
        return None
    return round(int(seconds) / 60, 1)


# ---------------------------------------------------------------------------
# Per-endpoint fetchers
# ---------------------------------------------------------------------------

def fetch_sleep_detail(start: str, end: str) -> dict:
    """
    Fetch detailed sleep sessions. Returns dict keyed by day with:
      bedtime, bedtime_end, total_sleep_hrs, light_hrs, deep_hrs, rem_hrs,
      awake_hrs, avg_hrv, resting_hr, avg_hr_sleep, avg_breath,
      efficiency, latency_mins, restless_periods.
    Only long_sleep sessions are used (main overnight sleep).
    """
    data = oura_get("sleep", start, end)
    result: dict[str, dict] = {}
    for d in data.get("data", []):
        if d.get("type") != "long_sleep":
            continue
        day = d.get("day")
        if not day:
            continue
        result[day] = {
            "bedtime":          fmt_time(d.get("bedtime_start")),
            "bedtime_end":      fmt_time(d.get("bedtime_end")),
            "total_sleep_hrs":  secs_to_hrs(d.get("total_sleep_duration")),
            "light_hrs":        secs_to_hrs(d.get("light_sleep_duration")),
            "deep_hrs":         secs_to_hrs(d.get("deep_sleep_duration")),
            "rem_hrs":          secs_to_hrs(d.get("rem_sleep_duration")),
            "awake_hrs":        secs_to_hrs(d.get("awake_time")),
            "avg_hrv":          int(round(d["average_hrv"])) if d.get("average_hrv") else None,
            "resting_hr":       d.get("lowest_heart_rate"),
            "avg_hr_sleep":     int(round(d["average_heart_rate"])) if d.get("average_heart_rate") else None,
            "avg_breath":       round(d["average_breath"], 1) if d.get("average_breath") else None,
            "efficiency":       d.get("efficiency"),
            "latency_mins":     secs_to_mins(d.get("latency")),
            "restless_periods": d.get("restless_periods"),
        }
    return result


def fetch_readiness(start: str, end: str) -> tuple[dict, dict]:
    """Returns (score_by_day, body_temp_delta_by_day)."""
    data = oura_get("daily_readiness", start, end)
    scores: dict[str, int | None] = {}
    body_temp: dict[str, float | None] = {}
    for d in data.get("data", []):
        day = d.get("day")
        if not day:
            continue
        scores[day] = d.get("score")
        body_temp[day] = d.get("temperature_deviation")
    return scores, body_temp


def fetch_sleep_scores(start: str, end: str) -> dict:
    data = oura_get("daily_sleep", start, end)
    return {d["day"]: d.get("score") for d in data.get("data", []) if d.get("day")}


def fetch_activity(start: str, end: str) -> dict:
    """Returns dict keyed by day with active_cal, steps, total_calories, activity_score."""
    data = oura_get("daily_activity", start, end)
    result: dict[str, dict] = {}
    for d in data.get("data", []):
        day = d.get("day")
        if not day:
            continue
        result[day] = {
            "active_cal":     d.get("active_calories"),
            "steps":          d.get("steps"),
            "total_cal":      d.get("total_calories"),
            "activity_score": d.get("score"),
        }
    return result


def fetch_spo2(start: str, end: str) -> dict:
    """Returns dict keyed by day with avg SpO2 %. Returns {} if endpoint unavailable."""
    data = oura_get("daily_spo2", start, end, required=False)
    if not data:
        return {}
    result: dict[str, float | None] = {}
    for d in data.get("data", []):
        day = d.get("day")
        if not day:
            continue
        spo2 = d.get("spo2_percentage") or {}
        result[day] = spo2.get("average")
    return result


def fetch_stress(start: str, end: str) -> dict:
    """Returns dict keyed by day with stress_high_mins, stress_recovery_mins. Optional endpoint."""
    data = oura_get("daily_stress", start, end, required=False)
    if not data:
        return {}
    result: dict[str, dict] = {}
    for d in data.get("data", []):
        day = d.get("day")
        if not day:
            continue
        result[day] = {
            "stress_high_mins":     secs_to_mins(d.get("stress_high")),
            "stress_recovery_mins": secs_to_mins(d.get("recovery_high")),
            "stress_day_summary":   d.get("day_summary"),
        }
    return result


def fetch_resilience(start: str, end: str) -> dict:
    """Returns dict keyed by day with resilience level string. Optional endpoint."""
    data = oura_get("daily_resilience", start, end, required=False)
    if not data:
        return {}
    result: dict[str, str | None] = {}
    for d in data.get("data", []):
        day = d.get("day")
        if not day:
            continue
        result[day] = d.get("level")
    return result


def fetch_vo2_max(start: str, end: str) -> dict:
    """Returns dict keyed by day with VO2 max value. Optional endpoint."""
    data = oura_get("vo2_max", start, end, required=False)
    if not data:
        return {}
    result: dict[str, float | None] = {}
    for d in data.get("data", []):
        day = d.get("day")
        if not day:
            continue
        result[day] = d.get("vo2_max")
    return result


def fetch_heartrate(start_dt: str, end_dt: str) -> dict:
    """
    Fetch intraday heart rate samples and group by date.
    Returns dict keyed by date with hr_avg_day, hr_min_day, hr_max_day.
    Uses datetime params (start_datetime/end_datetime).
    """
    data = oura_get_datetime("heartrate", start_dt, end_dt)
    if not data:
        return {}

    # Group bpm samples by date
    by_date: dict[str, list[int]] = {}
    for item in data.get("data", []):
        ts = item.get("timestamp", "")
        bpm = item.get("bpm")
        if not ts or bpm is None:
            continue
        day = ts[:10]  # YYYY-MM-DD
        by_date.setdefault(day, []).append(bpm)

    result: dict[str, dict] = {}
    for day, samples in by_date.items():
        if not samples:
            continue
        result[day] = {
            "hr_avg_day": int(round(sum(samples) / len(samples))),
            "hr_min_day": min(samples),
            "hr_max_day": max(samples),
        }
    return result


def fetch_oura_workouts(start_dt: str, end_dt: str) -> list[dict]:
    """
    Fetch Oura-detected workouts. Returns list of dicts ready for workout_sessions upsert.
    Uses datetime params (start_datetime/end_datetime).
    """
    data = oura_get_datetime("workout", start_dt, end_dt)
    if not data:
        return []

    rows = []
    for d in data.get("data", []):
        day = d.get("day")
        if not day:
            continue
        start_iso = d.get("start_datetime", "")
        end_iso = d.get("end_datetime", "")

        duration_mins = None
        if start_iso and end_iso:
            try:
                fmt = "%Y-%m-%dT%H:%M:%S%z"
                dt_start = datetime.strptime(start_iso[:19], "%Y-%m-%dT%H:%M:%S")
                dt_end   = datetime.strptime(end_iso[:19],   "%Y-%m-%dT%H:%M:%S")
                duration_mins = int((dt_end - dt_start).total_seconds() / 60)
            except Exception:
                pass

        rows.append({
            "date":         day,
            "start_time":   fmt_time(start_iso),
            "activity":     d.get("activity") or "unknown",
            "duration_mins": duration_mins,
            "calories":     int(d["calories"]) if d.get("calories") is not None else None,
            "avg_hr":       None,  # Oura workout endpoint doesn't expose avg_hr
            "notes":        d.get("label"),
            "source":       "oura",
            "metadata": {
                "oura_id":              d.get("id"),
                "intensity":            d.get("intensity"),
                "distance_meters":      d.get("distance"),
                "avg_met":              d.get("average_met_level"),
                "low_intensity_mins":   secs_to_mins(d.get("low_intensity_time")),
                "med_intensity_mins":   secs_to_mins(d.get("medium_intensity_time")),
                "high_intensity_mins":  secs_to_mins(d.get("high_intensity_time")),
            },
        })
    return rows


def existing_dates(client, user_id: str) -> set:
    rows = client.table("recovery_metrics").select("date").eq("user_id", user_id).execute().data
    return {r["date"] for r in rows}


def sync_oura_workouts(client, workout_rows: list[dict], start_date: str, end_date: str, user_id: str) -> int:
    """
    Replace all oura-source workout_sessions rows in the date range, then insert fresh.
    Returns number of rows written.
    """
    if not workout_rows:
        return 0
    # Clear existing oura workouts in the range to avoid duplicates (owner only)
    client.table("workout_sessions") \
        .delete() \
        .eq("source", "oura") \
        .eq("user_id", user_id) \
        .gte("date", start_date) \
        .lte("date", end_date) \
        .execute()
    result = client.table("workout_sessions").insert(workout_rows).execute()
    return len(result.data) if result.data else len(workout_rows)


def main():
    global _OURA_TOKEN

    parser = argparse.ArgumentParser(description="Sync Oura recovery metrics to Supabase")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    # Resolve token before any API calls
    client = get_client()
    owner_user_id = get_owner_user_id()
    integration = load_integration(client, owner_user_id, "oura")
    _OURA_TOKEN = (integration or {}).get("refresh_token") or ""
    if not _OURA_TOKEN:
        print("[error] Oura not connected — add a Personal Access Token in Settings")
        sys.exit(1)

    now = datetime.now()
    start = now - timedelta(days=args.days)
    start_str = start.strftime("%Y-%m-%d")
    # daily_activity end_date is exclusive — add 1 day to include today
    end_str = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    # datetime range for heartrate and workout endpoints
    start_dt = start.strftime("%Y-%m-%dT00:00:00")
    end_dt   = now.strftime("%Y-%m-%dT23:59:59")

    print(f"[sync-oura] Fetching {start_str} to {now.strftime('%Y-%m-%d')}...")

    sleep_detail         = fetch_sleep_detail(start_str, end_str)
    readiness, body_temp = fetch_readiness(start_str, end_str)
    sleep_scores         = fetch_sleep_scores(start_str, end_str)
    activity             = fetch_activity(start_str, end_str)
    spo2                 = fetch_spo2(start_str, end_str)
    stress               = fetch_stress(start_str, end_str)
    resilience           = fetch_resilience(start_str, end_str)
    vo2                  = fetch_vo2_max(start_str, end_str)
    heartrate            = fetch_heartrate(start_dt, end_dt)
    workout_rows         = fetch_oura_workouts(start_dt, end_dt)

    # Include activity dates so today's steps/calories appear even before readiness is finalized
    all_dates = sorted(set(readiness) | set(sleep_detail) | set(activity))

    if not all_dates:
        print("[sync-oura] No data returned from Oura.")
        return

    existing = existing_dates(client, owner_user_id)
    new_dates    = [d for d in all_dates if d not in existing]
    update_dates = [d for d in all_dates if d in existing]

    print(f"\nRecovery entries to write ({len(new_dates)} new, {len(update_dates)} update):")
    for d in all_dates:
        sd  = sleep_detail.get(d, {})
        act = activity.get(d, {})
        hr  = heartrate.get(d, {})
        tag = "NEW" if d in new_dates else "UPD"
        print(
            f"  [{tag}] {d} — "
            f"Readiness: {readiness.get(d)} | "
            f"Sleep: {sleep_scores.get(d)} | "
            f"Total: {sd.get('total_sleep_hrs')}h | "
            f"Light: {sd.get('light_hrs')}h | "
            f"Deep: {sd.get('deep_hrs')}h | "
            f"REM: {sd.get('rem_hrs')}h | "
            f"HRV: {sd.get('avg_hrv')}ms | "
            f"RHR: {sd.get('resting_hr')} | "
            f"SpO2: {spo2.get(d)} | "
            f"Steps: {act.get('steps')} | "
            f"Active Cal: {act.get('active_cal')} | "
            f"HR day avg/min/max: {hr.get('hr_avg_day')}/{hr.get('hr_min_day')}/{hr.get('hr_max_day')} | "
            f"VO2: {vo2.get(d)}"
        )

    if workout_rows:
        print(f"\nOura workouts to write: {len(workout_rows)}")
        for w in workout_rows:
            print(f"  {w['date']} — {w['activity']} {w['duration_mins']}min | Cal: {w['calories']} | {w['metadata'].get('intensity')}")
    else:
        print("\nOura workouts: none detected in range")

    if not args.yes:
        confirm = input("\nWrite to Supabase? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    sb_rows = []
    for d in all_dates:
        sd  = sleep_detail.get(d, {})
        act = activity.get(d, {})
        st  = stress.get(d, {})
        hr  = heartrate.get(d, {})

        meta: dict = {}
        if sd.get("bedtime_end"):
            meta["bedtime_end"] = sd["bedtime_end"]
        if sd.get("latency_mins") is not None:
            meta["latency_mins"] = sd["latency_mins"]
        if sd.get("avg_breath") is not None:
            meta["avg_breath"] = sd["avg_breath"]
        if sd.get("avg_hr_sleep") is not None:
            meta["avg_hr_sleep"] = sd["avg_hr_sleep"]
        if sd.get("restless_periods") is not None:
            meta["restless_periods"] = sd["restless_periods"]
        if act.get("total_cal") is not None:
            meta["total_calories"] = act["total_cal"]
        if st.get("stress_high_mins") is not None:
            meta["stress_high_mins"] = st["stress_high_mins"]
        if st.get("stress_recovery_mins") is not None:
            meta["stress_recovery_mins"] = st["stress_recovery_mins"]
        if st.get("stress_day_summary"):
            meta["stress_day_summary"] = st["stress_day_summary"]
        if resilience.get(d):
            meta["resilience_level"] = resilience[d]
        if hr.get("hr_avg_day") is not None:
            meta["hr_avg_day"] = hr["hr_avg_day"]
        if hr.get("hr_min_day") is not None:
            meta["hr_min_day"] = hr["hr_min_day"]
        if hr.get("hr_max_day") is not None:
            meta["hr_max_day"] = hr["hr_max_day"]

        sb_rows.append({
            "user_id":          owner_user_id,
            "date":             d,
            "bedtime":          sd.get("bedtime"),
            "total_sleep_hrs":  sd.get("total_sleep_hrs"),
            "light_hrs":        sd.get("light_hrs"),
            "deep_hrs":         sd.get("deep_hrs"),
            "rem_hrs":          sd.get("rem_hrs"),
            "awake_hrs":        sd.get("awake_hrs"),
            "sleep_efficiency": sd.get("efficiency"),
            "vo2_max":          vo2.get(d),
            "avg_hrv":          sd.get("avg_hrv"),
            "resting_hr":       sd.get("resting_hr"),
            "readiness":        readiness.get(d),
            "sleep_score":      sleep_scores.get(d),
            "active_cal":       act.get("active_cal"),
            "steps":            act.get("steps"),
            "activity_score":   act.get("activity_score"),
            "spo2_avg":         spo2.get(d),
            "body_temp_delta":  body_temp.get(d),
            "metadata":         meta,
            "source":           "oura",
        })

    written = upsert(client, "recovery_metrics", sb_rows, conflict="user_id,date,source")
    # Add user_id to workout rows before inserting
    workout_rows_with_uid = [{**r, "user_id": owner_user_id} for r in workout_rows]
    workout_written = sync_oura_workouts(client, workout_rows_with_uid, start_str, now.strftime("%Y-%m-%d"), owner_user_id)
    log_sync(client, "oura", "ok", written + workout_written)
    print(f"[sync-oura] Upserted {written} recovery row(s), {workout_written} workout row(s) to Supabase.")


if __name__ == "__main__":
    main()
