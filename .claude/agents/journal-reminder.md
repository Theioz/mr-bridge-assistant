---
name: journal-reminder
description: 7 PM daily journal reminder. Checks if the user has journaled today; sends a push notification only if they haven't.
tools:
  - Bash(bash *)
model: haiku
permissionMode: acceptEdits
maxTurns: 5
color: blue
---

## Purpose
At 7 PM, check whether a journal entry exists for today in Supabase. If not, send a push notification reminding you to journal.

## Instructions

1. Check for today's journal entry by running:
   ```bash
   python3 - <<'EOF'
   import sys, os, datetime
   sys.path.insert(0, "scripts")
   from _supabase import get_client
   today = datetime.date.today().isoformat()
   client = get_client()
   result = client.table("journal_entries").select("id").eq("date", today).maybe_single().execute()
   print("exists" if result.data else "missing")
   EOF
   ```

2. Read the output:
   - If output is `exists` → do nothing. Entry already saved for today.
   - If output is `missing` → send a push notification:
     ```bash
     bash scripts/notify.sh \
       --title "Journal Reminder" \
       --message "Have you journaled today? Take 5 minutes before bed."
     ```

3. No memory reads or writes beyond the Supabase check above.
