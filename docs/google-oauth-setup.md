# Google OAuth Setup

This guide covers the Google Cloud side of the two Google integrations: **Google Calendar**
(provider `google`) and **Google Health** (provider `google_health`). Both use one OAuth client,
so you need exactly three values in the app's env file:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://<your-host>/api/auth/google/callback
GOOGLE_HEALTH_OAUTH_REDIRECT_URI=https://<your-host>/api/auth/google-health/callback
```

There is **no refresh token in env**. You connect from the running app (Settings → Integrations),
and the app stores the refresh token encrypted in `user_integrations` (see
[ARCHITECTURE.md → OAuth Token Encryption](ARCHITECTURE.md#oauth-token-encryption)).

The Claude Code session briefing does **not** use these credentials — it reads Gmail and Calendar
through the claude.ai connectors. The web app has **no Gmail scope** (removed in #693).

---

## Step 1 — Create the OAuth client

1. [Google Cloud Console](https://console.cloud.google.com) → select (or create) your project.
2. **APIs & Services → Library** → enable the **Google Calendar API**. (For fitness data, also the
   Google Health API — see [fitness-tracker-setup.md](fitness-tracker-setup.md).)
3. **APIs & Services → OAuth consent screen** → External → fill in app name and emails.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, application type
   **Web application**.
5. Under **Authorized redirect URIs**, add both callbacks:
   - `https://<your-host>/api/auth/google/callback`
   - `https://<your-host>/api/auth/google-health/callback`

   The host can be tailnet-only: Google redirects the *browser*, which is on the tailnet, so Google
   never has to reach the URL itself.
6. Copy the client ID and secret into the env file (and Vaultwarden).

---

## Step 2 — Publish the app (removes 7-day token expiry)

Google Cloud projects in **Testing** issue refresh tokens that expire after 7 days, which breaks
the unattended syncs.

1. **APIs & Services → OAuth consent screen**
2. **Publish App** → confirm

The app stays "unverified" — that only matters past 100 users. For a self-hosted single-user app it
has no impact; click through the "Google hasn't verified this app" screen when connecting.

---

## Step 3 — Connect from the app

**Settings → Integrations → Connect Google.** The app requests:

- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`

(`web/src/app/api/auth/google/start/route.ts`.) Google Health is a **separate** consent with its own
button and scopes — see [fitness-tracker-setup.md](fitness-tracker-setup.md).

Both flows set `access_type: "offline"`, `prompt: "consent"` and `include_granted_scopes: false`, so
each connection yields its own refresh token with only its own scopes. A grant made before #693
may still carry `gmail.readonly`; the Integrations page flags it — disconnect and reconnect to
narrow it.

---

## How token refresh works

Access tokens last about an hour. The server exchanges the stored refresh token for a new one when
needed (`web/src/lib/google-auth.ts` loads the decrypted token via `web/src/lib/integrations/tokens.ts`; Python scripts use `scripts/_google.py`). No user
action is needed after the first connection. Refresh tokens do not expire once the app is published,
unless unused for 6+ months or revoked.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Google OAuth not configured` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or `GOOGLE_OAUTH_REDIRECT_URI` is missing from the app's env |
| `redirect_uri_mismatch` | The callback URL in the env file must exactly match an **Authorized redirect URI** on a **Web application** client |
| `Token has been expired or revoked` / "Google is not connected" | Publish the app (Step 2), then disconnect and reconnect in Settings → Integrations |
| "Google did not issue a refresh token" | Revoke the app's access at myaccount.google.com/permissions, then connect again |
| `access_denied` during OAuth flow | While still in Testing, add your Google account under **OAuth consent screen → Test users** |
