#!/usr/bin/env python3
"""
Check Google Calendar for birthdays today and fire a push notification for each.
Called by the morning-nudge agent at 8 AM. Exits silently with no notification if
no birthdays are found today. Errors are non-fatal — printed to stderr, exit 0.

Requires: google-auth, google-auth-oauthlib, google-api-python-client, python-dotenv
  pip3 install google-auth google-auth-oauthlib google-api-python-client python-dotenv
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from datetime import date, timezone, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
NOTIFY_SCRIPT = ROOT / "scripts" / "notify.sh"


def get_credentials() -> Credentials:
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/calendar.readonly"],
    )
    creds.refresh(Request())
    return creds


def is_birthday_event(title: str, cal_name: str) -> bool:
    return bool(re.search(r"'s birthday$", title, re.IGNORECASE)) or \
        "birthday" in cal_name.lower()


def person_name(title: str) -> str:
    """Strip "'s birthday" suffix to get just the person's name."""
    return re.sub(r"'s birthday$", "", title, flags=re.IGNORECASE).strip()


def today_rfc3339_range() -> tuple[str, str]:
    """Return (timeMin, timeMax) RFC3339 strings spanning today in UTC."""
    today = date.today()
    time_min = datetime(today.year, today.month, today.day, tzinfo=timezone.utc).isoformat()
    time_max = (datetime(today.year, today.month, today.day, tzinfo=timezone.utc) + timedelta(days=1)).isoformat()
    return time_min, time_max


def main() -> None:
    try:
        creds = get_credentials()
    except Exception as e:
        print(f"[check_birthday_notif] credential error: {e}", file=sys.stderr)
        return

    try:
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        cal_list = service.calendarList().list(minAccessRole="reader").execute()
        calendars = cal_list.get("items", [])
    except Exception as e:
        print(f"[check_birthday_notif] calendar list error: {e}", file=sys.stderr)
        return

    time_min, time_max = today_rfc3339_range()
    birthdays_today: list[str] = []

    for cal in calendars:
        cal_id = cal.get("id", "")
        cal_name = cal.get("summaryOverride") or cal.get("summary") or cal_id
        try:
            events_result = service.events().list(
                calendarId=cal_id,
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                maxResults=20,
            ).execute()
        except Exception:
            continue

        for event in events_result.get("items", []):
            if event.get("status") == "cancelled":
                continue
            title = event.get("summary", "")
            if is_birthday_event(title, cal_name):
                birthdays_today.append(person_name(title))

    for name in birthdays_today:
        try:
            subprocess.run(
                ["bash", str(NOTIFY_SCRIPT), "--title", "Birthday Today", "--message", f"It's {name}'s birthday today."],
                check=True,
            )
        except Exception as e:
            print(f"[check_birthday_notif] notify error for {name}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
