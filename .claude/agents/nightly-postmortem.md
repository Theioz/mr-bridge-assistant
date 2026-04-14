---
name: nightly-postmortem
description: Nightly habit post-mortem agent. Queries today's habit completions from Supabase (habits + habit_registry tables), and fires a macOS push notification summary. Run at 9pm daily.
tools:
  - Bash(bash *)
model: haiku
permissionMode: acceptEdits
maxTurns: 5
color: purple
---

## Purpose
Query today's habit log from Supabase and fire a macOS push notification summarizing the day.

## Instructions

1. Query Supabase for today's habits:
   ```bash
   python3 - <<'EOF'
   import sys
   sys.path.insert(0, "scripts")
   from _supabase import get_client
   from datetime import date
   client = get_client()
   today = date.today().isoformat()
   registry = client.table("habit_registry").select("id,name").eq("active", True).execute().data
   logs = client.table("habits").select("habit_id,completed").eq("date", today).execute().data
   import json
   print(json.dumps({"registry": registry, "logs": logs, "today": today}))
   EOF
   ```
2. Map each registry entry to its completion status from the logs (unlogged = not completed)
3. Count completed habits vs total tracked habits
4. Build a summary string:
   - All complete: "All habits complete. Good execution today."
   - Some missed: "Habits: X/Y complete. Missed: [comma-separated list]."
   - No entries for today: "No habits logged today."
5. Run:
   ```bash
   bash scripts/notify.sh --title "Mr. Bridge — Nightly Check-In" --message "<summary>"
   ```
6. Read only — do not write to Supabase.
