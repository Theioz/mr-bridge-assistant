# Fitness Tracker Setup

Three sync scripts pull data into `memory/fitness_log.md`. Run them manually before sessions to get fresh data.

---

## Google Fit — weight + workouts

**Script:** `scripts/sync-googlefit.py`

Uses the existing Google OAuth credentials in `.env`. Pulls weight (from Renpho via Health Sync) and workout sessions from Google Fit.

**First-time setup:**
Google Fit scopes were added to the refresh token during setup (see `docs/google-oauth-setup.md`). No additional steps needed.

**Run:**
```bash
cd "/Users/jason/Code Projects/mr-bridge-assistant"
python3 scripts/sync-googlefit.py          # last 7 days (default)
python3 scripts/sync-googlefit.py --days 30  # last 30 days
```

**Prerequisites:**
```bash
pip3 install google-auth google-auth-oauthlib python-dotenv
```

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

**Recovery Metrics written to fitness_log.md:**
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

After syncing, commit the updated fitness_log.md:
```bash
git add memory/fitness_log.md
git commit -m "sync: fitness data $(date +%Y-%m-%d)"
git push
```
