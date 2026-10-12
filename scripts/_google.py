"""
Google Calendar over plain HTTPS — no google-api-python-client.

compute-core's Python has no googleapiclient, so check_birthday_notif.py could never have run
there (ModuleNotFoundError at import, verified 2026-10-12). The two calls these scripts need are
simple REST requests, so they are made with urllib against the owner's stored `google`
integration (refresh token decrypted by _integrations.load_integration).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/calendar/v3"
TIMEOUT_SECS = 20


def access_token(client, user_id: str) -> str:
    from _integrations import load_integration

    integration = load_integration(client, user_id, "google")
    if not integration or not integration.get("refresh_token"):
        raise RuntimeError("Google is not connected — reconnect it in Settings → Integrations")
    body = urllib.parse.urlencode(
        {
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "refresh_token": integration["refresh_token"],
            "grant_type": "refresh_token",
        }
    ).encode()
    with urllib.request.urlopen(
        urllib.request.Request(TOKEN_URL, data=body, method="POST"), timeout=TIMEOUT_SECS
    ) as resp:
        return json.load(resp)["access_token"]


def _get(token: str, path: str, params: dict) -> dict:
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
        return json.load(resp)


def calendars(token: str) -> list[dict]:
    return _get(token, "/users/me/calendarList", {"minAccessRole": "reader"}).get("items", [])


def events(token: str, calendar_id: str, time_min: str, time_max: str) -> list[dict]:
    data = _get(
        token,
        f"/calendars/{urllib.parse.quote(calendar_id, safe='')}/events",
        {"timeMin": time_min, "timeMax": time_max, "singleEvents": "true", "maxResults": "50"},
    )
    return [e for e in data.get("items", []) if e.get("status") != "cancelled"]


def all_events(token: str, time_min: str, time_max: str) -> list[tuple[str, dict]]:
    """(calendar name, event) across every readable calendar. One unreadable calendar is skipped,
    but if EVERY calendar fails the caller gets an exception, not a misleading empty list."""
    out: list[tuple[str, dict]] = []
    cals = calendars(token)
    failures = 0
    for cal in cals:
        name = cal.get("summaryOverride") or cal.get("summary") or cal.get("id", "")
        try:
            out += [(name, e) for e in events(token, cal["id"], time_min, time_max)]
        except Exception as e:  # noqa: BLE001
            failures += 1
            print(f"[google] skipped calendar {name!r}: {e}", file=sys.stderr)
    if cals and failures == len(cals):
        raise RuntimeError("every calendar failed to load")
    return out
