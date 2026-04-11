# Changelog

All notable changes to Mr. Bridge are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [Unreleased]

### Added
- `.env.example` — root-level environment variable template covering Supabase, Google OAuth, Oura, Fitbit, ntfy.sh, and voice interface; replaces inline README block
- `web/.env.local.example` — Next.js web app environment variable template; documents `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, Google OAuth, and `USER_TIMEZONE` (previously undocumented)

### Changed
- `web/src/app/api/chat/route.ts` — added `providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }` to `streamText` call; system prompt (~600 tokens) is now cached for 5 minutes, reducing input token cost on every message after the first in an active session
- `web/src/app/api/chat/route.ts` (`get_email_body` tool) — email body now appends `[...email truncated — N more characters not shown]` when content exceeds 4000 chars; Claude can no longer reason about truncated emails as if they are complete
- `scripts/sync-fitbit.py` (`update_env_token`) — token rotation now writes to `.env.tmp` first, then uses `Path.replace()` for an atomic rename; prevents `.env` corruption if the process is interrupted mid-write

---

### Added
- `web/src/app/(protected)/habits/page.tsx` — `addHabit` and `archiveHabit` server actions; range-aware data fetching via `?range=7|30|90` search param (default 30); wires up `HabitTodaySection`, `HabitRangeToggle`; closes #45
- `web/src/components/habits/habit-today-section.tsx` — client component managing manage-mode and add-form state; renders per-habit archive buttons in manage mode; inline add form (emoji, name, category)
- `web/src/components/habits/habit-range-toggle.tsx` — 7d / 30d / 90d pill selector; updates `?range` URL param via Next.js router
- `web/src/lib/timezone.ts` — `getLastNDays(n)` generalizes `getLast7Days`; existing function now delegates to it

### Changed
- `web/src/components/habits/habit-history.tsx` — headers show readable dates (`Apr 5`) instead of single-letter day initials; 90-day view condenses to weekly columns with completion-count badges (opacity-scaled); accepts `range` prop
- `web/src/components/habits/habit-toggle.tsx` — adds optional `manageMode` and `archiveAction` props; renders `✕` archive button at row end when in manage mode
- `get_recipes` chat tool — searches `recipes` table by name or ingredient; returns all saved recipes when no query provided; closes #47
- `log_meal` chat tool — writes to `meal_log` table with meal type (breakfast/lunch/dinner/snack), optional free-text notes, optional recipe UUID link, and date (defaults to today); closes #47
- `Recipe` and `MealLog` TypeScript interfaces in `web/src/lib/types.ts`

### Changed
- `web/src/app/api/chat/route.ts` — system prompt now includes recipes and meal planning as in-scope domains; instructs Claude to check saved recipes, pull fitness context, and include estimated macros with any recipe recommendation; improvises from pantry profile when no saved recipe matches
- `scripts/fetch_briefing_data.py` — added recent meal log section (last 7 days) from Supabase; resolves recipe names for linked entries
- `.claude/rules/mr-bridge-rules.md` — removed `memory/meal_log.md` local read from session start protocol (meals now fetched from Supabase via briefing script); updated data sources table for `recipes` + `meal_log`

---

- `web/src/lib/google-auth.ts` — shared `getGoogleAuthClient()` OAuth2 helper; extracted from duplicated credential setup in dashboard routes
- `search_gmail` chat tool — flexible Gmail search via query string; returns message id, from, subject, date; closes #30
- `get_email_body` chat tool — fetches full message by ID; walks MIME tree; decodes base64url; truncates to 4000 chars
- `create_calendar_event` chat tool — creates timed or all-day events on primary Google Calendar; end_time defaults to start + 2h; returns event link
- `web/src/app/(protected)/journal/page.tsx` — `/journal` protected page; SSR; loads today's entry and last 14 past entries from Supabase
- `web/src/components/journal/journal-flow.tsx` — guided one-prompt-at-a-time journal flow; progress bar (1 of 5); Back/Next/Save navigation; pre-fills existing today's entry for editing; upserts on conflict
- `web/src/components/journal/journal-history.tsx` — past journal entries list grouped by date with prompt labels
- `supabase/migrations/20260411000000_add_journal_entries.sql` — `journal_entries` table: `date` (UNIQUE), `responses` (JSONB keyed by prompt slug), `free_write`, `metadata`
- `.claude/agents/journal-reminder.md` — daily 7 PM reminder agent; checks Supabase for today's entry; sends ntfy.sh notification only if not yet journaled; registered as a remote trigger (`trig_01DHh8vJ1NjGcA9y512bwfKy`) firing at 19:00 PDT
- `docs/gmail-multi-account.md` — setup guide for professional email aggregation via POP3 + App Password; explains Gmail label ID resolution and Calendar sharing steps; closes #11
- `web/src/components/dashboard/recovery-trends.tsx` — HRV/Readiness combo line chart + stacked sleep bar chart (Recharts, 14-day window); displayed full-width above the dashboard grid; closes #35
- `web/src/components/dashboard/inline-sparkline.tsx` — mini Recharts sparkline used inside Recovery and Fitness summary cards

### Changed
- `web/src/components/nav.tsx` — added Journal nav item with `BookOpen` icon pointing to `/journal`
- `web/src/lib/types.ts` — added `JournalEntry` and `JournalResponses` interfaces; `RecoveryMetrics` extended with `light_hrs`, `steps`, `activity_score`, `spo2_avg`, `body_temp_delta`
- `web/src/app/(protected)/layout.tsx` — `max-w-4xl` → `max-w-6xl mx-auto`; centers dashboard content on wide viewports and gives the 3-col bento grid more breathing room; closes #41
- `web/src/components/dashboard/fun-fact.tsx` — moved from bottom ambient strip to top banner; restyled to `bg-neutral-900 border border-neutral-800 rounded-lg` container
- `scripts/sync-oura.py` — extended to pull all available Oura API fields: `light_hrs`, `steps`, `activity_score`, `spo2_avg`, `body_temp_delta` as dedicated columns; `awake_hrs`, `efficiency`, `latency_mins`, `avg_breath`, `avg_hr_sleep`, `restless_periods`, `total_calories`, `stress`, `resilience`, `vo2_max` stored in `metadata` JSONB; graceful 404 handling for optional endpoints (`daily_spo2`, `daily_stress`, `daily_resilience`, `vo2_max`); closes #34
- `supabase/migrations/20260411000001_recovery_metrics_extended.sql` — 5 new columns added to `recovery_metrics`: `light_hrs`, `steps`, `activity_score`, `spo2_avg`, `body_temp_delta`
- `web/src/app/api/google/calendar/route.ts` — queries all calendars (not just primary) so shared calendar events surface; adds `calendarName` + `isPrimary` fields to response; `toLocaleTimeString` now passes `timeZone: USER_TZ` (fixes events displaying in UTC on Vercel); closes #11, closes #44
- `web/src/app/api/google/gmail/route.ts` — adds `account` field to `EmailSummary`; fetches full label list and resolves `"Professional"` label name → opaque label ID before checking (Gmail API returns `Label_XXXXXXXXXX` IDs, not display names — previous string match was never matching); closes #11, fixes #39
- `web/src/components/dashboard/important-emails.tsx` — shows `work` badge on emails from the professional account
- `web/src/components/dashboard/schedule-today.tsx` — shows `calendarName` for non-primary calendar events; past events dimmed, `now` divider between past and upcoming
- `web/src/app/(protected)/page.tsx` — bento grid 3-col lg layout; dynamic greeting (morning/afternoon/evening) + readiness badge in header; recovery card full-width above grid; fetches 14-day recovery trend data in parallel; recovery query filters `avg_hrv IS NOT NULL` to show last complete sync record, not today's partial row
- `web/src/components/dashboard/recovery-summary.tsx` — large readiness/sleep scores (3.25rem/2.5rem), colored accent bar, inline HRV sparkline, status banner
- `web/src/components/dashboard/recovery-trends.tsx` — chart height 100px → 160px; animations enabled
- `web/src/components/dashboard/habits-summary.tsx` — individual per-habit pills (green=done, dim=pending) using habit registry join
- `web/src/components/dashboard/tasks-summary.tsx` — shows top 3 task names with priority-colored left borders + N more count
- `web/src/components/dashboard/fitness-summary.tsx` — TrendingDown/TrendingUp icons on weight and body fat delta values
- `.claude/rules/mr-bridge-rules.md` — session protocol steps 4+5 updated with multi-account coverage notes for Gmail and Calendar

### Fixed
- Added `export const dynamic = "force-dynamic"` to all 5 protected pages (`/`, `/fitness`, `/habits`, `/tasks`, `/chat`) — prevents Next.js data cache from serving stale Supabase responses on page refresh
- Added `export const dynamic = "force-dynamic"` to `web/src/app/api/fun-fact/route.ts` — Next.js was caching the route response, preventing the daily date check and AI generation from running; fun fact now refreshes each day
- `web/src/app/api/google/gmail/route.ts` — professional account detection was silently broken; Gmail label IDs are opaque (`Label_XXXXXXXXXX`), not display names — now resolves label name → ID via the labels list endpoint before filtering

---

## [0.10.0] — 2026-04-10

### Added
- `web/src/components/ui/logo.tsx` — MB monogram SVG logo; used in sidebar header and login page
- `web/src/components/nav.tsx` — replaced fixed bottom nav with a left sidebar: full labels + blue active state on desktop (≥lg), 48px icon-only rail with hover tooltips on mobile; closes issue #27
- `web/src/app/api/fun-fact/route.ts` — calls Claude Haiku (`claude-haiku-4-5-20251001`, max 150 tokens) for a daily surprising fact; caches result in `profile` table as `key='fun_fact_cache'` (JSON `{fact, date}`); regenerates only when date changes
- `web/src/app/api/google/calendar/route.ts` — fetches today's Google Calendar events via `googleapis`; OAuth2 with refresh token; returns `[{time, title, location?}]` sorted by start time
- `web/src/app/api/google/gmail/route.ts` — fetches up to 5 important unread emails (subject filter: meeting / urgent / invoice / action required / deadline); metadata-only fetch for performance; returns `[{from, subject, receivedAt}]`
- `web/src/components/dashboard/fun-fact.tsx` — full-width Fun Fact card with blue left border, spark icon, loading skeleton, italic text
- `web/src/components/dashboard/schedule-today.tsx` — Schedule Today card; client component; fetches `/api/google/calendar`; Geist Mono for times; distinct error state
- `web/src/components/dashboard/important-emails.tsx` — Important Emails card; client component; fetches `/api/google/gmail`; distinct error vs empty states
- `web/src/components/dashboard/recovery-summary.tsx` — Recovery & Sleep card; color-coded readiness/sleep scores (≥80 green, 60–79 amber, <60 red); Geist Mono for HRV, RHR, sleep totals
- `web/src/lib/timezone.ts` — timezone-aware date utilities: `todayString`, `getLast7Days`, `daysAgoString`, `startOfTodayRFC3339`, `endOfTodayRFC3339`; reads `USER_TIMEZONE` env var (default `America/Los_Angeles`)

### Changed
- `web/src/app/(protected)/layout.tsx` — restructured to flex row with sidebar; `ml-12 lg:ml-48` offset; removed `pb-24` bottom nav clearance
- `web/src/app/(protected)/page.tsx` — full daily briefing layout: Fun Fact (full width) + 2-column grid (Schedule/Emails left; Recovery/Fitness/Habits/Tasks right); server fetches recovery and recent workout; date display uses `USER_TIMEZONE`
- `web/src/app/layout.tsx` — replaced Inter with Geist Sans + Geist Mono (`next/font/google`); exposes `--font-sans` and `--font-mono` CSS variables
- `web/src/components/dashboard/fitness-summary.tsx` — added `recentWorkout` prop; shows most recent workout session below body comp; numeric values use Geist Mono
- `web/src/components/dashboard/habits-summary.tsx` — progress bar fill changed to `bg-blue-500`; counts use Geist Mono
- `web/src/components/dashboard/tasks-summary.tsx` — task count uses Geist Mono
- `web/src/components/habits/habit-toggle.tsx` — completed state uses `bg-blue-500` fill with white checkmark (was neutral-100/neutral-950)
- `web/src/components/tasks/add-task-form.tsx` — submit button changed to `bg-blue-500 hover:bg-blue-400 text-white`
- `web/src/components/chat/chat-interface.tsx` — send button changed to `bg-blue-500 hover:bg-blue-400 text-white`
- `web/src/app/login/page.tsx` — added MB logo; sign-in button changed to blue
- `web/src/components/fitness/body-comp-chart.tsx` — weight line changed to `#3b82f6` (blue-500); added `CartesianGrid` with `#262626` (neutral-800) horizontal lines
- `web/src/app/(protected)/habits/page.tsx` — `today` and `getLast7Days` now use `timezone.ts` helpers
- `web/src/app/(protected)/chat/page.tsx` — `today` uses `todayString()` from `timezone.ts`
- `web/src/app/api/chat/route.ts` — `targetDate` defaults and `sinceStr` now use `todayString()` / `daysAgoString()` from `timezone.ts`
- `web/src/app/api/google/calendar/route.ts` — `timeMin`/`timeMax` now use `startOfTodayRFC3339()` / `endOfTodayRFC3339()` with proper SF timezone offset (fixes wrong-day event fetch when server runs in UTC)
- `web/src/app/api/fun-fact/route.ts` — cache date check uses `todayString()` from `timezone.ts`
- `web/src/lib/types.ts` — `RecoveryMetrics` extended with `total_sleep_hrs`, `deep_hrs`, `rem_hrs`, `active_cal` (columns already existed in Supabase schema)
- `scripts/sync-oura.py` — removed `new_dates` guard; script now upserts all dates in range instead of skipping existing rows; fixes partial rows (readiness/sleep score present but HRV/deep sleep NULL) never getting backfilled when Oura's API publishes delayed sleep detail

