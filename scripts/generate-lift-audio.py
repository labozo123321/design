#!/usr/bin/env python3
"""
The soundtrack of Lift ("POV: rockets terrify you, so you build an elevator to space"): the narration
(out/lift/vo.wav, from generate-lift-voice.py), an original score, and every sound effect, all synthesised
with numpy/scipy (no samples). Timed from src/lift/vo.json (the words) and the shot list (the cuts).

THE SCORE   100 BPM. A dreamy night pad and celesta for the wish; a low drone under the launch; a sneaky
            plucked "master plan" groove in E minor (Em-C-Am-B7) with a soft kick and bass; wonder bells and a
            rising synth for the height and the orbit; the groove with shakers through the cable and the
            factory, a hit and a beat of silence on the snap; sunny G major for the ocean, a stab on each
            "No"; risers into the weight and the beam; the music drops out for the alarm and the junk (a low
            pulse and ticking); the groove again for the dodge, bouncy for the laughing rocket guys; a warm
            wide pad and felt piano for the ride; the last swell into G, and a lift's ding on "Going up?".
SOUNDS      night city, the far launch, ignition and lift-off, hologram hum, chalk, whooshes on the big
            moves, the climb, pops as the mountains stack, space, dots ticking out, metal creak, sparks and the
            snap, the factory, the reactor, the balance's clank, the spool, the sea and a gull, a plane far
            off, the net, the ribbon going taut, the beam powering up, the alarm, junk and its whizz,
            the wheel, the base's engines, the time-lapse, the lift doors and a crowd, confetti, the cabin's
            calm, a sip, a rocket roaring past, the ding.
THE MIX     the voice on top; the score ducked about 9 dB under it, the sounds about 3 dB; -14 LUFS
            integrated, true peak under -1 dBTP.

    python3 scripts/generate-lift-audio.py      # out/lift/mix.wav (48 kHz 24-bit) + public/lift/mix.mp3
"""

import importlib.util
import json
import os
import re
import sys

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# the knock soundtrack's DSP toolkit (filters, rooms, loudness, the limiter, the writers)
_spec = importlib.util.spec_from_file_location("knockaudio", os.path.join(HERE, "generate-knock-audio.py"))
g = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(g)
fp = g.fp

SR = g.SR
VO = json.load(open(os.path.join(ROOT, "src", "lift", "vo.json")))
DUR = float(VO["duration"])
N = int(round(DUR * SR))
PAD = SR * 4
TARGET = -14.0

rng, ns, ta, midi, smooth = g.rng, g.ns, g.ta, g.midi, g.smooth
lp, hp, bp, peq, reson, fade, norm, pan2 = g.lp, g.hp, g.bp, g.peq, g.reson, g.fade, g.norm, g.pan2
pink, wander = g.pink, g.wander
g.ROOMS["lift_hall"] = dict(rt=1.9, pre=0.012, er=0.25, n=18, span=0.07, hf=0.55, seed=21)
g.ROOMS["lift_room"] = dict(rt=0.5, pre=0.004, er=0.45, n=14, span=0.04, hf=0.6, seed=22)


def bus():
    return np.zeros((N + PAD, 2))


def place(b, x, t, gain=1.0, pan=0.0):
    x = np.asarray(x, float)
    if x.ndim == 1:
        x = pan2(x, pan)
    i = int(round(t * SR))
    s0 = max(0, -i)
    i = max(0, i)
    j = min(len(b), i + len(x) - s0)
    if j > i:
        b[i:j] += x[s0 : s0 + (j - i)] * gain


# ============================================================================================ timing
SENT = VO["sentences"]


def clean(w):
    return re.sub(r"[^a-z0-9'-]", "", w.lower())


def at(i, w=0):
    s = SENT[i]
    if isinstance(w, int):
        return s["words"][max(0, min(len(s["words"]) - 1, w))]["s"]
    for x in s["words"]:
        if clean(x["w"]) == clean(w):
            return x["s"]
    raise KeyError((i, w))


def shot_starts():
    """The cuts, read from src/lift/shots.tsx the same way the picture computes them."""
    src = open(os.path.join(ROOT, "src", "lift", "shots.tsx")).read()
    out = []
    for m in re.finditer(r'shot\("([^"]+)",\s*(.+?),\s*(?:\(|boardShot)', src):
        sid, expr = m.group(1), m.group(2)
        t0 = eval(expr, {"cut": lambda i, w=0, lead=0.1: at(i, w) - lead, "at": at, "SNAP": 38.6})
        out.append((t0, sid))
    return sorted(out)


SHOTS = shot_starts()
SHOT = {sid: t0 for t0, sid in SHOTS}

# ============================================================================================ instruments


