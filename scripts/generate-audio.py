#!/usr/bin/env python3
"""
Synthesises the teaser's original score and every sound effect from scratch
(oscillators, noise, filters, convolution reverb). No samples, no licensed
music. Writes public/score.mp3 and public/sfx/*.mp3.

    pip install numpy scipy        # ffmpeg must be on PATH for the mp3 encode
    python3 scripts/generate-audio.py

The score is written against the default timeline in src/timeline.ts
(30 fps; frame f = f / 30 seconds). If you retime scenes, move the matching
`at(...)` calls below. SFX are placed by the timeline itself, so they follow
any retime automatically.
"""

import os
import subprocess
import tempfile

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
DUR = 36.0
FPS = 30
RNG = np.random.default_rng(4)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public")


def at(frame):
    return frame / FPS


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# ---------------------------------------------------------------- primitives


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def noise(sec):
    return RNG.standard_normal(int(sec * SR))


def _filt(x, kind, fc, order=2):
    fc = np.clip(np.atleast_1d(fc), 20, SR / 2 - 200) / (SR / 2)
    sos = signal.butter(order, fc if kind == "band" else float(fc[0]), kind, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, fc, order=2):
    return _filt(x, "low", fc, order)


def hp(x, fc, order=2):
    return _filt(x, "high", fc, order)


def bp(x, lo, hi, order=2):
    return _filt(x, "band", [lo, hi], order)


def sweep(x, f0, f1, kind="band", width=0.6, block=512):
    """Time-varying filter: cutoff glides exponentially from f0 to f1."""
    out = np.zeros_like(x)
    n = len(x)
    zi = None
    for i in range(0, n, block):
        p = i / max(1, n - 1)
        fc = f0 * (f1 / f0) ** p
        if kind == "band":
            wn = [max(30, fc * (1 - width / 2)), min(SR / 2 - 300, fc * (1 + width / 2))]
            sos = signal.butter(2, np.array(wn) / (SR / 2), "band", output="sos")
        else:
            sos = signal.butter(2, min(fc, SR / 2 - 300) / (SR / 2), kind, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i : i + block], zi = signal.sosfilt(sos, x[i : i + block], zi=zi)
    return out


def adsr(n, a=0.01, r=0.1, curve=1.0):
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na) ** curve
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr) ** curve
    return e


def decay(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


def sat(x, drive=2.0):
    return np.tanh(x * drive) / np.tanh(drive)


def crush(x, bits=6, hold=4):
    q = 2 ** bits
    y = np.round(x * q) / q
    return np.repeat(y[::hold], hold)[: len(x)]


def norm(x, peak=0.9):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def stereo(x, pan=0.0, width=0.0):
    """pan -1..1; width adds a short decorrelating delay on one side."""
    l = x * np.sqrt((1 - pan) / 2)
    r = x * np.sqrt((1 + pan) / 2)
    if width > 0:
        d = int(width * 0.012 * SR)
        r = np.concatenate([np.zeros(d), r[:-d]]) if d else r
    return np.stack([l, r], axis=1)


_IR_CACHE = {}


def reverb(st, size=2.5, wet=0.3, tone=5000):
    key = (size, tone)
    if key not in _IR_CACHE:
        n = int(size * SR)
        ir = np.stack([lp(noise(size), tone), lp(noise(size), tone)], axis=1)
        ir *= decay(n, size / 6.5)[:, None]
        ir[: int(0.012 * SR)] = 0
        _IR_CACHE[key] = ir / np.sqrt(np.sum(ir**2) / 2)
    ir = _IR_CACHE[key]
    tail = np.stack([signal.fftconvolve(st[:, c], ir[:, c])[: len(st) + len(ir)] for c in range(2)], axis=1)
    dry = np.zeros_like(tail)
    dry[: len(st)] = st
    return dry * (1 - wet) + tail * wet


def place(bus, st, sec, gain=1.0):
    i = int(sec * SR)
    if i >= len(bus):
        return
    j = min(len(bus), i + len(st))
    bus[i:j] += st[: j - i] * gain


# ------------------------------------------------------------- instruments


def saw_voice(f, sec, detune_cents=7):
    t = t_axis(sec)
    v = sum(
        signal.sawtooth(2 * np.pi * f * 2 ** (c / 1200) * t + RNG.uniform(0, 6.28))
        for c in (-detune_cents, 0, detune_cents)
    )
    return v / 3


def pad(notes, sec, cutoff=1400, attack=1.0, release=1.2):
    l = sum(saw_voice(midi(n), sec, 9) for n in notes)
    r = sum(saw_voice(midi(n), sec, 11) for n in notes)
    st = np.stack([lp(l, cutoff), lp(r, cutoff)], axis=1) / len(notes)
    return st * adsr(len(st), attack, release, 1.6)[:, None]


def sine(f, sec, phase=0.0):
    return np.sin(2 * np.pi * f * t_axis(sec) + phase)


def kick(sec=0.45, f0=140, f1=42, tau=0.16):
    t = t_axis(sec)
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * decay(len(t), tau)
    click = hp(noise(sec), 3000) * decay(len(t), 0.004) * 0.3
    return sat(body + click, 1.5)


def clap(sec=0.3):
    n = noise(sec)
    e = np.zeros(len(n))
    for k, off in enumerate((0, 0.011, 0.022)):
        i = int(off * SR)
        e[i:] += decay(len(n) - i, 0.008 if k < 2 else 0.09)
    return bp(n, 900, 3200) * e


def hat(sec=0.08, tau=0.018):
    return hp(noise(sec), 7000, 4) * decay(int(sec * SR), tau)


def pluck(f, sec=0.6, bright=1.0):
    t = t_axis(sec)
    v = sum((1 / k) * np.sin(2 * np.pi * k * f * t) * np.exp(-t * (4 + k * 3.5 / bright)) for k in range(1, 9))
    return v * adsr(len(t), 0.002, 0.05)


def bell(f, sec=2.5):
    t = t_axis(sec)
    partials = [(1, 1.0, 1.6), (2.76, 0.5, 0.9), (5.4, 0.25, 0.5), (8.93, 0.12, 0.3)]
    v = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / d) for m, a, d in partials)
    return v * adsr(len(t), 0.001, 0.2)


