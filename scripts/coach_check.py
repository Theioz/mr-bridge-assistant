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
# Beyond this gap, two sessions are not comparable — the later one is a re-entry
# deload, not a performance drop.
REGRESSION_MAX_GAP_DAYS = 14


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


def programmed_sessions(c, uid, start, end=None, select="performed_on"):
    """Sessions belonging to a PROGRAMMED workout — `workout_plan_id` is not null.

    Walk pull-ups are logged as `strength_sessions` too, because that is the only place
    set-level data lives, but they carry a null `workout_plan_id`. The goal is a set of
    pull-ups on every walk, so these arrive most days and would swamp every count here.

    Counting them inflates "n/3 this week", but the damage is worse than a wrong number:
    the missed-session check tests `plan_date in {performed_on}`, so a walk on a lifting
    day made a skipped session look completed and the nudge never fired. Filtering at the
    query is what keeps that honest.

    Verified against real data: every programmed session on record carries a plan id; only
    the walk pull-ups are null. If a future session logs without one, it silently stops
    counting — the fix then belongs in whatever wrote it, not in a looser filter here.
    """
    q = (c.table("strength_sessions").select(select).eq("user_id", uid)
         .not_.is_("workout_plan_id", "null")
         .gte("performed_on", start if isinstance(start, str) else start.isoformat()))
    if end is not None:
        q = q.lte("performed_on", end if isinstance(end, str) else end.isoformat())
    return q.execute().data


def weight_avg(rows, start, end):
    """Mean weight over [start, end]. Real scale rows only."""
    vals = [r["weight_lb"] for r in rows
            if r.get("weight_lb") and start <= date.fromisoformat(r["date"]) <= end]
    return sum(vals) / len(vals) if vals else None


def top_sets(c, session_ids):
    """Best set per exercise per session, keyed {session_id: {exercise: weight*reps}}."""
    if not session_ids:
        return {}
    rows = c.table("strength_session_sets") \
        .select("session_id,exercise_name,weight_kg,reps") \
        .in_("session_id", session_ids).execute().data
    out: dict = {}
    for r in rows:
        load = (r.get("weight_kg") or 0) * (r.get("reps") or 0)
        by_ex = out.setdefault(r["session_id"], {})
        if load > by_ex.get(r["exercise_name"], 0):
            by_ex[r["exercise_name"]] = load
    return out


def regressions(c, uid, today):
    """Exercises whose best set fell vs the previous session that also trained them.

    This is the sound autoregulation trigger. Reducing load because a *set felt hard*
    penalises the productive zone (1-3 RIR); reducing it because performance actually
    dropped across sessions is a real fatigue signal.
    """
    # Programmed sessions only. Comparing against walk pull-ups would consume both
    # comparison slots on most days — pull-ups share no exercises with a lifting session,
    # so it returns nothing and a real regression is never seen.
    recent = sorted(
        programmed_sessions(c, uid, "2000-01-01", today, select="id,performed_on"),
        key=lambda r: r["performed_on"], reverse=True,
    )[:2]
    if len(recent) < 2:
        return []

    # Only compare against a genuinely recent session. Across a layoff the previous
    # session is at pre-layoff loads, so every exercise reads as a "regression" when
    # it is really a deliberate re-entry deload. Testing this against real data flagged
    # DB Single-Arm Row by comparing 2026-07-17 against 2026-05-06.
    gap = (date.fromisoformat(recent[0]["performed_on"])
           - date.fromisoformat(recent[1]["performed_on"])).days
    if gap > REGRESSION_MAX_GAP_DAYS:
        return []
    loads = top_sets(c, [r["id"] for r in recent])
    cur, prev = loads.get(recent[0]["id"], {}), loads.get(recent[1]["id"], {})
    return [ex for ex, v in cur.items() if ex in prev and prev[ex] > 0 and v < prev[ex] * 0.95]


