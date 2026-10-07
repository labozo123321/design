#!/usr/bin/env python3
"""
Sound for the Pov composition (no narration). Reads src/pov/track.json so every footstep, take-off and
landing lands on its frame, and the wind follows the real climb speed and air density.

  0-4 s    waking: room tone, soft pad, the plaza fades in
  4-29 s   walking + leaps: playful plucked score that gains energy as the leaps grow
  29-38 s  the last leap: everything drops to a suspended shimmer, reverse swell
  38-51 s  the updraft: taiko, big strings, wind roar
  51-53 s  inside the cloud: muffled
  53-60 s  above the clouds: wide, majestic chord
  60-66 s  thin air: sound drains away, gasping breaths, heartbeat, silence

    python3 scripts/generate-pov-audio.py   # writes public/pov/bed.mp3
"""

import importlib.util
import json
import math
import os

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ga", os.path.join(HERE, "generate-audio.py"))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)

SR, midi = ga.SR, ga.midi
lp, hp, bp, adsr, decay, stereo, reverb, place, sat = ga.lp, ga.hp, ga.bp, ga.adsr, ga.decay, ga.stereo, ga.reverb, ga.place, ga.sat
pad, pluck, bell, kick, noise, sine, t_axis = ga.pad, ga.pluck, ga.bell, ga.kick, ga.noise, ga.sine, ga.t_axis
ROOT = os.path.dirname(HERE)
with open(os.path.join(ROOT, "src", "pov", "track.json")) as f:
    TR = json.load(f)
FPS = TR["fps"]
DUR = TR["frames"] / FPS
N = int(DUR * SR)
FLOAT = TR["floatAt"] / FPS
alt = np.interp(np.arange(N) / SR, np.arange(TR["frames"]) / FPS, TR["y"])
vel = np.interp(np.arange(N) / SR, np.arange(TR["frames"]) / FPS, np.maximum(0, TR["vel"]))
density = np.exp(-np.maximum(0, alt - 2) / 8000.0)  # air density with altitude


def F(fr):
    return fr / FPS


def env_curve(points):
    tt = np.arange(N) / SR
    xs, ys = zip(*points)
    return np.interp(tt, xs, ys)


# ------------------------------------------------------------------ body sounds


def footstep(k):
    sec = 0.22
    n = int(sec * SR)
    thud = lp(kick(sec, 110 + k * 7, 60, 0.03), 900) * 0.8
    grit = bp(noise(sec), 1500, 6000) * decay(n, 0.018) * 0.45
    return thud + grit


def landing(v):
    sec = 0.9
    n = int(sec * SR)
    amp = min(1.0, v / 3.2)
    thump = lp(kick(sec, 90, 38, 0.12), 500) * (0.9 + 0.4 * amp)
    scuff = bp(noise(sec), 700, 5000) * decay(n, 0.09) * 0.5
    rumble = lp(noise(sec), 160) * decay(n, 0.3) * 0.5 * amp
    return sat(thump + scuff + rumble, 1.4)


def whoosh(sec=0.45, lo=300, hi=3000):
    n = int(sec * SR)
    return ga.sweep(noise(sec), lo, hi, "band", 0.6) * np.sin(np.linspace(0, np.pi, n)) ** 1.6


def breath(sec, gasp=False):
    n = int(sec * SR)
    x = bp(noise(sec), 500 if gasp else 350, 2600 if gasp else 1800)
    e = np.sin(np.linspace(0, np.pi, n)) ** (0.6 if gasp else 1.2)
    return x * e


def heartbeat():
    sec = 0.6
    n = int(sec * SR)
    a = lp(kick(0.3, 70, 36, 0.09), 180)
    x = np.zeros(n)
    x[: len(a)] += a
    st = int(0.18 * SR)
    x[st : st + len(a)] += a[: n - st] * 0.65
    return x


# ------------------------------------------------------------------ score

KEY = [(50, [62, 66, 69, 73]), (47, [62, 66, 69, 71]), (43, [62, 67, 71, 74]), (45, [61, 64, 69, 73])]  # D Bm G A (maj7 colours)
ARP = [74, 78, 81, 85, 81, 78]


def strings(notes, sec, cutoff, attack):
    return pad(notes, sec, cutoff, attack, min(2.0, sec * 0.4))


