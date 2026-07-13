# Data Sources

All live data is in **self-hosted Supabase** on `compute-core` (`supabase.jl-infra-lab.com`).
Migrated off Supabase Cloud 2026-07-13 — see ADR 0017 in the jl-homelab repo.

There is **no in-app chat**. Conversation happens through the **MCP server**
(`web/mcp/run.sh`), which exposes the same 30 tools to Claude Code. Where a row below
says "MCP tool", that tool is available to you directly in this session.

| Supabase table | Source | How it's written |
|---|---|---|
| `user_integrations` | OAuth tokens — Google, Fitbit, Oura PAT | Connect via `/settings`. Refresh tokens are **pgcrypto-encrypted** with `ENCRYPTION_KEY` |
| `fitness_log` | Google Fit (weight) + Fitbit (weight/fat/BMI) | `sync-googlefit.py`, `sync-fitbit.py`, `/api/cron/sync` |
| `workout_sessions` | Fitbit | `sync-fitbit.py` |
| `recovery_metrics` | Oura Ring | `sync-oura.py` |
| `strength_sessions`, `strength_session_sets`, `exercise_prs` | In-app set logger | `/api/strength-sessions` |
| `workout_plans` | Weekly planner | `/api/internal/plan` (AI-free) + `scripts/weekly_plan.py` |
| `user_equipment` | Manual | `/settings` |
| `habits` + `habit_registry` | Manual | `scripts/log_habit.py`, or the `log_habit` **MCP tool** |
| `tasks` + `study_log` | Manual | `/tasks` page, or `add_task` / `complete_task` **MCP tools** |
| `profile` | k/v store: name, macro targets, watchlists, `onboarding_completed` | `/settings`, or `update_profile` **MCP tool** |
| `recipes` + `meal_log` | Manual + photo/text analysis | `/api/meals/log` (plain CRUD). **There is no `log_meal` tool** — the model proposes, the UI confirms, the route writes |
| `journal_entries` | Manual | `/journal` server action. **No tool writes journal entries** |
| `backlog_items` + `backlog_sessions` | Manual + TMDB/IGDB/OpenLibrary metadata | `/api/backlog/*`, or `list_backlog` / `add_backlog_item` / `update_backlog_item` / `log_backlog_session` **MCP tools** |
| `notifications`, `packages` | ntfy push history; Gmail package scan | `/api/cron/sync` |
| `stocks_cache`, `sports_cache` | Polygon.io; ESPN | `/api/stocks/refresh`, `/api/sports/refresh` |
| `user_metric_preferences` | Unit preferences (kg/lb) | `/settings` |
| `chat_sessions`, `chat_messages` | **Orphaned.** Retained for history; nothing writes them since the chat was deleted (#476) | — |

## Nutrition: the numbers come from data, not from a model

Macros are **not** produced by an LLM. The pipeline is:

1. **Local model** (`qwen2.5vl:7b` via Ollama) parses text or a photo into a food list —
   name, quantity, unit. It is *never* asked for grams or calories.
2. **USDA FoodData Central** (`FDC_API_KEY`) supplies the measured portion weights and
   the macros.

The model was measured at ~2x off on portion weight (a large egg at 105g; real ~50g), so
it does the identification and USDA does the arithmetic. Onboarding macro targets use the
**Mifflin-St Jeor** equation (`web/src/lib/nutrition/targets.ts`) — a formula, not a guess.

Code: `web/src/lib/nutrition/{parse,fdc,estimate,suggest,targets}.ts`.
