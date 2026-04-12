# Mr. Bridge — Personal Assistant

A personal AI assistant context layer for Claude Code. Syncs fitness, habit, and task data from external APIs into Supabase, delivers a structured session briefing, and tracks accountability across devices. Includes a full Next.js web interface for real-time access from any browser.

## Architecture

```mermaid
flowchart LR
    subgraph devices["Devices"]
        oura["Oura Ring"]
        fitbit["Fitbit"]
        gfit["Google Fit"]
    end

    subgraph scripts["Sync Scripts"]
        so["sync-oura"]
        sf["sync-fitbit"]
        sg["sync-googlefit"]
    end

    db[("Supabase\n14 tables")]

    subgraph web["Next.js · Vercel"]
        cron["cron/sync\ndaily 6am PST"]
        rs["sync/oura\nsync/fitbit\nsync/googlefit"]
        rc["api/chat"]
        rf["fun-fact"]
        rq["daily-quote"]
        rw["weather"]
        rcal["google/calendar"]
        rmail["google/gmail"]
        pg["Dashboard · Habits\nTasks · Fitness\nChat · Journal"]
    end

    subgraph ext["External APIs"]
        cl["Anthropic"]
        gc["Google Calendar"]
        gm["Gmail"]
        om["Open-Meteo"]
    end

    classDef device   fill:#111318,stroke:#10B981,color:#E2E8F0,stroke-width:1.5px
    classDef script   fill:#111318,stroke:#6366F1,color:#E2E8F0,stroke-width:1.5px
    classDef storage  fill:#111318,stroke:#F59E0B,color:#F59E0B,stroke-width:1.5px
    classDef route    fill:#111318,stroke:#38BDF8,color:#E2E8F0,stroke-width:1.5px
    classDef page     fill:#181B24,stroke:#6366F1,color:#E2E8F0,stroke-width:2px
    classDef extapi   fill:#111318,stroke:#475569,color:#94A3B8,stroke-width:1px
    classDef cron     fill:#111318,stroke:#F59E0B,color:#F59E0B,stroke-width:1px,stroke-dasharray:4 2

    class oura,fitbit,gfit device
    class so,sf,sg script
    class db storage
    class rs,rc,rf,rq,rw,rcal,rmail route
    class pg page
    class cl,gc,gm,om extapi
    class cron cron

    oura --> so --> db
    fitbit --> sf --> db
    gfit --> sg --> db

    oura & fitbit & gfit --> rs --> db
    cron --> rs

    db --> pg
    db --> rc
    rc --> db

    cl --> rc & rf & rq
    gc --> rcal --> pg
    gm --> rmail --> pg
    rf & rq & rw --> pg
    om --> rw
```

## Purpose

Mr. Bridge runs like infrastructure — structured over casual, quantified over qualitative, no filler. It pulls live data from Supabase at session start and delivers a concise brief before anything else. All live data is stored in the cloud and accessible from Claude Code, the web interface, or any device.

## File Structure

