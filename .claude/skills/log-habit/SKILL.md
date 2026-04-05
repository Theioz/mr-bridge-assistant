---
name: log-habit
description: Logs one or more habit completions to memory/habits.md for today's date. Call when Jason reports completing a habit during a session.
allowed-tools:
  - Read
  - Edit
user-invocable: false
---

## Task
Update today's row in the `memory/habits.md` Daily Log table with the provided habit completions.

## Instructions

1. Read `memory/habits.md`
2. Find today's row (YYYY-MM-DD format). If it doesn't exist, add a new row for today with all habits marked "—"
3. Update the specified habits to "yes" for today's row
4. Write the updated file using Edit (confirm before writing per memory update rules)

## Habit Columns (in order)
Floss | Workout | Japanese | Coding | Reading | Water | Sleep

## Rules
- Only update habits explicitly reported as done — leave others as "—"
- Do not create streak calculations — those are handled separately
- Date format: YYYY-MM-DD
