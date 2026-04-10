"""
Shared Supabase client helper for sync scripts.
Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
Import as: from _supabase import get_client, log_sync
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


def upsert(client, table: str, rows: list[dict], conflict: str | None = None) -> int:
    if not rows:
        return 0
    kwargs = {"on_conflict": conflict} if conflict else {}
    resp = client.table(table).upsert(rows, **kwargs).execute()
    return len(resp.data)


def log_sync(client, source: str, status: str, records_written: int = 0, error_message: str | None = None):
    client.table("sync_log").insert({
        "source": source,
        "status": status,
        "records_written": records_written,
        "error_message": error_message,
    }).execute()
