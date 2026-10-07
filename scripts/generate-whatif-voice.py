#!/usr/bin/env python3
"""
Narration for the WhatIf composition (Kokoro-82M, bm_george: calm British documentary voice).
Each line is pinned to the second where the gravity readout matches what it says.

    KOKORO_DIR=/path/to/models python3 scripts/generate-whatif-voice.py
Writes public/whatif/vo/*.mp3 and src/whatif/voice.json.
"""

import json
import os
import subprocess
import tempfile

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.environ.get("KOKORO_DIR", os.path.join(ROOT, "models"))
FPS = 30
VOICE = os.environ.get("VO_VOICE", "bm_george")
SPEED = 1.08

# (start second, text, highlight words). Gravity = 100% until 3 s, then minus 5% per second.
LINES = [
    (0.3, "What if gravity got five percent weaker every second?", ["weaker"]),
    (4.0, "At first, you'd barely notice. Then the fountain starts reaching higher.", ["higher."]),
    (9.0, "At seventy percent, kids start clearing park benches.", ["benches."]),
    (13.0, "At half gravity, every jump lasts twice as long.", ["twice"]),
    (16.4, "At a third, you could leap over a parked car.", ["car."]),
    (19.6, "Seventeen percent. That's Moon gravity.", ["Moon"]),
    (23.0, "At zero, nothing is holding anything down.", ["zero,"]),
    (26.2, "The river lifts off in wobbling blobs of water, and anyone who jumps just keeps going.", ["keeps", "going."]),
    (31.8, "Even the air starts drifting into space. The sky turns black, and the city goes silent.", ["black,", "silent."]),
    (37.8, "How long would you last?", ["last?"]),
]


def trim(x, sr, thresh=0.01):
    idx = np.where(np.abs(x) > thresh)[0]
    return x[max(0, idx[0] - int(0.02 * sr)) : idx[-1] + int(0.08 * sr)] if len(idx) else x


def main():
    k = Kokoro(os.path.join(MODELS, "kokoro-v1.0.onnx"), os.path.join(MODELS, "voices-v1.0.bin"))
    out = []
    for i, (start, text, hl) in enumerate(LINES):
        x, sr = k.create(text, voice=VOICE, speed=SPEED, lang="en-gb")
        x = trim(np.asarray(x, dtype=np.float32), sr)
        x = x / np.abs(x).max() * 0.85
        path = os.path.join(ROOT, "public", "whatif", "vo", f"vo-{i:02d}.mp3")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            wav = f.name
        sf.write(wav, x, sr)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", "acompressor=threshold=0.2:ratio=3:attack=5:release=100",
             "-ar", "48000", "-b:a", "192k", path],
            check=True,
        )
        os.remove(wav)
        dur = len(x) / sr
        out.append({"file": f"whatif/vo/vo-{i:02d}.mp3", "text": text, "highlight": hl,
                    "from": round(start * FPS), "duration": int(np.ceil(dur * FPS))})
        end = start + dur
        nxt = LINES[i + 1][0] if i + 1 < len(LINES) else 41
        print(f"{start:5.1f}s  {dur:4.2f}s  ends {end:5.2f}  {'OVERLAP' if end > nxt - 0.2 else ''}  {text}")
    with open(os.path.join(ROOT, "src", "whatif", "voice.json"), "w") as f:
        json.dump({"fps": FPS, "voice": VOICE, "lines": out}, f, indent=1)


if __name__ == "__main__":
    main()
