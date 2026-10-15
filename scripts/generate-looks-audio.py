#!/usr/bin/env python3
"""
Sound for the Looks composition ("POV: you're the school photographer in the looksmaxing era"): all
synthesised, timed from src/looks/timeline.json (every cue in video seconds and world seconds; per frame the
world time, the edit amount, the photo holds). No voice.

  the gym      a big room: its tone and HVAC hum, kids chattering down the far end (no words), sneakers
               squeaking, a ball dribbled somewhere, a coach's whistle once
  the bed      "picture day": a cheesy stock-music ukulele, glockenspiel, shaker and claps (C major, 112 bpm).
               It tape-stops into every sigma edit and picks up again where it stopped once the photo's done
  each kid     footsteps in (the height-maxer's lift shoes clunk), the stool's creak and gas hiss, the lens
               zooming, the focus beeps; the tape stop, then the edit: a drift-phonk drop (an 808 that's all
               distortion, the cowbell riff, hats, claps, a dark pad) until the FLASH cuts it dead: the strobe's
               pop, the shutter, the flash whining as it recharges; then each photo's own sting:
                 the mewer      a jaw-click, a sad muted trombone
                 hunter eyes    silence, one cricket
                 the gum        a wet squelch, the gum snapping
                 glass skin     the glare's glint
                 the normal kid no edit at all: a warm "ding", the bed carries on
                 the height kid the wobble wobbles the music; the fall: the stool clattering, a thud, castors
                                rolling; up again: a slide whistle and a glockenspiel "ta-da"
                 the mogger     his friend's leaf blower (slowed down with the world in the edit), the
                                sunglasses' whoosh, the blower sputtering out on the flip, hair flopping
                 the photographer the tripod clip, the whip round, the gym's hush, the biggest drop of all,
                                the leaf blower roaring into his comb-over, the flash, a record scratch
  the yearbook the page, each photo landing, and the theme's last phrase, warm, to the end

    python3 scripts/generate-looks-audio.py   # writes public/looks/bed.mp3 (and out/looks/bed.wav)
"""

import importlib.util
import json
import math
import os

import numpy as np
from scipy import signal
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ga", os.path.join(HERE, "generate-audio.py"))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)

SR, midi = ga.SR, ga.midi
lp, hp, bp, adsr, decay, stereo, reverb, sat = ga.lp, ga.hp, ga.bp, ga.adsr, ga.decay, ga.stereo, ga.reverb, ga.sat
noise, t_axis, clap, hat = ga.noise, ga.t_axis, ga.clap, ga.hat
ROOT = os.path.dirname(HERE)
with open(os.path.join(ROOT, "src", "looks", "timeline.json")) as f:
    TL = json.load(f)
FPS = TL["fps"]
C = TL["cues"]
CW = TL["cuesW"]
FR = TL["frames"]
EDITS = TL["edits"]
HOLDS = TL["holds"]
BPM = TL["bpm"]
EDIT_SPEED = TL["editSpeed"]
NF = len(FR)
DUR = NF / FPS
N = int(DUR * SR)
PAD = SR * 6
RNG = np.random.default_rng(2026)
KIDS = ["mewer", "hunter", "gum", "glass", "normal", "height", "mogger"]


def bus():
    return np.zeros((N + PAD, 2))


def place(b, st, sec, gain=1.0):
    if st.ndim == 1:
        st = stereo(st)
    i = int(round(sec * SR))
    if i >= len(b) or i + len(st) <= 0:
        return
    s0 = max(0, -i)
    i = max(0, i)
    j = min(len(b), i + len(st) - s0)
    b[i:j] += st[s0 : s0 + (j - i)] * gain


def add(*xs):
    """Sum mono signals of different lengths (padded with silence)."""
    n = max(len(x) for x in xs)
    out = np.zeros(n)
    for x in xs:
        out[: len(x)] += x
    return out


def smooth(a, b, x):
    k = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def vfilter(x, fc, kind="low", block=256):
    out = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        f = float(np.clip(fc[min(i, len(fc) - 1)], 30, SR / 2 - 500))
        sos = signal.butter(2, f / (SR / 2), kind, output="sos")
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        out[i : i + block], zi = signal.sosfilt(sos, x[i : i + block], zi=zi)
    return out


# ===================================================================== world time <-> video time

T_FR = np.arange(NF) / FPS
W_FR = np.array([fr["w"] for fr in FR])
EDIT_FR = np.array([fr["edit"] for fr in FR])


def v_of_w(w):
    """The video time at which world time w happens (the first moment, if it's held)."""
    i = int(np.searchsorted(W_FR, w, side="left"))
    if i <= 0:
        return 0.0
    if i >= NF:
        return T_FR[-1]
    w0, w1 = W_FR[i - 1], W_FR[i]
    k = 0 if w1 <= w0 else (w - w0) / (w1 - w0)
    return T_FR[i - 1] + k / FPS


def speed_at(v):
    """How fast the world runs at video time v (1 normal, 0.38 in an edit, 0 in a hold)."""
    i = int(np.clip(v * FPS, 0, NF - 2))
    return (W_FR[i + 1] - W_FR[i]) * FPS


