"""
Non-fatal notification writes to the `notifications` table.
Import as: from _notifications import log_notification
"""
from __future__ import annotations

import sys


def log_notification(client, user_id: str, type_: str, title: str, body: str | None = None) -> None:
    """Insert a row into the notifications table. Non-fatal — errors are printed to stderr."""
    try:
        client.table("notifications").insert({
            "user_id": user_id,
            "type": type_,
            "title": title,
            "body": body,
        }).execute()
    except Exception as e:
        print(f"[notify] Failed to log notification: {e}", file=sys.stderr)
