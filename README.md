# Mr. Bridge — Personal Assistant

A personal AI assistant context layer for Claude Code. Loads memory on session start, delivers a structured briefing, tracks habits and accountability, and persists context across sessions via git.

## Purpose
Mr. Bridge is built to run like infrastructure — frameworks over feelings, quantified over qualitative, no filler. It reads your profile, schedule, emails, and habit log at session start and gives you a concise brief before you do anything else.

## File Structure
```
mr-bridge-assistant/
├── CLAUDE.md                              # Session bootstrap (read first — loads rules via @path)
├── CHANGELOG.md                           # Version history
├── README.md
├── .gitignore
├── .mcp.json                              # MCP servers: Google Calendar, Gmail, DeepWiki
├── .gitmodules
│
├── .claude/
│   ├── rules/
│   │   └── mr-bridge-rules.md             # Core behavioral rules + session protocol
│   ├── agents/
│   │   ├── nightly-postmortem.md          # 9pm habit check-in agent
│   │   ├── morning-nudge.md               # 8am session nudge agent
│   │   ├── weekly-review.md               # Sunday 8pm weekly summary agent
│   │   └── study-timer.md                 # Study session timer agent
│   ├── commands/
│   │   ├── log-habit.md                   # /log-habit slash command
│   │   ├── session-briefing.md            # /session-briefing slash command
│   │   ├── weekly-review.md               # /weekly-review slash command
│   │   └── stop-timer.md                  # /stop-timer slash command
│   ├── skills/
│   │   ├── send-notification/SKILL.md     # macOS push notification skill
│   │   └── log-habit/SKILL.md             # Habit logging skill
│   ├── hooks/
│   │   └── scripts/hooks.py               # PostToolUse hook (Python 3)
│   ├── settings.json                      # Shared hooks config
│   └── references/
│       └── best-practice/                 # Submodule: shanraisshan/claude-code-best-practice
│
├── .github/
│   └── workflows/
│       └── weekly-review-nudge.yml        # Sunday 8pm ntfy.sh push (runs in cloud)
│
├── docs/
│   └── notifications-setup.md            # Android, macOS, Windows ntfy setup guide
│
├── memory/                                # Personal files (gitignored — your data stays local)
│   ├── profile.template.md
│   ├── fitness_log.template.md
│   ├── meal_log.template.md
│   ├── todo.template.md
│   └── habits.template.md
│
├── scripts/
│   ├── notify.sh                          # macOS push notifications via osascript
│   └── update-references.sh              # Pull latest best practices submodule
│
└── voice/                                 # Jarvis mode (voice interface)
    ├── bridge_voice.py                    # Wake word → STT → Claude API → TTS
    ├── config.py
    ├── requirements.txt
    └── README.md
```

> Personal memory files (`profile.md`, `fitness_log.md`, `meal_log.md`, `todo.md`, `habits.md`) are gitignored — never pushed to remote.

## Getting Started

### 1. Clone and set up memory files
```bash
git clone --recurse-submodules https://github.com/Theioz/mr-bridge-assistant.git
cd mr-bridge-assistant

cp memory/profile.template.md memory/profile.md
cp memory/fitness_log.template.md memory/fitness_log.md
cp memory/meal_log.template.md memory/meal_log.md
cp memory/todo.template.md memory/todo.md
cp memory/habits.template.md memory/habits.md
```

### 2. Set up environment variables
Create a `.env` file at the project root:
```
NTFY_TOPIC=your-unique-topic   # e.g. mr-bridge-yourname-1234 — pick anything hard to guess
ANTHROPIC_API_KEY=             # Only needed for voice interface
PICOVOICE_ACCESS_KEY=          # Only needed for voice interface
```

### 3. Set up push notifications (Android, macOS, Windows)
See [docs/notifications-setup.md](docs/notifications-setup.md) for step-by-step instructions.

Short version:
- **Android/iOS:** Install the [ntfy app](https://ntfy.sh) → subscribe to your `NTFY_TOPIC`
- **Windows:** Install [ntfy-desktop](https://github.com/Aetherinox/ntfy-desktop) → subscribe to your topic
- **macOS:** Already works via `scripts/notify.sh` — no extra setup

For the weekly review cloud nudge (Sunday 8pm), add `NTFY_TOPIC` as a GitHub Actions secret:
repo → Settings → Secrets and variables → Actions → New secret → Name: `NTFY_TOPIC`

### 4. Connect Google Calendar + Gmail
Open Claude Code in the project directory, then run `/mcp` and authenticate with your Google account. This gives Mr. Bridge access to your calendar and inbox for the session briefing.

### 5. Open Claude Code in this directory
```bash
claude .
```
Mr. Bridge will load all memory files and deliver a session briefing automatically.

> **First time?** If the Claude CLI isn't found, install it: `npm install -g @anthropic-ai/claude-code`

## Session Workflow

1. Open Claude Code in this directory
2. Mr. Bridge loads memory files + fetches calendar + Gmail
3. Session briefing delivered: schedule, emails, tasks, habit accountability
4. Work the session — use `/log-habit`, `/session-briefing` as needed
5. Confirm any memory updates before session ends
6. Commit and push

```bash
git add .
git commit -m "session: $(date +%Y-%m-%d) — <summary>"
git push
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/log-habit [habits...]` | Log habit completions for today |
| `/session-briefing` | Re-run the full session briefing on demand |
| `/weekly-review` | Run the weekly habit + accountability summary |
| `/stop-timer` | Stop active study timer and log duration |

## Feature Development Workflow

Before starting any feature work:
```bash
bash scripts/update-references.sh   # pull latest best practices
git checkout -b feature/<name>
```

After implementation, open a PR — do not push directly to `main`.
Feature backlog is tracked via [GitHub Issues](https://github.com/Theioz/mr-bridge-assistant/issues).

## Voice Interface (Jarvis Mode)

See [voice/README.md](voice/README.md) for full setup. Requires Picovoice access key and `ANTHROPIC_API_KEY`.

```bash
pip install -r voice/requirements.txt
python voice/bridge_voice.py
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.
