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

## Fitbit — workout sessions

**Script:** `scripts/sync-fitbit.py`

Pulls explicitly logged workout sessions from Fitbit API. Uses PKCE OAuth 2.0 — no browser extension needed, callback is captured on localhost:8080.

**First-time setup:**
1. Go to [dev.fitbit.com/apps/new](https://dev.fitbit.com/apps/new)
2. Fill in:
   - **Application Name:** Mr. Bridge
   - **Application Type:** Personal
   - **OAuth 2.0 Application Type:** Personal
   - **Redirect URI:** `http://localhost:8080`
   - **Default Access Type:** Read Only
3. Submit → copy **Client ID** and **Client Secret**
4. Run the setup flow:
   ```bash
   python3 scripts/sync-fitbit.py --setup
   ```
5. Browser opens → authorize → token is printed
6. Paste `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_REFRESH_TOKEN` into `.env`

**Run:**
```bash
python3 scripts/sync-fitbit.py           # last 7 days
python3 scripts/sync-fitbit.py --days 30 # last 30 days
```

**Note:** Fitbit rotates refresh tokens on each use. The script updates `.env` automatically — no manual action needed.

---

## Oura Ring — readiness, sleep, HRV, resting HR

**Script:** `scripts/sync-oura.py`

Uses a personal access token (no OAuth flow). Pulls daily readiness score, sleep score, HRV balance, and resting HR.

**First-time setup:**
1. Go to [cloud.ouraring.com/personal-access-tokens](https://cloud.ouraring.com/personal-access-tokens)
2. Click **Create New Personal Access Token** → give it a name → copy the token
3. Add to `.env`:
   ```
   OURA_ACCESS_TOKEN=your_token_here
   ```

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
