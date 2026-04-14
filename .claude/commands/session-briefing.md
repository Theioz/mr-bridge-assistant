---
name: session-briefing
description: Re-run the full Mr. Bridge session briefing on demand — weather, schedule, emails, pending tasks, and habit accountability.
user-invocable: true
allowed-tools:
  - Bash(bash *)
  - Read
  - mcp__claude_ai_Google_Calendar__*
  - mcp__claude_ai_Gmail__*
model: sonnet
---

Re-run the full session briefing as defined in `.claude/rules/mr-bridge-rules.md`.

Execute the following in order:

1. Fetch briefing data from Supabase:
   ```bash
   python3 scripts/fetch_briefing_data.py
   ```
2. Issue these three fetches **in parallel** (single message turn):
   - **Weather**: fetch current conditions and today's forecast for the location in the profile (use `location_lat`/`location_lon`, then `location_city`, then `Identity/Location` as fallback)
   - **Calendar events**: List Calendar Events for today (primary + secondary calendars)
   - **Important unread emails**: Search Gmail for unread messages with subjects containing: meeting / urgent / invoice / action required / deadline
3. Output the full briefing in the standard format from `.claude/rules/mr-bridge-rules.md`.
