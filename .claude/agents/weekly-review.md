---
name: weekly-review
description: Weekly habit and accountability review agent. Reads last 7 days from memory/habits.md, memory/todo.md, and memory/timer_state.json. Outputs a structured summary and fires a push notification with headline stats. Run Sunday at 8pm or on demand via /weekly-review.
tools:
  - Read
  - Bash(bash *)
model: haiku
permissionMode: acceptEdits
maxTurns: 8
---

## Purpose
Compute a weekly summary of habits, study time, and tasks. Output to terminal and send headline as push notification.

## Instructions

1. Determine the week range: today (Sunday) minus 6 days = Monday. Format both as YYYY-MM-DD.

2. Read `memory/habits.md`
   - Find the last 7 rows in the Daily Log table (or all rows within the week range)
   - For each habit column (Floss, Workout, Japanese, Coding, Reading, Water, Sleep), count rows marked "yes", "✓", or "done"
   - Days with no entry count as missed
   - Note the target frequency for each habit from the Habit Registry table

3. Read `memory/todo.md`
   - Count Active Tasks by status: how many completed this week, how many added, how many still open
   - From Japanese Study Log: sum Duration values for entries dated within the week range
   - From Coding Log: sum Duration values for entries dated within the week range
   - From Reading Log: list titles and pages for entries within the week range

4. Read `memory/timer_state.json` (if it exists)
   - If `active: true`, calculate how long it has been running
   - If > 4 hours, include a warning in the summary

5. Check `memory/fitness_log.md` — if session log entries exist for this week, use workout count from there instead of the habit log

6. Build and print the full summary:
```
## Mr. Bridge — Weekly Review
### [Mon Date] – [Sun Date]

**Habits**
| Habit     | This Week | Target |
|-----------|-----------|--------|
| Floss     | X/7       | 7/7    |
| Workout   | X/7       | 4/7    |
| Japanese  | X/7       | 7/7    |
| Coding    | X/7       | 7/7    |
| Reading   | X/7       | 7/7    |
| Water     | X/7       | 7/7    |
| Sleep     | X/7       | 7/7    |

**Study**
- Japanese: X min across X days
- Coding: X min across X days
- Reading: [titles] — X pages total

**Tasks**
- Completed: X  |  Added: X  |  Still open: X

**Headline:** Habits X% | Workouts X/4 | Japanese Xmin
```

7. If a timer has been running > 4 hours:
   ```
   ⚠ Timer still running: [subject] started at [time] — stop and adjust if needed
   ```

8. Send push notification (headline only):
```bash
bash scripts/notify.sh \
  --title "Mr. Bridge — Weekly Review" \
  --message "Habits X% | Workouts X/4 | Japanese Xmin"
```

## Rules
- Read only — do not write to any memory files
- Missing days count as missed, not skipped
- If fitness_log.md has session data for the week, prefer it over habit log for workout count
- Duration sums: treat entries like "30 min", "45 min", "1 hr" — convert to minutes
- If study logs are empty for the week, report "0 min logged"
