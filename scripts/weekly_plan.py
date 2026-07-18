#!/usr/bin/env python3
"""
Weekly planning agent — local runner and GitHub Actions entrypoint.

Mirrors /api/cron/weekly-plan exactly: full planner prompt, two-pass
structural validation (movement patterns + recovery + same-day redundancy),
and correction pass before writing to Supabase.

Usage:
  python3 scripts/run_weekly_plan.py --week-start 2026-05-04
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

# Load .env.local when running locally (CI sets secrets via environment)
env_file = Path(__file__).parent.parent / "web" / ".env.local"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ[k.strip()] = v.strip()

# NOTE: `import anthropic` used to live here, left over from when generation was an
# API call from inside this script (see the note above main()). Nothing referenced it,
# but it made the module unimportable on any host without the package — including
# compute-core, which is deliberately zero-Anthropic. That is what kept
# /api/cron/weekly-plan disabled. Do not reintroduce it: generation happens in a
# Claude Code session, not here.

# API_BASE — the origin THIS SCRIPT uses for its own server-to-server calls.
#
# Deliberately not APP_URL. APP_URL is the tailnet-only app host (see
# web/src/lib/share-url.ts, which already documents that distinction for share links).
# This script runs ON compute-core, and compute-core cannot reach that host:
# mr-bridge.jl-infra-lab.com resolves to a tailnet IP belonging to a *different* node,
# and the Tailscale ACL does not grant compute-core -> that node. A call to APP_URL
# from here fails at connect, not at auth — so it looks like the app is down.
#
# Precedence:
#   INTERNAL_APP_URL   loopback/LAN origin for host-local calls, e.g. http://localhost:3000
#   APP_URL            fallback for dev or a single-host deploy where they are the same
API_BASE = os.environ.get("INTERNAL_APP_URL") or os.environ.get("APP_URL")
if not API_BASE:
    raise SystemExit(
        "Set INTERNAL_APP_URL (preferred, e.g. http://localhost:3000) or APP_URL.\n"
        "This previously defaulted to the Vercel deployment, decommissioned in the "
        "2026-07-13 self-host cutover, so the default silently pointed every submit at a "
        "dead host. Note APP_URL alone is not reachable from compute-core — it is the "
        "tailnet app host on another node."
    )
CRON_SECRET = os.environ["CRON_SECRET"]

HEADERS = {
    "Authorization": f"Bearer {CRON_SECRET}",
    "Content-Type": "application/json",
}

# ── Movement pattern validation (mirrors movement-patterns.ts) ────────────────

EXERCISE_PATTERN_MAP: dict[str, list[str]] = {
    # Squat
    "DB Goblet Squat": ["squat"], "DB Sumo Squat": ["squat"],
    "DB Bulgarian Split Squat": ["squat"], "DB Reverse Lunge": ["squat"],
    "DB Walking Lunge": ["squat"], "Bodyweight Squat": ["squat"],
    "Goblet Squat": ["squat"], "Bulgarian Split Squat": ["squat"],
    "Reverse Lunge": ["squat"],
    # Hinge
    "DB Romanian Deadlift": ["hinge"], "DB Single-Leg Romanian Deadlift": ["hinge"],
    "DB Glute Bridge": ["hinge"], "DB Hip Thrust": ["hinge"],
    "DB Good Morning": ["hinge"], "Romanian Deadlift": ["hinge"],
    "Single-Leg RDL": ["hinge"], "Glute Bridge": ["hinge"],
    "Slider Hamstring Curl": ["hinge"], "Glute Bridge (weighted)": ["hinge"],
    # Horizontal push
    "DB Chest Press (floor)": ["push_horizontal"], "DB Floor Press": ["push_horizontal"],
    "DB Chest Fly (floor)": ["push_horizontal"], "Slider Push-Up": ["push_horizontal"],
    "Push-Up": ["push_horizontal"], "Floor Press": ["push_horizontal"],
    "Band Chest Press": ["push_horizontal"],
    # Vertical push
    "DB Overhead Press": ["push_vertical"], "DB Arnold Press": ["push_vertical"],
    "Pike Push-Up": ["push_vertical"], "Overhead Press": ["push_vertical"],
    # Horizontal pull
    "DB Bent-Over Row": ["pull_horizontal"], "DB Single-Arm Row": ["pull_horizontal"],
    "DB Dead Hang Row": ["pull_horizontal"], "DB Renegade Row": ["pull_horizontal"],
    "Inverted Row": ["pull_horizontal"], "TRX Row": ["pull_horizontal"],
    "Bent-Over Row": ["pull_horizontal"], "Single-Arm Row": ["pull_horizontal"],
    # Vertical pull
    "Pull-Up": ["pull_vertical"], "Chin-Up": ["pull_vertical"],
    "Banded Pulldown": ["pull_vertical"], "Negative Pull-Up": ["pull_vertical"],
    "Assisted Pull-Up": ["pull_vertical"],
    # Carry
    "DB Farmer's Carry": ["carry"], "DB Farmer Carry": ["carry"],
    "DB Suitcase Carry": ["carry"], "DB Overhead Carry": ["carry"],
    "Farmer's Carry": ["carry"], "Farmer Carry": ["carry"],
    # Core
    "Slider Body Saw": ["core"], "Plank": ["core"], "Side Plank": ["core"],
    "Hollow Hold": ["core"], "Dead Bug": ["core"], "Bird Dog": ["core"],
    "Ab Wheel Rollout": ["core"], "Slider Pike": ["core"],
    # Auxiliary — no pattern
    "DB Lateral Raise": [], "DB Rear Delt Raise": [], "DB Reverse Fly": [],
    "DB Hammer Curl": [], "DB Bicep Curl": [], "DB Tricep Kickback": [],
    "DB Tricep Extension": [], "DB Skull Crusher": [], "DB Calf Raise": [],
    "DB Pullover (floor)": [], "Standing Calf Raise": [], "DB Pullover": [],
    "Band Pull-Apart": [], "Scapular Push-Up": [], "Arm Circles": [],
    "Cat-Cow": [], "Dead Hang": [], "Hip Circle": [], "Leg Swing": [],
}

REQUIRED_PATTERNS = ["squat", "hinge", "push_horizontal", "push_vertical",
                     "pull_horizontal", "pull_vertical", "core"]

EXERCISE_MUSCLE_MAP: dict[str, list[str]] = {
    "DB Goblet Squat": ["quads", "glutes"], "Goblet Squat": ["quads", "glutes"],
    "DB Sumo Squat": ["glutes", "quads"], "DB Bulgarian Split Squat": ["quads", "glutes"],
    "Bulgarian Split Squat": ["quads", "glutes"], "DB Reverse Lunge": ["quads", "glutes"],
    "Reverse Lunge": ["quads", "glutes"], "DB Walking Lunge": ["quads", "glutes"],
    "DB Romanian Deadlift": ["hamstrings", "glutes", "lower_back"],
    "Romanian Deadlift": ["hamstrings", "glutes", "lower_back"],
    "DB Single-Leg Romanian Deadlift": ["hamstrings", "glutes"],
    "Single-Leg RDL": ["hamstrings", "glutes"],
    "DB Glute Bridge": ["glutes", "hamstrings"], "Glute Bridge": ["glutes", "hamstrings"],
    "Glute Bridge (weighted)": ["glutes", "hamstrings"],
    "DB Hip Thrust": ["glutes", "hamstrings"],
    "Slider Hamstring Curl": ["hamstrings"],
    "DB Chest Press (floor)": ["chest", "triceps", "shoulders"],
    "DB Floor Press": ["chest", "triceps", "shoulders"],
    "DB Chest Fly (floor)": ["chest"], "Slider Push-Up": ["chest", "triceps", "shoulders"],
    "Push-Up": ["chest", "triceps", "shoulders"], "Floor Press": ["chest", "triceps", "shoulders"],
    "Band Chest Press": ["chest", "triceps", "shoulders"],
    "DB Overhead Press": ["shoulders", "triceps"], "DB Arnold Press": ["shoulders", "triceps"],
    "Overhead Press": ["shoulders", "triceps"], "Pike Push-Up": ["shoulders", "triceps"],
    "DB Bent-Over Row": ["back", "biceps"], "DB Single-Arm Row": ["back", "biceps"],
    "Bent-Over Row": ["back", "biceps"], "Single-Arm Row": ["back", "biceps"],
    "DB Renegade Row": ["back", "biceps", "core"],
    "Pull-Up": ["back", "biceps"], "Chin-Up": ["back", "biceps"],
    "Banded Pulldown": ["back", "biceps"], "Negative Pull-Up": ["back", "biceps"],
    "Assisted Pull-Up": ["back", "biceps"],
    "DB Lateral Raise": ["shoulders"], "DB Rear Delt Raise": ["shoulders"],
    "DB Reverse Fly": ["shoulders", "back"],
    "DB Hammer Curl": ["biceps"], "DB Bicep Curl": ["biceps"],
    "DB Tricep Kickback": ["triceps"], "DB Tricep Extension": ["triceps"],
    "DB Skull Crusher": ["triceps"], "DB Pullover (floor)": ["back", "chest"],
    "Slider Body Saw": ["core"], "Plank": ["core"], "Side Plank": ["core"],
    "Hollow Hold": ["core"], "Dead Bug": ["core"], "Bird Dog": ["core"],
    "Ab Wheel Rollout": ["core"], "Slider Pike": ["core"],
}

DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


def validate_weekly_coverage(exercises: list[str], has_pull_up_bar: bool) -> list[str]:
    covered: set[str] = set()
    for ex in exercises:
        for p in EXERCISE_PATTERN_MAP.get(ex, []):
            covered.add(p)
    required = REQUIRED_PATTERNS if has_pull_up_bar else [p for p in REQUIRED_PATTERNS if p != "pull_vertical"]
    return [p for p in required if p not in covered]


def check_same_day_redundancy(exercise_names: list[str]) -> list[dict]:
    issues = []
    for i in range(len(exercise_names) - 1):
        pa = EXERCISE_PATTERN_MAP.get(exercise_names[i], [])
        pb = EXERCISE_PATTERN_MAP.get(exercise_names[i + 1], [])
        shared = [p for p in pa if p in pb]
        if shared:
            issues.append({"exerciseA": exercise_names[i], "exerciseB": exercise_names[i + 1], "sharedPattern": shared[0]})
    return issues


def day_of_week(date_str: str) -> int:
    from datetime import date
    y, m, d = map(int, date_str.split("-"))
    return date(y, m, d).weekday() + 1  # Mon=1 … Sun=7, then mod to JS convention
    # Actually use JS convention: Sun=0, Mon=1 … Sat=6


def js_day_of_week(date_str: str) -> int:
    from datetime import date
    y, m, d = map(int, date_str.split("-"))
    return date(y, m, d).isoweekday() % 7  # Mon=1→1, Sun=7→0


def shape_plan(plan: dict) -> tuple[list[str], list[dict]]:
    """Reduce a submitted plan to the two shapes the validators consume.

    The plan schema is {workout_days: [{date, warmup, workout, cooldown}]} where each
    exercise entry is keyed `exercise`. The validators want a flat name list (coverage)
    and [{dayOfWeek, exercises: [{name, sets}]}] (recovery spacing). Keeping the
    conversion in one place is what stops `validate` and `build_correction_prompt`
    drifting apart — they disagreed before, and `validate` was the one that was wrong.
    """
    all_exercises: list[str] = []
    day_plans: list[dict] = []

    for day in plan.get("workout_days", []):
        if not day.get("date"):
            continue
        entries = (day.get("warmup") or []) + (day.get("workout") or []) + (day.get("cooldown") or [])
        names = [e["exercise"] for e in entries if e.get("exercise")]
        all_exercises.extend(names)
        day_plans.append({
            "dayOfWeek": js_day_of_week(day["date"]),
            "date": day["date"],
            "exercises": [
                {"name": e["exercise"], "sets": e.get("sets", 1)}
                for e in entries
                if e.get("exercise")
            ],
        })

    return all_exercises, day_plans


def validate_recovery(day_plans: list[dict]) -> list[dict]:
    """day_plans: [{dayOfWeek: int, exercises: [{name, sets}]}]"""
    violations = []
    sorted_days = sorted(day_plans, key=lambda d: d["dayOfWeek"])
    muscles = list(set(m for muscles in EXERCISE_MUSCLE_MAP.values() for m in muscles))

    for muscle in muscles:
        for i in range(len(sorted_days) - 1):
            day_a = sorted_days[i]
            day_b = sorted_days[i + 1]
            vol_a = sum(ex["sets"] for ex in day_a["exercises"] if muscle in EXERCISE_MUSCLE_MAP.get(ex["name"], []))
            vol_b = sum(ex["sets"] for ex in day_b["exercises"] if muscle in EXERCISE_MUSCLE_MAP.get(ex["name"], []))
            if vol_a == 0 or vol_b == 0:
                continue
            hours_between = (day_b["dayOfWeek"] - day_a["dayOfWeek"]) * 24
            # >= not >. At exactly 48h the rule fired and demanded the second session be
            # at half volume, which rejects any Mon/Wed/Sat full-body split — the split
            # this program actually runs. 48h is adequate recovery for a muscle group;
            # the rule is meant to catch back-to-back days. This never surfaced because
            # the validator was unreachable (wrong dict key) until now.
            if hours_between >= 48:
                continue
            if vol_b > vol_a * 0.5:
                violations.append({
                    "muscleGroup": muscle,
                    "firstDay": day_a["dayOfWeek"],
                    "firstVolume": vol_a,
                    "secondDay": day_b["dayOfWeek"],
                    "secondVolume": vol_b,
                    "message": f"{muscle} hit {vol_a} sets on {DAY_NAMES[day_a['dayOfWeek']]} and {vol_b} sets on {DAY_NAMES[day_b['dayOfWeek']]} ({hours_between}h apart — second session must be ≤{-(-vol_a // 2)} sets or moved)",
                })
    return violations


def build_correction_prompt(plan: dict, has_pull_up_bar: bool) -> str | None:
    all_exercises, day_plans = shape_plan(plan)

    missing_patterns = validate_weekly_coverage(all_exercises, has_pull_up_bar)
    recovery_violations = validate_recovery(day_plans)
    redundancy_issues = []
    for dp in day_plans:
        for issue in check_same_day_redundancy([e["name"] for e in dp["exercises"]]):
            redundancy_issues.append({**issue, "day": dp["dayOfWeek"]})

    if not missing_patterns and not recovery_violations and not redundancy_issues:
        return None

    issues: list[str] = []
    if missing_patterns:
        examples = {"squat": "Goblet Squat, Bulgarian Split Squat", "hinge": "Romanian Deadlift, Glute Bridge",
                    "push_horizontal": "Floor Press, Push-Up", "push_vertical": "Overhead Press, Pike Push-Up",
                    "pull_horizontal": "Bent-Over Row, Single-Arm Row",
                    "pull_vertical": "Pull-Up, Chin-Up, Banded Pulldown", "core": "Plank, Dead Bug, Slider Body Saw"}
        issues.append(f"MISSING MOVEMENT PATTERNS: {', '.join(missing_patterns)} — add at least one exercise covering each missing pattern. Examples: " +
                      "; ".join(f"{p}: {examples.get(p, '?')}" for p in missing_patterns))

    for r in redundancy_issues:
        issues.append(f"REDUNDANT SEQUENCING on {DAY_NAMES[r['day']]}: \"{r['exerciseA']}\" immediately followed by \"{r['exerciseB']}\" (both target {r['sharedPattern']}) — insert an exercise from a different pattern between them, or replace one.")

    for v in recovery_violations:
        issues.append(f"RECOVERY CONFLICT: {v['message']}")

    return f"""The workout plan below has structural issues. Return ONLY a corrected JSON plan in a code block, fixing exactly the issues listed. Do not change exercises that are not flagged.

