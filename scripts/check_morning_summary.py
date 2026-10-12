#!/usr/bin/env python3
"""
One morning push: weather, last night's recovery, today's workout, today's planned meals and
due tasks.

Replaces three scripts that were scheduled nowhere (check_weather_alert.py, check_hrv_alert.py,
check_daily_alerts.py). Their alert logic survives as flagged lines here, so a storm or an HRV
drop still says so — inside the one push the user actually reads, instead of as separate pings.

compose() is pure (no I/O) so the wording and thresholds are unit-tested; main() gathers the
data. Any part that cannot be loaded says so in its own line rather than failing the push — a
summary with "weather unavailable" is more useful than no summary — but if NOTHING loads the
run fails, because that is a broken job, not a quiet morning.
"""
from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from _dates import today_local  # noqa: E402

# Weather alert thresholds (carried over from check_weather_alert.py).
PRECIP_IN = 0.2
HIGH_F = 95.0
LOW_F = 28.0
WIND_MPH = 30.0
DEFAULT_HRV_DROP_PCT = 20.0  # carried over from check_hrv_alert.py; profile key hrv_alert_threshold
DRY_RUN = "--dry-run" in sys.argv  # print what would be sent; no push, no heartbeat
MEAL_ORDER = {"breakfast": 0, "lunch": 1, "snack": 2, "dinner": 3}


def weather_line(w: dict | None) -> str:
    if not w:
        return "Weather: unavailable"
    def f(v):
        return "—" if v is None else f"{round(v)}°F"
    line = f"{f(w.get('temp'))} {w.get('condition', '')}, high {f(w.get('high'))} / low {f(w.get('low'))}"
    if w.get("location"):
        line += f" ({w['location']})"
    flags = []
    code = w.get("wmo_code")
    if code is not None and 95 <= code <= 99:
        flags.append("thunderstorms")
    if (w.get("precip_in") or 0) > PRECIP_IN:
        flags.append(f'{w["precip_in"]:.1f}" rain')
    if w.get("high") is not None and w["high"] > HIGH_F:
        flags.append("extreme heat")
    if w.get("low") is not None and w["low"] < LOW_F:
        flags.append("freezing low")
    if (w.get("wind_mph") or 0) > WIND_MPH:
        flags.append(f"wind {round(w['wind_mph'])} mph")
    return line + (f" — {', '.join(flags)}" if flags else "")


def recovery_line(rows: list[dict], hrv_drop_pct: float = DEFAULT_HRV_DROP_PCT) -> str:
    """rows: recovery_metrics, newest first. Oura lags a day, so the newest row IS last night."""
    if not rows:
        return "Recovery: no data"
    latest = rows[0]
    parts = []
    if latest.get("readiness") is not None:
        parts.append(f"readiness {latest['readiness']}")
    if latest.get("sleep_score") is not None:
        parts.append(f"sleep {latest['sleep_score']}")
    if latest.get("avg_hrv") is not None:
        parts.append(f"HRV {round(latest['avg_hrv'])} ms")
    line = "Recovery: " + (" · ".join(parts) if parts else "no scores")
    baseline = [r["avg_hrv"] for r in rows[1:8] if r.get("avg_hrv") is not None]
    if latest.get("avg_hrv") is not None and len(baseline) >= 3:
        base = sum(baseline) / len(baseline)
        drop = (base - latest["avg_hrv"]) / base * 100 if base else 0
        if drop > hrv_drop_pct:
            line += f" — HRV {round(drop)}% below your 7-day baseline, go easy"
    return line


def compose(
    today: date,
    weather: dict | None,
    recovery: list[dict],
    workouts: list[dict],
    meals: list[dict],
    tasks_due: int,
    hrv_drop_pct: float = DEFAULT_HRV_DROP_PCT,
) -> tuple[str, str]:
    lines = [weather_line(weather), recovery_line(recovery, hrv_drop_pct)]
    active = [w for w in workouts if w.get("status") != "cancelled"]
    lines.append("Workout: " + (", ".join(w.get("name") or "planned session" for w in active) if active else "rest day"))
    planned = sorted(
        (m for m in meals if m.get("status") == "planned"),
        key=lambda m: MEAL_ORDER.get(m.get("meal_type", ""), 9),
    )
    if planned:
        lines.append("Meals: " + "; ".join(f"{m.get('meal_type', 'meal')} {m.get('label') or 'planned'}" for m in planned))
    else:
        lines.append("Meals: nothing planned")
    if tasks_due:
        lines.append(f"Tasks: {tasks_due} due or overdue")
    return f"Today · {today.strftime('%a %b %-d')}", "\n".join(lines)


def main() -> int:
    from fetch_weather import fetch_weather
    from _push import push
    from _supabase import get_client, get_owner_user_id

    client = get_client()
    uid = get_owner_user_id()
    today = today_local()
    iso = today.isoformat()
    loaded = 0

    try:
        weather = fetch_weather(client=client, owner_user_id=uid)
        loaded += 1
    except Exception as e:  # noqa: BLE001
        print(f"[morning_summary] weather failed: {e}", file=sys.stderr)
        weather = None

    def q(fn, label):
        nonlocal loaded
        try:
            out = fn()
            loaded += 1
            return out
        except Exception as e:  # noqa: BLE001 — one missing section must not kill the summary
            print(f"[morning_summary] {label} failed: {e}", file=sys.stderr)
            return None

    recovery = q(lambda: client.table("recovery_metrics").select("date, readiness, sleep_score, avg_hrv")
                 .eq("user_id", uid).gte("date", (today - timedelta(days=9)).isoformat())
                 .order("date", desc=True).execute().data, "recovery") or []
    workouts = q(lambda: client.table("workout_plans").select("name, status")
                 .eq("user_id", uid).eq("date", iso).execute().data, "workouts") or []
    meal_rows = q(lambda: client.table("meal_plans").select("meal_type, status, name, recipes(name), cooks(name)")
                  .eq("user_id", uid).eq("date", iso).execute().data, "meals") or []
    meals = [{**m, "label": m.get("name") or (m.get("recipes") or {}).get("name") or (m.get("cooks") or {}).get("name")}
             for m in meal_rows]
    due = q(lambda: client.table("tasks").select("id", count="exact").eq("user_id", uid)
            .eq("status", "active").lte("due_date", iso).execute().count, "tasks") or 0
    threshold_rows = q(lambda: client.table("profile").select("value").eq("user_id", uid)
                       .eq("key", "hrv_alert_threshold").execute().data, "profile") or []
    try:
        threshold = float(threshold_rows[0]["value"]) if threshold_rows else DEFAULT_HRV_DROP_PCT
    except (TypeError, ValueError):
        threshold = DEFAULT_HRV_DROP_PCT

    if loaded == 0:
        raise RuntimeError("no section of the morning summary could be loaded")

    title, body = compose(today, weather, recovery, workouts, meals, due, threshold)
    if DRY_RUN:
        print(f"[dry-run] {title}\n{body}")
        return 0
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    push(title, body, type_="morning_summary", click_url=f"{app_url}/dashboard" if app_url else None,
         client=client, user_id=uid)
    print(f"[morning_summary] sent: {title}")
    return 0


if __name__ == "__main__":
    if DRY_RUN:
        sys.exit(main())
    from _joblog import job

    with job("cron:morning_summary"):
        sys.exit(main())
