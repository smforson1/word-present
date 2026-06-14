"""
transcribe.py — Whisper Sidecar

Spawned as a child process by Electron's main process.
Reads raw Int16 PCM audio chunks from stdin (as JSON lines),
transcribes them with faster-whisper, and writes results to stdout (JSON lines).

Install:
    pip install faster-whisper

Usage (handled automatically by main.js):
    python transcribe.py --model medium --language en
"""

import sys
import json
import argparse
import numpy as np
from faster_whisper import WhisperModel

# ── Argument parsing ────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--model", default="medium",
                    choices=["tiny", "base", "small", "medium", "large-v3"],
                    help="Whisper model size. 'medium' is the best balance for sermons.")
parser.add_argument("--language", default="en",
                    help="Language code, e.g. 'en' for English, 'fr' for French.")
parser.add_argument("--device", default="cpu",
                    choices=["cpu", "cuda"],
                    help="Use 'cuda' if you have an NVIDIA GPU for much faster transcription.")
args = parser.parse_args()

# ── Load model ───────────────────────────────────────────────────────────────
# compute_type="int8" is fastest on CPU with minimal quality loss
model = WhisperModel(args.model, device=args.device, compute_type="int8")

# Tell main process the model is ready
print(json.dumps({"type": "ready", "model": args.model}), flush=True)

# ── State for context-aware transcription ────────────────────────────────────
# Keeping the last transcript lets Whisper continue sentences naturally
previous_text = ""

# ── Main loop ────────────────────────────────────────────────────────────────
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue

    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        continue

    if msg.get("type") == "quit":
        break

    if msg.get("type") != "chunk":
        continue

    chunk_index = msg["chunkIndex"]
    pcm_int16 = np.array(msg["pcm"], dtype=np.int16)

    # Convert Int16 PCM → Float32 in range [-1, 1] (what Whisper expects)
    audio_float32 = pcm_int16.astype(np.float32) / 32768.0

    # ── Transcribe ──────────────────────────────────────────────────────────
    segments, info = model.transcribe(
        audio_float32,
        language=args.language,

        # Use the previous chunk's text as context so Whisper doesn't treat
        # each chunk as a cold start — critical for mid-sentence accuracy
        initial_prompt=previous_text[-200:] if previous_text else None,

        # Word-level timestamps let us stitch overlapping chunks precisely
        word_timestamps=True,

        # Voice Activity Detection: skip silent sections automatically
        vad_filter=True,
        vad_parameters={
            "min_silence_duration_ms": 300,   # ignore pauses shorter than 300ms
            "speech_pad_ms": 100,             # keep 100ms padding around speech
        },

        # Beam search size — higher = more accurate, slightly slower
        beam_size=5,

        # Penalise repeating the same phrase (guards against Whisper loops)
        no_repeat_ngram_size=3,

        # Temperature 0 = deterministic, most accurate for clear speech
        temperature=0.0,
    )

    # ── Collect words with timestamps ───────────────────────────────────────
    words = []
    full_text = ""

    for segment in segments:
        full_text += segment.text
        if segment.words:
            for word in segment.words:
                words.append({
                    "word": word.word.strip(),
                    "start": round(word.start, 3),  # seconds from chunk start
                    "end": round(word.end, 3),
                    "probability": round(word.probability, 3),
                })

    full_text = full_text.strip()

    # Update context for next chunk
    if full_text:
        previous_text = full_text

    # ── Send result back to Node.js ─────────────────────────────────────────
    result = {
        "type": "transcript",
        "chunkIndex": chunk_index,
        "text": full_text,
        "words": words,
        "language": info.language,
        "languageProbability": round(info.language_probability, 3),
    }

    print(json.dumps(result), flush=True)
