#!/usr/bin/env python3
"""
Sync body composition data from Google Fit to Supabase (fitness_log table).
Usage: python3 scripts/sync-googlefit.py [--days 7] [--yes] [--probe] [--setup]

First-time setup / re-auth:
  1. Download credentials.json from Google Cloud Console → OAuth 2.0 client → Download JSON
     Place it at the project root.
  2. Run: python3 scripts/sync-googlefit.py --setup
  3. Add GOOGLE_FIT_REFRESH_TOKEN=<printed value> to .env
  Note: Uses GOOGLE_FIT_REFRESH_TOKEN (fitness scope); falls back to GOOGLE_REFRESH_TOKEN.

Data types queried (all covered by fitness.body.read scope):
  com.google.weight               → weight_lb
  com.google.body_fat_percentage  → body_fat_pct
  com.google.bmi                  → bmi
  com.google.lean_body_mass       → muscle_mass_lb (fat-free mass proxy)
  com.google.hydration            → metadata.body_water_l
  com.google.basal_metabolic_rate → metadata.bmr_kcal
  com.google.height               → metadata.height_m

Note: Workout data is sourced from Fitbit (scripts/sync-fitbit.py) — Google Fit
workout tracking is unreliable due to background step/activity noise.

Requires: google-auth, google-auth-oauthlib, python-dotenv, supabase
  pip3 install google-auth google-auth-oauthlib python-dotenv supabase
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client, upsert, log_sync, urlopen_with_retry


FITNESS_SCOPES = ["https://www.googleapis.com/auth/fitness.body.read"]

BODY_DATA_TYPES = [
    "com.google.weight",
    "com.google.body_fat_percentage",
    "com.google.bmi",
    "com.google.lean_body_mass",
    "com.google.hydration",
    "com.google.basal_metabolic_rate",
    "com.google.height",
]


def setup_oauth():
    """Run first-time or re-auth OAuth flow. Prints GOOGLE_FIT_REFRESH_TOKEN for .env."""
    creds_file = ROOT / "credentials.json"
    if not creds_file.exists():
        print("[error] credentials.json not found at project root.")
        print("Download it from Google Cloud Console → APIs & Services → Credentials → your OAuth client → Download JSON")
        sys.exit(1)
    flow = InstalledAppFlow.from_client_secrets_file(str(creds_file), FITNESS_SCOPES)
    creds = flow.run_local_server(port=0)
    print("\nAdd this to your .env file:")
    print(f"GOOGLE_FIT_REFRESH_TOKEN={creds.refresh_token}")


def get_credentials():
    refresh_token = os.environ.get("GOOGLE_FIT_REFRESH_TOKEN") or os.environ.get("GOOGLE_REFRESH_TOKEN")
    if not refresh_token:
        print("[error] GOOGLE_FIT_REFRESH_TOKEN not set in .env")
        print("Run: python3 scripts/sync-googlefit.py --setup")
        sys.exit(1)
    client_id = os.environ.get("GOOGLE_FIT_CLIENT_ID") or os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_FIT_CLIENT_SECRET") or os.environ.get("GOOGLE_CLIENT_SECRET")
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token",
    )
    creds.refresh(Request())
    return creds


def fit_get(creds, endpoint):
    url = f"https://www.googleapis.com/fitness/v1/users/me/{endpoint}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {creds.token}"})
    try:
        return urlopen_with_retry(req)
    except urllib.error.HTTPError as e:
        print(f"[error] Google Fit API returned {e.code}: {e.read().decode()}")
        sys.exit(1)


def fit_post(creds, endpoint, body):
    url = f"https://www.googleapis.com/fitness/v1/users/me/{endpoint}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    })
    try:
        return urlopen_with_retry(req)
    except urllib.error.HTTPError as e:
        print(f"[error] Google Fit API returned {e.code}: {e.read().decode()}")
        sys.exit(1)


def discover_body_datasources(creds) -> dict[str, list[str]]:
    """List all datasources and return a map of dataTypeName → [dataSourceId].

    Uses the dataSources list API instead of assuming a default datasource exists.
    This avoids the 'no default datasource found' error when a type has no data.
    """
    result = fit_get(creds, "dataSources")
    type_to_sources: dict[str, list[str]] = {}
    for ds in result.get("dataSource", []):
        dt_name = ds.get("dataType", {}).get("name", "")
        if dt_name in BODY_DATA_TYPES:
            ds_id = ds.get("dataStreamId", "")
            if ds_id:
                type_to_sources.setdefault(dt_name, []).append(ds_id)
    return type_to_sources


def fetch_body_composition(creds, start_ms, end_ms) -> tuple[list[dict], dict[str, list[str]]]:
    """Discover available body datasources, then aggregate by dataSourceId.

    Returns (rows, type_to_sources) so the caller can print what was found.
    Rows have one entry per date with all available fields populated.
    """
    type_to_sources = discover_body_datasources(creds)

    if not type_to_sources:
        return [], type_to_sources

    # Build aggregate request using explicit dataSourceIds (avoids 'no default' errors)
    aggregate_by = []
    for dtype, source_ids in type_to_sources.items():
        for sid in source_ids:
            aggregate_by.append({"dataSourceId": sid})

    body = {
        "aggregateBy": aggregate_by,
        "bucketByTime": {"durationMillis": 86400000},
        "startTimeMillis": start_ms,
        "endTimeMillis": end_ms,
    }
    result = fit_post(creds, "dataset:aggregate", body)

    rows = []
    for bucket in result.get("bucket", []):
        date_str = datetime.fromtimestamp(
            int(bucket["startTimeMillis"]) / 1000, tz=timezone.utc
        ).strftime("%Y-%m-%d")

        # Index points by data type name (match via dataSourceId substring)
        by_type: dict[str, list] = {}
        for dataset in bucket.get("dataset", []):
            ds_id = dataset.get("dataSourceId", "")
            for dtype in BODY_DATA_TYPES:
                if dtype in ds_id:
                    by_type.setdefault(dtype, []).extend(dataset.get("point", []))

        def first_fp(dtype):
            points = by_type.get(dtype, [])
            if not points:
                return None
            vals = points[0].get("value", [])
            return vals[0].get("fpVal") if vals else None

        weight_kg = first_fp("com.google.weight")
        lean_kg = first_fp("com.google.lean_body_mass")
        fat_pct = first_fp("com.google.body_fat_percentage")
        bmi_val = first_fp("com.google.bmi")
        hydration_l = first_fp("com.google.hydration")
        bmr = first_fp("com.google.basal_metabolic_rate")
        height_m = first_fp("com.google.height")

        meta = {}
        if hydration_l is not None:
            meta["body_water_l"] = round(hydration_l, 2)
        if bmr is not None:
            meta["bmr_kcal"] = round(bmr, 1)
        if height_m is not None:
            meta["height_m"] = round(height_m, 3)

        row = {
            "date": date_str,
            "weight_lb": round(weight_kg * 2.20462, 1) if weight_kg is not None else None,
            "body_fat_pct": round(fat_pct, 1) if fat_pct is not None else None,
            "bmi": round(bmi_val, 1) if bmi_val is not None else None,
            "muscle_mass_lb": round(lean_kg * 2.20462, 1) if lean_kg is not None else None,
            "metadata": meta if meta else None,
        }
        if any(v is not None for k, v in row.items() if k not in ("date", "metadata")):
            rows.append(row)

    return rows, type_to_sources


def existing_dates(client) -> set:
    # Skip dates that already have body-comp data from a richer source (any row with bf%)
    # and dates we've already written via google_fit (weight-only)
    rich = client.table("fitness_log").select("date").not_.is_("body_fat_pct", "null").execute().data
    gfit = client.table("fitness_log").select("date").eq("source", "google_fit").execute().data
    return {r["date"] for r in rich} | {r["date"] for r in gfit}


def print_probe(rows, type_to_sources):
    print("\n[probe] Registered body datasources:")
    if not type_to_sources:
        print("  (none found — scale may not have synced to Google Fit yet)")
    else:
        for dtype, sources in sorted(type_to_sources.items()):
            for s in sources:
                print(f"  {dtype}")
                print(f"    → {s}")

    if not rows:
        print("\n[probe] No data points in this date range.")
        return
    print(f"\n[probe] {len(rows)} date(s) with data:\n")
    print(f"{'Date':<12} {'Weight':>10} {'Fat%':>7} {'BMI':>6} {'Lean':>10} {'Water(L)':>9} {'BMR':>7} {'Height':>8}")
    print("-" * 72)
    for r in sorted(rows, key=lambda x: x["date"]):
        meta = r.get("metadata") or {}
        print(
            f"{r['date']:<12}"
            f" {str(r['weight_lb']) + ' lb' if r['weight_lb'] is not None else 'None':>10}"
            f" {str(r['body_fat_pct']) + '%' if r['body_fat_pct'] is not None else 'None':>7}"
            f" {str(r['bmi']) if r['bmi'] is not None else 'None':>6}"
            f" {str(r['muscle_mass_lb']) + ' lb' if r['muscle_mass_lb'] is not None else 'None':>10}"
            f" {str(meta.get('body_water_l', 'None')):>9}"
            f" {str(meta.get('bmr_kcal', 'None')):>7}"
            f" {str(meta.get('height_m', 'None')):>8}"
        )


def main():
    parser = argparse.ArgumentParser(description="Sync Google Fit body composition to Supabase")
    parser.add_argument("--days", type=int, default=7, help="Days to fetch (default: 7)")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("--probe", action="store_true", help="Print API results without writing to Supabase")
    parser.add_argument("--setup", action="store_true", help="Run OAuth setup to generate GOOGLE_FIT_REFRESH_TOKEN")
    args = parser.parse_args()

    if args.setup:
        setup_oauth()
        return

    print(f"[sync-googlefit] Fetching body composition for last {args.days} days...")
    creds = get_credentials()
    print("[sync-googlefit] Authenticated.")

    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=args.days)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    rows, type_to_sources = fetch_body_composition(creds, start_ms, end_ms)

    if args.probe:
        print_probe(rows, type_to_sources)
        return

    client = get_client()
    existing = existing_dates(client)
    new_rows = [r for r in rows if r["date"] not in existing]

    if not new_rows:
        print("[sync-googlefit] No new body composition data.")
        return

    print(f"\nNew body composition entries ({len(new_rows)}):")
    for r in sorted(new_rows, key=lambda x: x["date"]):
        parts = [f"weight={r['weight_lb']} lb"]
        if r["body_fat_pct"] is not None:
            parts.append(f"fat={r['body_fat_pct']}%")
        if r["bmi"] is not None:
            parts.append(f"BMI={r['bmi']}")
        if r["muscle_mass_lb"] is not None:
            parts.append(f"lean={r['muscle_mass_lb']} lb")
        print(f"  {r['date']} — {' | '.join(parts)}")

    if not args.yes:
        confirm = input("\nWrite to Supabase? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return

    sb_rows = [
        {**{k: v for k, v in r.items() if v is not None}, "source": "google_fit"}
        for r in sorted(new_rows, key=lambda x: x["date"])
    ]
    written = upsert(client, "fitness_log", sb_rows)
    log_sync(client, "google_fit", "ok", written)
    print(f"[sync-googlefit] Synced {written} row(s) to Supabase.")


if __name__ == "__main__":
    main()