def env_adsr(n, a, d, s, r_start, r):
    """An ADSR envelope over n samples; the release starts at r_start (s)."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    e = e * np.where(t < r_start, 1.0, np.exp(-(t - r_start) / max(r, 1e-4)))
    return e


def pad_chord(notes, sec, bright=1400, seed=0, detune=0.09, att=0.6, rel=1.2):
    """Warm analog pad: three detuned band-limited saws per note through a soft low-pass."""
    r = rng("pad", tuple(notes), seed)
    n = ns(sec + rel * 3)
    out = np.zeros((n, 2))
    for k, m in enumerate(notes):
        for v, c in ((-detune, 0), (0.0, 1), (detune, 0), (detune * 0.5, 1)):
            f = midi(m) * 2 ** (v / 12) * (1 + 0.002 * np.sin(2 * np.pi * (0.13 + 0.05 * k) * np.arange(n) / SR + r.uniform(0, 6)))
            out[:, c] += g.polyblep_saw(f, r)
    for c in range(2):
        out[:, c] = lp(out[:, c], bright, 2)
    e = env_adsr(n, att, 1.5, 0.85, sec, rel)
    out *= e[:, None]
    return out / (len(notes) * 4)


def pluck(m, sec=0.5, bright=1.0, seed=0):
    """A soft plucked/mallet note: a few harmonics with fast, rising-with-pitch decays and a tiny click."""
    r = rng("pluck", m, seed)
    f = midi(m)
    t = ta(sec)
    tau = 0.32 * (220 / f) ** 0.3
    x = np.zeros_like(t)
    for h, a in ((1, 1.0), (2, 0.42 * bright), (3, 0.2 * bright), (4, 0.1 * bright), (6, 0.04 * bright)):
        x += a * np.sin(2 * np.pi * f * h * t + r.uniform(0, 1)) * np.exp(-t / (tau / h**0.7))
    x += 0.15 * bright * bp(r.standard_normal(len(t)), 2000, 6000, 2) * np.exp(-t / 0.004)
    x *= smooth(0, 0.002, t)
    return fade(x * 0.5, 0.0, 0.05)


def celesta(m, sec=1.6, seed=0):
    f = midi(m)
    t = ta(sec)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.7) + 0.3 * np.sin(2 * np.pi * 4.0 * f * t) * np.exp(-t / 0.12)
    x += 0.12 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.2)
    x *= smooth(0, 0.002, t)
    return fade(x * 0.45, 0.0, 0.2)


def bell(m, sec=2.5, seed=0):
    """A glassy space bell (inharmonic partials)."""
    f = midi(m)
    t = ta(sec)
    x = np.zeros_like(t)
    for ratio, a, tau in ((1, 1.0, 1.4), (2.0, 0.5, 0.8), (2.76, 0.35, 0.5), (5.4, 0.18, 0.25), (8.9, 0.08, 0.12)):
        x += a * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / tau)
    x *= smooth(0, 0.003, t)
    return fade(x * 0.35, 0.0, 0.3)


def bass(m, sec, seed=0):
    f = midi(m)
    t = ta(sec + 0.12)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    x = np.tanh(1.6 * x) / np.tanh(1.6)
    x *= env_adsr(len(t), 0.008, 0.3, 0.7, sec, 0.06)
    return lp(x, 900, 2) * 0.5


def kick(seed=0, punch=1.0):
    t = ta(0.4)
    f = 48 + 90 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / 0.16) * punch
    x += 0.2 * bp(rng("kick", seed).standard_normal(len(t)), 1500, 5000, 2) * np.exp(-t / 0.003)
    return fade(x * 0.9, 0.0, 0.05)


def snap_clap(seed=0):
    r = rng("clap", seed)
    t = ta(0.25)
    x = bp(r.standard_normal(len(t)), 900, 3500, 2) * (np.exp(-t / 0.05) + 0.5 * np.exp(-np.maximum(0, t - 0.012) / 0.03) * (t > 0.012))
    return fade(x * 0.5, 0.0, 0.03)


def hat(seed=0, open_=False):
    r = rng("hat", seed)
    t = ta(0.25 if open_ else 0.06)
    x = hp(r.standard_normal(len(t)), 7000, 2) * np.exp(-t / (0.08 if open_ else 0.012))
    return fade(x * 0.25, 0.0, 0.01)


def shaker(seed=0):
    r = rng("shaker", seed)
    t = ta(0.12)
    x = bp(r.standard_normal(len(t)), 4000, 9000, 2) * np.sin(np.pi * np.clip(t / 0.1, 0, 1)) ** 2
    return fade(x * 0.18, 0.0, 0.01)


def riser(sec, f0=300, f1=4000, seed=0):
    """Noise swept up a band, and a saw sliding up an octave under it."""
    r = rng("riser", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    k = t / sec
    fc = f0 * (f1 / f0) ** k
    w = r.standard_normal(n)
    # sweep with a few band-passes cross-faded
    out = np.zeros(n)
    edges = np.linspace(0, 1, 9)
    for i in range(8):
        f = f0 * (f1 / f0) ** ((edges[i] + edges[i + 1]) / 2)
        seg = bp(w, f * 0.7, min(f * 1.4, 20000), 2)
        win = np.clip(1 - np.abs((k - (edges[i] + edges[i + 1]) / 2) / (edges[1] - edges[0])), 0, 1)
        out += seg * win
    saw = g.polyblep_saw(220 * 2 ** k, r)
    out = out / (np.std(out) + 1e-9) * 0.5 + 0.25 * lp(saw, 2500, 2)
    out *= k**2
    return fade(out * 0.25, 0.01, 0.02)


def whoosh(sec=0.6, f0=500, f1=2500, seed=0, peak=0.45):
    """Air past the lens: band-passed noise swelling and sliding."""
    r = rng("whoosh", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    k = t / sec
    w = r.standard_normal(n)
    lo = bp(w, f0 * 0.6, f0 * 1.6, 2)
    hi = bp(w, f1 * 0.6, min(f1 * 1.6, 20000), 2)
    mixk = np.clip((k - 0.15) / 0.7, 0, 1)
    x = lo * (1 - mixk) + hi * mixk
    e = np.exp(-((k - peak) ** 2) / 0.05)
    x = x / (np.std(x) + 1e-9) * e
    return fade(x * 0.2, 0.005, 0.03)


def boom(seed=0, f=55, tau=0.6):
    r = rng("boom", seed)
    t = ta(tau * 5)
    ff = f + 60 * np.exp(-t / 0.05)
    x = np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / tau)
    x += 0.5 * lp(r.standard_normal(len(t)), 300, 2) * np.exp(-t / (tau * 0.4))
    return fade(norm(x) * 0.8, 0.0, 0.1)


def rumble(sec, seed=0, lpf=180):
    r = rng("rumble", seed)
    n = ns(sec)
    x = lp(pink(n, r, 0.9), lpf, 2)
    x = x / (np.std(x) + 1e-9)
    crack = bp(g.scatter(n, 40, r, 1.0), 400, 3000, 2)
    return fade(x * 0.25 + 0.08 * crack / (np.std(crack) + 1e-9), 0.2, 0.4)


def pop(m=72, seed=0):
    t = ta(0.16)
    f = midi(m) * (1 + 0.6 * np.exp(-t / 0.01))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.04)
    return fade(x * 0.5, 0.0, 0.02)


def blip(m=84, seed=0):
    t = ta(0.09)
    x = np.sin(2 * np.pi * midi(m) * t) * np.exp(-t / 0.025)
    return fade(x * 0.35, 0.0, 0.02)


def ding(seed=0):
    """The lift's bell: two soft struck tones, a fifth apart."""
    out = np.zeros(ns(2.6))
    for k, (m, dt) in enumerate(((88, 0.0), (81, 0.0))):
        t = ta(2.6)
        x = np.zeros_like(t)
        for ratio, a, tau in ((1, 1.0, 1.1), (2.0, 0.3, 0.6), (3.0, 0.12, 0.3), (4.2, 0.05, 0.15)):
            x += a * np.sin(2 * np.pi * midi(m) * ratio * t) * np.exp(-t / tau)
        out += x * (0.6 if k else 1.0)
    out *= smooth(0, 0.002, ta(2.6))
    return fade(out * 0.3, 0.0, 0.2)


