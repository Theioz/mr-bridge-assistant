#!/usr/bin/env python3
from __future__ import annotations
"""
One-time migration: parse all memory markdown files and insert into Supabase.

Usage:
    python3 scripts/migrate_to_supabase.py
    python3 scripts/migrate_to_supabase.py --dry-run   # preview parsed data, no inserts

Requirements:
    pip3 install supabase python-dotenv
"""

import argparse
import json
import os
import re
import sys
from datetime import date, time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

# ── Setup ──────────────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).parent.parent
MEMORY_DIR = REPO_ROOT / "memory"

load_dotenv(REPO_ROOT / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def get_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# ── Helpers ────────────────────────────────────────────────────────────────────

def parse_table(text: str, header_pattern: str) -> list[list[str]]:
    """
    Extract rows from a markdown table that appears after a heading matching header_pattern.
    Returns a list of row cell lists (skipping header and separator rows).
    """
    lines = text.splitlines()
    in_section = False
    rows = []
    header_found = False

    for line in lines:
        if re.search(header_pattern, line, re.IGNORECASE):
            in_section = True
            header_found = False
            rows = []
            continue

        if in_section:
            stripped = line.strip()
            if stripped.startswith("#"):
                # New section — stop
                break
            if stripped.startswith("|") and stripped.endswith("|"):
                cells = [c.strip() for c in stripped.strip("|").split("|")]
                if not header_found:
                    header_found = True  # first pipe row is the header
                    continue
                if all(re.match(r"^[-:]+$", c) for c in cells):
                    continue  # separator row
                rows.append(cells)

    return rows


def clean(val: str) -> str | None:
    """Return None for placeholder/empty values."""
    if val in ("", "—", "-", "None", "N/A", "TBD"):
        return None
    return val


def parse_float(val: str) -> float | None:
    v = clean(val)
    if v is None:
        return None
    # Strip units: "158.2 lb", "21.8%", "70.2 kg", "lbs"
    v = re.sub(r"[^\d.]", "", v.split()[0])
    try:
        return float(v)
    except ValueError:
        return None


def parse_int(val: str) -> int | None:
    v = clean(val)
    if v is None:
        return None
    m = re.search(r"\d+", v)
    return int(m.group()) if m else None


def parse_duration_hrs(val: str) -> float | None:
    """Parse '7h 44m' → 7.733"""
    v = clean(val)
    if v is None:
        return None
    m = re.match(r"(\d+)h\s*(\d+)m", v)
    if m:
        return round(int(m.group(1)) + int(m.group(2)) / 60, 3)
    m = re.match(r"(\d+)h", v)
    if m:
        return float(m.group(1))
    return None


def parse_time(val: str) -> str | None:
    """Parse 'HH:MM' → 'HH:MM:00' for Postgres time."""
    v = clean(val)
    if v is None:
        return None
    m = re.match(r"(\d{1,2}):(\d{2})", v)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}:00"
    return None


def parse_date(val: str) -> str | None:
    v = clean(val)
    if v is None:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})", v)
    return m.group(1) if m else None


# ── Parsers ────────────────────────────────────────────────────────────────────

def parse_habits(text: str) -> tuple[list[dict], list[dict]]:
    """Return (habit_registry rows, habits rows)."""
    registry = []
    logs = []

    # Habit Registry
    reg_rows = parse_table(text, r"## Habit Registry")
    habit_names = []
    for row in reg_rows:
        if len(row) < 1:
            continue
        name = clean(row[0])
        if not name:
            continue
        registry.append({"name": name, "active": True})
        habit_names.append(name)

    # Daily Log — columns: Date, Floss, Workout, Japanese, Coding, Reading, Water, Sleep, Notes
    log_rows = parse_table(text, r"## Daily Log")
    # Build column → habit name mapping (header row already consumed)
    # We assume the order matches: Floss, Workout, Japanese, Coding, Reading, Water, Sleep
    habit_col_names = ["Floss", "Workout", "Japanese study", "Coding", "Reading", "Water", "Sleep"]

    for row in log_rows:
        if not row or not clean(row[0]):
            continue
        log_date = parse_date(row[0])
        if not log_date:
            continue
        for i, habit_name in enumerate(habit_col_names):
            if i + 1 >= len(row):
                break
            cell = clean(row[i + 1])
            completed = cell is not None and cell.lower() not in ("no", "0", "false")
            logs.append({
                "habit_name": habit_name,
                "date": log_date,
                "completed": completed,
            })

    return registry, logs


