#!/usr/bin/env python3
"""
Sync Fitbit workout sessions into memory/fitness_log.md Session Log.
Usage:
  python3 scripts/sync-fitbit.py             # last 7 days
  python3 scripts/sync-fitbit.py --days 30   # last 30 days
  python3 scripts/sync-fitbit.py --yes       # skip confirmation
  python3 scripts/sync-fitbit.py --setup     # first-time OAuth setup

Each activity gets its own row with: date, start time, name, duration,
calories, avg HR, and HR zone breakdown (if heart rate data available).

First-time setup:
  1. Register app at https://dev.fitbit.com/apps/new
     - Application type: Personal
     - Redirect URI: http://localhost:8080
     - OAuth 2.0 Application Type: Personal
  2. Run: python3 scripts/sync-fitbit.py --setup
  3. Paste FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REFRESH_TOKEN into .env

Requires: python-dotenv
  pip3 install python-dotenv
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.error
import urllib.parse
import base64
import hashlib
import secrets
import webbrowser
from datetime import datetime, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
FITNESS_LOG = ROOT / "memory" / "fitness_log.md"

FITBIT_AUTH_URL = "https://www.fitbit.com/oauth2/authorize"
FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token"
FITBIT_API_BASE = "https://api.fitbit.com"
REDIRECT_URI = "http://localhost:8080"
SCOPES = "activity heartrate"

SESSION_LOG_HEADER = "| Date | Time | Activity | Duration | Calories | Avg HR | HR Zones | Notes |"
SESSION_LOG_SEP    = "|------|------|----------|----------|----------|--------|----------|-------|"


# --- OAuth helpers ---

def pkce_pair():
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def run_local_server():
    """Spin up a one-shot server to capture the OAuth callback code."""
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
            pass  # suppress request logs

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
            # Fitbit rotates refresh tokens — update .env automatically
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
    refresh_token = tokens.get("refresh_token")

    print("\nAdd these to your .env file:")
    print(f"FITBIT_CLIENT_ID={client_id}")
    print(f"FITBIT_CLIENT_SECRET={client_secret}")
    print(f"FITBIT_REFRESH_TOKEN={refresh_token}")


# --- Fitbit API ---

def fitbit_get(access_token, path):
    url = f"{FITBIT_API_BASE}{path}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access_token}",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"[error] Fitbit API {path} returned {e.code}: {e.read().decode()}")
        sys.exit(1)


def fmt_hr_zones(zones):
    """Summarize HR zones as 'Peak: 7m | Cardio: 10m' etc. (skip zero-minute zones)."""
    if not zones:
        return "—"
    parts = []
    order = ["Peak", "Cardio", "Fat Burn", "Out of Range"]
    zone_map = {z["name"]: z.get("minutes", 0) for z in zones}
    for name in order:
        mins = zone_map.get(name, 0)
        if mins > 0 and name != "Out of Range":
            parts.append(f"{name}: {mins}m")
    return " | ".join(parts) if parts else "—"


def fetch_workouts(access_token, start_date, end_date):
    """Fetch logged workout activities — one row per activity with full detail."""
    path = (
        f"/1/user/-/activities/list.json"
        f"?afterDate={start_date}&sort=asc&limit=100&offset=0"
    )
    data = fitbit_get(access_token, path)
    rows = []
    for a in data.get("activities", []):
        raw_start = a.get("startTime", a.get("originalStartTime", ""))
        date = raw_start[:10]
        if not (start_date <= date <= end_date):
            continue
        duration_min = round(a.get("duration", 0) / 60000)
        if duration_min < 5:
            continue
        time = raw_start[11:16] if len(raw_start) >= 16 else "—"
        name = a.get("activityName", "Unknown")
        calories = a.get("calories", "—")
        avg_hr = a.get("averageHeartRate", "—")
        hr_zones = fmt_hr_zones(a.get("heartRateZones", []))
        rows.append({
            "date": date,
            "time": time,
            "name": name,
            "duration": duration_min,
            "calories": calories,
            "avg_hr": avg_hr,
            "hr_zones": hr_zones,
            # dedup key
            "key": f"{date}|{time}|{name}",
        })
    return rows


# --- fitness_log.md helpers ---

def existing_session_keys(log_path):
    """Return set of 'date|time|activity' keys already in Session Log."""
    if not log_path.exists():
        return set()
    text = log_path.read_text()
    idx = text.find("## Session Log")
    if idx == -1:
        return set()
    keys = set()
    for line in text[idx:].split("\n"):
        if line.startswith("| ") and not line.startswith("| Date") and not line.startswith("| —") and not line.startswith("|---"):
            parts = [p.strip() for p in line.strip("| \n").split("|")]
            if len(parts) >= 3 and parts[0] and len(parts[0]) == 10:
                keys.add(f"{parts[0]}|{parts[1]}|{parts[2]}")
    return keys


def ensure_session_log_header(log_path):
    """Update Session Log table header to rich schema if still on old schema."""
    text = log_path.read_text()
    if SESSION_LOG_HEADER in text:
        return
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if line.strip() == "## Session Log":
            if i + 2 < len(lines) and lines[i + 1].startswith("|"):
                lines[i + 1] = SESSION_LOG_HEADER
                lines[i + 2] = SESSION_LOG_SEP
                break
    log_path.write_text("\n".join(lines))


def insert_rows_after_table(section_header, new_rows, log_path):
    text = log_path.read_text()
    lines = text.split("\n")
    section_line = next(
        (i for i, l in enumerate(lines) if l.strip() == section_header), None
    )
    if section_line is None:
        print(f"[error] Section '{section_header}' not found in {log_path.name}")
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


# --- main ---

def main():
    parser = argparse.ArgumentParser(description="Sync Fitbit workouts to fitness_log.md")
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

    if not FITNESS_LOG.exists():
        print(f"[error] {FITNESS_LOG} not found. Copy fitness_log.template.md first.")
        sys.exit(1)

    access_token = refresh_access_token(client_id, client_secret, refresh_token)

    end = datetime.now()
    start = end - timedelta(days=args.days)
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")

    print(f"[sync-fitbit] Fetching workouts {start_str} to {end_str}...")
    workout_rows = fetch_workouts(access_token, start_str, end_str)

    existing = existing_session_keys(FITNESS_LOG)
    new_workouts = [r for r in workout_rows if r["key"] not in existing]

    if not new_workouts:
        print("[sync-fitbit] No new workout data to add.")
        return

    print(f"\nNew workout entries ({len(new_workouts)}):")
    for r in new_workouts:
        hr_info = f" | Avg HR: {r['avg_hr']}" if r["avg_hr"] != "—" else ""
        print(f"  {r['date']} {r['time']} — {r['name']} ({r['duration']} min, {r['calories']} cal{hr_info})")

    if not args.yes:
        confirm = input("\nWrite to fitness_log.md? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    ensure_session_log_header(FITNESS_LOG)

    rows = [
        f"| {r['date']} | {r['time']} | {r['name']} | {r['duration']} min | {r['calories']} cal | {r['avg_hr']} | {r['hr_zones']} | |"
        for r in new_workouts
    ]
    insert_rows_after_table("## Session Log", rows, FITNESS_LOG)
    print(f"[sync-fitbit] Added {len(new_workouts)} workout row(s). Commit and push to sync.")


if __name__ == "__main__":
    main()
