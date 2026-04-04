# Mr. Bridge — Personal Assistant

A personal AI assistant context layer for Claude Code. Maintains persistent memory across sessions via markdown files tracked in git.

## Purpose
Mr. Bridge is a structured personal assistant that loads memory on session start, delivers a briefing, tracks accountability, and persists relevant information across sessions via git.

## File Structure
```
mr-bridge-assistant/
├── CLAUDE.md                        # Session bootstrap instructions (read first)
├── README.md                        # This file
├── .gitignore
└── memory/
    ├── profile.template.md          # Template: identity, background, preferences
    ├── fitness_log.template.md      # Template: program, session log, metrics
    ├── meal_log.template.md         # Template: recipes, meal prep, staple ingredients
    └── todo.template.md             # Template: tasks, daily accountability, study logs
```

> Personal memory files (`profile.md`, `fitness_log.md`, `meal_log.md`, `todo.md`) are gitignored — your data stays local.

## Getting Started

1. Clone the repo
2. Copy the templates to create your personal memory files:
   ```bash
   cp memory/profile.template.md memory/profile.md
   cp memory/fitness_log.template.md memory/fitness_log.md
   cp memory/meal_log.template.md memory/meal_log.md
   cp memory/todo.template.md memory/todo.md
   ```
3. Fill in your details — or let Mr. Bridge populate them during your first session
4. Open Claude Code in this directory and start your session

## Session Workflow

1. Open Claude Code in this directory
2. Claude reads `CLAUDE.md` on session start
3. Claude loads all `memory/` files
4. Claude delivers session briefing: pending tasks, accountability gaps, calendar if accessible
5. Work the session
6. Before closing: confirm any memory updates, write them immediately
7. Commit and push (personal memory files stay local — only template/config changes go to remote)

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
After sessions where templates or config were updated:

```bash
git add .
git commit -m "session: <date> — <brief summary of updates>"
git push
```

Personal memory files are gitignored and will never be pushed.