def edit_at(v):
    return float(np.interp(v * FPS, np.arange(NF), EDIT_FR))


# ===================================================================== instruments

def pluck(f, sec=0.6, bright=1.0, body=1.0):
    t = t_axis(sec)
    v = sum((1 / k) * np.sin(2 * np.pi * k * f * t) * np.exp(-t * (5 + k * 3.2 / bright)) for k in range(1, 8))
    v += body * 0.25 * np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t * 9)
    return v * adsr(len(t), 0.0015, 0.04)


def uke_strum(notes, sec, down=True, gain=1.0):
    """Four nylon strings brushed 14 ms apart (down: low to high)."""
    order = notes if down else notes[::-1]
    out = np.zeros(int((sec + 0.1) * SR))
    for k, n in enumerate(order):
        p = pluck(midi(n), sec, 1.4, 0.6) * (0.8 + 0.2 * (k == 0))
        i = int(k * 0.014 * SR)
        out[i : i + len(p)] += p[: len(out) - i]
    return out * gain / len(notes)


def glock(f, sec=1.4):
    return ga.bell(f, sec) * 0.6


def shaker(sec=0.09):
    n = noise(sec)
    return hp(n, 5000) * adsr(len(n), 0.02, 0.05, 1.5) * 0.4


def soft_bass(f, sec):
    t = t_axis(sec)
    v = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) * np.exp(-t * 6)
    return v * np.exp(-t * 2.2) * adsr(len(t), 0.004, 0.05)


def kick808(sec=0.55, f0=170, f1=46, drive=3.2):
    t = t_axis(sec)
    f = f1 + (f0 - f1) * np.exp(-t / 0.04)
    v = np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(len(t), 0.32)
    click = hp(noise(sec), 2500) * decay(len(t), 0.003) * 0.4
    return sat(v * 1.2 + click, drive) * adsr(len(t), 0.001, 0.05)


def cowbell(f, sec=0.2):
    """The 808 cowbell, played as a melody: two square waves a fifth-ish apart, band-passed, short."""
    t = t_axis(sec)
    v = signal.square(2 * np.pi * f * t) * 0.6 + signal.square(2 * np.pi * f * 1.48 * t) * 0.4
    v = bp(v, f * 0.8, f * 4.5)
    return sat(v * 1.3, 1.6) * (0.65 * np.exp(-t / 0.018) + 0.35 * np.exp(-t / 0.12)) * adsr(len(t), 0.001, 0.02)


def bass808(f, sec, glide_to=None):
    t = t_axis(sec)
    ff = np.full(len(t), f) if glide_to is None else f + (glide_to - f) * smooth(sec * 0.55, sec * 0.85, t)
    v = np.sin(2 * np.pi * np.cumsum(ff) / SR)
    return sat(v * 1.6, 2.2) * adsr(len(t), 0.005, 0.06)


def snare(sec=0.25, tone=190):
    n = noise(sec)
    body = np.sin(2 * np.pi * tone * t_axis(sec)) * decay(int(sec * SR), 0.05)
    return bp(n, 1500, 9000) * decay(int(sec * SR), 0.08) + body * 0.5


def crash(sec=2.5):
    n = noise(sec)
    return hp(n, 3000) * decay(len(n), 0.8) * 0.5 + bp(n, 5000, 12000) * decay(len(n), 1.3) * 0.25


def whoosh(sec, f0=300, f1=2500, gain=1.0, pan=0.0):
    tt = t_axis(sec)
    n = RNG.standard_normal(len(tt))
    fc = f0 * (f1 / f0) ** smooth(0, 1, tt / sec)
    w = vfilter(vfilter(n, fc * 1.6, "low"), fc * 0.5, "high") * np.sin(np.pi * tt / sec) ** 1.5
    return stereo(w, pan, 0.4) * gain


def thump(f0=110, f1=55, sec=0.14, gain=1.0):
    dl = int(sec * SR)
    v = np.sin(2 * np.pi * np.cumsum(np.linspace(f0, f1, dl)) / SR) * decay(dl, sec / 3.5) + lp(RNG.standard_normal(dl), 300) * decay(dl, 0.02) * 0.5
    return v * gain


def click(sec=0.012, lo=1500, hi=9000, gain=1.0):
    n = noise(sec)
    return bp(n, lo, hi) * decay(len(n), sec / 4) * gain


def squelch(sec, seed, pitch=1.0):
    r = np.random.default_rng(seed)
    t = t_axis(sec)
    f = (220 + 400 * r.uniform() * np.exp(-t * 8)) * pitch
    v = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.4 * np.sin(2 * np.pi * r.uniform(15, 35) * pitch * t))) / SR) * 0.4
    v += vfilter(r.standard_normal(len(t)), (1500 * np.exp(-t * 6) + 300) * pitch, "low") * 0.8
    return v * adsr(len(t), 0.01, sec * 0.6)


# ===================================================================== the bed: "picture day"