```
mr-bridge-assistant/
├── CLAUDE.md                              # Session bootstrap (loads rules via @path)
├── CHANGELOG.md
├── README.md
├── .env.example                           # Root env var template (Python scripts)
├── .gitignore
├── .mcp.json                              # MCP servers: DeepWiki (Google Calendar + Gmail via claude.ai hosted MCP)
├── .gitmodules
│
├── supabase/                              # Database schema + migrations
│   ├── config.toml
│   └── migrations/
│       ├── 20260410163801_initial_schema.sql
│       ├── 20260410164609_add_unique_constraints.sql
│       ├── 20260410170000_study_log_unique_constraint.sql
│       ├── 20260411000000_add_journal_entries.sql
│       └── 20260411000001_recovery_metrics_extended.sql
│
├── web/                                   # Next.js web interface (deployed on Vercel)
│   ├── .env.local.example                 # Web app env var template (Supabase, Anthropic, Google, timezone)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (protected)/               # Auth-gated pages
│   │   │   │   ├── layout.tsx             # Protected layout with sidebar
│   │   │   │   ├── page.tsx               # Daily briefing dashboard
│   │   │   │   ├── tasks/page.tsx         # Task management
│   │   │   │   ├── habits/page.tsx        # Habit tracking — add/archive + 7/30/90d history
│   │   │   │   ├── fitness/page.tsx       # Body composition + workouts
│   │   │   │   ├── chat/page.tsx          # Mr. Bridge chat
│   │   │   │   └── journal/page.tsx       # Daily journal — guided 5-prompt flow
│   │   │   ├── api/
│   │   │   │   ├── chat/route.ts          # Claude API tool use (13 tools: tasks, habits, fitness, profile, Gmail, Calendar read+write, recipes, meals)
│   │   │   │   ├── sync/
│   │   │   │   │   ├── oura/route.ts      # POST — sync last 3d Oura data → recovery_metrics (session auth)
│   │   │   │   │   ├── fitbit/route.ts    # POST — sync last 7d Fitbit body + workouts (session auth; refresh token from profile table)
│   │   │   │   │   └── googlefit/route.ts # POST — sync last 7d Google Fit body comp (session auth)
│   │   │   │   ├── cron/
│   │   │   │   │   └── sync/route.ts      # GET — Vercel cron handler; CRON_SECRET auth; 30-min skip window; all 3 sources in parallel
│   │   │   │   ├── fun-fact/route.ts      # Claude Haiku daily fact + Supabase cache
│   │   │   │   ├── daily-quote/route.ts   # Claude Haiku motivational quote, cached daily in Supabase
│   │   │   │   ├── weather/route.ts       # Open-Meteo forecast (no API key); resolves location from profile
│   │   │   │   └── google/
│   │   │   │       ├── calendar/route.ts  # Today's Google Calendar events
│   │   │   │       └── gmail/route.ts     # Important unread emails
│   │   │   └── login/page.tsx
│   │   ├── components/
│   │   │   ├── nav.tsx                    # Left sidebar (desktop labels / mobile icon rail)
│   │   │   ├── ui/
│   │   │   │   └── logo.tsx               # MB monogram SVG
│   │   │   ├── chat/                      # Chat UI with markdown rendering
│   │   │   ├── tasks/                     # Task CRUD components
│   │   │   ├── habits/                    # Habit toggle, add/archive UI, range-selectable history grid
│   │   │   ├── fitness/                   # Body comp chart (Recharts)
│   │   │   ├── journal/                   # Guided journal flow + history list
│   │   │   └── dashboard/
│   │   │       ├── daily-insights.tsx     # Combined fun fact + quote card (single card, responsive divider)
│   │   │       ├── fun-fact.tsx           # Daily fun fact (used by daily-insights)
│   │   │       ├── daily-quote.tsx        # Daily motivational quote (used by daily-insights)
│   │   │       ├── weather-card.tsx       # Weather inline with greeting header (Open-Meteo)
│   │   │       ├── schedule-today.tsx     # Google Calendar card
│   │   │       ├── important-emails.tsx   # Gmail card
│   │   │       ├── recovery-summary.tsx   # Oura: 3 scores (readiness/sleep/activity), metrics grid (HRV, RHR, SpO2, steps, temp Δ, sleep stages, daytime HR), stress row, 14-day sleep chart; Sync button in header
│   │   │       ├── sync-button.tsx        # Client component; calls all 3 sync routes in parallel; spinner + router.refresh() on completion
│   │   │       ├── recovery-trends.tsx    # 14-day stacked sleep breakdown chart (light/deep/REM)
│   │   │       ├── fitness-summary.tsx    # Body comp + last workout card
│   │   │       ├── inline-sparkline.tsx   # Mini trend sparkline (used in summary cards)
│   │   │       ├── habits-summary.tsx     # Today's habit progress card
│   │   │       ├── tasks-summary.tsx      # Active tasks card
│   │   │       └── recent-chat.tsx        # Last chat message card
│   │   └── lib/
│   │       ├── timezone.ts                # Timezone-aware date helpers (USER_TIMEZONE)
│   │       ├── supabase/                  # Client, server, service clients
│   │       ├── types.ts                   # TypeScript interfaces for all DB tables
│   │       └── sync/
│   │           ├── oura.ts                # syncOura() — all Oura endpoints, upserts recovery_metrics
│   │           ├── fitbit.ts              # syncFitbit() — body comp + workouts; manages rotating refresh token
│   │           ├── googlefit.ts           # syncGoogleFit() — datasource discovery + aggregate API
│   │           └── log.ts                 # logSync() + lastSyncAgeSecs() helpers for sync_log table
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
│   ├── google-oauth-setup.md             # OAuth token setup + refresh guide
│   └── gmail-multi-account.md            # POP3 aggregation + Calendar sharing setup (App Password, label ID resolution)
│
├── memory/                                # Local files (gitignored, archived originals)
│   ├── meal_log.md                        # Recipes — archived original; data lives in Supabase `recipes` table
│   ├── profile.template.md
│   ├── fitness_log.template.md
│   ├── meal_log.template.md
│   ├── todo.template.md
│   └── habits.template.md
│
├── scripts/
│   ├── _supabase.py                       # Shared Supabase client + urlopen_with_retry helper
│   ├── requirements.txt                   # Pinned Python dependencies
│   ├── fetch_briefing_data.py             # Queries Supabase → outputs session briefing data (incl. weather)
│   ├── fetch_weather.py                   # Open-Meteo weather helper; location from profile; reusable
│   ├── log_habit.py                       # Logs habit completions to Supabase
│   ├── migrate_to_supabase.py             # One-time migration: markdown → Supabase
│   ├── run-syncs.py                       # Parallel sync orchestrator (skip-if-recent logic)
│   ├── sync-googlefit.py                  # Google Fit weight → Supabase fitness_log
│   ├── sync-oura.py                       # Oura Ring sync → recovery_metrics + workout_sessions; endpoints: sleep, readiness, activity, spo2, stress, resilience, heartrate, workout
│   ├── sync-fitbit.py                     # Fitbit workouts → Supabase workout_sessions
│   ├── sync-renpho.py                     # Renpho CSV → Supabase fitness_log (deprecated)
│   ├── check_birthday_notif.py            # Birthday push alerts from Google Calendar
│   ├── check_hrv_alert.py                 # HRV drop push alert (vs 7-day baseline)
│   ├── check_daily_alerts.py              # Task due-date push alerts
│   ├── check_weather_alert.py             # Severe weather push alerts (precip/thunder/heat/freeze/wind)
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

## Getting Started

### 1. Clone the repo
```bash
git clone --recurse-submodules https://github.com/<your-username>/mr-bridge-assistant.git
cd mr-bridge-assistant
```

### 2. Set up Supabase
1. Create a free project at [supabase.com](https://supabase.com)
2. Install the Supabase CLI: `brew install supabase/tap/supabase`
3. Link and push the schema:
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

### 3. Set up environment variables
Two env files are required — one for Python scripts, one for the web app:

```bash
# Root — Python sync scripts
cp .env.example .env

