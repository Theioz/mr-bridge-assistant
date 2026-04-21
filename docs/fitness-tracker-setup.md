# Fitness Tracker Setup

Three sync scripts pull data from fitness APIs and write directly to Supabase. Run them manually before sessions to get fresh data.

---

## Google Fit — weight only

**Script:** `scripts/sync-googlefit.py`

Uses the existing Google OAuth credentials in `.env`. Pulls weight from Google Fit (synced from Renpho via Health Sync). Workout data comes from Fitbit instead — Google Fit workout tracking is unreliable due to background step/activity noise.

**First-time setup:**
Google Fit scopes were added to the refresh token during setup (see `docs/google-oauth-setup.md`). No additional steps needed.

**Run:**
```bash
python3 scripts/sync-googlefit.py           # last 7 days (default)
python3 scripts/sync-googlefit.py --days 30 # last 30 days
```

**Prerequisites:**
```bash
pip3 install google-auth google-auth-oauthlib python-dotenv
```

---

## Fitbit — workout sessions + body composition

**Script:** `scripts/sync-fitbit.py`

Pulls explicitly logged workout sessions and body composition (weight/fat/BMI) from Fitbit API.

**First-time setup (web UI — recommended):**
1. Go to [dev.fitbit.com/apps/new](https://dev.fitbit.com/apps/new)
2. Fill in:
   - **Application Name:** Mr. Bridge (or anything)
   - **OAuth 2.0 Application Type:** Personal
   - **Redirect URL:** `http://localhost:3000/api/auth/fitbit/callback`
     *(For production on Vercel, change this to `https://your-app.vercel.app/api/auth/fitbit/callback`.
     Fitbit allows only one redirect URL per app — update it in the app settings when switching from local to prod.)*
   - **Default Access Type:** Read Only
3. Copy **Client ID** and **Client Secret** → add to `web/.env.local`:
   ```
   FITBIT_CLIENT_ID=your_client_id
   FITBIT_CLIENT_SECRET=your_client_secret
   FITBIT_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/fitbit/callback
   ```
4. Restart the dev server so Next.js picks up the new env vars.
5. In the app, go to **Settings → Integrations → Connect Fitbit**. Complete the OAuth flow. Refresh token is stored encrypted in `user_integrations`.

**First-time setup (Python script only — fallback):**
1. Run `python3 scripts/sync-fitbit.py --setup` (uses localhost:8080 redirect).
2. Paste `FITBIT_REFRESH_TOKEN` from the output into `.env`. The script will use this as a fallback until you connect via UI.

**Run:**
```bash
python3 scripts/sync-fitbit.py           # last 7 days
python3 scripts/sync-fitbit.py --days 30 # last 30 days
```

**Note:** Fitbit rotates refresh tokens on each use. The script persists rotated tokens back to `user_integrations` (if connected via UI) or `.env` + the `profile` table (if using the fallback path).

---

## Oura Ring — readiness, sleep, HRV, resting HR

**Script:** `scripts/sync-oura.py`

Uses a Personal Access Token (no OAuth flow).

**First-time setup (web UI — recommended):**
1. Go to [cloud.ouraring.com/personal-access-tokens](https://cloud.ouraring.com/personal-access-tokens) and create a token.
2. In the app, go to **Settings → Integrations → Connect Oura** and paste the token. It is stored encrypted in `user_integrations`.

**First-time setup (env var — owner fallback):**
1. Create a token as above and add to `.env`:
   ```
   OURA_ACCESS_TOKEN=your_token_here
   ```
   The script uses this as a fallback if no `user_integrations` row exists.

**Run:**
```bash
python3 scripts/sync-oura.py           # last 7 days (default)
python3 scripts/sync-oura.py --days 30  # last 30 days
```

**Recovery Metrics written to `recovery_metrics` table in Supabase:**
| Column | Source |
|--------|--------|
| Readiness | `/daily_readiness` score (0–100) |
| Sleep Score | `/daily_sleep` score (0–100) |
| Avg HRV | HRV balance contributor (0–100 scale) |
| Resting HR | Resting heart rate contributor |

**Session briefing:** Mr. Bridge will surface the most recent row under "Recovery" and flag low readiness scores.

---

## Renpho — body fat %, BMI, muscle mass

**Script:** `scripts/sync-renpho.py`

Renpho has no API — requires a manual CSV export from the app.

**Export steps:**
1. Open Renpho app → **Me** tab (bottom right)
2. Tap **Export Data**
3. Select date range → export
4. Share/save the CSV file to your Mac

**Run:**
```bash
python3 scripts/sync-renpho.py ~/Downloads/renpho_export.csv
```

The script auto-detects column names and handles different Renpho app versions. Body fat %, BMI, and muscle mass are written to the Baseline Metrics table alongside weight.

---

## Recommended workflow

Run before starting a session to get the latest data:
```bash
python3 scripts/sync-googlefit.py
python3 scripts/sync-oura.py
```

Run Renpho sync after each weigh-in (weekly or as needed):
```bash
python3 scripts/sync-renpho.py ~/Downloads/renpho_export.csv
```

All sync data writes to Supabase — no file commits needed.
