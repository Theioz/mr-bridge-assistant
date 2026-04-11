---
name: nightly-postmortem
description: Nightly habit post-mortem agent. Reads memory/habits.md, evaluates today's habit completions, and fires a macOS push notification summary. Run at 9pm daily.
tools:
  - Read
  - Bash(bash *)
model: haiku
permissionMode: acceptEdits
maxTurns: 5
---

## Purpose
Read today's habit log and fire a macOS push notification summarizing the day.

## Instructions

1. Read `memory/habits.md`
2. Find today's row in the Daily Log table (date = today in YYYY-MM-DD format)
3. Count completed habits (marked as "yes", "✓", or "done") vs total tracked habits
4. Build a summary string:
   - All complete: "All habits complete. Good execution today."
   - Some missed: "Habits: X/Y complete. Missed: [comma-separated list]."
   - No entry for today: "No habits logged today."
5. Run:
   ```bash
   bash scripts/notify.sh --title "Mr. Bridge — Nightly Check-In" --message "<summary>"
   ```
6. Read only — do not write to any memory files.
