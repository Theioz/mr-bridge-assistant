---
name: stop-timer
description: Stop the active study timer, optionally adjust the logged duration, and write the entry to the appropriate study log in memory/todo.md.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
model: haiku
---

Stop the currently running study timer using the study-timer agent's stop instructions.

If no timer is running, say so. If a timer has been running more than 4 hours, ask for an adjusted duration before logging.
