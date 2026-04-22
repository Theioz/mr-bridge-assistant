"""
Shared Supabase client helper for sync scripts.
Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
Import as: from _supabase import get_client, get_owner_user_id, upsert
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")


def get_client():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise EnvironmentError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    return create_client(url, key)


def get_owner_user_id() -> str:
    """Return the real owner's user UUID from OWNER_USER_ID env var.
    Raises if not set — sync scripts must never write rows without a user_id
    to avoid touching demo data or writing orphaned rows.
    """
    uid = os.environ.get("OWNER_USER_ID", "")
    if not uid:
        raise EnvironmentError(
            "OWNER_USER_ID must be set in .env. "
            "Run: python3 scripts/print_owner_id.py to get your Supabase auth UID."
        )
    return uid


def upsert(client, table: str, rows: list[dict], conflict: str | None = None) -> int:
    if not rows:
        return 0
    kwargs = {"on_conflict": conflict} if conflict else {}
    resp = client.table(table).upsert(rows, **kwargs).execute()
    return len(resp.data)