### Fixed
- Google Calendar API was constructing `timeMin`/`timeMax` from `new Date()` in UTC, causing it to fetch the wrong day's events when server runs in UTC (e.g. Vercel)
- All `new Date().toISOString().split("T")[0]` calls in server components and API routes returned UTC dates, causing off-by-one date errors for SF users after ~5pm local time
- Oura sync silently skipped existing rows on re-run, permanently leaving `avg_hrv`, `resting_hr`, `total_sleep_hrs`, `deep_hrs` as NULL when the first write captured only summary scores (Oura API publishes detailed sleep data hours after readiness/sleep scores)

---

## [0.9.0] — 2026-04-10

### Added
- `web/src/app/api/chat/route.ts` — Vercel AI SDK tool use: 7 Supabase tools (`get_tasks`, `add_task`, `complete_task`, `get_habits_today`, `log_habit`, `get_fitness_summary`, `get_profile`) wired into `streamText` with `maxSteps: 5`; closes issue #19
- `web/src/app/api/chat/route.ts` — overload retry middleware (`wrapLanguageModel`) retries up to 3× with 0/1.5s/3s backoff on Anthropic 529 errors
- `web/src/components/chat/chat-interface.tsx` — error state display with Retry button when API call fails
- `web/src/components/chat/message-bubble.tsx` — markdown rendering via `react-markdown` + `remark-gfm`; tables, bold, headers, lists, and code blocks now render correctly; user bubbles unchanged
- `scripts/_supabase.py` — `urlopen_with_retry()` shared utility: 30s timeout + exponential backoff on HTTP 429/502/503 (up to 3 attempts); imported by all sync scripts
- `scripts/requirements.txt` — pinned Python dependencies for all sync scripts
- `supabase/migrations/20260410170000_study_log_unique_constraint.sql` — unique constraint on `study_log(date, subject)` to prevent duplicate entries inflating weekly review totals

