---
name: morning-nudge
description: Morning session nudge agent. Fires a macOS push notification reminding you to open a Mr. Bridge session. Run at 8am daily.
tools:
  - Bash(bash *)
model: haiku
permissionMode: acceptEdits
maxTurns: 3
color: yellow
---

## Purpose
Fire a macOS push notification nudging you to open a Mr. Bridge session for the day, then check for any birthdays today and send a separate notification for each.

## Instructions

1. Run:
   ```bash
   bash scripts/notify.sh --title "Mr. Bridge" --message "Morning. Open Claude Code to start your session."
   ```
2. Run (non-fatal — errors do not block completion):
   ```bash
   python3 scripts/check_birthday_notif.py
   ```
3. No memory reads or writes. Notifications only.