def score():
    m = np.zeros((N + SR * 4, 2))
    d = np.zeros_like(m)
    # waking
    place(m, strings([62, 66, 69], 5.0, 900, 2.0), 0.0, 0.12)
    # walking + leaps: plucked arps, gaining speed and brightness
    t = 3.0
    b = 0
    beat = 0.5
    while t < FLOAT:
        root, chord = KEY[b % 4]
        energy = min(1, max(0, (t - 3) / (FLOAT - 3)))
        bar = beat * 4
        place(m, strings(chord, bar + 0.3, 1000 + 2500 * energy, 0.25), t, 0.07 + 0.06 * energy)
        place(m, stereo(lp(sine(midi(root - 12), bar) * adsr(int(bar * SR), 0.05, 0.3), 260)), t, 0.16)
        steps = 8 if energy < 0.5 else 12
        for q in range(steps):
            nn = ARP[(b * 3 + q) % len(ARP)] + (12 if energy > 0.7 and q % 3 == 0 else 0)
            place(m, stereo(pluck(midi(nn), 0.35, 1.0 + energy), 0.35 if q % 2 else -0.35), t + q * bar / steps, 0.06 + 0.04 * energy)
        if energy > 0.3:
            for q in range(4):
                place(d, stereo(lp(kick(0.35, 90, 45, 0.1), 300)), t + q * beat, 0.18 * energy)
        t += bar
        b += 1
        beat = max(0.36, 0.5 - 0.14 * energy)
    # the last leap: drop to a suspended shimmer
    sw = t_axis(9.5)
    shimmer = sum(np.sin(2 * np.pi * midi(nn) * sw + nn) for nn in (81, 86, 88, 93)) * 0.22 * adsr(len(sw), 1.5, 3.0)
    place(m, stereo(hp(shimmer, 500), 0, 0.9), FLOAT + 0.2, 0.2)
    place(m, strings([62, 69, 74, 76], 9.0, 1300, 2.5), FLOAT + 0.3, 0.2)
    rev = whoosh(3.0, 200, 8000) * np.linspace(0, 1, int(3.0 * SR)) ** 2
    place(m, stereo(rev, 0, 0.9), 38.0 - 3.0, 0.22)
    # the updraft: taiko + big strings
    t = 38.0
    k = 0
    while t < 51.0:
        root, chord = KEY[k % 4]
        place(m, strings([c - 12 for c in chord] + chord + [chord[0] + 12], 2.4, 2600, 0.15), t, 0.17)
        place(m, stereo(lp(sine(midi(root - 24), 2.4) * adsr(int(2.4 * SR), 0.05, 0.6), 200)), t, 0.25)
        for q, g in ((0, 0.6), (0.6, 0.35), (1.2, 0.5), (1.5, 0.3), (1.8, 0.45)):
            place(d, stereo(sat(lp(kick(0.7, 80, 40, 0.22), 600), 1.5)), t + q, g * 0.55)
        t += 2.4
        k += 1
    # above the clouds: wide, majestic
    place(m, strings([50, 57, 62, 66, 69, 74, 78], 7.5, 3000, 1.2), 53.0, 0.18)
    for i, nn in enumerate([74, 78, 81, 86]):
        place(m, stereo(bell(midi(nn), 4.0), -0.4 + i * 0.25, 0.6), 53.4 + i * 0.35, 0.06)
    # thin air: high and cold
    place(m, strings([86, 90, 93], 6.0, 5000, 1.5), 59.5, 0.06)
    return m, d


