#!/usr/bin/env python3
"""
Music bed for the Story composition: 100 BPM, original. Each section changes
instrumentation to match its art style, at the scene boundaries read from
src/story/vo.json (so run generate-voiceover.py story first).

  paper      light marimba plucks + shaker
  blueprint  sparse and tense: minor pad, ticking hats
  bauhaus    the lift: kick and bass come in
  riso       full groove: kick, clap, hats, bass
  groovy     70s: add a filtered clav and an organ pad
  end        resolve on C major with a bell, ring out

    python3 scripts/generate-story-audio.py   # writes public/story/music.mp3
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
pad, pluck, bell, kick, clap, hat, sine, noise, saw_voice = (
    ga.pad, ga.pluck, ga.bell, ga.kick, ga.clap, ga.hat, ga.sine, ga.noise, ga.saw_voice,
)

with open(os.path.join(os.path.dirname(HERE), "src", "story", "vo.json")) as f:
    VO = json.load(f)
FPS = VO["fps"]
DUR = VO["duration"] / FPS
SEC = {s["id"]: (s["from"] / FPS, s["to"] / FPS) for s in VO["scenes"]}
BEAT = 0.6  # 100 BPM

MAJOR = [(48, [60, 64, 67, 71]), (45, [57, 60, 64, 67]), (41, [57, 60, 65, 69]), (43, [55, 59, 62, 67])]  # Cmaj7 Am7 Fmaj7 G
MINOR = [(45, [57, 60, 64]), (40, [55, 59, 64])]  # Am, Em
MARIMBA = [72, 76, 79, 76, 74, 72, 67, 69]


def section(t):
    for k, (a, b) in SEC.items():
        if a <= t < b:
            return k
    return "end"


def marimba(f, sec=0.5):
    t = ga.t_axis(sec)
    v = np.sin(2 * np.pi * f * t) * np.exp(-t * 9) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 30)
    return v * adsr(len(t), 0.002, 0.03)


def clav(f, sec=0.18):
    x = saw_voice(f, sec, 4)
    x = bp(x, 600, 2600) * decay(len(x), 0.06)
    return x * adsr(len(x), 0.002, 0.02)


def bass(f, sec):
    t = ga.t_axis(sec)
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t)
    return lp(x, 400) * adsr(len(t), 0.005, 0.06)


def shaker(sec=0.09):
    return hp(noise(sec), 6000) * adsr(int(sec * SR), 0.02, 0.06)


def build():
    n = int((DUR + 3) * SR)
    music = np.zeros((n, 2))
    drums = np.zeros((n, 2))
    beats = int(DUR / BEAT) + 1
    for b in range(beats):
        t = b * BEAT
        sec = section(t)
        bar, beat = divmod(b, 4)
        if sec == "end":
            break
        if sec == "blueprint":
            root, chord = MINOR[bar % 2]
        else:
            root, chord = MAJOR[bar % 4]
        # pads on the bar
        if beat == 0:
            cut = {"paper": 1500, "blueprint": 700, "bauhaus": 1800, "riso": 2400, "groovy": 2000}[sec]
            g = {"paper": 0.07, "blueprint": 0.12, "bauhaus": 0.1, "riso": 0.1, "groovy": 0.08}[sec]
            place(music, pad(chord, BEAT * 4, cut, 0.3, 0.5), t, g)
            if sec == "groovy":  # organ: square-ish stack, slow tremolo
                tt = ga.t_axis(BEAT * 4)
                org = sum(np.sign(np.sin(2 * np.pi * midi(nn) * tt)) * 0.25 for nn in chord)
                org = lp(org, 1800) * (0.8 + 0.2 * np.sin(2 * np.pi * 5.5 * tt)) * adsr(len(tt), 0.05, 0.2)
                place(music, stereo(org, 0, 0.6), t, 0.05)
        # eighth-note layers
        for e in range(2):
            s = t + e * BEAT / 2
            step = b * 2 + e
            if sec == "paper":
                nn = MARIMBA[step % 8] - (0 if bar % 4 < 2 else 3)
                place(music, stereo(marimba(midi(nn)), 0.4 if step % 2 else -0.4), s, 0.2)
                place(drums, stereo(shaker(), 0.3), s, 0.12 if e else 0.07)
            elif sec == "blueprint":
                place(drums, stereo(hat(0.05, 0.01), 0.5), s, 0.1 if e else 0.05)
            else:
                place(drums, stereo(hat(), 0.4 if e else -0.2), s, 0.12 if e else 0.07)
                if sec == "groovy" and step % 4 in (1, 3):
                    place(music, stereo(clav(midi(chord[(step // 2) % len(chord)] + 12)), 0.35), s, 0.16)
        # kick / clap / bass
        if sec in ("bauhaus", "riso", "groovy"):
            place(drums, stereo(kick(0.42, 120, 42, 0.14)), t, 0.6)
            if sec != "bauhaus" and beat in (1, 3):
                place(drums, stereo(clap()), t, 0.3)
            pattern = [0, 0, 7, 0] if sec != "groovy" else [0, 12, 7, 10]
            place(music, stereo(bass(midi(root - 12 + pattern[beat]), BEAT * 0.9)), t, 0.35)
        if sec == "blueprint" and beat == 0:
            place(music, stereo(bass(midi(root - 12), BEAT * 3.5)), t, 0.22)

    # end: resolve
    e0 = SEC["end"][0]
    place(music, pad([48, 60, 64, 67, 72], DUR - e0 + 2.0, 1600, 0.05, 2.0), e0, 0.18)
    place(music, stereo(bass(midi(36), 3.0)), e0, 0.35)
    for k, nn in enumerate([72, 76, 79, 84]):
        place(music, stereo(bell(midi(nn), 3.0), -0.3 + k * 0.2, 0.5), e0 + 0.9 + k * 0.08, 0.05)
    # transition risers into each scene
    for k, (a, _) in SEC.items():
        if a > 0.5:
            r = bp(noise(0.6), 1500, 7000) * np.linspace(0, 1, int(0.6 * SR)) ** 2
            place(music, stereo(r, 0, 0.8), a - 0.6, 0.05)

    mix = reverb(music, 2.0, 0.22, 6000)[:n] + reverb(drums, 0.8, 0.08, 8000)[:n]
    mix = mix[: int(DUR * SR)]
    fade = int(0.5 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return mix


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(HERE), "public", "story", "music.mp3")
    ga.write_mp3(out, build(), 0.89)
    print(out)
