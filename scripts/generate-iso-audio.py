#!/usr/bin/env python3
"""
Soundtrack for the Iso composition (18 s), cued from src/iso/cues.json:
low ambient hum, a soft stone click per placement, a chime per milestone,
a synth pad that builds through the city, and a resolved chord at the pull-back.
Calm and premium: D major, no drums.

    python3 scripts/generate-iso-audio.py   # writes public/iso/soundtrack.mp3
"""

import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ga", os.path.join(HERE, "generate-audio.py"))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)

SR, midi = ga.SR, ga.midi
lp, hp, bp, adsr, decay, stereo, reverb, place = ga.lp, ga.hp, ga.bp, ga.adsr, ga.decay, ga.stereo, ga.reverb, ga.place
pad, bell, pluck, noise, sine, t_axis, sub_boom = ga.pad, ga.bell, ga.pluck, ga.noise, ga.sine, ga.t_axis, ga.sub_boom

with open(os.path.join(os.path.dirname(HERE), "src", "iso", "cues.json")) as f:
    C = json.load(f)
FPS = C["fps"]
DUR = C["duration"] / FPS


def at(frame):
    return frame / FPS


def click(sec=0.12, pitch=1900, body=0.6):
    """Stone settling into place: a dry tick with a short woody knock."""
    n = int(sec * SR)
    tick = hp(noise(sec), 2500) * decay(n, 0.004)
    knock = sine(pitch, sec) * decay(n, 0.018) * body + sine(pitch * 0.37, sec) * decay(n, 0.03) * body * 0.8
    return (tick * 0.5 + knock) * adsr(n, 0.0005, 0.02)


def thunk(sec=0.35):
    """Heavier placement for tower pads and track segments."""
    n = int(sec * SR)
    return lp(sine(95, sec) * decay(n, 0.06) + bp(noise(sec), 200, 900) * decay(n, 0.02) * 0.6, 1200)


def shimmer(sec, f0):
    t = t_axis(sec)
    v = sum(np.sin(2 * np.pi * f0 * m * t + m) * (0.6 / m) for m in (1, 1.5, 2, 3))
    return v * adsr(len(t), sec * 0.45, sec * 0.5, 1.4)


def build():
    n = int(DUR * SR) + int(2.5 * SR)
    amb = np.zeros((n, 2))
    music = np.zeros((n, 2))
    fx = np.zeros((n, 2))

    # ambient room hum: 55 Hz drone + air, full length
    hum = sine(55, DUR) * 0.5 + sine(110, DUR) * 0.18 + lp(noise(DUR), 320) * 0.5
    hum = hum * adsr(len(hum), 0.6, 1.2)
    place(amb, stereo(hum, 0, 0.4), 0, 0.22)
    # distant city air (wider, brighter) grows with the world
    air = bp(noise(DUR), 400, 2400) * np.linspace(0.15, 1.0, int(DUR * SR))
    place(amb, stereo(air, 0, 0.9), 0, 0.05)

    # laptop wakes: gold shimmer swell
    place(music, stereo(shimmer(2.6, midi(74)), 0.1, 0.5), at(C["laptopOn"] - 6), 0.12)
    # soft bed under the walk: Dmaj9 then Bm11, quiet
    place(music, pad([50, 57, 61, 64, 66], 6.2, 900, 2.0, 1.8), at(C["line"][0]), 0.11)
    place(music, pad([47, 54, 57, 62, 64], 4.4, 1000, 1.6, 1.8), at(C["line"][0]) + 5.6, 0.1)

    # one click per stone, alternating pans, rising pitch along the path
    for i, f in enumerate(C["stones"]):
        place(fx, stereo(click(pitch=1500 + i * 45), 0.35 if i % 2 else -0.35), at(f) + 0.05, 0.42)

    # milestone chimes, ascending: studio, store, mailbox, monument
    notes = [74, 78, 81, 86]
    for k, key in enumerate(["studio", "store", "mailbox"]):
        place(music, stereo(bell(midi(notes[k]), 2.6), [-0.3, 0.3, 0.1][k], 0.6), at(C[key][1]), 0.2)
    # handoff paper + envelope flutter
    place(fx, stereo(hp(noise(0.25), 3000) * adsr(int(0.25 * SR), 0.05, 0.15) , 0.4), at(C["handoff"][0] + 8), 0.06)

    # city builds: a thunk per tower, ticks for track segments, lamps chain
    towers_t0, towers_t1 = C["towers"]
    for i in range(15):
        f = round(towers_t0 + ((towers_t1 - towers_t0 - 30) * i) / 15)
        place(fx, stereo(thunk(), np.sin(i * 1.7) * 0.5), at(f), 0.22)
    tr0, tr1 = C["track"]
    for i in range(12):
        place(fx, stereo(click(0.08, 2600, 0.4), 0.5), at(tr0 + (tr1 - tr0) * i / 12), 0.18)
    la0, la1 = C["lamps"]
    for k in range(7):
        f = la0 + (la1 - la0) * k / 7
        place(music, stereo(pluck(midi([62, 66, 69, 74, 78, 81, 86][k]), 0.9, 1.4), -0.5 + k / 6), at(f), 0.07)

    # building pad: Gmaj9 → A sus, cutoff rising, through the city
    b0 = at(C["towers"][0])
    place(music, pad([43, 55, 59, 62, 66, 69], 2.8, 700, 1.2, 0.6), b0, 0.2)
    place(music, pad([45, 57, 62, 64, 69, 71], 1.4, 1400, 0.4, 0.5), b0 + 2.6, 0.22)
    # monument filling: gentle rising shimmer
    m0, m1 = C["monument"]
    place(music, stereo(shimmer(at(m1 - m0) + 0.6, midi(81)), 0, 0.6), at(m0), 0.08)
    place(music, stereo(bell(midi(notes[3]), 3.2), 0, 0.6), at(m1), 0.18)

    # resolution at the pull-back: D major, warm, long tail into the logo
    r = at(C["pullback"][0])
    place(music, pad([38, 50, 57, 62, 66, 69], DUR - r + 1.5, 1300, 0.25, 2.6), r, 0.28)
    place(music, stereo(lp(sub_boom(3.0, 62, 37), 300), 0), r, 0.25)
    for k, nn in enumerate([62, 66, 69, 74]):
        place(music, stereo(bell(midi(nn), 3.4), -0.3 + k * 0.2, 0.5), r + 0.06 * k, 0.09)
    # logo: one soft high bell
    place(music, stereo(bell(midi(86), 2.6), 0, 0.6), at(C["text"]["title"][0] + 4), 0.07)

    mix = amb + reverb(music, 3.2, 0.38, 5200) [: n] + reverb(fx, 1.2, 0.18, 7000)[: n]
    mix = mix[: int(DUR * SR)]
    # short fade at the very end
    fade = int(0.35 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return mix


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(HERE), "public", "iso", "soundtrack.mp3")
    ga.write_mp3(out, build(), 0.89)
    print(out)
