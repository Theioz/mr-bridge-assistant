#!/usr/bin/env python3
"""Tests for workout dedup in scripts/sync-google-health.py.

Run: python3 -m unittest discover -s tests -v

These guard a bug whose failure mode is SILENT and cumulative. Google Health aggregates
several writers (watch, phone, connected apps) and routinely reports one activity twice in
a single response: once from the writer holding the HR sensor, with `hr_zones` populated,
and once as a coarse copy with `hr_zones` null and a wild calorie figure.

Before 2026-08-05 the +/-5 min overlap check compared each incoming row only against rows
already in the database, never against rows accepted earlier in the same batch — so for a
same-batch pair, neither copy was stored yet when the other was judged, and both passed.
Nothing errored; active-calorie totals just drifted upward. 2026-07-31 stored one walk
twice (84 and 467 kcal for 13 minutes) and one basketball game three times (1677 kcal
total); 2026-08-02 stored a phantom 295-minute "Cardio Workout" worth 1867 kcal.

If this regresses nothing throws and the numbers quietly inflate again, so it needs a test.
"""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"


def _load_sync_module():
    """Import sync-google-health.py on a bare interpreter.

    Two obstacles, both deliberate. The CI job installs no dependencies on purpose (see
    .github/workflows/python-tests.yml), and the filename is hyphenated, so it is not a
    legal module name for a plain import. Stub the non-stdlib imports, then load by path.
    `filter_new_workouts` is pure apart from a single Supabase read, which the fake client
    below supplies.
    """
    dotenv = types.ModuleType("dotenv")
    dotenv.load_dotenv = lambda *a, **k: None
    sys.modules.setdefault("dotenv", dotenv)

    for name, attrs in (
        ("_supabase", ("get_client", "get_owner_user_id", "upsert")),
        ("_sync_log", ("log_sync", "urlopen_with_retry")),
        ("_integrations", ("load_integration",)),
    ):
        stub = types.ModuleType(name)
        for attr in attrs:
            setattr(stub, attr, lambda *a, **k: None)
        sys.modules.setdefault(name, stub)

    spec = importlib.util.spec_from_file_location(
        "sync_google_health", SCRIPTS / "sync-google-health.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sync = _load_sync_module()

USER = "test-user"


class _FakeQuery:
    """Mimics only the postgrest chain filter_new_workouts actually calls."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def in_(self, column, values):
        self._rows = [r for r in self._rows if r.get(column) in values]
        return self

    def execute(self):
        return types.SimpleNamespace(data=self._rows)


class FakeClient:
    def __init__(self, stored):
        self.stored = stored

    def table(self, _name):
        return _FakeQuery([dict(r) for r in self.stored])


def stored(date, start, activity, source="google_health"):
    return {
        "id": f"{date}-{start}-{activity}",
        "date": date,
        "start_time": start,
        "activity": activity,
        "avg_hr": None,
        "duration_mins": 30,
        "source": source,
    }


def incoming(date, start, activity, **extra):
    row = {
        "date": date,
        "start_time": start,
        "activity": activity,
        "_key": f"{date}|{start}|{activity}",
    }
    row.update(extra)
    return row


def names(rows):
    return [(r["start_time"], r["activity"]) for r in rows]


class SameBatchDuplicates(unittest.TestCase):
    """The regression: both copies arrive together, so neither is in the DB yet."""

    def test_basketball_pair_65_seconds_apart_keeps_one(self):
        # The real 2026-07-31 rows: 13:12:00 (no HR zones) and 13:13:05 (Peak 41m).
        rows = [
            incoming("2026-07-31", "13:12:00", "Basketball", calories=431),
            incoming("2026-07-31", "13:13:05", "Basketball", calories=792),
        ]
        kept = sync.filter_new_workouts(FakeClient([]), USER, rows)
        self.assertEqual(len(kept), 1, f"expected 1 row, got {names(kept)}")
        self.assertEqual(kept[0]["start_time"], "13:12:00")

    def test_walk_pair_three_minutes_apart_keeps_one(self):
        # 2026-07-31 again: 13 min of walking stored as 84 kcal and 467 kcal.
        rows = [
            incoming("2026-07-31", "12:59:54", "Walk", calories=84),
            incoming("2026-07-31", "13:03:00", "Walk", calories=467),
        ]
        kept = sync.filter_new_workouts(FakeClient([]), USER, rows)
        self.assertEqual(len(kept), 1, f"expected 1 row, got {names(kept)}")

    def test_three_copies_collapse_to_one(self):
        rows = [
            incoming("2026-07-31", "13:12:00", "Basketball"),
            incoming("2026-07-31", "13:13:05", "Basketball"),
            incoming("2026-07-31", "13:14:10", "Basketball"),
        ]
        kept = sync.filter_new_workouts(FakeClient([]), USER, rows)
        self.assertEqual(len(kept), 1, f"expected 1 row, got {names(kept)}")

    def test_genuinely_separate_sessions_both_survive(self):
        # Outside OVERLAP_MINS: two real sessions on one day must not be collapsed.
        rows = [
            incoming("2026-07-31", "09:54:31", "Cardio Workout"),
            incoming("2026-07-31", "15:36:22", "Cardio Workout"),
        ]
        kept = sync.filter_new_workouts(FakeClient([]), USER, rows)
        self.assertEqual(len(kept), 2, f"expected 2 rows, got {names(kept)}")

    def test_same_clock_time_on_different_dates_both_survive(self):
        rows = [
            incoming("2026-07-30", "13:12:00", "Basketball"),
            incoming("2026-07-31", "13:12:00", "Basketball"),
        ]
        kept = sync.filter_new_workouts(FakeClient([]), USER, rows)
        self.assertEqual(len(kept), 2, f"expected 2 rows, got {names(kept)}")


class ManualRowsParticipateInDedup(unittest.TestCase):
    """A hand-logged session is the same real workout the watch also reports."""

    def test_manual_row_suppresses_the_auto_import(self):
        db = [stored("2026-07-31", "13:13:05", "Basketball", source="manual")]
        rows = [incoming("2026-07-31", "13:12:00", "Basketball")]
        kept = sync.filter_new_workouts(FakeClient(db), USER, rows)
        self.assertEqual(kept, [], f"manual row should have suppressed it, got {names(kept)}")

    def test_manual_is_in_the_dedup_source_list(self):
        self.assertIn("manual", sync.DEDUPE_SOURCES)
        # ...but is not something this sync claims to write.
        self.assertNotIn("manual", sync.WORKOUT_SOURCES)

    def test_unrelated_source_does_not_suppress(self):
        db = [stored("2026-07-31", "13:13:05", "Basketball", source="strava")]
        rows = [incoming("2026-07-31", "13:12:00", "Basketball")]
        kept = sync.filter_new_workouts(FakeClient(db), USER, rows)
        self.assertEqual(len(kept), 1, "a source outside DEDUPE_SOURCES must not suppress")


class PreExistingBehaviourPreserved(unittest.TestCase):
    """The original guarantees must survive the fix."""

    def test_exact_key_match_is_dropped(self):
        db = [stored("2026-07-31", "13:13:05", "Basketball")]
        rows = [incoming("2026-07-31", "13:13:05", "Basketball")]
        self.assertEqual(sync.filter_new_workouts(FakeClient(db), USER, rows), [])

    def test_stored_row_suppresses_a_near_neighbour(self):
        db = [stored("2026-07-31", "13:13:05", "Basketball")]
        rows = [incoming("2026-07-31", "13:12:00", "Basketball")]
        self.assertEqual(sync.filter_new_workouts(FakeClient(db), USER, rows), [])

    def test_null_start_time_is_not_treated_as_overlapping(self):
        # time_to_mins returns None for a missing start_time; those rows are skipped by
        # the comparison rather than silently matching everything.
        rows = [
            incoming("2026-07-31", None, "Basketball"),
            incoming("2026-07-31", "13:12:00", "Basketball"),
        ]
        kept = sync.filter_new_workouts(FakeClient([]), USER, rows)
        self.assertEqual(len(kept), 2, f"expected both kept, got {names(kept)}")

    def test_empty_batch(self):
        self.assertEqual(sync.filter_new_workouts(FakeClient([]), USER, []), [])


if __name__ == "__main__":
    unittest.main()
