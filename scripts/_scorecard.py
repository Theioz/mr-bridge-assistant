"""
Weekly scorecard: the plain-numbers week in review that `coach_check.py --weekly` pushes.

Python twin of web/src/lib/scorecard.ts — the /weekly panel and the Sunday push must report the
same numbers, so the definitions live in both places and are pinned by tests on both sides
(tests/test_scorecard.py, web/src/__tests__/scorecard.test.ts). Change one, change the other.

Pure and stdlib-only (no I/O): the caller fetches rows and passes them in, so the bare-interpreter
unittest job can exercise every rule without Supabase.

Why each number is here:
- Alcohol is reported as STANDARD DRINKS, not calories. Calories understate it and make it read as
  a diet problem; the moderation targets are written in drinks.
- The alcohol share of the deficit separates "the cooking is off" from "the deficit is being
  drunk" — two stalls that look identical on the scale and need opposite fixes. It is only
  computed when at least 5 days were logged; a share over a half-logged week is noise presented
  as a finding.
- Unlogged days count as dry. That is stated on the output, not hidden: drinks are reported
  honestly and in full, so an unlogged day is far more often a dry day than a hidden one.
"""
from __future__ import annotations

from datetime import date, timedelta

DEFAULTS = {
    "steps_goal": 10000.0,
    "target_rate_lb_wk": 0.75,
    "tdee_estimate": 2350.0,
    "workout_days_per_week": 3.0,
}
MIN_LOGGED_DAYS_FOR_SHARE = 5
MIN_READINGS_FOR_PROJECTION = 6
PROJECTION_WINDOW_DAYS = 28


def _num(profile: dict, key: str) -> float | None:
    raw = profile.get(key)
    if raw in (None, ""):
        return DEFAULTS.get(key)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return DEFAULTS.get(key)