def sparkle(seed=0, sec=0.5):
    r = rng("sparkle", seed)
    out = np.zeros(ns(sec + 0.4))
    for i in range(7):
        m = 96 + int(r.integers(0, 10))
        y = celesta(m, 0.4) * 0.4
        t0 = i * sec / 7
        place_m(out, y, t0)
    return out


def place_m(x, y, t, gain=1.0):
    i = int(round(t * SR))
    j = min(len(x), i + len(y))
    if j > i:
        x[i:j] += y[: j - i] * gain


def noise_bed(sec, lo, hi, seed=0, slope=0.5, wob=0.3, rate=0.5):
    r = rng("bed", lo, hi, seed)
    n = ns(sec)
    out = np.zeros((n, 2))
    for c in range(2):
        x = bp(pink(n, r, slope), lo, hi, 2)
        x = x / (np.std(x) + 1e-9)
        out[:, c] = x * np.clip(1 + wob * wander(n, rate, r), 0.2, 2)
    return fade(out, 0.3, 0.3)


def waves(sec, seed=0):
    r = rng("waves", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for c in range(2):
        x = bp(pink(n, r, 0.5), 200, 3000, 2)
        x = x / (np.std(x) + 1e-9)
        swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / (4.5 + c * 0.7) + c) ** 2
        out[:, c] = x * swell
    return fade(out * 0.6, 0.4, 0.4)


def gull(seed=0):
    r = rng("gull", seed)
    t = ta(0.55)
    f = 1500 + 900 * np.exp(-t / 0.15) - 300 * t
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    x *= np.exp(-t / 0.2) * smooth(0, 0.02, t)
    x = bp(x + 0.05 * r.standard_normal(len(t)), 900, 5000, 2)
    return fade(x * 0.25, 0.0, 0.05)


def engine(sec, f=70, seed=0):
    r = rng("engine", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * k * t + r.uniform(0, 6)) / k for k in range(1, 7))
    x = lp(x + 0.4 * pink(n, r, 0.8), 600, 2)
    return fade(x / (np.std(x) + 1e-9) * 0.2, 0.3, 0.3)


def creak(sec=0.6, f0=140, f1=260, seed=0):
    return g.creak(sec, f0, f1, seed, 0.7)


def sparks(sec, seed=0, rate=60):
    r = rng("sparks", seed)
    n = ns(sec)
    imp = g.scatter(n, rate, r, 0.9)
    x = hp(bp(imp, 2500, 9000, 2), 2000, 2)
    return fade(x / (np.std(x) + 1e-9) * 0.12, 0.02, 0.05)


