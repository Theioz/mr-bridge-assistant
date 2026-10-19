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
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir))
sys.path.insert(0, os.path.dirname(__file__))
from _dates import today_local  # noqa: E402
# NOTE: `_supabase` (and its `dotenv` dep) is imported lazily in main(), NOT here — so this
# module stays importable on a bare interpreter and the pure helpers below (consecutive_misses)
# can be unit-tested without pip installs. Same reason weekly_plan.py keeps its top imports stdlib.

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
# Fallbacks only. The goal and the session count live in `profile` (weight_goal_lbs,
# workout_days_per_week) — they were hardcoded here, so a changed goal in Settings never
# reached the push that reports against it.
GOAL_LB = 140.0
SESSIONS_PER_WEEK = 3
# Weeks of history the "limits broken N of the last 4 weeks" check reads.
OVER_CAP_LOOKBACK_WEEKS = 4
# Beyond this gap, two sessions are not comparable — the later one is a re-entry
# deload, not a performance drop.
REGRESSION_MAX_GAP_DAYS = 14


def notify(title, message, click=None):
    # Raises PushError when ntfy refuses the message, so a nudge that never left fails the run
    # instead of exiting 0 (the old subprocess call ran with check=False and DEVNULL).
    sys.path.insert(0, os.path.join(REPO, "scripts"))
    from _push import push

    push(title, message, type_="coach", click_url=click or None)
    print(f"[notify] {title} :: {message}")


def load_profile(c, uid):
    return {r["key"]: r["value"] for r in
            c.table("profile").select("key,value").eq("user_id", uid).execute().data}


def sessions_target(profile):
    try:
        return int(float(profile.get("workout_days_per_week") or SESSIONS_PER_WEEK))
    except ValueError:
        return SESSIONS_PER_WEEK


def days_away(c, uid, start, end):
    """Local days in [start, end] covered by a "Stay at ..." calendar event. Empty on any failure:
    travel mode softens the loop, it must never be the reason the loop doesn't run."""
    from datetime import datetime

    from _dates import user_tz
    from _google import access_token, all_events
    from _travel import stay_days

    try:
        tz = user_tz()
        lo = datetime(start.year, start.month, start.day, tzinfo=tz)
        hi = datetime(end.year, end.month, end.day, tzinfo=tz) + timedelta(days=1)
        token = access_token(c, uid)
        events = [e for _cal, e in all_events(token, lo.isoformat(), hi.isoformat())]
        return stay_days(events, start, end, tz)
    except Exception as e:  # noqa: BLE001
        print(f"[coach_check] travel lookup skipped: {e}", file=sys.stderr)
        return set()


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


def consecutive_misses(recent, session_dates):
    """Count consecutive missed sessions, most-recent day first.

    `recent`: workout_plans rows ordered by date DESC, each `{"date", "status"}`.
    `session_dates`: set of `performed_on` for logged PROGRAMMED sessions.

    A miss is a **`planned` day with no logged session**. This deliberately reads `status`:
    a `cancelled` or `skipped` day is a chosen rest, and a `completed` day is done — none of
    them are misses, so they are skipped, not counted. A logged session ends the streak.

    Why this cares about status: the escalation off this number is real (2 misses cuts volume,
    3 says the program is wrong, not the user). Before #666 the app never set
    `workout_plans.status`, so this loop keyed off session-existence alone and a deliberate rest
    read as a miss — inflating the streak and firing a false "the program is too much" nudge.
    That mis-read is the same open-loop defect that killed the May coaching attempt (see the
    module docstring), which is why the rule lives here in code now instead of in a runbook: a
    rest day must never be able to masquerade as a failure to train.
    """
    miss = 0
    for p in recent:
        if p["date"] in session_dates:
            break
        if p.get("status") != "planned":
            continue
        miss += 1
    return miss


def post_session(c, uid, today):
    planned = c.table("workout_plans").select("name,status").eq("user_id", uid) \
        .eq("date", today.isoformat()).execute().data
    if not planned:
        print("no plan today; silent")
        return

    logged = programmed_sessions(c, uid, today, today, select="id,perceived_effort,notes")
    target = sessions_target(load_profile(c, uid))

    wk = today - timedelta(days=6)
    done = programmed_sessions(c, uid, wk, today)
    n = len({r["performed_on"] for r in done})

    if logged:
        effort = logged[0].get("perceived_effort")
        note = (logged[0].get("notes") or "").strip()
        bits = [f"Session logged. {n}/{target} this week."]

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

    # Missed — unless he's away. Travel mode makes training optional (two 20-min hotel sessions
    # at most), so an unlogged lift on a trip is the plan working, not a miss. Nudging it would
    # be the planner prescribing leg day to someone in another timezone.
    if today in days_away(c, uid, today, today):
        print("traveling; miss not counted")
        return

    # Count consecutive missed *planned* days.
    recent = c.table("workout_plans").select("date,status").eq("user_id", uid) \
        .lte("date", today.isoformat()).gte("date", (today - timedelta(days=21)).isoformat()) \
        .order("date", desc=True).execute().data
    # Programmed only. A walk on a lifting day used to satisfy this test, so a skipped
    # session read as completed and `miss` never left 0 — the nudge silently died.
    sess = {r["performed_on"]
            for r in programmed_sessions(c, uid, today - timedelta(days=21), today)}
    miss = consecutive_misses(recent, sess)

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
        msg = f"'{name}' wasn't logged. ~35-40 min, last set of each to 1-3 reps in reserve. Still counts if you do it late."
    notify("Mr. Bridge — Missed", msg, click=os.environ.get("APP_URL", "") + "/weekly")