def post_session(c, uid, today):
    planned = c.table("workout_plans").select("name,status").eq("user_id", uid) \
        .eq("date", today.isoformat()).execute().data
    if not planned:
        print("no plan today; silent")
        return

    logged = programmed_sessions(c, uid, today, today, select="id,perceived_effort,notes")

    wk = today - timedelta(days=6)
    done = programmed_sessions(c, uid, wk, today)
    n = len({r["performed_on"] for r in done})

    if logged:
        effort = logged[0].get("perceived_effort")
        note = (logged[0].get("notes") or "").strip()
        bits = [f"Session logged. {n}/{SESSIONS_PER_WEEK} this week."]

        # Effort bands target 1-3 RIR on the last set of each exercise. The old bands
        # treated 8-9 as a fault and cut load — that is the productive zone, and at a
        # 25 lb dumbbell ceiling stopping short of it leaves the set near-unstimulating
        # (proximity to failure matters MORE at light loads). 10 still means back off.
        if effort is None:
            bits.append("No effort score — log one, it's what tunes next session.")
        elif effort >= 10:
            bits.append(f"Effort {effort}/10 — couldn't finish. That's a load problem, not you. Next session backs off.")
        elif effort >= 7:
            bits.append(f"Effort {effort}/10 — on target (1-3 reps left in the tank). Hold here.")
        elif effort >= 6:
            bits.append(f"Effort {effort}/10 — fine for re-entry, light for growth. Add reps before load.")
        else:
            bits.append(f"Effort {effort}/10 — under target. Add reps or load next session.")

        # Performance, not felt-effort, is what triggers a reduction.
        reg = regressions(c, uid, today)
        if reg:
            bits.append(f"Down vs last session: {', '.join(reg[:3])}. Two in a row = back off.")

        # THE POINT OF THIS SCRIPT. In May he wrote thoughtful notes and the system
        # never answered; the loop decayed on schedule. Quoting it back is the minimum
        # acknowledgement that the note was received by something.
        if note:
            snippet = note if len(note) <= 90 else note[:87] + "..."
            bits.append(f'Your note: "{snippet}" — logged, and it shapes the next plan.')
        else:
            bits.append("No note this time — a line on how it felt is what the next plan reads.")

        notify("Mr. Bridge — Logged", " ".join(bits))
        return

    # Missed. Count consecutive missed *planned* days.
    recent = c.table("workout_plans").select("date,status").eq("user_id", uid) \
        .lte("date", today.isoformat()).gte("date", (today - timedelta(days=21)).isoformat()) \
        .order("date", desc=True).execute().data
    # Programmed only. A walk on a lifting day used to satisfy this test, so a skipped
    # session read as completed and `miss` never left 0 — the nudge silently died.
    sess = {r["performed_on"]
            for r in programmed_sessions(c, uid, today - timedelta(days=21), today)}
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
        # Was "Volume drops next session automatically." Nothing in this repo drops
        # volume — no code path writes workout_plans from here. Promising an automatic
        # correction that never arrives is the same broken promise as an unanswered note.
        msg = (f"2 missed in a row. Next session is cut to 3 exercises — open Claude Code and "
               f"it gets rewritten smaller. Consistency beats intensity.")
    else:
        msg = f"'{name}' wasn't logged. 13 sets, ~35 min, last set of each to 1-3 reps in reserve. Still counts if you do it late."
    notify("Mr. Bridge — Missed", msg, click=os.environ.get("APP_URL", "") + "/weekly")


def weekly(c, uid, today):
    wk_start = today - timedelta(days=6)
    prev_start, prev_end = today - timedelta(days=13), today - timedelta(days=7)

    fl = c.table("fitness_log").select("date,weight_lb,body_fat_pct").eq("user_id", uid) \
        .gte("date", prev_start.isoformat()).order("date").execute().data
    cur = weight_avg(fl, wk_start, today)
    prev = weight_avg(fl, prev_start, prev_end)

    done = programmed_sessions(c, uid, wk_start, select="performed_on,perceived_effort")
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
