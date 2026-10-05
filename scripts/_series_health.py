"""Is a live recurring series silent? (#703)

Mirrors web/src/lib/tasks/series-health.ts — change both together; tests/test_series_health.py
pins the cases.

A series is SILENT when its rule says the chore should be on the list right now and it is not:

  - the rule has at least one date in the spawn window [today, today + horizon],
  - the series has no ACTIVE occurrence at any date (an overdue one is still on the list), and
  - none of the in-window dates was COMPLETED (done early is "on top of it", not silent).

What that leaves is every in-window date archived ("skip"), or never materialized at all. Both
look exactly like a healthy series from the outside — the spawner prints "created 0" either way.
Deliberately NOT silent: a monthly chore whose next date is simply beyond the window. Nothing is
due, so nothing is missing; flagging it would be the same false alarm this check exists to end.
"""

from __future__ import annotations

from collections.abc import Iterable


def is_silent(rule_dates_in_window: Iterable[str], rows: Iterable[dict]) -> bool:
    """rows: this series' occurrences as dicts with `status` and `occurrence_date` (ISO date).

    Pass every active row (any date) and every completed row; archived rows may be included and
    are ignored — skipping is exactly what this detects.
    """
    window = set(rule_dates_in_window)
    if not window:
        return False
    rows = list(rows)
    if any(r.get("status") == "active" for r in rows):
        return False
    return not any(
        r.get("status") == "completed" and r.get("occurrence_date") in window for r in rows
    )
