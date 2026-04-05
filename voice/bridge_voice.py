#!/usr/bin/env python3
"""
Mr. Bridge — Voice Interface
Wake word → STT → Claude API → TTS

Usage:
  python voice/bridge_voice.py

Requires:
  - .env file with API keys (see voice/README.md)
  - pip install -r voice/requirements.txt
"""

import os
import sys
import struct
import subprocess
import tempfile
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

import anthropic
import pvporcupine
import pyaudio
from faster_whisper import WhisperModel

from config import (
    CLAUDE_MODEL, WAKE_WORD, PICOVOICE_ACCESS_KEY,
    WHISPER_MODEL, WHISPER_DEVICE,
    TTS_ENGINE, SAY_VOICE, ELEVENLABS_VOICE_ID,
    MEMORY_FILES, CLAUDE_RULES, PROJECT_ROOT
)


def load_system_prompt() -> str:
    """Load CLAUDE.md rules + all memory files into system prompt."""
    parts = []

    # Load behavioral rules
    if os.path.exists(CLAUDE_RULES):
        with open(CLAUDE_RULES) as f:
            parts.append(f"# Mr. Bridge Rules\n{f.read()}")

    # Load memory files
    for path in MEMORY_FILES:
        if os.path.exists(path):
            filename = os.path.basename(path)
            with open(path) as f:
                parts.append(f"# {filename}\n{f.read()}")

    parts.append(
        "\n# IMPORTANT: You are operating in VOICE MODE. "
        "Responses will be spoken aloud. No markdown, no tables, no headers. "
        "Plain conversational sentences only. Keep responses concise (under 3 sentences "
        "unless more detail is explicitly requested)."
    )

    return "\n\n---\n\n".join(parts)


def transcribe_audio(audio_data: bytes, sample_rate: int) -> str:
    """Transcribe audio bytes using faster-whisper."""
    model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        import wave
        with wave.open(f.name, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(audio_data)
        segments, _ = model.transcribe(f.name, language="en")
        return " ".join(s.text for s in segments).strip()


def speak(text: str):
    """Speak text using configured TTS engine."""
    if TTS_ENGINE == "elevenlabs":
        try:
            from elevenlabs.client import ElevenLabs
            from elevenlabs import play
            client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
            audio = client.generate(text=text, voice=ELEVENLABS_VOICE_ID)
            play(audio)
            return
        except Exception as e:
            print(f"ElevenLabs error: {e} — falling back to say")

    subprocess.run(["say", "-v", SAY_VOICE, text])


def ask_claude(transcript: str, conversation_history: list, system_prompt: str) -> str:
    """Send transcript to Claude and return response text."""
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    conversation_history.append({"role": "user", "content": transcript})

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=512,
        system=system_prompt,
        messages=conversation_history
    )

    reply = response.content[0].text
    conversation_history.append({"role": "assistant", "content": reply})
    return reply


def record_until_silence(pa: pyaudio.PyAudio, sample_rate: int, silence_threshold=500, silence_duration=1.5) -> bytes:
    """Record audio until silence is detected."""
    import audioop
    stream = pa.open(format=pyaudio.paInt16, channels=1, rate=sample_rate, input=True, frames_per_buffer=512)
    frames = []
    silent_chunks = 0
    required_silent_chunks = int(silence_duration * sample_rate / 512)

    print("Listening...")
    while True:
        data = stream.read(512, exception_on_overflow=False)
        frames.append(data)
        rms = audioop.rms(data, 2)
        if rms < silence_threshold:
            silent_chunks += 1
        else:
            silent_chunks = 0
        if silent_chunks >= required_silent_chunks and len(frames) > required_silent_chunks:
            break

    stream.stop_stream()
    stream.close()
    return b"".join(frames)


def main():
    access_key = PICOVOICE_ACCESS_KEY or os.getenv("PICOVOICE_ACCESS_KEY", "")
    if not access_key:
        print("Error: PICOVOICE_ACCESS_KEY not set. Add it to .env or voice/config.py")
        sys.exit(1)

    if not os.getenv("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY not set in .env")
        sys.exit(1)

    print("Loading Mr. Bridge memory...")
    system_prompt = load_system_prompt()
    conversation_history = []

    porcupine = pvporcupine.create(access_key=access_key, keywords=["hey siri"])  # closest built-in; custom wake word via pvporcupine model file
    pa = pyaudio.PyAudio()
    sample_rate = porcupine.sample_rate
    frame_length = porcupine.frame_length

    stream = pa.open(format=pyaudio.paInt16, channels=1, rate=sample_rate, input=True, frames_per_buffer=frame_length)

    print(f'Mr. Bridge voice interface ready. Say "{WAKE_WORD}" to activate.')

    try:
        while True:
            pcm = stream.read(frame_length, exception_on_overflow=False)
            pcm_unpacked = struct.unpack_from("h" * frame_length, pcm)
            keyword_index = porcupine.process(pcm_unpacked)

            if keyword_index >= 0:
                speak("Yes?")
                audio_data = record_until_silence(pa, sample_rate)
                transcript = transcribe_audio(audio_data, sample_rate)

                if not transcript:
                    speak("I didn't catch that.")
                    continue

                print(f"You: {transcript}")
                reply = ask_claude(transcript, conversation_history, system_prompt)
                print(f"Mr. Bridge: {reply}")
                speak(reply)

    except KeyboardInterrupt:
        print("\nShutting down Mr. Bridge voice interface.")
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()
        porcupine.delete()


if __name__ == "__main__":
    main()