def twang(f=110, sec=1.4, seed=0):
    """Metal under tension: a falling, beating string tone."""
    t = ta(sec)
    ff = f * (1.35 - 0.35 * (1 - np.exp(-t / 0.05)))
    x = np.sin(2 * np.pi * np.cumsum(ff) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(ff * 2.02) / SR) + 0.25 * np.sin(2 * np.pi * np.cumsum(ff * 3.05) / SR)
    x *= np.exp(-t / 0.45)
    return fade(np.tanh(1.5 * x) * 0.4, 0.0, 0.1)


def alarm(sec, seed=0):
    """A wah-wah alarm: a square-ish tone gliding between two pitches, through a small speaker."""
    t = ta(sec)
    f = 620 + 260 * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 1.6 * t)))
    x = np.tanh(3 * np.sin(2 * np.pi * np.cumsum(f) / SR))
    x = bp(x, 400, 3500, 2) * smooth(0, 0.03, t)
    return fade(x * 0.18, 0.01, 0.1)


def tick(seed=0):
    r = rng("tick", seed)
    t = ta(0.03)
    x = bp(r.standard_normal(len(t)), 2500, 6000, 2) * np.exp(-t / 0.003)
    return fade(x * 0.3, 0.0, 0.005)


def whizz(seed=0, sec=0.5, f=900):
    """Something very fast going by: a doppler-falling whistle in rushing air."""
    r = rng("whizz", seed)
    t = ta(sec)
    k = t / sec
    ff = f * (1.5 - 1.0 * smooth(0.35, 0.65, k))
    x = np.sin(2 * np.pi * np.cumsum(ff) / SR) * 0.6 + bp(r.standard_normal(len(t)), 1500, 7000, 2) * 0.5
    e = np.exp(-((k - 0.5) ** 2) / 0.02)
    return fade(x * e * 0.35, 0.0, 0.02)


def crowd(sec, seed=0, cheer=1.0):
    """Many people cheering: formant-ish band noise with lots of slow wobbles, and a few claps."""
    r = rng("crowd", seed)
    n = ns(sec)
    out = np.zeros((n, 2))
    for c in range(2):
        base = np.zeros(n)
        for f0 in (450, 800, 1250, 2400):
            base += bp(r.standard_normal(n), f0 * 0.8, f0 * 1.25, 2) * np.clip(0.6 + 0.6 * wander(n, 3.0, r), 0, 2)
        claps = bp(g.scatter(n, 45 * cheer, r, 0.5), 1000, 4000, 2)
        out[:, c] = base / (np.std(base) + 1e-9) * 0.5 + claps / (np.std(claps) + 1e-9) * 0.25
    return fade(out * 0.3 * cheer, 0.15, 0.4)


