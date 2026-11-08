#!/usr/bin/env python3
"""
Narration for Lift ("POV: rockets terrify you, so you build an elevator to space").

The voice drives the edit, as in the reel format it copies: one Kokoro-82M clip per sentence
(am_michael), laid end to end with short gaps; then every word is timed by aligning a Whisper
transcript of each clip to the script, so the word-by-word captions and the cuts land on the voice.

    pip install kokoro-onnx soundfile faster-whisper
    # kokoro-v1.0.onnx + voices-v1.0.bin from huggingface.co/fastrtc/kokoro-onnx
    KOKORO_DIR=/path/to/models python3 scripts/generate-lift-voice.py
    python3 scripts/generate-lift-voice.py --captions-only    # re-chunk the captions from vo.json

Writes out/lift/vo.wav (48 kHz master for the mix), public/lift/vo.mp3 (preview) and
src/lift/vo.json (sentences, words and caption chunks, in seconds).
"""

import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.environ.get("KOKORO_DIR", os.path.join(ROOT, "models"))
VOICE = os.environ.get("VO_VOICE", "am_michael")
SPEED = float(os.environ.get("VO_SPEED", "1.07"))
SR_OUT = 48000
LEAD_IN = 0.45

# (gap before the sentence, s; the sentence). Longer gaps where the story turns.
LINES = [
    (0.0, "You want to go to space more than anything."),
    (0.25, "There's just one problem."),
    (0.2, "Rockets terrify you."),
    (0.3, "Every launch is a controlled explosion, and people sit right on top of it."),
    (0.45, "But nobody knows your secret genius master plan."),
    (0.25, "You're going to take the elevator."),
    (0.5, "First, the height."),
    (0.2, "Space starts a hundred kilometers up. That's eleven Mount Everests."),
    (0.3, "But an elevator has to go way higher. Thirty-six thousand kilometers."),
    (0.3, "Up there, one orbit takes exactly one day, so the top of your elevator turns with the Earth, and never falls."),
    (0.5, "Now you need a cable."),
    (0.2, "Steel snaps under its own weight after just twenty-five kilometers."),
    (0.3, "So you build a factory that grows carbon nanotubes. A hundred times stronger than steel, at a sixth of the weight."),
    (0.25, "You weave them into a ribbon thinner than paper."),
    (0.45, "Next, where do you plug it in?"),
    (0.2, "It has to be the equator."),
    (0.25, "So you build a floating base in the middle of the ocean. No storms. No planes. No neighbors."),
    (0.45, "Then, the top needs weight, to keep the ribbon tight."),
    (0.2, "So you go catch an asteroid, and park it a hundred thousand kilometers up."),
    (0.4, "Your elevator burns no fuel. It climbs the ribbon on a beam of light."),
    (0.55, "Then, you hit the wall."),
    (0.25, "Space junk. A million pieces of it, flying ten times faster than a bullet."),
    (0.25, "So your whole base sails out of the way, and the ribbon dodges with it."),
    (0.45, "The rocket guys think you've lost your mind."),
    (0.45, "Ten years later, the doors open."),
    (0.35, "The ride to orbit takes a week. No fire. No explosion. Just a really good view."),
    (0.45, "And the rocket guys? They're waiting in line."),
    (0.45, "You still hate rockets."),
    (0.3, "But now, you own the only door to space."),
    (0.5, "Going up?"),
]
TAIL = 2.2  # after the last word: the wink and the end

# How numbers read on screen (spoken words -> caption), as in the reel ("122 days.")
SHOW = [
    ("a hundred thousand", "100,000"),
    ("thirty-six thousand", "36,000"),
    ("twenty-five", "25"),
    ("a hundred", "100"),
    ("eleven", "11"),
    ("a million", "1 million"),
    ("ten", "10"),
]
# words that read better at the start of the next caption than at the end of this one
LEAD_WORDS = {"a", "an", "the", "to", "of", "and", "so", "your", "you", "on", "in", "into", "with", "than", "at", "that", "has", "no", "where", "do", "after", "just", "one", "way"}


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def numtext(w):
    """Whisper writes numbers as digits; give them back as words so they can match the script."""
    n = w.replace(",", "")
    if not re.fullmatch(r"\d+", n):
        return [norm(w)]
    v = int(n)
    words = {0: "zero", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine",
             10: "ten", 11: "eleven", 12: "twelve", 20: "twenty", 25: "twentyfive", 36: "thirtysix", 100: "hundred"}
    if v == 100000:
        return ["hundred", "thousand"]
    if v == 36000:
        return ["thirtysix", "thousand"]
    if v == 1000000:
        return ["million"]
    return [words.get(v, n)]