BED_BPM = 112
BEAT = 60 / BED_BPM
# C, G, Am, F; the glockenspiel's tune over it
PROG = [(48, [60, 64, 67, 72]), (43, [59, 62, 67, 71]), (45, [60, 64, 69, 72]), (41, [60, 65, 69, 72])]
TUNE = [
    (0, 76, 1), (1, 79, 1), (2, 84, 1.5), (3.5, 83, 0.5),
    (4, 81, 1), (5, 79, 1), (6, 74, 2),
    (8, 76, 1), (9, 77, 1), (10, 81, 1.5), (11.5, 79, 0.5),
    (12, 77, 1), (13, 76, 1), (14, 72, 2),
]


def bed_track(sec):
    """The theme, looped for as long as it's needed (the playhead pauses through the edits)."""
    b = np.zeros((int((sec + 3) * SR), 2))
    bars = int(sec / (4 * BEAT)) + 1
    for bar in range(bars):
        t0 = bar * 4 * BEAT
        bass, ch = PROG[bar % 4]
        # the island strum: down, down-up, up-down-up
        for off, down, g in ((0, True, 1.0), (1, True, 0.8), (1.5, False, 0.6), (2.5, False, 0.6), (3, True, 0.8), (3.5, False, 0.6)):
            place(b, stereo(uke_strum(ch, 0.55, down, g), 0.15, 0.3) * 0.55, t0 + off * BEAT)
        place(b, stereo(soft_bass(midi(bass), 1.6 * BEAT)) * 0.5, t0)
        place(b, stereo(soft_bass(midi(bass + 7), 1.0 * BEAT)) * 0.35, t0 + 2.5 * BEAT)
        for k in range(8):
            place(b, stereo(shaker(), 0.4) * (0.5 if k % 2 else 0.8), t0 + k * BEAT / 2)
        for k in (1, 3):
            place(b, stereo(clap(), -0.1, 0.4) * 0.22, t0 + k * BEAT)
        # the tune: every other 4-bar phrase, so it breathes
        if (bar // 4) % 2 == 0:
            ph = (bar % 4) * 4
            for (beat, n, ln) in TUNE:
                if ph <= beat < ph + 4:
                    place(b, stereo(glock(midi(n), max(0.6, ln * BEAT + 0.5)), -0.2) * 0.32, t0 + (beat - ph) * BEAT)
    return reverb(b, 1.4, 0.18, 6000)[: len(b)]


def bed_playhead():
    """For each sample of the video, where the bed's tape is: it runs, tape-stops into each edit, sits still
    through the edit and the photo, and runs on again when the kid gets up."""
    t = np.arange(N) / SR
    rate = np.ones(N)
    for k in KIDS + ["photog"]:
        e0 = C.get(f"{k}.edit0")
        if e0 is None:
            continue
        resume = C["yearbook"] if k == "photog" else C[f"{k}.up"] + 0.1
        stop0 = e0 - 0.42
        # the tape stop: 1 -> 0 over 0.38 s
        rate = np.where((t >= stop0) & (t < e0 - 0.04), 1 - smooth(stop0, e0 - 0.04, t), rate)
        rate = np.where((t >= e0 - 0.04) & (t < resume), 0.0, rate)
        # back up to speed in a blink
        rate = np.where((t >= resume) & (t < resume + 0.12), smooth(resume, resume + 0.12, t), rate)
    return np.cumsum(rate) / SR, rate


def bed():
    track = bed_track(DUR + 2)
    ph, rate = bed_playhead()
    idx = ph * SR
    out = np.stack([np.interp(idx, np.arange(len(track)), track[:, c]) for c in range(2)], axis=1)
    t = np.arange(N) / SR
    # silent while the tape's stopped (no hum of a stopped tape); in from the top after the power-on
    g = smooth(0.35, 0.9, t) * np.clip(rate * 4, 0, 1)
    # the yearbook has its own ending
    g *= 1 - smooth(C["yearbook"] - 0.02, C["yearbook"], t)
    b = bus()
    b[:N] = out * g[:, None]
    return b


def ending():
    """The yearbook: the theme once more, fuller, to a last chord on the final zoom."""
    b = bus()
    t0 = C["yearbook"] + 0.25
    beat = 60 / 112
    bars = [(48, [60, 64, 67, 72]), (43, [59, 62, 67, 71]), (45, [60, 64, 69, 72]), (41, [60, 65, 69, 72]), (48, [60, 64, 67, 72]), (43, [59, 62, 67, 71])]
    for i, (bass, ch) in enumerate(bars):
        tb = t0 + i * 4 * beat
        if tb > DUR - 1.5:
            break
        for off, down, g in ((0, True, 1.0), (1, True, 0.8), (1.5, False, 0.6), (2.5, False, 0.6), (3, True, 0.8), (3.5, False, 0.6)):
            place(b, stereo(uke_strum(ch, 0.55, down, g), 0.15, 0.3) * 0.6, tb + off * beat)
        place(b, stereo(soft_bass(midi(bass), 1.6 * beat)) * 0.55, tb)
        for k in range(8):
            place(b, stereo(shaker(), 0.4) * (0.5 if k % 2 else 0.8), tb + k * beat / 2)
        for k in (1, 3):
            place(b, stereo(clap(), -0.1, 0.4) * 0.25, tb + k * beat)
        for (bt, n, ln) in TUNE:
            ph = (i % 4) * 4
            if ph <= bt < ph + 4:
                place(b, stereo(glock(midi(n), max(0.6, ln * beat + 0.5)), -0.2) * 0.34, tb + (bt - ph) * beat)
    # the last chord, on the zoom into the photographer's photo, ringing out
    tl = C["yearbook"] + 6.9
    for n in (48, 60, 64, 67, 72, 76):
        place(b, stereo(pluck(midi(n), 2.2, 1.2, 0.8), 0.1, 0.3) * 0.16, tl + 0.012 * (n % 7))
    for k, n in enumerate((84, 88, 91, 96)):
        place(b, stereo(glock(midi(n), 2.0), 0.25) * 0.14, tl + 0.12 + k * 0.08)
    place(b, stereo(soft_bass(midi(36), 2.5)) * 0.5, tl)
    out = reverb(b, 1.8, 0.22, 6000)[: len(b)]
    t = np.arange(len(out)) / SR
    out *= (1 - smooth(DUR - 0.8, DUR - 0.05, t))[:, None]
    return out


# ===================================================================== the phonk in each edit

RIFFS = {
    # F# minor: the cowbell's 16ths over two bars (None: rest)
    "a": [66, None, 69, 66, 73, None, 71, 69, 66, None, 69, 71, 73, 71, 69, 68],
    "b": [66, 66, None, 73, 71, None, 69, None, 66, 69, 71, None, 74, 73, 71, 69],
    "c": [73, None, 71, 73, 69, None, 66, 69, 73, None, 76, 74, 73, 71, 69, 66],
}
BASSLINE = [42, 42, 38, 40]  # F#, F#, D, E (a bar each)


def phonk(e0, e1, riff="a", big=False, warble=None):
    """From the drop at e0 to the flash at e1 (video seconds), cut dead at e1."""
    b = bus()
    step = 60 / BPM / 4
    n_steps = int((e1 - e0) / step) + 1
    notes = RIFFS[riff]
    # the drop: a reversed cymbal into it, the impact on it
    rc = crash(1.0)[::-1] * np.linspace(0.2, 1, int(1.0 * SR))
    place(b, stereo(rc, 0, 0.5) * (0.5 if big else 0.35), e0 - 1.0)
    place(b, stereo(ga.sub_boom(2.5, 75, 30)) * (1.3 if big else 0.95), e0)
    place(b, stereo(kick808(0.7, 200, 44, 4.0)) * 0.9, e0)
    for s in range(n_steps):
        t = e0 + s * step
        if t >= e1:
            break
        pos = s % 16
        bar = s // 16
        if pos in (0, 3, 8, 11) and s > 0:
            place(b, stereo(kick808()) * 0.75, t)
        if pos in (4, 12):
            place(b, stereo(clap(), 0, 0.5) * 0.5, t)
            place(b, stereo(snare(), 0, 0.3) * 0.18, t)
        hat_g = 0.13 if pos % 2 == 0 else 0.08
        place(b, stereo(hat(), 0.35) * hat_g, t)
        if pos in (14, 15):
            # the 32nd-note roll at the end of the bar
            place(b, stereo(hat(0.05, 0.012), 0.35) * 0.08, t + step / 2)
        n = notes[pos]
        if n is not None:
            place(b, stereo(cowbell(midi(n), 0.22), -0.25, 0.3) * 0.34, t)
        if pos == 0:
            bn = BASSLINE[bar % 4]
            nxt = BASSLINE[(bar + 1) % 4]
            place(b, stereo(bass808(midi(bn), 16 * step, midi(nxt) if nxt != bn else None)) * 0.55, t)
    # a dark pad under it
    sec = e1 - e0
    pad = ga.pad([54, 57, 61], sec + 0.2, 900, 0.3, 0.1) * 0.12
    place(b, pad, e0)
    out = reverb(b, 1.6, 0.15, 5000)[: len(b)]
    # the height-maxer's wobble: the whole edit warbles (a tape on a wobbly deck)
    if warble is not None:
        t = np.arange(len(out)) / SR
        k = smooth(warble, warble + 0.1, t)
        lfo = 0.012 * np.sin(2 * np.pi * 6.5 * t) * k
        idx = np.arange(len(out)) + np.cumsum(lfo) * SR / 6.5
        out = np.stack([np.interp(idx, np.arange(len(out)), out[:, c]) for c in range(2)], axis=1)
    # cut dead at the flash
    t = np.arange(len(out)) / SR
    out *= (1 - smooth(e1 - 0.006, e1, t))[:, None]
    return out


# ===================================================================== the gym

def gym():
    """The room: tone and hum, far-off chatter, squeaks, a ball, the whistle. Ducked in the edits (we're in
    his head) and gone for the yearbook."""
    b = bus()
    sec = DUR
    tt = t_axis(sec)
    tone = lp(RNG.standard_normal(len(tt)), 180) * 0.35 + np.sin(2 * np.pi * 60 * tt) * 0.012 + np.sin(2 * np.pi * 120 * tt) * 0.006
    b[: len(tt)] += stereo(tone, 0, 0.6)
    # chatter: bands of noise with a syllable rhythm, far away (lots of room)
    ch = np.zeros(len(tt))
    for k in range(6):
        syl = np.clip(0.4 + 2.2 * lp(RNG.standard_normal(len(tt)), 5) * 6, 0, 1.3)
        ch += bp(RNG.standard_normal(len(tt)), 300 + 160 * k, 1000 + 300 * k) * syl
    ch = lp(ch, 2600) * 0.05
    b[: len(tt)] += reverb(stereo(ch, 0.2, 0.8), 2.4, 0.6, 3500)[: len(tt)]
    # sneakers squeaking now and then, a ball dribbled down the other end
    t = 0.8
    while t < sec - 1:
        dl = 0.07 + 0.06 * RNG.uniform()
        f0 = RNG.uniform(1800, 3200)
        sq = np.sin(2 * np.pi * np.cumsum(np.linspace(f0, f0 * RNG.uniform(1.1, 1.4), int(dl * SR))) / SR) * adsr(int(dl * SR), 0.01, 0.03)
        place(b, reverb(stereo(sq * 0.03, RNG.uniform(-0.8, 0.8)), 1.8, 0.6, 4000), t)
        t += RNG.uniform(1.5, 4.5)
    t = 1.5
    while t < sec - 2:
        for k in range(RNG.integers(3, 7)):
            place(b, reverb(stereo(thump(140, 70, 0.12, 0.05), -0.6), 2.2, 0.7, 2500), t + k * 0.42)
        t += RNG.uniform(6, 11)
    # a coach's whistle, far off, once
    tw = 13.4
    wh = np.sin(2 * np.pi * np.cumsum(2900 * (1 + 0.03 * np.sin(2 * np.pi * 38 * t_axis(0.45)))) / SR) * adsr(int(0.45 * SR), 0.01, 0.08)
    place(b, reverb(stereo(wh * 0.02, -0.7), 2.4, 0.7, 5000), tw)
    out = b
    t = np.arange(len(out)) / SR
    ed = np.array([edit_at(v) for v in np.arange(0, DUR + 6, 1 / FPS)])
    edk = np.interp(t * FPS, np.arange(len(ed)), ed)
    g = smooth(0.2, 0.8, t) * (1 - 0.85 * edk) * (1 - smooth(C["yearbook"] - 0.3, C["yearbook"] + 0.3, t))
    return out * g[:, None]


# ===================================================================== the camera and the set

def af_beep(t0):
    b = bus()
    for k in range(2):
        tt = t_axis(0.045)
        bep = np.sin(2 * np.pi * 2730 * tt) * adsr(len(tt), 0.002, 0.01)
        place(b, stereo(bep * 0.13, 0.1), t0 + k * 0.075)
    return b


def lens_zoom(t0, sec):
    tt = t_axis(sec)
    f = 520 * (1 + 0.25 * np.sin(np.pi * tt / sec))
    v = signal.square(2 * np.pi * np.cumsum(f) / SR, 0.3) * 0.2 + bp(RNG.standard_normal(len(tt)), 1500, 5000) * 0.35
    v = bp(v, 400, 6000) * adsr(len(tt), 0.03, 0.05)
    b = bus()
    place(b, stereo(v * 0.05, 0.1), t0)
    return b


def flash_pop(t0, big=1.0):
    """The strobes firing and the shutter: a crack, a thump, the mirror and the curtain; then the flash's
    capacitor whining back up."""
    b = bus()
    place(b, stereo(click(0.008, 2000, 14000, 1.0)) * 0.55 * big, t0)
    place(b, stereo(thump(90, 45, 0.18, 0.7)) * big, t0)
    place(b, stereo(hp(noise(0.06), 3000) * decay(int(0.06 * SR), 0.012)) * 0.3, t0)
    # the shutter: ka-chak
    place(b, stereo(click(0.01, 900, 7000, 1.0) + 0, 0.05) * 0.4, t0 + 0.004)
    place(b, stereo(click(0.012, 700, 6000, 1.0), 0.05) * 0.32, t0 + 0.062)
    place(b, stereo(thump(300, 200, 0.03, 0.25), 0.05), t0 + 0.062)
    # recharge whine
    sec = 1.5
    tt = t_axis(sec)
    f = 1800 + 7400 * (tt / sec) ** 0.7
    wn = np.sin(2 * np.pi * np.cumsum(f) / SR) * adsr(len(tt), 0.15, 0.25) * 0.012
    place(b, stereo(wn, 0.2), t0 + 0.25)
    return b


def paper_flick(t0, gain=1.0):
    b = bus()
    place(b, whoosh(0.22, 1200, 5000, 0.07 * gain, 0.2), t0)
    place(b, stereo(click(0.01, 2000, 8000, 0.3 * gain)), t0 + 0.2)
    return b


def stool_sit(t0, gain=1.0):
    b = bus()
    tt = t_axis(0.35)
    creak = bp(RNG.standard_normal(len(tt)) * (1 + np.sin(2 * np.pi * 37 * tt)), 600, 1400) * adsr(len(tt), 0.04, 0.12) * 0.25
    place(b, stereo(creak, 0.05) * gain, t0)
    place(b, stereo(thump(120, 70, 0.1, 0.4)) * gain, t0)
    hiss = hp(RNG.standard_normal(int(0.4 * SR)), 3000) * adsr(int(0.4 * SR), 0.05, 0.2) * 0.04
    place(b, stereo(hiss, 0.05) * gain, t0 + 0.08)
    return b


def footsteps(times, heavy=False, pitch=1.0, pan=-0.2):
    b = bus()
    for k, t in enumerate(times):
        if heavy:
            st = add(thump(150 * pitch, 60 * pitch, 0.16, 0.65), click(0.02, 400, 3000, 0.3))
        else:
            st = thump(220 * pitch, 110 * pitch, 0.07, 0.3)
            if k % 3 == 1:
                dl = int(0.06 * SR)
                f0 = RNG.uniform(1900, 2800) * pitch
                st = np.concatenate([st, np.zeros(max(0, dl - len(st)))])
                st[:dl] += np.sin(2 * np.pi * np.cumsum(np.linspace(f0, f0 * 1.25, dl)) / SR) * adsr(dl, 0.01, 0.02) * 0.08
        place(b, reverb(stereo(st, pan), 1.2, 0.25, 4000), t)
    return b


def walk_steps(kid, start_w, end_w, k=1.0, lift=False, cadence=None):
    """Footfalls (in video seconds) for a walk between two world times."""
    cad = cadence or (1.55 / (0.6 * k))
    out = []
    w = start_w + 0.1
    while w < end_w:
        out.append(v_of_w(w))
        w += 1 / cad
    return out


def sad_trombone(t0):
    """Wah, wah, wah, waaah: a muted brass descending."""
    b = bus()
    notes = [(58, 0.32), (57, 0.32), (56, 0.32), (55, 1.1)]
    t = t0
    for n, d in notes:
        tt = t_axis(d)
        vib = 1 + (0.012 * np.sin(2 * np.pi * 5.5 * tt) * smooth(0.25, 0.5, tt) if d > 0.5 else 0)
        f = midi(n) * vib
        v = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * 0.6 + signal.square(2 * np.pi * np.cumsum(f) / SR, 0.4) * 0.3
        # the mute: a wah filter opening and closing
        fc = 500 + 1300 * np.sin(np.pi * np.clip(tt / min(d, 0.4), 0, 1)) ** 2
        v = vfilter(v, fc, "low") * adsr(len(tt), 0.03, 0.08)
        place(b, stereo(sat(v, 1.3) * 0.22, 0.15), t)
        t += d
    return reverb(b, 1.2, 0.2, 4000)[: len(b)]


def cricket(t0):
    b = bus()
    for k in range(3):
        dl = int(0.025 * SR)
        ch = np.sin(2 * np.pi * 4300 * t_axis(0.025)) * np.sin(np.pi * np.linspace(0, 1, dl)) * (0.6 + 0.4 * np.sin(2 * np.pi * 150 * t_axis(0.025)))
        place(b, stereo(ch, 0.55) * 0.05, t0 + k * 0.045)
    return b


def glint(t0):
    b = bus()
    for k, f in enumerate((2637, 3951, 5274)):
        place(b, stereo(ga.bell(f, 1.2) * 0.12, 0.3), t0 + k * 0.035)
    place(b, whoosh(0.35, 3000, 9000, 0.05, 0.2), t0 - 0.05)
    return b


def ding(t0, gain=1.0):
    b = bus()
    for k, n in enumerate((84, 88, 91)):
        place(b, stereo(glock(midi(n), 1.5) * 0.28 * gain, 0.15), t0 + k * 0.05)
    return b


def slide_whistle(t0, sec=0.42, up=True):
    tt = t_axis(sec)
    f = (650 * (1800 / 650) ** smooth(0, 1, tt / sec)) if up else (1800 * (650 / 1800) ** smooth(0, 1, tt / sec))
    v = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.008 * np.sin(2 * np.pi * 6 * tt))) / SR) + 0.08 * hp(RNG.standard_normal(len(tt)), 3000)
    b = bus()
    place(b, stereo(v * adsr(len(tt), 0.03, 0.05) * 0.12, 0.1), t0)
    return b