### Changed
- `web/src/app/login/page.tsx` — switched from magic link (`signInWithOtp`) to email/password (`signInWithPassword`) auth; added email format regex validation on submit button
- `web/src/app/api/chat/route.ts` — `maxDuration` increased from 30s to 60s to cover multi-step tool call latency
- `web/src/app/api/chat/route.ts` — `onFinish` skips persisting empty assistant responses; context loader filters empty messages to prevent Anthropic 400 errors
- `web/src/app/api/chat/route.ts` — `onFinish` wrapped in try/catch; DB persist failures are logged instead of crashing silently
- `web/src/app/api/chat/route.ts` — `add_task` tool validates `due_date` format (`YYYY-MM-DD`) before insert
- `web/src/lib/types.ts` — `RecoveryMetrics` interface corrected: `hrv_ms` → `avg_hrv`, `readiness_score` → `readiness` to match actual Supabase schema
- `web/src/app/(protected)/tasks/page.tsx` — `addTask`, `completeTask`, `archiveTask` server actions wrapped in try/catch; return `{ error? }` and surface inline error messages
- `web/src/components/tasks/add-task-form.tsx` — handles `{ error? }` return from server action; displays inline error on failure
- `web/src/components/tasks/task-item.tsx` — handles `{ error? }` return from complete/archive actions; displays inline error
- `scripts/sync-oura.py`, `sync-googlefit.py`, `sync-fitbit.py` — data fetch calls use `urlopen_with_retry`; auth flows get 30s timeout only
- `scripts/sync-renpho.py` — CSV encoding detection: tries `utf-8-sig` → `utf-8` → `iso-8859-1` before failing
- `voice/bridge_voice.py` — `atexit` handler registered to delete temp `.wav` files after transcription; `WAKE_WORD` config used instead of hardcoded `"hey siri"`

