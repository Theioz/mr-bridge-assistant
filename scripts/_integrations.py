"""
Per-user integration token helpers — mirrors web/src/lib/integrations/tokens.ts.

Uses the same encrypt_integration_token / decrypt_integration_token Supabase RPCs
so tokens remain encrypted at rest. Requires ENCRYPTION_KEY env var.

Import as: from _integrations import load_integration, persist_rotated_token
"""
from __future__ import annotations

import os
import sys


def _require_encryption_key() -> str:
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        print("[error] ENCRYPTION_KEY not set in .env", file=sys.stderr)
        sys.exit(1)
    return key


def load_integration(client, user_id: str, provider: str) -> dict | None:
    """Return {refresh_token, scopes, connected_at} for (user_id, provider), or None if not found."""
    key = _require_encryption_key()
    row = (
        client.table("user_integrations")
        .select("refresh_token_encrypted, scopes, connected_at")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .maybe_single()
        .execute()
    ).data
    if not row:
        return None

    result = client.rpc(
        "decrypt_integration_token",
        {"encrypted": row["refresh_token_encrypted"], "key": key},
    ).execute()
    if not result.data:
        print(f"[error] decrypt_integration_token returned no data for {provider}", file=sys.stderr)
        return None

    return {
        "refresh_token": result.data,
        "scopes": row.get("scopes") or [],
        "connected_at": row.get("connected_at"),
    }


def persist_rotated_token(client, user_id: str, provider: str, refresh_token: str) -> None:
    """Encrypt and save a rotated refresh token back to user_integrations."""
    key = _require_encryption_key()
    enc_result = client.rpc(
        "encrypt_integration_token",
        {"token": refresh_token, "key": key},
    ).execute()
    if not enc_result.data:
        print(f"[error] encrypt_integration_token returned no data for {provider}", file=sys.stderr)
        return

    client.table("user_integrations").update(
        {"refresh_token_encrypted": enc_result.data, "updated_at": _now_iso()}
    ).eq("user_id", user_id).eq("provider", provider).execute()


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
