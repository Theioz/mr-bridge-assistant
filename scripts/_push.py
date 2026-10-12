"""
The one way a script notifies the user: an ntfy push AND a row in `notifications`.

Import:  from _push import push
CLI:     python3 scripts/_push.py --title T --message M [--click-url U] [--type T]
         (scripts/notify.sh is now a thin wrapper around this.)

WHY ONE PATH. Before this, delivery and history were separate: notify.sh posted to ntfy, and only
some scripts also called log_notification. The task-due alerts and coach nudges fired for weeks
(see ~/.mr-bridge/notify.log) while the in-app Notifications page showed nothing but recipe
audits — so the page read as "notifications are broken" when they were not. Every push now
writes both, or says loudly which half failed.

WHAT FAILURE LOOKS LIKE. `push` raises PushError when ntfy does not accept the message — the
caller should let that propagate so cron sees a non-zero exit. A failed history insert is
reported on stderr but does not raise: the user still got the push, which is the half that
matters.

The delivery log (~/.mr-bridge/notify.log) records title, type, click URL and HTTP status. It
deliberately does NOT record the ntfy topic: the topic is the only secret ntfy has, and the old
log line printed it on every send.
"""
from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

LOG_FILE = Path.home() / ".mr-bridge" / "notify.log"
NTFY_BASE = "https://ntfy.sh"
TIMEOUT_SECS = 15


class PushError(RuntimeError):
    pass


def _log(line: str) -> None:
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a") as f:
            f.write(f"[{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}] {line}\n")
    except OSError as e:  # a log we cannot write must not block the push itself
        print(f"[push] could not write {LOG_FILE}: {e}", file=sys.stderr)


def send_ntfy(title: str, message: str, click_url: str | None = None) -> int:
    """POST to ntfy. Returns the HTTP status; raises PushError when not delivered."""
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        raise PushError("NTFY_TOPIC is not set — nothing can be delivered")
    headers = {"Title": title.encode("utf-8").decode("latin-1", "ignore")}
    if click_url:
        headers["Click"] = click_url
    req = urllib.request.Request(
        f"{NTFY_BASE}/{topic}", data=message.encode("utf-8"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
            status = resp.status
    except urllib.error.HTTPError as e:
        status = e.code
    except (urllib.error.URLError, TimeoutError) as e:
        _log(f'title="{title}" status=network-error')
        raise PushError(f"ntfy unreachable: {e}") from e
    if not 200 <= status < 300:
        _log(f'title="{title}" status={status}')
        raise PushError(f"ntfy returned HTTP {status}")
    return status


def push(
    title: str,
    message: str,
    *,
    type_: str = "general",
    click_url: str | None = None,
    client=None,
    user_id: str | None = None,
) -> None:
    """Deliver one notification: ntfy first, then the in-app history row."""
    status = send_ntfy(title, message, click_url)
    _log(f'title="{title}" type={type_} click_url="{click_url or ""}" status={status}')

    try:
        if client is None or user_id is None:
            sys.path.insert(0, str(Path(__file__).parent))
            from _supabase import get_client, get_owner_user_id

            client = client or get_client()
            user_id = user_id or get_owner_user_id()
        client.table("notifications").insert(
            {"user_id": user_id, "type": type_, "title": title, "body": message}
        ).execute()
    except Exception as e:  # noqa: BLE001 — history is secondary; the push already landed
        print(f"[push] delivered, but the in-app history row failed: {e}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description="Send a Mr. Bridge notification")
    ap.add_argument("--title", default="Mr. Bridge")
    ap.add_argument("--message", required=True)
    ap.add_argument("--click-url")
    ap.add_argument("--type", default="general")
    a = ap.parse_args()
    try:
        push(a.title, a.message, type_=a.type, click_url=a.click_url)
    except PushError as e:
        print(f"[push] FAILED: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
