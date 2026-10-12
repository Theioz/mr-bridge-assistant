#!/usr/bin/env python3
"""
Evening journal nudge: one push at 7 PM Pacific, only if nothing was journaled today.

Replaces the `journal-reminder` Claude agent, which described a 7 PM run that nothing scheduled —
an agent needs a live Claude session, a cron entry does not. Two bugs in the agent's check are
fixed here: it used `date.today()` (UTC on compute-core, so after 5 PM Pacific it looked at
TOMORROW and always found nothing) and it did not filter by user.

Tone follows the forward-only rule (jl-homelab memory feedback_mrbridge_forward_only_reset): one
gentle prompt for today, never a count of days missed, and silence when today has an entry.
It still runs while travelling: journaling travels.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _dates import today_local  # noqa: E402

CLICK_PATH = "/journal"
DRY_RUN = "--dry-run" in sys.argv  # report only; no push, no heartbeat
TITLE = "Journal"
MESSAGE = "A few lines about today? Five minutes is plenty."


def main() -> int:
    from _push import push
    from _supabase import get_client, get_owner_user_id

    client = get_client()
    uid = get_owner_user_id()
    today = today_local().isoformat()
    rows = (client.table("journal_entries").select("id").eq("user_id", uid)
            .eq("date", today).limit(1).execute().data)
    if rows:
        print(f"[journal_reminder] entry exists for {today}; no push.")
        return 0
    if DRY_RUN:
        print(f"[dry-run] no entry for {today}; would push: {TITLE} — {MESSAGE}")
        return 0
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    push(TITLE, MESSAGE, type_="journal_reminder",
         click_url=f"{app_url}{CLICK_PATH}" if app_url else None, client=client, user_id=uid)
    print(f"[journal_reminder] pushed for {today}.")
    return 0


if __name__ == "__main__":
    if DRY_RUN:
        sys.exit(main())
    from _joblog import job

    with job("cron:journal_reminder"):
        sys.exit(main())
