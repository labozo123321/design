#!/usr/bin/env python3
"""
Sound for the Hole composition (no narration): every sound is synthesised here and timed from
src/hole/track.json, so the lamps, the train, the cave, the mine, the lightning and the centre all land
on their frames.

  0-3.2 s    the plaza: murmuring onlookers, a heartbeat, two steps to the edge
  3.2 s      you jump: the crowd gasps, the score drops in
  3.4-17 s   the crust: wind growing with your speed, lamps whipping past, the metro train, crystal chimes
             in the cave, the mine; a driving pulse in D minor
  17-34 s    the mantle: the lamps die, the rock roars and crackles, magma bubbles; heavier drums
  34-43 s    the outer core: a huge open choir, the magnetic field humming, lightning
  43-47.5 s  the inner core: everything rises
  47.5 s     the centre: silence, one deep note, weightless and calm
  50-64.6 s  the far side: climbing back, hopeful, in D major
  64.6-72 s  the island at night: waves, crickets, a guitar by the fire that stops dead, a gasp;
             the drop back in, and the last chord under "would you jump?"

    python3 scripts/generate-hole-audio.py   # writes public/hole/bed.mp3
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
pad, pluck, bell, kick, clap, hat, noise, sine, t_axis = ga.pad, ga.pluck, ga.bell, ga.kick, ga.clap, ga.hat, ga.noise, ga.sine, ga.t_axis
ROOT = os.path.dirname(HERE)
with open(os.path.join(ROOT, "src", "hole", "track.json")) as f:
    TR = json.load(f)
FPS = TR["fps"]
FR = TR["frames"]
DUR = FR / FPS
N = int(DUR * SR)
PAD = SR * 5
EV = TR["events"]
tf = np.arange(FR) / FPS
ts = np.arange(N) / SR
EYE = 1.7
T_CENTRE = 47.5
T_DROP = 68.4
wall = np.array(TR["wall"])
side = np.array(TR["side"])
vis_f = np.array(TR["vis"])
# the walls' speed past you (the fall back in at the end too)
speed_f = np.where(tf > T_DROP, 9.81 * (tf - T_DROP), vis_f)
speed = np.interp(ts, tf, speed_f)
RNG = np.random.default_rng(21)


def bus():
    return np.zeros((N + PAD, 2))


def env_curve(points, n=None):
    xs, ys = zip(*points)
    return np.interp(np.arange(n or N) / SR, xs, ys)


def crossing(values, target, t0=0.0, t1=DUR, rising=True):
    """First time (s) after t0 when the per-frame series crosses target."""
    for i in range(1, FR):
        if tf[i] < t0 or tf[i] > t1:
            continue
        a, b = values[i - 1], values[i]
        if (rising and a < target <= b) or (not rising and a > target >= b):
            return tf[i - 1] + (target - a) / (b - a) / FPS
    return None


def wall_depth(sd, w):
    tab = TR["wallDepth"]["near" if sd == 0 else "far"]
    d = np.array(tab["d"])
    x = (w - tab["w0"]) / (tab["w1"] - tab["w0"]) * (len(d) - 1)
    return float(np.interp(x, np.arange(len(d)), d))


def temp_at(km):
    keys = [(0, 15), (4, 60), (12.3, 180), (35, 600), (100, 1300), (150, 1400), (410, 1500), (660, 1900),
            (2890, 3700), (2890.1, 4000), (5150, 5400), (6371, 5500)]
    xs, ys = zip(*keys)
    return float(np.interp(km, xs, ys))


# ------------------------------------------------------------------ sound builders


def whoosh(sec=0.45, lo=300, hi=3000):
    n = int(sec * SR)
    return ga.sweep(noise(sec), lo, hi, "band", 0.6) * np.sin(np.linspace(0, np.pi, n)) ** 1.6


def footstep(k):
    sec = 0.22
    n = int(sec * SR)
    thud = lp(kick(sec, 110 + k * 7, 60, 0.03), 900) * 0.8
    grit = bp(noise(sec), 1500, 6000) * decay(n, 0.018) * 0.45
    return thud + grit


def breath(sec, gasp=False):
    n = int(sec * SR)
    x = bp(noise(sec), 500 if gasp else 350, 2600 if gasp else 1800)
    return x * np.sin(np.linspace(0, np.pi, n)) ** (0.6 if gasp else 1.2)


def heartbeat():
    sec = 0.6
    n = int(sec * SR)
    a = lp(kick(0.3, 70, 36, 0.09), 180)
    x = np.zeros(n)
    x[: len(a)] += a
    st = int(0.18 * SR)
    x[st : st + len(a)] += a[: n - st] * 0.65
    return x


def voice(f0, sec, vowel=(500, 900), glide=-0.25, breathy=0.3):
    """A sung/gasped vowel: a glottal buzz with vibrato through two formants."""
    tt = t_axis(sec)
    f = f0 * (1 + glide * tt / sec) * (1 + 0.012 * np.sin(2 * np.pi * 5.5 * tt))
    src = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * (1 - breathy) + noise(sec) * breathy * 0.5
    v = bp(src, vowel[0] * 0.8, vowel[0] * 1.25) + 0.6 * bp(src, vowel[1] * 0.85, vowel[1] * 1.2)
    return v * adsr(len(tt), 0.06, sec * 0.6, 1.4)


def gasp(n=9, sec=1.1, kid=False):
    """A crowd going 'oh!' / 'whoa': a few voices, slightly apart."""
    x = np.zeros((int((sec + 0.4) * SR), 2))
    for k in range(n):
        f0 = RNG.uniform(160, 260) * (1.5 if kid and k == 0 else 1)
        v = voice(f0, sec * RNG.uniform(0.75, 1.0), (RNG.uniform(450, 600), RNG.uniform(800, 1050)), -0.3, 0.45)
        place(x, stereo(v, RNG.uniform(-0.7, 0.7)), RNG.uniform(0, 0.25), 1.0 / math.sqrt(n))
    return x


def murmur(sec):
    """Onlookers talking quietly: babble from formant noise bursts."""
    x = np.zeros((int(sec * SR), 2))
    t = 0.0
    while t < sec - 0.5:
        d = RNG.uniform(0.12, 0.35)
        v = voice(RNG.uniform(110, 240), d, (RNG.uniform(350, 750), RNG.uniform(900, 1900)), RNG.uniform(-0.2, 0.2), 0.6)
        place(x, stereo(v, RNG.uniform(-0.9, 0.9)), t, RNG.uniform(0.2, 0.5))
        t += RNG.uniform(0.04, 0.16)
    return x


def lamp_swish(k):
    """A work lamp whipping past: a short doppler swish with a buzz of mains in it."""
    sec = 0.26
    n = int(sec * SR)
    sw = ga.sweep(noise(sec), 2600, 700, "band", 0.5) * np.sin(np.linspace(0, np.pi, n)) ** 2
    tt = t_axis(sec)
    hum = (np.sin(2 * np.pi * 100 * tt) + 0.5 * np.sin(2 * np.pi * 200 * tt)) * np.sin(np.linspace(0, np.pi, n)) ** 3
    return sw + hum * 0.15


def train_pass():
    """The metro under you: rail rumble with wheel clacks, a two-tone horn, a squeal, the tail going away."""
    sec = 5.6
    n = int(sec * SR)
    tt = t_axis(sec)
    rum = lp(noise(sec), 220) * 1.2 + bp(noise(sec), 300, 1200) * 0.4
    clack = np.zeros(n)
    for k in range(int(sec / 0.21)):
        i = int(k * 0.21 * SR)
        c = bp(noise(0.05), 600, 3000) * decay(int(0.05 * SR), 0.01)
        clack[i : i + len(c)] += c[: n - i] * (1.0 if k % 2 else 0.7)
    body = (rum + clack * 0.9) * env_curve([(0, 0), (1.6, 0.35), (2.5, 1.0), (2.9, 1.0), (3.6, 0.4), (5.6, 0)], n)
    # horn: from 1.9 s for 0.8 s, then its doppler drop as it goes
    hs = 1.5
    ht = t_axis(hs)
    bend = np.where(ht < 0.75, 1.0, 1.0 - 0.06 * (ht - 0.75) / 0.75)
    horn = sum(signal.sawtooth(2 * np.pi * np.cumsum(f * bend) / SR) for f in (311.1, 392.0))
    horn = bp(horn, 300, 2400) * adsr(len(ht), 0.04, 0.6) * 0.5
    squeal = sum(np.sin(2 * np.pi * f * tt[: int(1.2 * SR)]) for f in (3150, 4720)) * adsr(int(1.2 * SR), 0.2, 0.6) * 0.08
    x = np.zeros(n)
    x += body
    i = int(1.9 * SR)
    x[i : i + len(horn)] += horn
    j = int(2.3 * SR)
    x[j : j + len(squeal)] += squeal
    return x


def chimes(sec, density=26, lo=84, hi=108):
    """Crystals: a scatter of high bells in a pentatonic set."""
    x = np.zeros((int((sec + 3) * SR), 2))
    scale = [0, 2, 4, 7, 9]
    for _ in range(int(sec * density)):
        nn = 12 * RNG.integers(lo // 12, hi // 12 + 1) + scale[RNG.integers(0, 5)] + 2
        place(x, stereo(bell(midi(min(hi, max(lo, nn))), 2.2), RNG.uniform(-0.9, 0.9)), RNG.uniform(0, sec), RNG.uniform(0.04, 0.12))
    return x


def clank():
    """Metal on metal in a mine gallery."""
    sec = 0.9
    tt = t_axis(sec)
    v = sum(a * np.sin(2 * np.pi * f * tt) * np.exp(-tt / d) for f, a, d in ((523, 1, 0.3), (1307, 0.6, 0.2), (2213, 0.4, 0.12), (3870, 0.25, 0.06)))
    return v * adsr(len(tt), 0.001, 0.2)


def buzz(sec=0.6):
    """A lamp failing: mains hum stuttering, crackle, a pop."""
    tt = t_axis(sec)
    hum = sum(np.sin(2 * np.pi * 50 * h * tt) / h for h in (1, 2, 3, 5, 7))
    stutter = 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * RNG.uniform(8, 14) * tt))
    crackle = hp(noise(sec), 2500) * (RNG.random(len(tt)) < 0.012)
    pop = hp(noise(sec), 800) * decay(len(tt), 0.01) * (tt > sec * 0.7)
    return (hum * 0.5 * stutter + crackle * 0.8 + pop) * np.sin(np.pi * tt / sec) ** 0.5


def crackles(sec, rate=30):
    """Hot rock splitting: a field of sharp ticks and pops."""
    x = np.zeros((int(sec * SR), 2))
    for _ in range(int(sec * rate)):
        d = RNG.uniform(0.003, 0.03)
        c = bp(noise(d + 0.02), RNG.uniform(900, 2500), RNG.uniform(4000, 9000)) * decay(int((d + 0.02) * SR), d)
        place(x, stereo(c, RNG.uniform(-1, 1)), RNG.uniform(0, sec - 0.06), RNG.uniform(0.1, 0.5))
    return x


def bloops(sec, rate=4):
    """Magma bubbling: low gloopy pitch drops."""
    x = np.zeros((int((sec + 1) * SR), 2))
    for _ in range(int(sec * rate)):
        d = RNG.uniform(0.15, 0.35)
        tt = t_axis(d)
        f = RNG.uniform(70, 140) * np.exp(-tt / 0.12) + 40
        b = np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(len(tt), d / 3)
        place(x, stereo(lp(b, 600), RNG.uniform(-0.8, 0.8)), RNG.uniform(0, sec), RNG.uniform(0.3, 0.7))
    return x


def thunder(k=1.0):
    sec = 3.5
    n = int(sec * SR)
    crack = hp(noise(sec), 1500) * decay(n, 0.05) * 1.2
    zap = sum(np.sin(2 * np.pi * f * t_axis(sec)) for f in (1180, 1770)) * decay(n, 0.08) * 0.25
    roll = lp(noise(sec), 180) * env_curve([(0, 0), (0.08, 1), (0.6, 0.8), (3.5, 0)], n) * 1.4
    return sat(crack + zap + roll, 1.4) * k


def riser(sec, lo=200, hi=6000):
    n = int(sec * SR)
    tt = t_axis(sec)
    sw = ga.sweep(noise(sec), lo, hi, "band", 0.45) * np.linspace(0, 1, n) ** 2.2
    tone = sum(signal.sawtooth(2 * np.pi * np.cumsum(f0 * 2 ** (2.2 * tt / sec)) / SR) for f0 in (110, 165, 220.5))
    return sw + lp(tone, 3000) * 0.12 * np.linspace(0, 1, n) ** 2


def impact(sec=3.5, f0=80, f1=30):
    return ga.sub_boom(sec, f0, f1) * 1.0 + hp(noise(sec), 2500) * decay(int(sec * SR), 0.03) * 0.4


def guitar_strum(chord, sec=1.4, down=True):
    """A nylon-ish strum: six plucks a few ms apart."""
    x = np.zeros(int((sec + 0.2) * SR))
    order = chord if down else chord[::-1]
    for k, nn in enumerate(order):
        p = pluck(midi(nn), sec, 0.9)
        i = int(k * 0.012 * SR)
        x[i : i + len(p)] += p[: len(x) - i] * (0.9 if k else 1.0)
    return lp(x, 4200)


def waves(sec):
    """Small surf on sand: swells every few seconds, the hiss of the wash."""
    n = int(sec * SR)
    tt = t_axis(sec)
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * tt / 6.3 - 1.2)
    body = lp(noise(sec), 500) * (0.3 + 0.7 * swell ** 2)
    wash = bp(noise(sec), 1500, 7000) * (np.maximum(0, np.sin(2 * np.pi * tt / 6.3 - 0.4)) ** 3) * 0.6
    return body + wash


def crickets(sec):
    n = int(sec * SR)
    tt = t_axis(sec)
    x = np.zeros((n, 2))
    for k in range(5):
        f = RNG.uniform(4200, 5200)
        rate = RNG.uniform(13, 17)
        gate = (np.sin(2 * np.pi * rate * tt + k) > 0.6) * (np.sin(2 * np.pi * RNG.uniform(0.6, 0.9) * tt + k) > -0.2)
        c = np.sin(2 * np.pi * f * tt) * lp(gate.astype(float), 300)
        x += stereo(c, RNG.uniform(-0.9, 0.9)) * 0.2
    return x


def fire(sec):
    x = np.zeros((int(sec * SR), 2))
    roar = lp(noise(sec), 300) * 0.5
    x += stereo(roar, 0.0)
    x += crackles(sec, 14) * 0.6
    return x


# ------------------------------------------------------------------ the score


def strings(notes, sec, cutoff, attack, release=None):
    return pad(notes, sec, cutoff, attack, release if release is not None else min(2.0, sec * 0.4))


def choir(notes, sec, attack=1.2):
    """Ooh-ish vowel pads (formant-filtered saw stacks)."""
    out = np.zeros((int(sec * SR), 2))
    for i, nn in enumerate(notes):
        v = ga.saw_voice(midi(nn), sec, 12)
        v = bp(v, 380, 1100) + 0.5 * bp(v, 2200, 3000)
        out += stereo(v * adsr(len(v), attack, min(2.5, sec * 0.5), 1.5), -0.5 + i / max(1, len(notes) - 1), 0.5)
    return out / len(notes)


def bassline(root, sec, eighth):
    """Driving eighth notes on the root, octave jumps on the off-beats."""
    x = np.zeros(int((sec + 0.5) * SR))
    k = 0
    t = 0.0
    while t < sec:
        nn = root + (12 if k % 4 == 3 else 0)
        tone = (signal.sawtooth(2 * np.pi * midi(nn) * t_axis(eighth * 0.95)) * 0.6 + sine(midi(nn), eighth * 0.95))
        tone = lp(tone, 520) * adsr(int(eighth * 0.95 * SR), 0.004, 0.06)
        i = int(t * SR)
        x[i : i + len(tone)] += tone
        t += eighth
        k += 1
    return x


def score():
    m = bus()
    d = bus()
    # the plaza: a low held minor chord, ticking, the heart going
    place(m, strings([38, 50, 53, 57], 3.6, 700, 1.2, 0.6), 0.0, 0.12)
    for k in range(7):
        place(d, stereo(hat(0.05, 0.01), 0.3), 0.3 + k * 0.42, 0.18)
    # the jump: a hit, then the drive through the crust (D minor: Dm Bb F C)
    place(d, stereo(impact(3.0, 90, 34), 0, 0.3), 3.25, 0.9)
    place(m, strings([50, 57, 62, 65, 69, 74], 2.0, 3200, 0.02, 1.6), 3.25, 0.2)
    prog = [(38, [62, 65, 69]), (34, [62, 65, 70]), (41, [60, 65, 69]), (36, [60, 64, 67])]
    t = 4.0
    k = 0
    bar = 2.0  # 120 bpm, 4 beats
    while t < 17.2:
        root, chord = prog[(k // 2) % 4]
        e = min(1, (t - 4) / 13)
        place(m, strings(chord + [chord[0] + 12], bar + 0.25, 1200 + 2600 * e, 0.3), t, 0.08 + 0.05 * e)
        place(m, stereo(bassline(root, bar, 0.25)), t, 0.2 + 0.08 * e)
        arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 24]
        steps = 8 if e < 0.5 else 16
        for q in range(steps):
            place(m, stereo(pluck(midi(arp[q % 4]), 0.3, 1.2 + e), 0.4 if q % 2 else -0.4), t + q * bar / steps, 0.04 + 0.03 * e)
        for q in range(4):
            place(d, stereo(lp(kick(0.4, 110, 45, 0.12), 400)), t + q * 0.5, 0.42)
            if t >= 7 and q % 2 == 1:
                place(d, stereo(clap(), 0, 0.4), t + q * 0.5, 0.2)
            place(d, stereo(hat(), 0.25), t + q * 0.5 + 0.25, 0.1 + 0.08 * e)
        t += bar
        k += 1
    # the Moho: the beat falls away, a held tension note
    place(m, strings([50, 51, 57], 2.4, 900, 0.5), 17.2, 0.12)
    # the mantle (Dm C Bb A): heavier, darker, building
    prog2 = [(38, [62, 65, 69]), (36, [60, 64, 67]), (34, [62, 65, 70]), (33, [61, 64, 69])]
    t = 19.0
    k = 0
    while t < 33.6:
        root, chord = prog2[k % 4]
        e = min(1, (t - 19) / 14)
        place(m, strings([c - 12 for c in chord] + chord, bar + 0.3, 1600 + 2400 * e, 0.2), t, 0.11 + 0.05 * e)
        place(m, stereo(bassline(root, bar, 0.25)), t, 0.25)
        for q, g in ((0, 0.7), (0.5, 0.35), (0.75, 0.3), (1.0, 0.6), (1.5, 0.45), (1.75, 0.3)):
            place(d, stereo(sat(lp(kick(0.6, 85, 40, 0.18), 600), 1.5)), t + q, g * (0.55 + 0.3 * e))
        place(d, stereo(clap(), 0, 0.5), t + 0.5, 0.18)
        place(d, stereo(clap(), 0, 0.5), t + 1.5, 0.18)
        for q in range(8):
            place(d, stereo(hat(0.06, 0.012), -0.3), t + q * 0.25, 0.08 + 0.06 * e)
        t += bar
        k += 1
    place(m, stereo(riser(1.8, 300, 9000), 0, 0.6), 32.2, 0.3)
    # the outer core: everything opens out (F C Dm Bb), half-time, a choir
    place(d, stereo(impact(4.0, 70, 28), 0, 0.5), EV_T["coreIn"], 1.0)
    prog3 = [(41, [65, 69, 72]), (36, [64, 67, 72]), (38, [62, 65, 69]), (34, [62, 65, 70])]
    t = EV_T["coreIn"]
    k = 0
    while t < 43.0:
        root, chord = prog3[k % 4]
        place(m, choir(chord + [chord[0] + 12], 2.6, 0.5), t, 0.22)
        place(m, strings([root, root + 7, root + 12] + chord, 2.6, 2200, 0.4), t, 0.1)
        place(m, stereo(lp(sine(midi(root - 12), 2.4) * adsr(int(2.4 * SR), 0.2, 0.8), 160)), t, 0.35)
        place(d, stereo(sat(lp(kick(1.0, 70, 32, 0.4), 400), 1.6)), t, 0.7)
        place(d, stereo(sat(lp(kick(0.8, 75, 36, 0.3), 500), 1.4)), t + 1.25, 0.4)
        t += 2.2
        k += 1
    # the inner core: rising, rising
    place(m, stereo(riser(4.4, 150, 12000), 0, 0.7), 43.1, 0.42)
    place(m, strings([62, 69, 74, 76, 81], 4.4, 4000, 3.0, 0.2), 43.1, 0.18)
    t = 43.2
    gap = 0.5
    while t < 47.4:
        place(d, stereo(lp(kick(0.3, 120, 50, 0.08), 600)), t, 0.5)
        t += gap
        gap = max(0.09, gap * 0.86)
    # the centre: (the deep note goes on after the duck, see centre_note) then weightless calm in D major
    for i, nn in enumerate([74, 78, 81, 86, 90]):
        place(m, stereo(bell(midi(nn), 4.5), -0.6 + i * 0.3, 0.6), T_CENTRE + 0.25 + i * 0.28, 0.07)
    place(m, strings([50, 57, 62, 66, 69, 76], 4.0, 2400, 1.5, 1.5), T_CENTRE + 0.2, 0.14)
    place(m, choir([62, 66, 69, 74], 3.6, 1.2), T_CENTRE + 0.4, 0.14)
    # the far side: climbing back, hopeful (D A Bm G)
    prog4 = [(38, [62, 66, 69]), (33, [61, 64, 69]), (35, [62, 66, 71]), (31, [62, 67, 71])]
    t = 50.8
    k = 0
    while t < 64.4:
        root, chord = prog4[k % 4]
        e = min(1, (t - 50.8) / 13)
        place(m, strings(chord + [chord[0] + 12, chord[2] + 12], bar + 0.3, 1800 + 3000 * e, 0.25), t, 0.09 + 0.06 * e)
        place(m, stereo(bassline(root, bar, 0.25)), t, 0.22)
        arp = [chord[0] + 12, chord[2] + 12, chord[1] + 24, chord[2] + 12]
        for q in range(16):
            place(m, stereo(pluck(midi(arp[q % 4]), 0.3, 1.6 + e), 0.4 if q % 2 else -0.4), t + q * bar / 16, 0.04 + 0.03 * e)
        for q in range(4):
            place(d, stereo(lp(kick(0.4, 110, 45, 0.12), 400)), t + q * 0.5, 0.4 + 0.15 * e)
            if q % 2 == 1:
                place(d, stereo(clap(), 0, 0.4), t + q * 0.5, 0.18 + 0.08 * e)
            place(d, stereo(hat(), 0.25), t + q * 0.5 + 0.25, 0.12 + 0.06 * e)
        t += bar
        k += 1
    place(m, stereo(riser(2.4, 200, 10000), 0, 0.7), 62.2, 0.36)
    # out into the night: one warm chord, then quiet
    place(m, strings([50, 57, 62, 64, 66, 69, 74], 5.0, 2600, 0.05, 2.5), 64.6, 0.2)
    place(m, choir([66, 69, 74, 78], 4.5, 0.3), 64.6, 0.13)
    for i, nn in enumerate([78, 81, 86, 85, 81]):
        place(m, stereo(bell(midi(nn), 3.0), -0.3 + i * 0.15, 0.6), 65.3 + i * 0.55, 0.05)
    # the drop back in, and the question
    place(m, stereo(whoosh(1.6, 2000, 200), 0, 0.8), T_DROP, 0.25)
    place(d, stereo(impact(4.0, 75, 28), 0, 0.5), 69.45, 0.85)
    place(m, strings([38, 50, 57, 62, 65, 69], 3.2, 1800, 0.05, 1.2), 69.45, 0.2)
    place(m, choir([62, 65, 69, 74], 3.0, 0.2), 69.45, 0.14)
    return m, d


# ------------------------------------------------------------------ events from the track

def lamp_passes():
    """When your eyes pass each work lamp, and how alive it is (they die where the rock gets hot)."""
    out = []
    w_eye = wall - EYE
    for i in range(1, FR):
        if tf[i] > 66 or side[i] != side[i - 1]:
            continue
        a, b = (w_eye[i - 1] - 8) / 9, (w_eye[i] - 8) / 9
        if math.floor(a) != math.floor(b) and min(a, b) > -1:
            k = math.floor(max(a, b))
            wk = 8 + 9 * k
            life = 1 - min(1, max(0, (temp_at(wall_depth(side[i], wk)) - 520) / 120))
            if life > 0.05:
                out.append((tf[i], k, life, speed_f[i]))
    return out


EV_T = {
    "train": crossing(wall - EYE, EV["train"], 5, 9),
    "fossils": 7.7,
    "cave": crossing(wall - EYE, EV["cave"], 7, 11),
    "mine": crossing(wall - EYE, EV["mine"], 10, 15),
    "coreIn": crossing(wall - EYE, EV["coreIn"], 30, 40),
    "coreOut": crossing(wall - EYE, EV["coreOut"], 38, 46),
    "farIcb": crossing(wall - EYE, EV["farCoreIn"], 48, 53, rising=False),
    "farCmb": crossing(wall - EYE, EV["farCoreOut"], 50, 56, rising=False),
}
BOLTS = [35.9, 37.4, 38.95, 40.2, 41.6, 51.5, 52.6]


def fx():
    b = bus()
    # the plaza: onlookers, two steps, a breath, the jump and the gasp
    place(b, murmur(4.0) * env_curve([(0, 1), (3.2, 1), (3.6, 0.3), (4.0, 0)], int(4.0 * SR))[:, None], 0.0, 0.28)
    for k, ft in enumerate((2.42, 2.78, 3.08)):
        place(b, stereo(footstep(k), 0.15 if k % 2 else -0.15), ft, 0.35)
    place(b, stereo(breath(0.45, True)), 2.85, 0.07)
    place(b, stereo(whoosh(0.9, 300, 3500), 0, 0.6), 3.2, 0.25)
    place(b, gasp(10, 1.2), 3.32, 0.5)
    for k, bt in enumerate((0.6, 1.25, 1.85, 2.4, 2.9)):
        place(b, stereo(heartbeat()), bt, 0.3 + 0.06 * k)
    # lamps whipping past (only while you can still tell them apart)
    for tp, k, life, v in lamp_passes():
        if v < 75:
            la = ((k * 2.39996323) % (2 * math.pi)) - math.pi
            place(b, stereo(lamp_swish(k), math.sin(la) * 0.8), tp - 0.13, 0.12 * life * (0.6 + 0.4 * min(1, v / 30)))
    # the train beneath you
    if EV_T["train"]:
        place(b, stereo(train_pass(), 0, 0.5), EV_T["train"] - 2.9, 0.42)
    # the fossil: a deep, hollow note
    place(b, stereo(bell(midi(38), 3.5) * 0.8 + lp(noise(3.5), 120) * decay(int(3.5 * SR), 0.6) * 0.4, 0, 0.6), EV_T["fossils"], 0.22)
    # the crystal cave
    if EV_T["cave"]:
        place(b, chimes(1.8, 28), EV_T["cave"] - 0.7, 0.55)
        place(b, stereo(whoosh(1.0, 400, 5000), 0.3, 0.8), EV_T["cave"] - 0.4, 0.2)
    # the mine: a clank and a bulb hum at each level
    if EV_T["mine"]:
        for k in range(-2, 3):
            tk = EV_T["mine"] + k * 6.5 / 34.0
            place(b, stereo(whoosh(0.18, 500, 2500), 0.7, 0.4), tk - 0.09, 0.2)
            place(b, stereo(clank(), 0.6, 0.4), tk, 0.05)
    # the lamps die: buzzing, popping
    for tb in (17.55, 17.9, 18.15, 18.45, 18.7):
        place(b, stereo(buzz(RNG.uniform(0.3, 0.6)), RNG.uniform(-0.7, 0.7)), tb, 0.12)
    # the blue band of ringwoodite: a cool glassy shimmer passing through
    place(b, chimes(2.0, 14, 79, 98), 23.7, 0.32)
    place(b, stereo(hp(whoosh(2.2, 1200, 7000), 900), 0, 0.9), 23.6, 0.12)
    # the mantle: a roar that grows, rock cracking, magma
    roar_sec = 34.5 - 18.0
    roar = lp(noise(roar_sec), 160) * 1.3 + bp(noise(roar_sec), 160, 700) * 0.4
    roar *= env_curve([(0, 0), (2, 0.4), (10, 0.75), (15.5, 1.0), (16.5, 0.4)], len(roar))
    place(b, stereo(roar, 0, 0.9), 18.0, 0.4)
    place(b, crackles(16.0, 22), 18.5, 0.35)
    place(b, bloops(4.0, 5), 29.6, 0.45)
    # the outer core: the field's hum, lightning
    hum_sec = 9.5
    tt = t_axis(hum_sec)
    hum = sum(np.sin(2 * np.pi * f * tt + p) / (i + 1) for i, (f, p) in enumerate(((55, 0), (110, 1), (165, 2), (220, 3))))
    hum *= (0.75 + 0.25 * np.sin(2 * np.pi * 0.7 * tt)) * adsr(len(tt), 1.0, 2.0)
    place(b, stereo(hum, 0, 0.7), EV_T["coreIn"], 0.12)
    for tb in BOLTS:
        place(b, stereo(thunder(), RNG.uniform(-0.6, 0.6), 0.6), tb, 0.55)
    # the inner core: a white-hot whine climbing
    wh = sum(np.sin(2 * np.pi * np.cumsum(f * 2 ** (1.5 * t_axis(4.3) / 4.3)) / SR) for f in (880, 1320)) * adsr(int(4.3 * SR), 1.5, 0.05)
    place(b, stereo(wh, 0, 0.8), 43.15, 0.05)
    # far side: the cavern again, the roar receding, the lamps coming back
    if EV_T["farIcb"]:
        place(b, stereo(hum[: int(4 * SR)] * adsr(int(4 * SR), 0.5, 1.0), 0, 0.7), EV_T["farIcb"], 0.1)
    roar2 = lp(noise(9.0), 160) * env_curve([(0, 0.7), (4, 1.0), (9, 0)], int(9 * SR))
    place(b, stereo(roar2, 0, 0.9), 52.0, 0.35)
    place(b, crackles(7.0, 18), 53.0, 0.3)
    # the island: waves, crickets, the fire, a guitar that stops dead, a gasp
    place(b, stereo(waves(12.0), -0.4, 0.9), 62.0, 0.3)
    place(b, crickets(10.0), 64.4, 0.12)
    place(b, fire(9.0), 64.4, 0.18)
    chords = [[55, 59, 62, 67, 71, 79], [48, 55, 60, 64, 67, 72], [50, 57, 62, 66, 69, 74], [52, 59, 64, 67, 71, 76]]
    t = 61.2
    k = 0
    while t < 64.62:
        place(b, stereo(guitar_strum(chords[(k // 2) % 4], 1.2, k % 2 == 0), -0.3, 0.3), t, 0.12 * min(1, (t - 61) / 2))
        t += 0.33 if k % 2 else 0.32
        k += 1
    scrape = bp(noise(0.25), 1500, 6000) * adsr(int(0.25 * SR), 0.005, 0.2)
    place(b, stereo(scrape, -0.3), 64.66, 0.1)
    place(b, gasp(4, 1.0, kid=True), 64.85, 0.55)
    place(b, stereo(whoosh(1.1, 3500, 400), 0, 0.6), 64.3, 0.22)
    return b


def wind():
    """The rush past you: louder and brighter the faster the walls go; nothing at the centre."""
    w = bus()
    x1 = bp(noise(DUR), 120, 3200)
    x2 = bp(noise(DUR), 100, 2600)
    st = np.stack([x1, x2], axis=1)
    out = np.zeros_like(st)
    blk = 1024
    zi = np.zeros((2, 2))
    for i in range(0, N, blk):
        v = speed[min(i, N - 1)]
        fc = 300 + 5200 * min(1, v / 150) ** 0.8
        b_, a_ = signal.butter(2, fc / (SR / 2))
        seg = st[i : i + blk]
        y = np.zeros_like(seg)
        for c in range(2):
            y[:, c], zi[:, c] = signal.lfilter(b_, a_, seg[:, c], zi=zi[:, c])
        out[i : i + blk] = y
    lvl = np.clip(np.sqrt(speed / 150.0), 0, 1.1)
    w[:N] = out * lvl[:, None]
    return w


def ambience():
    a = bus()
    city = bp(noise(5.0), 200, 1400) * env_curve([(0, 1), (3.3, 1), (5.0, 0)], int(5 * SR))
    place(a, stereo(city, 0, 0.9), 0, 0.06)
    return a


def centre_note():
    """The one deep note at the centre, alone in the silence."""
    c = bus()
    place(c, stereo(ga.sub_boom(5.0, 55, 26), 0, 0.2), T_CENTRE - 0.02, 0.9)
    place(c, stereo(bell(midi(50), 5.0) * 0.5, 0, 0.6), T_CENTRE, 0.25)
    return reverb(c, 3.5, 0.4, 5000)[: len(c)]


def duck(x):
    """The moment at the centre: everything falls silent for a breath."""
    g = env_curve([(0, 1), (47.2, 1), (47.45, 0.06), (47.75, 0.06), (48.6, 1), (DUR, 1)], len(x))
    return x * g[:, None]


if __name__ == "__main__":
    mus, drums = score()
    mus = reverb(mus, 3.0, 0.32, 7000)[: len(mus)]
    drums = reverb(drums, 1.3, 0.14, 8000)[: len(drums)]
    world = mus + drums * 0.85
    sfx = reverb(fx(), 1.4, 0.2, 7000)[: len(world)]
    mix = duck(world[:N] + sfx[:N] * 1.0 + wind()[:N] * 0.32 + ambience()[:N])
    mix = mix + centre_note()[:N]
    fade = int(0.8 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    os.makedirs(os.path.join(ROOT, "public", "hole"), exist_ok=True)
    ga.write_mp3(os.path.join(ROOT, "public", "hole", "bed.mp3"), mix, 0.89)
    print("hole bed written", {k: (round(v, 2) if v else None) for k, v in EV_T.items()})
