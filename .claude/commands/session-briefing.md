---
name: session-briefing
description: Re-run the full Mr. Bridge session briefing on demand — weather, schedule, birthdays, emails, pending tasks, habit accountability, body comp, activity and recovery.
user-invocable: true
allowed-tools:
  - Bash(bash *)
  - Read
  - mcp__claude_ai_Google_Calendar__*
  - mcp__claude_ai_Gmail__*
model: sonnet
---

Re-run the full session briefing as defined in `.claude/rules/briefing.md`.

Execute the following in order:

1. Fetch briefing data from Supabase (weather is included — it resolves the profile location
   `location_lat`/`location_lon` → `location_city` → `Identity/Location` itself):
   ```bash
   python3 scripts/fetch_briefing_data.py
   ```
   Skip `scripts/run-syncs.py` unless the user asks for fresh data — it needs the app container up.
2. Issue the three external fetches from `briefing.md` step 3 **in parallel** (single message turn):
   calendar events for today, the nearest birthday (next 60 days), and important unread emails —
   via the claude.ai Google Calendar and Gmail connectors.
3. Output the full briefing in the standard format from `.claude/rules/briefing.md`.