def sub_boom(sec=3.0, f0=70, f1=32):
    t = t_axis(sec)
    f = f1 + (f0 - f1) * np.exp(-t / 0.25)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(len(t), 1.1)
    rumble = lp(noise(sec), 160) * decay(len(t), 0.7) * 0.6
    return sat(body + rumble, 1.3)


# ===================================================================== SCORE


def build_score():
    n = int(DUR * SR)
    bus = np.zeros((n, 2))

    # ---------------- ACT 1 · routine: drone, hiss, heartbeat, clock, hum
    drone_len = at(300)
    t = t_axis(drone_len)
    drone = lp(saw_voice(midi(33), drone_len, 5) + 0.7 * saw_voice(midi(34), drone_len, 4), 260) * 0.6
    drone += 0.5 * np.sin(2 * np.pi * 55 * t)
    drone *= np.clip(t / 2.5, 0, 1) ** 2  # rises out of the loop seam
    drone *= 1 + 0.25 * np.sin(2 * np.pi * 0.21 * t)
    bus[: len(drone)] += stereo(drone, 0, 0.6) * 0.32

    hiss_len = at(530)
    hiss = hp(lp(noise(hiss_len), 9000), 2500) * 0.012
    hiss *= np.clip(t_axis(hiss_len) / 1.5, 0, 1)
    hiss[int(at(300) * SR) : int(at(330) * SR)] = 0
    bus[: len(hiss)] += stereo(hiss, 0, 1)

    beat = 0
    s = 1.6
    while s < at(295):
        thump = kick(0.35, 70, 38, 0.11) * 0.55
        place(bus, stereo(thump), s, 0.55)
        place(bus, stereo(thump * 0.6), s + 0.22, 0.55)
        s += 1.05 - min(0.25, beat * 0.02)
        beat += 1

    # clock spin: ticks accelerating with the hands (90–135)
    s, gap = at(98), 0.24
    while s < at(134):
        tick = hp(noise(0.02), 2500) * decay(int(0.02 * SR), 0.003)
        place(bus, stereo(tick, RNG.uniform(-0.3, 0.3)), s, 0.5)
        s += gap
        gap = max(0.028, gap * 0.86)

    # fluorescent hum: lights die one by one (135–180)
    hum_len = at(45)
    tt = t_axis(hum_len)
    hum = lp(signal.sawtooth(2 * np.pi * 120 * tt) + 0.5 * np.sin(2 * np.pi * 240 * tt), 1800) * 0.25
    deaths = [9 + k * 4 for k in range(8)]
    level = np.ones(len(tt))
    for k, d in enumerate(deaths):
        level[int(at(d) * SR) :] = 1 - (k + 1) / 8
    hum *= np.convolve(level, np.ones(400) / 400, mode="same")
    bus[int(at(135) * SR) : int(at(135) * SR) + len(hum)] += stereo(hum, 0, 0.4) * 0.5
    for d in deaths:
        zap = bp(noise(0.06), 1500, 6000) * decay(int(0.06 * SR), 0.012)
        place(bus, stereo(zap, RNG.uniform(-0.4, 0.4)), at(135 + d), 0.35)

    # dread pad + swell slamming into the blackout at 300
    p = pad([57, 58, 64], at(120), 900, 2.5, 0.01)
    bus[int(at(180) * SR) : int(at(180) * SR) + len(p)] += p * 0.16
    sw_len = at(300) - at(258)
    swell = sweep(noise(sw_len), 300, 5000, "band", 0.8) * np.linspace(0, 1, int(sw_len * SR)) ** 2.5
    bus[int(at(258) * SR) : int(at(258) * SR) + len(swell)] += stereo(swell, 0, 1) * 0.22

    # ---------------- ACT 2 · dread: accelerating pulse + riser, hard stop at 530
    a2, a2_end = at(330), at(530)
    s = a2
    k = 0
    while s < a2_end - 0.02:
        prog = (s - a2) / (a2_end - a2)
        note = lp(saw_voice(midi(33), 0.18, 3), 300 + 2200 * prog) * adsr(int(0.18 * SR), 0.003, 0.09)
        place(bus, stereo(sat(note, 2), 0.15 if k % 2 else -0.15), s, 0.34)
        s += 0.26 - 0.19 * prog
        k += 1
    d2 = a2_end - a2
    tt = t_axis(d2)
    drone2 = lp(saw_voice(midi(33), d2, 6) + saw_voice(midi(34), d2, 6) + 0.6 * saw_voice(midi(40), d2, 5), 420)
    drone2 = drone2 * 0.28 + 0.45 * np.sin(2 * np.pi * 55 * tt)
    bus[int(a2 * SR) : int(a2 * SR) + len(drone2)] += stereo(drone2, 0, 0.5) * 0.3
    r0 = at(390)
    rl = a2_end - r0
    tt = t_axis(rl)
    riser = sweep(noise(rl), 250, 9000, "band", 0.7) * (tt / rl) ** 2.2
    gl = sum(np.sin(2 * np.pi * np.cumsum(f0 * 2 ** (2.2 * tt / rl)) / SR) for f0 in (110, 220, 440)) / 3
    riser = riser * 0.5 + gl * (tt / rl) ** 2 * 0.35
    bus[int(r0 * SR) : int(r0 * SR) + len(riser)] += stereo(riser, 0, 1) * 0.3
    bus[int(a2_end * SR) : int(at(540) * SR)] = 0  # bass-drop silence

    # ---------------- ACT 3 · the turn: 120 BPM, Am | F | C | G
    bloom = pad([48, 52, 55, 59, 62], at(585) - at(540) + 0.6, 2600, 1.1, 0.6)
    bus[int(at(540) * SR) : int(at(540) * SR) + len(bloom)] += bloom * 0.3
    for k, nn in enumerate([84, 88, 91, 95, 91, 88]):
        place(bus, stereo(bell(midi(nn), 1.6) * 0.18, -0.5 + k * 0.2), at(546) + k * 0.2)

    groove0, groove1 = at(585), at(840)
    beat = 0.5
    chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 60], [55, 59, 62, 67]]
    roots = [45, 41, 36, 43]
    drums = np.zeros((n, 2))
    music = np.zeros((n, 2))
    nbeats = int(round((groove1 - groove0) / beat))
    for b in range(nbeats):
        s = groove0 + b * beat
        bar, pos = divmod(b, 4)
        ci = bar % 4
        last_half = s >= groove1 - 1.0
        place(drums, stereo(kick()), s, 0.9)
        if pos in (1, 3):
            place(drums, stereo(clap(), 0.05), s, 0.5)
        for e in (0, 0.25):
            v = 0.32 if e else 0.2
            place(drums, stereo(hat(), 0.35), s + e, v)
        if pos == 3:
            place(drums, stereo(hat(0.3, 0.12), 0.35), s + 0.25, 0.18)
        if last_half:
            for e in (0, 0.125, 0.25, 0.375):
                place(drums, stereo(clap(0.12), -0.1), s + e, 0.22 + 0.25 * (s - (groove1 - 1)))
        # bass: root eighths, sub + filtered saw
        for e in (0, 0.25):
            f = midi(roots[ci])
            bl = 0.24
            tone = 0.8 * sine(f, bl) + 0.4 * lp(saw_voice(f, bl, 2), 700)
            place(music, stereo(tone * adsr(int(bl * SR), 0.004, 0.06)), s + e, 0.34)
        # 16th arpeggio, chord tones up an octave
        for q in range(4):
            nn = chords[ci][(b * 4 + q) % 4] + 12
            place(music, stereo(pluck(midi(nn), 0.4) * 0.5, 0.45 if q % 2 else -0.45), s + q * 0.125, 0.16)
        if pos == 0:
            pd = pad(chords[ci], 2.0, 1600, 0.05, 0.4)
            place(music, pd, s, 0.17)
    # bloom → groove: sidechain pump keeps it modern
    pump = np.ones(n)
    for b in range(nbeats):
        i = int((groove0 + b * beat) * SR)
        m = int(0.22 * SR)
        pump[i : i + m] = np.minimum(pump[i : i + m], 0.45 + 0.55 * np.linspace(0, 1, m) ** 0.6)
    music *= pump[:, None]
    bus += music + drums
    fill = sweep(noise(1.0), 400, 8000, "band", 0.6) * np.linspace(0, 1, SR) ** 2
    place(bus, stereo(fill, 0, 1), groove1 - 1.0, 0.18)
    bus[int(groove1 * SR) : int((groove1 + 0.12) * SR)] *= 0  # hard cut to black

    # ---------------- ACT 4 · the title: dark → gold, wide and expensive
    dark = pad([45, 48, 52], at(880) - at(842), 700, 1.2, 1.4)
    place(bus, dark, at(842), 0.22)
    warm = pad([48, 52, 55, 59, 62], at(905) - at(866), 1500, 1.8, 1.0)
    place(bus, warm, at(866), 0.2)
    wake = pad([41, 48, 52, 55, 57, 64], at(968) - at(898), 2200, 0.9, 1.6)
    place(bus, wake, at(898), 0.24)
    for k, nn in enumerate([72, 79, 76, 84]):
        place(bus, stereo(pluck(midi(nn), 2.2, 0.4) * 0.7, (-0.3, 0.3, -0.1, 0.2)[k]), at(902) + k * 0.55, 0.25)
    title = pad([36, 43, 48, 52, 55, 59, 62, 67], at(1066) - at(958), 2600, 0.15, 1.4)
    place(bus, title, at(958), 0.24)
    for k, nn in enumerate([84, 91, 88, 96, 91, 100]):
        place(bus, stereo(bell(midi(nn), 2.4) * 0.16, -0.6 + k * 0.24), at(966) + k * 0.34)
    sub = sine(midi(24), at(1066) - at(960)) * adsr(int((at(1066) - at(960)) * SR), 0.05, 1.5)
    place(bus, stereo(sub), at(960), 0.25)

    # glitch hit: the score drops out for the 3-frame stinger
    bus[int(at(1022) * SR) : int(at(1025) * SR)] *= 0.05

    bus = reverb(bus, 2.8, 0.22)[:n]
    # true silence (after the reverb, so no tail leaks in): blackout and bass drop
    for a, b in ((at(300), at(330)), (at(530), at(540))):
        i, j = int(a * SR), int(b * SR)
        bus[i:j] = 0
        r = int(0.004 * SR)
        bus[i - r : i] *= np.linspace(1, 0, r)[:, None]
    bus[int(at(840) * SR) : int((at(840) + 0.12) * SR)] = 0
    # loop seam: silence at both ends
    fade = np.ones(n)
    fi, fo = int(0.25 * SR), int((DUR - at(1062)) * SR)
    fade[:fi] = np.linspace(0, 1, fi)
    fade[-fo:] = np.linspace(1, 0, fo) ** 2
    bus *= fade[:, None]
    return sat(norm(bus, 0.95), 1.2) * 0.9


