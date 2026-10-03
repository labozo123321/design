#!/usr/bin/env python3
"""
Original upbeat track + arcade/comic/paper SFX for the Promo composition.
120 BPM (one beat = 15 frames), C major, I–V–vi–IV. Chiptune intro, pop drop.

    python3 scripts/generate-promo-audio.py   # writes public/promo/music.mp3 + public/promo/sfx/*.mp3
"""

import importlib.util
import os

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ga", os.path.join(HERE, "generate-audio.py"))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)

SR, at, midi = ga.SR, ga.at, ga.midi
lp, hp, bp, sweep, adsr, decay, sat, norm = ga.lp, ga.hp, ga.bp, ga.sweep, ga.adsr, ga.decay, ga.sat, ga.norm
stereo, reverb, place, t_axis, noise = ga.stereo, ga.reverb, ga.place, ga.t_axis, ga.noise
kick, clap, hat, pluck, bell, saw_voice, pad = ga.kick, ga.clap, ga.hat, ga.pluck, ga.bell, ga.saw_voice, ga.pad
OUT = os.path.join(os.path.dirname(HERE), "public", "promo")

DUR = 30.0
BEAT = 0.5
RNG = np.random.default_rng(12)


# ------------------------------------------------------------ chip voices


def square(f, sec, duty=0.5, vib=0.0):
    t = t_axis(sec)
    ph = f * t + (vib * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.15, 0, 1) / (2 * np.pi))
    return np.where((ph % 1.0) < duty, 1.0, -1.0)


def tri(f, sec):
    t = t_axis(sec)
    return 2 * np.abs(2 * ((f * t) % 1.0) - 1) - 1


def chip_note(f, sec, duty=0.25, vol=1.0):
    return lp(square(f, sec, duty, 0.6), 7000) * adsr(int(sec * SR), 0.003, min(0.05, sec / 3)) * vol


def chip_noise(sec, tau=0.03, bright=7000):
    return hp(ga.crush(noise(sec), 4, 6), bright * 0.4) * decay(int(sec * SR), tau)


# ------------------------------------------------------------- arrangement

CHORDS = [  # C | G | Am | F
    (48, [60, 64, 67, 72]),
    (43, [59, 62, 67, 71]),
    (45, [60, 64, 69, 72]),
    (41, [60, 65, 69, 72]),
]
# hook: eighth notes per bar (None = rest), one line per chord
HOOK = [
    [76, None, 79, 76, 84, None, 79, None],
    [74, None, 79, 74, 83, None, 79, None],
    [72, None, 76, 72, 81, None, 76, None],
    [72, None, 77, 81, 84, None, 81, 79],
]


