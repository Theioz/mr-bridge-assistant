#!/usr/bin/env python3
"""
Re-authorizes the Google OAuth token used by the Mr. Bridge web app.

Run this when you need to update GOOGLE_REFRESH_TOKEN in Vercel — e.g. after
adding new scopes (like calendar write access).

Usage:
    python3 scripts/setup-web-oauth.py

Requires credentials.json at the project root (Google Cloud Console →
APIs & Services → Credentials → OAuth 2.0 Client → Download JSON).

After running, copy the printed GOOGLE_REFRESH_TOKEN value into Vercel:
    https://vercel.com/dashboard → mr-bridge-assistant → Settings → Environment Variables
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("[error] Missing dependency. Run: pip3 install google-auth-oauthlib")
    sys.exit(1)

# Scopes required by the web app:
#   - gmail.readonly      → search_gmail, get_email_body tools
#   - calendar            → list all calendars + create_calendar_event (write)
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar",
]

def main():
    creds_file = ROOT / "credentials.json"
    if not creds_file.exists():
        print("[error] credentials.json not found at project root.")
        print("Download it from: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client → Download JSON")
        sys.exit(1)

    print("Opening browser for Google authorization...")
    print("Make sure you approve ALL requested permissions (Gmail + Calendar).\n")

    flow = InstalledAppFlow.from_client_secrets_file(str(creds_file), SCOPES)
    creds = flow.run_local_server(port=0)

    print("\n--- Copy these into Vercel Environment Variables ---")
    print(f"GOOGLE_CLIENT_ID={creds.client_id}")
    print(f"GOOGLE_CLIENT_SECRET={creds.client_secret}")
    print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
    print("\nAlso update web/.env.local with the same values for local dev.")
    print("\nVercel dashboard: https://vercel.com/dashboard → mr-bridge-assistant → Settings → Environment Variables")
    print("After updating Vercel, redeploy for the new token to take effect.")

if __name__ == "__main__":
    main()