def door_slide(sec=0.6, seed=0):
    r = rng("door", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    x = bp(pink(n, r, 0.6), 200, 1600, 2) * np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 1.5
    return fade(x / (np.std(x) + 1e-9) * 0.12, 0.02, 0.05)


# ============================================================================================ the score

BEAT = 0.6  # 100 BPM


def score():
    mus = bus()
    # ---- A: the wish (0 - 5.8): a night pad and a celesta, a dip under the far launch
    for t0, ch, sec in ((0.0, [55, 59, 62, 66], 2.9), (2.7, [52, 55, 59, 62, 66], 3.4)):
        place(mus, pad_chord(ch, sec, bright=1100, seed=1, att=0.8), t0, 0.55)
    for i, m in enumerate([79, 83, 86, 90, 88, 83, 86, 79]):
        place(mus, celesta(m), 0.35 + i * 0.3, 0.32, pan=0.3 * np.sin(i))
    # ---- B: the launch (5.8 - 10.7): a low, tense drone
    place(mus, pad_chord([40, 47, 52], 4.6, bright=600, seed=2, att=0.4, rel=0.6), 5.75, 0.6)
    # ---- C: the master plan (10.7 - 17.4): the sneaky plucked groove, kick and bass
    groove(mus, 10.74, 17.42, prog=[(52, [64, 67, 71]), (48, [64, 67, 72]), (45, [64, 69, 72]), (47, [63, 66, 71])], drums=1)
    place(mus, sparkle(3), at(4, "master") - 0.05, 0.5)
    # ---- D: height and orbit (17.4 - 33.8): wonder bells, a pad, the climb's riser
    place(mus, riser(2.3, 300, 5000, 4), 17.5, 0.6)
    for t0, ch in ((17.48, [55, 59, 62, 66]), (21.8, [52, 55, 59, 62]), (26.56, [48, 55, 59, 64]), (29.34, [50, 54, 57, 62]), (32.16, [55, 59, 62, 67])):
        place(mus, pad_chord(ch, 3.6, bright=1500, seed=int(t0), att=0.5), t0, 0.5)
    for i in range(22):
        m = [79, 83, 86, 91, 88, 86, 83, 79][i % 8] + (0 if i < 11 else 2 * (i % 2))
        place(mus, bell(m), 21.9 + i * 0.5, 0.2, pan=0.5 * np.sin(i * 1.3))
    for k in range(int((33.8 - 21.8) / (BEAT * 2))):
        place(mus, bass(43 if k % 4 < 2 else 40, BEAT * 1.8), 21.8 + k * BEAT * 2, 0.35)
    # ---- E: cable and factory (33.8 - 49.7)
    groove(mus, 33.77, 38.58, prog=[(52, [64, 67, 71]), (48, [64, 67, 72]), (45, [64, 69, 72]), (47, [63, 66, 71])], drums=2)
    # the snap: a hit and a beat of silence, then the factory groove
    place(mus, boom(5, 50, 0.5), 38.6, 0.7)
    groove(mus, 39.67, 49.7, prog=[(52, [64, 67, 71]), (48, [64, 67, 72]), (45, [64, 69, 72]), (47, [63, 66, 71])], drums=2)
    # ---- F: base and ocean (49.7 - 59.3): sunny G major
    groove(mus, 49.71, 59.31, prog=[(43, [62, 67, 71]), (50, [62, 66, 69]), (52, [64, 67, 71]), (48, [64, 67, 72])], drums=1, bright=1.25)
    for w in (12, 14, 16):
        tt = at(16, w)
        place(mus, pluck(76, 0.35, 1.3), tt, 0.5, pan=0.0)
        place(mus, pluck(83, 0.35, 1.3), tt, 0.35)
        place(mus, kick(9, 0.8), tt, 0.5)
    # ---- G: weight and power (59.3 - 72.1): building, risers into the catch and the beam
    groove(mus, 59.31, 72.1, prog=[(52, [64, 67, 71]), (48, [64, 67, 72]), (43, [62, 67, 71]), (50, [62, 66, 69])], drums=3)
    place(mus, riser(1.8, 400, 6000, 7), SHOT["space-catch"] - 1.75, 0.55)
    place(mus, riser(2.3, 300, 7000, 8), 69.8, 0.6)
    # ---- H: the wall (72.1 - 78.9): the music stops; a low pulse and ticking under the junk
    place(mus, boom(11, 45, 0.9), 72.18, 0.9)
    for k in range(int((78.88 - 73.0) / BEAT)):
        tt = 73.0 + k * BEAT
        place(mus, kick(20 + k, 0.55), tt, 0.5)
        place(mus, kick(40 + k, 0.35), tt + 0.18, 0.4)
    place(mus, pad_chord([40, 46, 52], 6.0, bright=500, seed=12, att=1.0, rel=0.5), 73.0, 0.45)
    # ---- I: the dodge and the rocket guys (78.9 - 85.9)
    groove(mus, 78.88, 83.16, prog=[(52, [64, 67, 71]), (48, [64, 67, 72]), (45, [64, 69, 72]), (47, [63, 66, 71])], drums=3)
    bouncy(mus, 83.16, 85.88)
    # ---- J: ten years later and the ride (85.9 - 93.8): warm, wide, felt piano
    place(mus, riser(1.0, 500, 6000, 13), 84.95, 0.5)
    place(mus, boom(14, 60, 0.4), 85.9, 0.35)
    for t0, ch, sec in ((85.88, [43, 55, 59, 62, 66], 2.3), (88.09, [48, 55, 60, 64, 67], 2.2), (90.17, [52, 55, 59, 62, 67], 2.1), (92.19, [50, 54, 57, 62, 69], 2.2)):
        place(mus, pad_chord(ch, sec, bright=1300, seed=int(t0 * 10), att=0.4), t0, 0.55)
    melody = [(88.1, 74), (88.7, 76), (89.3, 79), (90.2, 78), (90.8, 74), (91.4, 76), (92.2, 81), (92.8, 79), (93.4, 78)]
    for tt, m in melody:
        y = fp.piano(m, 0.5, 0.45, 2.0, seed=int(tt * 10))
        place(mus, y, tt, 0.55, pan=0.15)
    # ---- K: the line and the rocket (93.8 - 98.4)
    bouncy(mus, 93.82, 96.73)
    # ---- L: the only door (98.4 - end): the last swell into G, then the ding
    place(mus, riser(2.6, 300, 5000, 16), 98.6, 0.45)
    for t0, ch, sec in ((98.44, [48, 55, 60, 64, 67], 1.5), (99.9, [50, 57, 62, 66, 69], 1.4)):
        place(mus, pad_chord(ch, sec, bright=1700, seed=int(t0 * 10), att=0.3), t0, 0.65)
    for k in range(5):
        place(mus, kick(60 + k, 0.8), 98.44 + k * BEAT, 0.6)
    place(mus, pad_chord([43, 55, 59, 62, 66, 71], 3.0, bright=1600, seed=30, att=0.2, rel=1.6), 101.3, 0.75)
    for i, m in enumerate([79, 83, 86, 91]):
        place(mus, celesta(m, 2.0), 101.35 + i * 0.12, 0.35)
    return g.verb(mus, "lift_hall", 0.28) + mus * 0.85


def groove(mus, t0, t1, prog, drums=1, bright=1.0):
    """The plucked 'master plan' groove: an arpeggio in 8ths over a 4-chord loop (a bar each), the bass on
    the roots, a soft kick on 1 and 3, hats/shakers by intensity."""
    bar = BEAT * 4
    k = 0
    t = t0
    while t < t1 - 0.05:
        root, ch = prog[k % len(prog)]
        pattern = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[1]]
        for i, m in enumerate(pattern):
            tt = t + i * BEAT / 2
            if tt >= t1 - 0.02:
                break
            place(mus, pluck(m, 0.4, bright, seed=k * 8 + i), tt, 0.32 if i % 2 == 0 else 0.24, pan=0.25 * np.sin(i * 1.7))
        for b in range(4):
            tt = t + b * BEAT
            if tt >= t1 - 0.02:
                break
            place(mus, bass(root - 12 + (12 if b == 3 else 0), BEAT * 0.9, seed=k), tt, 0.42)
            if b in (0, 2):
                place(mus, kick(k * 4 + b, 0.9), tt, 0.55)
            if drums >= 2:
                for s in range(2):
                    place(mus, shaker(k * 8 + b * 2 + s), tt + s * BEAT / 2, 0.8, pan=0.3)
            if drums >= 3 and b in (1, 3):
                place(mus, snap_clap(k * 4 + b), tt, 0.45)
            if drums >= 1:
                place(mus, hat(k * 4 + b), tt + BEAT / 2, 0.6, pan=-0.3)
        k += 1
        t += bar


