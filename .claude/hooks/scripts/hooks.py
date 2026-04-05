#!/usr/bin/env python3
"""
Mr. Bridge — Claude Code Hooks
Receives event context via stdin JSON and handles lifecycle events.

Supported hooks:
  PostToolUse — fires after any tool completes
"""

import json
import sys
import os
import subprocess
from datetime import datetime


def handle_post_tool_use(event: dict):
    """After a Write tool call, remind to commit if a memory file was written."""
    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input", {})

    if tool_name != "Write":
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


if __name__ == "__main__":
    main()
