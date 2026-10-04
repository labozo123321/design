#!/usr/bin/env python3
"""
Original music bed for the Explainer composition: warm, uplifting house at
120 BPM (one beat = 15 frames), Fmaj7 · G · Em7 · Am. Filtered intro, drop on
step 01 (4.0 s), lighter verse for step 03, final chord at 26 s.

    python3 scripts/generate-explainer-audio.py   # writes public/explainer/music.mp3
"""

import importlib.util
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ga", os.path.join(HERE, "generate-audio.py"))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)

SR, midi = ga.SR, ga.midi
lp, sweep, adsr, sat, norm, stereo, reverb, place = ga.lp, ga.sweep, ga.adsr, ga.sat, ga.norm, ga.stereo, ga.reverb, ga.place
kick, clap, hat, pluck, pad, saw_voice, bell, noise, t_axis = ga.kick, ga.clap, ga.hat, ga.pluck, ga.pad, ga.saw_voice, ga.bell, ga.noise, ga.t_axis

DUR = 30.0
BEAT = 0.5
CHORDS = [  # root, voicing
    (41, [57, 60, 64, 67]),  # Fmaj7
    (43, [55, 59, 62, 67]),  # G
    (40, [55, 59, 62, 64]),  # Em7
    (45, [57, 60, 64, 69]),  # Am
]
TOP = [[72, 76, 79, 76], [74, 79, 83, 79], [71, 74, 79, 74], [72, 76, 81, 76]]


def build():
    n = int(DUR * SR)
    music = np.zeros((n, 2))
    drums = np.zeros((n, 2))
    bars = int(DUR / (BEAT * 4))
    for bar in range(bars):
        t0 = bar * BEAT * 4
        root, chord = CHORDS[bar % 4]
        intro = t0 < 4.0
        verse = 15.0 <= t0 < 21.0
        ending = t0 >= 26.0
        if ending:
            break
        cutoff = 900 + 2600 * (t0 / 4.0) if intro else (2400 if verse else 3600)
        music[int(t0 * SR) : int(t0 * SR) + int(2.0 * SR)] += pad(chord, 2.0, cutoff, 0.02 if not intro else 0.6, 0.3)[: n - int(t0 * SR)] * 0.18
        # offbeat chord plucks + 16th arp from the top line
        for q in range(16):
            s = t0 + q * BEAT / 4
            nn = TOP[bar % 4][q % 4] + (12 if (q // 4) % 2 and not verse else 0)
            place(music, stereo(pluck(midi(nn), 0.35, 0.9) * 0.6, 0.45 if q % 2 else -0.45), s, 0.12 if intro else 0.16)
        if not intro:
            for b in range(4):
                s = t0 + b * BEAT
                place(drums, stereo(kick(0.45, 130, 44, 0.15)), s, 0.8)
                if b in (1, 3):
                    place(drums, stereo(clap()), s, 0.42)
                for q in range(4):
                    place(drums, stereo(hat(0.06, 0.012), 0.35 if q % 2 else -0.35), s + q * 0.125, 0.16 if q == 2 else 0.08)
                f = midi(root)
                bl = 0.22
                bass = 0.9 * np.sin(2 * np.pi * f * t_axis(bl)) + 0.35 * lp(saw_voice(f * 2, bl, 3), 800)
                place(music, stereo(bass * adsr(int(bl * SR), 0.004, 0.08)), s + 0.25, 0.42)
        else:
            for b in range(4):
                place(drums, stereo(hat(0.06, 0.012)), t0 + b * BEAT + 0.25, 0.06)

    # side-chain pump on everything melodic
    pump = np.ones(n)
    for b in range(int(4.0 / BEAT), int(26.0 / BEAT)):
        i = int(b * BEAT * SR)
        m = int(0.24 * SR)
        pump[i : i + m] = np.minimum(pump[i : i + m], 0.4 + 0.6 * np.linspace(0, 1, m) ** 0.6)
    music *= pump[:, None]

    # riser into the drop + a lift into step 04
    for start, ln in ((2.5, 1.5), (20.0, 1.0)):
        r = sweep(noise(ln), 300, 9000, "band", 0.7) * np.linspace(0, 1, int(ln * SR)) ** 2
        place(music, stereo(r, 0, 1), start, 0.16)

    # end: big open chord + bells, ring out
    end = 26.0
    place(music, pad([41, 53, 57, 60, 64, 67, 72], 4.0, 4200, 0.01, 2.8), end, 0.3)
    place(drums, stereo(kick(0.9, 150, 38, 0.35)), end, 0.9)
    for k, nn in enumerate([84, 88, 91, 96]):
        place(music, stereo(bell(midi(nn), 2.5) * 0.25, -0.45 + k * 0.3), end + 0.25 + k * 0.25)

    bus = reverb(music + drums, 1.8, 0.16)[:n]
    fo = int(0.5 * SR)
    bus[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return sat(norm(bus, 0.95), 1.15) * 0.9


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(HERE), "public", "explainer", "music.mp3")
    ga.write_mp3(out, build(), 0.9)
    print(out)
