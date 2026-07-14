# Fitness Tracker Setup

Two sync scripts pull data from fitness APIs and write directly to Supabase. Run them manually before sessions to get fresh data, or let `scripts/run-syncs.py` / `/api/cron/sync` do it.

---

## Google Health — workouts + body composition

**Script:** `scripts/sync-google-health.py`

Replaced both `sync-fitbit.py` and `sync-googlefit.py` in [#607](https://github.com/Theioz/mr-bridge-assistant/issues/607). The Fitbit Web API is turned down **September 2026** and the Google Fit REST API is deprecated; the Google Health API (`health.googleapis.com/v4`) supersedes both.

Writes:
- `workout_sessions` — activity, duration, calories, average HR, and per-session heart-rate zones
- `fitness_log` — weight, body fat %, and a **derived** BMI (source: `google_health`)

**First-time setup:**
1. In [Google Cloud Console](https://console.cloud.google.com/apis/library/health.googleapis.com), enable the **Google Health API** on the same project as your existing OAuth client.
2. On the **Data Access** page, add both read scopes:
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`

   These are **restricted** scopes. The console will demand verification — verification is only required to exceed 100 users, and Google documents an explicit exception for apps used solely by the developer. Proceed past the warning.
3. Set the publishing status to **In production**. This is not optional: an app in *Testing* is issued refresh tokens that **expire after 7 days**, which would break the unattended cron.
4. Add `https://<your-host>/api/auth/google-health/callback` as an authorized redirect URI on the **existing** OAuth client, and set `GOOGLE_HEALTH_OAUTH_REDIRECT_URI` in `.env`. No new client ID or secret — it reuses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. In the app, go to **Settings → Integrations → Connect Google Health**. Click through the "Google hasn't verified this app" screen. The refresh token is stored encrypted in `user_integrations` under provider `google_health`.

**Why a separate consent from the `google` integration:** Google revokes a refresh token on password change *if that token carries Gmail scopes*. Keeping the health token free of Gmail scopes means a password change can't take the fitness sync down with it. `include_granted_scopes: false` is what keeps the two tokens from merging.

**Run:**
```bash
python3 scripts/sync-google-health.py            # last 7 days (default)
python3 scripts/sync-google-health.py --days 30  # last 30 days
python3 scripts/sync-google-health.py --probe    # print without writing
```

**Known differences from the Fitbit sync it replaced:**
| | Fitbit | Google Health |
|---|---|---|
| Heart-rate zones | `Fat Burn` / `Cardio` / `Peak` | `Light` / `Moderate` / `Vigorous` / `Peak` — four zones, different names. Rows written before the cutover keep the old labels. |
| Workout duration | wall-clock, incl. pauses | `activeDuration`, excludes pauses |
| BMI | supplied directly | **derived** from weight + height. If no `height` sample exists, BMI is null rather than guessed. |
| Recovery (sleep/HRV/RHR) | written to `recovery_metrics` | **not written** — Oura is a strict superset and is the only recovery source |

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

## Recommended workflow

Run before starting a session to get the latest data:
```bash
python3 scripts/run-syncs.py   # runs both in parallel, skips anything synced in the last 30m
```

All sync data writes to Supabase — no file commits needed.
