# Data Sources

All live data is stored in Supabase. Local markdown files are archived originals.

| Supabase Table | Source | Script |
|----------------|--------|--------|
| `user_integrations` | OAuth tokens (Google, Fitbit, Oura PAT) — encrypted | Connect via /settings |
| `fitness_log` | Google Fit (weight) + Fitbit (weight/fat/BMI) | `sync-googlefit.py`, `sync-fitbit.py` |
| `workout_sessions` | Fitbit | `sync-fitbit.py` |
| `recovery_metrics` | Oura Ring | `sync-oura.py` |
| `habits` + `habit_registry` | Manual logging | `log_habit.py` |
| `tasks` + `study_log` | Manual logging | (future command) |
| `profile` | Migrated from `profile.md`; holds `timer_state` key (study timer active state) | (edit via Supabase or future command) |
| `recipes` + `meal_log` | Migrated from `meal_log.md` | `get_recipes` / `log_meal` tools (web chat) |
| `chat_sessions` + `chat_messages` | Web interface | Chat API (`/api/chat`) |