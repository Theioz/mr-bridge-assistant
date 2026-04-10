---
name: log-habit
description: Logs one or more habit completions to Supabase for today's date. Call when Jason reports completing a habit during a session.
allowed-tools:
  - Bash
user-invocable: false
---

## Task
Log habit completions to Supabase by running the log_habit script.

## Instructions

Run the following command with the habits to log:
```bash
python3 scripts/log_habit.py --habits <habit1> <habit2> ... --date <YYYY-MM-DD>
```

Use today's date unless a specific date is mentioned.

## Habit name aliases
- floss → Floss
- workout → Workout
- japanese → Japanese study
- coding → Coding
- reading → Reading
- water → Water
- sleep → Sleep

## Rules
- Only log habits explicitly reported as done
- Date format: YYYY-MM-DD
