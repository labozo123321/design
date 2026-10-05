#!/usr/bin/env python3
"""
Score and sound effects for the Fight composition, all synthesised.

  0.0 s   bell, taiko hits and a riser
  2.0 s   drum and bass at 172 BPM, reese bass, minor stabs
  11.5 s  the low point: drums out, filtered drone, sub pulses
  15.3 s  comeback: drums back, bright supersaw progression
  18.5 s  K.O.: hard stop on a boom
  20.0 s  silence (the reality cut)
  23.1 s  a cute major-key jingle for the end card

    python3 scripts/generate-fight-audio.py   # writes public/fight/music.mp3 and public/fight/sfx/*.mp3
"""

import importlib.util
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ga", os.path.join(HERE, "generate-audio.py"))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)

SR, midi = ga.SR, ga.midi
lp, hp, bp, adsr, decay, stereo, reverb, place, sat = ga.lp, ga.hp, ga.bp, ga.adsr, ga.decay, ga.stereo, ga.reverb, ga.place, ga.sat
pad, pluck, bell, kick, clap, hat, sine, noise, saw_voice, t_axis, sub_boom = (
    ga.pad, ga.pluck, ga.bell, ga.kick, ga.clap, ga.hat, ga.sine, ga.noise, ga.saw_voice, ga.t_axis, ga.sub_boom,
)
ROOT = os.path.dirname(HERE)
FPS = 30
DUR = 820 / FPS


def F(frame):
    return frame / FPS


# ------------------------------------------------------------------ sfx


def whoosh(sec=0.22, lo=500, hi=4000):
    n = int(sec * SR)
    x = ga.sweep(noise(sec), lo, hi, "band", 0.7)
    return x * np.sin(np.linspace(0, np.pi, n)) ** 1.5


def punch(bright=1.0):
    sec = 0.28
    n = int(sec * SR)
    body = kick(sec, 220, 70, 0.05) * 0.9
    crack = hp(noise(sec), 1800 * bright) * decay(n, 0.012)
    return sat(body + crack * 0.9, 2.0)


def heavy():
    sec = 1.2
    n = int(sec * SR)
    p = np.zeros(n)
    p[: int(0.28 * SR)] += punch(1.3)
    p += lp(sub_boom(sec, 90, 34), 400) * 0.9
    p += bp(noise(sec), 300, 3000) * decay(n, 0.08) * 0.7
    return sat(p, 1.6)


def clash():
    sec = 0.9
    t = t_axis(sec)
    ring = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, d in [(820, 5), (1310, 7), (2270, 9), (3390, 12)])
    return ring * 0.35 + np.pad(punch(1.5), (0, len(t) - int(0.28 * SR)))


def crash():
    sec = 1.0
    n = int(sec * SR)
    thud = kick(sec, 110, 40, 0.16) * 1.0
    rubble = lp(noise(sec), 1800) * decay(n, 0.25) * 0.6
    return sat(thud + rubble, 1.5)


def fireball(sec=1.0):
    n = int(sec * SR)
    roar = lp(noise(sec), 900) * (0.7 + 0.3 * np.sin(np.linspace(0, 60, n)))
    return (roar * 0.8 + whoosh(sec, 200, 2500) * 0.6) * adsr(n, 0.05, 0.3)


def shatter():
    sec = 0.9
    n = int(sec * SR)
    t = t_axis(sec)
    x = hp(noise(sec), 3000) * decay(n, 0.12)
    rng = np.random.default_rng(3)
    for k in range(18):
        st = int(rng.uniform(0, 0.35) * SR)
        f = rng.uniform(2500, 7000)
        seg = np.sin(2 * np.pi * f * t[: n - st]) * np.exp(-t[: n - st] * 25)
        x[st:] += seg * 0.25
    return x + np.pad(punch(1.2), (0, n - int(0.28 * SR))) * 0.6