def ta_da(t0):
    b = bus()
    for k, n in enumerate((72, 76, 79)):
        place(b, stereo(glock(midi(n), 0.8) * 0.3, 0.1), t0 + k * 0.08)
    for n in (72, 76, 79, 84):
        place(b, stereo(glock(midi(n), 1.6) * 0.18, 0.1), t0 + 0.3)
    return b


def stool_crash(t0):
    """The stool going over: clanks, the castors, the kid landing."""
    b = bus()
    for k in range(9):
        f = RNG.uniform(300, 1600)
        tt = t_axis(0.5)
        cl = sum(a * np.sin(2 * np.pi * f * m * tt) * np.exp(-tt * (9 + 6 * m)) for m, a in ((1, 1.0), (2.7, 0.5), (5.1, 0.25)))
        place(b, stereo(cl * 0.14, RNG.uniform(-0.4, 0.4)), t0 + 0.04 + k * RNG.uniform(0.03, 0.09) + (0.18 if k > 4 else 0))
    place(b, stereo(thump(90, 40, 0.3, 1.1)), t0 + 0.16)
    place(b, stereo(lp(noise(0.25), 500) * decay(int(0.25 * SR), 0.06) * 0.5), t0 + 0.16)
    # the castors rolling away
    tt = t_axis(1.2)
    roll = bp(RNG.standard_normal(len(tt)), 200, 900) * (0.5 + 0.5 * np.sin(2 * np.pi * 19 * tt)) * np.exp(-tt * 1.8) * 0.08
    place(b, stereo(roll, 0.3), t0 + 0.45)
    return reverb(b, 1.4, 0.3, 5000)[: len(b)]


