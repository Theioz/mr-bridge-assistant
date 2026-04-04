# Mr. Bridge — Personal Assistant

A personal AI assistant context layer for Claude Code. Maintains persistent memory across sessions via markdown files tracked in git.

## Purpose
Mr. Bridge is Jason's structured personal assistant. It loads memory on session start, delivers a briefing, tracks accountability, and persists relevant information across sessions via git.

## File Structure
```
mr-bridge-assistant/
├── CLAUDE.md              # Session bootstrap instructions (read first)
├── README.md              # This file
├── .gitignore
└── memory/
    ├── profile.md         # Identity, background, preferences
    ├── fitness_log.md     # Program, session log, metrics
    ├── meal_log.md        # Recipes, meal prep, staple ingredients
    └── todo.md            # Tasks, daily accountability, study logs
```

## Session Workflow

1. Open Claude Code in this directory
2. Claude reads `CLAUDE.md` on session start
3. Claude loads all `memory/` files
4. Claude delivers session briefing: pending tasks, accountability gaps, calendar if accessible
5. Work the session
6. Before closing: confirm any memory updates, write them immediately
7. Commit and push

## Usage Instructions

### Starting a Session
Open Claude Code with this directory as the working directory. CLAUDE.md will instruct the assistant to load all memory files before responding.

### Updating Memory
Mr. Bridge will flag items for memory updates during the session. Confirm to write. All updates are written immediately on confirmation.

### Adding Tasks
Ask Mr. Bridge to add a task to `memory/todo.md`. It will confirm before writing.

### Logging Fitness / Meals / Study
Ask Mr. Bridge to log an entry to the relevant memory file. It will confirm before writing.

## Git Commit Reminder
After every session where memory files were updated:

```bash
git add .
git commit -m "session: <date> — <brief summary of updates>"
git push
```

This keeps memory in sync across devices.