def parse_tasks(text: str) -> tuple[list[dict], list[dict]]:
    """Return (tasks rows, study_log rows)."""
    tasks = []
    study = []

    task_rows = parse_table(text, r"## Active Tasks")
    for row in task_rows:
        if len(row) < 2 or not clean(row[1]):
            continue
        tasks.append({
            "title": row[1],
            "priority": clean(row[0].lower()) if clean(row[0]) else None,
            "status": "active",
            "due_date": parse_date(row[2]) if len(row) > 2 else None,
        })

    completed_rows = parse_table(text, r"## Completed Archive")
    for row in completed_rows:
        if len(row) < 2 or not clean(row[1]):
            continue
        tasks.append({
            "title": row[1],
            "priority": None,
            "status": "completed",
            "completed_at": parse_date(row[0]),
        })

    for subject, header in [
        ("Japanese", r"## Japanese Study Log"),
        ("Coding", r"## Coding Log"),
        ("Reading", r"## Reading Log"),
    ]:
        rows = parse_table(text, header)
        for row in rows:
            if not row or not clean(row[0]):
                continue
            log_date = parse_date(row[0])
            if not log_date:
                continue
            # duration in col 1 (e.g. "45 min" or "45")
            dur = None
            if len(row) > 1 and clean(row[1]):
                dur = parse_int(row[1])
            notes = clean(row[-1]) if len(row) > 2 else None
            study.append({
                "date": log_date,
                "subject": subject,
                "duration_mins": dur,
                "notes": notes,
            })

    return tasks, study


def parse_fitness(text: str) -> tuple[list[dict], list[dict], list[dict]]:
    """Return (fitness_log rows, workout_sessions rows, recovery_metrics rows)."""
    fitness = []
    workouts = []
    recovery = []

    # Baseline Metrics — Date | Weight | Body Fat % | BMI | Muscle Mass | Visceral Fat | Notes
    baseline_rows = parse_table(text, r"## Baseline Metrics")
    for row in baseline_rows:
        if not row or not clean(row[0]):
            continue
        log_date = parse_date(row[0])
        if not log_date:
            continue
        weight = parse_float(row[1]) if len(row) > 1 else None
        body_fat = parse_float(row[2]) if len(row) > 2 else None
        bmi = parse_float(row[3]) if len(row) > 3 else None
        muscle = parse_float(row[4]) if len(row) > 4 else None
        # Visceral fat: "visceral: 10.0" or "10.0"
        visceral_raw = clean(row[5]) if len(row) > 5 else None
        visceral = None
        if visceral_raw:
            m = re.search(r"[\d.]+", visceral_raw)
            visceral = float(m.group()) if m else None

        source = "renpho" if body_fat is not None else "google_fit"
        fitness.append({
            "date": log_date,
            "weight_lb": weight,
            "body_fat_pct": body_fat,
            "bmi": bmi,
            "muscle_mass_lb": muscle,
            "visceral_fat": visceral,
            "source": source,
        })

    # Session Log — two formats exist:
    # New: Date | Time | Activity | Duration | Calories | Avg HR | HR Zones | Notes
    # Old: Date | — | "Walk (10 min, 71 cal), Run (24 min, 205 cal)" | | (combined string)
    session_rows = parse_table(text, r"## Session Log")
    for row in session_rows:
        if not row or not clean(row[0]):
            continue
        log_date = parse_date(row[0])
        if not log_date:
            continue

        # Detect format: new format has duration in col 3 as "NN min"
        if len(row) >= 4 and clean(row[3]) and re.search(r"\d+\s*min", clean(row[3]) or ""):
            # New structured format
            start_time = parse_time(row[1]) if len(row) > 1 else None
            activity = clean(row[2]) or "Unknown"
            duration = parse_int(row[3]) if len(row) > 3 else None
            calories = parse_int(row[4]) if len(row) > 4 else None
            avg_hr = parse_int(row[5]) if len(row) > 5 else None
            notes = clean(row[7]) if len(row) > 7 else None
            workouts.append({
                "date": log_date,
                "start_time": start_time,
                "activity": activity,
                "duration_mins": duration,
                "calories": calories,
                "avg_hr": avg_hr,
                "notes": notes,
                "source": "fitbit",
            })
        else:
            # Old combined-string format: parse each segment like "Walk (10 min, 71 cal)"
            combined = " | ".join(c for c in row[1:] if clean(c))
            segments = re.findall(r"([A-Za-z][^(]+)\((\d+)\s*min[^)]*,\s*(\d+)\s*cal\)", combined)
            if not segments:
                # Fallback: treat entire string as a single activity note
                if combined and clean(combined):
                    workouts.append({
                        "date": log_date,
                        "activity": combined.strip(),
                        "source": "fitbit",
                    })
                continue
            for act, dur, cal in segments:
                workouts.append({
                    "date": log_date,
                    "activity": act.strip(),
                    "duration_mins": int(dur),
                    "calories": int(cal),
                    "source": "fitbit",
                })

    # Recovery Metrics
    # Date | Bedtime | Total Sleep | Deep | REM | Avg HRV | Resting HR | Readiness | Sleep Score | Active Cal | Notes
    recovery_rows = parse_table(text, r"## Recovery Metrics")
    for row in recovery_rows:
        if not row or not clean(row[0]):
            continue
        log_date = parse_date(row[0])
        if not log_date:
            continue
        recovery.append({
            "date": log_date,
            "bedtime": parse_time(row[1]) if len(row) > 1 else None,
            "total_sleep_hrs": parse_duration_hrs(row[2]) if len(row) > 2 else None,
            "deep_hrs": parse_duration_hrs(row[3]) if len(row) > 3 else None,
            "rem_hrs": parse_duration_hrs(row[4]) if len(row) > 4 else None,
            "avg_hrv": parse_int(row[5]) if len(row) > 5 else None,
            "resting_hr": parse_int(row[6]) if len(row) > 6 else None,
            "readiness": parse_int(row[7]) if len(row) > 7 else None,
            "sleep_score": parse_int(row[8]) if len(row) > 8 else None,
            "active_cal": parse_int(row[9]) if len(row) > 9 else None,
            "source": "oura",
        })

    return fitness, workouts, recovery


