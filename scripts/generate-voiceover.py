#!/usr/bin/env python3
"""
Voiceovers synthesised with Kokoro-82M (open-weights TTS, Apache 2.0) via
kokoro-onnx. One clip per sentence, so caption and animation timing is exact.

    pip install kokoro-onnx soundfile
    # model files from https://huggingface.co/fastrtc/kokoro-onnx (not committed, ~350 MB)
    KOKORO_DIR=/path/to/models python3 scripts/generate-voiceover.py            # ExplainerVO
    KOKORO_DIR=/path/to/models python3 scripts/generate-voiceover.py story      # Story

explainer: lines are fitted into the Explainer's fixed scene windows.
  → public/voiceover/*.mp3, src/voiceover/vo.json
story: the voice drives the edit. Each scene lasts as long as its lines need,
  and the scene windows are written out alongside the line timings.
  → public/story/vo/*.mp3, src/story/vo.json
"""

import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.environ.get("KOKORO_DIR", os.path.join(ROOT, "models"))
PIECE = sys.argv[1] if len(sys.argv) > 1 else "explainer"
VOICE = os.environ.get("VO_VOICE", {"explainer": "af_heart", "story": "am_michael"}[PIECE])
FPS = 30

# (scene start s, scene end s, sentences). Scene windows match src/explainer/timeline.ts.
SCRIPT = [
    (0.0, 4.0, ["Your side hustle.", "One step at a time."]),
    (4.0, 10.0, ["FourFig turns your idea into a simple path,", "so you always know what's next."]),
    (10.0, 15.0, ["Each stage is a few small moves.", "Pick a person. Write an offer. Hit send."]),
    (15.0, 21.0, ["When someone pays you, save their name.", "One tap asks them to book again."]),
    (21.0, 26.0, ["Log every win,", "and watch it add up."]),
    (26.0, 30.0, ["FourFig.", "Your side hustle, mapped."]),
]
LEAD = 0.25  # breath after a cut before the voice comes in
GAP = 0.18  # pause between sentences
TAIL = 0.3  # room before the next cut


def trim(x, sr, thresh=0.01):
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(0.02 * sr))
    b = min(len(x), idx[-1] + int(0.06 * sr))
    return x[a:b]


def synth(k, text, speed):
    x, sr = k.create(text, voice=VOICE, speed=speed, lang="en-us")
    return trim(np.asarray(x, dtype=np.float32), sr), sr


def to_mp3(x, sr, path):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav = f.name
    sf.write(wav, x, sr)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ar", "48000", "-b:a", "192k", path], check=True)
    os.remove(wav)


# Story: (scene id, minimum seconds, sentences). Male voice, a touch brisker.
STORY = [
    ("paper", 4.2, ["You've got a skill.", "You design. You fix. You cook. You teach."]),
    ("blueprint", 4.4, ["But turning it into a side hustle?", "Nobody hands you the plan."]),
    ("bauhaus", 5.0, ["FourFig does.", "One clear path, broken into small steps you can actually finish."]),
    ("riso", 5.0, ["Find your first client.", "Make the ask.", "Get paid.", "Then do it again."]),
    ("groovy", 4.6, ["Log every win.", "Keep your streak.", "Watch your progress stack up."]),
    ("end", 4.4, ["FourFig.", "Your side hustle, mapped."]),
]
STORY_SPEED = 1.06
STORY_GAP = 0.22


def story():
    k = Kokoro(os.path.join(MODELS, "kokoro-v1.0.onnx"), os.path.join(MODELS, "voices-v1.0.bin"))
    out_dir = os.path.join(ROOT, "public", "story", "vo")
    os.makedirs(out_dir, exist_ok=True)
    scenes, lines = [], []
    t, n = 0.0, 0
    for sid, min_s, sentences in STORY:
        s0 = t
        t += 0.3 if n else 0.35
        idx = []
        for text in sentences:
            x, sr = synth(k, text, STORY_SPEED)
            dur = len(x) / sr
            name = f"vo-{n:02d}.mp3"
            to_mp3(x / max(1e-6, np.abs(x).max()) * 0.89, sr, os.path.join(out_dir, name))
            words = text.split()
            weights = np.array([len(w.strip(".,?")) + 1 for w in words], dtype=float)
            edges = np.concatenate([[0], np.cumsum(weights) / weights.sum()]) * dur
            lines.append(
                {
                    "file": f"story/vo/{name}",
                    "text": text,
                    "scene": sid,
                    "from": round(t * FPS),
                    "duration": int(np.ceil(dur * FPS)),
                    "words": [{"w": w, "at": round((t + edges[i]) * FPS)} for i, w in enumerate(words)],
                }
            )
            idx.append(n)
            print(f"{sid:9s} {t:6.2f}s  {dur:4.2f}s  {text}")
            t += dur + STORY_GAP
            n += 1
        t = max(s0 + min_s, t - STORY_GAP + 0.45)
        if sid == "end":
            t = max(t, s0 + min_s) + 0.6
        scenes.append({"id": sid, "from": round(s0 * FPS), "to": round(t * FPS), "lines": idx})
    # snap scene boundaries to whole frames, contiguous
    for a, b in zip(scenes, scenes[1:]):
        b["from"] = a["to"]
    total = scenes[-1]["to"]
    print(f"total {total / FPS:.2f}s ({total} frames)")
    with open(os.path.join(ROOT, "src", "story", "vo.json"), "w") as f:
        json.dump({"fps": FPS, "voice": VOICE, "duration": total, "scenes": scenes, "lines": lines}, f, indent=1)


def main():
    k = Kokoro(os.path.join(MODELS, "kokoro-v1.0.onnx"), os.path.join(MODELS, "voices-v1.0.bin"))
    out_dir = os.path.join(ROOT, "public", "voiceover")
    os.makedirs(out_dir, exist_ok=True)
    lines = []
    n = 0
    for s0, s1, sentences in SCRIPT:
        budget = (s1 - s0) - LEAD - TAIL - GAP * (len(sentences) - 1)
        speed = 1.0
        for _ in range(6):  # speed up gently until the scene's lines fit
            clips = [synth(k, t, speed) for t in sentences]
            total = sum(len(c) / sr for c, sr in clips)
            if total <= budget or speed >= 1.3:
                break
            speed = min(1.3, speed * total / budget * 1.02)
        t = s0 + LEAD
        for text, (x, sr) in zip(sentences, clips):
            dur = len(x) / sr
            name = f"vo-{n:02d}.mp3"
            to_mp3(x / max(1e-6, np.abs(x).max()) * 0.89, sr, os.path.join(out_dir, name))
            words = text.split()
            # per-word timing, proportional to letters (+1 for the gap)
            weights = np.array([len(w.strip(".,")) + 1 for w in words], dtype=float)
            edges = np.concatenate([[0], np.cumsum(weights) / weights.sum()]) * dur
            lines.append(
                {
                    "file": f"voiceover/{name}",
                    "text": text,
                    "from": round(t * FPS),
                    "duration": int(np.ceil(dur * FPS)),
                    "words": [{"w": w, "at": round((t + edges[i]) * FPS)} for i, w in enumerate(words)],
                }
            )
            print(f"{t:6.2f}s  {dur:4.2f}s  x{speed:.2f}  {text}")
            if t + dur > s1 - 0.05:
                print("   ! overruns its scene")
            t += dur + GAP
            n += 1
    with open(os.path.join(ROOT, "src", "voiceover", "vo.json"), "w") as f:
        json.dump({"fps": FPS, "voice": VOICE, "lines": lines}, f, indent=1)


if __name__ == "__main__":
    story() if PIECE == "story" else main()
