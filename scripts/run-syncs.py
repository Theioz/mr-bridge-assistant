#!/usr/bin/env python3
"""
Sync orchestrator for Mr. Bridge session startup.

Delegates the actual syncing to the app's /api/cron/sync endpoint, then runs the
alert scripts. This is the SAME endpoint the nightly cron calls, which is the point:

  WHY THIS IS A THIN CLIENT AND NOT A SYNC IMPLEMENTATION
  Until 2026-08-05 there were two complete sync implementations — Python
  (scripts/sync-oura.py, scripts/sync-google-health.py, ~950 lines) and TypeScript
  (web/src/lib/sync/*.ts). They drifted, silently. Both carried the same workout-dedup
  bug; #656 fixed the Python copy, and because that read as "fixed", the nightly cron —
  which runs the TypeScript copy — kept storing duplicate rows until #657. The duplicated
  30-minute skip window even carried a comment saying "same as run-syncs.py", which is the
  hazard stated out loud and then ignored.
  There is now ONE implementation. Do not reintroduce a second one here: if a sync needs
  changing, change it in web/src/lib/sync/ and it takes effect for both callers.

Requires the app container to be up. That is a real trade-off versus the old scripts,
which talked to the vendor APIs directly — see the error path below, which says so
explicitly rather than failing with a bare connection error.

Usage:
  python3 scripts/run-syncs.py                # normal: 30-min skip window applies
  python3 scripts/run-syncs.py --days 30      # backfill 30 days (implies --force)
  python3 scripts/run-syncs.py --force        # ignore the skip window
  python3 scripts/run-syncs.py --no-alerts    # syncs only
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

# Generous: a 90-day backfill hits the vendor APIs many times over. The endpoint itself
# is bounded at 90 days, so this only needs to outlast the slowest legitimate request.
TIMEOUT_SECS = 600

# Alert scripts run after syncs — order matters (HRV needs fresh Oura data).
ALERTS: list[list[str]] = [
    ["scripts/check_hrv_alert.py"],
    ["scripts/check_task_due_alerts.py"],
    ["scripts/check_weather_alert.py"],
]


def _app_url() -> str:
    url = os.environ.get("INTERNAL_APP_URL") or os.environ.get("APP_URL")
    if not url:
        sys.exit("[run-syncs] INTERNAL_APP_URL (or APP_URL) is not set in .env")
    return url.rstrip("/")


def _summarize(results: dict) -> None:
    """Print one line per source. The endpoint reports per-source, so mirror that."""
    for source, detail in results.items():
        if not isinstance(detail, dict):
            print(f"[run-syncs] {source}: {detail}")
            continue
        if detail.get("skipped"):
            age = detail.get("ageSecs")
            mins = f"{round(age / 60)}m" if isinstance(age, (int, float)) else "recently"
            print(f"[run-syncs] {source}: skipped (synced {mins} ago)")
            continue
        failed = detail.get("usersFailed") or 0
        if failed:
            print(f"[run-syncs] {source}: FAILED for {failed} user(s)")
            for err in detail.get("errors") or []:
                print(f"    {err.get('userId', '?')}: {err.get('error')}")
        else:
            extra = {k: v for k, v in detail.items() if k not in ("usersSynced", "usersFailed", "errors")}
            suffix = f"  {extra}" if extra else ""
            print(f"[run-syncs] {source}: ok{suffix}")


def run_syncs(days: int | None, force: bool) -> int:
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        sys.exit("[run-syncs] CRON_SECRET is not set in .env — cannot authenticate to the app")

    params = []
    if days is not None:
        params.append(f"days={days}")
    if force or days is not None:
        params.append("force=1")
    url = f"{_app_url()}/api/cron/sync" + (f"?{'&'.join(params)}" if params else "")

    scope = f"last {days} day(s)" if days is not None else "default window"
    print(f"[run-syncs] POST {url.split('?')[0]} ({scope}{', forced' if force or days else ''})")

    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {secret}"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
            payload = json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        print(f"[run-syncs] HTTP {e.code} from the sync endpoint: {body}", file=sys.stderr)
        if e.code == 401:
            print("[run-syncs] CRON_SECRET in .env does not match the app's.", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        # The one regression versus the deleted Python syncs: they reached the vendor APIs
        # directly, so they worked with the app down. Say that plainly instead of leaking a
        # bare socket error.
        print(f"[run-syncs] Could not reach the app at {_app_url()} ({e.reason}).", file=sys.stderr)
        print("[run-syncs] Syncing now requires the mr-bridge container to be running:", file=sys.stderr)
        print("    docker compose -f ~/docker/mr-bridge/docker-compose.yml up -d mr-bridge", file=sys.stderr)
        return 1

    _summarize({k: v for k, v in payload.items() if k != "ok"})
    return 0


def run_alerts() -> None:
    """Run alert scripts sequentially after syncs. Errors are non-fatal."""
    for cmd in ALERTS:
        try:
            result = subprocess.run(
                [sys.executable] + cmd, capture_output=True, text=True, cwd=str(ROOT)
            )
            if result.returncode != 0:
                print(f"[run-syncs] alert {cmd[0]} FAILED (exit {result.returncode})")
                if result.stderr.strip():
                    print(result.stderr.strip())
            elif result.stdout.strip():
                print(result.stdout.strip())
        except Exception as e:
            print(f"[run-syncs] alert {cmd[0]} error: {e}", file=sys.stderr)


def main() -> None:
    p = argparse.ArgumentParser(description="Trigger the app's syncs, then run alerts")
    p.add_argument("--days", type=int, help="backfill this many days (1-90); implies --force")
    p.add_argument("--force", action="store_true", help="ignore the 30-minute skip window")
    p.add_argument("--no-alerts", action="store_true", help="skip the alert scripts")
    args = p.parse_args()

    if args.days is not None and not (1 <= args.days <= 90):
        sys.exit("[run-syncs] --days must be between 1 and 90")

    rc = run_syncs(args.days, args.force)
    # Alerts still run after a failed sync: check_task_due_alerts and check_weather_alert
    # do not depend on sync data, and a stale HRV alert is better than none.
    if not args.no_alerts:
        run_alerts()
    sys.exit(rc)


if __name__ == "__main__":
    main()
