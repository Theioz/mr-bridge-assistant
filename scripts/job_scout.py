#!/usr/bin/env python3
"""Job Scout — the homelab half (pure data, no LLM). See scripts/_job_scout.py for the split.

  python scripts/job_scout.py collect --config config.json --out inbox.json [--date YYYY-MM-DD] [--dry-run]
      Fetch every configured job board, record every PM/TPM role seen in jobs (with the
      reason it was or wasn't kept), and write the inbox for the ranking agent: today's NEW kept
      roles, feedback Jason has given in the Jobs tab since the last inbox, and the tracker.
      --dry-run: fetch and write the inbox but never touch the database (everything counts as new).

  python scripts/job_scout.py ingest decisions.json
      Apply the agent's decisions (recommended -> tracker as to_apply / dropped with reasons /
      feedback processed) and store its report in job_scout_reports.
      Idempotent; exits non-zero on a malformed file without writing anything.

Run on compute-core with the repo venv: SUPABASE_URL=http://localhost:8000.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _job_scout as js  # noqa: E402
from _dates import today_local  # noqa: E402

TABLE = "jobs"
REPORTS = "job_scout_reports"
PAGE = 1000          # PostgREST max rows per select
BATCH = 500          # rows per insert
URL_CHUNK = 50       # urls per `in` filter (they go in the query string)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _existing_urls(db, uid: str) -> set[str]:
    urls, start = set(), 0
    while True:
        rows = (db.table(TABLE).select("url").eq("user_id", uid).not_.is_("url", "null")
                .order("url").range(start, start + PAGE - 1).execute().data) or []
        urls.update(js.norm_url(r["url"]) for r in rows)
        if len(rows) < PAGE:
            return urls
        start += PAGE


def _feedback(db, uid: str, now_iso: str) -> tuple[list[dict], list[dict]]:
    """New feedback since the last inbox (then marked sent), and all feedback ever as preferences."""
    cols = "id,url,company,title,location,stage,reason,feedback,feedback_note,feedback_at,feedback_sent_at"
    rows = (db.table(TABLE).select(cols).eq("user_id", uid).not_.is_("feedback", "null")
            .order("feedback_at").execute().data) or []
    fresh = [r for r in rows if not r.get("feedback_sent_at")]
    feedback = [{"url": r["url"], "company": r["company"], "title": r["title"], "location": r["location"],
                 "stage": r["stage"], "reason": r["reason"], "feedback": r["feedback"],
                 "note": r.get("feedback_note") or "", "feedback_at": r.get("feedback_at")} for r in fresh]
    prefs = [{"url": r["url"], "company": r["company"], "title": r["title"], "feedback": r["feedback"],
              "note": r.get("feedback_note") or ""} for r in rows]
    ids = [r["id"] for r in fresh]
    for i in range(0, len(ids), URL_CHUNK):
        db.table(TABLE).update({"feedback_sent_at": now_iso}).in_("id", ids[i:i + URL_CHUNK]).execute()
    return feedback, prefs


def _tracker(db, uid: str) -> list[dict]:
    """Every role in the tracker (status not null), so the agent can dedupe without Notion."""
    rows = (db.table(TABLE).select("url,company,title,status").eq("user_id", uid)
            .not_.is_("status", "null").range(0, 4999).execute().data) or []
    return [{"url": r["url"], "company": r["company"], "title": r["title"], "status": r["status"]} for r in rows]


def cmd_collect(a) -> int:
    cfg = json.loads(Path(a.config).read_text())
    day = a.date or today_local().isoformat()
    now_iso = _now()
    fetched = js.fetch_all(cfg)
    if fetched["errors"] and len(fetched["errors"]) == len(cfg["companies"]):
        print(f"collect: every company failed ({len(fetched['errors'])}); first: {fetched['errors'][0]}", file=sys.stderr)
        return 2

    if a.dry_run:
        plan = js.plan_collect(fetched["kept"], fetched["prefiltered"], set(), day)
        feedback, prefs, tracker = [], [], []
    else:
        from _supabase import get_client, get_owner_user_id
        db, uid = get_client(), get_owner_user_id()
        plan = js.plan_collect(fetched["kept"], fetched["prefiltered"], _existing_urls(db, uid), day)
        rows = [{**r, "user_id": uid} for r in plan["inserts"]]
        for i in range(0, len(rows), BATCH):
            # ignore_duplicates: a row that appeared between the read and this write keeps its fields
            db.table(TABLE).upsert(rows[i:i + BATCH], on_conflict="user_id,url", ignore_duplicates=True).execute()
        seen = plan["seen_again"]
        for i in range(0, len(seen), URL_CHUNK):
            db.table(TABLE).update({"last_seen": day}).eq("user_id", uid).in_("url", seen[i:i + URL_CHUNK]).execute()
        feedback, prefs = _feedback(db, uid, now_iso)
        tracker = _tracker(db, uid)

    inbox = js.build_inbox(day, now_iso, fetched, plan, feedback, prefs, len(cfg["companies"]), tracker)
    Path(a.out).write_text(json.dumps(inbox, indent=1, ensure_ascii=False))
    s = inbox["stats"]
    print(f"collect {day}{' (dry run)' if a.dry_run else ''}: {s['companies_checked']} companies, "
          f"{len(s['errors'])} errors; kept {s['kept_total']} / prefiltered {s['prefiltered_total']}; "
          f"new kept {s['new_kept']} / new prefiltered {s['new_prefiltered']}; "
          f"seen again {len(plan['seen_again'])}; feedback {len(feedback)}; tracker {len(tracker)} -> {a.out}")
    for e in s["errors"]:
        print("ERR", e)
    return 0


def cmd_ingest(a) -> int:
    try:
        decisions = json.loads(Path(a.decisions).read_text())
        plan = js.plan_ingest(decisions, _now())
    except (OSError, json.JSONDecodeError, js.DecisionsError) as e:
        print(f"ingest: rejected {a.decisions}: {e}", file=sys.stderr)
        return 2

    from _supabase import get_client, get_owner_user_id
    db, uid = get_client(), get_owner_user_id()
    applied, promoted, missing = 0, 0, []
    for url, patch, promote in plan["updates"]:
        res = db.table(TABLE).update(patch).eq("user_id", uid).eq("url", url).execute()
        if not res.data:
            missing.append(url)
            continue
        applied += 1
        if promote:
            # Only where status is still null: never move a role Jason already acted on.
            res = (db.table(TABLE).update({"status": "to_apply"}).eq("user_id", uid).eq("url", url)
                   .is_("status", "null").execute())
            promoted += len(res.data or [])
    if plan["report"]:
        db.table(REPORTS).upsert({**plan["report"], "user_id": uid}, on_conflict="user_id,date").execute()
    print(f"ingest {decisions.get('date')}: {len(decisions['recommended'])} recommended, "
          f"{len(decisions['dropped'])} dropped, {len(decisions.get('feedback_processed') or [])} feedback; "
          f"applied {applied}/{len(plan['updates'])}, {promoted} added to tracker; "
          f"report {'stored' if plan['report'] else 'none'}"
          + (f"; {len(missing)} url(s) not in table" if missing else ""))
    for u in missing[:10]:
        print("MISSING", u)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect")
    c.add_argument("--config", required=True)
    c.add_argument("--out", required=True)
    c.add_argument("--date")
    c.add_argument("--dry-run", action="store_true")
    i = sub.add_parser("ingest")
    i.add_argument("decisions")
    a = p.parse_args(argv)
    return cmd_collect(a) if a.cmd == "collect" else cmd_ingest(a)


if __name__ == "__main__":
    sys.exit(main())