def blower(t_on, t_off, slow_world=True, rev=1.0, gain=1.0, pan=-0.35, dying=False):
    """A two-stroke leaf blower: the engine's buzz and the air's roar, at the world's speed (slowed down
    in an edit), from t_on to t_off (video seconds); dying: it sputters out at the end."""
    sec = t_off - t_on + 0.5
    n = int(sec * SR)
    t = np.arange(n) / SR + t_on
    sp = np.array([speed_at(v) for v in np.arange(t_on, t_off + 0.6, 1 / FPS)])[: int(sec * FPS) + 2]
    spd = np.interp((t - t_on) * FPS, np.arange(len(sp)), sp) if slow_world else np.ones(n)
    spd = np.clip(spd, 0.25, 1.0)
    rpm = (105 + 25 * rev) * spd
    if dying:
        k = smooth(t_off - 0.35, t_off, t)
        rpm *= 1 - 0.6 * k
    ph = 2 * np.pi * np.cumsum(rpm) / SR
    eng = signal.sawtooth(ph) * 0.5 + signal.square(ph * 2, 0.3) * 0.25
    eng = lp(eng, 2200)
    air = vfilter(RNG.standard_normal(n), 900 + 2600 * spd, "low") * 0.7
    v = eng * 0.6 + air * (0.5 + 0.5 * rev)
    env = adsr(n, 0.25, 0.08)
    if dying:
        # sputters: the engine catching and missing, then gone
        k = smooth(t_off - 0.4, t_off, t)
        gate = 1 - k * (0.5 + 0.5 * signal.square(2 * np.pi * 7 * (t - t_off), 0.5))
        env *= gate * (1 - smooth(t_off - 0.02, t_off + 0.08, t))
    b = bus()
    place(b, stereo(sat(v * env, 1.4) * 0.16 * gain, pan, 0.3), t_on)
    return b


