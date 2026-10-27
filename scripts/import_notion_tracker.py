#!/usr/bin/env python3
"""One-time import of the Notion "Job Application Tracker" into the `jobs` table.

  python scripts/import_notion_tracker.py export.json [--dry-run]

export.json is a list of Notion rows: {url (the Notion page), Role, Company, Status, Fit, Level,
Link, Location, Base Range, Total Comp Est, Req ID, Notes, date:Date Applied:start,
date:Date Rejected:start}. Rows land with source = 'notion_import' and notion_page_url = the old
Notion row, so nothing is lost.

Re-running is safe: a row whose posting url is already in `jobs` (for example a role Job Scout
collected first) gets only its tracker fields updated, never its scout fields; rows without a url
are matched on notion_page_url. --dry-run prints the mapping and writes nothing.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _job_scout import norm_url  # noqa: E402

STATUS = {"watching": "watching", "to apply": "to_apply", "applied": "applied",
          "recruiter screen": "recruiter_screen", "interviewing": "interviewing", "offer": "offer",
          "rejected": "rejected", "withdrawn": "withdrawn", "closed": "closed"}
FIT = {"high": "high", "medium": "medium", "low": "low"}
# Job Scout rows written while it lived in Notion: "<Company>. Job Scout 2026-10-26: score 8/10 - ..."
SCOUT_NOTE = re.compile(r"^\s*(?:(?P<company>[^.\n]{1,60})\.\s+)?Job Scout (?P<date>\d{4}-\d{2}-\d{2}):\s*(?:score (?P<score>\d{1,2})/10)?")
TRACKER_COLS = ("status", "date_applied", "date_rejected", "fit", "level", "req_id", "base_range",
                "total_comp_est", "notes", "notion_page_url")


def _blank(v):
    return v is None or (isinstance(v, str) and v.strip() in ("", "None", "null"))


def _date(v):
    if _blank(v):
        return None
    m = re.match(r"\d{4}-\d{2}-\d{2}", str(v))
    return m.group(0) if m else None


def _text(v):
    return None if _blank(v) else str(v).strip()


def map_row(r: dict) -> dict:
    """One Notion row -> one jobs row (no user_id). Raises ValueError on an unknown status."""
    status_raw = (_text(r.get("Status")) or "").lower()
    if status_raw and status_raw not in STATUS:
        raise ValueError(f"unknown Status {r.get('Status')!r} on {r.get('Role')!r}")
    notes = _text(r.get("Notes"))
    company = _text(r.get("Company")) or "Unknown"
    m = SCOUT_NOTE.match(notes or "")
    if company == "Other" and m and m.group("company"):
        company = m.group("company").strip()
    row = {
        "url": norm_url(r.get("Link")) or None,
        "company": company,
        "title": _text(r.get("Role")) or "(untitled)",
        "location": _text(r.get("Location")),
        "source": "notion_import",
        "status": STATUS.get(status_raw),
        "date_applied": _date(r.get("date:Date Applied:start")),
        "date_rejected": _date(r.get("date:Date Rejected:start")),
        "fit": FIT.get((_text(r.get("Fit")) or "").lower()),
        "level": _text(r.get("Level")),
        "req_id": _text(r.get("Req ID")),
        "base_range": _text(r.get("Base Range")),
        "total_comp_est": _text(r.get("Total Comp Est")),
        "notes": notes,
        "notion_page_url": _text(r.get("url")),
    }
    if m:  # recommended by the Notion-era Job Scout: keep that history on the scout side too
        row["stage"] = "recommended"
        row["first_seen"] = row["last_seen"] = m.group("date")
        if m.group("score"):
            row["score"] = int(m.group("score"))
    return row


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("export")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args(argv)
    try:
        rows = [map_row(r) for r in json.loads(Path(a.export).read_text())]
    except (OSError, json.JSONDecodeError, ValueError, AttributeError) as e:
        print(f"import: rejected {a.export}: {e}", file=sys.stderr)
        return 2

    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r["status"] or "none"] = by_status.get(r["status"] or "none", 0) + 1
    scout = sum(1 for r in rows if r.get("stage") == "recommended")
    no_url = sum(1 for r in rows if not r["url"])
    summary = f"{len(rows)} rows ({by_status}); {scout} Job Scout rows; {no_url} without a posting url"
    if a.dry_run:
        print(f"import (dry run): {summary}")
        for r in rows[:5]:
            print(" ", json.dumps({k: r[k] for k in ("company", "title", "status", "fit", "date_applied", "url")}))
        return 0

    from _supabase import get_client, get_owner_user_id
    db, uid = get_client(), get_owner_user_id()
    inserted = updated = 0
    for r in rows:
        if r["url"]:
            hit = db.table("jobs").select("id").eq("user_id", uid).eq("url", r["url"]).limit(1).execute().data
        else:
            hit = db.table("jobs").select("id").eq("user_id", uid).eq("notion_page_url", r["notion_page_url"]).limit(1).execute().data
        if hit:
            db.table("jobs").update({k: r[k] for k in TRACKER_COLS}).eq("id", hit[0]["id"]).execute()
            updated += 1
        else:
            db.table("jobs").insert({**r, "user_id": uid}).execute()
            inserted += 1
    print(f"import: {summary}; inserted {inserted}, updated {updated}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
