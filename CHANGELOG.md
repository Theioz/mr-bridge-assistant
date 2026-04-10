# Changelog

All notable changes to Mr. Bridge are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [Unreleased]

### Added
- `web/src/app/api/chat/route.ts` — Vercel AI SDK tool use: 7 Supabase tools (`get_tasks`, `add_task`, `complete_task`, `get_habits_today`, `log_habit`, `get_fitness_summary`, `get_profile`) wired into `streamText` with `maxSteps: 5`; closes issue #19
- `web/src/app/api/chat/route.ts` — overload retry middleware (`wrapLanguageModel`) retries up to 3× with 0/1.5s/3s backoff on Anthropic 529 errors
- `web/src/components/chat/chat-interface.tsx` — error state display with Retry button when API call fails

### Changed
- `web/src/app/login/page.tsx` — switched from magic link (`signInWithOtp`) to email/password (`signInWithPassword`) auth
- `web/src/app/api/chat/route.ts` — `maxDuration` increased from 30s to 60s to cover multi-step tool call latency
- `web/src/app/api/chat/route.ts` — `onFinish` skips persisting empty assistant responses; context loader filters empty messages to prevent Anthropic 400 errors

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

[Unreleased]: https://github.com/Theioz/mr-bridge-assistant/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/Theioz/mr-bridge-assistant/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Theioz/mr-bridge-assistant/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Theioz/mr-bridge-assistant/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Theioz/mr-bridge-assistant/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Theioz/mr-bridge-assistant/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Theioz/mr-bridge-assistant/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Theioz/mr-bridge-assistant/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Theioz/mr-bridge-assistant/releases/tag/v0.1.0