def parse_recipes(text: str) -> list[dict]:
    """Parse recipe library from meal_log.md."""
    recipes = []
    lines = text.splitlines()
    in_library = False
    current_recipe: dict | None = None
    current_section = ""
    ingredients_lines: list[str] = []
    method_lines: list[str] = []
    in_ingredients = False
    in_method = False

    def flush_recipe():
        nonlocal current_recipe, ingredients_lines, method_lines, in_ingredients, in_method
        if current_recipe and current_recipe.get("name"):
            current_recipe["ingredients"] = "\n".join(ingredients_lines).strip() or None
            current_recipe["instructions"] = "\n".join(method_lines).strip() or None
            recipes.append(current_recipe)
        current_recipe = None
        ingredients_lines = []
        method_lines = []
        in_ingredients = False
        in_method = False

    for line in lines:
        stripped = line.strip()

        if re.match(r"^## Recipe Library", stripped):
            in_library = True
            continue

        if in_library and re.match(r"^## ", stripped):
            flush_recipe()
            in_library = False
            continue

        if not in_library:
            continue

        # Category section (### Meal Prep, ### Steaks, etc.)
        if re.match(r"^### ", stripped):
            current_section = stripped.lstrip("#").strip()
            continue

        # Recipe name (#### Name)
        if re.match(r"^#### ", stripped):
            flush_recipe()
            current_recipe = {
                "name": stripped.lstrip("#").strip(),
                "cuisine": None,
                "tags": [current_section] if current_section else [],
            }
            in_ingredients = False
            in_method = False
            continue

        if current_recipe is None:
            continue

        if stripped == "**Ingredients:**":
            in_ingredients = True
            in_method = False
            continue
        if stripped == "**Method:**":
            in_method = True
            in_ingredients = False
            continue
        if re.match(r"^\*\*Method", stripped):
            in_method = True
            in_ingredients = False
            continue

        if stripped == "---":
            continue

        if in_ingredients and stripped.startswith("-"):
            ingredients_lines.append(stripped.lstrip("-").strip())
        elif in_method and re.match(r"^\d+\.", stripped):
            method_lines.append(stripped)
        elif in_method and stripped and not stripped.startswith("|") and not stripped.startswith("#"):
            method_lines.append(stripped)

    flush_recipe()
    return recipes


def parse_profile(text: str) -> list[dict]:
    """Parse profile.md into key-value rows."""
    rows = []
    lines = text.splitlines()
    current_section = ""

    for line in lines:
        stripped = line.strip()
        if re.match(r"^## ", stripped):
            current_section = stripped.lstrip("#").strip()
            continue
        if stripped.startswith("- "):
            content = stripped.lstrip("- ").strip()
            if ":" in content:
                k, _, v = content.partition(":")
                rows.append({
                    "key": f"{current_section}/{k.strip()}",
                    "value": v.strip(),
                })
            else:
                rows.append({
                    "key": f"{current_section}/{content}",
                    "value": "true",
                })

    return rows


