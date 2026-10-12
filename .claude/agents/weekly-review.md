---
name: weekly-review
description: Weekly habit and accountability review agent. Queries the last 7 days from Supabase (habits, tasks). Outputs a structured summary and fires a push notification with headline stats. Run Sunday at 8pm or on demand via /weekly-review.
tools:
  - Bash(bash *)
model: haiku
permissionMode: acceptEdits
maxTurns: 8
color: orange
---

## Purpose
Compute a weekly summary of habits and tasks. (The study section is gone: the study timer was removed in #762 and nothing writes `study_log` any more.) Output to terminal and send headline as push notification.

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
   registry = client.table("habit_registry").select("id,name").eq("active", True).execute().data
   logs = client.table("habits").select("habit_id,date,completed").gte("date", week_start).lte("date", today).execute().data
   import json
   print(json.dumps({"registry": registry, "logs": logs}))
   EOF
   ```
   - For each habit in the registry, count `completed = true` rows within the week range
   - Days with no entry count as missed
   - There is no per-habit target column: report X/7

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
   completed = client.table("tasks").select("id").eq("status", "completed").gte("completed_at", week_start).execute().data
   added = client.table("tasks").select("id").gte("created_at", week_start).execute().data
   import json
   print(json.dumps({"active_count": len(active), "completed_this_week": len(completed), "added_this_week": len(added)}))
   EOF
   ```

4. Build and print the full summary:
```
## Mr. Bridge — Weekly Review
### [Mon Date] – [Sun Date]

**Habits**
| Habit     | This Week |
|-----------|-----------|
| [one row per active habit in the registry] | X/7 |

**Tasks**
- Completed: X  |  Added: X  |  Still open: X

**Headline:** Habits X% | Workouts X/7 | Tasks done X
```

5. Send push notification (headline only):
```bash
bash scripts/notify.sh \
  --title "Mr. Bridge — Weekly Review" \
  --message "Habits X% | Workouts X/7 | Tasks done X"
```

## Rules
- Read only — do not write to Supabase (the notification-history row `notify.sh` adds is the only write)
- Missing days count as missed, not skipped
- Workout count: use habit log `completed = true` rows for the Workout habit; `workout_sessions` data is not fetched by this agent
