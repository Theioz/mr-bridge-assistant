# Data Sources

All live data is in **self-hosted Supabase** on `compute-core` (`supabase.jl-infra-lab.com`).
Migrated off Supabase Cloud 2026-07-13 — see ADR 0017 in the jl-homelab repo.

There is **no in-app chat**. Conversation happens through the **MCP server**
(`web/mcp/run.sh`), which exposes the same 52 tools to Claude Code. Where a row below
says "MCP tool", that tool is available to you directly in this session.

| Supabase table | Source | How it's written |
|---|---|---|
| `user_integrations` | OAuth tokens — Google, Google Health, Oura PAT | Connect via `/settings`. Refresh tokens are **pgcrypto-encrypted** with `ENCRYPTION_KEY`. `google` and `google_health` are separate rows: the health token is consented apart so an interactive Calendar re-consent cannot invalidate the unattended fitness sync (#693 dropped the Gmail scope that was the original reason for the split) |
| `fitness_log` | Google Health (weight/fat, derived BMI) | `/api/cron/sync` (nightly cron, or `scripts/run-syncs.py`) |
| `workout_sessions` | Google Health, Oura, manual | `/api/cron/sync` (nightly cron, or `scripts/run-syncs.py`) |
| `recovery_metrics` | Oura Ring | `/api/cron/sync` (nightly cron, or `scripts/run-syncs.py`) |
| `strength_sessions`, `strength_session_sets`, `exercise_prs` | In-app set logger | `/api/strength-sessions` |
| `workout_plans` | Weekly planner | `/weekly-plan` command → `scripts/weekly_plan.py submit` → `/api/internal/plan` (AI-free); or `assign_workout` / `update_workout_exercise` / `cancel_workout` / `reschedule_workout` **MCP tools** |
| `exercises` | Shared movement catalog (pattern, equipment, cues) | Hand-run SQL only; no app code writes it |
| `user_equipment` | Manual | `/settings` |
| `habits` + `habit_registry` | Manual; "10,000 Steps" auto-completed by the Oura sync on days steps ≥ `profile.steps_goal` (never un-completed); "No Alcohol" marked not completed by `log_drink` | `scripts/log_habit.py`, or the `log_habit` **MCP tool** |
| `tasks` + `task_lists` + `task_series` | Manual; `task_series` generates recurring occurrences (#468) | `/tasks` page, or `add_task` / `complete_task` / `restore_task` / `set_task_blocker` / `create_task_list` / `create_task_series` (and the other series tools) **MCP tools**; occurrences spawned daily by `scripts/spawn_task_occurrences.py`. `tasks.blocked_by` (#470): one blocking task; blocked while that task is active, hidden from the active list until then. Completed tasks are kept 90 days, then hard-deleted nightly by `scripts/purge_completed_tasks.py` (#684) |
| `study_log` | Legacy — nothing writes it since the study timer was removed (#762) | Read only by `fetch_briefing_data.py` and the data export |
| `profile` | k/v store: name, macro targets, watchlists, `onboarding_completed`, and the program keys the `/weekly` Scorecard reads (`phase_start_date`, `phase_start_weight`, `target_rate_lb_wk`, `tdee_estimate`, `steps_goal`, `waist_goal_in`, `cheat_meals_per_week`, `alcohol_*`) | `/settings`, or `update_profile` **MCP tool** |
| `recipes` | Library of "cooked this, liked it, might cook again". Macros are for the **whole recipe as written**, USDA-derived | `/meals` recipe editor (`/api/recipes`), `POST /api/recipes/<id>/macros` to resolve; read with the `get_recipes` **MCP tool** (no tool writes recipes) |
| `cooks` | **One time you actually made food.** Portions live here, not on the recipe (you eyeball the split). Batch prep = many portions draining over days; a one-off dinner = 1 portion; leftover-ingredient cooking = no recipe. Leftovers = `portions_remaining > 0` | `POST /api/cooks`, or `log_cook` **MCP tool** |
| `meal_plans` | Proposed meals — every row points at a cook (leftovers) or a recipe (needs cooking); a meal out uses the reusable "Eating out" recipe. `name` alone is rejected. **Carries no macros of its own**. `is_cheat` marks the week's budgeted cheat meal (counted by the `/weekly` Scorecard) | `plan_meals` **MCP tool** (optional `is_cheat` per row) |
| `meal_log` | What was actually eaten. `standard_drinks` (US, 14 g ethanol) is set only on alcohol rows — null = not alcohol; `origin` ∈ home/restaurant/delivery/travel, null = unknown | `POST /api/meals/eat` (one-tap confirm of a cook — macros already known) or `/api/meals/log` (photo/text → USDA, for off-plan food), or `/api/meals/log-label` (an amount of a `packaged_foods` product, priced server-side off its label; `source = 'label'`). **There is still no `log_meal` tool** — the model never records that food went in a mouth. One narrow exception: the `log_drink` **MCP tool** writes an alcohol row (`source = 'drink_calc'`, calories = ethanol arithmetic from volume × ABV + label carbs, no model estimate) and marks that day's "No Alcohol" habit not completed. Both eat/log routes accept an optional `origin` |
| `body_measurements` | Tape measurements, one row per `(user_id, date)` — `waist_in` (inches) + notes. Not a `fitness_log` column: a manual row there with a null weight would read as the latest weigh-in | `log_measurement` **MCP tool** (upsert on `user_id,date`) |
| `inventory_items` + `inventory_draws` | Raw ingredients on hand (fridge/freezer/pantry); each cook draws from them | `/inventory` page and the `receive_grocery_order` **MCP tool**; a cook logged in the app (`POST /api/cooks`, "Cooked it") draws from them — the `log_cook` tool does **not** |
| `packaged_foods` | Nutrition labels of branded products, from a photo | `/inventory` page (`/api/packaged-foods`); priced by `/api/meals/log-label` |
| `usda_food_picks` | Cache of which USDA record a food name resolved to | The nutrition pipeline (`web/src/lib/nutrition/`) |
| `journal_entries` | Manual | `/journal` server action. **No tool writes journal entries** |
| `backlog_items` + `backlog_sessions` | Manual + TMDB/IGDB/OpenLibrary metadata; Plex watch history (#691) | `/api/backlog/*`, or `list_backlog` / `add_backlog_item` / `update_backlog_item` / `log_backlog_session` **MCP tools**. Movies/shows are also written by `/api/cron/sync` from Plex: status, sessions, `metadata.plex_progress`, and `rate_prompt_at` (a pending rate prompt, cleared by a DB trigger whenever a rating is written) |
| `grocery_products` | Amazon Fresh product pins (#4): food identity (`fdc_id` or `packaged_food_id`, **never name**) → ASIN, pack grams, last price. One pin per food | `pin_grocery_product` **MCP tool**; read by `get_grocery_list` (planned recipes × portions − `inventory_items`, in whole packs; reports `unlisted` recipes with no structured ingredients) and by `receive_grocery_order`, which turns a delivered order into `inventory_items` rows in grams carrying the pin's identity (idempotent per order) |
| `jobs` + `job_scout_reports` | Job Scout and the job-application tracker: every PM/TPM posting the daily search saw (stage, reason, agent score, Jason's feedback), every role being pursued (`status` not null: to_apply → applied → … , dates, fit, level, pay, notes, Notion prep link), and the agent's daily markdown report | `scripts/job_scout.py collect` / `ingest` on the homelab (the cloud ranking agent never touches the DB; it exchanges files through a git branch); `scripts/import_notion_tracker.py` (one-time Notion import). The `/jobs` page edits tracker fields and feedback (`PATCH /api/jobs/<id>`) and adds roles by hand (`POST /api/jobs`) |
| `notifications` | In-app history of every push | `scripts/_push.py` (ntfy + history row; `scripts/notify.sh` wraps it) and app routes such as `/api/cron/audit-recipes`; rows older than 30 days are purged by `/api/cron/sync` |
| `sync_log` | Heartbeat row per sync/job run — what Settings → Status reads (`web/src/lib/status/jobs.json`) | `/api/cron/sync` and the Python jobs (`scripts/_sync_log.py`, `scripts/_joblog.py`) |
| `web_vitals` | Real-user page-load metrics (LCP, FCP, CLS, INP, TTFB) per page load, per route, phone vs desktop (#445) | The signed-in app via `POST /api/vitals` (`components/web-vitals-reporter.tsx`). Summarize with `python3 scripts/web_vitals_report.py [--days 14]` |
| `stocks_cache`, `sports_cache` | Polygon.io; ESPN | `/api/cron/sync` (nightly cron, or `scripts/run-syncs.py`), plus an on-demand refresh when `/dashboard` renders stale data; `sports_cache` also via the sports **MCP tool** |
| `user_metric_preferences` | Per-metric **source** preference — which integration to trust for each metric (e.g. HRV from Oura, body composition from Google Health). Rows are `(user_id, metric, preferred_source)`; `metric` ∈ sleep/hrv/steps/active_calories/readiness/body_composition. **Not units.** Empty in prod → falls back to `METRIC_DEFAULTS` (`web/src/lib/metric-preferences.ts`) | `/settings` (integrations panel writes it via the `saveMetricPreferences` server action; per-metric upsert) |

**Units are not a table.** Display units come solely from `profile.weight_unit`. Weights are stored canonically in **kg** (`strength_session_sets.weight_kg`, `exercise_prs.weight_pr_kg`) and converted at the UI boundary by `kgToDisplay` / `displayToKg` in `web/src/lib/units.ts`. There is no separate units table — if you are hunting a unit bug, this is the only place units live.

## Nutrition: the numbers come from data, not from a model

Macros are **not** produced by an LLM. The pipeline is:

1. **A model** — Claude via the API when `ANTHROPIC_API_KEY` is set, otherwise local
   `qwen2.5vl:7b` via Ollama (`llmProvider()` in `web/src/lib/nutrition/llm-anthropic.ts`;
   `LLM_PROVIDER` forces either) — parses text or a photo into a food list — name, quantity,
   unit — and picks the USDA match from a candidate list. It is *never* asked for grams or calories.
2. **USDA FoodData Central** (`FDC_API_KEY`) supplies the measured portion weights and
   the macros.

The model was measured at ~2x off on portion weight (a large egg at 105g; real ~50g), so
it does the identification and USDA does the arithmetic. Onboarding macro targets use the
**Mifflin-St Jeor** equation (`web/src/lib/nutrition/targets.ts`) — a formula, not a guess.

Code: `web/src/lib/nutrition/{parse,fdc,estimate,suggest,targets}.ts`.
