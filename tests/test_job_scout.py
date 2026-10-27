#!/usr/bin/env python3
"""Tests for Job Scout's pure logic (scripts/_job_scout.py): the keep/drop verdict, the automatic
reason for roles the agent never read, collect's insert-vs-bump plan, and ingest's validation.

Run: python3 -m unittest discover -s tests -v
Stdlib only, like the rest of tests/: no Supabase, no network.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import _job_scout as js  # noqa: E402

CFG = {
    "title_role_regex": r"(technical program manager|\bTPM\b|program manager|product manager)",
    "title_exclude_regex": r"(intern\b|\bdirector\b|legal|policy|marketing)",
    "location_regex": r"(San Francisco|Seattle|Bellevue|Austin|Sydney|Remote.{0,12}(US|United States))",
    "allow_us_remote": True,
}
DAY = "2026-10-28"


class Verdict(unittest.TestCase):
    def setUp(self):
        self.r = js.Rules(CFG)

    def test_keeps_target_title_in_target_location(self):
        self.assertIsNone(self.r.verdict("Senior Technical Program Manager, Compute", "San Francisco, CA"))

    def test_non_pm_titles_are_silently_ignored(self):
        self.assertEqual(self.r.verdict("Software Engineer, Infra", "Seattle"), "not a PM/TPM title")

    def test_excluded_title_names_the_word(self):
        self.assertEqual(self.r.verdict("Legal Program Manager, Compute", "San Francisco"), "title excluded ('Legal')")

    def test_location_reason_carries_the_location(self):
        self.assertEqual(self.r.verdict("Technical Program Manager", "New York"),
                         "location not in target list (New York)")

    def test_us_remote_flag_keeps_an_otherwise_unmatched_location(self):
        self.assertIsNone(self.r.verdict("Technical Program Manager", "Anywhere", remote_us=True))

    def test_remote_flag_respects_config(self):
        r = js.Rules({**CFG, "allow_us_remote": False})
        self.assertIsNotNone(r.verdict("Technical Program Manager", "Anywhere", remote_us=True))


class AutoReason(unittest.TestCase):
    def test_infra_titles_are_flagged_as_overrulable(self):
        self.assertIn("infra-adjacent", js.auto_reason("TPM, Data Center Delivery"))

    def test_domain_is_named(self):
        self.assertIn("security / privacy / compliance", js.auto_reason("Program Manager, Privacy Programs"))

    def test_fallback(self):
        self.assertEqual(js.auto_reason("Program Manager, Executive Operations"),
                         "not shortlisted - title not infrastructure-focused")


class TitlelessPostings(unittest.TestCase):
    """2026-10-27: one Nvidia (Workday) posting arrived with no "title" and the KeyError dropped
    every Nvidia role. A posting without a title is skipped; the rest of the company survives."""

    def setUp(self):
        self._get = js._get

    def tearDown(self):
        js._get = self._get

    def test_sink_skips_empty_title_quietly(self):
        s = js.Sink("X", js.Rules(CFG))
        s.offer(None, "Seattle", "https://x/1")
        s.offer("   ", "Seattle", "https://x/2")
        self.assertEqual((s.kept, s.dropped), ([], []))

    def test_workday_posting_without_title_does_not_drop_the_company(self):
        listing = {"jobPostings": [
            {"externalPath": "/job/US/no-title", "locationsText": "US, CA, Santa Clara"},
            {"title": "Senior Technical Program Manager, Infrastructure", "externalPath": "/job/US/tpm",
             "locationsText": "US, WA, Seattle"},
        ]}

        def fake_get(url, body=None, raw=False, retries=3):
            if url.endswith("/jobs"):
                return listing if body["offset"] == 0 else {"jobPostings": []}
            return {"jobPostingInfo": {"jobDescription": "<p>desc</p>"}}
        js._get = fake_get
        s = js.Sink("Nvidia", js.Rules(CFG))
        js._workday({"host": "h", "tenant": "t", "site": "S"}, s, {"big_company_searches": ["tpm"]})
        self.assertEqual([k["title"] for k in s.kept], ["Senior Technical Program Manager, Infrastructure"])
        self.assertEqual(s.kept[0]["description"], "desc")


def kept(url, title="TPM, Compute", company="Anthropic", desc="x"):
    return {"url": url, "company": company, "title": title, "location": "San Francisco", "pay": "$1", "description": desc}


def pref(url, reason="location not in target list (New York)"):
    return {"url": url, "company": "Harvey", "title": "Program Manager", "location": "New York", "reason": reason}


class PlanCollect(unittest.TestCase):
    def test_first_run_inserts_everything_and_sends_only_kept(self):
        p = js.plan_collect([kept("https://a/1"), kept("https://a/2")], [pref("https://b/1")], set(), DAY)
        self.assertEqual(len(p["inserts"]), 3)
        self.assertEqual({i["stage"] for i in p["inserts"]}, {"pending", "prefilter"})
        self.assertEqual([r["url"] for r in p["new_roles"]], ["https://a/1", "https://a/2"])
        self.assertEqual(p["seen_again"], [])
        self.assertTrue(all(i["first_seen"] == i["last_seen"] == DAY for i in p["inserts"]))

    def test_known_urls_are_never_reinserted_only_bumped(self):
        p = js.plan_collect([kept("https://a/1"), kept("https://a/2")], [pref("https://b/1")],
                            {"https://a/1", "https://b/1/"}, DAY)
        self.assertEqual([i["url"] for i in p["inserts"]], ["https://a/2"])
        self.assertEqual(sorted(p["seen_again"]), ["https://a/1", "https://b/1"])
        self.assertEqual([r["url"] for r in p["new_roles"]], ["https://a/2"])

    def test_pending_rows_carry_the_auto_reason(self):
        p = js.plan_collect([kept("https://a/1", title="TPM, Fleet Capacity")], [], set(), DAY)
        self.assertEqual(p["inserts"][0]["reason"], p["new_roles"][0]["auto_reason"])
        self.assertIn("infra-adjacent", p["new_roles"][0]["auto_reason"])

    def test_descriptions_are_trimmed(self):
        p = js.plan_collect([kept("https://a/1", desc="y" * 9000)], [], set(), DAY)
        self.assertEqual(len(p["new_roles"][0]["description"]), js.DESC_LIMIT)

    def test_dedupe_normalises_trailing_slash(self):
        rows = js.dedupe([kept("https://a/1/"), kept("https://a/1"), kept("")])
        self.assertEqual([r["url"] for r in rows], ["https://a/1"])

    def test_inbox_stats(self):
        fetched = {"kept": [kept("https://a/1")], "prefiltered": [pref("https://b/1")], "errors": ["X: boom"]}
        p = js.plan_collect(fetched["kept"], fetched["prefiltered"], set(), DAY)
        ib = js.build_inbox(DAY, "t", fetched, p, [], [], 66)
        self.assertEqual(ib["stats"], {"companies_checked": 66, "errors": ["X: boom"], "kept_total": 1,
                                       "prefiltered_total": 1, "new_kept": 1, "new_prefiltered": 1})
        self.assertEqual(set(ib), {"date", "generated_at", "stats", "new_roles", "feedback", "preferences", "tracker"})


GOOD = {
    "date": DAY,
    "report_markdown": "# Job Scout\n\n## 1. Anthropic - TPM, Compute",
    "stats": {"recommended": 1},
    "recommended": [{"url": "https://a/1/", "score": 8, "why": "capacity"}],
    "dropped": [{"url": "https://a/2", "stage": "scored", "reason": "needs 10y DC build", "score": 5},
                {"url": "https://a/3", "stage": "pay", "reason": "max base 170k", "score": None}],
    "feedback_processed": [{"url": "https://a/4", "action": "added_to_tracker"},
                           {"url": "https://a/5", "action": "noted"}],
}


class PlanIngest(unittest.TestCase):
    def test_maps_every_section(self):
        p = js.plan_ingest(GOOD, "NOW")
        u = {url: (patch, promote) for url, patch, promote in p["updates"]}
        self.assertEqual(u["https://a/1"], ({"stage": "recommended", "score": 8, "reason": "capacity",
                                             "decided_at": "NOW"}, True))
        self.assertEqual(u["https://a/2"][0]["stage"], "scored")
        self.assertEqual(u["https://a/3"], ({"stage": "pay", "reason": "max base 170k", "score": None,
                                             "decided_at": "NOW"}, False))
        self.assertEqual(u["https://a/4"], ({"processed_at": "NOW"}, True))
        self.assertEqual(u["https://a/5"], ({"processed_at": "NOW"}, False))
        self.assertEqual(p["report"], {"date": DAY, "markdown": GOOD["report_markdown"], "stats": {"recommended": 1}})

    def test_report_is_optional(self):
        g = {k: v for k, v in GOOD.items() if k not in ("report_markdown", "stats")}
        self.assertIsNone(js.plan_ingest(g, "NOW")["report"])

    def test_same_file_twice_gives_the_same_plan(self):
        self.assertEqual(js.plan_ingest(GOOD, "NOW"), js.plan_ingest(GOOD, "NOW"))

    def test_rejects_unknown_stage(self):
        with self.assertRaises(js.DecisionsError):
            js.plan_ingest({**GOOD, "dropped": [{"url": "https://a/2", "stage": "recommended"}]}, "NOW")

    def test_rejects_missing_sections_urls_bad_date_and_action(self):
        for bad in ({"date": DAY, "recommended": []}, {**GOOD, "recommended": [{"score": 7}]}, [], "x",
                    {**GOOD, "date": "28/10/2026"},
                    {**GOOD, "feedback_processed": [{"url": "https://a/4", "action": "applied"}]},
                    {**GOOD, "report_markdown": "   "}):
            with self.assertRaises(js.DecisionsError):
                js.plan_ingest(bad, "NOW")

    def test_rejects_bad_scores(self):
        for score in ("8", 11, True):
            with self.assertRaises(js.DecisionsError):
                js.plan_ingest({**GOOD, "recommended": [{"url": "https://a/1", "score": score}]}, "NOW")


class InboxTracker(unittest.TestCase):
    def test_inbox_carries_tracker(self):
        fetched = {"kept": [], "prefiltered": [], "errors": []}
        p = js.plan_collect([], [], set(), DAY)
        t = [{"url": "https://a/1", "company": "X", "title": "Y", "status": "applied"}]
        self.assertEqual(js.build_inbox(DAY, "t", fetched, p, [], [], 1, t)["tracker"], t)

    def test_new_rows_are_job_scout_source(self):
        p = js.plan_collect([kept("https://a/1")], [pref("https://b/1")], set(), DAY)
        self.assertEqual({i["source"] for i in p["inserts"]}, {"job_scout"})


import import_notion_tracker as imp  # noqa: E402


class NotionImport(unittest.TestCase):
    BASE = {"url": "https://app.notion.com/abc", "Role": "TPM, Compute", "Company": "Anthropic", "Status": "Applied",
            "Fit": "High", "Level": "Senior TPM", "Link": "https://jobs/1/", "Location": "SF", "Base Range": "$1",
            "Total Comp Est": None, "Req ID": "None", "Notes": "hand note",
            "date:Date Applied:start": "2026-07-20", "date:Date Rejected:start": "None"}

    def test_maps_fields_and_blanks(self):
        r = imp.map_row(self.BASE)
        self.assertEqual((r["status"], r["fit"], r["url"], r["date_applied"], r["date_rejected"], r["req_id"]),
                         ("applied", "high", "https://jobs/1", "2026-07-20", None, None))
        self.assertEqual((r["source"], r["notion_page_url"]), ("notion_import", "https://app.notion.com/abc"))
        self.assertNotIn("stage", r)

    def test_job_scout_row_recovers_company_and_score(self):
        r = imp.map_row({**self.BASE, "Company": "Other", "Status": "To Apply",
                         "Notes": "Cerebras. Job Scout 2026-10-26: score 8/10 - rolling capacity model"})
        self.assertEqual((r["company"], r["status"], r["stage"], r["score"], r["first_seen"]),
                         ("Cerebras", "to_apply", "recommended", 8, "2026-10-26"))

    def test_named_company_scout_row_keeps_company(self):
        r = imp.map_row({**self.BASE, "Notes": "Job Scout 2026-10-26: score 9/10 - compute"})
        self.assertEqual((r["company"], r["score"]), ("Anthropic", 9))

    def test_watching_and_unknown_status(self):
        self.assertEqual(imp.map_row({**self.BASE, "Status": "Watching"})["status"], "watching")
        with self.assertRaises(ValueError):
            imp.map_row({**self.BASE, "Status": "Ghosted"})


if __name__ == "__main__":
    unittest.main()
