---
name: send-notification
description: Sends a macOS push notification via scripts/notify.sh. Accepts a title and message. Used by agents and commands to surface alerts to the user.
allowed-tools:
  - Bash(bash *)
user-invocable: false
---

## Task
Send a macOS push notification using the Mr. Bridge notification script.

## Instructions
Run the following, substituting the provided title and message:

```bash
bash scripts/notify.sh \
  --title "<title>" \
  --message "<message>"
```

## Rules
- Title defaults to "Mr. Bridge" if not specified
- Message is required — do not call without one
- Do not write to any files