def bouncy(mus, t0, t1):
    """The rocket guys: a bouncy pizzicato bass line, staccato."""
    line = [40, 47, 52, 47, 43, 50, 55, 50]
    k = 0
    t = t0
    while t < t1 - 0.05:
        m = line[k % len(line)]
        place(mus, pluck(m + 12, 0.25, 0.7, seed=k), t, 0.45)
        place(mus, bass(m, 0.18, seed=k), t, 0.5)
        if k % 2 == 1:
            place(mus, snap_clap(k), t, 0.3)
        k += 1
        t += BEAT / 2


# ============================================================================================ the sounds


def sounds():
    sfx = bus()
    amb = bus()
    S_ = SHOT
    # roof: night city, wind; the far launch
    place(amb, noise_bed(S_["pad-ignite"] + 0.3, 120, 1200, 1, 0.6, 0.4) * 0.05, 0.0)
    place(sfx, rumble(5.5, 1, 140) * 0.7, 3.95)
    place(sfx, boom(1, 40, 1.2) * 0.35, 4.25)
    # the launch: ignition crackle and roar, lift-off
    place(sfx, rumble(5.0, 2, 260) * 1.2, 5.95)
    place(sfx, boom(2, 45, 0.9), 6.02, 0.9)
    place(sfx, noise_bed(4.4, 300, 4000, 3, 0.4, 0.6) * 0.18, 6.0)
    place(sfx, whoosh(0.9, 300, 1800, 4), S_["pad-liftoff"] - 0.3, 0.8)
    place(sfx, whoosh(0.8, 400, 2500, 5), S_["pad-crew"], 0.7)
    # the war room: a hum and the hologram's shimmer, each visit
    rooms = [(t0, sid) for t0, sid in SHOTS if sid.startswith("plan")]
    for i, (t0, sid) in enumerate(rooms):
        nxt = next((tt for tt, _ in SHOTS if tt > t0), DUR)
        place(amb, noise_bed(nxt - t0 + 0.2, 80, 400, 10 + i, 0.8, 0.1) * 0.05, t0)
        place(sfx, whoosh(0.5, 600, 3000, 20 + i), t0 - 0.25, 0.5)
    # chalk on the board as the sketch draws
    r = rng("chalk")
    n = ns(1.0)
    ch = bp(g.scatter(n, 900, r, 0.6), 2500, 7000, 2)
    place(sfx, fade(ch / (np.std(ch) + 1e-9) * 0.05, 0.02, 0.05), S_["plan-board"] + 0.05, 0.8)
    for sid in ("plan-height", "plan-cable", "plan-plug", "plan-weight"):
        place(sfx, blip(88, 1), S_[sid] + 0.25, 0.5)
    # the climb and the stack
    place(sfx, whoosh(2.4, 300, 2000, 30, 0.6), S_["height-rise"], 1.0)
    place(amb, noise_bed(2.6, 300, 3000, 31, 0.5, 0.8) * 0.12, S_["height-rise"])
    for i in range(11):
        place(sfx, pop(60 + i * 2, i), S_["height-stack"] + 0.05 + i * 0.1, 0.6)
    # space: a deep air, whooshes on the big moves, dots, the orbit
    for sid in ("space-pullback", "space-geo", "space-day", "space-spoke", "space-nofall"):
        place(amb, noise_bed(3.2, 40, 300, hash(sid) % 100, 0.9, 0.2) * 0.06, S_[sid])
    place(sfx, whoosh(2.0, 150, 900, 40, 0.3), S_["space-pullback"], 0.9)
    for i in range(26):
        place(sfx, blip(84 + (i % 5), i), S_["space-geo"] + i * 0.7 / 26, 0.35)
    place(sfx, pop(79, 41), S_["space-geo"] + 0.3, 0.5)
    place(sfx, pop(83, 42), S_["space-day"] + 0.6, 0.5)
    place(sfx, whoosh(1.4, 200, 1200, 43), S_["space-spoke"], 0.5)
    # steel: the wind up there, creaks, the stretch, sparks, the snap and the fall
    place(amb, noise_bed(4.4, 150, 1500, 50, 0.6, 0.6) * 0.1, S_["steel-hang"])
    place(sfx, creak(0.9, 120, 180, 51), S_["steel-hang"] + 0.6, 0.5)
    place(sfx, creak(1.2, 150, 320, 52), S_["steel-neck"], 0.7)
    place(sfx, sparks(1.4, 53), S_["steel-neck"] + 0.2, 0.9)
    place(sfx, twang(140, 1.2, 54), 38.6, 0.9)
    place(sfx, sparks(0.5, 55, 300), 38.6, 1.2)
    place(sfx, whoosh(1.0, 800, 200, 56, 0.4), 38.75, 0.7)
    # the factory: the hall's hum, footsteps, the reactor, the balance, the spool, the paper
    place(amb, noise_bed(10.1, 60, 600, 60, 0.8, 0.2) * 0.07, S_["factory-out"])
    for k in range(6):
        place(sfx, g.thud(160, 0.02, 900, 60 + k, 0.2) * 0.15, S_["factory-out"] + 0.2 + k * 0.27)
    place(sfx, riser(1.6, 200, 2000, 61) * 0.5, S_["factory-reactor"] + 0.1)
    place(sfx, boom(62, 90, 0.2) * 0.4, S_["factory-balance"] + 0.18)
    place(sfx, g.metal([(420, 1.0, 0.4), (1130, 0.5, 0.2), (2480, 0.25, 0.1)], 63, 0.3) * 0.3, S_["factory-balance"] + 0.2)
    place(sfx, pop(84, 64), S_["factory-balance"] + 0.3, 0.5)
    place(sfx, pop(88, 65), at(12, "sixth") - 0.05, 0.5)
    place(sfx, engine(1.4, 38, 66) * 0.5, S_["factory-spool"])
    place(sfx, g.paper(0.5, "slide", 67) * 0.4, S_["factory-paper"] + 0.15)
    # the equator line
    place(sfx, riser(0.8, 800, 5000, 70) * 0.5, S_["plan-equator"] + 0.15)
    # the ocean: waves, wind, a gull, a far plane
    place(amb, waves(6.4, 80) * 0.6, S_["ocean-aerial"])
    place(sfx, whoosh(1.6, 300, 1500, 81, 0.35), S_["ocean-aerial"], 0.6)
    place(sfx, engine(1.0, 95, 82) * 0.35, S_["ocean-noplanes"])
    place(sfx, gull(83), S_["ocean-noneighbors"] + 0.2, 0.7, pan=-0.3)
    place(sfx, gull(84), S_["ocean-noneighbors"] + 0.75, 0.5, pan=0.3)
    # the slack, the catch, the twang
    place(sfx, whoosh(1.5, 200, 800, 90, 0.5), S_["space-slack"], 0.5)
    place(sfx, whoosh(0.4, 900, 3000, 91), S_["space-catch"] + 0.2, 0.6)
    place(sfx, g.thud(70, 0.08, 500, 92, 0.2) * 0.6, S_["space-catch"] + 1.1)
    place(sfx, twang(82, 1.5, 93), S_["space-park"] + 0.3, 0.9)
    place(sfx, boom(94, 42, 0.8) * 0.6, S_["space-park"] + 0.32)
    # the beam
    place(amb, waves(5.2, 95) * 0.5, S_["ocean-fuel"])
    place(sfx, riser(0.6, 400, 4000, 96) * 0.6, S_["ocean-laser"] - 0.1)
    place(sfx, noise_bed(2.4, 2000, 7000, 97, 0.3, 0.1) * 0.05, S_["ocean-laser"] + 0.2)
    place(sfx, engine(2.3, 220, 98) * 0.35, S_["ocean-laser"] + 0.45)
    # the alarm
    place(sfx, alarm(1.5, 100), S_["plan-alarm"] + 0.05, 0.9)
    # junk: clinks, a crowd of tumbling things, the whizzes
    for k in range(10):
        place(sfx, g.metal([(1800 + 300 * k, 1.0, 0.06), (4100 + 200 * k, 0.4, 0.03)], 110 + k, 0.4) * 0.12, S_["junk-close"] + 0.1 + k * 0.12, pan=np.sin(k))
    for i, tt in enumerate((0.15, 0.9, 1.55)):
        place(sfx, whizz(120 + i, 0.5, 900 + 150 * i), S_["junk-bullet"] + tt + 0.05, 0.9, pan=-0.6 + 0.6 * i)
    # the wheel, the engines, the sail, the dodge
    for k in range(14):
        place(sfx, tick(130 + k), S_["ocean-wheel"] + 0.05 + k * 0.1, 0.7)
    place(amb, waves(4.4, 131) * 0.6, S_["ocean-wheel"])
    place(sfx, engine(2.4, 55, 132) * 0.8, S_["ocean-wheel"] + 0.3)
    place(sfx, whizz(133, 0.7, 500), S_["space-dodge"] + 0.75, 0.9)
    # the rocket guys: their pad, the wind
    place(amb, noise_bed(2.7, 150, 1500, 140, 0.6, 0.4) * 0.05, S_["rivals-laugh"])
    # ten years: time-lapse, building
    place(sfx, whoosh(1.0, 300, 3000, 150, 0.5), S_["ocean-10years"] - 0.2, 0.8)
    for k in range(8):
        place(sfx, g.metal([(900 + 120 * k, 1.0, 0.08), (2300, 0.4, 0.04)], 151 + k, 0.4) * 0.15, S_["ocean-10years"] + 0.05 + k * 0.11)
    # the doors and the crowd
    place(sfx, door_slide(0.6, 160), S_["ocean-doors"] + 0.1, 0.9)
    place(sfx, crowd(2.3, 161, 1.0), S_["ocean-doors"] + 0.3, 0.8)
    place(sfx, sparkle(162, 0.6), S_["ocean-cheer"], 0.4)
    # the ride and the cabin: a smooth hum; a sip
    place(amb, noise_bed(2.2, 100, 900, 170, 0.7, 0.1) * 0.06, S_["ride-up"])
    place(sfx, whoosh(1.6, 200, 900, 171, 0.5), S_["ride-up"], 0.5)
    place(amb, noise_bed(5.9, 60, 500, 172, 0.9, 0.05) * 0.035, S_["cabin-nofire"])
    place(sfx, bp(rng("sip").standard_normal(ns(0.35)), 300, 1800, 2) * np.hanning(ns(0.35)) * 0.03, S_["cabin-sip"] + 0.25)
    # the line
    place(sfx, crowd(2.9, 180, 0.25) * 0.5, S_["lobby-line"])
    # the rocket past the window
    place(sfx, rumble(1.6, 190, 300) * 1.2, S_["cabin-rocket"] + 0.02)
    place(sfx, whizz(191, 0.7, 300), S_["cabin-rocket"] + 0.05, 1.0)
    # the top: the ding, the wink
    place(amb, noise_bed(6.0, 40, 250, 200, 0.9, 0.15) * 0.05, S_["top-reveal"])
    place(sfx, whoosh(2.0, 200, 1200, 201, 0.25), S_["top-reveal"], 0.6)
    place(sfx, ding(202), SHOT["top-wink"] + 0.32, 0.85)
    place(sfx, sparkle(203, 0.4), SHOT["top-wink"] + 0.45, 0.35)
    return sfx, amb


