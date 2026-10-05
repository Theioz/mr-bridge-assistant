"""Task dependencies for the briefing (#470). Mirrors web/src/lib/tasks/blockers.ts.

A task is BLOCKED while its blocker is ACTIVE. A completed or archived blocker releases it.
"Newly unblocked" = still active, and its blocker was COMPLETED at or after `since` — the briefing
passes the start of yesterday, so a blocker finished late yesterday still surfaces the next morning.
An archived blocker releases a task too, but quietly: dropping a task is not news about the next one.
"""

from __future__ import annotations

from datetime import datetime

# PostgREST embed of the blocking task; the FK is named because tasks references itself twice.
BLOCKER_EMBED = "blocker:tasks!tasks_blocked_by_fkey(title,status,completed_at)"


def is_blocked(task: dict) -> bool:
    blocker = task.get("blocker")
    return bool(blocker) and blocker.get("status") == "active"


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def newly_unblocked(tasks: list[dict], since: datetime) -> list[dict]:
    """Active tasks whose blocker was completed at or after `since` (timezone-aware)."""
    out = []
    for t in tasks:
        blocker = t.get("blocker")
        if t.get("status") != "active" or not blocker or blocker.get("status") != "completed":
            continue
        done = _parse(blocker.get("completed_at"))
        if done and done >= since:
            out.append(t)
    return out
