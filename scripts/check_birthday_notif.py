#!/usr/bin/env python3
"""
Push one notification per birthday on the owner's Google Calendar today.

Silence is the normal case (no birthdays) and exits 0. Every FAILURE exits non-zero and records
an 'error' heartbeat — the previous version printed errors and returned 0, so "no birthdays" and
"could not read the calendar" looked the same. It also imported google-api-python-client, which
compute-core does not have; calendar access is now plain HTTPS via _google.py.
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _dates import today_local, user_tz  # noqa: E402

CLICK_PATH = "/dashboard"
DRY_RUN = "--dry-run" in sys.argv  # print what would be sent; no push, no heartbeat


def is_birthday_event(title: str, cal_name: str) -> bool:
    return bool(re.search(r"'s birthday$", title, re.IGNORECASE)) or "birthday" in cal_name.lower()


def person_name(title: str) -> str:
    """Strip "'s birthday" suffix to get just the person's name."""
    return re.sub(r"'s birthday$", "", title, flags=re.IGNORECASE).strip()


def today_rfc3339_range() -> tuple[str, str]:
    today = today_local()
    start = datetime(today.year, today.month, today.day, tzinfo=user_tz())
    return start.isoformat(), (start + timedelta(days=1)).isoformat()


def main() -> int:
    from _google import access_token, all_events
    from _push import push
    from _supabase import get_client, get_owner_user_id

    client = get_client()
    user_id = get_owner_user_id()
    token = access_token(client, user_id)
    time_min, time_max = today_rfc3339_range()

    names = sorted(
        {
            person_name(e.get("summary", ""))
            for cal_name, e in all_events(token, time_min, time_max)
            if is_birthday_event(e.get("summary", ""), cal_name)
        }
    )
    if DRY_RUN:
        print(f"[dry-run] birthdays today: {names or 'none'}")
        return 0
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    for name in names:
        push(
            "Birthday today",
            f"It's {name}'s birthday today.",
            type_="birthday",
            click_url=f"{app_url}{CLICK_PATH}" if app_url else None,
            client=client,
            user_id=user_id,
        )
    print(f"[check_birthday_notif] {len(names)} birthday(s) today.")
    return 0


if __name__ == "__main__":
    if DRY_RUN:
        sys.exit(main())
    from _joblog import job

    with job("cron:birthday"):
        sys.exit(main())
