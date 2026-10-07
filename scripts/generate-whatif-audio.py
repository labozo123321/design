#!/usr/bin/env python3
"""
Sound bed for the WhatIf composition: a calm documentary score plus city ambience, ducked under
the narration (read from src/whatif/voice.json). From 31.5 s the air leaves, so the whole bed is
progressively muffled and faded to silence by 37 s: no air, no sound.

    python3 scripts/generate-whatif-audio.py   # writes public/whatif/bed.mp3
"""

import importlib.util
import json
import os

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ga", os.path.join(HERE, "generate-audio.py"))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)

SR, midi = ga.SR, ga.midi
lp, hp, bp, adsr, decay, stereo, reverb, place = ga.lp, ga.hp, ga.bp, ga.adsr, ga.decay, ga.stereo, ga.reverb, ga.place
pad, pluck, bell, noise, sine, t_axis, kick = ga.pad, ga.pluck, ga.bell, ga.noise, ga.sine, ga.t_axis, ga.kick
ROOT = os.path.dirname(HERE)
with open(os.path.join(ROOT, "src", "whatif", "voice.json")) as f:
    VO = json.load(f)
FPS = VO["fps"]
DUR = 41.0
AIR_START, AIR_GONE, ZERO_AT = 31.5, 37.0, 23.0
BEAT = 60 / 80
CHORDS = [(45, [57, 60, 64, 69]), (41, [57, 60, 65, 69]), (48, [55, 60, 64, 67]), (43, [55, 59, 62, 67])]  # Am F C G
MELODY = [76, 74, 72, 74, 76, 79, 76, 74]


def piano(f, sec=1.6):
    t = t_axis(sec)
    v = sum((1 / k**1.3) * np.sin(2 * np.pi * k * f * t) * np.exp(-t * (1.8 + k * 0.9)) for k in range(1, 6))
    return lp(v, 3500) * adsr(len(t), 0.004, 0.2)


def music():
    n = int(DUR * SR)
    m = np.zeros((n, 2))
    bar = BEAT * 4
    t = 0.0
    b = 0
    while t < AIR_GONE + 1:
        root, chord = CHORDS[b % 4]
        build = min(1, max(0, (t - 3) / 20))  # tension grows as gravity falls
        place(m, pad(chord, bar + 0.6, 900 + 2200 * build, 0.6, 0.8), t, 0.1 + 0.06 * build)
        place(m, stereo(lp(sine(midi(root - 12), bar) * adsr(int(bar * SR), 0.2, 0.6), 300)), t, 0.18)
        for q in range(8):
            if t > 2 and (q % 2 == 0 or build > 0.5):
                nn = MELODY[(b * 2 + q) % 8] - (12 if q % 4 == 3 else 0)
                place(m, stereo(piano(midi(nn)), 0.3 if q % 2 else -0.3), t + q * BEAT / 2, 0.07 + 0.03 * build)
        if 6 < t < ZERO_AT:  # soft heartbeat pulse
            for q in range(4):
                place(m, stereo(lp(kick(0.4, 70, 40, 0.12), 180)), t + q * BEAT, 0.12 * build)
        t += bar
        b += 1
    # zero-g swell: airy shimmer
    sw = t_axis(6.0)
    shimmer = sum(np.sin(2 * np.pi * midi(nn) * sw + nn) for nn in (81, 84, 88, 93)) * 0.25
    shimmer *= adsr(len(sw), 1.2, 3.0)
    place(m, stereo(hp(shimmer, 400), 0, 0.8), ZERO_AT - 0.6, 0.12)
    place(m, stereo(bell(midi(69), 4.0), 0, 0.6), ZERO_AT, 0.1)
    return m


def ambience():
    n = int(DUR * SR)
    a = np.zeros((n, 2))
    murmur = bp(noise(DUR), 250, 1400)
    murmur *= 0.75 + 0.25 * np.sin(np.linspace(0, 40, len(murmur)))
    place(a, stereo(murmur, 0, 0.9), 0, 0.05)
    fountain = hp(lp(noise(DUR), 6000), 900)
    place(a, stereo(fountain, -0.3, 0.6), 0, 0.035)
    rng = np.random.default_rng(5)
    for k in range(26):  # birds
        st = rng.uniform(0, AIR_GONE)
        sec = 0.12
        f0 = rng.uniform(2800, 4200)
        tt = t_axis(sec)
        chirp = np.sin(2 * np.pi * (f0 + 1800 * tt / sec) * tt) * adsr(len(tt), 0.01, 0.06)
        place(a, stereo(chirp, rng.uniform(-0.8, 0.8)), st, 0.03)
        place(a, stereo(chirp, rng.uniform(-0.8, 0.8)), st + 0.16, 0.025)
    for st in (2.0, 9.5, 16.0, 22.5):  # cars passing
        sec = 3.0
        x = lp(noise(sec), 700) * np.sin(np.linspace(0, np.pi, int(sec * SR))) ** 2
        place(a, stereo(x, 0.6, 0.4), st, 0.12)
    # wind rushing as the air leaves
    sec = AIR_GONE - AIR_START + 0.5
    wind = bp(noise(sec), 200, 2500) * np.sin(np.linspace(0, np.pi, int(sec * SR))) ** 0.7
    place(a, stereo(wind, 0, 0.9), AIR_START - 0.5, 0.16)
    return a


def suffocate(x):
    """Lowpass sweeping down and level falling to silence between AIR_START and AIR_GONE."""
    out = x.copy()
    blk = 1024
    i0, i1 = int(AIR_START * SR), int(AIR_GONE * SR)
    zi = None
    for i in range(i0, len(out), blk):
        k = min(1, (i - i0) / (i1 - i0))
        fc = max(80, 9000 * (1 - k) ** 2.2 + 80)
        b, a = signal.butter(2, fc / (SR / 2))
        if zi is None or zi.shape[0] != max(len(a), len(b)) - 1:
            zi = np.zeros((max(len(a), len(b)) - 1, 2))
        seg = out[i : i + blk]
        y = np.zeros_like(seg)
        for c in range(2):
            y[:, c], zi[:, c] = signal.lfilter(b, a, seg[:, c], zi=zi[:, c])
        g = (1 - k) ** 1.6
        out[i : i + blk] = y * g
    return out


def duck(x):
    env = np.ones(len(x))
    for l in VO["lines"]:
        a = int(l["from"] / FPS * SR)
        b = int((l["from"] + l["duration"]) / FPS * SR)
        r = int(0.25 * SR)
        env[max(0, a - r) : a] = np.minimum(env[max(0, a - r) : a], np.linspace(1, 0.55, a - max(0, a - r)))
        env[a:b] = np.minimum(env[a:b], 0.55)
        env[b : b + r] = np.minimum(env[b : b + r], np.linspace(0.55, 1, len(env[b : b + r])))
    return x * env[:, None]


if __name__ == "__main__":
    mus = reverb(music(), 3.0, 0.32, 6000)[: int(DUR * SR)]
    bed = duck(mus) + ambience()
    bed = suffocate(bed)
    ga.write_mp3(os.path.join(ROOT, "public", "whatif", "bed.mp3"), bed, 0.6)
    print("whatif bed written")
