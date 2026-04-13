# Changelog

All notable changes to Mr. Bridge are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [Unreleased]

### Removed (dead dashboard components — issue #96)
- **15 dead dashboard components deleted** — `briefing-strip`, `daily-insights`, `daily-quote`, `fun-fact`, `weather-card`, `weather-widget`, `recovery-summary`, `recovery-trends`, `hrv-trend-chart`, `inline-sparkline`, `hero-readiness`, `recent-chat`, `fitness-summary`, `sleep-stage-chart`, `habits-summary`; removed from UI in PR #89 but left on disk; zero imports confirmed before deletion
- **`api/daily-quote/`** and **`api/fun-fact/`** route directories deleted; callers removed in PR #89

### Added (chat session history — issue #62)
- **Session history panel** — chat page now shows browsable history of all previous conversations; desktop gets a collapsible ~260px left panel (toggle via History icon in chat header, state persisted in `localStorage`); mobile gets a bottom sheet triggered by the same icon
- **`GET /api/chat/sessions`** — auth-gated route returning all web sessions ordered by `last_active_at` desc, each with a 60-char preview from the first user message; empty sessions are filtered out
- **`GET /api/chat/sessions/[id]`** — auth-gated route returning the last 50 messages for a session; used when switching to a historical conversation
- **`ChatPageClient`** (`components/chat/chat-page-client.tsx`) — client shell managing active session state, history panel toggle, session switching (fetches messages on select), and "New chat"; session list is refreshed after each AI response
- **`SessionSidebar`** (`components/chat/session-sidebar.tsx`) — desktop collapsible panel with "New chat" button pinned at top; sessions grouped by recency with sessions older than 30 days collapsed under an "Older" disclosure; active session highlighted with `--color-primary` left border
- **`SessionSheet`** (`components/chat/session-sheet.tsx`) — mobile bottom sheet matching the existing More sheet pattern (backdrop, close-on-tap, handle bar, `env(safe-area-inset-bottom)` padding)
- **Lazy session creation** — "New chat" generates a UUID client-side without a DB write; the chat API route now upserts the session row on first message, so sessions are only persisted when a conversation actually begins
- **`chat-interface.tsx`** — added optional `onMessageSent` prop (wired to `useChat`'s `onFinish`) so the parent can refresh the session list after each exchange
- **`chat/page.tsx`** simplified — loads the most recent session for the initial render (no longer pre-creates sessions); renders `ChatPageClient` with `initialSessionId` and `initialMessages`

### Added (today's scores strip — issue #92)
- **`TodayScoresStrip` component** — compact single-row card above Health Breakdown showing today's readiness and sleep score fetched separately from the existing card; 2px colored top bar keyed to readiness score; `TODAY` label, color-coded scores with a vertical divider, status text, and `Oura · live · Apr 13` source tag; silently absent when today's row doesn't exist yet
- **Dashboard fetches two recovery rows** — `dashboard/page.tsx` now queries today's `recovery_metrics` row (`date,readiness,sleep_score,source`) in the same `Promise.all` as all other data; strip is hidden when today's date equals the Health Breakdown card's date (late-night sync case) to avoid showing the same data twice

### Fixed (mobile UI + sync — this PR)
- **Weather layout** — date and weather are now on separate lines in the dashboard header; no more mid-line wrapping or diagonal cut-off of the H/L values on narrow screens
- **Mobile nav safe area** — added `viewport-fit: cover` to the viewport metadata and `padding-bottom: env(safe-area-inset-bottom)` to the bottom tab bar so it no longer clips behind the iOS home indicator
- **Bottom nav "More" tab** — replaced the hard-coded 5-item mobile nav with 4 primary tabs (Dashboard, Habits, Tasks, Chat) + a **More** button that opens a bottom sheet with the remaining pages (Fitness, Meals, Journal, Settings); More button highlights when the active page is one of those secondary routes
- **Sync button no longer shows "Sync failed" for unconfigured sources** — Oura, Fitbit, and Google Fit sync routes now return HTTP 200 `{ skipped: true }` when the required env vars or tokens are absent, instead of throwing a 500; only genuine API/DB errors count as failures

### Added (food photo analysis — issue #84)
- **Food photo analysis** — `/meals` page now has an "Analyze Food Photo" card; user selects or captures a photo, Claude vision identifies the dish and extracts an ingredients list with estimated quantities, estimates macros (calories, protein, carbs, fat, fiber, sodium), and presents an editable review before logging
- **Ingredients-first editing** — review state shows dish name as a header and the ingredients list as the primary editable textarea; "Re-estimate macros" button sends the corrected ingredients back to Claude (Haiku) for a fresh macro calculation; macro numbers are shown read-only with an optional "Edit" toggle for manual overrides
- **`/api/meals/analyze-photo`** — POST route; accepts `multipart/form-data` image, sends to `claude-sonnet-4-6` via `generateObject`, returns structured food/macro JSON; image is never written to disk or Supabase Storage
- **`/api/meals/estimate-macros`** — POST route; accepts `{ ingredients }` string, re-estimates macros via `claude-haiku-4-5-20251001`; used by the Re-estimate button in the review flow
- **`/api/meals/log`** — POST route; inserts a full nutrition row into `meal_log` from the client component (bypasses chat)
- **`FoodPhotoAnalyzer`** client component — idle → loading (thumbnail preview) → review → saving → done/error state machine; mobile-optimised: no `capture=` attribute (iOS shows native Take Photo / Photo Library sheet), `font-size: 16px` on all inputs to prevent iOS auto-zoom, `minHeight: 48px` touch targets, 2-column macro grid on mobile, full-width Log Meal button
- **Nutrition columns on `meal_log`** — migration `20260412000000_add_nutrition_to_meal_log.sql` adds `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sodium_mg`, `source` (all nullable)
- **Macro display in meal log** — meals page shows inline macro summary (`620 cal · P 42g · C 58g · F 14g`) on any entry that has nutrition data
- **`log_meal` chat tool extended** — now accepts optional `calories`, `protein_g`, `carbs_g`, `fat_g` so chat-logged meals can carry macros when the user mentions them or Claude can estimate from the description

### Added (web UI redesign — PR #89)
- **Design system** — `globals.css` now defines all CSS custom properties (`--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-primary`, `--color-positive`, `--color-warning`, `--color-danger`, `--color-info`, `--color-text`, `--color-text-muted`, `--color-text-faint`); skeleton shimmer keyframe; `prefers-reduced-motion` block disables all transitions and chart animations
- **Typography** — replaced Geist with DM Sans (headings, `font-heading`) + Inter (body); loaded via Google Fonts `<link>` in layout
- **Navigation** — `nav.tsx` rebuilt: 240px fixed sidebar on desktop with indigo active state; bottom tab bar (5 items: Dashboard, Habits, Tasks, Chat, Journal) on mobile; `(protected)/layout.tsx` updated with `ml-0 lg:ml-60` and `pb-16 lg:pb-0`
- **`DashboardHeader`** (`dashboard-header.tsx`) — greeting + inline date/weather (Open-Meteo, no separate card) + single SyncButton + WindowSelector in one row
- **`HealthBreakdown`** (`health-breakdown.tsx`) — replaces `RecoverySummary` + `WeightTrendChart`; full-width card with readiness/sleep/activity scores, 6-up metrics row (HRV, RHR, total sleep, deep, REM, steps), stress/resilience row; two 50/50 tabbed chart panels: **Fitness** (Weight · Body Fat · Steps · Active Cal) and **Sleep** (Stages · HRV · RHR · SpO₂); vertical divider on desktop only; accent top bar keyed to readiness score
- **`WindowSelector`** (`ui/window-selector.tsx`) — pill toggle for 7d/14d/30d/90d/1yr; writes `mb-window` cookie and calls `router.refresh()`; `getWindow()` server helper reads cookie with `DEFAULT_WINDOW = "7d"`
- **`Skeleton`** (`ui/skeleton.tsx`) — shimmer placeholder component; static background when `prefers-reduced-motion` is enabled
- **`MetricCard`** (`ui/metric-card.tsx`) — KPI card with large DM Sans value, delta arrow, `healthPositiveIsDown` awareness
- **`WeightTrendChart`** (`dashboard/weight-trend-chart.tsx`) — standalone Recharts LineChart with optional inline weight/BF stat display in card header
- **`RecentWorkoutsTable`** (`dashboard/recent-workouts-table.tsx`) — compact windowed workout table with "View all →" link
- **Journal redesign** — `journal-editor.tsx` replaces `journal-flow.tsx`; two tabs: Reflect (all 5 prompts visible at once with filled/unfilled progress dots) and Free Write (open textarea with live word count); auto-save debounced 1.5s; `journal-history.tsx` rebuilt as collapsible accordion with entry preview
- **Tasks redesign** — `task-item.tsx`: inline click-to-edit title, relative due dates ("overdue", "today", "in 2d"), 44×44px touch targets, archive button; `add-task-form.tsx`: always-visible inline form, priority dot selector (3 × 32px touch targets), date picker; `completed-tasks.tsx`: new collapsible accordion showing last 10 completed tasks
- **Habits checkin ported to design tokens** — removed all `neutral-*` / `bg-blue-500` Tailwind classes; fixed broken `font-[family-name:var(--font-mono)]` reference (replaced with `tabular-nums`)
- **`TasksSummary`** dashboard widget — shows all active tasks (was capped at 3) with 160px inner scroll; `HabitsCheckin` has 200px inner scroll
- **New pages** — `/dashboard` (dedicated route), `/meals` (stub with recent meal log), `/settings` (profile key-values from Supabase)
- **Fitness page** — new `body-comp-dual-chart.tsx` (dual-axis weight + BF), `workout-freq-chart.tsx` (weekly frequency), `active-cal-chart.tsx` (area chart), `workout-history-table.tsx` (sortable/paginated client component)
- **Habits page** — new `heatmap.tsx` (90-day GitHub-style grid), `streak-chart.tsx` (horizontal bar, sorted by streak), `radial-completion.tsx` (weekly RadialBarChart per habit)
- **Chat** — design token colors on input, send button, message bubbles; `message-bubble.tsx` rebuilt with proper dark-mode rendering

### Changed (web UI redesign — PR #89)
- Dashboard removed: `DailyInsights` fun-fact/quote card, `BriefingStrip` standalone card, `RecentWorkoutsTable` from main dashboard, duplicate `SyncButton` inside `RecoverySummary`, redundant status banner in `RecoverySummary`
- Dashboard `space-y-5` → `space-y-6`; all grids `gap-5` → `gap-6` for consistent rhythm
- `recoveryTrendsRes` query now selects `*` (was selecting subset) so all fields (steps, active_cal, spo2_avg, resting_hr) are available to the new chart tabs
- `fitnessTrendRes` query now includes `body_fat_pct` (was weight-only) to power the Body Fat chart tab

---

### Fixed (pre-redesign)
- `web/src/components/dashboard/recovery-summary.tsx` — scores row changed to `flex flex-wrap` with `gap-x-6 gap-y-3`; status block uses `w-full sm:w-auto sm:ml-auto` to stack below scores on mobile instead of overflowing; stress row changed to `flex flex-wrap` with `gap-x-4 gap-y-1` so Resilience label wraps rather than overflows at 360–414px; closes #83
- `web/src/components/dashboard/trends-card.tsx` — tab/window button header changed to `flex flex-col sm:flex-row sm:items-center sm:justify-between` to prevent overflow at 360–414px; closes #83
- `web/src/components/dashboard/tasks-summary.tsx` — added `min-w-0` to task row flex container so `truncate` on task title clips correctly
- `web/src/components/dashboard/important-emails.tsx` — added `min-w-0` to per-email container so `truncate` on sender/subject lines clips correctly

### Added
- `web/src/app/api/sync/oura/route.ts` — POST endpoint; syncs last 3 days of Oura data (sleep, readiness, activity, spo2, stress, resilience, vo2) into `recovery_metrics`; requires authenticated session; closes #82
- `web/src/app/api/sync/fitbit/route.ts` — POST endpoint; syncs last 7 days of Fitbit body composition and workouts into `fitness_log` and `workout_sessions`; reads rotating refresh token from Supabase `profile` table; writes back new token after each refresh
- `web/src/app/api/sync/googlefit/route.ts` — POST endpoint; discovers datasources then aggregates last 7 days of body composition into `fitness_log`; skips dates already covered by a richer source
- `web/src/app/api/cron/sync/route.ts` — GET endpoint; verifies Vercel `CRON_SECRET`; runs all three syncs in parallel with 30-minute skip window (mirrors `run-syncs.py` logic); each source reports independently so a single failure doesn't block others
- `web/src/lib/sync/oura.ts`, `fitbit.ts`, `googlefit.ts`, `log.ts` — shared sync library; extracted from route files so cron and user-triggered routes share identical logic; `logSync` + `lastSyncAgeSecs` helpers read/write `sync_log` table
- `web/src/components/dashboard/sync-button.tsx` — "Sync" button in the Recovery & Sleep card header; calls all three sync routes in parallel; spinner animation while running; shows "Synced HH:MM" on success; triggers `router.refresh()` to reload server component data without a full page reload
- `web/vercel.json` — Vercel cron schedule (`0 14 * * *`, 6am PST / 7am PDT); calls `/api/cron/sync` daily so overnight Oura/Fitbit/Google Fit data is ready when the dashboard opens; manual Sync button handles on-demand refreshes throughout the day
- `web/src/app/api/chat/route.ts` — `selectModel()`: tiered model routing; simple CRUD commands (add task, log habit, log meal, create event, get recipes, list tasks, check habits) route to `claude-haiku-4-5-20251001`; complex reasoning requests (analysis, planning, recommendations, fitness goals, meal planning, email synthesis) stay on `claude-sonnet-4-6`; zero-latency heuristic classifier — no extra LLM call; logs selected tier to server console per request; closes #81

### Fixed
- `web/src/app/(protected)/page.tsx` — removed `avg_hrv IS NOT NULL` filter from the recovery query; previously, if Oura hadn't finalized HRV when the sync ran in the morning, the card fell back to two-day-old data instead of showing the most recent (partial) row
- `web/src/middleware.ts` — `/api/cron/` routes now bypass session redirect; previously Vercel cron requests were redirected to `/login` before reaching the route handler
- `web/src/components/chat/tool-status-bar.tsx` — inline tool status chips rendered below the last message while Mr. Bridge is working; spinner while tool is executing, ✓ when result arrives, chips disappear when response finishes streaming; reads from `message.parts` (AI SDK v4) with `toolInvocations` fallback; covers all 13 chat tools; closes #64
- `web/src/app/api/chat/route.ts` — `list_calendar_events` tool: queries all Google Calendars for a given date range (defaults to today); events tagged with `calendarType` (primary / birthday / holiday / other) so the model filters noise; declined invitations excluded server-side; closes gap where the model had no way to read the calendar
- `web/src/app/(protected)/chat/page.tsx` — "New chat" link in header; navigating to `/chat?new=1` forces a fresh session with no prior context

### Fixed
- `web/src/app/api/chat/route.ts` — system prompt now includes today's date via `todayString()`; previously the model had no date awareness and passed 2025 dates to calendar tools, returning stale events
- `web/src/app/api/chat/route.ts` — model no longer narrates before tool calls ("Let me grab that now", etc.); pre-tool text and post-tool response were concatenating without a separator in the streamed content
- `web/src/lib/timezone.ts` — added `startOfDayRFC3339(date)`, `endOfDayRFC3339(date)`, `addDays(date, n)` helpers; previous calendar implementation used `toLocaleString → new Date()` for RFC 3339 conversion which produced unreliable timezone offsets

### Changed
- `web/src/app/(protected)/chat/page.tsx` — `initialMessages` now scoped to the current session only; previously loaded across all web sessions, causing stale context to bleed into new chats
- `web/src/app/api/chat/route.ts` — calendar events include `calendarType` field (primary / birthday / holiday / other); model instructed to surface birthdays as reminders and omit holiday calendars by default
- `web/src/components/chat/chat-interface.tsx` — imports and renders `ToolStatusBar`

### Fixed
- `scripts/sync-oura.py` — `daily_activity` end_date is exclusive; changed `end_str` to `now + 1 day` so today's steps/calories are included in the sync
- `scripts/sync-oura.py` — `all_dates` union now includes `activity` dates so today's activity row is written even when readiness/sleep haven't finalized yet

### Added
- `scripts/sync-oura.py` — `fetch_heartrate()`: fetches intraday HR samples via `heartrate` endpoint (start_datetime/end_datetime params), groups by date, stores `hr_avg_day`, `hr_min_day`, `hr_max_day` in `recovery_metrics.metadata`
- `scripts/sync-oura.py` — `fetch_oura_workouts()`: fetches Oura-detected workouts via `workout` endpoint; writes to `workout_sessions` table (source=`oura`) with intensity, distance, MET, and zone breakdown in metadata; deduplicates by clearing oura rows in range before re-insert
- `scripts/sync-oura.py` — `oura_get_datetime()`: new helper for endpoints that use `start_datetime`/`end_datetime` params instead of `start_date`/`end_date`
- `scripts/fetch_weather.py` — Open-Meteo weather helper (no API key); resolves location from profile in order: `location_lat`/`location_lon` → `location_city` (geocoded) → `Identity/Location` (geocoded via Open-Meteo free geocoding API); `fetch_weather()` accepts optional `profile` dict to skip second Supabase round-trip; `format_weather_line()` produces single-line briefing format; closes #77
- `scripts/check_weather_alert.py` — once-per-day push notifications for precip >0.2in, thunderstorm (WMO 95–99), high >95°F, low <28°F, wind >30mph; guard via `weather_alert_last_notified` profile key; closes #77
- `web/src/app/api/weather/route.ts` — Next.js API route; same location resolution logic; 30-minute Next.js cache via `next: { revalidate: 1800 }`
- `web/src/app/api/daily-quote/route.ts` — Claude Haiku motivational quote; cached daily in Supabase `profile` key `quote_cache` so it's stable all day; strips markdown code fences from model output before JSON parsing
- `web/src/components/dashboard/weather-card.tsx` — compact weather block inline with dashboard greeting header; responsive (left-aligned on mobile, right-aligned on sm+); icon color-coded by WMO category; amber border for thunderstorm alert state
- `web/src/components/dashboard/daily-insights.tsx` — replaces separate FunFact and DailyQuote banners with a single combined card; vertical divider on desktop, horizontal divider on mobile; halves top-of-page height on mobile
- `web/src/components/dashboard/daily-quote.tsx` — standalone quote component (used internally by `daily-insights.tsx`)

### Changed
- `scripts/fetch_briefing_data.py` — added `q_weather` to tier1 parallel fetch batch; outputs `## WEATHER` section between PROFILE and ACTIVE TASKS; includes "Rain expected" note when precip >0.1in
- `scripts/run-syncs.py` — `check_weather_alert.py` added to ALERTS list (runs after syncs alongside HRV and task alerts)
- `web/src/app/(protected)/page.tsx` — greeting header refactored to `flex-col sm:flex-row` with `WeatherCard` inline on the right; FunFact + DailyQuote replaced by combined `DailyInsights` card; name lookup now checks both `name` and `Identity/Name` profile keys (fixes name not displaying when profile uses `Identity/Name` key format)
- `.claude/rules/mr-bridge-rules.md` — `### Weather` section added to Session Briefing Format; Location Management section added with chat commands for `location_city` override and reset, and web UI hook note for issue #10

### Added
- `scripts/check_hrv_alert.py` — fires push notification via `notify.sh` when today's HRV drops more than `hrv_alert_threshold`% below 7-day baseline; once-per-day guard via `profile` key `hrv_alert_last_notified`; threshold configurable in Supabase `profile` table (default 20%); closes #60
- `scripts/check_daily_alerts.py` — fires push notification per active task with `due_date <= today`; distinguishes "due today" vs "overdue"; once-per-day guard via `profile` key `task_alerts_last_notified`; closes #59
- `scripts/run-syncs.py` — parallel sync orchestrator; runs `sync-oura.py`, `sync-fitbit.py`, `sync-googlefit.py` concurrently; skips any source synced within the last 30 minutes
- `web/src/app/api/google/calendar/upcoming-birthday/route.ts` — fetches birthdays from Google Calendar over a 60-day lookahead window; returns nearest upcoming birthday with days-until count
- `web/src/components/dashboard/upcoming-birthday.tsx` — dashboard card showing nearest upcoming birthday; closes #76
- `web/src/components/dashboard/trends-card.tsx` — new full-width dashboard card replacing `FitnessSummary`; dual-tab (Body Comp / Recovery) time-series chart with 7d / 30d / 90d window toggle; Body Comp tab shows weight + body fat % on dual axes; Recovery tab shows HRV + readiness on dual axes; recent workout slim row at bottom; closes #72

### Fixed
- `web/src/app/(protected)/fitness/page.tsx` — query was returning oldest 30 records instead of most recent 30; added `.order("date", { ascending: false })` + `.limit(30)` then reversed for chart display
- `scripts/sync-googlefit.py` (`get_credentials`) — removed `scopes=FITNESS_SCOPES` from `Credentials()` constructor; passing scopes during refresh caused `invalid_scope: Bad Request` because Google validates the refresh request body scopes against the original grant; the fix lets the stored refresh token determine its own scope; closes #55

### Changed
- `web/src/app/(protected)/page.tsx` — dashboard greeting now reads `name` key from Supabase `profile` table and displays it in the header (e.g. "Good morning, Jason"); falls back to generic greeting if profile name not set; closes #78
- `web/src/app/(protected)/page.tsx` — replaced `FitnessSummary` (2-col) with `TrendsCard` (full-width row); `ScheduleToday` moved to its own full-width row below; fitness trends query extended to 90 rows ascending; recovery trends query extended from 14 → 90 rows; `RecoverySummary` receives sliced last-14 entries to preserve existing chart label; dropped single-entry `fitnessResult` and `prevFitnessResult` queries
- `.claude/rules/mr-bridge-rules.md` — birthday briefing lookahead extended from 7 to 60 days; briefing now shows only the single nearest birthday regardless of how far out it is

---

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
