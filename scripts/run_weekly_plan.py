#!/usr/bin/env python3
"""
Local runner for the weekly planning agent.
Fetches context from the deployed internal endpoint, calls Claude, writes the plan back.
Use when the Vercel cron times out.

Usage:
  python3 scripts/run_weekly_plan.py --week-start 2026-05-04
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

# Load .env.local
env_file = Path(__file__).parent.parent / "web" / ".env.local"
for line in env_file.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        os.environ[k.strip()] = v.strip()

import anthropic  # noqa: E402 — loaded after env

APP_URL = "https://mr-bridge-assistant.vercel.app"
CRON_SECRET = os.environ["CRON_SECRET"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

HEADERS = {
    "Authorization": f"Bearer {CRON_SECRET}",
    "Content-Type": "application/json",
}


def fetch(url: str, method: str = "GET", body: bytes | None = None) -> tuple[int, str]:
    req = urllib.request.Request(url, data=body, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def extract_json(text: str) -> dict:
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    raw = fence.group(1).strip() if fence else text.strip()
    start, end = raw.index("{"), raw.rindex("}")
    return json.loads(raw[start : end + 1])


PLANNER_SYSTEM = """You are Mr. Bridge's weekly planning agent. Generate a structured workout plan based on the provided planning context.

Return ONLY valid JSON in a code block. Schema:
{
  "workout_days": [
    {
      "date": "YYYY-MM-DD",
      "name": "Push Day",
      "warmup": [{"exercise": "...", "sets": N, "reps": "...", "description": "...", "tips": ["..."]}],
      "workout": [...same shape...],
      "cooldown": [...same shape...],
      "notes": "rationale citing last week's performance data"
    }
  ],
  "meal_prep_task": {
    "title": "Meal prep — week of YYYY-MM-DD",
    "priority": "medium",
    "due_date": "YYYY-MM-DD",
    "category": "nutrition",
    "metadata": {
      "source": "weekly_planning_agent",
      "week_start": "YYYY-MM-DD",
      "recommendations": ["..."]
    }
  }
}

Rules: use preferred_workout_days from profile (default Mon/Tue/Thu/Sat). Include all movement patterns (squat, hinge, push_horizontal, push_vertical, pull_horizontal, pull_vertical, core). Apply progression rules from last week's performance. Surface rationale in notes."""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--week-start", required=True, help="YYYY-MM-DD of the Monday to plan for")
    args = parser.parse_args()

    week_start = args.week_start

    # 1. Fetch planning context from deployed endpoint
    print(f"Fetching planning context for week of {week_start}...")
    status, context_text = fetch(f"{APP_URL}/api/internal/plan?week_start={week_start}")
    if status != 200:
        print(f"Failed to fetch context: {status}\n{context_text}", file=sys.stderr)
        sys.exit(1)
    print(f"Context fetched ({len(context_text)} chars)")

    # 2. Generate plan via Claude
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    print("Generating plan (first pass)...")
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        system=PLANNER_SYSTEM,
        messages=[{"role": "user", "content": context_text}],
    )
    raw_text = msg.content[0].text
    try:
        plan = extract_json(raw_text)
    except Exception as e:
        print(f"JSON parse error: {e}\nRaw output (last 500 chars):\n{raw_text[-500:]}", file=sys.stderr)
        print("Retrying with larger context and explicit JSON instruction...")
        msg2 = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            system=PLANNER_SYSTEM,
            messages=[
                {"role": "user", "content": context_text},
                {"role": "assistant", "content": raw_text},
                {"role": "user", "content": "The JSON you returned was malformed. Return ONLY the corrected, complete JSON object in a single ```json code block. No other text."},
            ],
        )
        plan = extract_json(msg2.content[0].text)
    print(f"Plan generated: {len(plan.get('workout_days', []))} workout days")

    # 3. Write plan back via deployed POST endpoint
    print("Writing plan to Supabase...")
    payload = json.dumps({**plan, "week_start": week_start}).encode()
    status, write_body = fetch(f"{APP_URL}/api/internal/plan", method="POST", body=payload)
    result = json.loads(write_body)

    if status != 200:
        print(f"Write failed ({status}): {write_body}", file=sys.stderr)
        sys.exit(1)

    if result.get("skipped"):
        print(f"Skipped — {result.get('message')}")
    else:
        print(f"Done — {result.get('message')}")
        days = [d["date"] for d in plan.get("workout_days", []) if d.get("date")]
        print("Scheduled:", ", ".join(days))


if __name__ == "__main__":
    main()