def build_music():
    n = int(DUR * SR)
    bus = np.zeros((n, 2))
    bars = int(DUR / (BEAT * 4))

    for bar in range(bars):
        t0 = bar * BEAT * 4
        root, chord = CHORDS[bar % 4]
        section = "chip" if t0 < 5 else "drop" if t0 < 13 else "groove" if t0 < 19 else "boss" if t0 < 24 else "chorus"
        last_bar = bar == bars - 1

        # ---- drums
        for b in range(4):
            s = t0 + b * BEAT
            if section == "chip":
                place(bus, stereo(chip_noise(0.12, 0.02, 3000) * 0.9), s, 0.35 if b % 2 else 0.5)
                for e in (0.25,):
                    place(bus, stereo(chip_noise(0.05, 0.01)), s + e, 0.25)
                if b in (0, 2):
                    place(bus, stereo(kick(0.3, 120, 50, 0.08)), s, 0.55)
            else:
                if not (last_bar and b > 1):
                    place(bus, stereo(kick()), s, 0.85)
                if b in (1, 3):
                    place(bus, stereo(clap(), 0.05), s, 0.5)
                    if section != "groove":
                        place(bus, stereo(chip_noise(0.15, 0.05, 2500)), s, 0.25)
                for q in range(4):
                    place(bus, stereo(hat(), 0.3 if q % 2 else -0.3), s + q * 0.125, 0.12 if q % 2 else 0.2)
                if section == "boss" and b == 3:
                    for q in range(4):
                        place(bus, stereo(clap(0.1)), s + q * 0.125, 0.18 + q * 0.05)

        # ---- bass
        for e in range(8):
            s = t0 + e * BEAT / 2
            f = midi(root + (12 if e % 2 else 0))
            if section == "chip":
                place(bus, stereo(tri(f, 0.22) * adsr(int(0.22 * SR), 0.003, 0.05)), s, 0.4)
            else:
                tone = 0.8 * np.sin(2 * np.pi * f / 2 * t_axis(0.22)) + 0.5 * lp(saw_voice(f, 0.22, 3), 900)
                place(bus, stereo(tone * adsr(int(0.22 * SR), 0.003, 0.06)), s, 0.42)

        # ---- chords
        if section in ("drop", "chorus"):
            for b in (0, 1.5, 2, 3.5):  # syncopated stabs
                st = pad(chord, 0.32, 3200, 0.005, 0.15)
                place(bus, st, t0 + b * BEAT, 0.2)
        elif section == "groove":
            for e in range(8):
                nn = chord[e % 4] + 12
                place(bus, stereo(pluck(midi(nn), 0.35) * 0.6, 0.4 if e % 2 else -0.4), t0 + e * BEAT / 2, 0.22)
        elif section == "boss":
            for q in range(16):  # driving 16th chip arp
                nn = chord[q % 4] + (12 if q % 8 >= 4 else 0)
                place(bus, stereo(chip_note(midi(nn), 0.11, 0.125, 0.5), 0.3 if q % 2 else -0.3), t0 + q * BEAT / 4, 0.3)

        # ---- lead hook
        if section in ("chip", "drop", "chorus") and not last_bar:
            for e, nn in enumerate(HOOK[bar % 4]):
                if nn is None:
                    continue
                dur = 0.24 if HOOK[bar % 4][(e + 1) % 8] is not None else 0.45
                tone = chip_note(midi(nn), dur, 0.25, 1.0)
                if section != "chip":
                    tone = tone * 0.7 + pluck(midi(nn), dur, 1.2)[: len(tone)] * 0.6
                place(bus, stereo(tone, 0, 0.3), t0 + e * BEAT / 2, 0.24 if section == "chip" else 0.2)

    # riser into the drop (4.0–5.0) and into the chorus (23.0–24.0)
    for start in (4.0, 23.0):
        r = sweep(noise(1.0), 300, 9000, "band", 0.7) * np.linspace(0, 1, SR) ** 2
        place(bus, stereo(r, 0, 1), start, 0.22)
        for k in range(8):
            place(bus, stereo(chip_note(midi(60 + k * 2), 0.11, 0.5, 0.6)), start + 0.5 + k * 0.0625, 0.2)

    # ending: final stab on beat 1 of the last bar, then a level-complete jingle
    end = (bars - 1) * BEAT * 4
    place(bus, pad([48, 55, 60, 64, 67, 72], 1.6, 4000, 0.005, 1.2), end, 0.35)
    place(bus, stereo(kick(0.8, 160, 40, 0.3)), end, 0.9)
    for k, nn in enumerate([72, 76, 79, 84, 88]):
        place(bus, stereo(chip_note(midi(nn), 0.16 if k < 4 else 0.7, 0.25, 0.9)), end + 0.55 + k * 0.12, 0.3)

    bus = reverb(bus, 1.6, 0.14)[:n]
    fade = np.ones(n)
    fo = int(0.4 * SR)
    fade[-fo:] = np.linspace(1, 0, fo)
    return sat(norm(bus * fade[:, None], 0.95), 1.15) * 0.9


# ---------------------------------------------------------------------- sfx


