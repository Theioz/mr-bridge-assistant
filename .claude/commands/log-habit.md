---
name: log-habit
description: Log one or more habit completions for today. Usage: /log-habit floss workout japanese
argument-hint: "[habit1] [habit2] ..."
user-invocable: true
allowed-tools:
  - Bash(bash *)
model: haiku
---

Log the specified habits as completed in Supabase for today.

Parse the arguments as a space-separated list of habit names. They are matched case-insensitively to the names in the `habit_registry` table, through the aliases in `scripts/log_habit.py` (e.g. `japanese` → "Japanese study"); unknown names are reported and skipped.

Then use the `log-habit` skill to write the updates to Supabase via `scripts/log_habit.py`.
