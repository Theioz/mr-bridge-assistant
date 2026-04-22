#!/usr/bin/env python3
"""
Sync Fitbit workout sessions + body composition to Supabase.
  workout_sessions — activity/HR data (unchanged)
  fitness_log      — body weight, body fat %, BMI (source: "fitbit_body")

Usage:
  python3 scripts/sync-fitbit.py             # last 7 days
  python3 scripts/sync-fitbit.py --days 30
  python3 scripts/sync-fitbit.py --yes       # skip confirmation
  python3 scripts/sync-fitbit.py --probe     # print body data without writing
  python3 scripts/sync-fitbit.py --setup     # first-time OAuth setup (required when scope changes)

First-time setup / re-auth after scope change:
  1. Register app at https://dev.fitbit.com/apps/new
     - Application type: Personal
     - Redirect URI: http://localhost:8080
  2. Run: python3 scripts/sync-fitbit.py --setup
  3. Paste FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REFRESH_TOKEN into .env

Note: The 'weight' scope was added to fetch body composition data from the GE CS10G
smart scale. If body endpoints return 401, re-run with --setup to get a new token.

Requires: python-dotenv, supabase
  pip3 install python-dotenv supabase
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, get_owner_user_id, upsert
from _sync_log import log_sync, urlopen_with_retry, HTTP_TIMEOUT
from _integrations import load_integration, persist_rotated_token

FITBIT_AUTH_URL = "https://www.fitbit.com/oauth2/authorize"
FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token"
FITBIT_API_BASE = "https://api.fitbit.com"
REDIRECT_URI = "http://localhost:8080"
SCOPES = "activity heartrate weight"

# Canonical activity names — map Fitbit variants to a single label so dedup
# keys and history views stay consistent regardless of which name the API returns.
ACTIVITY_ALIASES: dict[str, str] = {
    "Walking": "Walk",
    "Running": "Run",
    "Biking": "Bike",
    "Cycling": "Bike",
    "Outdoor Bike": "Bike",
    "Swimming": "Swim",
    "Hiking": "Hike",
    "Aerobic Workout": "Aerobic Workout",
    "Sport": "Sport",
}


def normalize_activity(name: str) -> str:
    return ACTIVITY_ALIASES.get(name, name)


# ── OAuth helpers ──────────────────────────────────────────────────────────────

def pkce_pair():
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def run_local_server():
    captured = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            captured["code"] = params.get("code", [None])[0]
            captured["error"] = params.get("error", [None])[0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"<h2>Mr. Bridge: Fitbit connected. You can close this tab.</h2>")

        def log_message(self, *args):
            pass

    server = HTTPServer(("localhost", 8080), Handler)
    server.handle_request()
    return captured.get("code"), captured.get("error")


def exchange_code(code, verifier, client_id, client_secret):
    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    body = urllib.parse.urlencode({
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
        "code_verifier": verifier,
    }).encode()
    req = urllib.request.Request(FITBIT_TOKEN_URL, data=body, headers={
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.loads(resp.read())


def refresh_access_token(client_id, client_secret, refresh_token):
    """Returns (access_token, new_refresh_token_or_none)."""
    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    body = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }).encode()
    req = urllib.request.Request(FITBIT_TOKEN_URL, data=body, headers={
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            data = json.loads(resp.read())
            new_token = data.get("refresh_token")
            rotated = new_token if new_token and new_token != refresh_token else None
            return data["access_token"], rotated
    except urllib.error.HTTPError as e:
        print(f"[error] Token refresh failed {e.code}: {e.read().decode()}")
        print("Run: python3 scripts/sync-fitbit.py --setup  to re-authenticate")
        sys.exit(1)



def setup_oauth():
    client_id = input("Fitbit Client ID: ").strip()
    client_secret = input("Fitbit Client Secret: ").strip()
    verifier, challenge = pkce_pair()
    params = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    auth_url = f"{FITBIT_AUTH_URL}?{params}"
    print(f"\nOpening browser for Fitbit authorization...")
    webbrowser.open(auth_url)
    print("Waiting for callback on http://localhost:8080 ...")
    code, error = run_local_server()
    if error or not code:
        print(f"[error] Authorization failed: {error}")
        sys.exit(1)
    tokens = exchange_code(code, verifier, client_id, client_secret)
    print("\nAdd these to your .env file:")
    print(f"FITBIT_CLIENT_ID={client_id}")
    print(f"FITBIT_CLIENT_SECRET={client_secret}")
    print(f"FITBIT_REFRESH_TOKEN={tokens.get('refresh_token')}")


# ── Fitbit API ─────────────────────────────────────────────────────────────────

def fitbit_get(access_token, path):
    url = f"{FITBIT_API_BASE}{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}"})
    try:
        return urlopen_with_retry(req)
    except urllib.error.HTTPError as e:
        print(f"[error] Fitbit API {path} returned {e.code}: {e.read().decode()}")
        sys.exit(1)


def fmt_hr_zones(zones):
    if not zones:
        return None
    parts = []
    order = ["Peak", "Cardio", "Fat Burn"]
    zone_map = {z["name"]: z.get("minutes", 0) for z in zones}
    for name in order:
        mins = zone_map.get(name, 0)
        if mins > 0:
            parts.append(f"{name}: {mins}m")
    return " | ".join(parts) if parts else None


def fetch_workouts(access_token, start_date, end_date):
    path = (
        f"/1/user/-/activities/list.json"
        f"?afterDate={start_date}&sort=asc&limit=100&offset=0"
    )
    data = fitbit_get(access_token, path)
    rows = []
    for a in data.get("activities", []):
        raw_start = a.get("startTime", a.get("originalStartTime", ""))
        date_str = raw_start[:10]
        if not (start_date <= date_str <= end_date):
            continue
        duration_min = round(a.get("duration", 0) / 60000)
        if duration_min < 5:
            continue
        time_str = raw_start[11:19] if len(raw_start) >= 19 else None  # HH:MM:SS
        avg_hr = a.get("averageHeartRate")
        calories = a.get("calories")
        activity = normalize_activity(a.get("activityName", "Unknown"))
        rows.append({
            "date": date_str,
            "start_time": time_str,
            "activity": activity,
            "duration_mins": duration_min,
            "calories": int(calories) if calories else None,
            "avg_hr": int(avg_hr) if avg_hr else None,
            "source": "fitbit",
            "metadata": {"hr_zones": fmt_hr_zones(a.get("heartRateZones", []))},
            # dedup key (not written to DB)
            "_key": f"{date_str}|{time_str}|{activity}",
        })
    return rows


def existing_keys(client, user_id: str) -> set:
    """Build dedup keys from Supabase to avoid re-inserting the same workout.

    Normalizes activity names from existing rows so pre-migration rows (with
    un-aliased names like 'Walking') still match the new canonical keys.
    """
    rows = (
        client.table("workout_sessions")
        .select("date,start_time,activity")
        .eq("source", "fitbit")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return {f"{r['date']}|{r['start_time']}|{normalize_activity(r['activity'])}" for r in rows}


def fetch_existing_workouts(client, user_id: str, dates: set[str]) -> list[dict]:
    """Fetch existing workout rows for a set of dates (for overlap detection)."""
    if not dates:
        return []
    rows = (
        client.table("workout_sessions")
        .select("id,date,start_time,avg_hr,duration_mins")
        .eq("source", "fitbit")
        .eq("user_id", user_id)
        .in_("date", list(dates))
        .execute()
        .data
    )
    return rows


def _time_to_mins(t: str | None) -> int | None:
    """Convert HH:MM:SS string to total minutes past midnight."""
    if not t:
        return None
    parts = t.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _is_better(new_row: dict, existing_row: dict) -> bool:
    """Return True if new_row is preferable to existing_row.

    Priority: has HR data > no HR data; then longer duration wins.
    """
    new_hr = new_row.get("avg_hr") is not None
    ex_hr = existing_row.get("avg_hr") is not None
    if new_hr and not ex_hr:
        return True
    if not new_hr and ex_hr:
        return False
    return (new_row.get("duration_mins") or 0) > (existing_row.get("duration_mins") or 0)


def filter_overlapping(
    new_rows: list[dict],
    existing_rows: list[dict],
) -> tuple[list[dict], list[str]]:
    """Compare new workouts against existing rows for time-overlap (±5 min).

    Returns:
        to_insert — rows that should be inserted (no overlap, or new row is better)
        to_delete — IDs of existing rows to delete (replaced by a better new row)
    """
    OVERLAP_MINS = 5
    # Index existing rows by date for quick lookup
    by_date: dict[str, list[dict]] = {}
    for r in existing_rows:
        by_date.setdefault(r["date"], []).append(r)

    to_insert: list[dict] = []
    to_delete: list[str] = []

    for new in new_rows:
        new_mins = _time_to_mins(new.get("start_time"))
        overlapped = False
        for ex in by_date.get(new["date"], []):
            ex_mins = _time_to_mins(ex.get("start_time"))
            if new_mins is None or ex_mins is None:
                continue
            if abs(new_mins - ex_mins) <= OVERLAP_MINS:
                overlapped = True
                if _is_better(new, ex):
                    to_delete.append(ex["id"])
                    to_insert.append(new)
                else:
                    print(
                        f"[sync-fitbit] Skipping {new['date']} {new.get('start_time')} "
                        f"{new.get('activity')} — existing row preferred (HR/duration)"
                    )
                break
        if not overlapped:
            to_insert.append(new)

    return to_insert, to_delete


# ── Body composition ───────────────────────────────────────────────────────────

def fetch_body_data(access_token, start_date, end_date, raw=False):
    """Fetch weight, body fat %, and BMI from Fitbit for the given date range.

    Actual Fitbit API response structure (verified from live API):
      GET /1/user/-/body/log/weight/date/{start}/{end}.json
        → { "weight": [ { "date": "YYYY-MM-DD", "weight": <float_kg_or_lb>,
                           "fat": <float_%>, "bmi": <float>, "time": "HH:MM:SS", ... } ] }
      Fat % is included inline in the weight entries — no separate fat endpoint needed.

    Weight unit: Fitbit returns weight in the user's profile unit (lbs or kg).
    FITBIT_WEIGHT_UNIT env var overrides: set to "lbs" if your Fitbit profile is imperial,
    "kg" if metric. Defaults to "kg" (metric) if not set.

    Returns a list of dicts ready to upsert into fitness_log.
    If raw=True, prints raw API responses and returns [].
    """
    # Determine unit. Profile endpoint requires 'profile' scope (not included in 'weight'),
    # so we rely on FITBIT_WEIGHT_UNIT env var. Default: kg (metric).
    unit = os.environ.get("FITBIT_WEIGHT_UNIT", "lbs").lower().strip()
    is_lbs = unit == "lbs"

    try:
        weight_data = fitbit_get(access_token, f"/1/user/-/body/log/weight/date/{start_date}/{end_date}.json")
    except SystemExit:
        print("[sync-fitbit] Could not fetch body weight. If you see 401, re-run with --setup to add 'weight' scope.")
        return []

    if raw:
        print(f"\n[raw] /body/log/weight response:\n{json.dumps(weight_data, indent=2)}")
        return []

    rows = []
    # Top-level key is "weight" (not "body-weight")
    for entry in weight_data.get("weight", []):
        dt = entry.get("date")
        weight_val = entry.get("weight")
        if not dt or weight_val is None:
            continue
        row: dict = {"date": dt}
        row["weight_lb"] = round(weight_val if is_lbs else float(weight_val) * 2.20462, 1)
        fat = entry.get("fat")
        if fat is not None:
            row["body_fat_pct"] = round(float(fat), 1)
        bmi = entry.get("bmi")
        if bmi is not None:
            row["bmi"] = round(float(bmi), 1)
        rows.append(row)

    return rows


def existing_body_dates(client, user_id: str) -> set:
    rows = client.table("fitness_log").select("date").eq("source", "fitbit_body").eq("user_id", user_id).execute().data
    return {r["date"] for r in rows}


def print_body_probe(rows):
    if not rows:
        print("[probe] No body composition data returned from Fitbit for this date range.")
        return
    print(f"\n{'Date':<12} {'Weight':>10} {'Fat%':>7} {'BMI':>6}")
    print("-" * 40)
    for r in sorted(rows, key=lambda x: x["date"]):
        print(
            f"{r['date']:<12}"
            f" {str(r.get('weight_lb', 'None')) + ' lb' if r.get('weight_lb') is not None else 'None':>10}"
            f" {str(r.get('body_fat_pct', 'None')) + '%' if r.get('body_fat_pct') is not None else 'None':>7}"
            f" {str(r.get('bmi', 'None')):>6}"
        )


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Fitbit workouts + body composition to Supabase")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--setup", action="store_true", help="Run first-time OAuth setup")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("--probe", action="store_true", help="Print body data without writing to Supabase")
    parser.add_argument("--raw", action="store_true", help="Dump raw API responses for body endpoints (implies --probe)")
    args = parser.parse_args()

    if args.setup:
        setup_oauth()
        return

    client_id = os.environ.get("FITBIT_CLIENT_ID", "")
    client_secret = os.environ.get("FITBIT_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        print("[error] FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET must be set in .env")
        sys.exit(1)

    client = get_client()
    owner_user_id = get_owner_user_id()
    integration = load_integration(client, owner_user_id, "fitbit")
    refresh_token = (integration or {}).get("refresh_token") or ""

    if not refresh_token:
        print("[error] Fitbit not connected — authorize via Settings")
        print("Run: python3 scripts/sync-fitbit.py --setup")
        sys.exit(1)

    access_token, rotated_token = refresh_access_token(client_id, client_secret, refresh_token)

    end = datetime.now()
    start = end - timedelta(days=args.days)
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")

    # ── Body composition ───────────────────────────────────────────────────────
    print(f"[sync-fitbit] Fetching body composition {start_str} to {end_str}...")
    body_rows = fetch_body_data(access_token, start_str, end_str, raw=args.raw)

    if args.probe or args.raw:
        print(f"\n[probe] Fitbit returned {len(body_rows)} date(s) with body data:")
        print_body_probe(body_rows)
        return

    # ── Workouts ───────────────────────────────────────────────────────────────
    print(f"[sync-fitbit] Fetching workouts {start_str} to {end_str}...")
    workout_rows = fetch_workouts(access_token, start_str, end_str)

    if rotated_token:
        persist_rotated_token(client, owner_user_id, "fitbit", rotated_token)

    # Write body composition
    existing_body = existing_body_dates(client, owner_user_id)
    new_body = [r for r in body_rows if r["date"] not in existing_body]

    if new_body:
        print(f"\nNew body composition entries ({len(new_body)}):")
        for r in sorted(new_body, key=lambda x: x["date"]):
            parts = []
            if r.get("weight_lb") is not None:
                parts.append(f"weight={r['weight_lb']} lb")
            if r.get("body_fat_pct") is not None:
                parts.append(f"fat={r['body_fat_pct']}%")
            if r.get("bmi") is not None:
                parts.append(f"BMI={r['bmi']}")
            print(f"  {r['date']} — {' | '.join(parts) if parts else 'no fields'}")

    # Write workouts — exact dedup first, then time-overlap check
    existing = existing_keys(client, owner_user_id)
    exact_new = [r for r in workout_rows if r["_key"] not in existing]

    # Time-overlap detection: fetch full rows for dates that have candidates
    candidate_dates = {r["date"] for r in exact_new}
    existing_detail = fetch_existing_workouts(client, owner_user_id, candidate_dates)
    new_workouts, ids_to_delete = filter_overlapping(exact_new, existing_detail)

    if new_workouts:
        print(f"\nNew workout entries ({len(new_workouts)}):")
        for r in new_workouts:
            hr_info = f" | Avg HR: {r['avg_hr']}" if r["avg_hr"] else ""
            print(f"  {r['date']} {r['start_time']} — {r['activity']} ({r['duration_mins']} min, {r['calories']} cal{hr_info})")
    if ids_to_delete:
        print(f"\nWorkouts to replace (overlap, inferior row): {len(ids_to_delete)} row(s)")

    if not new_body and not new_workouts and not ids_to_delete:
        print("[sync-fitbit] No new data.")
        return

    if not args.yes:
        confirm = input("\nWrite to Supabase? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    body_written = 0
    if new_body:
        sb_body = [{**r, "source": "fitbit_body", "user_id": owner_user_id} for r in sorted(new_body, key=lambda x: x["date"])]
        body_written = upsert(client, "fitness_log", sb_body)
        log_sync(client, "fitbit_body", "ok", body_written)
        print(f"[sync-fitbit] Synced {body_written} body composition row(s) to fitness_log.")

    workout_written = 0
    if ids_to_delete:
        client.table("workout_sessions").delete().in_("id", ids_to_delete).execute()
        print(f"[sync-fitbit] Deleted {len(ids_to_delete)} inferior overlap row(s).")

    if new_workouts:
        # Strip the internal dedup key before inserting, add user_id
        sb_rows = [{k: v for k, v in r.items() if k != "_key"} | {"user_id": owner_user_id} for r in new_workouts]
        workout_written = upsert(client, "workout_sessions", sb_rows)
        log_sync(client, "fitbit", "ok", workout_written)
        print(f"[sync-fitbit] Synced {workout_written} workout row(s) to workout_sessions.")


if __name__ == "__main__":
    main()
