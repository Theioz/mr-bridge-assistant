#!/usr/bin/env python3
"""
Mr. Bridge — Claude Code Hooks
Receives event context via stdin JSON and handles lifecycle events.

Supported hooks:
  PostToolUse — fires after Write or Edit tool completes
  Stop        — fires when a session ends
"""

import json
import sys
import os
import subprocess
from datetime import datetime


def handle_post_tool_use(event: dict):
    """After a Write or Edit tool call, remind to commit if a memory file was touched."""
    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input", {})

    if tool_name not in ("Write", "Edit"):
        return

    file_path = tool_input.get("file_path", "")
    if "/memory/" not in file_path:
        return

    filename = os.path.basename(file_path)
    date = datetime.now().strftime("%Y-%m-%d")
    print(
        f"\n[Mr. Bridge] Memory updated ({filename}) — "
        f"run: git add . && git commit -m \"session: {date} — memory update\" && git push",
        file=sys.stderr
    )


def handle_stop(event: dict):
    """At session end, remind to commit any pending changes."""
    date = datetime.now().strftime("%Y-%m-%d")
    print(
        f"\n[Mr. Bridge] Session ended — if you made changes, run: "
        f"git add . && git commit -m \"session: {date} — <summary>\" && git push",
        file=sys.stderr
    )


def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return
        event = json.loads(raw)
    except (json.JSONDecodeError, Exception):
        return

    hook_type = event.get("hook_type", "")

    if hook_type == "PostToolUse":
        handle_post_tool_use(event)
    elif hook_type == "Stop":
        handle_stop(event)


if __name__ == "__main__":
    main()
