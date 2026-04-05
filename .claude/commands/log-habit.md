---
name: log-habit
description: Log one or more habit completions for today. Usage: /log-habit floss workout japanese
argument-hint: "[habit1] [habit2] ..."
user-invocable: true
allowed-tools:
  - Read
  - Edit
model: haiku
---

Log the specified habits as completed in `memory/habits.md` for today.

Parse the arguments as a space-separated list of habit names. Match them case-insensitively to the habit columns (Floss, Workout, Japanese, Coding, Reading, Water, Sleep).

Then use the `log-habit` skill to write the updates.