def chews(t0_w, t1_w, flash_w):
    """The gum: a squelch on every bite (1.9 a second in world time), deep and slow in the edit."""
    b = bus()
    w = t0_w
    k = 0
    while w < t1_w:
        v = v_of_w(w)
        sp = max(0.3, speed_at(v))
        if w < flash_w - 0.02:
            place(b, stereo(squelch(0.16 / sp, 900 + k, sp) * 0.18, 0.05), v)
        w += 1 / 1.9
        k += 1
    return b


def record_scratch(t0):
    tt = t_axis(0.4)
    f = 1.0 + 1.6 * np.sin(2 * np.pi * 2.6 * tt) * np.exp(-tt * 4)
    v = bp(RNG.standard_normal(len(tt)), 300, 3500) * (0.5 + 0.5 * np.abs(f)) * adsr(len(tt), 0.005, 0.1)
    b = bus()
    place(b, stereo(v * 0.2, 0), t0)
    return b


# ===================================================================== the scenes

def kids():
    b = bus()
    for k in KIDS:
        kk = {"mewer": 0.97, "hunter": 0.98, "gum": 1.0, "glass": 0.96, "normal": 0.9, "height": 0.86, "mogger": 1.06}[k]
        heavy = k == "height"
        # in: steps from the line to the stool; out: steps away
        b += footsteps(walk_steps(k, CW[f"{k}.in"], CW[f"{k}.sit"] - 0.35, kk), heavy, 0.9 if heavy else 1.0, -0.3)
        out_start = CW[f"{k}.up"] + 0.32
        b += footsteps(walk_steps(k, out_start, out_start + 1.4, kk), heavy, 0.9 if heavy else 1.0, 0.3)
        b += stool_sit(C[f"{k}.sit"] - 0.05, 0.9)
        b += stool_sit(C[f"{k}.up"] + 0.05, 0.5)
        b += lens_zoom(C[f"{k}.sit"] + 0.05, max(0.25, C[f"{k}.focus"] - C[f"{k}.sit"] - 0.05))
        b += af_beep(C[f"{k}.focus"])
        b += lens_zoom(C[f"{k}.up"] + 0.05, 0.4)
        b += flash_pop(C[f"{k}.flash"])
        b += paper_flick(C[f"{k}.flash"] + 0.12, 0.8)
    return b


