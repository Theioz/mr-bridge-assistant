# Fitness Tracker Setup

Both fitness integrations are synced by the app, in `web/src/lib/sync/`, and reached through the `/api/cron/sync` route (which also refreshes Plex, stocks and sports). The node's daily cron calls it; `scripts/run-syncs.py` calls the same endpoint for an on-demand refresh before a session. The standalone Python syncs were deleted in [#658](https://github.com/Theioz/mr-bridge-assistant/pull/658) — there is one implementation now, and it needs the app container running.

---

## Google Health — workouts + body composition

**Implementation:** `web/src/lib/sync/google-health.ts`, reached via `/api/cron/sync`.

Superseded the Fitbit and Google Fit syncs in [#607](https://github.com/Theioz/mr-bridge-assistant/issues/607); the Python implementation was later deleted in [#658](https://github.com/Theioz/mr-bridge-assistant/pull/658) when the duplicated sync implementations were collapsed into one. The Fitbit Web API is turned down **September 2026** and the Google Fit REST API is deprecated; the Google Health API (`health.googleapis.com/v4`) supersedes both.

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

**Why a separate consent from the `google` integration:** Google revokes a refresh token on password change *if that token carries Gmail scopes*, and the Calendar consent used to request `gmail.readonly`. Keeping the health token separate meant a password change couldn't take the unattended fitness sync down with it. #693 removed the Gmail scope from the Calendar flow, so that hazard has cleared, but the split stays: an interactive Calendar re-consent still cannot invalidate the fitness token. `include_granted_scopes: false` is what keeps the two tokens from merging.

**Run:**
```bash
python3 scripts/run-syncs.py             # default window, 30-min skip applies
python3 scripts/run-syncs.py --days 30   # backfill 30 days (implies --force)
```

Oura and Google Health sync together in one call to the endpoint. There is no
longer a `--probe` dry run; it went with the Python script it belonged to.

**Known differences from the Fitbit sync it replaced:**
| | Fitbit | Google Health |
|---|---|---|
| Heart-rate zones | `Fat Burn` / `Cardio` / `Peak` | `Light` / `Moderate` / `Vigorous` / `Peak` — four zones, different names. Rows written before the cutover keep the old labels. |
| Workout duration | wall-clock, incl. pauses | `activeDuration`, excludes pauses |
| BMI | supplied directly | **derived** from weight + height. If no `height` sample exists, BMI is null rather than guessed. |
| Recovery (sleep/HRV/RHR) | written to `recovery_metrics` | **not written** — Oura is a strict superset and is the only recovery source |

---

## Oura Ring — readiness, sleep, HRV, resting HR

**Implementation:** `web/src/lib/sync/oura.ts`, reached via `/api/cron/sync`.

Uses **OAuth2**. Oura deprecated Personal Access Tokens, so the old "paste a PAT" flow and the
`OURA_ACCESS_TOKEN` env fallback are gone — nothing in the code reads either.

**First-time setup:**
1. Register an OAuth application with Oura (cloud.ouraring.com) and add
   `https://<your-host>/api/auth/oura/callback` as its redirect URI.
2. Set in the app's env file:
   ```
   OURA_CLIENT_ID=...
   OURA_CLIENT_SECRET=...
   OURA_OAUTH_REDIRECT_URI=https://<your-host>/api/auth/oura/callback
   # OURA_SCOPES="daily spo2"   # optional override; this is the default
   ```
   Without the first three, **Connect Oura** returns "Oura OAuth not configured".
3. In the app, go to **Settings → Integrations → Connect Oura** and approve. The refresh token is
   stored encrypted in `user_integrations` under provider `oura`.

Oura **rotates the refresh token on every exchange**; the sync persists the new one each run. If a
run reports "Oura refresh token rejected", reconnect Oura in Settings.

**Run:**
```bash
python3 scripts/run-syncs.py            # default window
python3 scripts/run-syncs.py --days 30  # backfill 30 days
```

**Main columns written to `recovery_metrics`** (one row per day, `source = 'oura'`):
| Column | Source |
|--------|--------|
| `readiness` | `/daily_readiness` score (0–100) |
| `sleep_score` | `/daily_sleep` score (0–100) |
| `total_sleep_hrs`, `deep_hrs`, `rem_hrs`, `light_hrs`, `awake_hrs`, `bedtime`, `sleep_efficiency` | `/sleep` (the night's `long_sleep` period) |
| `avg_hrv` | `/sleep` `average_hrv` (ms) |
| `resting_hr` | `/sleep` `lowest_heart_rate` (bpm) |
| `active_cal`, `steps`, `activity_score` | `/daily_activity` |
| `spo2_avg`, `vo2_max`, `body_temp_delta` | `/daily_spo2`, `/vo2_max`, readiness `temperature_deviation` (optional endpoints; null when unavailable) |

Stress and resilience levels go into `metadata`.

**Session briefing:** Mr. Bridge surfaces the most recent row under "Recovery" and flags low readiness scores.

---

## Recommended workflow

Run before starting a session to get the latest data:
```bash
python3 scripts/run-syncs.py   # one call to /api/cron/sync; skips anything synced in the last 30 min
```

All sync data writes to Supabase — no file commits needed.