CURRENT PLAN:
```json
{json.dumps(plan, indent=2)}
```

ISSUES TO FIX:
{chr(10).join(f'{i+1}. {issue}' for i, issue in enumerate(issues))}

Return only the corrected JSON. Same schema as before."""


# ── Full planner prompt (mirrors buildPlannerPrompt in weekly-plan/route.ts) ─

PLANNER_PROMPT = """You are Mr. Bridge's weekly planning agent. You are not generating a generic workout week — you are EVOLVING the user's training based on last week's actual performance, recovery state, equipment constraints, and goal phase.

{planning_context}

---

OUTPUT RULES:
- Return ONLY valid JSON in a code block (no explanation before or after).
- JSON schema:
{{
  "workout_days": [
    {{
      "date": "YYYY-MM-DD",
      "name": "Push Day",
      "warmup": [{{"exercise": "...", "sets": N, "reps": "...", "description": "1-3 sentences on how to perform", "tips": ["form cue"]}}],
      "workout": [...same shape...],
      "cooldown": [...same shape...],
      "notes": "rationale — cite evidence e.g. 'DB Bent-Over Row 3×12 @ 25 lb avg RPE 8.3 last week — top of range, prescribing same load with tempo added'"
    }}
  ],
  "meal_prep_task": {{
    "title": "Meal prep — week of YYYY-MM-DD",
    "priority": "medium",
    "due_date": "YYYY-MM-DD",
    "category": "nutrition",
    "metadata": {{
      "source": "weekly_planning_agent",
      "week_start": "YYYY-MM-DD",
      "recommendations": ["batch cook chicken breast x4", "prep overnight oats x3"]
    }}
  }}
}}

