#!/usr/bin/env python3
"""
Fail (and say why) when any scheduled job or data source has not succeeded within its allowed
age, so Uptime Kuma pages it.

ALERTING IS KUMA'S JOB, NOT THIS SCRIPT'S. Every cron job already runs under
~/.local/bin/heartbeat, which pushes to Kuma, and Kuma pages through ntfy on a state change
(jl-homelab memory: kuma-alerting-and-heartbeats). What Kuma cannot see is DATA freshness: the
`mrb-cron-sync` heartbeat is green whenever /api/cron/sync answers, even if the Oura sync inside
it failed. This script closes that gap. It reads `sync_log`, and when anything is stale it writes
the reason to $HEARTBEAT_MSG_FILE (the wrapper uses the first line as the page text) and exits
10. Kuma then pages once, and again only after it recovers and fails again. Running it under its
own heartbeat also means that if this checker stops running, Kuma notices that too.

The job list is web/src/lib/status/jobs.json, the same file Settings → Status reads, so the page
and the page alert judge staleness identically. evaluate() is pure and unit-tested.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
JOBS_FILE = ROOT / "web" / "src" / "lib" / "status" / "jobs.json"
DRY_RUN = "--dry-run" in sys.argv  # report only; always exit 0, write no heartbeat
EXIT_STALE = 10
SELF = "cron:stale_check"


def load_jobs() -> list[dict]:
    return json.loads(JOBS_FILE.read_text())["jobs"]


def evaluate(jobs: list[dict], last_ok: dict[str, datetime], now: datetime) -> list[dict]:
    """Jobs that HAVE succeeded before but not within maxAgeHours.

    A job with no success on record is not counted: right after a deploy every new heartbeat is
    empty, and paging for all of them would be noise. "Never runs at all" is covered by that job's
    own Kuma heartbeat; the Status page shows it as "Never ran"."""
    stale = []
    for j in jobs:
        if j["source"] == SELF:
            continue  # a checker cannot usefully report on itself
        seen = last_ok.get(j["source"])
        if seen is not None and now - seen > timedelta(hours=j["maxAgeHours"]):
            stale.append({**j, "lastOk": seen})
    return stale


def describe(job: dict, now: datetime) -> str:
    seen = job["lastOk"]
    if seen is None:
        return f"{job['label']}: never succeeded"
    hours = (now - seen).total_seconds() / 3600
    age = f"{hours / 24:.1f} days" if hours >= 48 else f"{round(hours)} h"
    return f"{job['label']}: last success {age} ago (expected within {job['maxAgeHours']} h)"


def main() -> int:
    from _supabase import get_client

    client = get_client()
    jobs = load_jobs()
    now = datetime.now(timezone.utc)

    last_ok: dict[str, datetime] = {}
    for j in jobs:
        rows = (client.table("sync_log").select("synced_at").eq("source", j["source"])
                .eq("status", "ok").order("synced_at", desc=True).limit(1).execute().data)
        if rows:
            last_ok[j["source"]] = datetime.fromisoformat(rows[0]["synced_at"].replace("Z", "+00:00"))

    stale = evaluate(jobs, last_ok, now)
    lines = [describe(j, now) for j in stale]
    print(f"[stale_check] {len(stale)} stale of {len(jobs)}" + "".join(f"\n  {l}" for l in lines))
    if not stale or DRY_RUN:
        return 0

    msg_file = os.environ.get("HEARTBEAT_MSG_FILE")
    if msg_file:
        summary = f"{len(stale)} stale: " + "; ".join(lines)
        Path(msg_file).write_text(summary[:300] + "\n")
    return EXIT_STALE


if __name__ == "__main__":
    if DRY_RUN:
        sys.exit(main())
    from _joblog import job

    # Finding stale jobs is a SUCCESSFUL run of this checker: record 'ok' for itself, then exit
    # 10 so the heartbeat wrapper pages. Only an exception marks the checker itself as failing.
    with job(SELF):
        rc = main()
    sys.exit(rc)