def ambience():
    a = np.zeros((N + SR * 4, 2))
    city = bp(noise(DUR), 220, 1500) * (0.8 + 0.2 * np.sin(np.linspace(0, 50, int(DUR * SR))))
    place(a, stereo(city, 0, 0.9), 0, 0.05)
    # fountain louder when you pass it (~15-24 s)
    fount = hp(lp(noise(DUR), 7000), 900) * env_curve([(0, 0.3), (12, 0.6), (19, 1.0), (25, 0.5), (35, 0.2), (40, 0)])[: int(DUR * SR)]
    place(a, stereo(fount, -0.3, 0.6), 0, 0.05)
    rng = np.random.default_rng(9)
    for _ in range(40):
        st = rng.uniform(0.5, 40)
        sec = 0.12
        tt = t_axis(sec)
        f0 = rng.uniform(2800, 4300)
        ch = np.sin(2 * np.pi * (f0 + 1600 * tt / sec) * tt) * adsr(len(tt), 0.01, 0.06)
        place(a, stereo(ch, rng.uniform(-0.8, 0.8)), st, 0.025)
        place(a, stereo(ch, rng.uniform(-0.8, 0.8)), st + 0.15, 0.02)
    # thin the ground world out as you climb
    fade = np.clip(1 - np.log1p(np.maximum(0, alt[: len(a)] - 2)) / np.log1p(500), 0, 1) if len(alt) >= len(a) else None
    g = np.ones(len(a))
    g[:N] = np.clip(1 - np.log1p(np.maximum(0, alt - 2)) / np.log1p(500), 0, 1)
    g[N:] = 0
    return a * g[:, None]


def body():
    b = np.zeros((N + SR * 4, 2))
    for i, fr in enumerate(TR["steps"]):
        place(b, stereo(footstep(i % 3), 0.15 if i % 2 else -0.15), F(fr), 0.32)
    for fr, v in TR["landings"]:
        place(b, stereo(landing(v)), F(fr), 0.5)
    for i, fr in enumerate(TR["takeoffs"]):
        last = i == len(TR["takeoffs"]) - 1
        place(b, stereo(whoosh(0.5 if not last else 1.2, 300, 3500), 0, 0.6), F(fr), 0.18 + (0.15 if last else 0))
        place(b, stereo(breath(0.35, True)), F(fr) - 0.05, 0.06)
    # wind: real climb speed x air density
    w = bp(noise(DUR), 150, 3200)
    wl = np.clip(np.sqrt(vel / 40.0), 0, 1.4) * np.clip(density * 1.2, 0, 1)
    w2 = bp(noise(DUR), 120, 2200)
    wind = np.stack([w * wl[: len(w)], w2 * wl[: len(w2)]], axis=1)
    place(b, wind, 0, 0.32)
    # inside the cloud
    place(b, stereo(whoosh(2.4, 200, 1200), 0, 0.9), 50.6, 0.25)
    # breathing gets heavy in the thin air
    t = 55.0
    gap = 2.0
    while t < 64.6:
        place(b, stereo(breath(0.55, t > 59)), t, 0.05 + 0.05 * min(1, (t - 55) / 6))
        place(b, stereo(breath(0.4)), t + 0.6, 0.03)
        t += gap
        gap = max(1.0, gap * 0.9)
    for bt in (59.6, 60.7, 61.75, 62.75, 63.7, 64.6, 65.4):
        place(b, stereo(heartbeat()), bt, 0.55 if bt < 65 else 0.4)
    return b


def thin_air(x):
    """As the air thins, everything but the body (heartbeat/breath) drains away: lowpass + level."""
    out = x.copy()
    blk = 1024
    zi = np.zeros((2, 2))
    for i in range(0, N, blk):
        a = alt[min(i, N - 1)]
        k = min(1, max(0, (math.log(max(a, 1)) - math.log(15000)) / (math.log(90000) - math.log(15000))))
        fc = max(120, 12000 * (1 - k) ** 2.5 + 120)
        b_, a_ = signal.butter(2, fc / (SR / 2))
        seg = out[i : i + blk]
        y = np.zeros_like(seg)
        for c in range(2):
            y[:, c], zi[:, c] = signal.lfilter(b_, a_, seg[:, c], zi=zi[:, c])
        out[i : i + blk] = y * (1 - k) ** 1.4
    out[N:] = 0
    return out


if __name__ == "__main__":
    mus, drums = score()
    mus = reverb(mus, 3.2, 0.3, 7000)[: len(mus)]
    drums = reverb(drums, 1.2, 0.12, 8000)[: len(drums)]
    world = thin_air(mus + drums * 0.9 + ambience())
    mix = world + reverb(body(), 0.6, 0.1, 9000)[: len(world)]
    mix = mix[:N]
    fade = int(0.4 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    ga.write_mp3(os.path.join(ROOT, "public", "pov", "bed.mp3"), mix, 0.89)
    print("pov bed written")