SCHEDULING:
- Use preferred_workout_days from profile (default: Mon, Tue, Thu, Sat — 4 days/week).
- If avg readiness < 65 for prior week, reduce to 3 days and note deload.
- If any single-day readiness < 50, drop one workout day and flag it in notes.
- If HRV has been declining 3+ consecutive days or chronic high RPE is flagged above, reduce intensity across all days and avoid max-effort sets.

MOVEMENT PATTERN COVERAGE (mandatory — validate before returning):
The week MUST include at least one working set from each pattern:
- squat (e.g. Goblet Squat, Bulgarian Split Squat, Reverse Lunge)
- hinge (e.g. Romanian Deadlift, Glute Bridge, Slider Hamstring Curl)
- push_horizontal (e.g. Floor Press, Push-Up, Slider Push-Up)
- push_vertical (e.g. Overhead Press, Pike Push-Up)
- pull_horizontal (e.g. Bent-Over Row, Single-Arm Row)
- pull_vertical (e.g. Pull-Up, Chin-Up, Banded Pulldown) — REQUIRED if pull-up bar is in equipment inventory
- core (e.g. Plank, Dead Bug, Slider Body Saw, Hollow Hold)
Never place 2+ exercises sharing the same pattern AND same equipment type back-to-back within a day (e.g. DB Bent-Over Row immediately followed by DB Single-Arm Row). Break them up with a different pattern.

