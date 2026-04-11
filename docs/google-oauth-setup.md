# Google OAuth Setup

This guide covers getting `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` for the `.env` file.

These credentials are **not needed for the Claude Code CLI** (which uses claude.ai hosted MCPs for Gmail/Calendar). They are required for the web app (#10), which calls Google APIs directly from a FastAPI backend.

---

## Step 1 — Get client_id and client_secret

1. Go to [Google Cloud Console](https://console.cloud.google.com) → select your project
2. Navigate to **APIs & Services → Credentials**
3. Under **OAuth 2.0 Client IDs**, click your existing client (or create one: **+ Create Credentials → OAuth client ID → Desktop app**)
4. Copy **Client ID** and **Client Secret** into `.env`

---

## Step 2 — Generate a refresh token

Download `credentials.json` from the OAuth client (Actions → Download JSON) and place it at the project root, then run:

```bash
cd /path/to/mr-bridge-assistant
python3 - <<'EOF'
import json
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]

flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
creds = flow.run_local_server(port=0)

print("GOOGLE_REFRESH_TOKEN=" + creds.refresh_token)
EOF
```

Copy the printed value into `.env` as `GOOGLE_REFRESH_TOKEN`.

Install the dependency if needed:
```bash
pip3 install google-auth-oauthlib
```

After copying the token, delete `credentials.json` from the project root — it is not needed at runtime.

---

## Step 3 — Publish the app (removes 7-day token expiry)

Google Cloud projects in **testing mode** issue refresh tokens that expire after 7 days. Publishing the app removes this limit.

1. Go to **APIs & Services → OAuth consent screen**
2. Click **Publish App** → confirm

The app stays "unverified" — that only affects external users. For personal use it has no impact. Refresh tokens no longer expire (unless unused for 6+ months).

---

## How automatic token refresh works

The web app backend uses the `google-auth` library to refresh tokens silently — no user action needed after initial setup:

```python
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
import os

creds = Credentials(
    token=None,
    refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
    client_id=os.environ["GOOGLE_CLIENT_ID"],
    client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
    token_uri="https://oauth2.googleapis.com/token",
)

if creds.expired or not creds.valid:
    creds.refresh(Request())  # silent, no user action needed
```

Access tokens expire hourly and are refreshed automatically. Refresh tokens don't expire once the app is published.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Token has been expired or revoked` | Regenerate refresh token (Step 2) and publish app (Step 3) |
| `redirect_uri_mismatch` | Use **Desktop app** type, not Web application |
| `access_denied` during OAuth flow | Add your Google account as a test user: **OAuth consent screen → Test users** |