### Fixed
- `web/src/app/api/chat/route.ts` — `get_fitness_summary` tool was selecting non-existent columns (`hrv_ms`, `readiness_score`) from `recovery_metrics`; was silently returning nulls

### Chore
- Main branch protection enabled: direct pushes blocked, force pushes disabled, branch deletion disabled
- Issue #10 closed (web interface shipped)

---

## [0.8.0] — 2026-04-10

### Added
- `supabase/migrations/20260410163801_initial_schema.sql` — 14-table PostgreSQL schema: `habit_registry`, `habits`, `tasks`, `study_log`, `fitness_log`, `workout_sessions`, `recovery_metrics`, `recipes`, `meal_log`, `profile`, `sync_log`, `chat_sessions`, `chat_messages`, `timer_state`; every table has a `metadata JSONB` column for extension without schema changes
- `supabase/migrations/20260410164609_add_unique_constraints.sql` — unique constraint on `habit_registry.name`
- `scripts/_supabase.py` — shared Supabase client helper (`get_client`, `upsert`, `log_sync`) used by all scripts
- `scripts/fetch_briefing_data.py` — queries Supabase for all session briefing data (profile, habits, tasks, body comp, workouts, recovery, study log); replaces reading local markdown files at session start
- `scripts/log_habit.py` — logs habit completions directly to Supabase `habits` table; supports fuzzy name aliases
- `scripts/migrate_to_supabase.py` — one-time migration script; parsed all memory markdown files and inserted 325 records into Supabase
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` added to `.env`
- GitHub issue #17 opened: session boot performance (parallel syncs, skip-sync-if-recent, cached briefing)

### Changed
- `scripts/sync-googlefit.py` — rewrites to Supabase-only; removed all markdown write code; deduplicates against `fitness_log` table
- `scripts/sync-oura.py` — rewrites to Supabase-only; deduplicates against `recovery_metrics` table; returns raw numeric values (seconds → hours) instead of formatted strings
- `scripts/sync-fitbit.py` — rewrites to Supabase-only; deduplicates against `workout_sessions` table using `date|start_time|activity` key
- `.claude/rules/mr-bridge-rules.md` — session start protocol updated: sync scripts now write Supabase-only; `Read memory/*.md` steps replaced with `python3 scripts/fetch_briefing_data.py`; memory update rules updated to reflect Supabase as primary store
- `.claude/skills/log-habit/SKILL.md` — simplified to single Bash step calling `log_habit.py`; markdown Edit step removed

### Removed
- Markdown write logic from all three sync scripts
- Markdown write logic from log-habit skill

---

## [0.7.0] — 2026-04-05

### Added
- `scripts/sync-googlefit.py` — pulls weight and workout sessions from Google Fit REST API; deduplicates and appends to `fitness_log.md` Baseline Metrics + Session Log tables
- `scripts/sync-oura.py` — pulls daily readiness, sleep score, HRV balance, and resting HR from Oura REST API v2; writes to new Recovery Metrics section in `fitness_log.md`
- `scripts/sync-renpho.py` — parses Renpho CSV export; writes body fat %, BMI, muscle mass to Baseline Metrics
- `memory/fitness_log.template.md` — Recovery Metrics section added; Baseline Metrics expanded with BMI and Muscle Mass columns
- `docs/fitness-tracker-setup.md` — setup guide for all three sync scripts
- `OURA_ACCESS_TOKEN` added to `.env` template

### Changed
- Google OAuth refresh token regenerated with fitness scopes (`fitness.body.read`, `fitness.activity.read`, `fitness.sleep.read`)
- `scripts/sync-googlefit.py` scoped to weight only — workout tracking removed (unreliable due to background noise)
- `mr-bridge-rules.md` — session briefing now includes Recovery section; Fitness Sync Scripts index updated to include Fitbit
- `docs/fitness-tracker-setup.md` — Fitbit setup instructions added
- Issue #12 updated: phases restructured (Google Fit → Oura → Renpho); issue #2 closed as duplicate

---

## [0.6.0] — 2026-04-05

### Added
- `docs/google-oauth-setup.md` — guide for getting client_id/client_secret, regenerating refresh token, publishing the app to remove 7-day expiry, and automatic token refresh pattern using `google-auth` library
- Google OAuth vars restored to `.env` with explanatory comments (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`)

### Changed
- Issue #10 updated with Google OAuth prerequisite note and setup instructions

---

## [0.5.0] — 2026-04-05

### Added
- `.github/workflows/weekly-review-nudge.yml` — GitHub Actions cron (Sunday 8pm Pacific) that POSTs to ntfy.sh; fires on all devices regardless of local machine state
- `.claude/agents/weekly-review.md` — local agent that computes 7-day habit summary, study totals, task delta, and sends headline push notification
- `.claude/agents/study-timer.md` — timer agent for Japanese and coding sessions; handles forgotten timers with adjustable duration on stop
- `.claude/commands/weekly-review.md` — `/weekly-review` slash command for on-demand review
- `.claude/commands/stop-timer.md` — `/stop-timer` slash command to stop active study timer and log duration
- `memory/timer_state.json` (gitignored) — tracks active study timer state
- `docs/notifications-setup.md` — full setup guide for Android, macOS, and Windows PC via ntfy-desktop
- Study timer rules added to `mr-bridge-rules.md` — offer timer only when explicitly starting a session
- `memory/timer_state.json` added to `.gitignore`

### Changed
- `mr-bridge-rules.md` updated: fix stale submodule command → `bash scripts/update-references.sh`, add timer_state.json to memory index

---

## [0.4.0] — 2026-04-04

### Added
- Gmail and Google Calendar connected via claude.ai hosted MCP servers (authenticated)
- `scripts/notify.sh` updated to send Android push notifications via ntfy.sh (dual macOS + Android)
- `NTFY_TOPIC` added to `.env` template for Android notification setup
- 10 GitHub Issues created tracking full feature backlog
- Session close protocol added to rules: update CHANGELOG + README before every commit

### Changed
- `.mcp.json` cleaned up — removed redundant Gmail/Calendar entries (now handled by claude.ai hosted MCPs), keeping only DeepWiki
- `.claude/settings.json` hooks format fixed (matcher + hooks array)
- MCP tool references in `mr-bridge-rules.md` updated to match actual claude.ai tool names
- Google OAuth credentials removed from `.env` (no longer needed)

### Fixed
- `.claude/settings.json` hooks format was invalid — corrected to use `matcher` + `hooks` array structure

---

## [0.3.0] — 2026-04-04

### Added
- Git submodule: `shanraisshan/claude-code-best-practice` at `.claude/references/best-practice/`
- `scripts/update-references.sh` — pull latest best practices before feature sessions
- `.claude/skills/send-notification/` — reusable macOS notification skill
- `.claude/skills/log-habit/` — reusable habit logging skill
- `.claude/commands/log-habit.md` — `/log-habit` slash command
- `.claude/commands/session-briefing.md` — `/session-briefing` slash command
- `.claude/hooks/scripts/hooks.py` — Python 3 hook handler (PostToolUse memory commit reminder)
- `.claude/settings.local.json` added to `.gitignore`
- Feature branch + PR workflow documented in session rules

### Changed
- Agent files (`nightly-postmortem`, `morning-nudge`) now have full YAML frontmatter
- Hooks restructured from inline shell in `settings.json` to Python script
- `.mcp.json` migrated to standard `npx` stdio format; added DeepWiki MCP server
- `mr-bridge-rules.md` updated with feature development protocol and reference index

---

## [0.2.0] — 2026-04-04

### Added
- Google Calendar + Gmail MCP configuration (`.mcp.json`)
- `.claude/settings.json` with PostToolUse hook for memory commit reminders
- `memory/habits.md` (gitignored) with 7 daily habits: floss, workout, Japanese, coding, reading, water, sleep
- `memory/habits.template.md` — public skeleton for habits tracking
- `scripts/notify.sh` — macOS push notification via `osascript`
- `.claude/agents/nightly-postmortem.md` — scheduled 9pm habit check-in agent
- `.claude/agents/morning-nudge.md` — scheduled 8am session nudge agent
- `voice/` directory: `bridge_voice.py`, `config.py`, `requirements.txt`, `README.md`
  - Architecture: wake word (Porcupine) → STT (faster-whisper) → Claude API → TTS (say / ElevenLabs)

### Changed
- `CLAUDE.md` restructured as lean 2-line bootstrap using `@path` import (best practice)
- Behavioral rules and session protocol moved to `.claude/rules/mr-bridge-rules.md`
- Session briefing updated to include habit accountability summary

---

## [0.1.0] — 2026-04-04

### Added
- Initial project structure: `CLAUDE.md`, `README.md`, `.gitignore`, `memory/`
- `memory/profile.md` (gitignored) — identity, background, preferences, accountability targets
- `memory/fitness_log.md` (gitignored) — goal: fat loss + strength maintenance, Push/Legs/Pull split
- `memory/meal_log.md` (gitignored) — 13 recipes across 6 categories imported from personal cookbook
- `memory/todo.md` (gitignored) — active tasks, daily accountability, study/reading logs
- Public skeleton templates for all four memory files
- Privacy structure: personal memory files gitignored, only templates tracked in repo
- Session bootstrap protocol: load memory → deliver briefing → confirm memory updates → commit/push

---

[Unreleased]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/<your-username>/mr-bridge-assistant/releases/tag/v0.1.0
