# Mr. Bridge — Voice Config

# Claude model
CLAUDE_MODEL = "claude-sonnet-4-6"

# Wake word (requires Picovoice access key)
WAKE_WORD = "Hey Bridge"
PICOVOICE_ACCESS_KEY = ""  # Set in .env: PICOVOICE_ACCESS_KEY

# Speech-to-text (faster-whisper)
WHISPER_MODEL = "base.en"  # Options: tiny.en, base.en, small.en, medium.en
WHISPER_DEVICE = "cpu"     # "cpu" or "cuda" if GPU available

# Text-to-speech
# "say" = macOS built-in (no setup, lower quality)
# "elevenlabs" = higher quality (requires ELEVENLABS_API_KEY in .env)
TTS_ENGINE = "say"
SAY_VOICE = "Samantha"     # macOS voice — run: say -v ? to list options
ELEVENLABS_VOICE_ID = ""   # Set if TTS_ENGINE = "elevenlabs"

# Memory files (absolute paths)
import os
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEMORY_FILES = [
    os.path.join(PROJECT_ROOT, "memory", "profile.md"),
    os.path.join(PROJECT_ROOT, "memory", "fitness_log.md"),
    os.path.join(PROJECT_ROOT, "memory", "meal_log.md"),
    os.path.join(PROJECT_ROOT, "memory", "todo.md"),
    os.path.join(PROJECT_ROOT, "memory", "habits.md"),
]
CLAUDE_RULES = os.path.join(PROJECT_ROOT, ".claude", "rules", "mr-bridge-rules.md")