def hash(s):
    return sum(ord(c) * (i + 1) for i, c in enumerate(s))


# ============================================================================================ the mix


def vo_track():
    import soundfile as sf

    x, sr = sf.read(os.path.join(ROOT, "out", "lift", "vo.wav"), dtype="float64")
    if x.ndim == 2:
        x = x.mean(axis=1)
    assert sr == SR
    out = np.zeros(N + PAD)
    out[: min(len(x), len(out))] = x[: len(out)]
    # a touch of presence and warmth
    out = peq(out, 180, 1.5, 0.8)
    out = peq(out, 3500, 2.0, 1.0)
    return out


def duck_env(vo, depth_db, att=0.03, rel=0.35):
    e = np.abs(vo)
    e = signal.lfilter([1 - np.exp(-1 / (0.01 * SR))], [1, -np.exp(-1 / (0.01 * SR))], e)
    on = (e > 0.02).astype(float)
    a = np.exp(-1 / (att * SR))
    r = np.exp(-1 / (rel * SR))
    y = np.zeros_like(on)
    acc = 0.0
    for i in range(0, len(on), 64):
        tgt = on[i]
        c = a if tgt > acc else r
        acc = tgt + (acc - tgt) * c**64
        y[i : i + 64] = acc
    return 10 ** (-depth_db * y / 20)