def parse_timer_state(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        with open(path) as f:
            data = json.load(f)
        return {
            "active": data.get("active", False),
            "subject": data.get("subject"),
            "category": data.get("category"),
            "start_time": data.get("start_time"),
        }
    except Exception:
        return None


# ── Insert helpers ─────────────────────────────────────────────────────────────

def upsert(client: Client, table: str, rows: list[dict], conflict: str | None = None) -> int:
    if not rows:
        return 0
    kwargs = {}
    if conflict:
        kwargs["on_conflict"] = conflict
    resp = client.table(table).upsert(rows, **kwargs).execute()
    return len(resp.data)


# ── Main ───────────────────────────────────────────────────────────────────────

def main(dry_run: bool = False):
    print(f"Mr. Bridge → Supabase migration {'(DRY RUN)' if dry_run else ''}")
    print(f"Target: {SUPABASE_URL}\n")

    client = None if dry_run else get_client()

    # ── habits.md ──────────────────────────────────────────────────────────────
    habits_text = (MEMORY_DIR / "habits.md").read_text()
    registry_rows, habit_log_rows = parse_habits(habits_text)

    print(f"habit_registry: {len(registry_rows)} habits")
    if dry_run:
        for r in registry_rows:
            print(f"  {r}")
    else:
        upsert(client, "habit_registry", registry_rows, conflict="name")

        # Build name → id map
        existing = client.table("habit_registry").select("id,name").execute().data
        habit_id_map = {r["name"]: r["id"] for r in existing}

        # Resolve habit_id in log rows
        resolved_logs = []
        for row in habit_log_rows:
            hid = habit_id_map.get(row["habit_name"])
            if hid:
                resolved_logs.append({
                    "habit_id": hid,
                    "date": row["date"],
                    "completed": row["completed"],
                })
        if resolved_logs:
            upsert(client, "habits", resolved_logs, conflict="habit_id,date")
        print(f"habits (daily log): {len(resolved_logs)} rows")

    # ── todo.md ────────────────────────────────────────────────────────────────
    todo_text = (MEMORY_DIR / "todo.md").read_text()
    task_rows, study_rows = parse_tasks(todo_text)

    print(f"tasks: {len(task_rows)} rows")
    print(f"study_log: {len(study_rows)} rows")
    if not dry_run:
        if task_rows:
            upsert(client, "tasks", task_rows)
        if study_rows:
            upsert(client, "study_log", study_rows)

    # ── fitness_log.md ─────────────────────────────────────────────────────────
    fitness_text = (MEMORY_DIR / "fitness_log.md").read_text()
    fitness_rows, workout_rows, recovery_rows = parse_fitness(fitness_text)

    print(f"fitness_log: {len(fitness_rows)} rows")
    print(f"workout_sessions: {len(workout_rows)} rows")
    print(f"recovery_metrics: {len(recovery_rows)} rows")
    if dry_run:
        print("  Sample fitness_log:", fitness_rows[:2])
        print("  Sample workout_sessions:", workout_rows[:2])
        print("  Sample recovery_metrics:", recovery_rows[:2])
    else:
        if fitness_rows:
            upsert(client, "fitness_log", fitness_rows)
        if workout_rows:
            upsert(client, "workout_sessions", workout_rows)
        if recovery_rows:
            # date is unique constraint
            upsert(client, "recovery_metrics", recovery_rows, conflict="date")

    # ── meal_log.md ────────────────────────────────────────────────────────────
    meal_text = (MEMORY_DIR / "meal_log.md").read_text()
    recipe_rows = parse_recipes(meal_text)

    print(f"recipes: {len(recipe_rows)} rows")
    if dry_run:
        for r in recipe_rows:
            print(f"  {r['name']} [{', '.join(r['tags'])}]")
    else:
        if recipe_rows:
            upsert(client, "recipes", recipe_rows)

    # ── profile.md ─────────────────────────────────────────────────────────────
    profile_text = (MEMORY_DIR / "profile.md").read_text()
    profile_rows = parse_profile(profile_text)

    print(f"profile: {len(profile_rows)} rows")
    if not dry_run and profile_rows:
        upsert(client, "profile", profile_rows, conflict="key")

    # ── timer_state.json ───────────────────────────────────────────────────────
    timer = parse_timer_state(MEMORY_DIR / "timer_state.json")
    if timer:
        print(f"timer_state: active={timer['active']}, subject={timer['subject']}")
        if not dry_run:
            upsert(client, "timer_state", [timer])
    else:
        print("timer_state: no active timer found")

    # ── Sync log entry ─────────────────────────────────────────────────────────
    if not dry_run:
        total = (len(registry_rows) + len(task_rows) + len(study_rows) +
                 len(fitness_rows) + len(workout_rows) + len(recovery_rows) +
                 len(recipe_rows) + len(profile_rows))
        client.table("sync_log").insert({
            "source": "markdown_migration",
            "status": "ok",
            "records_written": total,
        }).execute()
        print(f"\nDone. {total} total records written.")
    else:
        print("\nDry run complete — no data written.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate memory markdown files to Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, no inserts")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
