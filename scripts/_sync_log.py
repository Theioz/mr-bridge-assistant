"""
HTTP retry + sync_log writes.
Import as: from _sync_log import log_sync, urlopen_with_retry, HTTP_TIMEOUT
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

RETRYABLE_CODES = {429, 502, 503}
HTTP_TIMEOUT = 30


def urlopen_with_retry(req: urllib.request.Request, max_retries: int = 3) -> dict:
    """Open a urllib request with timeout and exponential backoff on transient errors."""
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code in RETRYABLE_CODES and attempt < max_retries - 1:
                wait = 2 ** attempt
                print(f"[warn] HTTP {e.code} — retrying in {wait}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("urlopen_with_retry: exceeded max retries")  # unreachable


def log_sync(client, source: str, status: str, records_written: int = 0, error_message: str | None = None):
    client.table("sync_log").insert({
        "source": source,
        "status": status,
        "records_written": records_written,
        "error_message": error_message,
    }).execute()
