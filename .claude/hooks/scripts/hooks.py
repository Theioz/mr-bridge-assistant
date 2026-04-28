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
import signal
import subprocess
from datetime import datetime

# Ports and process name fragments to clean up on session stop.
DEV_PORTS = [3000, 3001, 3002, 4000]
DEV_PROC_PATTERNS = ["next-server", "next dev", "next start", "vite", "webpack-dev-server"]


def _pids_on_port(port: int) -> list[int]:
    """Return PIDs listening on the given TCP port (macOS lsof)."""
    try:
        out = subprocess.check_output(
            ["lsof", "-ti", f"tcp:{port}"], text=True, stderr=subprocess.DEVNULL
        )
        return [int(p) for p in out.split() if p.strip().isdigit()]
    except subprocess.CalledProcessError:
        return []


def _pids_matching_pattern(pattern: str) -> list[int]:
    """Return PIDs whose full command line contains pattern (pgrep -f)."""
    try:
        out = subprocess.check_output(
            ["pgrep", "-f", pattern], text=True, stderr=subprocess.DEVNULL
        )
        own_pid = os.getpid()
        return [int(p) for p in out.split() if p.strip().isdigit() and int(p) != own_pid]
    except subprocess.CalledProcessError:
        return []


def _kill_pid(pid: int, label: str) -> bool:
    """SIGTERM a PID, escalate to SIGKILL if still alive after 2 s. Returns True if killed."""
    try:
        os.kill(pid, signal.SIGTERM)
        # Give it 2 seconds to exit gracefully.
        import time
        for _ in range(20):
            time.sleep(0.1)
            try:
                os.kill(pid, 0)  # probe — raises if gone
            except ProcessLookupError:
                print(f"[Mr. Bridge] Killed {label} (pid {pid})", file=sys.stderr)
                return True
        # Still alive — force kill.
        os.kill(pid, signal.SIGKILL)
        print(f"[Mr. Bridge] Force-killed {label} (pid {pid})", file=sys.stderr)
        return True
    except ProcessLookupError:
        return True   # already gone
    except PermissionError:
        print(f"[Mr. Bridge] No permission to kill pid {pid} ({label})", file=sys.stderr)
        return False


def kill_dev_servers() -> int:
    """Kill any lingering dev-server processes. Returns number of processes killed."""
    killed_pids: set[int] = set()

    # 1. Collect by port.
    for port in DEV_PORTS:
        for pid in _pids_on_port(port):
            if pid not in killed_pids:
                if _kill_pid(pid, f"port {port}"):
                    killed_pids.add(pid)

    # 2. Collect by process name pattern (catches processes not yet bound to a port).
    for pattern in DEV_PROC_PATTERNS:
        for pid in _pids_matching_pattern(pattern):
            if pid not in killed_pids:
                if _kill_pid(pid, pattern):
                    killed_pids.add(pid)

    return len(killed_pids)


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
    """At session end, kill dev servers and remind to commit pending changes."""
    n = kill_dev_servers()
    if n:
        print(f"[Mr. Bridge] Cleaned up {n} dev server process(es).", file=sys.stderr)

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
