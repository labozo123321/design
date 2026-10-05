#!/usr/bin/env python3
"""
Voices for the Fight composition, synthesised with Kokoro-82M (Apache 2.0).

  announcer  am_fenrir, pitched down 3 semitones, slight grit and a big hall
  narrator   am_michael, dry and deadpan

    KOKORO_DIR=/path/to/models python3 scripts/generate-fight-voice.py
Writes public/fight/vo/*.mp3 and src/fight/voice.json (clip lengths in frames).
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

LINES = {
    "round": ("announcer", "Round one.", 0.9),
    "fight": ("announcer", "Fight.", 0.9),
    "finish": ("announcer", "Finish it.", 0.85),
    "ko": ("announcer", "Kay. Oh.", 0.8),
    "email": ("narrator", "It was one email.", 0.95),
    "end": ("narrator", "FourFig. We'll walk you through the scary parts.", 1.0),
}
VOICES = {"announcer": "am_fenrir", "narrator": "am_michael"}


def trim(x, sr, thresh=0.01):
    idx = np.where(np.abs(x) > thresh)[0]
    return x[max(0, idx[0] - int(0.02 * sr)) : idx[-1] + int(0.08 * sr)] if len(idx) else x


def main():
    k = Kokoro(os.path.join(MODELS, "kokoro-v1.0.onnx"), os.path.join(MODELS, "voices-v1.0.bin"))
    meta = {}
    for key, (role, text, speed) in LINES.items():
        x, sr = k.create(text, voice=VOICES[role], speed=speed, lang="en-us")
        x = trim(np.asarray(x, dtype=np.float32), sr)
        x = x / np.abs(x).max() * 0.85
        out = os.path.join(ROOT, "public", "fight", "vo", f"{key}.mp3")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            wav = f.name
        sf.write(wav, x, sr)
        if role == "announcer":
            # down 3 semitones at the same length, a little drive, then a large hall
            r = 2 ** (-3 / 12)
            af = (
                f"asetrate={sr}*{r:.5f},aresample={sr},atempo={1 / r:.5f},"
                "acompressor=threshold=0.1:ratio=6:attack=5:release=80,"
                "aecho=0.8:0.6:60|130:0.35|0.22,volume=1.1"
            )
        else:
            af = "acompressor=threshold=0.2:ratio=3:attack=5:release=100"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", af + ",apad=pad_dur=0.6,alimiter=limit=0.9",
             "-ar", "48000", "-b:a", "192k", out],
            check=True,
        )
        os.remove(wav)
        dur = float(subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).decode())
        meta[key] = {"file": f"fight/vo/{key}.mp3", "text": text, "frames": int(np.ceil((len(x) / sr) * FPS)), "tail": int(dur * FPS)}
        print(key, meta[key])
    with open(os.path.join(ROOT, "src", "fight", "voice.json"), "w") as f:
        json.dump(meta, f, indent=1)


if __name__ == "__main__":
    main()