# Web app — Next.js (Vercel reads .env.local)
cp web/.env.local.example web/.env.local
```

Fill in each value. See [docs/google-oauth-setup.md](docs/google-oauth-setup.md) for Google credentials, [docs/fitness-tracker-setup.md](docs/fitness-tracker-setup.md) for Oura/Fitbit, and [docs/notifications-setup.md](docs/notifications-setup.md) for `NTFY_TOPIC`.

### 4. Install Python dependencies
```bash
pip3 install -r scripts/requirements.txt
```

### 5. Migrate profile and recipes to Supabase
If you have existing markdown data files, migrate them to Supabase:
```bash
python3 scripts/migrate_to_supabase.py --dry-run   # preview first
python3 scripts/migrate_to_supabase.py             # migrate profile, recipes, habits, tasks, fitness
```
Or add profile data directly via the Supabase dashboard. Recipes populate the `recipes` table; the session briefing also reads `memory/meal_log.md` locally as a fallback until recipe display ships in the web interface.

### 6. Set up push notifications (Android, macOS, Windows)
See [docs/notifications-setup.md](docs/notifications-setup.md). Add `NTFY_TOPIC` as a GitHub Actions secret for the Sunday weekly review cloud nudge.

### 7. Connect Google Calendar + Gmail
Open Claude Code in the project directory, run `/mcp`, and authenticate with your Google account.

### 8. Open Claude Code in this directory
```bash
claude .
```
Mr. Bridge will sync fitness data, query Supabase, fetch calendar + Gmail, and deliver the session briefing.

> **First time?** If the Claude CLI isn't found: `npm install -g @anthropic-ai/claude-code`

## Session Workflow

1. Open Claude Code in this directory
2. Mr. Bridge syncs fitness APIs → queries Supabase → fetches calendar + Gmail
3. Session briefing delivered: schedule, emails, tasks, habit accountability
4. Use `/log-habit`, `/session-briefing` as needed during the session
5. Data writes go to Supabase automatically — no manual commit needed for data

## Slash Commands

| Command | Description |
|---------|-------------|
| `/log-habit [habits...]` | Log habit completions for today |
| `/session-briefing` | Re-run the full session briefing on demand |
| `/weekly-review` | Run the weekly habit + accountability summary |
| `/stop-timer` | Stop active study timer and log duration |

## Feature Development Workflow

Before starting any feature work:
```bash
bash scripts/update-references.sh   # pull latest best practices
git checkout -b feature/<name>
```

After implementation, open a PR — direct pushes to `main` are blocked by branch protection.
Feature backlog is tracked via GitHub Issues in your fork.

## Web Interface

A Next.js web app deployed on Vercel. Built against a full design system (DM Sans + Inter, indigo primary, dark CSS custom property tokens). All pages are server-rendered with `force-dynamic`; only chart/interactive components are client components.

- **Dashboard** — Personalized greeting with inline date + weather (Open-Meteo, no API key); **Health Breakdown** card (full-width): readiness/sleep/activity scores, 6-up metrics row, stress/resilience row, then two 50/50 tabbed chart panels:
  - *Fitness* tabs: Weight · Body Fat · Steps · Active Cal
  - *Sleep* tabs: Sleep Stages · HRV · Resting HR · SpO₂
  - Window selector (7d/14d/30d/90d/1yr) and single Sync button (triggers Oura, Fitbit, Google Fit on demand) in the header
  - Habits Today + Active Tasks side-by-side below (fixed height, inner scroll); Schedule Today + Important Emails below that; Upcoming Birthday widget
- **Chat** — Streams Claude Sonnet responses with markdown rendering; inline tool status chips (spinner → ✓); "New chat" button; 13 tools: tasks, habits, fitness, profile, Gmail, Calendar (read + write), recipes, meals
- **Tasks** — Inline title editing, priority dot selector, relative due dates, completed tasks accordion
- **Habits** — Daily check-in with indigo toggles + streak counts; 90-day heatmap; streak bar chart; weekly radial completion chart
- **Fitness** — Dual-axis body comp chart (weight + BF%); weekly workout frequency bar chart; active cal area chart; sortable/paginated workout history table
- **Journal** — Two-tab editor: *Reflect* (all 5 prompts visible, progress dots, 1.5s auto-save) and *Free Write* (open textarea with word count); collapsible history accordion
- **Meals** — Recent meal log from Supabase (stub; full logging via Chat)
- **Settings** — Profile key-values from Supabase `profile` table

**Local development:**
```bash
cd web
npm install
npm run dev   # http://localhost:3000
```

Requires `web/.env.local` with:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_FIT_REFRESH_TOKEN=...
OURA_ACCESS_TOKEN=...
FITBIT_CLIENT_ID=...
FITBIT_CLIENT_SECRET=...
FITBIT_WEIGHT_UNIT=lbs
USER_TIMEZONE=America/Los_Angeles
```

> **Note:** `FITBIT_REFRESH_TOKEN` is stored in the Supabase `profile` table (key: `fitbit_refresh_token`) rather than as an env var, because Fitbit rotates it on every use. Write it once with:
> ```bash
> python3 -c "
> import sys, os; sys.path.insert(0, 'scripts')
> from dotenv import load_dotenv; load_dotenv(dotenv_path='.env')
> from _supabase import get_client
> get_client().table('profile').upsert({'key': 'fitbit_refresh_token', 'value': os.environ['FITBIT_REFRESH_TOKEN']}, on_conflict='key').execute()
> print('Done.')
> "
> ```
>
> The Vercel cron (`*/30 * * * *`) requires `CRON_SECRET` to be set in Vercel environment variables — Vercel generates and manages this automatically when you deploy with `vercel.json` crons enabled.

## Voice Interface (Jarvis Mode)

See [voice/README.md](voice/README.md) for full setup. Requires Picovoice access key and `ANTHROPIC_API_KEY`.

```bash
pip install -r voice/requirements.txt
python voice/bridge_voice.py
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

---

<sub>Originally built by [Jason Leung](https://github.com/Theioz).</sub>