# ======================================================================= SFX


def sfx_library():
    L = {}

    # alarm: distorted, bit-crushed square beeps (frames 15,19,23,27,36,40 → offsets)
    beeps = np.zeros(int(1.0 * SR))
    for off in (0, 4, 8, 12, 21, 25):
        bl = 0.085
        tt = t_axis(bl)
        tone = signal.square(2 * np.pi * 2093 * tt) + 0.6 * signal.square(2 * np.pi * 2131 * tt)
        i = int(at(off) * SR)
        beeps[i : i + len(tt)] += tone * adsr(len(tt), 0.002, 0.01)
    beeps = lp(crush(sat(beeps, 5), 5, 3), 6500)
    beeps[-int(0.005 * SR) :] *= np.linspace(1, 0, int(0.005 * SR))
    L["alarm-beep-distorted"] = reverb(stereo(beeps, 0, 0.2), 0.8, 0.25)

    L["hit-cut"] = reverb(stereo(sub_boom(0.9, 90, 38) + bp(noise(0.9), 80, 400) * decay(int(0.9 * SR), 0.05)), 1.4, 0.3)

    paper = bp(noise(0.12), 900, 4500) * decay(int(0.12 * SR), 0.02)
    thud = sub_boom(1.6, 85, 34)
    thud[: len(paper)] += paper * 1.4
    L["thud-heavy"] = reverb(stereo(sat(thud, 1.8), 0, 0.3), 1.8, 0.3)

    def glitch(sec, seed):
        g = np.random.default_rng(seed)
        out = np.zeros(int(sec * SR))
        i = 0
        while i < len(out):
            seg = int(g.uniform(0.008, 0.04) * SR)
            kind = g.integers(0, 3)
            tt = np.arange(seg) / SR
            if kind == 0:
                s = signal.square(2 * np.pi * g.uniform(80, 1800) * tt)
            elif kind == 1:
                s = crush(g.standard_normal(seg), 3, 8)
            else:
                s = np.zeros(seg)
            out[i : i + seg] = s[: len(out) - i] * g.uniform(0.3, 1)
            i += seg
        return hp(out, 60)

    L["glitch-in"] = stereo(glitch(0.42, 1), 0, 0.6)
    fg = glitch(0.3, 2)
    L["glitch-forever"] = stereo(np.concatenate([fg, fg[::-1][: int(0.15 * SR)] * np.linspace(1, 0, int(0.15 * SR))]), 0, 0.6)

    for k, (f0, f1, metal) in enumerate([(120, 50, 0.0), (160, 70, 0.3), (95, 40, 0.15), (200, 90, 0.5)]):
        h = kick(0.5, f0, f1, 0.12) + bp(noise(0.5), 600, 5000) * decay(int(0.5 * SR), 0.03) * 0.8
        if metal:
            tt = t_axis(0.5)
            h += metal * sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.12) for f in (523, 1371, 2210))
        L[f"hit-{k + 1}"] = reverb(stereo(sat(h, 2.2), 0, 0.4), 1.6, 0.35)

    cr = np.zeros(int(0.6 * SR))
    for k in range(24):
        i = int(min(0.55, abs(RNG.normal(0, 0.12))) * SR)
        cr[i : i + 90] += hp(noise(90 / SR), 3000)[:90] * RNG.uniform(0.3, 1)
    cr += hp(noise(0.6), 4000) * decay(int(0.6 * SR), 0.08) * 0.4
    cr += kick(0.6, 110, 45, 0.08) * 0.6
    L["crack"] = reverb(stereo(cr, 0, 0.5), 1.2, 0.3)

    wl = 0.9
    w = sweep(noise(wl), 200, 7000, "band", 0.9) * np.linspace(0, 1, int(wl * SR)) ** 3
    w[-int(0.004 * SR) :] *= np.linspace(1, 0, int(0.004 * SR))
    L["whoosh-reversed"] = stereo(w, 0, 1)

    def click(sec=0.05, f=3200, body=0.0):
        c = bp(noise(sec), f * 0.6, f * 1.6) * decay(int(sec * SR), 0.006)
        if body:
            c += np.sin(2 * np.pi * 900 * t_axis(sec)) * decay(int(sec * SR), 0.012) * body
        return c

    L["ui-click"] = stereo(click(0.06, 3500, 0.4), 0.1)
    L["click"] = reverb(stereo(click(0.12, 2600, 0.9) + kick(0.12, 300, 120, 0.02) * 0.4), 0.9, 0.2)

    def typing(sec, count, seed):
        g = np.random.default_rng(seed)
        out = np.zeros(int(sec * SR))
        for i in np.sort(g.uniform(0, sec - 0.05, count)):
            k = click(0.04, g.uniform(2200, 4200), 0.2) * g.uniform(0.5, 1)
            j = int(i * SR)
            out[j : j + len(k)] += k
        return out

    L["typing-search"] = stereo(typing(0.62, 16, 3), 0.15, 0.3)
    L["typing-look"] = stereo(typing(0.42, 11, 5), -0.1, 0.3)
    L["strike"] = stereo(sweep(noise(0.14), 6000, 1500, "band", 0.7) * adsr(int(0.14 * SR), 0.005, 0.08), 0.2)

    sw = sweep(noise(0.55), 300, 2600, "band", 0.9)
    sw *= np.sin(np.pi * np.linspace(0, 1, len(sw))) ** 2
    L["swoosh"] = reverb(stereo(sw, 0, 0.8), 1.0, 0.25)
    wp = sweep(noise(0.3), 5000, 400, "band", 0.9) * np.sin(np.pi * np.linspace(0, 1, int(0.3 * SR)))
    L["whip"] = stereo(wp, 0, 0.6)
    fl = sweep(noise(0.22), 900, 3500, "band", 0.8) * np.sin(np.pi * np.linspace(0, 1, int(0.22 * SR)))
    L["flip"] = stereo(fl, 0.3, 0.4)

    # node pops: an ascending pentatonic line in C, soft marimba tone
    for k, nn in enumerate([72, 74, 76, 79, 81]):
        L[f"pop-{k + 1}"] = reverb(stereo(pluck(midi(nn), 0.5, 0.5), -0.2 + k * 0.1), 1.0, 0.25)
    L["pop-chip"] = reverb(stereo(pluck(midi(84), 0.35, 0.6)), 0.8, 0.2)
    L["sent"] = reverb(stereo(pluck(midi(79), 0.3, 0.6) + np.pad(pluck(midi(84), 0.4, 0.6), (int(0.07 * SR), 0))[: int(0.3 * SR)]), 1.0, 0.25)
    for k, nn in enumerate([76, 79, 81]):
        L[f"tick-{k + 1}"] = reverb(stereo(pluck(midi(nn), 0.4, 0.7)), 0.9, 0.2)

    ch = sum(bell(midi(nn), 2.4) * a for nn, a in ((84, 1), (88, 0.8), (91, 0.7), (96, 0.4)))
    ch = np.concatenate([ch, np.zeros(int(0.4 * SR))])
    L["chime-confirm"] = reverb(stereo(ch, 0, 0.7), 2.4, 0.4)

    L["boom"] = reverb(stereo(sub_boom(3.2, 75, 30), 0, 0.3), 3.0, 0.35)
    shimmer = sum(bell(midi(nn), 3.0) * 0.2 for nn in (96, 100, 103))
    hit = sub_boom(3.5, 95, 32)
    hit[: len(shimmer)] += shimmer
    hit += bp(noise(3.5), 2000, 9000) * decay(int(3.5 * SR), 0.25) * 0.25
    L["title-hit"] = reverb(stereo(hit, 0, 0.6), 3.5, 0.4)

    st = glitch(0.32, 9) + kick(0.32, 180, 50, 0.08) * 0.8
    st = sat(st, 3)
    tail = st[::-1][: int(0.3 * SR)] * np.linspace(0, 1, int(0.3 * SR)) ** 2 * 0.4
    L["glitch-stinger"] = reverb(stereo(np.concatenate([st, tail[::-1]]), 0, 0.6), 1.2, 0.25)
    return L


# ===================================================================== WRITE


def write_mp3(path, st, peak=0.9):
    st = norm(st, peak).astype(np.float32)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav = f.name
    wavfile.write(wav, SR, st)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "256k", path],
        check=True,
    )
    os.remove(wav)


if __name__ == "__main__":
    write_mp3(os.path.join(OUT, "score.mp3"), build_score(), 0.9)
    print("score.mp3")
    for name, st in sfx_library().items():
        write_mp3(os.path.join(OUT, "sfx", f"{name}.mp3"), st, 0.9)
        print(f"sfx/{name}.mp3")
