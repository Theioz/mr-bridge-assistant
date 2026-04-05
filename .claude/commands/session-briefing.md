---
name: session-briefing
description: Re-run the full Mr. Bridge session briefing on demand — schedule, important emails, pending tasks, and habit accountability.
user-invocable: true
allowed-tools:
  - Read
  - mcp__claude_ai_Google_Calendar__*
  - mcp__claude_ai_Gmail__*
model: sonnet
---

Re-run the full session briefing as defined in `.claude/rules/mr-bridge-rules.md`.

Load all memory files, fetch today's calendar events and important emails, then output the briefing in the standard format:

```
## Mr. Bridge — [Day, Date]

### Schedule Today
### Important Emails
### Pending Tasks
### Accountability — Last 7 Days
```