def stings():
    b = bus()
    # the mewer: his jaw clicks into place at the flash; the trombone
    place(b, stereo(click(0.006, 2500, 9000, 0.6) + 0), C["mewer.flash"] - 0.03)
    b += sad_trombone(C["mewer.flash"] + 0.35)
    # hunter eyes: nothing; then one cricket
    b += cricket(C["hunter.flash"] + 0.55)
    b += cricket(C["hunter.flash"] + 1.0)
    # the gum: the squelch and the snap
    place(b, stereo(squelch(0.3, 77, 0.8) * 0.3), C["gum.flash"] + 0.3)
    place(b, stereo(click(0.012, 1500, 6000, 0.7)), C["gum.flash"] + 0.62)
    # glass skin: the glint as he turns into the light, and the glare at the flash
    b += glint(C["glass.pose"] + 0.25)
    b += glint(C["glass.flash"] + 0.02)
    # the normal kid: a warm ding with the photo
    b += ding(C["normal.flash"] + 0.25)
    # the height-maxer: up on the stool (slow-mo creak), the fall, the pop up
    place(b, stereo(squelch(0.5, 12, 0.5) * 0.1), C["height.stand"] + 0.2)
    b += stool_crash(C["height.fall"] + 0.05)
    b += slide_whistle(C["height.popUp"] - 0.05, 0.4, True)
    b += ta_da(C["height.popUp"] + 0.35)
    # the mogger: the sunglasses come off (a slow whoosh), the flip's flop
    place(b, whoosh(0.9, 400, 3000, 0.12, 0.1), C["mogger.glasses"] - 0.2)
    place(b, whoosh(0.5, 300, 1500, 0.1, 0.0), C["mogger.flip"] + 0.05)
    return b


