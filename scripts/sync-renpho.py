#!/usr/bin/env python3
"""
Sync Renpho body composition data into memory/fitness_log.md Baseline Metrics.
Usage: python3 scripts/sync-renpho.py <path-to-renpho-export.csv>

How to export from Renpho:
  Renpho app → Me (bottom tab) → Export Data → select date range → export CSV
  Drop the exported CSV file anywhere and pass its path as the argument.

Extracts: date, weight, body fat %, BMI, muscle mass, visceral fat
Appends new rows to the Baseline Metrics table (deduplicates by date).
"""

import sys
import csv
import argparse
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
FITNESS_LOG = ROOT / "memory" / "fitness_log.md"

# Renpho CSV column name variants (app uses different names by region/version)
COL_DATE = ["Date", "Time", "Measurement Time"]
COL_TIME = ["Time"]  # separate time column (some exports split date/time)
COL_WEIGHT = ["Weight(lb)", "Weight(lbs)", "Weight (lbs)", "Weight(kg)", "Weight (kg)"]
COL_BODYFAT = ["Body Fat(%)", "Body Fat (%)", "Body Fat Rate(%)"]
COL_BMI = ["BMI"]
COL_MUSCLE = ["Muscle Mass(lb)", "Muscle Mass(lbs)", "Muscle Mass (lbs)", "Muscle Mass(kg)", "Muscle Mass (kg)"]
COL_VISCERAL = ["Visceral Fat", "Visceral Fat Level"]


def find_col(headers, candidates):
    for c in candidates:
        if c in headers:
            return c
    return None


def parse_date(val):
    for fmt in (
        "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%m/%d/%Y %H:%M:%S",
        "%Y.%m.%d %H:%M:%S", "%Y.%m.%d", "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(val.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # fallback: replace dots with dashes and take first 10 chars
    return val.strip().replace(".", "-")[:10]


def existing_dates(log_path):
    if not log_path.exists():
        return set()
    text = log_path.read_text()
    idx = text.find("## Baseline Metrics")
    if idx == -1:
        return set()
    # Only scan within the Baseline Metrics section (stop at next ##)
    next_section = text.find("\n##", idx + 1)
    section_text = text[idx:next_section] if next_section != -1 else text[idx:]
    dates = set()
    for line in section_text.split("\n"):
        if line.startswith("| ") and not line.startswith("| Date") and not line.startswith("| —") and not line.startswith("|---"):
            parts = [p.strip() for p in line.strip("| \n").split("|")]
            if parts and parts[0] and len(parts[0]) == 10:
                dates.add(parts[0])
    return dates


def insert_rows_after_table(section_header, new_rows, log_path):
    text = log_path.read_text()
    lines = text.split("\n")
    section_line = next(
        (i for i, l in enumerate(lines) if l.strip() == section_header), None
    )
    if section_line is None:
        print(f"[error] Section '{section_header}' not found in {log_path.name}")
        return False
    last_table_line = section_line
    for i in range(section_line + 1, len(lines)):
        if lines[i].startswith("|"):
            last_table_line = i
        elif last_table_line > section_line and not lines[i].startswith("|"):
            break
    for j, row in enumerate(new_rows):
        lines.insert(last_table_line + 1 + j, row)
    log_path.write_text("\n".join(lines))
    return True


def main():
    parser = argparse.ArgumentParser(description="Sync Renpho CSV export to fitness_log.md")
    parser.add_argument("csv_file", help="Path to Renpho export CSV file")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    csv_path = Path(args.csv_file)
    if not csv_path.exists():
        print(f"[error] File not found: {csv_path}")
        sys.exit(1)

    if not FITNESS_LOG.exists():
        print(f"[error] {FITNESS_LOG} not found. Copy fitness_log.template.md first.")
        sys.exit(1)

    for encoding in ("utf-8-sig", "utf-8", "iso-8859-1"):
        try:
            open(csv_path, encoding=encoding).read(512)
            break
        except UnicodeDecodeError:
            continue
    else:
        print("[error] Could not detect file encoding (tried utf-8-sig, utf-8, iso-8859-1)")
        sys.exit(1)

    with open(csv_path, newline="", encoding=encoding) as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []

        col_date = find_col(headers, COL_DATE)
        col_time = find_col(headers, COL_TIME)
        col_weight = find_col(headers, COL_WEIGHT)
        col_fat = find_col(headers, COL_BODYFAT)
        col_bmi = find_col(headers, COL_BMI)
        col_muscle = find_col(headers, COL_MUSCLE)
        col_visceral = find_col(headers, COL_VISCERAL)

        if not col_date:
            print(f"[error] Could not find date column. Available: {headers}")
            sys.exit(1)

        rows = []
        seen_dates = set()
        for row in reader:
            # Handle split Date + Time columns (e.g. "2026.04.05" + "07:41:23")
            date_val = row[col_date].strip()
            if col_time and col_time != col_date:
                date = parse_date(date_val)
            else:
                date = parse_date(date_val)

            if date in seen_dates:
                continue
            seen_dates.add(date)

            weight = row.get(col_weight, "—").strip().rstrip("0").rstrip(".") if col_weight else "—"
            weight = weight or "—"
            fat = row.get(col_fat, "—").strip() or "—"
            bmi = row.get(col_bmi, "—").strip() or "—"
            muscle = row.get(col_muscle, "—").strip() if col_muscle else "—"
            muscle = muscle or "—"
            visceral = row.get(col_visceral, "—").strip() or "—"
            rows.append({
                "date": date, "weight": f"{weight} lb", "fat": fat,
                "bmi": bmi, "muscle": f"{muscle} lb", "visceral": visceral,
            })

    existing = existing_dates(FITNESS_LOG)
    new_rows = [r for r in rows if r["date"] not in existing]

    if not new_rows:
        print("[sync-renpho] No new data to add.")
        return

    print(f"\nNew body composition entries ({len(new_rows)}):")
    for r in sorted(new_rows, key=lambda x: x["date"]):
        print(f"  {r['date']} — {r['weight']} | Fat: {r['fat']}% | BMI: {r['bmi']} | Muscle: {r['muscle']} | Visceral: {r['visceral']}")

    if not args.yes:
        confirm = input("\nWrite to fitness_log.md? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    md_rows = [
        f"| {r['date']} | {r['weight']} | {r['fat']}% | {r['bmi']} | {r['muscle']} | visceral: {r['visceral']} |"
        for r in sorted(new_rows, key=lambda x: x["date"])
    ]
    insert_rows_after_table("## Baseline Metrics", md_rows, FITNESS_LOG)
    print(f"[sync-renpho] Added {len(new_rows)} row(s). Commit and push to sync.")


if __name__ == "__main__":
    main()
