#!/usr/bin/env python3
"""
Print the authenticated user's Supabase UUID.
Run this after the multi-tenancy migration to get the value for OWNER_USER_ID in .env.

Usage: python3 scripts/print_owner_id.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(Path(__file__).parent))
from _supabase import get_client


def main():
    client = get_client()
    # List all auth users (service role only)
    resp = client.auth.admin.list_users()
    users = resp if isinstance(resp, list) else getattr(resp, "users", [])

    demo_email = os.environ.get("DEMO_EMAIL", "demo@mr-bridge.app")
    real_users = [u for u in users if getattr(u, "email", "") != demo_email]

    if not real_users:
        print("[error] No non-demo users found in auth.users.")
        sys.exit(1)

    if len(real_users) > 1:
        print("[warn] Multiple non-demo users found — using the first one (oldest).")
        real_users.sort(key=lambda u: getattr(u, "created_at", ""))

    u = real_users[0]
    uid = getattr(u, "id", None)
    email = getattr(u, "email", "unknown")
    print(f"Owner user:  {email}")
    print(f"Owner UUID:  {uid}")
    print()
    print(f"Add to .env:")
    print(f"OWNER_USER_ID={uid}")


if __name__ == "__main__":
    main()
