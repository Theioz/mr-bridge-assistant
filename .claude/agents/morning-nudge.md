---
name: morning-nudge
description: Morning session nudge agent. Fires a macOS push notification reminding Jason to open a Mr. Bridge session. Run at 8am daily.
tools:
  - Bash(bash *)
model: haiku
permissionMode: acceptEdits
maxTurns: 2
---

## Purpose
Fire a macOS push notification nudging Jason to open a Mr. Bridge session for the day.

## Instructions

1. Run:
   ```bash
   bash "/Users/jason/Code Projects/mr-bridge-assistant/scripts/notify.sh" --title "Mr. Bridge" --message "Morning. Open Claude Code to start your session."
   ```
2. No memory reads or writes. Notification only.
