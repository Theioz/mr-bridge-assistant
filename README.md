# Mr. Bridge — Personal AI Assistant

Mr. Bridge is a self-hosted personal AI assistant built on Claude Code. It syncs fitness, habit, task, and health data from external services into your own Supabase database, delivers a live structured briefing when you open a session, and surfaces everything through a Next.js web interface you can access from any device.

## Architecture

<img src="docs/architecture.svg" alt="Architecture" width="100%">

[View full size →](docs/architecture.png)

## What you get

- **Dashboard** — Personalized briefing with live weather, Google Calendar schedule, Gmail highlights, habit check-in, active tasks, Oura recovery scores, and stock watchlist widget (sparkline + price/change, Polygon.io) in one view
- **Chat** — Conversational interface to Mr. Bridge; streams Claude responses with 22 built-in tools (tasks, habits, fitness, profile, Gmail, Calendar read/create/update/delete, recipes, meals, workout plans, workout history, stock quotes, session history); conflict detection and deduplication pre-flight before every calendar create; every state-mutating tool returns a verified `{ ok, error? }` shape with read-after-write verification on calendar mutations, so Bridge surfaces real errors instead of falsely confirming actions; slash command autocomplete
- **Habits** — Daily toggle check-in with 30-day momentum line (rolling 7-day completion rate), per-habit current + personal-best streak rows, weekly radial completion chart, and 90-day history grid
- **Tasks** — Inline editing, priority, relative due dates, completed-tasks accordion; subtask/list hierarchy with progress indicator, expand/collapse, rapid "Add item…" entry optimised for grocery lists; completing a parent cascades to all subtasks
- **Fitness** — Body composition charts (weight + BF%), workout frequency + active calorie charts with daily/weekly granularity toggle (auto-weekly at >90d), full workout history table (start/end time, HR zones, source badge, activity filter); goal progress overlays; window selector wired through to all charts; weekly workout program (Mon–Sun plan cards with warm-up / workout / cool-down phases, expand/collapse, today badge, completed-day checkmark, Google Calendar sync); **inline set-by-set logging** during today's workout (weight / reps / RPE per set, kg or lb display based on your profile), end-of-workout recap with perceived-effort 1–10 and notes, recent-sessions list, and per-exercise sparklines for your top 3 lifts by volume
- **Journal** — Guided 5-prompt daily reflection + free-write tab; auto-save; collapsible history
- **Weekly Review** — Last 7 days at a glance: habit scores, task completion, workout summary, recovery averages, body comp delta, journal count
- **Meals** — Daily macro summary vs goals (calories, protein, carbs, fat, fiber, sugar running total); food photo analyzer (photo → client-side compression → Claude vision → macro estimate → inline-editable review → log) with Bridge chat logging via a propose-then-confirm action card scoped to the analyzer context; nutrition label scanner (photo → Claude reads exact printed values → serving multiplier → log); soft calorie-consistency warning when manually entered calories diverge >10% from macro-derived kcal; HEIC detection with user-friendly guidance; 7-day meal history; "how this fits today" macro context on every scan result
- **Notifications** — In-app notification center (`/notifications`) showing last 30 days of push notification history; type filter pills (HRV / Weather / Tasks / Birthday); unread indicator (left-border accent + bold title); red badge on the Bell nav icon; auto-marked read on page visit; 30-day TTL auto-cleanup via daily cron
- **Push notifications** — HRV drop alerts, task due-date reminders, weather warnings, birthday reminders, weekly review nudge via ntfy.sh (Android/iOS/macOS)

---

## Prerequisites

Have these accounts and tools ready before you start. You do not need to install anything in the repo yet.

