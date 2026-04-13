---
name: stop-timer
description: Stop the active study timer, optionally adjust the logged duration, and insert the entry into the Supabase study_log table.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
model: haiku
---

Stop the currently running study timer using the study-timer agent's stop instructions.

Reads timer state from the `profile` table (key = 'timer_state') and logs the completed session to the `study_log` table.

If no timer is running, say so. If a timer has been running more than 4 hours, ask for an adjusted duration before logging.
