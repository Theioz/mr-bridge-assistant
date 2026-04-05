# Mr. Bridge — Voice Interface

Hands-free voice interaction with Mr. Bridge. Say "Hey Bridge" → speak → hear a response.

## Architecture
```
Wake word (Porcupine) → STT (faster-whisper) → Claude API → TTS (say / ElevenLabs)
```

## Setup

### 1. Install dependencies
```bash
cd voice
pip install -r requirements.txt
```

On Mac, pyaudio may need portaudio first:
```bash
brew install portaudio
pip install pyaudio
```

### 2. Get API keys

**Anthropic API key** (required)
- https://console.anthropic.com → API Keys

**Picovoice access key** (required for wake word)
- https://console.picovoice.ai → free tier available
- Includes built-in wake words; custom "Hey Bridge" wake word requires a paid model file

**ElevenLabs API key** (optional — higher quality TTS)
- https://elevenlabs.io → free tier available

### 3. Create .env file at project root
```
ANTHROPIC_API_KEY=sk-ant-...
PICOVOICE_ACCESS_KEY=...
ELEVENLABS_API_KEY=...   # optional
```

### 4. Configure voice/config.py
- Set `TTS_ENGINE = "say"` (macOS built-in) or `"elevenlabs"`
- Set `SAY_VOICE` — run `say -v ?` in terminal to list available voices
- Set `WHISPER_MODEL` — `base.en` is a good balance of speed and accuracy on Mac

### 5. Run
```bash
python voice/bridge_voice.py
```

## Wake Word Note
Porcupine's free built-in wake words don't include "Hey Bridge". Options:
- Use the closest built-in (e.g., "Hey Siri" — swapped in config until custom model is trained)
- Train a custom "Hey Bridge" wake word at console.picovoice.ai (free for personal use)
- Set `WAKE_WORD` in config.py and pass the `.ppn` model file path to `pvporcupine.create()`

## TTS Quality
| Engine | Quality | Setup |
|--------|---------|-------|
| `say` (macOS) | Good | None — built-in |
| ElevenLabs | Excellent | API key + voice ID |

## Conversation Memory
Voice sessions maintain conversation history in-memory for the duration of the session. Memory file updates made during voice sessions are written to the same `memory/*.md` files used by Claude Code sessions.
