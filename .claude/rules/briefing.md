# Session Briefing Protocol

## Session Start Protocol
Execute in this exact order:

1. Run the fitness sync orchestrator (silently, errors are non-fatal — proceed regardless):
   ```bash
   python3 scripts/run-syncs.py
   ```
   This runs all three sync scripts (google_fit, oura, fitbit) in parallel and skips any source synced within the last 30 minutes.
2. Fetch all briefing data from Supabase:
   ```bash
   python3 scripts/fetch_briefing_data.py
   ```
   Read the output — it contains profile, tasks, habits, body composition, workouts, recovery, study log, and recent meals.
3. Issue the following three external fetches **in a single message turn as parallel tool calls** (they are independent — do not run them sequentially):
   - **Calendar events**: `List Calendar Events` for today (primary + any shared/secondary calendars) — note calendar/account source for each event
   - **Upcoming birthdays**: `List Calendar Events` for the next 60 days (timeMin = today, timeMax = today+60 days) — filter for titles matching `'s birthday` (case-insensitive) or calendar name containing "birthday"; compute days_until = event date − today; sort ascending; show only the single nearest birthday regardless of how far out it is; strip "'s birthday" suffix for display
   - **Important unread emails**: `Search Gmail Emails` — filter: unread, subjects containing meeting / urgent / invoice / action required / deadline — note account source; secondary POP3 accounts are labeled (e.g. "Professional") in your primary inbox
4. Deliver session briefing (format below)

## Name Usage
After reading the briefing output, check the PROFILE section for a `name` key.
- If found: address the user by that name throughout the session (e.g. "Morning, Alex." in the briefing header, naturally in responses — not after every sentence).
- If not found: at the end of the briefing, ask: "What should I call you?" Then store the answer:
  ```bash
  python3 - <<'EOF'
  import sys
  sys.path.insert(0, "scripts")
  from _supabase import get_client, get_owner_user_id
  client = get_client()
  uid = get_owner_user_id()
  client.table("profile").upsert({"user_id": uid, "key": "name", "value": "<name>"}, on_conflict="user_id,key").execute()
  print("Name saved.")
  EOF
  ```

## Session Briefing Format
```
## Mr. Bridge — [Day, Date]

### Weather
[temp]°F, [condition] | High: [X]°F  Low: [X]°F | Wind: [X] mph | Precip: [X] in
[Rain expected — plan accordingly]  ← include only if precip > 0.1 in

### Schedule Today
[Calendar events: time + title, or "No events"]

### Upcoming Birthdays
[Name — today / in N days. Omit this section entirely if no birthdays in the next 7 days.]

### Important Emails
[Unread emails matching filter, or "Inbox clear"]

### Pending Tasks
[Active tasks from Supabase `tasks` table (status = 'active'), included in `fetch_briefing_data.py` output, or "None"]

### Accountability — Last 7 Days
[Habit summary from Supabase `habits` + `habit_registry` tables — hit/missed per habit with streak count, included in `fetch_briefing_data.py` output]

### Body Composition (last weigh-in)
Weight: [X] lb | Body Fat: [X]% | Muscle: [X] lb | BMI: [X] | Visceral: [X] — [date]
[delta vs previous entry, e.g. "Weight -1.2 lb | Fat -0.3% vs prior"]

### Yesterday's Activity
[All Session Log rows for yesterday's date — activity, duration, calories. If none: "No workouts logged"]

### Today's Activity
[All Session Log rows for today's date — activity, duration, calories. If none: "None yet"]

### Recovery (last night)
Readiness: [score] | Sleep: [score] | Total: [Xh Ym] | Deep: [Xh Ym] | REM: [Xh Ym] | HRV: [X]ms | RHR: [X] bpm | Active Cal: [X]
[flag if applicable]
```

Body Composition rules:
- Use the **last Renpho row** in Baseline Metrics (rows with Body Fat % filled in, not weight-only Google Fit rows)
- Show delta vs the row before it for weight and body fat %

Recovery rules:
- Use the **most recent row** from the `recovery_metrics` Supabase table (order by date desc, limit 1), included in `fetch_briefing_data.py` output. Oura data lags 1 day — yesterday's date is expected and correct.
- Readiness < 70 → append: "Readiness low — consider deload or rest day"
- Readiness < 50 → append: "Readiness critical — rest day recommended"
- HRV trending down 3+ consecutive days → append: "HRV declining — prioritize recovery"
- If no recovery data returned → show: "No recovery data — run: python3 scripts/sync-oura.py --yes"