#!/usr/bin/env python3
"""Tests for the GA notification rework (#761): the morning summary, the stale-signal check, and
the single push path.

Run: python3 -m unittest discover -s tests -v

WHY THIS EXISTS

Every one of these replaces a job whose failure was invisible: weather, HRV and birthday alerts
that were scheduled nowhere; a birthday script that could not import on the host; a push log that
printed the ntfy topic; an in-app history that missed most pushes. These tests pin the behaviour
that makes failure visible: wording flags, staleness, and a push that raises when undelivered.
Stdlib only, like the rest of tests/: no Supabase, no network.
"""

import io
import os
import sys
import unittest
import urllib.error
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import _push  # noqa: E402
import check_morning_summary as ms  # noqa: E402
import check_stale_signals as stale  # noqa: E402


class MorningSummary(unittest.TestCase):
    def test_quiet_day_reads_plainly(self):
        title, body = ms.compose(
            date(2026, 10, 13),
            {"temp": 61, "condition": "Clear", "high": 68, "low": 52, "wmo_code": 0,
             "precip_in": 0, "wind_mph": 8, "location": "San Francisco"},
            [{"readiness": 81, "sleep_score": 84, "avg_hrv": 50}],
            [{"name": "Upper A", "status": "planned"}],
            [{"meal_type": "dinner", "status": "planned", "label": "Salmon bowl"},
             {"meal_type": "lunch", "status": "planned", "label": "Chicken + beans"}],
            0,
        )
        self.assertEqual(title, "Today · Tue Oct 13")
        self.assertIn("61°F Clear, high 68°F / low 52°F (San Francisco)", body)
        self.assertIn("Workout: Upper A", body)
        # Meals in eating order, not insertion order.
        self.assertIn("Meals: lunch Chicken + beans; dinner Salmon bowl", body)
        self.assertNotIn("Tasks:", body)
        self.assertNotIn("—", body.splitlines()[0])  # no weather flags on a quiet day

    def test_weather_flags_carry_over_from_the_old_alert(self):
        line = ms.weather_line({"temp": 70, "condition": "Thunderstorm", "high": 97, "low": 70,
                                "wmo_code": 95, "precip_in": 0.6, "wind_mph": 35})
        for flag in ("thunderstorms", '0.6" rain', "extreme heat", "wind 35 mph"):
            self.assertIn(flag, line)

    def test_hrv_drop_is_flagged_against_the_7_day_baseline(self):
        rows = [{"readiness": 60, "sleep_score": 70, "avg_hrv": 35}] + [{"avg_hrv": 50}] * 7
        self.assertIn("30% below your 7-day baseline", ms.recovery_line(rows, 20))
        # Under the threshold: no flag.
        self.assertNotIn("baseline", ms.recovery_line([{"avg_hrv": 45}] + [{"avg_hrv": 50}] * 7, 20))
        # Too little history to call a baseline: no flag.
        self.assertNotIn("baseline", ms.recovery_line([{"avg_hrv": 20}, {"avg_hrv": 50}], 20))

    def test_missing_sections_say_so_and_cancelled_workouts_are_rest(self):
        _, body = ms.compose(date(2026, 10, 13), None, [], [{"name": "Legs", "status": "cancelled"}], [], 2)
        self.assertIn("Weather: unavailable", body)
        self.assertIn("Recovery: no data", body)
        self.assertIn("Workout: rest day", body)
        self.assertIn("Meals: nothing planned", body)
        self.assertIn("Tasks: 2 due or overdue", body)


class StaleSignals(unittest.TestCase):
    now = datetime(2026, 10, 13, 12, tzinfo=timezone.utc)
    jobs = [
        {"source": "oura", "label": "Oura sync", "maxAgeHours": 48},
        {"source": "cron:birthday", "label": "Birthday alerts", "maxAgeHours": 48},
        {"source": "cron:stale_check", "label": "Stale checker", "maxAgeHours": 24},
    ]

    def test_flags_old_and_never_run_but_not_itself(self):
        out = stale.evaluate(self.jobs, {"oura": self.now - timedelta(hours=50)}, self.now)
        self.assertEqual({j["source"] for j in out}, {"oura", "cron:birthday"})

    def test_fresh_job_is_fine(self):
        last = {"oura": self.now - timedelta(hours=3), "cron:birthday": self.now - timedelta(hours=20)}
        self.assertEqual(stale.evaluate(self.jobs, last, self.now), [])

    def test_description_is_human(self):
        j = {"label": "Oura sync", "maxAgeHours": 48, "lastOk": self.now - timedelta(hours=72)}
        self.assertEqual(stale.describe(j, self.now), "Oura sync: last success 3.0 days ago (expected within 48 h)")
        self.assertIn("never succeeded", stale.describe({"label": "X", "maxAgeHours": 1, "lastOk": None}, self.now))

    def test_registry_is_valid_and_includes_every_scheduled_python_job(self):
        sources = {j["source"] for j in stale.load_jobs()}
        for s in ("cron:morning_summary", "cron:task_due", "cron:birthday", "cron:coach_check",
                  "cron:spawn_tasks", "cron:purge_tasks", "cron:series_expiring", "cron:stale_check"):
            self.assertIn(s, sources)


class Push(unittest.TestCase):
    def test_refuses_without_a_topic(self):
        with mock.patch.dict(os.environ, {"NTFY_TOPIC": ""}):
            with self.assertRaises(_push.PushError):
                _push.send_ntfy("t", "m")

    def test_http_error_raises_and_the_log_never_contains_the_topic(self):
        logged = []
        err = urllib.error.HTTPError("u", 500, "boom", {}, io.BytesIO())
        with mock.patch.dict(os.environ, {"NTFY_TOPIC": "secret-topic-123"}), \
                mock.patch.object(_push.urllib.request, "urlopen", side_effect=err), \
                mock.patch.object(_push, "_log", side_effect=logged.append):
            with self.assertRaises(_push.PushError):
                _push.send_ntfy("Title", "msg")
        self.assertTrue(logged)
        self.assertFalse(any("secret-topic-123" in line for line in logged))

    def test_history_failure_does_not_undo_a_delivered_push(self):
        class Boom:
            def table(self, _):
                raise RuntimeError("db down")
        with mock.patch.object(_push, "send_ntfy", return_value=200), mock.patch.object(_push, "_log"):
            _push.push("t", "m", client=Boom(), user_id="u")  # must not raise


if __name__ == "__main__":
    unittest.main()