def build_sfx():
    L = {}
    seq = lambda notes, step, duty=0.25: np.concatenate(  # noqa: E731
        [chip_note(midi(nn), step, duty) for nn in notes]
    )
    L["start"] = stereo(seq([72, 79, 84], 0.07) * 0.9)
    L["coin"] = stereo(np.concatenate([chip_note(midi(83), 0.06, 0.5), chip_note(midi(88), 0.32, 0.5)]))
    t = t_axis(0.22)
    jf = 300 * 2 ** (t / 0.22 * 1.6)
    L["jump"] = stereo(np.where((np.cumsum(jf) / SR) % 1 < 0.5, 1.0, -1.0) * adsr(len(t), 0.003, 0.08) * 0.7)
    L["unlock"] = reverb(stereo(seq([72, 76, 79, 84, 79, 84, 88], 0.07)), 0.8, 0.2)
    L["pixel-sweep"] = stereo(ga.crush(sweep(noise(0.45), 6000, 300, "band", 0.8), 4, 12) * np.linspace(1, 0.2, int(0.45 * SR)))
    sw = sweep(noise(0.45), 400, 3000, "band", 0.9)
    L["whoosh"] = reverb(stereo(sw * np.sin(np.pi * np.linspace(0, 1, len(sw))) ** 2, 0, 0.8), 0.8, 0.2)
    L["pop"] = reverb(stereo(pluck(midi(84), 0.25, 0.8) + kick(0.25, 900, 300, 0.03) * 0.3), 0.6, 0.2)
    for k, nn in enumerate([76, 79, 84]):
        cart = pluck(midi(nn), 0.3, 0.7) + np.sin(2 * np.pi * np.cumsum(500 + 900 * t_axis(0.3)) / SR) * decay(int(0.3 * SR), 0.05) * 0.3
        L[f"bubble-{k + 1}"] = reverb(stereo(cart, (-0.3, 0.3, 0)[k]), 0.6, 0.2)
    punch = kick(0.5, 200, 55, 0.12) + bp(noise(0.5), 500, 4000) * decay(int(0.5 * SR), 0.04) * 0.9
    L["punch"] = reverb(stereo(sat(punch, 2.5)), 1.0, 0.25)
    clear = np.concatenate([seq([79, 84, 88], 0.08), chip_note(midi(91), 0.6, 0.25)])
    L["clear"] = reverb(stereo(clear * 0.8 + np.pad(bell(midi(91), 0.5), (0, max(0, len(clear) - int(0.5 * SR))))[: len(clear)] * 0.3), 1.0, 0.25)
    paper = sweep(noise(0.35), 1200, 6000, "band", 1.0) * np.sin(np.pi * np.linspace(0, 1, int(0.35 * SR)))
    L["paper"] = stereo(paper * 0.8, 0.2)
    slap = bp(noise(0.15), 800, 5000) * decay(int(0.15 * SR), 0.018) + kick(0.15, 180, 80, 0.03) * 0.5
    L["slap"] = reverb(stereo(slap), 0.6, 0.18)
    mk = np.zeros(int(0.5 * SR))
    for k in range(5):
        seg = bp(noise(0.08), 2500 + k * 400, 6000 + k * 400) * np.sin(np.pi * np.linspace(0, 1, int(0.08 * SR)))
        i = int(k * 0.09 * SR)
        mk[i : i + len(seg)] += seg
    L["marker"] = stereo(mk * 0.8, 0.1)
    peel = sweep(noise(0.12), 3000, 8000, "band", 0.6) * np.linspace(1, 0, int(0.12 * SR))
    L["sticker"] = reverb(stereo(np.concatenate([peel * 0.5, slap])), 0.5, 0.15)
    L["boss"] = reverb(stereo(np.concatenate([chip_note(midi(nn), 0.12, 0.5) for nn in (48, 47, 46, 45)]) * 0.8), 0.8, 0.2)
    th = sweep(noise(0.25), 500, 2500, "band", 0.8) * np.sin(np.pi * np.linspace(0, 1, int(0.25 * SR)))
    L["throw"] = stereo(th)
    t = t_axis(0.18)
    L["hit"] = stereo(np.where((np.cumsum(900 * 2 ** (-t / 0.05)) / SR) % 1 < 0.5, 1.0, -1.0) * decay(len(t), 0.06) * 0.8 + chip_noise(0.18, 0.05) * 0.5)
    L["tap"] = stereo(bp(noise(0.05), 2500, 6000) * decay(int(0.05 * SR), 0.006) + np.sin(2 * np.pi * 900 * t_axis(0.05)) * decay(int(0.05 * SR), 0.01) * 0.4)
    L["powerup"] = reverb(stereo(seq([60, 64, 67, 72, 64, 67, 72, 76, 67, 72, 76, 79], 0.045, 0.5) * 0.8), 0.6, 0.2)
    L["poof"] = reverb(stereo(ga.crush(lp(noise(0.5), 3000), 5, 8) * decay(int(0.5 * SR), 0.12)), 0.8, 0.25)
    vic = np.concatenate([seq([72, 72, 72], 0.1), chip_note(midi(76), 0.2), seq([79, 84], 0.1), chip_note(midi(88), 0.7)])
    L["victory"] = reverb(stereo(vic * 0.85), 1.0, 0.25)
    pop = bp(noise(0.08), 500, 6000) * decay(int(0.08 * SR), 0.01) * 1.2
    crackle = np.zeros(int(1.0 * SR))
    for _ in range(40):
        i = int(RNG.uniform(0.05, 0.9) * SR)
        c = hp(noise(0.01), 4000) * RNG.uniform(0.2, 0.7)
        crackle[i : i + len(c)] += c[: len(crackle) - i]
    conf = crackle.copy()
    conf[: len(pop)] += pop
    conf += kick(1.0, 200, 60, 0.06) * 0.4
    L["confetti"] = reverb(stereo(conf, 0, 0.8), 1.2, 0.3)
    land = kick(0.25, 160, 60, 0.05) * 0.8
    land[: int(0.12 * SR)] += chip_noise(0.12, 0.03, 2000) * 0.4
    L["land"] = reverb(stereo(land), 0.5, 0.15)
    return L


if __name__ == "__main__":
    ga.write_mp3(os.path.join(OUT, "music.mp3"), build_music(), 0.9)
    print("promo/music.mp3")
    for name, st in build_sfx().items():
        ga.write_mp3(os.path.join(OUT, "sfx", f"{name}.mp3"), st, 0.85)
        print(f"promo/sfx/{name}.mp3")
