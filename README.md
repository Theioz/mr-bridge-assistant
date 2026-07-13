# Mr. Bridge — Personal AI Assistant

Mr. Bridge is a **self-hosted personal health companion**. It syncs fitness, habit, task and health data from external services into your own Supabase database, and surfaces it through a Next.js web app.

**It runs entirely on your own hardware.** Since 2026-07-13 (#476) it is off Vercel and off Supabase Cloud, running on a homelab node behind a tailnet — and it uses **no Anthropic API key**:

- **Macros come from data, not from a model.** USDA FoodData Central supplies every gram and calorie; a small local model (Ollama) only identifies the food and reads the quantity. Measured: the model was ~2x off on portion weight (a large egg at 105g; real ~50g), so it is never asked to weigh anything.
- **Conversation happens in Claude Code**, through an MCP server (`web/mcp/`) exposing the same 30 tools — on your existing subscription, with no metered API.
- **Only share links are public.** The app itself is tailnet-only.

## Architecture

<img src="docs/architecture.svg" alt="Architecture" width="100%">

[View full size →](docs/architecture.png)

[Architecture decisions & RLS evolution plan →](docs/ARCHITECTURE.md)

## What you get

- **Dashboard** — Personalized briefing with live weather, Google Calendar schedule, Gmail highlights, habit check-in, active tasks, Oura recovery scores, and stock watchlist widget (sparkline + price/change, Polygon.io) in one view
- **Claude Code (MCP)** — the conversational surface. `web/mcp/run.sh` exposes **30 tools** (tasks, habits, fitness, meals, calendar, Gmail read/search, backlog, profile, workouts, stocks, sports) to Claude Code or Claude Desktop. Runs on your Claude subscription — no API key, no metered chat. Laptop/desktop only: claude.ai and the mobile app can only reach *remote* MCP servers, so the web app remains the phone client.
- **Habits** — Daily toggle check-in with 30-day momentum line (rolling 7-day completion rate), per-habit current + personal-best streak rows, weekly radial completion chart, and 90-day history grid
- **Tasks** — Inline editing, priority, relative due dates, completed-tasks accordion; subtask/list hierarchy with progress indicator, expand/collapse, rapid "Add item…" entry optimised for grocery lists; completing a parent cascades to all subtasks
- **Fitness** — Body composition charts (weight + BF%), workout frequency + active calorie charts with daily/weekly granularity toggle (auto-weekly at >90d), full workout history table (start/end time, HR zones, source badge, activity filter); goal progress overlays; window selector wired through to all charts; weekly workout program (Mon–Sun plan cards with warm-up / workout / cool-down phases, expand/collapse, today badge, completed-day checkmark, Google Calendar sync, cancel action with soft-cancel + calendar delete); **inline set-by-set logging** during today's workout (weight / reps / RPE per set, kg or lb display based on your profile), end-of-workout recap with perceived-effort 1–10 and notes, recent-sessions list, and per-exercise sparklines for your top 3 lifts by volume; **expandable exercise technique panel** (tap ▾ on any exercise to show the AI-generated description + form tips); **in-app rest timer** that auto-starts after each logged set (localStorage-persisted, dismissible, optional ntfy.sh push on completion, kill-switch in Settings → Fitness)
- **Journal** — Guided 5-prompt daily reflection + free-write tab; auto-save; collapsible history
- **Weekly Review** — Last 7 days at a glance: habit scores, task completion, workout summary, recovery averages, body comp delta, journal count
- **Meals** — Daily macro summary vs goals. **Food photo analyzer** and **nutrition-label scanner**, both powered by a local model + USDA FoodData Central rather than a cloud API. Describe the dish alongside the photo and your words win: a stated "6oz" is used verbatim rather than re-guessed from pixels, and naming the dish settles identification. Inline-editable review before anything is logged. 7-day meal history and macro trends.
- **Backlog** — Personal media tracker for games, shows, movies, and books. Four tabbed categories with drag-to-reorder stack ranking; automatic metadata import (cover, creator, release date, description) via TMDB (movies + shows), IGDB (games), and OpenLibrary / Google Books (books); status lifecycle (backlog → active → paused → finished / dropped) with lifecycle timestamps; session log for re-watches / re-reads / replays; 0–10 rating and free-form review; shareable public read-only link per item. MCP tools: `list_backlog`, `add_backlog_item`, `update_backlog_item`, `log_backlog_session`.
- **Notifications** — In-app notification center (`/notifications`) showing last 30 days of push notification history; type filter pills (HRV / Weather / Tasks / Birthday); unread indicator (left-border accent + bold title); red badge on the Bell nav icon; auto-marked read on page visit; 30-day TTL auto-cleanup via daily cron
- **Push notifications** — HRV drop alerts, task due-date reminders, weather warnings, birthday reminders, weekly review nudge via ntfy.sh (Android/iOS/macOS)
- **Data export** — one-click JSON or CSV zip of all your data from Settings → Data; one file per user-authored table plus a `_manifest.json` with schema version, timestamp, and row counts; optional date-range filter; encrypted OAuth tokens are deliberately excluded

---

## Prerequisites

This runs on your own hardware. You need:

| What | Notes |
|------|-------|
| **A Linux host with Docker** | The reference deployment is a homelab node (`compute-core`). ~5 GB RAM for the app + Supabase + a 7B model. |
| **Tailscale** (or equivalent) | The app and its database are **tailnet-only** — never publicly routable. Every device you use it from must be on the tailnet. |
| **A domain** | For TLS + hostnames. The reference uses `jl-infra-lab.com` via Cloudflare. |
| **Google Cloud project** | Calendar + Gmail + Fit OAuth. Free. |
| **USDA FoodData Central key** | Free, instant: <https://fdc.nal.usda.gov/api-key-signup.html>. This is where macros come from. |
| **Ollama** | Local model for food identification. CPU is fine. |
| Fitbit / Oura *(optional)* | See [#607](https://github.com/Theioz/mr-bridge-assistant/issues/607) — Fitbit's Web API is deprecated in 2026. |

**No Anthropic API key. No Vercel account. No Supabase Cloud account.** Conversation runs through Claude Code on your existing subscription (see the MCP section).

## Setup guide

### Step 1 — Clone the repo

```bash
git clone https://github.com/Theioz/mr-bridge-assistant.git
cd mr-bridge-assistant
```

### Step 2 — Stand up Supabase (self-hosted)

The Supabase stack lives in the [jl-homelab](https://github.com/Theioz/jl-homelab) repo at `docker/supabase/` — three containers (Postgres 17.6 + GoTrue + PostgREST) plus a tiny local Caddy gateway. See its README for the full bring-up; the short version:

```bash
cd docker/supabase
./gen-keys.sh                # mint JWT_SECRET + anon + service_role keys
docker compose up -d db      # 1. Postgres
docker compose up -d auth    # 2. GoTrue creates the auth schema
./restore.sh                 # 3. restore a dump, if migrating
docker compose up -d rest    # 4. PostgREST
```

Then apply this repo's migrations (`supabase/migrations/`) with `psql` or the Supabase CLI.

**The keys are not interchangeable with Cloud's.** Supabase Cloud issues `sb_publishable_`/`sb_secret_` keys, which are a Cloud-only auth system; self-hosted GoTrue and PostgREST verify **legacy JWTs**. `gen-keys.sh` mints the right kind.

### Step 3 — Get a USDA FoodData Central key

<https://fdc.nal.usda.gov/api-key-signup.html> — free, arrives by email immediately. Set `FDC_API_KEY`.

This is what replaced Claude for nutrition. The macros are read from measured data rather than recalled by a model, which is *more* accurate, not less.


### Step 4 — Set up Google Cloud OAuth

This step enables Calendar, Gmail, and optionally Google Fit. It's the most involved step but only needs to be done once.

**Create a Google Cloud project and enable APIs:**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → click the project dropdown → **New Project**. Name it anything (e.g. `mr-bridge`).
2. In the left sidebar: **APIs & Services → Library**. Search for and enable each of these:
   - **Google Calendar API**
   - **Gmail API**
   - **Fitness API** *(only if you use Google Fit)*

**Configure the OAuth consent screen:**

3. Go to **APIs & Services → OAuth consent screen** → **External** → **Create**.
4. Fill in:
   - App name: anything (e.g. `Mr. Bridge`)
   - User support email: your email
   - Developer contact email: your email
5. Click through Scopes (no changes needed) → **Test users** → add your own Google email address. This is required while the app is in "Testing" status — without it, OAuth will be blocked.
6. Save and continue.

**Create OAuth credentials:**

7. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
8. Application type: **Desktop app**. Name it anything.
9. Click **Download JSON** — save the file somewhere safe. It contains your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**Connect Google in the web app:**

10. After deploying (Step 8), go to **Settings → Integrations → Connect Google**. This opens the Google consent screen and stores your refresh token encrypted in Supabase. No env token is needed.

### Step 5 — Set up fitness integrations *(optional)*

Skip any integrations you don't use. The app works with none, one, or all of them.

**Oura Ring:**
1. Go to [cloud.ouraring.com/personal-access-tokens](https://cloud.ouraring.com/personal-access-tokens) and create a Personal Access Token.
2. In your running app, go to **Settings → Integrations → Connect Oura** and paste the token. It is stored encrypted in `user_integrations`.
3. *(Migration fallback)* If you set `OURA_ACCESS_TOKEN` in `.env` before connecting via Settings, the sync scripts will fall back to it until you connect via UI.

**Fitbit:**
1. Go to [dev.fitbit.com](https://dev.fitbit.com) → **Register an app**.
2. Fill in: Application Name (anything), OAuth 2.0 Application Type → **Personal**, Callback URL → your redirect URI (see below).
3. Copy your `FITBIT_CLIENT_ID` and `FITBIT_CLIENT_SECRET` into `.env`.
4. Set `FITBIT_OAUTH_REDIRECT_URI` in `.env`:
   - Local: `http://localhost:3000/api/auth/fitbit/callback`
   - Production: `https://mr-bridge.jl-infra-lab.com/api/auth/fitbit/callback`
   - Register the same URL under your app's **Callback URL** on dev.fitbit.com.
5. In your running app, go to **Settings → Integrations → Connect Fitbit** and complete the OAuth flow. The refresh token is stored encrypted in `user_integrations` and rotates automatically.

### Step 6 — Set up push notifications via ntfy.sh *(optional)*

1. Install the **ntfy** app on your phone ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iOS](https://apps.apple.com/app/ntfy/id1625396347)).
2. Choose a unique topic name — something like `mr-bridge-yourname-1234`. No account needed.
3. Subscribe to your topic in the app.
4. Set `NTFY_TOPIC` to that same string in your `.env` file.

For platform-specific setup (macOS banners, Android background delivery, Windows) see [docs/notifications-setup.md](docs/notifications-setup.md).

Also set `APP_URL` in `.env` to your app's hostname (e.g. `https://mr-bridge.jl-infra-lab.com`), and `SHARE_BASE_URL` to the public share host.

#### Notification Setup (local cron)

After filling in `.env`, run the installer once to schedule all five check scripts:

```bash
bash scripts/install-notifications.sh
```

This writes idempotent cron entries for:

| Script | Schedule | Alert type |
|---|---|---|
| `check_weather_alert.py` | 07:00 daily | Severe weather |
| `check_daily_alerts.py` | 07:30 daily | Task due-dates (once-per-day) |
| `check_birthday_notif.py` | 08:00 daily | Google Calendar birthdays |
| `check_hrv_alert.py` | 08:30 daily | HRV drop vs 7-day baseline |
| `check_task_due_alerts.py` | 09:00 + 17:00 daily | Task due-dates (per-task 24h dedup) |

Safe to re-run — duplicate entries are never added.

**Delivery log** — every notification attempt appends one line to `~/.mr-bridge/notify.log`:

```
[2026-04-20T08:00:01Z] title="Birthday Today" ntfy_topic=mr-bridge-xyz click_url="https://..." curl_exit=0
```

Tail it to debug silent failures:

```bash
tail -f ~/.mr-bridge/notify.log
```

### Step 7 — Configure environment variables

```bash
cp .env.example .env
```

`.env.example` documents every variable, including which ones are load-bearing. The ones worth reading twice:

| Variable | Why it matters |
|---|---|
| `ENCRYPTION_KEY` | The pgcrypto key for `user_integrations.refresh_token_encrypted` — your Google/Fitbit/Oura **refresh tokens**. Lose it and every integration must be re-authorised by hand. **Prove it decrypts a real row before trusting any restore**: the wrong key restores a healthy-looking database in which every integration silently fails. |
| `SUPABASE_URL` vs `SUPABASE_INTERNAL_URL` | The browser and the server reach Supabase on **different** URLs. The app container has no route to the tailnet vhost, so it uses a node-local gateway. Collapsing these into one breaks every server-side call with `TypeError: fetch failed`. |
| `NTFY_TOPIC` | Mind the spelling. Production once had `NFTY_TOPIC`, and push notifications silently 503'd for months. |
| `SHARE_BASE_URL` | Share links go to people *outside* the tailnet, so they must resolve on the public host. Using `APP_URL` hands recipients an unreachable link. |

`NEXT_PUBLIC_*` values are inlined into the **client bundle at build time**, not read at runtime — so they must be right when the image is built, or the browser silently talks to `undefined`.

### Step 8 — Deploy

The app is a plain Docker image (`web/Dockerfile`, Next.js standalone output). The homelab stacks live in [jl-homelab](https://github.com/Theioz/jl-homelab): `docker/mr-bridge/`, `docker/supabase/`, `docker/ollama/`.

```bash
docker compose build && docker compose up -d
```

**Ingress** — three hostnames, three exposure levels:

| Hostname | Reach | What |
|---|---|---|
| `mr-bridge.<domain>` | **tailnet only** | The full app. Health data is never publicly routable. |
| `supabase.<domain>` | **tailnet only** | The database gateway. It *must* be a real hostname — the browser talks to Supabase directly, so it cannot hide on the Docker network. |
| `share.<domain>` | **public** | Only token-gated `/share/*`, behind a default-deny path allowlist. The dashboard, meals, journal, fitness, settings, admin and the entire API return **404** from the internet. |

**Cron** — `web/vercel.json` is gone. The three jobs (`/api/cron/sync`, `/api/cron/reset-demo`) run from the node's crontab, authenticated with `CRON_SECRET` exactly as before. The weekly planner moved to a Claude Code command (see below).

### Step 8b — Wire up the MCP server (this is the chat)

There is no in-app chat. `web/mcp/server.ts` exposes the same 30 tools to Claude Code:

```bash
# secrets live OUTSIDE the repo — a service-role key in a tree you `git add -A`
# is one typo from publication
bw get notes mr-bridge-env > ~/.mrb-secrets/env && chmod 600 ~/.mrb-secrets/env
```

`.mcp.json` already registers it. Open Claude Code in the repo and the tools are there.

**Laptop/desktop only.** claude.ai and the Claude mobile app can only reach *remote* MCP servers over HTTPS; a stdio server on your machine is invisible to them. The web app remains the phone client — which is the intended split: **phone for logging, laptop for thinking**.


### Step 9 — Connect Google Calendar + Gmail in Claude Code

The CLI assistant uses the claude.ai hosted MCP for Calendar and Gmail (configured in `.mcp.json`).

1. Open Claude Code in the project directory:
```bash
claude .
```
2. Run `/mcp` in the Claude Code session and follow the prompt to authenticate with your Google account.

You only need to do this once. Claude Code will remember the auth for future sessions.

### Step 10 — Seed your profile

Mr. Bridge reads a flat key-value `profile` table in Supabase. Fill in your details one of two ways:

- **Web app** → open the web interface → **Settings** → fill in Display Name, Home Location, Target Weight, nutrition goals, and fitness goals, then save each field. The Appearance section lets you pick System / Light / Dark (persisted to `profile.theme_preference`; header toggle and Settings radio stay in sync). The **Equipment** section lets you log your gym equipment (dumbbell pairs, barbells, resistance bands, etc.) so Bridge proposes exercises within your actual inventory.
- **Chat** → ask Mr. Bridge: *"Set my weight goal to 160 lbs"* or *"My name is Jason"* — the AI writes these directly to Supabase.

### Step 10b — Enable admin access (owner account)

The `/admin` route is gated by `is_admin: true` in your Supabase user metadata. Set it once after deploying:

1. Supabase dashboard → **Authentication** → **Users**
2. Find your owner account row → click **Edit**
3. Under **User Metadata**, add: `{ "is_admin": true }`
4. Save

Navigate to `https://mr-bridge.jl-infra-lab.com/admin` — you should see the tenant list. Non-admin accounts receive a 404 (the route is not advertised).

### Step 11 — First session

```bash
cd mr-bridge-assistant
claude .
```

Mr. Bridge will sync fitness data, query Supabase, fetch your calendar and Gmail, and deliver the session briefing. On your very first run it will ask for your name if it isn't in the profile table yet.

### Step 12 — Set up the weekly planning agent *(optional)*

The weekly planning agent auto-generates your workout schedule and a meal prep task every Sunday. It runs on Claude's infrastructure — no local machine needed — and pushes a notification to your phone when the plan is ready.

**How it works:**

1. The scheduled agent runs `scripts/fetch_planning_data.py` to pull last week's workouts, recovery scores, meals, habits, and body composition from Supabase
2. Claude reasons about the data and produces a structured workout + meal prep plan
3. The agent pipes the plan to `scripts/write_week_plan.py`, which writes `workout_plans` rows (one per workout day) and a `tasks` row (meal prep checklist) to Supabase
4. An ntfy.sh push notification fires on completion

**Register the schedule:**

In a Claude Code session in this repo, run:

```
/schedule
```

When prompted, provide:
- **Task**: fetch prior-week data, reason about it, produce a JSON workout + meal prep plan, and pipe it to `python3 scripts/write_week_plan.py`
- **Schedule**: weekly, Sunday at 8 PM (or your preferred time)
- **Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`, `NTFY_TOPIC` (copy values from your root `.env`)

These secrets are stored securely by the Claude Code platform and injected on every run.

**Manual run (test / backfill):**

```bash
python3 scripts/fetch_planning_data.py    # verify prior-week context output
echo '<json-plan>' | python3 scripts/write_week_plan.py   # write a plan manually
```

`write_week_plan.py` is idempotent: if `workout_plans` rows already exist for the coming Mon–Sun, it exits without writing.

**Delivery log:**

```bash
tail -f ~/.mr-bridge/notify.log
```

---

## Slash commands

| Command | Description |
|---------|-------------|
| `/log-habit [habits...]` | Log habit completions for today |
| `/session-briefing` | Re-run the full session briefing on demand |
| `/weekly-review` | Run the weekly habit + accountability summary |
| `/stop-timer` | Stop the active study timer and log the duration |

---

## Web interface — local development

```bash
cd web
npm install   # also installs the pre-commit hook via the prepare script
npm run dev   # http://localhost:3000
```

Requires `web/.env.local` to be filled in (see Step 7). The app runs entirely against your Supabase instance — the same data you see in production.

---

## Running smoke tests

**Parked (#476).** The Playwright suite cannot run on a GitHub-hosted runner any more,
and no edit to the specs fixes that: the app and Supabase are **tailnet-only**, so a cloud
runner has no route to either and every spec fails at login. `.github/workflows/smoke.yml`
is `workflow_dispatch`-only so it never fails by accident.

Re-enabling means either a self-hosted runner on the tailnet, or standing up a throwaway
Supabase + app inside the job.

The chat specs are **gone** (`chat.spec.ts`, `chat-multi-turn-smoke.spec.ts`,
`tool-status-feedback.spec.ts`) — there is no chat to test. The auth, export and a11y
specs are still valuable and were kept.

```bash
npm run smoke:a11y    # a11y sweep (still useful locally)
```


## File structure

```
mr-bridge-assistant/
├── CLAUDE.md                              # Session bootstrap (loads rules via @path)
├── CHANGELOG.md
├── README.md
├── .env.example                           # Root env var template (Python scripts)
├── .gitignore
├── .mcp.json                              # MCP servers: Google Calendar + Gmail via claude.ai hosted MCP
│
├── supabase/                              # Database schema + migrations
│   ├── config.toml
│   └── migrations/
│       ├── 20260410163801_initial_schema.sql
│       ├── 20260410164609_add_unique_constraints.sql
│       ├── 20260410170000_study_log_unique_constraint.sql
│       ├── 20260411000000_add_journal_entries.sql
│       ├── 20260411000001_recovery_metrics_extended.sql
│       ├── 20260411100000_fitness_log_unique_date_source.sql
│       ├── 20260412000000_add_nutrition_to_meal_log.sql
│       ├── 20260413000000_add_user_id_multitenancy.sql
│       ├── 20260413000001_profile_composite_unique.sql
│       ├── 20260413000002_composite_unique_constraints.sql
│       ├── 20260413000003_journal_entries_composite_unique.sql
│       ├── 20260413000004_workout_sessions_unique_constraint.sql
│       ├── 20260413000005_chat_messages_position.sql
│       ├── 20260413000006_journal_entries_rls_and_constraint.sql
│       ├── 20260413000007_notifications.sql
│       ├── 20260413000008_tasks_parent_id.sql
│       ├── 20260414000000_add_workout_plans.sql
│       ├── 20260414000001_workout_plans_add_name.sql
│       ├── 20260414000002_add_stocks_cache.sql
│       ├── 20260415000000_chat_sessions_soft_delete.sql
│       ├── 20260415000001_add_sports_cache.sql
│       ├── 20260415000002_sports_cache_unique_per_league.sql
│       ├── 20260415000003_habit_registry_icon_key.sql
│       ├── 20260416000000_add_strength_sessions.sql
│       ├── 20260416000001_profile_weight_unit.sql
│       ├── 20260417000000_add_sugar_to_meal_log.sql
│       ├── 20260417000001_fix_multitenant_unique_constraints.sql
│       ├── 20260420000000_chat_messages_add_parts.sql
│       ├── 20260420000001_add_user_integrations.sql
│       ├── 20260421000000_add_user_equipment.sql
│       ├── 20260421000001_add_workout_plan_status.sql
│       ├── 20260421000002_add_exercise_prs.sql
│       ├── 20260421000003_add_user_context_to_meal_log.sql
│       ├── 20260423000000_add_packages.sql
│       ├── 20260423000001_recovery_multi_source.sql
│       ├── 20260423000002_cleanup_recovery_metadata.sql
│       ├── 20260424000000_add_tenant_quotas.sql
│       ├── 20260424000001_add_estimate_user_storage.sql
│       ├── 20260424000002_update_estimate_user_storage.sql
│       ├── 20260424000003_expand_estimate_user_storage.sql
│       ├── 20260424000004_add_admin_audit_log.sql
│       ├── 20260424000005_add_feature_flags.sql
│       ├── 20260424000006_increase_default_token_limit.sql
│       ├── 20260424000007_fix_missing_cascade_tenant_delete.sql
│       ├── 20260426000000_db_generated_timestamps.sql
│       └── 20260430000000_add_backlog.sql
│
├── web/                                   # Next.js web app (self-hosted Docker; web/Dockerfile)
│   ├── .env.local.example                 # Web app env var template
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/                     # Admin-only pages (404 for non-admins; set is_admin: true in Supabase user_metadata)
│   │   │   │   ├── layout.tsx             # Admin gate — notFound() if !is_admin
│   │   │   │   ├── page.tsx               # Tenant list + create/delete user
│   │   │   │   └── tenants/[userId]/page.tsx  # Tenant drill-down: profile, integrations, chat, quota overrides, feature flags, audit log
│   │   │   ├── (protected)/               # Auth-gated pages
│   │   │   │   ├── layout.tsx             # Protected layout with sidebar
│   │   │   │   ├── page.tsx               # Daily briefing dashboard
│   │   │   │   ├── onboarding/page.tsx    # First-run wizard (7 steps) — redirected here by auth callback for new accounts; sets onboarding_completed in profile on finish
│   │   │   │   ├── tasks/page.tsx         # Task management
│   │   │   │   ├── habits/page.tsx        # Habit tracking — add/archive + 7/30/90d history
│   │   │   │   ├── fitness/page.tsx       # Body composition + workouts
│   │   │   │   ├── weekly/page.tsx        # Weekly review — habits, tasks, workouts, recovery, body comp, journal
│   │   │   │   ├── meals/page.tsx         # Meal log + FoodPhotoAnalyzer (photo → Claude vision → macros → log)
│   │   │   │   ├── meals/FoodPhotoAnalyzer.tsx  # Client component: food photo or label scan, serving multiplier, daily macro context
│   │   │   │   ├── journal/page.tsx       # Daily journal — guided 5-prompt flow + free write
│   │   │   │   ├── backlog/page.tsx       # Media backlog — tabbed by type (Games/Shows/Movies/Books)
│   │   │   │   ├── backlog/BacklogClient.tsx  # Tab UI, search-and-import, drag-to-reorder
│   │   │   │   ├── backlog/[id]/page.tsx  # Item detail — status, rating, review, sessions, share
│   │   │   │   ├── backlog/[id]/BacklogDetailClient.tsx  # Item detail client component
│   │   │   │   └── settings/page.tsx      # Profile key-values + nutrition/fitness goal calculator
│   │   │   ├── api/
│   │   │   │   ├── chat/route.ts          # Claude API tool use (26 tools)
│   │   │   │   ├── sync/
│   │   │   │   │   ├── oura/route.ts      # POST — sync last 3d Oura data → recovery_metrics
│   │   │   │   │   ├── fitbit/route.ts    # POST — sync last 7d Fitbit body + workouts
│   │   │   │   │   ├── googlefit/route.ts # POST — sync last 7d Google Fit body comp
│   │   │   │   │   └── packages/route.ts  # POST — sync package deliveries from email → packages table
│   │   │   │   ├── backlog/
│   │   │   │   │   ├── search/route.ts          # GET — proxy TMDB/IGDB/OpenLibrary metadata search
│   │   │   │   │   ├── route.ts                 # GET list, POST create
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── route.ts             # GET detail, PATCH update, DELETE
│   │   │   │   │       ├── sessions/route.ts    # GET + POST sessions
│   │   │   │   │       ├── share/route.ts       # POST generate token, DELETE revoke
│   │   │   │   │       └── priority/route.ts    # PATCH priority (drag-to-reorder)
│   │   │   │   ├── cron/
│   │   │   │   │   ├── sync/route.ts      # GET — node crontab hits this; CRON_SECRET auth; daily 6am PST
│   │   │   │   │   └── reset-demo/route.ts # GET — nightly demo data wipe + reseed (CRON_SECRET auth)
│   │   │   │   ├── weather/route.ts       # Open-Meteo forecast (no API key)
│   │   │   │   ├── meals/
│   │   │   │   │   ├── analyze-photo/route.ts   # POST — Claude vision: food macro estimation (mode=food) or exact label reading (mode=label)
│   │   │   │   │   ├── today-totals/route.ts    # GET — sum today's meal_log macros (calories/protein/carbs/fat)
│   │   │   │   │   ├── estimate-macros/route.ts # POST — re-estimate from edited ingredients (Haiku)
│   │   │   │   │   └── log/route.ts             # POST — insert meal_log row; PATCH — inline edit
│   │   │   │   ├── stocks/
│   │   │   │   │   ├── refresh/route.ts         # POST — sync stock_watchlist tickers via syncStocks()
│   │   │   │   │   └── validate/route.ts        # GET — proxy Polygon ticker validation (keeps API key server-side)
│   │   │   │   ├── sports/
│   │   │   │   │   ├── refresh/route.ts         # POST — sync sports_cache for tracked leagues via TheSportsDB
│   │   │   │   │   └── search/route.ts          # GET — search sports events by league/team
│   │   │   │   ├── notifications/
│   │   │   │   │   ├── push/route.ts            # POST — send push notification via ntfy.sh
│   │   │   │   │   └── unread-count/route.ts    # GET — count unread notifications for badge
│   │   │   │   ├── packages/
│   │   │   │   │   └── route.ts                 # GET — list tracked package deliveries from packages table
│   │   │   │   ├── strength-sessions/
│   │   │   │   │   └── route.ts                 # GET/POST — strength session log (sets, reps, weight per exercise)
│   │   │   │   ├── workout-plans/
│   │   │   │   │   └── backfill-descriptions/route.ts # POST — AI-generate exercise descriptions for existing plan entries
│   │   │   │   ├── exercise-prs/
│   │   │   │   │   └── backfill/route.ts        # POST — compute personal records from historical strength_session_sets
│   │   │   │   ├── export/
│   │   │   │   │   └── route.ts           # POST — generate per-user JSON/CSV zip of all user-authored tables
│   │   │   │   ├── quota/
│   │   │   │   │   └── route.ts           # GET — daily token/tool-call/demo-turn usage vs caps; is_demo flag
│   │   │   │   ├── usage/
│   │   │   │   │   └── storage/route.ts   # GET — per-category row counts + estimated bytes via estimate_user_storage RPC
│   │   │   │   ├── auth/
│   │   │   │   │   ├── google/start/route.ts    # GET — initiate Google OAuth flow
│   │   │   │   │   ├── google/callback/route.ts # GET — handle Google OAuth callback; store encrypted refresh token
│   │   │   │   │   ├── fitbit/start/route.ts    # GET — initiate Fitbit OAuth flow
│   │   │   │   │   └── fitbit/callback/route.ts # GET — handle Fitbit OAuth callback; store encrypted refresh token
│   │   │   │   └── google/
│   │   │   │       ├── calendar/route.ts              # GET — today's Google Calendar events (dashboard widget)
│   │   │   │       ├── calendar/events/route.ts       # GET/POST — create calendar events (chat tool backend)
│   │   │   │       ├── calendar/events/[eventId]/route.ts # PATCH/DELETE — update or delete a specific event
│   │   │   │       ├── calendar/range/route.ts        # GET — events over a date range (weekly workout plan sync)
│   │   │   │       ├── calendar/upcoming-birthday/route.ts # GET — next birthday event from Calendar
│   │   │   │       └── gmail/route.ts                # GET — important unread emails (dashboard widget)
│   │   │   ├── share/
│   │   │   │   └── backlog/[token]/page.tsx # Public read-only backlog item view (no auth; token = auth)
│   │   │   ├── error.tsx                   # Top-level error boundary (friendly + retry)
│   │   │   ├── (protected)/error.tsx       # Protected-route error boundary (retry + dashboard fallback)
│   │   │   └── login/
│   │   │       ├── layout.tsx              # Server shell so client login page can export metadata
│   │   │       └── page.tsx
│   │   ├── components/
│   │   │   ├── nav.tsx                    # Left sidebar (desktop); bottom tab bar + More sheet (mobile)
│   │   │   ├── ui/
│   │   │   │   ├── logo.tsx               # MB monogram SVG
│   │   │   │   └── sheet.tsx              # Radix-Dialog-backed bottom sheet (focus trap, Escape, role=dialog)
│   │   │   ├── chat/                      # Chat UI with markdown rendering + session history
│   │   │   ├── tasks/                     # Task CRUD components
│   │   │   ├── habits/                    # Habit toggle, add/archive UI, momentum line, streak rows, radial
│   │   │   ├── fitness/                   # Body comp, workout freq, active cal, goal charts (Recharts)
│   │   │   │   └── weekly-workout-plan.tsx  # Mon–Sun workout plan cards with phases + Calendar sync
│   │   │   ├── journal/                   # Guided journal flow + history list
│   │   │   ├── settings/
│   │   │   │   ├── watchlist-settings.tsx # Stock watchlist editor (add/remove tickers, server-proxy validation)
│   │   │   │   ├── data-settings.tsx      # Data export UI — format + range picker, POST /api/export, download zip
│   │   │   │   └── usage-settings.tsx     # Usage tab — daily quota progress bars + per-category stored-data sizes
│   │   │   └── dashboard/
│   │   │       ├── empty-state.tsx        # Shared icon+text empty/error state for dashboard widgets
│   │   │       ├── schedule-today.tsx     # Google Calendar card
│   │   │       ├── important-emails.tsx   # Gmail card
│   │   │       ├── sync-button.tsx        # Calls all 3 sync routes; spinner + router.refresh()
│   │   │       ├── tasks-summary.tsx      # Active tasks card
│   │   │       └── watchlist-widget.tsx   # Stock ticker rows: sparkline + price/change; refresh button
│   │   └── lib/
│   │       ├── timezone.ts                # Timezone-aware date helpers (USER_TIMEZONE)
│   │       ├── supabase/                  # Client, server, service clients
│   │       ├── types.ts                   # TypeScript interfaces for all DB tables
│   │       ├── backlog/
│   │       │   ├── tmdb.ts                # TMDB movie + show search (TMDB_API_KEY)
│   │       │   ├── igdb.ts                # IGDB game search (Twitch OAuth client_credentials)
│   │       │   └── openlibrary.ts         # OpenLibrary book search + Google Books fallback
│   │       ├── export/
│   │       │   ├── tables.ts              # Declarative registry of tables included in data export (#67)
│   │       │   └── csv.ts                 # Deterministic CSV serializer (ordered columns, CRLF)
│   │       └── sync/
│   │           ├── oura.ts                # syncOura() — Oura endpoints → recovery_metrics
│   │           ├── fitbit.ts              # syncFitbit() — body comp + workouts; rotating refresh token
│   │           ├── googlefit.ts           # syncGoogleFit() — datasource discovery + aggregate API
│   │           ├── stocks.ts              # syncStocks() — Polygon.io EOD + sparkline → stocks_cache
│   │           └── log.ts                 # logSync() + lastSyncAgeSecs() helpers
│   └── package.json
│
├── .claude/
│   ├── rules/
│   │   └── mr-bridge-rules.md             # Core behavioral rules + session protocol
│   ├── agents/
│   │   ├── nightly-postmortem.md          # 9pm habit check-in agent
│   │   ├── morning-nudge.md               # 8am session nudge agent
│   │   ├── weekly-review.md               # Sunday 8pm weekly summary agent
│   │   ├── study-timer.md                 # Study session timer agent
│   │   └── journal-reminder.md            # 7pm journal reminder (remote trigger)
│   ├── commands/
│   │   ├── log-habit.md                   # /log-habit slash command
│   │   ├── session-briefing.md            # /session-briefing slash command
│   │   ├── weekly-review.md               # /weekly-review slash command
│   │   └── stop-timer.md                  # /stop-timer slash command
│   ├── skills/
│   │   ├── send-notification/SKILL.md     # macOS push notification skill
│   │   └── log-habit/SKILL.md             # Habit logging skill (writes to Supabase)
│   ├── hooks/
│   │   └── scripts/hooks.py               # PostToolUse hook (Python 3)
│   ├── settings.json
│   └── references/
│       └── best-practice/                 # Submodule: shanraisshan/claude-code-best-practice
│
├── .github/
│   └── workflows/
│       └── weekly-review-nudge.yml        # Sunday 8pm ntfy.sh push (runs in cloud)
│
├── docs/
│   ├── notifications-setup.md             # Android, macOS, Windows ntfy setup guide
│   ├── fitness-tracker-setup.md           # Google Fit, Oura, Fitbit, Renpho setup
│   ├── google-oauth-setup.md              # OAuth token setup + refresh guide
│   └── gmail-multi-account.md             # Auto-forwarding + Calendar sharing setup
│
├── scripts/
│   ├── _supabase.py                       # Shared Supabase client + urlopen_with_retry helper
│   ├── requirements.txt                   # Pinned Python dependencies
│   ├── fetch_briefing_data.py             # Queries Supabase → outputs session briefing data (incl. weather)
│   ├── fetch_weather.py                   # Open-Meteo weather helper; location from profile
│   ├── log_habit.py                       # Logs habit completions to Supabase
│   ├── run-syncs.py                       # Parallel sync orchestrator (skip-if-recent logic)
│   ├── sync-googlefit.py                  # Google Fit weight → Supabase fitness_log
│   ├── sync-oura.py                       # Oura Ring → recovery_metrics + workout_sessions
│   ├── sync-fitbit.py                     # Fitbit workouts + body comp → Supabase
│   ├── check_birthday_notif.py            # Birthday push alerts from Google Calendar
│   ├── check_hrv_alert.py                 # HRV drop push alert (vs 7-day baseline)
│   ├── check_task_due_alerts.py           # Task due-date push alerts (grouped, per-task 24h dedup)
│   ├── check_weather_alert.py             # Severe weather push alerts
│   ├── notify.sh                          # Push notifications: macOS (osascript) + Android/Windows (ntfy.sh)
│   └── update-references.sh              # Pull latest best practices submodule
│
└── voice/                                 # Jarvis mode (voice interface)
    ├── bridge_voice.py                    # Wake word → STT → Claude API → TTS
    ├── config.py
    ├── requirements.txt
    └── README.md
```

> All live data (habits, tasks, fitness, recovery, recipes, meals) is stored in **Supabase** — not local files.

---

## Demo Account

A shared demo account lets visitors explore the app without touching real data. The demo user ("Demo User, software engineer, SF") has 30 days of realistic fitness, habit, recovery, meal, chat, and task data pre-loaded. Data resets nightly.

### Using the demo

On the login page, click **"Try the demo"** — it auto-fills credentials and signs you in. No registration required.

Or sign in manually:
- **Email:** `demo@mr-bridge.app`
- **Password:** set in your deployment's `DEMO_PASSWORD` env var (see `.env.example`)

The demo account is fully interactive: toggle habits, add tasks, log meals, browse fitness data. All changes are wiped and reseeded at 3 AM PT each night.

**What's real vs mocked:**
| Feature | Demo behaviour |
|---------|----------------|
| Habits, tasks, fitness, recovery | Real data from Supabase (seeded) |
| Gmail | Hardcoded mock emails |
| Google Calendar | Hardcoded mock events |
| Fitbit / Oura sync | Not connected — seed data covers it |

---

## Self-Hosting

This section used to be a fork-and-deploy-to-Vercel guide. It isn't any more — the
project genuinely self-hosts now (#476), and that changes what you need to know.

### What you are actually running

| Piece | Where |
|---|---|
| Next.js app | Docker (`web/Dockerfile`, standalone output). Built on the node from a git checkout. |
| Supabase | **3 containers** — Postgres 17.6 + GoTrue + PostgREST, plus a small local Caddy gateway. Not Kong, not Realtime, not Storage, not edge-runtime, not analytics, not the pooler. None of them are used. |
| Local model | Ollama (`qwen2.5vl:7b`), CPU, loopback-only. |
| Nutrition data | USDA FoodData Central. |
| Chat | Claude Code + MCP (`web/mcp/`), on your subscription. |

Stacks live in [jl-homelab](https://github.com/Theioz/jl-homelab) under `docker/{mr-bridge,supabase,ollama}/`.

### The four traps

Vercel + Supabase Cloud let the browser and the server share **one URL**. Self-hosting
splits them, and each layer breaks separately — all four are runtime-only failures that
no code review catches:

1. **Server-side fetch.** The app used `NEXT_PUBLIC_SUPABASE_URL` server-side. Once the
   server is inside a tailnet and the URL points at a host it cannot route to, every
   service-role call, cron run and RSC page dies with `TypeError: fetch failed`.
   Fix: a separate `SUPABASE_INTERNAL_URL`.
2. **`host.docker.internal` is not the host's loopback.** It maps to the bridge gateway
   (172.17.0.1), so it cannot reach a container published on `127.0.0.1`. Use a shared
   Docker network.
3. **CORS.** GoTrue answers `OPTIONS` with a bare 204 and **no** `Access-Control-Allow-Origin`
   — upstream, *Kong* adds it. Drop Kong and login fails with a useless "Failed to fetch".
   PostgREST handles its own preflight, which is why only login breaks.
4. **The auth cookie name.** `@supabase/ssr` derives it from the Supabase URL's *hostname*.
   With two different URLs, the browser writes one cookie and the server looks for another.
   Login **succeeds**, then middleware finds no session and bounces you to `/login` forever,
   with no error shown. Pin `cookieOptions.name`.

### Keys do not carry over

Supabase Cloud issues `sb_publishable_` / `sb_secret_` keys — a Cloud-only auth system.
Self-hosted GoTrue and PostgREST verify **legacy JWTs**. Mint them with
`docker/supabase/gen-keys.sh`. (The upside: your Cloud project keeps working on its own
keys, so it stays a genuine rollback.)

### Backups are now your problem

Supabase Cloud's managed PITR does **not** come with you, and this repo's own
Settings → Data export is **not a backup** — it deliberately excludes chat history and
`user_integrations` (the encrypted OAuth tokens), so it cannot restore an account.
Run a nightly `pg_dump` of both the `public` **and** `auth` schemas and put it somewhere
else. `auth` matters because every table foreign-keys to `auth.users(id)` and
`OWNER_USER_ID` is a literal UUID in your env — if those IDs change, everything breaks.

### Required environment

See `.env.example` — it documents every variable and flags the load-bearing ones.
There is **no** `ANTHROPIC_API_KEY`, **no** `GROQ_API_KEY`, and **no** Vercel anything.


## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

---

<sub>Originally built by [Jason Leung](https://github.com/Theioz).</sub>
