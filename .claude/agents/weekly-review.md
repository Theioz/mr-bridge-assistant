---
name: weekly-review
description: Weekly habit and accountability review agent. Queries last 7 days from Supabase (habits, tasks, study_log, recovery_metrics, profile). Outputs a structured summary and fires a push notification with headline stats. Run Sunday at 8pm or on demand via /weekly-review.
tools:
  - Bash(bash *)
model: haiku
permissionMode: acceptEdits
maxTurns: 8
color: orange
---

## Purpose
Compute a weekly summary of habits, study time, and tasks. Output to terminal and send headline as push notification.

## Instructions

1. Determine the week range: today (Sunday) minus 6 days = Monday. Format both as YYYY-MM-DD. Set `WEEK_START` and `WEEK_END`.

2. Query Supabase for habit data:
   ```bash
   python3 - <<'EOF'
   import sys
   sys.path.insert(0, "scripts")
   from _supabase import get_client
   from datetime import date, timedelta
   client = get_client()
   today = date.today().isoformat()
   week_start = (date.today() - timedelta(days=6)).isoformat()
   registry = client.table("habit_registry").select("id,name,target_per_week").eq("active", True).execute().data
   logs = client.table("habits").select("habit_id,date,completed").gte("date", week_start).lte("date", today).execute().data
   import json
   print(json.dumps({"registry": registry, "logs": logs}))
   EOF
   ```
   - For each habit in the registry, count `completed = true` rows within the week range
   - Days with no entry count as missed
   - Note the `target_per_week` for each habit from the registry

3. Query Supabase for task counts:
   ```bash
   python3 - <<'EOF'
   import sys
   sys.path.insert(0, "scripts")
   from _supabase import get_client
   from datetime import date, timedelta
   client = get_client()
   week_start = (date.today() - timedelta(days=6)).isoformat()
   today = date.today().isoformat()
   active = client.table("tasks").select("id,status").eq("status", "active").execute().data
   completed = client.table("tasks").select("id,updated_at").eq("status", "completed").gte("updated_at", week_start).execute().data
   import json
   print(json.dumps({"active_count": len(active), "completed_this_week": len(completed)}))
   EOF
   ```

4. Query Supabase for study log:
   ```bash
   python3 - <<'EOF'
   import sys
   sys.path.insert(0, "scripts")
   from _supabase import get_client
   from datetime import date, timedelta
   client = get_client()
   week_start = (date.today() - timedelta(days=6)).isoformat()
   today = date.today().isoformat()
   rows = client.table("study_log").select("date,subject,duration_mins,notes").gte("date", week_start).lte("date", today).execute().data
   import json
   print(json.dumps(rows))
   EOF
   ```
   - Sum `duration_mins` per subject (Japanese, Coding, Reading)
   - Count distinct days per subject

5. Query Supabase for active timer state:
   ```bash
   python3 - <<'EOF'
   import sys
   sys.path.insert(0, "scripts")
   from _supabase import get_client
   client = get_client()
   row = client.table("profile").select("value").eq("key", "timer_state").execute().data
   import json
   print(row[0]["value"] if row else "{}")
   EOF
   ```
   - Parse the JSON value; if `active: true`, calculate elapsed time from `started_at`
   - If > 4 hours, include a warning in the summary

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
- Read only — do not write to Supabase
- Missing days count as missed, not skipped
- Workout count: use habit log `completed = true` rows for the Workout habit; `workout_sessions` data is not fetched by this agent
- Duration sums: `duration_mins` is already in minutes in `study_log`
- If study logs are empty for the week, report "0 min logged"
