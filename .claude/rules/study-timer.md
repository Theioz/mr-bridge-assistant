# Study Timer Rules

- Only offer to start a timer when you explicitly say you're starting a study session (e.g. "starting Japanese now", "about to do boot.dev", "starting a coding session")
- Ask: "Start a study timer for [subject]?"
- On confirmation, use the study-timer agent to upsert timer state to the `profile` table (key = 'timer_state')
- When you say "done", "stopping", or "finished studying", stop the timer and log duration to the `study_log` Supabase table
- If a timer is running at session start, flag it in the briefing: "Timer still running: [subject] — started [time]"