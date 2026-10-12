#!/usr/bin/env python3
"""Tests for travel mode (#761): finding the "Stay at ..." event covering today, turning its
address into something the place-name geocoder can match, and the morning summary's wording
while away.

Run: python3 -m unittest discover -s tests -v

scripts/_travel.py mirrors web/src/lib/travel/stay.ts; web/src/__tests__/travel-stay.test.ts
pins the same cases, so the dashboard and the push agree on whether you're traveling.
Stdlib only, like the rest of tests/: no Supabase, no network.
"""

import sys
import unittest
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import _travel as travel  # noqa: E402
import check_morning_summary as ms  # noqa: E402

UTC = ZoneInfo("UTC")
LA = ZoneInfo("America/Los_Angeles")

WESTIN = {
    "summary": "Stay at The Westin Melbourne",
    "location": "The Westin Melbourne, 205 Collins St, Melbourne VIC 3000, Australia",
    "start": {"date": "2026-10-10"},
    "end": {"date": "2026-10-16"},  # Google's all-day end is exclusive -> last day is the 15th
}


class FindCurrentStay(unittest.TestCase):
    def test_all_day_stay_covering_today(self):
        self.assertEqual(
            travel.find_current_stay([WESTIN], date(2026, 10, 12), UTC),
            {"name": "The Westin Melbourne", "location": WESTIN["location"],
             "start": "2026-10-10", "end": "2026-10-15"},
        )

    def test_edges_first_and_last_day_count_exclusive_end_does_not(self):
        self.assertIsNotNone(travel.find_current_stay([WESTIN], date(2026, 10, 10), UTC))
        self.assertIsNotNone(travel.find_current_stay([WESTIN], date(2026, 10, 15), UTC))
        self.assertIsNone(travel.find_current_stay([WESTIN], date(2026, 10, 16), UTC))
        self.assertIsNone(travel.find_current_stay([WESTIN], date(2026, 10, 9), UTC))

    def test_title_must_start_with_stay_at(self):
        base = {"start": {"date": "2026-10-12"}, "end": {"date": "2026-10-13"}}
        today = date(2026, 10, 12)
        self.assertIsNotNone(travel.find_current_stay([{**base, "summary": "stay at Hotel Kyoto"}], today, UTC))
        self.assertIsNone(travel.find_current_stay(
            [{**base, "summary": "Dinner at the Stay at Home Café"}], today, UTC))
        self.assertIsNone(travel.find_current_stay(
            [{**base, "summary": "Offsite", "location": "Hilton Austin"}], today, UTC))

    def test_cancelled_ignored(self):
        self.assertIsNone(travel.find_current_stay([{**WESTIN, "status": "cancelled"}], date(2026, 10, 12), UTC))

    def test_changeover_day_later_start_wins(self):
        nxt = {"summary": "Stay at Park Hyatt Sydney", "location": "7 Hickson Rd, The Rocks NSW 2000, Australia",
               "start": {"date": "2026-10-15"}, "end": {"date": "2026-10-18"}}
        self.assertEqual(travel.find_current_stay([WESTIN, nxt], date(2026, 10, 15), UTC)["name"], "Park Hyatt Sydney")
        self.assertEqual(travel.find_current_stay([nxt, WESTIN], date(2026, 10, 14), UTC)["name"], "The Westin Melbourne")

    def test_timed_event_read_in_local_tz(self):
        timed = {"summary": "Stay at Ace Hotel",
                 "start": {"dateTime": "2026-10-11T15:00:00-07:00"},
                 "end": {"dateTime": "2026-10-13T11:00:00-07:00"}}
        self.assertEqual(
            travel.find_current_stay([timed], date(2026, 10, 13), LA),
            {"name": "Ace Hotel", "location": None, "start": "2026-10-11", "end": "2026-10-13"},
        )
        self.assertIsNone(travel.find_current_stay([timed], date(2026, 10, 14), LA))

    def test_nothing_to_find(self):
        self.assertIsNone(travel.find_current_stay([], date(2026, 10, 12), UTC))
        self.assertIsNone(travel.find_current_stay([{"summary": "Stay at X"}], date(2026, 10, 12), UTC))


class GeocodeCandidates(unittest.TestCase):
    def test_city_first_street_and_postcode_dropped(self):
        self.assertEqual(travel.geocode_candidates(WESTIN["location"]), ["Melbourne", "The Westin Melbourne"])
        self.assertEqual(travel.geocode_candidates("Hilton, 500 E 4th St, Austin, TX 78701, USA"), ["Austin", "Hilton"])
        self.assertEqual(travel.geocode_candidates("New York, NY 10001, USA"), ["New York"])
        self.assertEqual(travel.geocode_candidates("Paris, France"), ["Paris"])
        self.assertEqual(travel.geocode_candidates("Kyoto"), ["Kyoto"])
        self.assertEqual(travel.geocode_candidates("  "), [])
        self.assertEqual(travel.geocode_candidates(None), [])

    def test_geocode_candidates_for_the_address_google_calendar_writes(self):
        # Live, Oct 2026: two segments, the city at the end of a street line. The first version
        # produced no candidates and travel mode silently used home weather.
        live = "205 Collins Street Melbourne, Victoria 3000 Australia"
        self.assertEqual(travel.geocode_candidates(live), ["Melbourne", "Victoria"])
        self.assertEqual(travel.address_country(live), "Australia")
        self.assertEqual(travel.geocode_candidates("12 Main St, Springfield, United States"), ["Springfield"])
        self.assertEqual(travel.address_country("12 Main St, Springfield, United States"), "United States")
        self.assertIsNone(travel.address_country("Kyoto"))

    def test_stay_city(self):
        self.assertEqual(travel.stay_city({"name": "The Westin Melbourne", "location": WESTIN["location"]}), "Melbourne")
        self.assertEqual(travel.stay_city({"name": "Ace Hotel", "location": None}), "Ace Hotel")


class MorningSummaryWhileTraveling(unittest.TestCase):
    W = {"temp": 64, "condition": "Partly Cloudy", "high": 70, "low": 55, "wmo_code": 2,
         "precip_in": 0, "wind_mph": 9, "location": "Melbourne, Victoria"}

    def test_traveling_line_leads_and_empty_plan_is_not_reported(self):
        _, body = ms.compose(date(2026, 10, 12), self.W, [], [], [], 0,
                             travel={"city": "Melbourne", "until": "2026-10-15"})
        lines = body.splitlines()
        self.assertEqual(lines[0], "Traveling: Melbourne until Oct 15")
        self.assertIn("(Melbourne, Victoria)", lines[1])
        self.assertNotIn("Meals: nothing planned", body)

    def test_planned_meals_still_listed_while_traveling(self):
        _, body = ms.compose(date(2026, 10, 12), self.W, [], [],
                             [{"meal_type": "dinner", "status": "planned", "label": "Room service"}], 0,
                             travel={"city": "Melbourne", "until": "2026-10-15"})
        self.assertIn("Meals: dinner Room service", body)

    def test_at_home_unchanged(self):
        _, body = ms.compose(date(2026, 10, 12), self.W, [], [], [], 0)
        self.assertNotIn("Traveling", body)
        self.assertIn("Meals: nothing planned", body)


if __name__ == "__main__":
    unittest.main()
