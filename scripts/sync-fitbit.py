#!/usr/bin/env python3
"""
Sync Fitbit workout sessions to Supabase (workout_sessions table).
Usage:
  python3 scripts/sync-fitbit.py             # last 7 days
  python3 scripts/sync-fitbit.py --days 30
  python3 scripts/sync-fitbit.py --yes       # skip confirmation
  python3 scripts/sync-fitbit.py --setup     # first-time OAuth setup

First-time setup:
  1. Register app at https://dev.fitbit.com/apps/new
     - Application type: Personal
     - Redirect URI: http://localhost:8080
  2. Run: python3 scripts/sync-fitbit.py --setup
  3. Paste FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REFRESH_TOKEN into .env

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
from _supabase import get_client, upsert, log_sync

FITBIT_AUTH_URL = "https://www.fitbit.com/oauth2/authorize"
FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token"
FITBIT_API_BASE = "https://api.fitbit.com"
REDIRECT_URI = "http://localhost:8080"
SCOPES = "activity heartrate"


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
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def refresh_access_token(client_id, client_secret, refresh_token):
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
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            if data.get("refresh_token") != refresh_token:
                update_env_token(data["refresh_token"])
            return data["access_token"]
    except urllib.error.HTTPError as e:
        print(f"[error] Token refresh failed {e.code}: {e.read().decode()}")
        print("Run: python3 scripts/sync-fitbit.py --setup  to re-authenticate")
        sys.exit(1)


def update_env_token(new_token):
    env_path = ROOT / ".env"
    text = env_path.read_text()
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("FITBIT_REFRESH_TOKEN="):
            lines[i] = f"FITBIT_REFRESH_TOKEN={new_token}"
            break
    env_path.write_text("\n".join(lines))


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
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
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
        rows.append({
            "date": date_str,
            "start_time": time_str,
            "activity": a.get("activityName", "Unknown"),
            "duration_mins": duration_min,
            "calories": int(calories) if calories else None,
            "avg_hr": int(avg_hr) if avg_hr else None,
            "source": "fitbit",
            "metadata": {"hr_zones": fmt_hr_zones(a.get("heartRateZones", []))} ,
            # dedup key (not written to DB)
            "_key": f"{date_str}|{time_str}|{a.get('activityName', '')}",
        })
    return rows


def existing_keys(client) -> set:
    """Build dedup keys from Supabase to avoid re-inserting the same workout."""
    rows = (
        client.table("workout_sessions")
        .select("date,start_time,activity")
        .eq("source", "fitbit")
        .execute()
        .data
    )
    return {f"{r['date']}|{r['start_time']}|{r['activity']}" for r in rows}


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Fitbit workouts to Supabase")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--setup", action="store_true", help="Run first-time OAuth setup")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    if args.setup:
        setup_oauth()
        return

    client_id = os.environ.get("FITBIT_CLIENT_ID", "")
    client_secret = os.environ.get("FITBIT_CLIENT_SECRET", "")
    refresh_token = os.environ.get("FITBIT_REFRESH_TOKEN", "")

    if not all([client_id, client_secret, refresh_token]):
        print("[error] FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REFRESH_TOKEN not set in .env")
        print("Run: python3 scripts/sync-fitbit.py --setup")
        sys.exit(1)

    access_token = refresh_access_token(client_id, client_secret, refresh_token)

    end = datetime.now()
    start = end - timedelta(days=args.days)
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")

    print(f"[sync-fitbit] Fetching workouts {start_str} to {end_str}...")
    workout_rows = fetch_workouts(access_token, start_str, end_str)

    client = get_client()
    existing = existing_keys(client)
    new_workouts = [r for r in workout_rows if r["_key"] not in existing]

    if not new_workouts:
        print("[sync-fitbit] No new workout data.")
        return

    print(f"\nNew workout entries ({len(new_workouts)}):")
    for r in new_workouts:
        hr_info = f" | Avg HR: {r['avg_hr']}" if r["avg_hr"] else ""
        print(f"  {r['date']} {r['start_time']} — {r['activity']} ({r['duration_mins']} min, {r['calories']} cal{hr_info})")

    if not args.yes:
        confirm = input("\nWrite to Supabase? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    # Strip the internal dedup key before inserting
    sb_rows = [{k: v for k, v in r.items() if k != "_key"} for r in new_workouts]
    written = upsert(client, "workout_sessions", sb_rows)
    log_sync(client, "fitbit", "ok", written)
    print(f"[sync-fitbit] Synced {written} row(s) to Supabase.")


if __name__ == "__main__":
    main()
