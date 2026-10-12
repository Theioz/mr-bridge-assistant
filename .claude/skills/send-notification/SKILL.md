---
name: send-notification
description: Sends a push notification (ntfy, plus a row in the in-app Notifications page) via scripts/notify.sh. Accepts a title and message. Used by agents and commands to surface alerts to the user.
allowed-tools:
  - Bash(bash *)
user-invocable: false
---

## Task
Send a push notification (ntfy, plus a row in the in-app Notifications history) using `scripts/notify.sh`, a thin wrapper over `scripts/_push.py`. There is no macOS/osascript path any more.

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
- Optional: `--click-url <url>` (opened when the push is tapped) and `--type <type>` (default `general`)
- A failed send exits non-zero — report it rather than assuming delivery
- Do not write to any files
