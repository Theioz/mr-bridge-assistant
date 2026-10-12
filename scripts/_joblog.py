"""
Heartbeats for scheduled jobs: one `sync_log` row per run, so the Status page and
check_stale_signals.py can see every job — the same table the app's syncs already write.

    from _joblog import job

    with job("cron:task_due") as run:
        ...            # do the work
        run.count = n  # optional: rows written / items handled

On normal exit it records status 'ok'. On an exception it records 'error' and RE-RAISES, so cron
still sees a non-zero exit. A job that never records anything is exactly what the stale check
catches: register every scheduled job in web/src/lib/status/jobs.json.
"""
from __future__ import annotations

import sys
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))


class _Run:
    count = 0


def record(client, source: str, status: str, count: int = 0) -> None:
    try:
        client.table("sync_log").insert(
            {"source": source, "status": status, "records_written": count}
        ).execute()
    except Exception as e:  # noqa: BLE001 — a missing heartbeat surfaces as stale, not as a crash
        print(f"[joblog] could not record {source}={status}: {e}", file=sys.stderr)


@contextmanager
def job(source: str, client=None):
    if client is None:
        from _supabase import get_client

        client = get_client()
    run = _Run()
    try:
        yield run
    except SystemExit as e:
        # sys.exit(0) / sys.exit() inside a job is a normal finish, not a failure.
        record(client, source, "ok" if e.code in (0, None) else "error", run.count)
        raise
    except BaseException:
        record(client, source, "error", run.count)
        raise
    record(client, source, "ok", run.count)
