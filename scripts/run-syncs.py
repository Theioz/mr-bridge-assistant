#!/usr/bin/env python3
"""
Parallel sync orchestrator for Mr. Bridge session startup.

Checks sync_log for recent runs and skips sources synced within the last
30 minutes. Remaining syncs run in parallel via subprocesses.

Usage: python3 scripts/run-syncs.py
"""
from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import subprocess

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _supabase import get_client, log_sync

SKIP_WINDOW_SECS = 30 * 60  # 30 minutes

SYNCS: list[tuple[str, list[str]]] = [
    ("google_fit", ["scripts/sync-googlefit.py", "--yes"]),
    ("oura",       ["scripts/sync-oura.py",      "--yes"]),
    ("fitbit",     ["scripts/sync-fitbit.py",    "--yes"]),
]


def last_sync_age(client, source: str) -> float | None:
    """Return seconds since last successful sync for source, or None if never."""
    rows = (
        client.table("sync_log")
        .select("synced_at")
        .eq("source", source)
        .eq("status", "ok")
        .order("synced_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None
    raw = rows[0]["synced_at"]
    # dateutil handles arbitrary ISO 8601 variants (fractional seconds, Z suffix)
    from dateutil import parser as dtparser
    last = dtparser.parse(raw)
    return (datetime.now(timezone.utc) - last).total_seconds()


def run_sync(source: str, cmd: list[str]) -> tuple[str, int, str]:
    """Run one sync script as a subprocess. Returns (source, returncode, output)."""
    result = subprocess.run(
        [sys.executable] + cmd,
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )
    return source, result.returncode, result.stdout + result.stderr


def main() -> None:
    client = None
    try:
        client = get_client()
        to_run: list[tuple[str, list[str]]] = []
        skipped: list[str] = []

        for source, cmd in SYNCS:
            age = last_sync_age(client, source)
            if age is not None and age < SKIP_WINDOW_SECS:
                skipped.append(source)
            else:
                to_run.append((source, cmd))

    except Exception as e:
        print(f"[run-syncs] Warning: could not check sync_log ({e}); running all syncs")
        to_run = list(SYNCS)
        skipped = []

    if skipped:
        print(f"[run-syncs] Skipped (synced within 30m): {', '.join(skipped)}")

    if not to_run:
        print("[run-syncs] All syncs up to date.")
        return

    print(f"[run-syncs] Running in parallel: {', '.join(s for s, _ in to_run)}")

    with ThreadPoolExecutor(max_workers=len(to_run)) as pool:
        futures = {pool.submit(run_sync, source, cmd): source for source, cmd in to_run}
        for future in as_completed(futures):
            source, rc, output = future.result()
            status = "ok" if rc == 0 else f"FAILED (exit {rc})"
            print(f"[run-syncs] {source}: {status}")
            if rc != 0 and output.strip():
                print(output.strip())
            elif rc == 0 and client is not None:
                # Ensure a sync_log entry exists so skip-if-recent works next run,
                # even if the individual script returned early (no new data to write).
                try:
                    log_sync(client, source, "ok", 0)
                except Exception:
                    pass


if __name__ == "__main__":
    main()