def mogger_blower():
    b = bus()
    t_on = C["mogger.in"] - 0.3
    t_off = C["mogger.flip"] + 0.25
    b += blower(t_on, t_off, True, 0.8, 1.0, -0.4, dying=True)
    return b


def photographer():
    b = bus()
    # the tripod's quick-release, the camera lifted
    place(b, stereo(click(0.012, 1200, 6000, 0.6)), C["photog.lift"] + 0.02)
    place(b, stereo(click(0.01, 800, 4000, 0.4)), C["photog.lift"] + 0.09)
    # the whip round
    place(b, whoosh(0.85, 250, 2400, 0.22, 0.0), C["photog.turn0"])
    # the focus finds his face
    b += af_beep(C["photog.turn1"] + 0.25)
    # the friend's leaf blower, roaring into his comb-over
    b += blower(C["photog.blow"] - 0.15, C["photog.flash"] + 0.05, True, 1.4, 1.5, 0.3)
    b += flash_pop(C["photog.flash"], 1.2)
    b += record_scratch(C["photog.flash"] + 0.08)
    b += paper_flick(C["photog.flash"] + 0.12, 0.8)
    return b


def yearbook_sfx():
    b = bus()
    t0 = C["yearbook"]
    place(b, whoosh(0.6, 400, 4000, 0.2, 0.3), t0 - 0.05)
    for i in range(9):
        ti = t0 + 0.6 + i * 0.3
        place(b, stereo(thump(260, 160, 0.05, 0.22) + 0, (i % 3 - 1) * 0.3), ti + 0.05)
        place(b, stereo(click(0.008, 1500, 7000, 0.12), (i % 3 - 1) * 0.3), ti + 0.04)
    return b


def music():
    m = bus()
    m += bed() * 1.3
    for k in KIDS + ["photog"]:
        e0 = C.get(f"{k}.edit0")
        if e0 is None:
            continue
        riff = {"mewer": "a", "hunter": "b", "gum": "c", "glass": "a", "height": "b", "mogger": "c", "photog": "a"}[k]
        warble = C["height.wobble"] if k == "height" else None
        m += phonk(e0, C[f"{k}.flash"], riff, big=k in ("mogger", "photog"), warble=warble) * (0.85 if k == "photog" else 0.72)
    m += ending() * 1.35
    return m


def mix():
    out = bus()
    out += music()
    out += gym() * 0.7
    out += kids() * 1.0
    out += stings() * 1.0
    out += chews(CW["gum.sit"], CW["gum.flash"] + 0.01, CW["gum.flash"])
    out += mogger_blower()
    out += photographer()
    out += yearbook_sfx()
    # the camera powering on
    tt = t_axis(0.25)
    on = np.sin(2 * np.pi * np.cumsum(np.linspace(600, 1400, len(tt))) / SR) * adsr(len(tt), 0.02, 0.1) * 0.05
    place(out, stereo(on), 0.05)
    out = out[:N]
    out = np.stack([hp(out[:, c], 25) for c in range(2)], axis=1)
    out[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))[:, None]
    return out


if __name__ == "__main__":
    st = mix()
    peak = np.max(np.abs(st))
    print("peak before norm", round(float(peak), 3), "duration", round(len(st) / SR, 3))
    st = st / peak * 0.89
    os.makedirs(os.path.join(ROOT, "out", "looks"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "public", "looks"), exist_ok=True)
    wavfile.write(os.path.join(ROOT, "out", "looks", "bed.wav"), SR, st.astype(np.float32))
    ga.write_mp3(os.path.join(ROOT, "public", "looks", "bed.mp3"), st, 0.89)
    print("wrote public/looks/bed.mp3 and out/looks/bed.wav")
