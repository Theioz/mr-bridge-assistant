---
name: weekly-plan
description: Generate and write next week's workout + meal-prep plan. Replaces the Anthropic API call that used to run this from a GitHub Action.
user-invocable: true
allowed-tools:
  - Bash
model: sonnet
---

Generate the weekly plan. **You are the planner** — this used to be a `claude-sonnet`
call inside `run_weekly_plan.py`; on a zero-Anthropic deployment (#476) that is now you,
running on the subscription.

The structural rules stayed in Python on purpose. They are RULES, not judgement, and must
not be quietly interpreted away.

## Steps

1. **Fetch the context** (AI-free endpoint — profile, equipment, last week's sets with
   per-set RPE, recovery, meals, habits):

   ```bash
   python3 scripts/weekly_plan.py context --week-start <YYYY-MM-DD>
   ```

   `<YYYY-MM-DD>` is the **Monday** of the week to plan. Default to next Monday.

2. **Write the plan** as JSON, following the schema and the planning rules embedded in
   `scripts/weekly_plan.py` (read the module docstring and `PROMPT` constant — they carry
   the goal phase, split, volume and recovery constraints). Save it to `/tmp/plan.json`.

3. **Validate it.** This is not optional:

   ```bash
   python3 scripts/weekly_plan.py validate /tmp/plan.json
   ```

   It checks weekly muscle coverage, recovery spacing between hard sessions, and same-day
   redundancy. If it fails, FIX THE PLAN and re-run. Do not submit a plan that fails.

4. **Submit:**

   ```bash
   python3 scripts/weekly_plan.py submit /tmp/plan.json --week-start <YYYY-MM-DD>
   ```

   This writes `workout_plans` rows and the meal-prep task.

5. Report what was written: days, the split, and anything you had to adjust to pass
   validation.