def align(script_words, heard):
    """Needleman-Wunsch between the script's words and Whisper's (each with times); script words that
    no heard word matches get times shared out by length between their matched neighbours."""
    a = [norm(w) for w in script_words]
    b = []
    for h in heard:
        for piece in numtext(h["w"].strip()):
            b.append({"n": piece, "s": h["s"], "e": h["e"]})
    n, m = len(a), len(b)
    score = np.zeros((n + 1, m + 1))
    back = np.zeros((n + 1, m + 1), dtype=int)
    score[:, 0] = -np.arange(n + 1)
    score[0, :] = -np.arange(m + 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            same = a[i - 1] == b[j - 1]["n"] or (len(a[i - 1]) > 3 and (a[i - 1] in b[j - 1]["n"] or b[j - 1]["n"] in a[i - 1]))
            opts = [score[i - 1, j - 1] + (2 if same else -1), score[i - 1, j] - 1, score[i, j - 1] - 1]
            k = int(np.argmax(opts))
            score[i, j] = opts[k]
            back[i, j] = k
    times = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        k = back[i, j]
        if k == 0:
            if a[i - 1] == b[j - 1]["n"] or a[i - 1] in b[j - 1]["n"] or b[j - 1]["n"] in a[i - 1]:
                times[i - 1] = [b[j - 1]["s"], b[j - 1]["e"]]
            i, j = i - 1, j - 1
        elif k == 1:
            i -= 1
        else:
            j -= 1
    # fill the gaps
    t0 = b[0]["s"] if b else 0.0
    t1 = b[-1]["e"] if b else 1.0
    i = 0
    while i < n:
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < n and times[j] is None:
            j += 1
        lo = times[i - 1][1] if i > 0 else t0
        hi = times[j][0] if j < n else t1
        tot = sum(len(a[k]) + 1 for k in range(i, j))
        acc = lo
        for k in range(i, j):
            d = (hi - lo) * (len(a[k]) + 1) / max(tot, 1)
            times[k] = [acc, acc + d]
            acc += d
        i = j
    # merged pieces (two script words heard as one number) share that word's span: split it
    for k in range(1, n):
        if times[k][0] < times[k - 1][1] - 1e-6 and times[k] == times[k - 1]:
            s, e = times[k]
            mid = s + (e - s) * (len(a[k - 1]) + 1) / (len(a[k - 1]) + len(a[k]) + 2)
            times[k - 1] = [s, mid]
            times[k] = [mid, e]
    return times


def trim(x, sr, thresh=0.008):
    idx = np.where(np.abs(x) > thresh)[0]
    if not len(idx):
        return x
    return x[max(0, idx[0] - int(0.015 * sr)): idx[-1] + int(0.06 * sr)]


def resample(x, sr, to):
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
        sf.write(a, x, sr, subtype="FLOAT")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a, "-af", f"aresample={to}:resampler=soxr", "-c:a", "pcm_f32le", b], check=True)
        y, _ = sf.read(b, dtype="float32")
    return y


def show_tokens(words):
    """Spoken words (with times) -> caption tokens, numbers as digits."""
    out = []
    i = 0
    while i < len(words):
        hit = None
        for phrase, shown in SHOW:
            p = phrase.split(" ")
            seg = words[i:i + len(p)]
            if len(seg) == len(p) and all(norm(s["w"]) == norm(q) for s, q in zip(seg, p)):
                hit = (len(p), shown)
                break
        if hit:
            k, shown = hit
            last = words[i + k - 1]["w"]
            punct = re.sub(r"^.*?([.,?!]*)$", r"\1", last)
            out.append({"w": shown + punct, "s": words[i]["s"], "e": words[i + k - 1]["e"]})
            i += k
        else:
            out.append(dict(words[i]))
            i += 1
    return out


# pairs a caption shouldn't split
BIND = {("rocket", "guys"), ("mount", "everests"), ("master", "plan"), ("space", "junk")}


def binds(a, b):
    """True if caption token a belongs with the token after it (a number with its unit, a compound)."""
    if re.search(r"[.,?!]$", a["w"]):
        return False
    if re.match(r"^[0-9]", a["w"]):
        return True
    return (norm(a["w"]), norm(b["w"])) in BIND


