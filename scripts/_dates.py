"""The user's calendar date, not the host's.

compute-core's clock is UTC, so `date.today()` rolls over at 17:00 PT (16:00 in PDT). Every
script that used it spent each evening one day ahead: the session briefing labelled the
coming day "today", printed that morning's readiness as "last night", and hid the current
day's meal plan rows because they fell before the "today forward" cutoff.

Stdlib-only on purpose, so `coach_check.py` and the tests can import it without the
`_supabase`/dotenv dependencies. The web app's equivalent is `web/src/lib/timezone.ts`.
"""
from __future__ import annotations

import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

DEFAULT_TZ = "America/Los_Angeles"


def user_tz() -> ZoneInfo:
    # Read at call time, not import time: scripts load `.env` (via _supabase) after importing this.
    return ZoneInfo(os.environ.get("USER_TIMEZONE") or DEFAULT_TZ)


def today_local() -> date:
    return datetime.now(user_tz()).date()
