"""Completed-task retention window (#684).

Mirrors web/src/lib/tasks/retention.ts — change both together.

Completed tasks are kept for RETENTION_DAYS, then purge_completed_tasks.py hard-deletes them. The
spawn floor is the other half of that contract: the spawners skip a date only because a row for it
exists, so a purged occurrence would be re-created as an overdue chore unless no spawner ever looks
that far back. purge only takes an occurrence whose occurrence_date is before the floor, and both
spawners start no earlier than it.
"""

from __future__ import annotations

from datetime import date, timedelta

RETENTION_DAYS = 90


def retention_floor(today: date) -> date:
    """Oldest occurrence date a spawner may materialize; anything before it may have been purged."""
    return today - timedelta(days=RETENTION_DAYS)
