# Agent: Morning Briefing Nudge
# Schedule: Daily at 8:00 AM
# Trigger type: scheduled

## Purpose
Fire a macOS push notification nudging Jason to open a Mr. Bridge session for the day.

## Instructions

You are Mr. Bridge running a morning nudge. Do the following:

1. Run the notification:
   ```bash
   bash /Users/jason/Code\ Projects/mr-bridge-assistant/scripts/notify.sh \
     --title "Mr. Bridge" \
     --message "Morning. Open Claude Code to start your session."
   ```
2. No memory reads or writes. Notification only.
