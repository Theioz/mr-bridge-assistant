#!/usr/bin/env python3
"""
Warn before a recurring task series expires (#689).

A series set to run four months should not just stop and vanish — you get told it is ending while
you still remember what it was for. Fires one grouped ntfy push plus one `notifications` row per
series, then leaves the in-app Extend / Let it end row on /tasks to do the rest.

Warning window is max(14 days, 3 x interval-in-days): a weekly series needs more runway than a
daily one, because you get fewer chances to notice.

Deduplicated per series through profile key 'series_expiry_notif_cache'
(JSON dict: {series_id: ISO timestamp}), with a window long enough that a 14-day runway produces
roughly one nudge rather than fourteen.

Open-ended series (ends_on IS NULL) never fire this — there is nothing to expire.
Series the user has explicitly dismissed (expiry_dismissed_at set) never fire again.

Requires: supabase, python-dotenv
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _notifications import log_notification  # noqa: E402
from _recurrence import describe_cadence  # noqa: E402
from _supabase import get_client, get_owner_user_id  # noqa: E402

NOTIFY_SCRIPT = ROOT / "scripts" / "notify.sh"
CACHE_KEY = "series_expiry_notif_cache"
# One nudge per runway, not one per day. 7 days means a 14-day window yields ~2 pushes worst case
# — enough that a missed one is not fatal, few enough to stay signal.
DEDUP_HOURS = 24 * 7
MIN_WARNING_DAYS = 14
CLICK_PATH = "/tasks"

# Rough days-per-unit, only used to scale the warning window. Month length does not need to be
# exact for "warn me earlier about rarer things".
_FREQ_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}


def warning_days(freq: str, interval: int) -> int:
    """How far ahead to warn: at least 14 days, more for a sparse cadence."""
    return max(MIN_WARNING_DAYS, 3 * _FREQ_DAYS.get(freq, 1) * max(interval, 1))


def get_profile_value(client, owner_user_id: str, key: str) -> str | None:
    rows = (
        client.table("profile")
        .select("value")
        .eq("user_id", owner_user_id)
        .eq("key", key)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["value"] if rows else None


def set_profile_value(client, owner_user_id: str, key: str, value: str) -> None:
    client.table("profile").upsert(
        {"user_id": owner_user_id, "key": key, "value": value},
        on_conflict="user_id,key",
    ).execute()


def load_notif_cache(client, owner_user_id: str) -> dict[str, str]:
    raw = get_profile_value(client, owner_user_id, CACHE_KEY)
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def needs_notification(series_id: str, cache: dict[str, str]) -> bool:
    last_str = cache.get(str(series_id))
    if not last_str:
        return True
    try:
        last = datetime.fromisoformat(last_str)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - last).total_seconds() / 3600 >= DEDUP_HOURS
    except ValueError:
        return True


def send_notify(title: str, message: str) -> None:
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    cmd = ["bash", str(NOTIFY_SCRIPT), "--title", title, "--message", message]
    if app_url:
        cmd += ["--click-url", f"{app_url}{CLICK_PATH}"]
    subprocess.run(cmd, check=True)


def main() -> None:
    try:
        client = get_client()
        owner_user_id = get_owner_user_id()
    except Exception as e:
        print(f"[check_series_expiring] Supabase connection error: {e}", file=sys.stderr)
        return

    today = date.today()

    try:
        rows = (
            client.table("task_series")
            .select("id, title, freq, interval, byweekday, ends_on, expiry_dismissed_at")
            .eq("user_id", owner_user_id)
            .not_.is_("ends_on", "null")
            .is_("expiry_dismissed_at", "null")
            .gte("ends_on", today.isoformat())
            .order("ends_on", desc=False)
            .execute()
            .data
            or []
        )
    except Exception as e:
        print(f"[check_series_expiring] task_series query error: {e}", file=sys.stderr)
        return

    if not rows:
        return

    cache = load_notif_cache(client, owner_user_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    expiring: list[tuple[str, str, int]] = []  # (series_id, label, days_left)
    for s in rows:
        ends_on = date.fromisoformat(s["ends_on"])
        days_left = (ends_on - today).days
        if days_left > warning_days(s["freq"], s.get("interval") or 1):
            continue
        if not needs_notification(str(s["id"]), cache):
            continue
        cadence = describe_cadence(
            freq=s["freq"], interval=s.get("interval") or 1, byweekday=s.get("byweekday")
        )
        day_word = "day" if days_left == 1 else "days"
        when = "today" if days_left == 0 else f"in {days_left} {day_word}"
        expiring.append((str(s["id"]), f"{s['title']} ({cadence}) ends {when}", days_left))

    if not expiring:
        return

    body = "\n".join(label for _, label, _ in expiring)
    title = (
        "Recurring task ending"
        if len(expiring) == 1
        else f"{len(expiring)} recurring tasks ending"
    )

    try:
        send_notify(title, body)
    except Exception as e:
        # If the push failed, do NOT stamp the cache — the whole point is that the user finds out,
        # so the next run should try again rather than treating a failed send as delivered.
        print(f"[check_series_expiring] notify error: {e}", file=sys.stderr)
        return

    # One in-app row per series so each gets its own Extend / Let it end actions on /tasks.
    for series_id, label, _ in expiring:
        log_notification(client, owner_user_id, "series_expiring", label, None)
        cache[series_id] = now_iso

    try:
        set_profile_value(client, owner_user_id, CACHE_KEY, json.dumps(cache))
    except Exception as e:
        print(f"[check_series_expiring] cache write failed: {e}", file=sys.stderr)

    print(f"[check_series_expiring] Warned about {len(expiring)} expiring series.")


if __name__ == "__main__":
    main()