EQUIPMENT-CAPPED PROGRESSION (apply when user is at max DB weight):
When an exercise has been performed at the user's equipment cap at avg RPE ≤ 8 for 2+ sessions, do NOT repeat the same prescription. Apply the progression ladder in order:
1. Add reps (target 20+ rep range)
2. Add 3-second eccentric tempo
3. Add 2-second pause at hardest position
4. Convert to unilateral variant (effective load doubles)
5. Mechanical drop set
6. Add resistance band
7. Reduce rest by 30 seconds
Always surface the rationale in notes.

PROGRESSION RULES (use LAST WEEK'S EXERCISE PERFORMANCE data):
- If last 2 sessions hit top-of-range reps at prescribed weight → suggest +5 lb upper-body compound / +10 lb lower-body compound / +2.5–5 lb isolation
- If RPE ≥ 9 on working sets for 2+ sessions → hold weight
- If target reps missed 2 sessions in a row → 10% deload
- If no progression across 4+ sessions → adjust rep scheme or add tempo/pause before swapping variation
- Never count cancelled sessions in progression analysis
- Surface the evidence in notes for every progression decision

MUSCLE GROUP RECOVERY (validate before returning):
No muscle group should be hit twice within 48 hours at >50% of the first session's set volume.

GOAL PHASE (check goal_phase profile key):
- cut: 10-15 sets/muscle/week, compound-heavy, minimal metabolic finishers, preserve lean mass
- bulk: 12-20 sets/muscle/week, progressive overload priority, less cardio
- maintain: 8-12 sets/muscle/week, variety > overload
- recomp: hybrid — high-protein assumed, conservative volume

EXERCISE SELECTION:
- Use only exercises suited to available equipment
- Vary the split — avoid repeating the same day-order as the prior week
- Include description and tips for every exercise
- Add at least one direct hamstring exercise per lower-body day

MEAL PREP:
- Align with cuisine_preferences (Korean, Southeast Asian) and profile macro goals
- Integrate goal_phase

If a data source is missing, note it in workout notes and continue with best-effort planning."""


# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch(url: str, method: str = "GET", body: bytes | None = None) -> tuple[int, str]:
    req = urllib.request.Request(url, data=body, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


# ── CLI ───────────────────────────────────────────────────────────────────────
#
# The generation step used to be an Anthropic API call from inside this script.
# It is now CLAUDE CODE itself (.claude/commands/weekly-plan.md), so this file is
# reduced to the parts that must stay deterministic:
#
#   context   GET the planning context (AI-free endpoint)
#   validate  run the structural validators against a plan file — coverage,
#             recovery spacing, same-day redundancy. These are RULES, not
#             judgement, and must not be left to a model.
#   submit    POST the plan (AI-free endpoint) — writes workout_plans + the
#             meal-prep task
#
# Splitting it this way means the model can be swapped or removed without
# touching the rules, and the rules cannot be quietly "interpreted" away.

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ctx = sub.add_parser("context", help="print the planning context for a week")
    p_ctx.add_argument("--week-start", required=True, help="YYYY-MM-DD (a Monday)")

    p_val = sub.add_parser("validate", help="check a plan against the structural rules")
    p_val.add_argument("plan", help="path to the plan JSON (or - for stdin)")
    p_val.add_argument(
        "--has-pull-up-bar",
        action="store_true",
        help="require vertical-pull coverage (was previously sniffed out of sys.argv)",
    )

    p_sub = sub.add_parser("submit", help="write a validated plan")
    p_sub.add_argument("plan", help="path to the plan JSON (or - for stdin)")
    p_sub.add_argument("--week-start", required=True, help="YYYY-MM-DD (a Monday)")

    args = parser.parse_args()

    if args.cmd == "context":
        status, text = fetch(f"{API_BASE}/api/internal/plan?week_start={args.week_start}")
        if status != 200:
            print(f"failed to fetch context: {status}\n{text}", file=sys.stderr)
            sys.exit(1)
        print(text)
        return

    raw = sys.stdin.read() if args.plan == "-" else open(args.plan).read()
    plan = json.loads(raw)

    if args.cmd == "validate":
        exercises, day_plans = shape_plan(plan)
        if not day_plans:
            print(
                "PLAN FAILED VALIDATION:\n"
                "  - no workout_days with a date found. Expected "
                '{"workout_days": [{"date": "YYYY-MM-DD", "workout": [{"exercise": ..., "sets": ...}]}]}',
                file=sys.stderr,
            )
            sys.exit(1)

        problems = []
        problems += [f"coverage: missing {m}" for m in validate_weekly_coverage(exercises, args.has_pull_up_bar)]
        problems += [f"recovery: {v['message']}" for v in validate_recovery(day_plans)]
        # Redundancy is a within-day property — checking a list flattened across days
        # compares the last exercise of one day against the first of the next.
        for dp in day_plans:
            for issue in check_same_day_redundancy([e["name"] for e in dp["exercises"]]):
                problems.append(
                    f"redundancy: {dp['date']} — {issue['exerciseA']} then {issue['exerciseB']} "
                    f"share pattern '{issue['sharedPattern']}'"
                )

        if problems:
            print("PLAN FAILED VALIDATION:")
            for p in problems:
                print(f"  - {p}")
            sys.exit(1)
        print(
            f"plan OK — {len(day_plans)} day(s), {len(exercises)} exercises; "
            "coverage, recovery spacing and same-day redundancy all pass"
        )
        return

    if args.cmd == "submit":
        # The route destructures workout_days / meal_prep_task from the TOP level and
        # 400s when both are absent — nesting the plan under a "plan" key made every
        # submit fail.
        if not plan.get("workout_days") and not plan.get("meal_prep_task"):
            print(
                "refusing to submit: plan has neither workout_days nor meal_prep_task",
                file=sys.stderr,
            )
            sys.exit(1)
        body = json.dumps({**plan, "week_start": args.week_start}).encode()
        status, text = fetch(f"{API_BASE}/api/internal/plan", method="POST", body=body)
        if status not in (200, 201):
            print(f"submit failed: {status}\n{text}", file=sys.stderr)
            sys.exit(1)
        print(f"plan written for week of {args.week_start}")
        return


if __name__ == "__main__":
    main()