def charge(sec=1.8):
    n = int(sec * SR)
    f = np.linspace(120, 900, n) ** 1.0
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) * 0.4 + np.sin(ph * 1.5) * 0.2
    return (tone + ga.sweep(noise(sec), 300, 6000, "band", 0.5) * 0.5) * np.linspace(0.1, 1, n) ** 2


def heartbeat():
    sec = 0.7
    n = int(sec * SR)
    a = lp(kick(0.3, 80, 38, 0.09), 200)
    x = np.zeros(n)
    x[: len(a)] += a
    st = int(0.22 * SR)
    x[st : st + len(a)] += a[: n - st] * 0.7
    return x


def scratch():
    sec = 0.55
    n = int(sec * SR)
    t = t_axis(sec)
    pos = np.concatenate([np.linspace(0, 1, n // 3) ** 0.6, np.linspace(1, -0.4, n - n // 3)])
    f = 300 + 1600 * np.abs(np.gradient(pos)) * SR / 40
    ph = 2 * np.pi * np.cumsum(np.clip(f, 50, 4000)) / SR
    x = bp(noise(sec), 400, 3000) * 0.6 + np.sign(np.sin(ph)) * 0.25
    return x * adsr(n, 0.005, 0.08)


def fight_bell():
    return bell(midi(84), 2.0) * 0.8 + np.pad(bell(midi(91), 1.6), (0, int(0.4 * SR))) * 0.3


def ko_boom():
    sec = 3.5
    n = int(sec * SR)
    x = lp(sub_boom(sec, 70, 28), 300) * 1.2
    x[: int(1.2 * SR)] += heavy()[: int(1.2 * SR)] * 0.8
    return sat(x, 1.3)


SFX = {
    "whoosh": lambda: whoosh(),
    "whoosh-long": lambda: whoosh(0.45, 300, 5000),
    "punch-a": lambda: punch(1.0),
    "punch-b": lambda: punch(1.6),
    "heavy": heavy,
    "clash": clash,
    "crash": crash,
    "fireball": fireball,
    "shatter": shatter,
    "charge": charge,
    "heartbeat": heartbeat,
    "scratch": scratch,
    "bell": fight_bell,
    "ko-boom": ko_boom,
}

# ------------------------------------------------------------------ score

BEAT = 60 / 172
DM = [(38, [62, 65, 69]), (34, [62, 65, 70]), (36, [64, 67, 72]), (33, [61, 64, 69])]  # Dm Bb C A


def reese(f, sec):
    l = saw_voice(f, sec, 18)
    r = saw_voice(f, sec, 23)
    st = np.stack([lp(l, 420), lp(r, 420)], axis=1)
    return sat(st, 1.6) * adsr(len(st), 0.01, 0.05)[:, None]


def supersaw(notes, sec, cutoff=4200):
    return pad(notes, sec, cutoff, 0.02, 0.25)


def build_score():
    n = int((DUR + 2) * SR)
    mus = np.zeros((n, 2))
    drm = np.zeros((n, 2))
    # intro: taiko + riser
    for k, f in enumerate([4, 16, 28, 36, 44]):
        place(drm, stereo(kick(0.6, 90, 45, 0.25)), F(f), 0.7)
    r = ga.sweep(noise(1.4), 200, 8000, "band", 0.4) * np.linspace(0, 1, int(1.4 * SR)) ** 2
    place(mus, stereo(r, 0, 0.8), F(60) - 1.4, 0.25)

    def drums(t0, t1, energy=1.0):
        b = 0
        t = t0
        while t < t1:
            bar_pos = b % 8  # eighths in a 2-beat half bar... a classic two-step over 8 eighths
            if bar_pos in (0, 5):
                place(drm, stereo(kick(0.35, 150, 48, 0.1)), t, 0.75)
            if bar_pos in (2, 6):
                place(drm, stereo(clap() * 0.8 + hp(noise(0.3), 900) * decay(int(0.3 * SR), 0.05) * 0.6), t, 0.55 * energy)
            place(drm, stereo(hat(0.05, 0.01), 0.3 if b % 2 else -0.3), t, 0.16)
            place(drm, stereo(hat(0.05, 0.01), -0.2), t + BEAT / 4, 0.1 * energy)
            t += BEAT / 2
            b += 1

    def bassline(t0, t1, prog):
        bar = 0
        t = t0
        while t < t1:
            root, chord = prog[bar % len(prog)]
            sec = min(BEAT * 4, t1 - t)
            place(mus, reese(midi(root), sec), t, 0.32)
            # offbeat stabs
            for q in (1.5, 3.5):
                if t + q * BEAT < t1:
                    place(mus, supersaw(chord, 0.18, 2600), t + q * BEAT, 0.16)
            t += BEAT * 4
            bar += 1

    drums(F(60), F(345))
    bassline(F(60), F(345), DM)
    # low point: drone + sub pulses
    place(mus, pad([50, 57, 62, 65], F(460) - F(345), 500, 1.0, 1.0), F(345), 0.22)
    for f in range(350, 460, 26):
        place(mus, stereo(lp(sine(37, 0.6) * decay(int(0.6 * SR), 0.2), 120)), F(f), 0.35)
    # comeback
    place(mus, stereo(charge(F(460) - F(420)), 0, 0.6), F(420), 0.18)
    drums(F(462), F(556), 1.25)
    t = F(462)
    k = 0
    while t < F(556):
        root, chord = DM[k % 4]
        sec = min(BEAT * 4, F(556) - t)
        place(mus, supersaw([c + 12 for c in chord] + chord, sec, 5200), t, 0.2)
        place(mus, reese(midi(root), sec), t, 0.3)
        t += BEAT * 4
        k += 1
    # end jingle (F major, 120 BPM)
    e0 = F(692)
    jb = 0.25
    melody = [72, 77, 81, 79, 77, 81, 84, 0, 82, 81, 79, 77, 76, 77, 0, 0]
    for i, m in enumerate(melody):
        if m:
            place(mus, stereo(pluck(midi(m), 0.4, 1.4), 0.2), e0 + 0.15 + i * jb, 0.22)
    for i, (root, chord) in enumerate([(41, [65, 69, 72]), (46, [65, 70, 74]), (48, [64, 67, 72]), (41, [65, 69, 72])]):
        place(mus, pad(chord, 1.0 if i < 3 else 2.4, 1800, 0.02, 0.4), e0 + 0.15 + i * 1.0, 0.13)
        place(mus, stereo(pluck(midi(root), 0.6, 0.7)), e0 + 0.15 + i * 1.0, 0.35)
        place(drm, stereo(kick(0.3, 120, 50, 0.08)), e0 + 0.15 + i * 1.0, 0.35)
        place(drm, stereo(clap()), e0 + 0.65 + i * 1.0, 0.18)
    place(mus, stereo(bell(midi(84), 2.4), 0, 0.5), e0 + 3.15, 0.1)

    mix = reverb(mus, 1.8, 0.2, 7000)[:n] + reverb(drm, 0.7, 0.08, 9000)[:n]
    # hard stop on the K.O., silence through the reality cut
    ko = int(F(556) * SR)
    fade = int(0.04 * SR)
    mix[ko : ko + fade] *= np.linspace(1, 0, fade)[:, None]
    mix[ko + fade : int(F(692) * SR)] = 0
    return mix[: int(DUR * SR)]


if __name__ == "__main__":
    for name, fn in SFX.items():
        x = fn()
        st = x if x.ndim == 2 else stereo(x)
        ga.write_mp3(os.path.join(ROOT, "public", "fight", "sfx", f"{name}.mp3"), st, 0.9)
    ga.write_mp3(os.path.join(ROOT, "public", "fight", "music.mp3"), build_score(), 0.89)
    print("fight audio written")