def _d(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def _in(day: date, start: date, end: date) -> bool:
    return start <= day <= end


def _mean(vals: list[float]) -> float | None:
    return sum(vals) / len(vals) if vals else None


def weight_mean(fitness_rows: list[dict], start: date, end: date, excluded: set[date] = frozenset()) -> float | None:
    return _mean([float(r["weight_lb"]) for r in fitness_rows
                  if r.get("weight_lb") is not None and _in(_d(r["date"]), start, end)
                  and _d(r["date"]) not in excluded])


def projected_landing(fitness_rows: list[dict], today: date, current: float | None, goal: float | None,
                      excluded: set[date] = frozenset()) -> date | None:
    """Least-squares slope over the last 28 days of readings; None unless it trends down."""
    if current is None or goal is None:
        return None
    start = today - timedelta(days=PROJECTION_WINDOW_DAYS - 1)
    pts = [((_d(r["date"]) - start).days, float(r["weight_lb"])) for r in fitness_rows
           if r.get("weight_lb") is not None and _in(_d(r["date"]), start, today)
           and _d(r["date"]) not in excluded]
    if len(pts) < MIN_READINGS_FOR_PROJECTION:
        return None
    n = len(pts)
    mx = sum(x for x, _ in pts) / n
    my = sum(y for _, y in pts) / n
    var = sum((x - mx) ** 2 for x, _ in pts)
    if var == 0:
        return None
    slope = sum((x - mx) * (y - my) for x, y in pts) / var  # lb/day
    if slope >= 0:
        return None
    if current <= goal:
        return today
    return today + timedelta(days=round((current - goal) / -slope))


def compute(today: date, profile: dict, fitness_rows: list[dict], sessions: list[dict],
            recovery_rows: list[dict], meal_rows: list[dict], plan_rows: list[dict],
            excluded_weigh_ins: set[date] = frozenset()) -> dict:
    """All rows are raw table rows. `sessions` must already be PROGRAMMED sessions only
    (workout_plan_id not null) — see coach_check.programmed_sessions for why."""
    start, prev_start, prev_end = today - timedelta(days=6), today - timedelta(days=13), today - timedelta(days=7)

    weight7 = weight_mean(fitness_rows, start, today, excluded_weigh_ins)
    prev7 = weight_mean(fitness_rows, prev_start, prev_end, excluded_weigh_ins)
    goal = _num(profile, "weight_goal_lbs")

    expected = None
    if profile.get("phase_start_date") and _num(profile, "phase_start_weight") is not None:
        weeks = (today - _d(profile["phase_start_date"])).days / 7
        expected = _num(profile, "phase_start_weight") - _num(profile, "target_rate_lb_wk") * weeks

    sessions_done = len({_d(s["performed_on"]) for s in sessions if _in(_d(s["performed_on"]), start, today)})

    steps_by_day: dict[date, float] = {}
    for r in recovery_rows:
        d = _d(r["date"])
        if r.get("steps") is not None and _in(d, start, today):
            steps_by_day[d] = max(steps_by_day.get(d, 0), float(r["steps"]))
    steps_goal = _num(profile, "steps_goal")
    steps_days = sum(1 for v in steps_by_day.values() if v >= steps_goal)

    kcal_by_day: dict[date, float] = {}
    protein_by_day: dict[date, float] = {}
    food_only_kcal = 0.0
    drinks_by_day: dict[date, float] = {}
    alcohol_kcal = 0.0
    delivery_n, delivery_kcal = 0, 0.0
    for r in meal_rows:
        d = _d(r["date"])
        if not _in(d, start, today):
            continue
        kcal = float(r.get("calories") or 0)
        kcal_by_day[d] = kcal_by_day.get(d, 0) + kcal
        protein_by_day[d] = protein_by_day.get(d, 0) + float(r.get("protein_g") or 0)
        drinks = float(r.get("standard_drinks") or 0)
        if drinks > 0:
            drinks_by_day[d] = drinks_by_day.get(d, 0) + drinks
            alcohol_kcal += kcal
        else:
            food_only_kcal += kcal
        if r.get("origin") == "delivery":
            delivery_n += 1
            delivery_kcal += kcal
    days_logged = len(kcal_by_day)

    tdee = _num(profile, "tdee_estimate")
    food_deficit = (7 * tdee - food_only_kcal) if days_logged >= MIN_LOGGED_DAYS_FOR_SHARE else None
    alcohol_share = (alcohol_kcal / food_deficit * 100) if food_deficit and food_deficit > 0 else None

    total_drinks = round(sum(drinks_by_day.values()), 1)
    drinking_days = sum(1 for v in drinks_by_day.values() if v > 0)
    dry_days = 7 - drinking_days
    max_day = round(max(drinks_by_day.values()), 1) if drinks_by_day else 0.0

    cap, dry_min, per_occ = (_num(profile, k) for k in
                             ("alcohol_weekly_cap", "alcohol_dry_days_min", "alcohol_max_per_occasion"))
    breaches = []
    if cap is not None and total_drinks > cap:
        breaches.append("weekly cap")
    if dry_min is not None and dry_days < dry_min:
        breaches.append("dry days")
    if per_occ is not None and max_day > per_occ:
        breaches.append("per occasion")

    return {
        "weight7": weight7, "prev7": prev7,
        "delta": (weight7 - prev7) if weight7 is not None and prev7 is not None else None,
        "goal": goal, "expected": expected,
        "landing": projected_landing(fitness_rows, today, weight7, goal, excluded_weigh_ins),
        "sessions": sessions_done, "sessions_target": int(_num(profile, "workout_days_per_week")),
        "steps_days": steps_days, "steps_goal": int(steps_goal),
        "days_logged": days_logged,
        "avg_kcal": _mean(list(kcal_by_day.values())),
        "avg_protein": _mean(list(protein_by_day.values())),
        "cheat_meals": sum(1 for p in plan_rows if p.get("is_cheat") and _in(_d(p["date"]), start, today)),
        "delivery_n": delivery_n, "delivery_kcal": round(delivery_kcal),
        "drinks": total_drinks, "drinking_days": drinking_days, "dry_days": dry_days, "max_day": max_day,
        "alcohol_kcal": round(alcohol_kcal), "alcohol_share_pct": alcohol_share,
        "cap": cap, "dry_min": dry_min, "per_occasion": per_occ,
        "breaches": breaches,
    }


def over_cap(card: dict) -> bool:
    return bool(card["breaches"])


def render(card: dict, over_cap_weeks: int | None = None, weeks_checked: int = 4) -> list[str]:
    """Plain lines for the push. No motivational framing — numbers and the rule they're against."""
    out = []
    if card["weight7"] is not None:
        s = f"Weight 7d avg {card['weight7']:.1f} lb"
        if card["delta"] is not None:
            s += f" ({card['delta']:+.1f} vs prior wk)"
        if card["expected"] is not None:
            s += f", plan line {card['expected']:.1f}"
        out.append(s + ".")
    if card["landing"]:
        out.append(f"At the 4-wk trend: {card['goal']:.0f} lb by {card['landing'].isoformat()}.")
    elif card["weight7"] is not None:
        out.append("4-wk trend not downward — no landing date.")
    out.append(f"Lifts {card['sessions']}/{card['sessions_target']}. Steps {card['steps_goal']:,}+ on "
               f"{card['steps_days']}/7 days.")
    if card["days_logged"]:
        out.append(f"Food ({card['days_logged']}/7 days logged): avg {card['avg_kcal']:.0f} kcal, "
                   f"{card['avg_protein']:.0f} g protein. Cheat meals {card['cheat_meals']}. "
                   f"Delivery {card['delivery_n']} ({card['delivery_kcal']} kcal).")
    drink = f"Alcohol: {card['drinks']:g} drinks"
    if card["cap"] is not None:
        drink += f" / cap {card['cap']:g}"
    drink += f", dry days {card['dry_days']}"
    if card["dry_min"] is not None:
        drink += f" / min {card['dry_min']:g}"
    drink += f", max in a day {card['max_day']:g}"
    if card["per_occasion"] is not None:
        drink += f" / limit {card['per_occasion']:g}"
    drink += " (unlogged days count as dry)."
    out.append(drink)
    if card["alcohol_share_pct"] is not None and card["alcohol_kcal"]:
        out.append(f"Alcohol {card['alcohol_kcal']} kcal = {card['alcohol_share_pct']:.0f}% of the food deficit.")
    if card["breaches"]:
        out.append(f"Over: {', '.join(card['breaches'])}.")
    if over_cap_weeks is not None and over_cap_weeks >= 3:
        out.append(f"Limits broken {over_cap_weeks} of the last {weeks_checked} weeks — the pre-agreed "
                   f"signal that moderation alone isn't holding.")
    return out