def main():
    vo = vo_track()
    mus = score()
    sfx, amb = sounds()
    voice = pan2(vo, 0.0) * 1.0
    d_mus = duck_env(vo, 9.0)
    d_sfx = duck_env(vo, 3.5)
    music = mus * d_mus[:, None]
    fx = (sfx + amb) * d_sfx[:, None]
    # balance (before ducking): the score 5 LU under the voice, the sounds 7 LU under it
    def lufs(x):
        return g.integrated(x[:N])
    lv = lufs(voice)
    lm = lufs(mus)
    lf = lufs(sfx + amb)
    music *= 10 ** ((lv - 5.0 - lm) / 20)
    fx *= 10 ** ((lv - 7.0 - lf) / 20)
    mix = voice + music + fx
    mix = mix[:N]
    # the last half second fades with the picture
    mix *= np.clip((DUR - np.arange(N) / SR) / 0.5, 0, 1)[:, None]
    gtot = 1.0
    for _ in range(3):
        k = 10 ** ((TARGET - g.integrated(mix)) / 20)
        gtot *= k
        mix = g.limit(mix * k)
    os.makedirs(os.path.join(ROOT, "out", "lift"), exist_ok=True)
    wav = os.path.join(ROOT, "out", "lift", "mix.wav")
    g.write_wav24(wav, mix)
    g.write_mp3(wav, os.path.join(ROOT, "public", "lift", "mix.mp3"))
    # stems for checks
    g.write_wav24(os.path.join(ROOT, "out", "lift", "stem-music.wav"), np.clip(music[:N] * gtot, -1, 1))
    g.write_wav24(os.path.join(ROOT, "out", "lift", "stem-fx.wav"), np.clip(fx[:N] * gtot, -1, 1))
    print(f"mix: {g.integrated(mix):.1f} LUFS, true peak {g.true_peak_db(mix):.1f} dBTP, {DUR:.2f} s")
    print(f"voice {lv:.1f}, music {lm:.1f} -> {g.integrated(music[:N]):.1f}, sounds {lf:.1f} -> {g.integrated(fx[:N]):.1f} (before the master gain {20*np.log10(gtot):+.1f} dB)")


if __name__ == "__main__":
    sys.exit(main())