def chunk(tokens, max_words=3, max_chars=16):
    chunks, cur = [], []
    for k, t in enumerate(tokens):
        cand = cur + [t]
        text = " ".join(x["w"] for x in cand)
        if cur and (len(cand) > max_words or len(text) > max_chars):
            # don't leave a little lead word, a number or half a compound hanging at the end
            last = cur[-1]
            if len(cur) > 1 and not re.search(r"[.,?!]$", last["w"]) and (norm(last["w"]) in LEAD_WORDS or binds(last, t)):
                chunks.append(cur[:-1])
                cur = [last, t]
            else:
                chunks.append(cur)
                cur = [t]
        else:
            cur = cand
        if re.search(r"[.,?!]$", t["w"]):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return [{"text": " ".join(x["w"] for x in c), "s": c[0]["s"], "e": c[-1]["e"]} for c in chunks if c]


def captions(sentences, total):
    """Caption chunks of the shown words; each stays up until the next one (or briefly after a sentence)."""
    caps = []
    for si, s in enumerate(sentences):
        for c in chunk(show_tokens(s["words"])):
            c["sent"] = si
            caps.append(c)
    for ci, c in enumerate(caps):
        nxt = caps[ci + 1]["s"] if ci + 1 < len(caps) else total - 0.4
        end_of_sentence = ci + 1 == len(caps) or caps[ci + 1]["sent"] != c["sent"]
        c["show"] = round(max(0.0, c["s"] - 0.04), 3)
        c["hide"] = round(min(nxt - 0.02, c["e"] + 0.35) if end_of_sentence else nxt - 0.02, 3)
        if ci + 1 == len(caps):
            c["hide"] = round(c["e"] + 0.6, 3)
    return caps


def main():
    if "--captions-only" in sys.argv:
        p = os.path.join(ROOT, "src", "lift", "vo.json")
        d = json.load(open(p))
        d["captions"] = captions(d["sentences"], d["duration"])
        with open(p, "w") as f:
            json.dump(d, f, indent=1)
        print(len(d["captions"]), "captions")
        return
    from kokoro_onnx import Kokoro
    from faster_whisper import WhisperModel

    k = Kokoro(os.path.join(MODELS, "kokoro-v1.0.onnx"), os.path.join(MODELS, "voices-v1.0.bin"))
    asr = WhisperModel(os.environ.get("ASR_MODEL", "small.en"), device="cpu", compute_type="int8")
    track = np.zeros(int(SR_OUT * 400), dtype=np.float32)
    t = LEAD_IN
    sentences = []
    for i, (gap, text) in enumerate(LINES):
        x, sr = k.create(text, voice=VOICE, speed=SPEED, lang="en-us")
        x = trim(np.asarray(x, dtype=np.float32), sr)
        x = x / (np.abs(x).max() + 1e-9) * 0.89
        y = resample(x, sr, SR_OUT)
        t += gap if i else 0.0
        a = int(round(t * SR_OUT))
        track[a:a + len(y)] += y
        # time the words
        with tempfile.TemporaryDirectory() as d:
            w16 = os.path.join(d, "s.wav")
            sf.write(w16, resample(x, sr, 16000), 16000)
            segs, _ = asr.transcribe(w16, word_timestamps=True, beam_size=5, language="en", initial_prompt=text)
            heard = [{"w": w.word, "s": w.start, "e": w.end} for s in segs for w in s.words]
        script_words = text.split(" ")
        times = align(script_words, heard)
        dur = len(y) / SR_OUT
        words = [{"w": w, "s": round(t + max(0.0, min(dur, s0)), 3), "e": round(t + max(0.0, min(dur, e0)), 3)} for w, (s0, e0) in zip(script_words, times)]
        sentences.append({"i": i, "text": text, "s": round(t, 3), "e": round(t + dur, 3), "words": words})
        heard_txt = " ".join(h["w"].strip() for h in heard)
        print(f"{t:6.2f}-{t + dur:6.2f}  {text}\n               heard: {heard_txt}")
        t += dur
    total = t + TAIL
    track = track[: int(total * SR_OUT)]
    caps = captions(sentences, total)
    os.makedirs(os.path.join(ROOT, "out", "lift"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "public", "lift"), exist_ok=True)
    wav = os.path.join(ROOT, "out", "lift", "vo.wav")
    sf.write(wav, track, SR_OUT, subtype="PCM_24")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ac", "1", "-b:a", "96k", os.path.join(ROOT, "public", "lift", "vo.mp3")], check=True)
    with open(os.path.join(ROOT, "src", "lift", "vo.json"), "w") as f:
        json.dump({"voice": VOICE, "speed": SPEED, "duration": round(total, 3), "sentences": sentences, "captions": caps}, f, indent=1)
    print(f"total {total:.2f}s, {sum(len(s['words']) for s in sentences)} words, {len(caps)} captions")


if __name__ == "__main__":
    sys.exit(main())
