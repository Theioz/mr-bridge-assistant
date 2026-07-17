#!/usr/bin/env python3
"""Mr. Bridge — coaching feedback loop.

Closes the loop that killed the May 2026 attempt: 15 workout plans were written
and the system never once responded to a logged session. This pushes real
numbers back at the user. No LLM involved — pure DB reads + ntfy, so it runs
on the zero-Anthropic self-hosted box (ADR 0017).

  --post-session   Mon/Wed/Sat 20:00 PT — did today's session get logged?
  --weekly         Sunday 18:00 PT — week in review + planning nudge.
"""
import argparse
import os
import subprocess
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir))
sys.path.insert(0, os.path.dirname(__file__))
from _supabase import get_client, get_owner_user_id  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
TZ = os.environ.get("USER_TIMEZONE", "America/Los_Angeles")
GOAL_LB = 140.0
SESSIONS_PER_WEEK = 3


def today_local():
    try:
        from zoneinfo import ZoneInfo
        from datetime import datetime
        return datetime.now(ZoneInfo(TZ)).date()
    except Exception:
        return date.today()


def notify(title, message, click=None):
    args = ["bash", os.path.join(REPO, "scripts", "notify.sh"),
            "--title", title, "--message", message]
    if click:
        args += ["--click-url", click]
    subprocess.run(args, cwd=REPO, check=False,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"[notify] {title} :: {message}")


def weight_avg(rows, start, end):
    """Mean weight over [start, end]. Real scale rows only."""
    vals = [r["weight_lb"] for r in rows
            if r.get("weight_lb") and start <= date.fromisoformat(r["date"]) <= end]
    return sum(vals) / len(vals) if vals else None


def post_session(c, uid, today):
    planned = c.table("workout_plans").select("name,status").eq("user_id", uid) \
        .eq("date", today.isoformat()).execute().data
    if not planned:
        print("no plan today; silent")
        return

    logged = c.table("strength_sessions").select("id,perceived_effort") \
        .eq("user_id", uid).eq("performed_on", today.isoformat()).execute().data

    wk = today - timedelta(days=6)
    done = c.table("strength_sessions").select("performed_on").eq("user_id", uid) \
        .gte("performed_on", wk.isoformat()).lte("performed_on", today.isoformat()) \
        .execute().data
    n = len({r["performed_on"] for r in done})

    if logged:
        effort = logged[0].get("perceived_effort")
        bits = [f"Session logged. {n}/{SESSIONS_PER_WEEK} this week."]
        if effort is None:
            bits.append("No effort score — log one, it's what drives next week's load.")
        elif effort >= 9:
            bits.append(f"Effort {effort}/10 — too hard. Next session drops a set.")
        elif effort >= 8:
            bits.append(f"Effort {effort}/10 — above target. Next session drops load 10%.")
        elif effort <= 4:
            bits.append(f"Effort {effort}/10 — too easy. We add load next session.")
        else:
            bits.append(f"Effort {effort}/10 — dead on target. This is the pace that sticks.")
        notify("Mr. Bridge — Logged", " ".join(bits))
        return

    # Missed. Count consecutive missed *planned* days.
    recent = c.table("workout_plans").select("date,status").eq("user_id", uid) \
        .lte("date", today.isoformat()).gte("date", (today - timedelta(days=21)).isoformat()) \
        .order("date", desc=True).execute().data
    sess = {r["performed_on"] for r in c.table("strength_sessions").select("performed_on")
            .eq("user_id", uid).gte("performed_on", (today - timedelta(days=21)).isoformat())
            .execute().data}
    miss = 0
    for p in recent:
        if p["date"] in sess:
            break
        miss += 1

    name = planned[0]["name"]
    if miss >= 3:
        msg = (f"3 planned sessions missed. Not a nag — a signal. The program is too much "
               f"as written; Sunday we cut it, not you.")
    elif miss == 2:
        msg = (f"2 missed in a row. Volume drops next session automatically. "
               f"Consistency beats intensity — that's the whole point.")
    else:
        msg = f"'{name}' wasn't logged. 13 sets, ~35 min, effort 6/10. Still counts if you do it late."
    notify("Mr. Bridge — Missed", msg, click=os.environ.get("APP_URL", "") + "/weekly")


def weekly(c, uid, today):
    wk_start = today - timedelta(days=6)
    prev_start, prev_end = today - timedelta(days=13), today - timedelta(days=7)

    fl = c.table("fitness_log").select("date,weight_lb,body_fat_pct").eq("user_id", uid) \
        .gte("date", prev_start.isoformat()).order("date").execute().data
    cur = weight_avg(fl, wk_start, today)
    prev = weight_avg(fl, prev_start, prev_end)

    done = c.table("strength_sessions").select("performed_on,perceived_effort") \
        .eq("user_id", uid).gte("performed_on", wk_start.isoformat()).execute().data
    n = len({r["performed_on"] for r in done})

    # Oura rows only — the google_health dupes carry total_sleep_hrs 0.0 and poison the mean.
    rec = c.table("recovery_metrics").select("readiness,total_sleep_hrs").eq("user_id", uid) \
        .gte("date", wk_start.isoformat()).gt("total_sleep_hrs", 0).execute().data
    rd = [r["readiness"] for r in rec if r.get("readiness")]
    sl = [r["total_sleep_hrs"] for r in rec if r.get("total_sleep_hrs")]

    lines = [f"Training: {n}/{SESSIONS_PER_WEEK}."]
    if cur:
        lines.append(f"Weight 7d avg: {cur:.1f} lb ({cur - GOAL_LB:+.1f} to goal).")
        if prev:
            d = cur - prev
            verdict = "on pace" if -1.2 <= d <= -0.4 else ("stalled" if abs(d) < 0.4 else
                      ("fast — check protein" if d < 0 else "up"))
            lines.append(f"vs prior week: {d:+.1f} lb — {verdict}.")
    if rd:
        lines.append(f"Readiness avg {sum(rd)/len(rd):.0f}.")
    if sl:
        lines.append(f"Sleep avg {sum(sl)/len(sl):.1f}h.")
    lines.append("Open Claude Code — what's in the fridge and what's on sale?")

    notify("Mr. Bridge — Weekly Planning", " ".join(lines),
           click=os.environ.get("APP_URL", "") + "/weekly")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--post-session", action="store_true")
    ap.add_argument("--weekly", action="store_true")
    a = ap.parse_args()

    c, uid, t = get_client(), get_owner_user_id(), today_local()
    if a.weekly:
        weekly(c, uid, t)
    elif a.post_session:
        post_session(c, uid, t)
    else:
        ap.error("pass --post-session or --weekly")


if __name__ == "__main__":
    main()
