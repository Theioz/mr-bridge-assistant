#!/usr/bin/env python3
"""Tests for scripts/_scorecard.py — the Sunday scorecard arithmetic.

Run: python3 -m unittest discover -s tests -v

WHY THIS EXISTS

Every number on the scorecard is a plausible-looking integer when it is wrong: a dry-day count
that treats an unlogged day as a drinking day, an alcohol share computed over a half-logged week,
a landing date projected off two readings. None of those fail loudly. web/src/__tests__/
scorecard.test.ts pins the same definitions for the /weekly panel, so the push and the page agree.
"""

import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import _scorecard as sc  # noqa: E402
import _travel as travel  # noqa: E402

TODAY = date(2026, 10, 25)


def day(i):
    """i days before TODAY, ISO."""
    return (TODAY - timedelta(days=i)).isoformat()


def card(**kw):
    args = dict(today=TODAY, profile={}, fitness_rows=[], sessions=[], recovery_rows=[],
                meal_rows=[], plan_rows=[])
    args.update(kw)
    return sc.compute(**args)


class TestWeight(unittest.TestCase):
    def test_week_means_and_delta(self):
        fl = [{"date": day(i), "weight_lb": 150.0} for i in range(7)] + \
             [{"date": day(i), "weight_lb": 151.0} for i in range(7, 14)]
        c = card(fitness_rows=fl)
        self.assertAlmostEqual(c["weight7"], 150.0)
        self.assertAlmostEqual(c["delta"], -1.0)

    def test_excluded_trip_days_drop_out(self):
        fl = [{"date": day(0), "weight_lb": 154.0}, {"date": day(1), "weight_lb": 150.0}]
        c = card(fitness_rows=fl, excluded_weigh_ins={TODAY})
        self.assertAlmostEqual(c["weight7"], 150.0)

    def test_trajectory_line(self):
        prof = {"phase_start_date": day(14), "phase_start_weight": "154", "target_rate_lb_wk": "0.75"}
        self.assertAlmostEqual(card(profile=prof)["expected"], 152.5)

    def test_landing_needs_six_readings_and_a_downtrend(self):
        prof = {"weight_goal_lbs": "141"}
        few = [{"date": day(i), "weight_lb": 150 + i * 0.1} for i in range(5)]
        self.assertIsNone(card(profile=prof, fitness_rows=few)["landing"])
        up = [{"date": day(i), "weight_lb": 150 - i * 0.1} for i in range(10)]
        self.assertIsNone(card(profile=prof, fitness_rows=up)["landing"])
        # Losing 0.1 lb/day from ~150: ~9 lb to go is ~90 days out.
        down = [{"date": day(i), "weight_lb": 150 + i * 0.1} for i in range(28)]
        landing = card(profile=prof, fitness_rows=down)["landing"]
        self.assertIsNotNone(landing)
        self.assertTrue(80 <= (landing - TODAY).days <= 100)


class TestAlcohol(unittest.TestCase):
    def test_unlogged_days_count_as_dry(self):
        meals = [{"date": day(1), "calories": 600, "standard_drinks": 5.7}]
        c = card(meal_rows=meals)
        self.assertEqual(c["drinking_days"], 1)
        self.assertEqual(c["dry_days"], 6)
        self.assertEqual(c["drinks"], 5.7)
        self.assertEqual(c["alcohol_kcal"], 600)

    def test_max_day_sums_same_day_rows(self):
        meals = [{"date": day(1), "standard_drinks": 2}, {"date": day(1), "standard_drinks": 2.5}]
        self.assertEqual(card(meal_rows=meals)["max_day"], 4.5)

    def test_breaches_only_for_limits_that_are_set(self):
        meals = [{"date": day(i), "standard_drinks": 3} for i in range(5)]
        self.assertEqual(card(meal_rows=meals)["breaches"], [])
        prof = {"alcohol_weekly_cap": "10", "alcohol_dry_days_min": "4", "alcohol_max_per_occasion": "3"}
        self.assertEqual(card(profile=prof, meal_rows=meals)["breaches"], ["weekly cap", "dry days"])

    def test_share_needs_five_logged_days(self):
        prof = {"tdee_estimate": "2350"}
        food = [{"date": day(i), "calories": 1800} for i in range(4)]
        drink = [{"date": day(0), "calories": 700, "standard_drinks": 5.7}]
        self.assertIsNone(card(profile=prof, meal_rows=food + drink)["alcohol_share_pct"])
        food5 = [{"date": day(i), "calories": 1800} for i in range(5)]
        c = card(profile=prof, meal_rows=food5 + drink)
        # deficit = 7*2350 - 5*1800 = 7450; 700 / 7450 = 9.4%
        self.assertAlmostEqual(c["alcohol_share_pct"], 700 / 7450 * 100)


class TestCounts(unittest.TestCase):
    def test_steps_days_use_max_row_per_date(self):
        rec = [{"date": day(0), "steps": 12000}, {"date": day(0), "steps": 0},
               {"date": day(1), "steps": 9000}]
        self.assertEqual(card(recovery_rows=rec)["steps_days"], 1)

    def test_sessions_distinct_days_in_window(self):
        sess = [{"performed_on": day(0)}, {"performed_on": day(0)}, {"performed_on": day(9)}]
        self.assertEqual(card(sessions=sess)["sessions"], 1)

    def test_delivery_and_cheat(self):
        meals = [{"date": day(2), "calories": 1100, "origin": "delivery"}]
        plans = [{"date": day(3), "is_cheat": True}, {"date": day(20), "is_cheat": True}]
        c = card(meal_rows=meals, plan_rows=plans)
        self.assertEqual((c["delivery_n"], c["delivery_kcal"], c["cheat_meals"]), (1, 1100, 1))


class TestRender(unittest.TestCase):
    def test_pre_agreed_signal_only_at_three_of_four(self):
        c = card()
        self.assertFalse(any("moderation" in line for line in sc.render(c, 2)))
        self.assertTrue(any("moderation" in line for line in sc.render(c, 3)))


class TestTripWeighIns(unittest.TestCase):
    def test_stay_plus_three_days(self):
        away = {date(2026, 10, 10), date(2026, 10, 11)}
        ex = travel.excluded_weigh_ins(away)
        self.assertEqual(ex, away | {date(2026, 10, 12), date(2026, 10, 13), date(2026, 10, 14)})

    def test_stay_days_clipped_to_window(self):
        from zoneinfo import ZoneInfo
        ev = [{"summary": "Stay at Hotel X", "start": {"date": "2026-10-08"}, "end": {"date": "2026-10-12"}},
              {"summary": "Dinner at X", "start": {"date": "2026-10-09"}, "end": {"date": "2026-10-10"}}]
        got = travel.stay_days(ev, date(2026, 10, 10), date(2026, 10, 20), ZoneInfo("UTC"))
        self.assertEqual(got, {date(2026, 10, 10), date(2026, 10, 11)})


if __name__ == "__main__":
    unittest.main()