def weekly(c, uid, today):
    """Sunday scorecard: plain numbers for the week, against the program's own limits.

    The arithmetic lives in _scorecard.py (stdlib, unit-tested, twin of the /weekly panel);
    this function only fetches rows. History is read back OVER_CAP_LOOKBACK_WEEKS so the push
    can state the pre-agreed signal — limits broken 3 of the last 4 weeks — when it holds.
    """
    from _scorecard import compute, over_cap, render
    from _travel import excluded_weigh_ins

    profile = load_profile(c, uid)
    profile.setdefault("weight_goal_lbs", str(GOAL_LB))
    hist_start = today - timedelta(days=7 * OVER_CAP_LOOKBACK_WEEKS - 1)
    # The projection reads 28 days of weigh-ins; the prior-week mean reads 14. Fetch the wider.
    since = min(hist_start, today - timedelta(days=27)).isoformat()

    fl = c.table("fitness_log").select("date,weight_lb").eq("user_id", uid) \
        .gte("date", since).order("date").execute().data
    sess = programmed_sessions(c, uid, hist_start, today)
    # Oura rows only — the google_health dupes carry total_sleep_hrs 0.0 and poison the mean.
    rec = c.table("recovery_metrics").select("date,steps,readiness,total_sleep_hrs").eq("user_id", uid) \
        .gte("date", hist_start.isoformat()).execute().data
    meals = c.table("meal_log").select("date,calories,protein_g,standard_drinks,origin") \
        .eq("user_id", uid).gte("date", hist_start.isoformat()).execute().data
    plans = c.table("meal_plans").select("date,is_cheat").eq("user_id", uid) \
        .gte("date", hist_start.isoformat()).execute().data
    excluded = excluded_weigh_ins(days_away(c, uid, date.fromisoformat(since), today))

    card = compute(today, profile, fl, sess, rec, meals, plans, excluded)
    # Limits checked per prior week with the same rules. Weeks with no meal rows at all are
    # skipped rather than counted as clean — an empty week is missing data, not a dry one.
    broken = checked = 0
    for w in range(OVER_CAP_LOOKBACK_WEEKS):
        end = today - timedelta(days=7 * w)
        wk = compute(end, profile, fl, sess, rec, meals, plans, excluded)
        if wk["days_logged"]:
            checked += 1
            broken += over_cap(wk)
    has_limits = any(card[k] is not None for k in ("cap", "dry_min", "per_occasion"))

    lines = render(card, broken if has_limits and checked == OVER_CAP_LOOKBACK_WEEKS else None,
                   OVER_CAP_LOOKBACK_WEEKS)
    healthy = [r for r in rec if (r.get("total_sleep_hrs") or 0) > 0
               and date.fromisoformat(r["date"]) >= today - timedelta(days=6)]
    rd = [r["readiness"] for r in healthy if r.get("readiness")]
    sl = [r["total_sleep_hrs"] for r in healthy]
    if rd:
        lines.append(f"Readiness avg {sum(rd)/len(rd):.0f}.")
    if sl:
        lines.append(f"Sleep avg {sum(sl)/len(sl):.1f}h.")
    if excluded & {today - timedelta(days=i) for i in range(7)}:
        lines.append("Trip weigh-ins excluded from the weight numbers.")
    lines.append("Open Claude Code — what's in the fridge and what's on sale?")

    notify("Mr. Bridge — Weekly Scorecard", " ".join(lines),
           click=os.environ.get("APP_URL", "") + "/weekly")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--post-session", action="store_true")
    ap.add_argument("--weekly", action="store_true")
    a = ap.parse_args()

    from _supabase import get_client, get_owner_user_id  # lazy — see top-of-file note

    c, uid, t = get_client(), get_owner_user_id(), today_local()
    if a.weekly:
        weekly(c, uid, t)
    elif a.post_session:
        post_session(c, uid, t)
    else:
        ap.error("pass --post-session or --weekly")


if __name__ == "__main__":
    from _joblog import job

    with job("cron:coach_check"):
        main()