| What | Where | Notes |
|------|-------|-------|
| **Claude Code CLI** | `npm install -g @anthropic-ai/claude-code` | Requires Node 20.9+ (Next.js 16 minimum) |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) → API Keys | Billing must be enabled (Settings → Billing) |
| **Supabase account** | [supabase.com](https://supabase.com) | Free tier is fine |
| **Vercel account** | [vercel.com](https://vercel.com) | Free tier is fine |
| **Google account** | [console.cloud.google.com](https://console.cloud.google.com) | For Calendar, Gmail, and optionally Google Fit |
| **Oura account** *(optional)* | [cloud.ouraring.com](https://cloud.ouraring.com) | For sleep and recovery data |
| **Fitbit account** *(optional)* | [dev.fitbit.com](https://dev.fitbit.com) | For body composition and workouts |
| **ntfy app** *(optional)* | ntfy.sh | For push notifications on Android/iOS |

---

## Setup guide

### Step 1 — Fork and clone the repo

Fork the repo to your GitHub account, then clone it:

```bash
git clone --recurse-submodules https://github.com/<your-username>/mr-bridge-assistant.git
cd mr-bridge-assistant
```

### Step 2 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**. Give it any name and choose a region close to you.
2. Once created, go to **Settings → API**. Note these three values — you'll need them for every env file:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon key** — the `anon` / `public` key (safe to use in the browser)
   - **service_role key** — keep this secret; never expose it in client-side code
3. Install the Supabase CLI and push the schema:

```bash
brew install supabase/tap/supabase   # macOS; see supabase.com/docs/guides/cli for other OS
supabase login
supabase link --project-ref <your-project-ref>   # ref is the part of the URL after https://
supabase db push
```

This creates all tables (habits, tasks, fitness_log, recovery_metrics, workout_sessions, strength_sessions, strength_session_sets, meal_log, recipes, profile, journal_entries, notifications, workout_plans, stocks_cache, sports_cache, etc.).

### Step 3 — Get your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) → **API Keys** → **Create key**. Copy the key — it's only shown once.
2. If you haven't added billing yet: **Settings → Billing → Add payment method**. The API requires an active billing method even on free-tier usage.

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

**Get your refresh tokens:**

10. For **Calendar + Gmail** (the main `GOOGLE_REFRESH_TOKEN`):
```bash
python3 scripts/setup-web-oauth.py
```
This opens a browser, asks you to authorize with your Google account, and prints the refresh token.

11. For **Google Fit** (a separate token with fitness scopes) — only if you use Google Fit:
```bash
python3 scripts/sync-googlefit.py --setup
```
This opens a browser and prints `GOOGLE_FIT_REFRESH_TOKEN`.

### Step 5 — Set up fitness integrations *(optional)*

Skip any integrations you don't use. The app works with none, one, or all of them.

**Oura Ring:**
1. Go to [cloud.ouraring.com](https://cloud.ouraring.com) → **Account → Personal Access Tokens → Create token**.
2. Copy the token — this is your `OURA_ACCESS_TOKEN`.

**Fitbit:**
1. Go to [dev.fitbit.com](https://dev.fitbit.com) → **Register an app**.
2. Fill in: Application Name (anything), OAuth 2.0 Application Type → **Personal**, Callback URL → `http://localhost:8080/`.
3. Save — you'll see your `FITBIT_CLIENT_ID` and `FITBIT_CLIENT_SECRET`.
4. Authorize and get the initial refresh token:
```bash
python3 scripts/sync-fitbit.py --setup
```
5. The refresh token rotates on every use, so it's stored in Supabase (not in an env file). Write the initial token with:
```bash
python3 -c "
import sys, os; sys.path.insert(0, 'scripts')
from dotenv import load_dotenv; load_dotenv(dotenv_path='.env')
from _supabase import get_client, get_owner_user_id
uid = get_owner_user_id()
get_client().table('profile').upsert({'user_id': uid, 'key': 'fitbit_refresh_token', 'value': os.environ['FITBIT_REFRESH_TOKEN']}, on_conflict='user_id,key').execute()
print('Done.')
"
```

### Step 6 — Set up push notifications via ntfy.sh *(optional)*

1. Install the **ntfy** app on your phone ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iOS](https://apps.apple.com/app/ntfy/id1625396347)).
2. Choose a unique topic name — something like `mr-bridge-yourname-1234`. No account needed.
3. Subscribe to your topic in the app.
4. Set `NTFY_TOPIC` to that same string in your `.env` file.

For platform-specific setup (macOS banners, Android background delivery, Windows) see [docs/notifications-setup.md](docs/notifications-setup.md).

### Step 7 — Configure environment variables

Two env files are required: one for Python sync scripts (root), one for the Next.js web app.

```bash
cp .env.example .env
cp web/.env.local.example web/.env.local
```

Fill in each file using the values collected in steps 2–6. Every variable has a comment explaining where it comes from.

**Root `.env`** — used by Python scripts (`sync-oura.py`, `sync-fitbit.py`, `check_hrv_alert.py`, etc.):

| Variable | Where to get it |
|----------|----------------|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `GOOGLE_CLIENT_ID` | Google Cloud → Credentials (from downloaded JSON) |
| `GOOGLE_CLIENT_SECRET` | Google Cloud → Credentials (from downloaded JSON) |
| `GOOGLE_REFRESH_TOKEN` | Output of `scripts/setup-web-oauth.py` |
| `OURA_ACCESS_TOKEN` | cloud.ouraring.com → Personal Access Tokens *(optional)* |
| `FITBIT_CLIENT_ID` | dev.fitbit.com → Your app *(optional)* |
| `FITBIT_CLIENT_SECRET` | dev.fitbit.com → Your app *(optional)* |
| `FITBIT_REFRESH_TOKEN` | Output of `scripts/sync-fitbit.py --setup` *(optional; also stored in Supabase)* |
| `FITBIT_WEIGHT_UNIT` | `lbs` or `kg` — must match your Fitbit profile unit setting |
| `GOOGLE_FIT_REFRESH_TOKEN` | Output of `scripts/sync-googlefit.py --setup` *(optional)* |
| `NTFY_TOPIC` | Your chosen ntfy topic string *(optional)* |
| `APP_URL` | Your Vercel deployment URL, e.g. `https://your-app.vercel.app` *(optional — enables notification tap-to-open)* |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `PICOVOICE_ACCESS_KEY` | picovoice.ai *(optional — voice interface only)* |

**`web/.env.local`** — used by the Next.js app and Vercel:

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `GOOGLE_CLIENT_ID` | Google Cloud → Credentials |
| `GOOGLE_CLIENT_SECRET` | Google Cloud → Credentials |
| `GOOGLE_REFRESH_TOKEN` | Output of `scripts/setup-web-oauth.py` |
| `GOOGLE_FIT_REFRESH_TOKEN` | Output of `scripts/sync-googlefit.py --setup` *(optional)* |
| `OURA_ACCESS_TOKEN` | cloud.ouraring.com → Personal Access Tokens *(optional)* |
| `FITBIT_CLIENT_ID` | dev.fitbit.com → Your app *(optional)* |
| `FITBIT_CLIENT_SECRET` | dev.fitbit.com → Your app *(optional)* |
| `FITBIT_WEIGHT_UNIT` | `lbs` or `kg` *(optional)* |
| `USER_TIMEZONE` | IANA timezone, e.g. `America/Los_Angeles` |
| `OWNER_USER_ID` | Your Supabase auth UUID — run `python3 scripts/print_owner_id.py` |
| `CRON_SECRET` | Generate a random string, e.g. `openssl rand -hex 32` |
| `APP_URL` | Your Vercel deployment URL *(optional — enables notification tap-to-open)* |
| `POLYGON_API_KEY` | [polygon.io](https://polygon.io) → Dashboard → API Keys *(optional — stock watchlist widget + `get_stock_quote` chat tool; free tier supports EOD data)* |
| `SPORTSDB_API_KEY` | [thesportsdb.com](https://www.thesportsdb.com/api.php) → personal key *(optional — sports dashboard widget + `get_sports_data` chat tool; defaults to public test key `3` if unset)* |

### Step 8 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → import your GitHub fork.
2. Set the **Root Directory** to `web`.
3. Go to **Settings → Environment Variables** and add every variable from `web/.env.local`, including `CRON_SECRET` and optionally `APP_URL`.
4. Click **Deploy**. Vercel will auto-deploy on every push to `main` going forward.

The `vercel.json` in `web/` schedules a daily sync cron at 6am PST (`0 14 * * *`) that calls `/api/cron/sync` to pull overnight Oura, Fitbit, and Google Fit data before you open the dashboard.

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

- **Web app** → open the web interface → **Settings** → fill in Display Name, Home Location, Target Weight, nutrition goals, and fitness goals, then save each field. The Appearance section lets you pick System / Light / Dark (persisted to `profile.theme_preference`; header toggle and Settings radio stay in sync).
- **Chat** → ask Mr. Bridge: *"Set my weight goal to 160 lbs"* or *"My name is Jason"* — the AI writes these directly to Supabase.

### Step 11 — First session

```bash
cd mr-bridge-assistant
claude .
```

Mr. Bridge will sync fitness data, query Supabase, fetch your calendar and Gmail, and deliver the session briefing. On your very first run it will ask for your name if it isn't in the profile table yet.

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
npm install
npm run dev   # http://localhost:3000
```

Requires `web/.env.local` to be filled in (see Step 7). The app runs entirely against your Supabase instance — the same data you see in production.

---

## Running smoke tests

Automated browser smoke for chat-route and tool changes, using Playwright. Replaces the manual "start dev, sign in, send a message" loop for everything covered by a committed spec. `@playwright/mcp` is also registered in [.mcp.json](.mcp.json) so Claude Code can drive a real browser during sessions.

**One-time setup**

```bash
cd web
npm run smoke:install           # download Chromium (~150 MB)
```

Create a dedicated smoke-test Supabase user (never point smoke at your real account) and fill in `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`, and `SMOKE_SUPABASE_SERVICE_KEY` per `.env.example`. Full walkthrough, including the test-account creation steps, lives in [docs/smoke-testing.md](docs/smoke-testing.md).

**Run**

```bash
cd web
npm run smoke:chat              # the chat smoke (sign in → send → persist)
npm run smoke                   # full suite (currently == smoke:chat)
```

The config auto-starts `next dev` on port 3000 (or reuses a running one). On failure, Playwright writes a trace + screenshot to `web/smoke/test-results/`.

**What's covered:** chat happy-path (send, receive, persist, no console errors). **What stays manual for now:** a11y (axe), perf (Lighthouse), multi-turn + tool-call + mutating-tool flows, iOS Safari, VoiceOver — all tracked as follow-ups to #373. The manual chat-smoke rule still applies for anything outside the committed spec coverage.

---

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
│       └── 20260414000002_add_stocks_cache.sql
│
├── web/                                   # Next.js web interface (deployed on Vercel)
│   ├── .env.local.example                 # Web app env var template
│   ├── src/
│   │   ├── app/
│   │   │   ├── (protected)/               # Auth-gated pages
│   │   │   │   ├── layout.tsx             # Protected layout with sidebar
│   │   │   │   ├── page.tsx               # Daily briefing dashboard
│   │   │   │   ├── tasks/page.tsx         # Task management
│   │   │   │   ├── habits/page.tsx        # Habit tracking — add/archive + 7/30/90d history
│   │   │   │   ├── fitness/page.tsx       # Body composition + workouts
│   │   │   │   ├── weekly/page.tsx        # Weekly review — habits, tasks, workouts, recovery, body comp, journal
│   │   │   │   ├── chat/page.tsx          # Mr. Bridge chat
│   │   │   │   ├── meals/page.tsx         # Meal log + FoodPhotoAnalyzer (photo → Claude vision → macros → log)
│   │   │   │   ├── meals/FoodPhotoAnalyzer.tsx  # Client component: food photo or label scan, serving multiplier, daily macro context
│   │   │   │   ├── journal/page.tsx       # Daily journal — guided 5-prompt flow + free write
│   │   │   │   └── settings/page.tsx      # Profile key-values + nutrition/fitness goal calculator
│   │   │   ├── api/
│   │   │   │   ├── chat/route.ts          # Claude API tool use (16 tools)
│   │   │   │   ├── sync/
│   │   │   │   │   ├── oura/route.ts      # POST — sync last 3d Oura data → recovery_metrics
│   │   │   │   │   ├── fitbit/route.ts    # POST — sync last 7d Fitbit body + workouts
│   │   │   │   │   └── googlefit/route.ts # POST — sync last 7d Google Fit body comp
│   │   │   │   ├── cron/
│   │   │   │   │   └── sync/route.ts      # GET — Vercel cron handler; CRON_SECRET auth; daily 6am PST
│   │   │   │   ├── weather/route.ts       # Open-Meteo forecast (no API key)
│   │   │   │   ├── meals/
│   │   │   │   │   ├── analyze-photo/route.ts   # POST — Claude vision: food macro estimation (mode=food) or exact label reading (mode=label)
│   │   │   │   │   ├── today-totals/route.ts    # GET — sum today's meal_log macros (calories/protein/carbs/fat)
│   │   │   │   │   ├── estimate-macros/route.ts # POST — re-estimate from edited ingredients (Haiku)
│   │   │   │   │   └── log/route.ts             # POST — insert meal_log row; PATCH — inline edit
│   │   │   │   ├── stocks/
│   │   │   │   │   ├── refresh/route.ts         # POST — sync stock_watchlist tickers via syncStocks()
│   │   │   │   │   └── validate/route.ts        # GET — proxy Polygon ticker validation (keeps API key server-side)
│   │   │   │   ├── notifications/
│   │   │   │   │   └── unread-count/route.ts    # GET — count unread notifications for badge
│   │   │   │   └── google/
│   │   │   │       ├── calendar/route.ts  # Today's Google Calendar events
│   │   │   │       └── gmail/route.ts     # Important unread emails
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
│   │   │   │   └── watchlist-settings.tsx # Stock watchlist editor (add/remove tickers, server-proxy validation)
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
│   │       └── sync/
│   │           ├── oura.ts                # syncOura() — Oura endpoints → recovery_metrics
│   │           ├── fitbit.ts              # syncFitbit() — body comp + workouts; rotating refresh token
│   │           ├── googlefit.ts           # syncGoogleFit() — datasource discovery + aggregate API
│   │           ├── stocks.ts              # syncStocks() — Polygon.io EOD + sparkline → stocks_cache
│   │           └── log.ts                 # logSync() + lastSyncAgeSecs() helpers
│   ├── vercel.json                        # Cron: /api/cron/sync daily at 6am PST (0 14 * * *)
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
│   └── gmail-multi-account.md             # POP3 aggregation + Calendar sharing setup
│
├── scripts/
│   ├── _supabase.py                       # Shared Supabase client + urlopen_with_retry helper
│   ├── requirements.txt                   # Pinned Python dependencies
│   ├── setup-web-oauth.py                 # Browser-based OAuth flow → prints GOOGLE_REFRESH_TOKEN
│   ├── fetch_briefing_data.py             # Queries Supabase → outputs session briefing data (incl. weather)
│   ├── fetch_weather.py                   # Open-Meteo weather helper; location from profile
│   ├── log_habit.py                       # Logs habit completions to Supabase
│   ├── run-syncs.py                       # Parallel sync orchestrator (skip-if-recent logic)
│   ├── sync-googlefit.py                  # Google Fit weight → Supabase fitness_log
│   ├── sync-oura.py                       # Oura Ring → recovery_metrics + workout_sessions
│   ├── sync-fitbit.py                     # Fitbit workouts + body comp → Supabase
│   ├── normalize_workout_activities.py    # One-time: normalize activity names to canonical aliases
│   ├── sync-renpho.py                     # Renpho CSV → Supabase fitness_log (deprecated)
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

The demo account is fully interactive: toggle habits, add tasks, chat with the AI, browse fitness data. All changes are wiped and reseeded at 3 AM PT each night.

**What's real vs mocked:**
| Feature | Demo behaviour |
|---------|----------------|
| Habits, tasks, fitness, recovery | Real data from Supabase (seeded) |
| Chat (AI) | Groq Llama 3.3-70b — free tier, no Claude API cost |
| Gmail | Hardcoded mock emails |
| Google Calendar | Hardcoded mock events |
| Fitbit / Oura sync | Not connected — seed data covers it |

---

## Self-Hosting

This repo is designed to run as a personal deployment. If you fork it, choose a unique name for your app before deploying to avoid conflicts.

### Places that reference "mr-bridge" by name

Run a global find-and-replace on these before deploying:

| Location | What to change |
|----------|----------------|
| `web/package.json` → `"name"` | `mr-bridge-web` → your app name |
| Vercel project name | Set in the Vercel dashboard on first deploy |
| Supabase project name | Set when creating the project |
| `.env` → `NEXT_PUBLIC_APP_NAME` (if used) | Your app name |
| Any hardcoded `mr-bridge.app` domains in `.env` | Your domain |

### One-time setup after forking

```bash
# 1. Install dependencies
cd web && npm install
pip3 install -r scripts/requirements.txt

# 2. Copy and fill environment variables
cp .env.example .env
# Edit .env — fill in Supabase, Anthropic, Google OAuth, Groq keys

# 3. Run the schema migration in Supabase SQL editor
# Copy contents of supabase/migrations/ and run in order

# 4. Get your Supabase user ID for OWNER_USER_ID
python3 scripts/print_owner_id.py
# Add OWNER_USER_ID=<uuid> to .env

# 5. Create the demo account in Supabase Auth dashboard
# Email: demo@mr-bridge.app (or your chosen demo email)
# Then add DEMO_EMAIL, DEMO_PASSWORD, DEMO_USER_ID to .env

# 6. Seed the demo account
python3 scripts/seed_demo.py

# 7. Add NEXT_PUBLIC_DEMO_EMAIL and NEXT_PUBLIC_DEMO_PASSWORD to .env
# (these are exposed to the browser to power the "Try demo" button)
```

### Refreshing the demo account between releases

The seed script is idempotent and is what you re-run each release to pick up new tables, widgets, or persona changes. Two entry points:

```bash
# Full wipe + reseed (recommended between releases):
python3 scripts/reset_demo.py --yes

# Seed-only (safe re-run; upserts where constraints allow, inserts new rows otherwise):
python3 scripts/seed_demo.py
```

OAuth-gated integrations are **not** covered by the seed — they require a real auth'd session and have to be re-linked manually from the demo account's Settings page after reset:

- Google Calendar + Gmail (OAuth)
- Oura Ring token
- Fitbit token
- Google Fit token

Before seeding against a fresh Supabase project: apply every migration in `supabase/migrations/` first. The seed script relies on `enable row level security` being active on every multi-tenant table and on the `(user_id, …)` unique constraints from migrations `20260413000002` and `20260417000001` — without them, re-runs will duplicate rows and cross-user collisions become possible.

### Required env vars

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as above (browser-accessible) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (browser) |
| `ANTHROPIC_API_KEY` | Claude API key |
| `GROQ_API_KEY` | Groq API key — free at console.groq.com |
| `OWNER_USER_ID` | Your Supabase auth UUID (run `print_owner_id.py`) |
| `DEMO_USER_ID` | Demo account's Supabase auth UUID |
| `DEMO_EMAIL` | Demo account email |
| `DEMO_PASSWORD` | Demo account password |
| `NEXT_PUBLIC_DEMO_EMAIL` | Same as `DEMO_EMAIL` (exposes "Try demo" button) |
| `NEXT_PUBLIC_DEMO_PASSWORD` | Same as `DEMO_PASSWORD` (powers auto-fill) |
| `CRON_SECRET` | Secret for protecting cron endpoints |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

---

<sub>Originally built by [Jason Leung](https://github.com/Theioz).</sub>
