#!/usr/bin/env python3
"""
The soundtrack of "POV: you had a secret knock with your sister" (src/knock, 71.5 s): an original score in
D major at 70 BPM and every sound in the house, synthesised from scratch with numpy/scipy (oscillators,
modal resonators, filtered noise, stick-slip trains, convolution with synthetic room impulse responses).
No samples, no network, no voices, no breaths. Deterministic: every random draw is seeded by its name.

Everything is timed from src/knock/script.json (each knock's time, side, kind and gain, the tuned pitches
in b9, the lightning, the earplugs, the macros, the odometer) and follows src/knock/treatment.json beat by
beat (its "sfx" and "music" fields and the global "music" spec) and the director's blocking in
src/knock/direct.ts (the walks and their footfalls, the T-rex, mom's treadmill and flop).

THE KNOCK   knuckles on 5/8" drywall over a pine stud: the contact transient (two knuckles a millisecond
            apart; the bottom of a six-year-old's fist is a soft, wide one), the panel's thud (damped plate
            modes and the cavity air) and the stud's woody resonance, tuned onto the leitmotif F#-E-D
            (Nora's an octave above yours) so every goodnight quietly plays it. The knocker's side is
            crisp; the far side is the same knock through the wall, low-passed at 1.2 kHz, 30 ms late, on
            the other side of the stereo field. Kinds: tap, fist, hard, soft, urgent, pulse, grey.
THE SCORE   felt piano (scripts/feltpiano.py), music box, celesta, brushes and shaker, a warm analog pad,
            low strings (2 celli, viola, double bass), in a warm room. The motif follows every answered
            goodnight; only F#-E through the drift (no D at all 36.0-59.0); true silence 52.0-59.0; her
            third knock lands on D at 59.0 with the open D chord; the swell crests at 64.2; the last
            Dmaj9 is gone by 70.3, before the three unanswered knocks.
THE MIX     the music at about -24 LUFS short-term (its median where it plays; the payoff's crest near -16),
            9-14 dB under the knocks' momentary level, ducking 4 dB under every knock (the weather outside
            steps back too); the earplug low-pass 24.8-26.2 (her knocks only felt, the right ear opening
            first); the wall-cavity macros hollow and close; true silence in the score 52.0-59.0 over a
            quiet room. Normalised to -16 LUFS integrated, true peak under -1 dBTP (a look-ahead limiter
            touches only the knocks' first milliseconds, a few dB at most).

    python3 scripts/generate-knock-audio.py                 # out/knock/bed.wav (48 kHz 24-bit) + public/knock/bed.mp3
    python3 scripts/generate-knock-audio.py --report DIR    # also the timing/pitch/loudness report and
                                                            # DIR/audio-overview.png, DIR/audio-payoff.png, ...
"""

import importlib.util
import json
import math
import os
import subprocess
import sys
import wave
import zlib

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
_spec = importlib.util.spec_from_file_location("feltpiano", os.path.join(HERE, "feltpiano.py"))
fp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fp)

SR = 48000
with open(os.path.join(ROOT, "src", "knock", "script.json")) as _f:
    S = json.load(_f)
FPS = S["fps"]
DUR = float(S["duration"])
N = int(round(DUR * SR))
PAD = 8 * SR
KNOCKS = S["knocks"]
EV = S["events"]
OUT_WAV = os.path.join(ROOT, "out", "knock", "bed.wav")
OUT_MP3 = os.path.join(ROOT, "public", "knock", "bed.mp3")

TARGET_LUFS = -16.0
TP_CEIL = -1.5  # dBTP for the wav (the mp3 encode adds a few tenths)
MUSIC_ST = -24.0  # the music's median short-term loudness where it plays (the treatment's -24; the crest near -16)
DUCK_DB = -4.0

# ============================================================================================ dsp helpers


def rng(*key):
    return np.random.default_rng(zlib.crc32(repr(key).encode("utf8")))


def ns(sec):
    return max(1, int(round(sec * SR)))


def ta(sec):
    return np.arange(ns(sec)) / SR


def midi(n):
    return 440.0 * 2.0 ** ((n - 69) / 12.0)


PC = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
PC_NAME = {v: k for k, v in PC.items()}


def note_midi(name, octave):
    return 12 * (octave + 1) + PC[name]


def midi_name(n):
    return f"{PC_NAME[int(round(n)) % 12]}{int(round(n)) // 12 - 1}"


def smooth(a, b, x):
    k = np.clip((np.asarray(x, float) - a) / (b - a), 0.0, 1.0)
    return k * k * (3 - 2 * k)


_SOS = {}


def _sos(kind, fc, order):
    fc = tuple(float(v) for v in np.atleast_1d(fc))
    key = (kind, fc, order)
    s = _SOS.get(key)
    if s is None:
        ny = SR / 2
        wn = [min(max(v, 5.0), ny * 0.985) / ny for v in fc]
        s = signal.butter(order, wn if kind in ("band", "bandstop") else wn[0], kind, output="sos")
        _SOS[key] = s
    return s


def lp(x, fc, o=2):
    return signal.sosfilt(_sos("low", fc, o), x, axis=0)


def hp(x, fc, o=2):
    return signal.sosfilt(_sos("high", fc, o), x, axis=0)


def bp(x, lo, hi, o=2):
    return signal.sosfilt(_sos("band", (lo, hi), o), x, axis=0)


def _biquad(kind, f0, q, gain_db=0.0):
    w = 2 * np.pi * min(f0, SR * 0.49) / SR
    c, s = np.cos(w), np.sin(w)
    al = s / (2 * q)
    if kind == "peak":
        A = 10 ** (gain_db / 40)
        b = [1 + al * A, -2 * c, 1 - al * A]
        a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == "bp":
        b = [al, 0.0, -al]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == "lowshelf":
        A = 10 ** (gain_db / 40)
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return b, a


def peq(x, f0, g, q=1.0):
    b, a = _biquad("peak", f0, q, g)
    return signal.lfilter(b, a, x, axis=0)


def reson(x, f0, q):
    b, a = _biquad("bp", f0, q)
    return signal.lfilter(b, a, x, axis=0)


def lowshelf(x, f0, g, q=0.7):
    b, a = _biquad("lowshelf", f0, q, g)
    return signal.lfilter(b, a, x, axis=0)


def _ramp(n, rising):
    k = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    return k if rising else k[::-1]


def fade(x, a=0.002, r=0.01):
    """Raised-cosine fade in and out (mono or stereo), so nothing starts or stops with a click."""
    x = np.array(x, float)
    n = len(x)
    na, nr = min(n, ns(a)), min(n, ns(r))
    sh = (slice(None),) + (None,) * (x.ndim - 1)
    if na > 1:
        x[:na] *= _ramp(na, True)[sh]
    if nr > 1:
        x[n - nr :] *= _ramp(nr, False)[sh]
    return x


def norm(x, peak=1.0):
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return x * (peak / m) if m > 0 else x


def rmsnorm(x, rms=0.05):
    v = float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0
    return x * (rms / v) if v > 0 else x


def pan2(x, p):
    th = (float(np.clip(p, -1, 1)) + 1) * np.pi / 4
    return np.stack([x * np.cos(th), x * np.sin(th)], axis=1) * np.sqrt(2)


def bus():
    return np.zeros((N + PAD, 2))


PLACED = []  # (t, bus name) for every sound put on a registered bus (the click scan reads it)
_BUSNAME = {}


def place(b, x, t, gain=1.0, pan=0.0):
    if id(b) in _BUSNAME:
        PLACED.append((float(t), _BUSNAME[id(b)]))
    x = np.asarray(x, float)
    if x.ndim == 1:
        x = pan2(x, pan)
    i = int(round(t * SR))
    s0 = max(0, -i)
    i = max(0, i)
    j = min(len(b), i + len(x) - s0)
    if j > i:
        b[i:j] += x[s0 : s0 + (j - i)] * gain


def pink(n, r, slope=0.5):
    """Coloured noise: power falls as 1/f^(2*slope) (0.5 pink, 1.0 brown), unit std."""
    X = r.standard_normal(n // 2 + 1) + 1j * r.standard_normal(n // 2 + 1)
    f = np.arange(n // 2 + 1, dtype=float)
    X[0] = 0
    X[1:] /= f[1:] ** slope
    x = np.fft.irfft(X, n)
    return x / (np.std(x) + 1e-12)


def wander(n, rate, r):
    """A smooth random control signal (unit-ish std) with knots every 1/rate seconds."""
    sec = n / SR
    k = int(sec * rate) + 3
    vals = r.standard_normal(k)
    pos = np.arange(n) / SR * rate
    i = np.floor(pos).astype(int)
    f = pos - i
    f = 0.5 - 0.5 * np.cos(np.pi * f)
    return vals[i] * (1 - f) + vals[i + 1] * f


def scatter(n, rate, r, sigma=0.8, env=None):
    """Poisson events: an impulse train with lognormal amplitudes and random signs; rate may follow env."""
    lam = np.full(n, rate / SR) if env is None else np.clip(env, 0, None) * rate / SR
    hit = r.random(n) < lam
    imp = np.zeros(n)
    k = int(hit.sum())
    # lognormal sizes, the rare giant ones clipped (a drop is a drop: no outliers far above the rest)
    imp[hit] = np.minimum(r.lognormal(0.0, sigma, k), np.exp(2.0 * sigma)) * r.choice([-1.0, 1.0], k)
    return imp


def conv(x, k):
    return signal.fftconvolve(x, k)[: len(x)]


def modal(t, modes, phase0=0.0):
    """Damped sinusoids: modes = [(freq, amp, tau)]."""
    y = np.zeros_like(t)
    for f, a, tau in modes:
        if f < SR * 0.45 and a != 0:
            y += a * np.sin(2 * np.pi * f * t + phase0) * np.exp(-t / tau)
    return y


def polyblep_saw(freq, r, phase=None):
    """A band-limited sawtooth for a frequency track (per sample)."""
    dt = freq / SR
    ph = (np.cumsum(dt) + (r.uniform() if phase is None else phase)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


# ============================================================================================ rooms

# rt: RT60 (s); er: share of the energy in the early reflections; span: how long they last; hf: how much
# faster the highs die (soft furnishings)
ROOMS = {
    # 2004: the first night, half unpacked: bare walls, boxes, no curtains
    "empty04": dict(rt=0.95, pre=0.0035, er=0.42, n=20, span=0.05, hf=0.45, seed=1),
    # a furnished bedroom
    "bedroom": dict(rt=0.42, pre=0.0025, er=0.5, n=14, span=0.032, hf=0.75, seed=2),
    # 2013: her room stripped for college; the drift's emptied rooms
    "stripped": dict(rt=0.66, pre=0.003, er=0.45, n=16, span=0.04, hf=0.6, seed=3),
    # the upstairs hallway (runner rug, a banister, doors)
    "hall": dict(rt=0.72, pre=0.006, er=0.4, n=16, span=0.055, hf=0.7, seed=4),
    # outside, heard through the windows
    "outdoor": dict(rt=1.7, pre=0.018, er=0.2, n=6, span=0.16, hf=0.8, seed=5),
    # the score's room: a warm, small wood-panelled hall
    "score": dict(rt=2.3, pre=0.011, er=0.28, n=22, span=0.07, hf=0.62, seed=6),
}
_IR = {}
_BANDS = [(20, 250), (250, 700), (700, 2000), (2000, 5000), (5000, 10000), (10000, 22000)]


def room_ir(name):
    if name in _IR:
        return _IR[name]
    p = ROOMS[name]
    r = rng("ir", name, p["seed"])
    rt = p["rt"]
    L = min(5.0, 1.45 * rt + 0.15)
    n = ns(L)
    t = np.arange(n) / SR
    mult = [1.3, 1.12, 1.0, 1 - 0.28 * p["hf"], 1 - 0.5 * p["hf"], 1 - 0.68 * p["hf"]]
    ir = np.zeros((n, 2))
    for c in range(2):
        w = r.standard_normal(n)
        tail = np.zeros(n)
        for (lo, hi), m in zip(_BANDS, mult):
            tail += bp(w, lo, hi, 2) * np.exp(-6.9078 * t / (rt * m))
        tail *= smooth(p["pre"] + 0.004, p["pre"] + 0.03, t)
        e = np.zeros(n)
        ts = p["pre"] + np.sort(r.uniform(0, p["span"], p["n"]))
        ts[0] = p["pre"]
        for tt in ts:
            i = int(tt * SR)
            e[i] += r.choice([-1.0, 1.0]) * (p["pre"] / tt) ** 0.6 * r.uniform(0.55, 1.0)
        e = lp(e, 9500 - 4000 * p["hf"], 2)
        e *= np.sqrt(p["er"] / (np.sum(e**2) + 1e-12))
        tail *= np.sqrt((1 - p["er"]) / (np.sum(tail**2) + 1e-12))
        ir[:, c] = e + tail
    # a gentle fade over the last 5% so the IR ends at zero
    m = int(0.05 * n)
    ir[-m:] *= _ramp(m, False)[:, None]
    _IR[name] = ir
    return ir


def convolve_st(x, ir, cross=0.3):
    a = (1 - cross) * x[:, 0] + cross * x[:, 1]
    b = cross * x[:, 0] + (1 - cross) * x[:, 1]
    yl = signal.fftconvolve(a, ir[:, 0])[: len(x)]
    yr = signal.fftconvolve(b, ir[:, 1])[: len(x)]
    return np.stack([yl, yr], axis=1)


def verb(x, room, wet=1.0, cross=0.3):
    return convolve_st(x, room_ir(room), cross) * wet


def era_verb(dry, plan):
    """Each stretch of the film in its own room: plan = [(t0, t1, room, wet, keep)]. The dry signal between t0
    and t1 goes into that room; its tail is kept `keep` seconds past t1 (a hard cut cuts the room too)."""
    out = np.zeros_like(dry)
    for t0, t1, room, wet, keep in plan:
        i0, i1 = int(t0 * SR), min(len(dry), int(t1 * SR))
        ir = room_ir(room)
        j1 = min(len(dry), i1 + int(keep * SR) + ns(0.08))
        seg = dry[i0:j1].copy()
        w = np.ones(len(seg))
        r = ns(0.003)
        w[:r] = _ramp(r, True)
        w[i1 - i0 :] = 0
        w[i1 - i0 - r : i1 - i0] = _ramp(r, False)
        y = convolve_st(seg * w[:, None], ir) * wet
        g = np.ones(len(y))
        k0 = i1 - i0 + int(keep * SR)
        g[k0:] = 0
        g[k0 : k0 + ns(0.08)] = _ramp(ns(0.08), False)[: len(g[k0 : k0 + ns(0.08)])]
        out[i0:j1] += y * g[:, None]
    return out


# ============================================================================================ the knock

# contact: level c, force-pulse width cw (ms), knuckles kn, brightness clp (Hz); panel: level p, decay
# scale pt; the stud: level s, decay st (s); the wall's boom: level b, pitch bf, decay bt; cavity air: a;
# an overall low-pass (distance or dullness) and whether the far side hears it at all.
KIND = {
    # two knuckles, a normal goodnight
    "tap": dict(c=0.6, cw=0.22, kn=2, clp=9000, p=0.72, pt=1.0, s=0.9, st=0.085, b=0.24, bf=96, bt=0.035, a=0.26, lp=None, far=True),
    # a six-year-old's whole fist, hammer-style: soft and wide, heavy, boomy
    "fist": dict(c=0.3, cw=1.35, kn=1, clp=2600, p=1.15, pt=1.6, s=0.7, st=0.095, b=1.0, bf=74, bt=0.072, a=0.45, lp=None, far=True),
    # grudging: flat (short, damped), a bit fast
    "hard": dict(c=0.7, cw=0.2, kn=2, clp=8000, p=0.9, pt=0.72, s=0.6, st=0.05, b=0.3, bf=100, bt=0.026, a=0.24, lp=None, far=True),
    # quiet, slower, gentle contact, the ring a little longer
    "soft": dict(c=0.3, cw=0.5, kn=2, clp=4500, p=0.6, pt=1.0, s=0.85, st=0.095, b=0.18, bf=92, bt=0.035, a=0.2, lp=None, far=True),
    # light and fast
    "urgent": dict(c=0.55, cw=0.2, kn=2, clp=8500, p=0.55, pt=0.68, s=0.65, st=0.055, b=0.12, bf=104, bt=0.022, a=0.18, lp=None, far=True),
    # faint, distant heartbeat pairs under the time-lapse
    "pulse": dict(c=0.05, cw=0.9, kn=1, clp=1500, p=0.62, pt=1.2, s=0.36, st=0.07, b=0.85, bf=70, bt=0.05, a=0.3, lp=520, far=True),
    # mom's sneakers on the treadmill, through its rail: dull, no stud ring, it never reaches the far side
    "grey": dict(c=0.12, cw=2.6, kn=1, clp=1200, p=0.95, pt=1.3, s=0.0, st=0.0, b=1.0, bf=60, bt=0.05, a=0.3, lp=650, far=False),
}
# the near copy's peak level per kind (times the script's gain)
KLEVEL = {"tap": 0.5, "fist": 0.29, "hard": 0.4, "soft": 0.37, "urgent": 0.53, "pulse": 0.25, "grey": 0.17}
PANEL_MODES = [88, 131, 177, 236, 309, 398, 527, 688, 902, 1170, 1540, 2010, 2650]
KPAN = 0.62
FAR_DELAY = 0.030
FAR_LP = 1200.0
FAR_GAIN = 0.5  # the far copy's energy relative to the near one's (-6 dB)
KNOCK_RMS = 0.25  # the near copy's RMS over its first 120 ms (before the kind's level)
SAT = 0.97  # the soft saturation's knee (the near copy's peaks round off above it)


def knock_pitches():
    """The stud resonance's note for every knock in script.json (MIDI, or None): each three-knock exchange
    plays F#-E-D (Nora's in the upper octave, yours an octave below), b9's pitches as written, the eleven-
    knock 'come here' a repeated F#, the time-lapse pulses F# then D (lub-dub), the treadmill none."""
    groups, cur = [], []
    for i, k in enumerate(KNOCKS):
        if cur:
            p = KNOCKS[cur[-1]]
            if k["side"] == p["side"] and k["kind"] == p["kind"] and k["t"] - p["t"] < 0.5:
                cur.append(i)
                continue
            groups.append(cur)
        cur = [i]
    if cur:
        groups.append(cur)
    out = [None] * len(KNOCKS)
    for g in groups:
        k0 = KNOCKS[g[0]]
        octv = 4 if k0["side"] == "N" else 3
        if k0["kind"] == "grey":
            continue
        if k0["kind"] == "pulse":
            for i in g:
                out[i] = note_midi("F#", 4) if KNOCKS[i]["side"] == "N" else note_midi("D", 3)
            continue
        names = [KNOCKS[i]["pitch"] for i in g]
        if not all(names):
            if k0["kind"] == "urgent":
                names = ["F#"] * len(g)
            else:
                names = (["F#", "E", "D"] * 4)[: len(g)]
        for i, nm in zip(g, names):
            out[i] = note_midi(nm, octv)
    return out


PITCHES = knock_pitches()


def stud_natural(i):
    """The stud's natural resonance for knock i (where on the stud, how the knuckles land): within 40 cents
    of its note; the knock is pitch-shifted onto the note (what's played is the note, +-2 cents)."""
    if PITCHES[i] is None:
        return None, None
    r = rng("stud", i)
    f = midi(PITCHES[i])
    shift = r.uniform(-40, 40)
    nat = f * 2 ** (-shift / 1200)
    played = f * 2 ** (r.uniform(-2, 2) / 1200)
    return nat, played


def allpass(x, f0, q):
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    b = np.array([1 - al, -2 * c, 1 + al])
    a = np.array([1 + al, -2 * c, 1 - al])
    return signal.lfilter(b / a[0], a / a[0], x, axis=0)


def disperse(x, fs=(1000, 1500, 2200, 3300, 5000), q=0.5):
    """A phase rotator: all-pass sections spread a click's highs over a couple of milliseconds, its peak
    ~4.5 dB lower with the same spectrum (too short a smear to hear)."""
    for f in fs:
        x = allpass(x, f, q)
    return x


def knock_dry(kind, f_stud, seed, var=1.0):
    """One knock (mono): (near, far). near: the knocker's side, peak 1; far: through the wall, relative level."""
    P = KIND[kind]
    r = rng("knock", seed)
    n = ns(0.55)
    t = np.arange(n) / SR
    # the contact: a raised-cosine force pulse per knuckle (its width sets how bright it is)
    w = max(4, int(P["cw"] * 1e-3 * SR * r.uniform(0.9, 1.1)))
    pulse = np.hanning(w + 2)[1:-1]
    F = np.zeros(n)
    offs = [0] if P["kn"] == 1 else [0, int(r.uniform(0.7, 1.5) * 1e-3 * SR)]
    for j, o in enumerate(offs):
        F[o : o + w] += pulse * (1.0 if j == 0 else r.uniform(0.55, 0.8))
    Fk = F[: offs[-1] + w]
    Fk = Fk / Fk.sum()
    # the radiated click: the force's onset (high-passed) and the paper face's tick
    click = hp(F, 500, 2)
    tick = hp(r.standard_normal(n), 1800, 2) * np.exp(-t / 0.0007)
    con = disperse(lp(norm(click) * 0.8 + norm(tick) * 0.5 * (1.0 if P["cw"] < 0.6 else 0.35), P["clp"], 2))
    # the drywall panel between the studs: lossy plate modes, the highs dying fastest
    modes = []
    for f in PANEL_MODES:
        fi = f * r.uniform(0.94, 1.06)
        ai = r.uniform(0.6, 1.0) / (1 + (fi / 450) ** 1.1) * min(1.0, (fi / 300) ** 1.4)
        modes.append((fi, ai, P["pt"] * 0.03 * (250 / fi) ** 0.45))
    panel = modal(t, modes)
    air = bp(r.standard_normal(n), 230, 720, 2) * np.exp(-t / 0.012)
    # the stud: a pine bar's bending modes (1 : 2.76 : 5.40) and its woody tok
    stud = np.zeros(n)
    if P["s"] > 0 and f_stud:
        stud = modal(t, [(f_stud, 1.0, P["st"]), (f_stud * 2.756, 0.3, P["st"] * 0.42), (f_stud * 5.404, 0.1, P["st"] * 0.22)])
        stud += 0.22 * norm(bp(r.standard_normal(n), f_stud * 1.8, f_stud * 3.4, 2) * np.exp(-t / 0.004))
    # the wall section flexing: a low thump with a quick pitch drop
    fb = P["bf"] * r.uniform(0.95, 1.05) * (1 + 0.6 * np.exp(-t / 0.012))
    boom = np.sin(2 * np.pi * np.cumsum(fb) / SR) * np.exp(-t / P["bt"])
    body = P["p"] * norm(panel) + P["s"] * norm(stud) + P["b"] * norm(boom) + P["a"] * norm(air)
    body = np.convolve(body, Fk)[:n]
    near = P["c"] * norm(con) + body
    far = None
    if P["far"]:
        far = lp(0.25 * P["c"] * norm(con) + body, FAR_LP, 4)
    if P["lp"]:
        near = lp(near, P["lp"], 4)
        if far is not None:
            far = lp(far, P["lp"], 2)
    # every knock normalised by its energy (the first 120 ms), so loudness follows the script's gains
    # whatever the pitch; then the first millisecond's coherent peak is rounded off (wood and knuckles are
    # not linear; it keeps the knock dense instead of spiky)
    e = float(np.sqrt(np.mean(near[: ns(0.12)] ** 2)))
    near = near / e * KNOCK_RMS
    near = SAT * np.tanh(near / SAT)
    near = fade(near, 0.0, 0.12)
    if far is not None:
        ef = float(np.sqrt(np.mean(far[: ns(0.12)] ** 2)))
        far = fade(far / ef * KNOCK_RMS * FAR_GAIN, 0.0, 0.12)
    return near * var, (far * var if far is not None else None)


def sub_thump(seed):
    """A knock felt rather than heard (the earplugs in): the wall's push through the pillow."""
    r = rng("sub", seed)
    t = ta(0.4)
    f = 47 * r.uniform(0.95, 1.05) * (1 + 0.5 * np.exp(-t / 0.012))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.07) * smooth(0, 0.004, t)
    x += 0.3 * np.sin(2 * np.pi * 92 * t) * np.exp(-t / 0.03) * smooth(0, 0.003, t)
    return fade(norm(x), 0.0, 0.08)


# ============================================================================================ plots (PIL)

_LUT = None


def _lut():
    """A perceptual dark-to-bright colour map (black, indigo, magenta, orange, pale yellow)."""
    global _LUT
    if _LUT is None:
        pts = np.array([[0, 0, 0, 4], [0.18, 40, 11, 84], [0.38, 120, 28, 109], [0.58, 200, 58, 83], [0.78, 245, 125, 21], [1.0, 252, 253, 191]], float)
        x = np.linspace(0, 1, 256)
        _LUT = np.stack([np.interp(x, pts[:, 0], pts[:, c]) for c in (1, 2, 3)], axis=1).astype(np.uint8)
    return _LUT


def _font(size):
    from PIL import ImageFont

    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def spectro_img(x, t0, t1, w, h, fmin=30, fmax=16000, floor_db=-95, top_db=None, nfft=4096):
    """A log-frequency spectrogram (mono) of x between t0 and t1 as an RGB array h x w."""
    from PIL import Image

    i0, i1 = int(t0 * SR), int(t1 * SR)
    seg = x[i0:i1]
    hop = max(64, (i1 - i0) // w)
    win = np.hanning(nfft)
    pad = np.concatenate([np.zeros(nfft // 2), seg, np.zeros(nfft)])
    cols = []
    for k in range(w):
        a = k * hop
        fr = pad[a : a + nfft]
        if len(fr) < nfft:
            fr = np.concatenate([fr, np.zeros(nfft - len(fr))])
        cols.append(np.abs(np.fft.rfft(fr * win)) ** 2)
    P = np.array(cols).T  # freq x time
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    fy = np.geomspace(fmin, fmax, h)[::-1]
    idx = np.clip(np.searchsorted(freqs, fy), 1, len(freqs) - 1)
    img = 10 * np.log10(P[idx] / (np.sum(win**2) * SR / 2) + 1e-14)
    top = np.max(img) if top_db is None else top_db
    v = np.clip((img - floor_db) / (top - floor_db), 0, 1)
    return _lut()[(v * 255).astype(np.uint8)], fy


def plot_sound(path, x, title="", t0=0.0, t1=None, h_spec=300, w=1400, marks=()):
    """Waveform (L/R) over a spectrogram, for one sound or a stretch of the mix."""
    from PIL import Image, ImageDraw

    x = np.asarray(x, float)
    st = x if x.ndim == 2 else np.stack([x, x], axis=1)
    t1 = len(st) / SR if t1 is None else t1
    mono = st.mean(axis=1)
    spec, fy = spectro_img(mono, t0, t1, w, h_spec, nfft=2048 if t1 - t0 < 3 else 4096)
    H = 40 + 160 + 10 + h_spec + 30
    im = Image.new("RGB", (w + 70, H), (14, 14, 18))
    d = ImageDraw.Draw(im)
    f = _font(13)
    d.text((70, 12), title, fill=(230, 230, 230), font=f)
    i0, i1 = int(t0 * SR), int(t1 * SR)
    seg = st[i0:i1]
    hop = max(1, len(seg) // w)
    for c, (y0, col) in enumerate(((40, (127, 180, 255)), (120, (255, 180, 92)))):
        ch = seg[: hop * w, c].reshape(w, hop) if len(seg) >= hop * w else np.pad(seg[:, c], (0, hop * w - len(seg))).reshape(w, hop)
        mx, mn = ch.max(axis=1), ch.min(axis=1)
        for k in range(w):
            d.line([(70 + k, y0 + 40 - mx[k] * 38), (70 + k, y0 + 40 - mn[k] * 38)], fill=col)
        d.line([(70, y0 + 40), (70 + w, y0 + 40)], fill=(60, 60, 70))
        d.text((8, y0 + 32), "L" if c == 0 else "R", fill=col, font=f)
    from PIL import Image as _I

    im.paste(_I.fromarray(spec), (70, 210))
    for fq in (50, 100, 200, 500, 1000, 2000, 5000, 10000):
        y = 210 + int(np.argmin(np.abs(fy - fq)))
        d.text((8, y - 7), f"{fq if fq < 1000 else str(fq // 1000) + 'k'}", fill=(170, 170, 170), font=f)
        d.line([(62, y), (68, y)], fill=(170, 170, 170))
    span = t1 - t0
    step = 0.05 if span < 1.2 else 0.1 if span < 3 else 0.5 if span < 12 else 1.0 if span < 25 else 5.0
    tt = math.ceil(t0 / step) * step
    while tt <= t1 + 1e-9:
        xx = 70 + int((tt - t0) / span * w)
        d.line([(xx, 210 + h_spec), (xx, 215 + h_spec)], fill=(170, 170, 170))
        d.text((xx - 12, 218 + h_spec), f"{tt:.2f}" if step < 0.5 else f"{tt:.1f}", fill=(170, 170, 170), font=f)
        tt += step
    for tm, lab in marks:
        if t0 <= tm <= t1:
            xx = 70 + int((tm - t0) / span * w)
            d.line([(xx, 36), (xx, 205)], fill=(90, 220, 140))
            d.text((xx + 2, 24), lab, fill=(90, 220, 140), font=_font(11))
    im.save(path)
    return path


# ============================================================================================ foley

def cloth(sec, kind="cotton", seed=0, shape=None, rms=0.015):
    """Cloth moving (a duvet, a quilt, sheets, a nylon sleeping bag, towels): a gesture-shaped swish of
    filtered noise and the fabric's small crackles."""
    r = rng("cloth", kind, seed)
    n = ns(sec)
    t = np.arange(n) / SR
    lo, hi, crk, chp = {
        "cotton": (220, 3200, 90, 1600),
        "quilt": (160, 2300, 50, 1300),
        "sheet": (300, 5200, 200, 2200),
        "nylon": (900, 9500, 420, 3200),
        "towel": (140, 2400, 40, 1100),
        "hoodie": (200, 2800, 70, 1500),
    }[kind]
    if shape is None:
        shape = smooth(0, 0.3 * sec, t) * (1 - smooth(0.55 * sec, sec, t))
    g = shape * (0.5 + 0.5 * np.clip(0.6 + 0.5 * wander(n, 11, r), 0, 1.5)) ** 2
    sw = bp(pink(n, r, 0.35), lo, hi, 2) * g
    k = ns(0.004)
    ker = hp(r.standard_normal(k), chp, 2) * np.exp(-np.arange(k) / (0.0008 * SR))
    cr = conv(scatter(n, crk, r, 0.6, env=g / (g.max() + 1e-9)), ker)
    cr = cr / (np.std(cr) + 1e-9)
    cr = 3.0 * np.tanh(cr / 3.0)  # no crackle far above the rest
    x = sw / (np.std(sw) + 1e-9) + 0.35 * cr * g
    return fade(rmsnorm(x, rms), 0.01, 0.03)


def step(shoe="bare", floor="wood", w=1.0, seed=0):
    """A footfall: the heel's low thump, the sole (skin, sock, rubber), the boards (or the carpet)."""
    r = rng("step", shoe, floor, seed)
    n = ns(0.28)
    t = np.arange(n) / SR
    thump = lp(r.standard_normal(n), 240, 2) * np.exp(-t / 0.016)
    body = np.sin(2 * np.pi * r.uniform(70, 105) * t) * np.exp(-t / 0.028)
    x = norm(thump) * 0.8 + norm(body) * 0.6
    if shoe == "bare":
        x += 0.22 * norm(bp(r.standard_normal(n), 900, 3500, 2) * np.exp(-t / 0.004))
    elif shoe == "sock":
        sw = bp(r.standard_normal(n), 2000, 6500, 2) * smooth(0.005, 0.02, t) * np.exp(-np.maximum(0, t - 0.02) / 0.025)
        x += 0.2 * norm(sw)
    elif shoe == "sneaker":
        x += 0.45 * norm(bp(r.standard_normal(n), 600, 2600, 2) * np.exp(-t / 0.006))
    if floor == "wood":
        x += 0.35 * norm(modal(t, [(r.uniform(130, 150), 1, 0.03), (r.uniform(250, 280), 0.6, 0.022), (r.uniform(390, 430), 0.35, 0.015)]))
    elif floor == "carpet":
        x = lp(x, 900, 2)
    elif floor == "deck":
        x += 0.6 * norm(modal(t, [(r.uniform(88, 98), 1, 0.05), (r.uniform(180, 200), 0.5, 0.03)]))
    return fade(norm(x) * w, 0.0005, 0.05)


def creak(sec=0.4, f0=170, f1=230, seed=0, rough=0.5):
    """Wood under load: a stick-slip pulse train gliding in rate, through the board's resonances."""
    r = rng("creak", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    f = f0 + (f1 - f0) * smooth(0, sec, t)
    f = f * (1 + 0.08 * rough * wander(n, 30, r))
    ph = np.cumsum(f) / SR
    hit = np.diff(np.floor(ph), prepend=0) > 0
    imp = np.zeros(n)
    imp[hit] = r.uniform(0.4, 1.0, int(hit.sum()))
    x = reson(imp, r.uniform(350, 420), 4) + 0.7 * reson(imp, r.uniform(780, 880), 5) + 0.4 * reson(imp, r.uniform(1400, 1650), 6)
    x = bp(x, 140, 2600, 2) * np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 1.5
    return fade(norm(x), 0.01, 0.03)


def metal(modes, seed, tick=0.3, tick_tau=0.0006):
    """A small metal click or clink: inharmonic modes [(f, a, tau)] struck, with a hard contact tick."""
    r = rng("metal", seed)
    L = max(m[2] for m in modes) * 6 + 0.01
    n = ns(L)
    t = np.arange(n) / SR
    x = modal(t, [(f * r.uniform(0.98, 1.02), a * r.uniform(0.7, 1.0), tau) for f, a, tau in modes], 0.0)
    x = norm(x) + tick * norm(hp(r.standard_normal(n), 3000, 2) * np.exp(-t / tick_tau))
    return fade(norm(x), 0.0, 0.01)


def plastic(modes, seed, thud=0.3):
    """A hollow plastic or wooden knock: modes plus a short low thud."""
    r = rng("plastic", seed)
    L = max(m[2] for m in modes) * 6 + 0.02
    n = ns(L)
    t = np.arange(n) / SR
    x = norm(modal(t, [(f * r.uniform(0.97, 1.03), a, tau) for f, a, tau in modes]))
    x += thud * norm(lp(r.standard_normal(n), 400, 2) * np.exp(-t / 0.006))
    x += 0.25 * norm(hp(r.standard_normal(n), 2500, 2) * np.exp(-t / 0.0006))
    return fade(norm(x), 0.0, 0.008)


def switch_click(seed=0):
    """A wall toggle: the rocker's spring snap, then the plate's plastic thock."""
    a = metal([(4100, 1, 0.003), (6300, 0.6, 0.002), (2900, 0.4, 0.004)], ("sw", seed), tick=0.6)
    b = plastic([(1250, 1, 0.006), (2100, 0.6, 0.004)], ("swp", seed), thud=0.4)
    x = np.zeros(ns(0.06))
    x[: len(a)] += a
    k = ns(0.0035)
    x[k : k + len(b)] += 0.7 * b[: len(x) - k]
    return fade(norm(x), 0.0, 0.01)


def door(mode="open", seed=0):
    """A bedroom door: 'open' (knob, the bolt drawn, the swing, a hinge whisper) or 'close' (the swing, the
    bolt over the strike, the door into the jamb)."""
    r = rng("door", mode, seed)
    n = ns(0.9)
    t = np.arange(n) / SR
    x = np.zeros(n)
    bolt = metal([(2950, 1, 0.012), (4700, 0.6, 0.008), (6900, 0.3, 0.005), (1800, 0.3, 0.01)], ("bolt", mode, seed), tick=0.5)
    rattle = metal([(3300, 1, 0.006), (5200, 0.5, 0.004)], ("knob", mode, seed), tick=0.2)
    swing = lp(r.standard_normal(n), 500, 2) * np.sin(np.pi * np.clip(t / 0.45, 0, 1)) ** 2
    if mode == "open":
        place_m(x, rattle * 0.35, 0.0)
        place_m(x, bolt * 0.8, 0.07)
        place_m(x, norm(swing) * 0.25, 0.1)
        place_m(x, creak(0.28, 520, 640, ("hinge", seed), 0.3) * 0.08, 0.16)
    else:
        place_m(x, norm(swing) * 0.3, 0.0)
        place_m(x, bolt * 0.75, 0.42)
        jamb = plastic([(115, 1, 0.04), (230, 0.5, 0.025), (480, 0.25, 0.012)], ("jamb", seed), thud=0.6)
        place_m(x, jamb * 0.9, 0.44)
    return fade(norm(x), 0.002, 0.05)


def place_m(x, y, t, gain=1.0):
    i = int(round(t * SR))
    j = min(len(x), i + len(y))
    if j > i:
        x[i:j] += y[: j - i] * gain


def shelf_jolt(strength=1.0, seed=0, trex=True):
    """Your pine corner shelf jolted by a knock: it rattles on its screws, the T-rex wobbles."""
    r = rng("shelf", seed)
    x = np.zeros(ns(0.25))
    for k in range(r.integers(2, 4)):
        wood = plastic([(r.uniform(560, 680), 1, 0.018), (r.uniform(1100, 1300), 0.6, 0.012), (r.uniform(2000, 2300), 0.3, 0.008)], ("sw", seed, k), thud=0.3)
        place_m(x, wood, 0.004 + k * r.uniform(0.012, 0.022), (0.6 ** k))
    if trex:
        for k in range(2):
            tick = plastic([(r.uniform(1800, 2050), 1, 0.006), (r.uniform(3000, 3300), 0.6, 0.004), (4600, 0.3, 0.003)], ("tr", seed, k), thud=0.15)
            place_m(x, tick, 0.03 + 0.04 * k + r.uniform(0, 0.01), 0.45 / (k + 1))
    return fade(norm(x) * strength, 0.0, 0.02)


def trex_fall(seed=0, size=1.0):
    """The plastic T-rex toppling flat on the shelf: the clack, a bounce, a settle."""
    r = rng("trexfall", seed)
    x = np.zeros(ns(0.25))
    for k, (dt, g) in enumerate(((0.0, 1.0), (0.045, 0.38), (0.082, 0.13))):
        y = plastic([(r.uniform(1750, 1950), 1, 0.008), (r.uniform(2900, 3200), 0.7, 0.005), (r.uniform(4300, 4700), 0.35, 0.004), (r.uniform(620, 700), 0.5 * size, 0.012)], ("trf", seed, k), thud=0.35 * size)
        place_m(x, y, dt, g)
    return fade(norm(x), 0.0, 0.02)


def odo_tick(seed=0):
    """The odometer's tiny mechanical tick: the pawl, and the drum dropping into its detent."""
    x = np.zeros(ns(0.03))
    place_m(x, metal([(3400, 1, 0.003), (5300, 0.7, 0.002), (7700, 0.4, 0.0015)], ("odo", seed), tick=0.5), 0.0, 1.0)
    place_m(x, metal([(2900, 1, 0.0025), (4600, 0.6, 0.002)], ("odo2", seed), tick=0.4), 0.0085, 0.45)
    return fade(norm(disperse(lp(x, 8000, 2))), 0.0, 0.005)


def odo_detent(seed=0):
    """The lock at 35.3: a heavier click and a clunk, a little ring."""
    x = np.zeros(ns(0.08))
    place_m(x, metal([(1450, 1, 0.009), (2900, 0.7, 0.006), (4300, 0.4, 0.004)], ("det", seed), tick=0.5), 0.0, 1.0)
    place_m(x, plastic([(820, 1, 0.012), (1640, 0.5, 0.007)], ("det2", seed), thud=0.5), 0.013, 0.6)
    return fade(norm(x), 0.0, 0.01)


def clock_tick(tock=False, seed=0):
    """The hallway clock's escapement: two quick clicks through the wooden case."""
    r = rng("clock", seed)
    n = ns(0.06)
    t = np.arange(n) / SR
    imp = np.zeros(n)
    imp[0] = 1.0
    imp[ns(0.0042)] = 0.55
    k = 0.93 if tock else 1.0
    x = reson(imp, 1150 * k, 6) + 0.8 * reson(imp, 2600 * k, 8) + 0.5 * reson(imp, 4300 * k, 10)
    x = norm(x) + 0.3 * norm(hp(r.standard_normal(n), 3000, 2) * np.exp(-t / 0.0008))
    return fade(norm(x), 0.0, 0.01)


def paper(sec, kind="slide", seed=0):
    """Notebook paper: sliding out from under a pillow, or its dry edge scraping the outlet cover's gap."""
    r = rng("paper", kind, seed)
    n = ns(sec)
    t = np.arange(n) / SR
    shape = np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 1.2
    grain = np.abs(wander(n, 140 if kind == "slide" else 260, r)) ** 1.5
    if kind == "slide":
        x = bp(r.standard_normal(n), 1400, 7000, 2) * (0.35 + grain)
    else:
        x = bp(r.standard_normal(n), 2400, 9500, 2) * (0.25 + grain) + 0.5 * conv(scatter(n, 320, r, 1.0), hp(r.standard_normal(ns(0.002)), 3000, 2))
    return fade(rmsnorm(x * shape), 0.01, 0.02)


def flutter(sec, rate=5.0, seed=0):
    """The note falling through the cavity, slowed to half speed: soft flaps of air."""
    r = rng("flutter", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    flap = np.maximum(0, np.sin(2 * np.pi * rate * t + r.uniform(0, 6))) ** 3 * (0.6 + 0.4 * wander(n, 3, r))
    x = bp(r.standard_normal(n), 250, 2200, 2) * flap * np.sin(np.pi * np.clip(t / sec, 0, 1))
    return fade(rmsnorm(x), 0.02, 0.05)


def paper_tap(seed=0):
    r = rng("ptap", seed)
    n = ns(0.05)
    t = np.arange(n) / SR
    x = norm(lp(r.standard_normal(n), 2500, 2) * np.exp(-t / 0.002)) + 0.3 * norm(bp(r.standard_normal(n), 4000, 9000, 2) * np.exp(-t / 0.0008))
    x += 0.2 * norm(bp(r.standard_normal(n), 300, 1500, 2) * np.exp(-t / 0.015))  # dust puffing
    return fade(norm(x), 0.0, 0.01)


def tags(nclinks=2, seed=0):
    """A beagle's tags (a brass name tag and a steel one) clinking together."""
    r = rng("tags", seed)
    x = np.zeros(ns(0.35))
    for k in range(nclinks):
        brass = r.random() < 0.5
        md = [(2980, 1, 0.05), (4410, 0.7, 0.035), (6230, 0.5, 0.025), (8100, 0.3, 0.015)] if brass else [(3600, 1, 0.06), (5350, 0.6, 0.04), (7400, 0.4, 0.025), (9800, 0.25, 0.015)]
        md = [(f * r.uniform(0.96, 1.04), a, tau) for f, a, tau in md]
        place_m(x, metal(md, ("tag", seed, k), tick=0.4), k * r.uniform(0.018, 0.045), r.uniform(0.4, 1.0))
    return fade(norm(x), 0.0, 0.02)


def paw(floor="wood", seed=0):
    r = rng("paw", floor, seed)
    n = ns(0.06)
    t = np.arange(n) / SR
    x = norm(lp(r.standard_normal(n), 320, 2) * np.exp(-t / 0.008))
    if floor == "wood":
        x += 0.45 * norm(hp(r.standard_normal(n), 3000, 2) * np.exp(-t / 0.0007))  # a nail
    return fade(norm(x), 0.0, 0.01)


def flop(weight=1.0, seed=0, sec=0.45):
    """A body settling onto a rug or carpet: a soft low whump and the cloth."""
    r = rng("flop", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    x = norm(lp(r.standard_normal(n), 180 + 80 * (1 - weight), 2) * np.exp(-t / (0.035 + 0.04 * weight)))
    x += 0.8 * norm(np.sin(2 * np.pi * (52 + 30 * (1 - weight)) * t) * np.exp(-t / 0.06))
    x += 0.35 * norm(cloth(sec, "cotton", ("flop", seed), shape=np.exp(-t / 0.12), rms=0.05))
    return fade(norm(x), 0.001, 0.05)


def pillow(seed=0, big=1.0):
    """A pillow (or a bundled quilt) landing: a soft whoomp of air and cloth."""
    r = rng("pillow", seed)
    n = ns(0.45)
    t = np.arange(n) / SR
    x = norm(lp(r.standard_normal(n), 350, 2) * smooth(0, 0.008, t) * np.exp(-t / (0.03 + 0.03 * big)))
    x += 0.5 * norm(np.sin(2 * np.pi * 75 * t) * np.exp(-t / 0.04))
    x += 0.4 * norm(cloth(0.45, "quilt" if big > 1 else "cotton", ("pil", seed), shape=np.exp(-t / 0.1), rms=0.05))
    return fade(norm(x), 0.002, 0.05)


def vinyl(sec, kind="creak", seed=0):
    """The air mattress's PVC: stick-slip squeals (creak low and rough, squeak higher) and the air inside
    shifting."""
    r = rng("vinyl", kind, seed)
    n = ns(sec)
    t = np.arange(n) / SR
    f0, f1 = (280, 420) if kind == "creak" else (680, 1050)
    f = (f0 + (f1 - f0) * smooth(0, sec, t)) * (1 + 0.06 * wander(n, 25, r))
    ph = np.cumsum(f) / SR
    hit = np.diff(np.floor(ph), prepend=0) > 0
    imp = np.zeros(n)
    imp[hit] = r.uniform(0.3, 1.0, int(hit.sum()))
    x = bp(conv(imp, np.exp(-np.arange(ns(0.002)) / (0.0004 * SR))), 400, 3600, 2)
    x = norm(x) * np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 2
    x += 0.5 * norm(lp(r.standard_normal(n), 160, 2)) * np.sin(np.pi * np.clip(t / sec, 0, 1))
    return fade(norm(x), 0.01, 0.03)


def phone_down(seed=0):
    """A phone laid face-down on a duvet."""
    r = rng("phone", seed)
    n = ns(0.12)
    t = np.arange(n) / SR
    x = norm(lp(r.standard_normal(n), 650, 2) * np.exp(-t / 0.012)) + 0.15 * norm(bp(r.standard_normal(n), 2000, 5000, 2) * np.exp(-t / 0.0015))
    return fade(norm(x), 0.0, 0.02)


def tape_screech(sec, seed=0):
    """Packing tape pulled off the roll: a stick-slip screech and the peel's crackle; pressed down at the end."""
    r = rng("tape", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    f = r.uniform(420, 520) * (1 + 0.5 * smooth(0, sec, t)) * (1 + 0.12 * wander(n, 40, r))
    ph = np.cumsum(f) / SR
    hit = np.diff(np.floor(ph), prepend=0) > 0
    imp = np.zeros(n)
    imp[hit] = r.uniform(0.5, 1.0, int(hit.sum()))
    sq = bp(conv(imp, np.exp(-np.arange(ns(0.001)) / (0.0002 * SR))), 900, 7000, 2)
    peel = bp(r.standard_normal(n), 1500, 9000, 2) * (0.4 + np.abs(wander(n, 90, r)))
    shape = smooth(0, 0.04, t) * (1 - smooth(sec - 0.05, sec, t))
    x = (norm(sq) + 0.4 * norm(peel)) * shape
    return fade(norm(x), 0.005, 0.02)


def hanger(seed=0):
    """A wire hanger's hook knocking the treadmill's steel handlebar."""
    r = rng("hanger", seed)
    md = [(r.uniform(2050, 2250), 1, 0.06), (r.uniform(3250, 3500), 0.7, 0.045), (r.uniform(5600, 6000), 0.45, 0.03), (r.uniform(8000, 8600), 0.25, 0.02), (r.uniform(1150, 1250), 0.4, 0.08)]
    x = metal(md, ("hg", seed), tick=0.5)
    y = np.zeros(len(x) + ns(0.05))
    place_m(y, x, 0.0)
    place_m(y, metal(md, ("hg2", seed), tick=0.3), r.uniform(0.02, 0.04), 0.35)
    return fade(norm(y), 0.0, 0.02)


def foam(sec, seed=0):
    """Orange foam earplugs rolled between finger and thumb: tiny squeaks and crinkle, very close."""
    r = rng("foam", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    cr = conv(scatter(n, 260, r, 1.0), hp(r.standard_normal(ns(0.0015)), 2600, 2) * np.exp(-np.arange(ns(0.0015)) / (0.0004 * SR)))
    sq = np.zeros(n)
    for k in range(int(sec * 9)):
        a = r.uniform(0, sec - 0.03)
        d = r.uniform(0.008, 0.02)
        tt = ta(d)
        f = r.uniform(2400, 4200) * (1 + 0.3 * tt / d)
        place_m(sq, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / d) * r.uniform(0.2, 0.6), a)
    x = (norm(cr) + 0.5 * norm(sq)) * np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 0.7
    return fade(norm(x), 0.01, 0.02)


def earplug_out(seed=0):
    """The earplug pulled out: a soft suction pop and a breath of air on the ear."""
    r = rng("plugout", seed)
    n = ns(0.08)
    t = np.arange(n) / SR
    f = 140 + 260 * np.exp(-t / 0.008)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.014) + 0.3 * norm(bp(r.standard_normal(n), 1000, 6000, 2) * np.exp(-t / 0.01))
    return fade(norm(x), 0.0005, 0.02)


def earplug_in(seed=0):
    """The foam pushed into the ear: a close crinkle and the occlusion's dull thup."""
    r = rng("plugin", seed)
    n = ns(0.18)
    t = np.arange(n) / SR
    x = 0.6 * norm(foam(0.12, ("pi", seed)))[: n] if n >= ns(0.12) else 0
    y = np.zeros(n)
    place_m(y, x, 0.0)
    y += norm(lp(r.standard_normal(n), 220, 2) * smooth(0.08, 0.1, t) * np.exp(-np.maximum(0, t - 0.1) / 0.03))
    return fade(norm(y), 0.002, 0.03)


def tin_clink(seed=0):
    """Fingers in the little earplug tin."""
    x = np.zeros(ns(0.2))
    for k in range(2):
        place_m(x, metal([(1850, 1, 0.02), (3020, 0.7, 0.015), (4470, 0.45, 0.01), (6900, 0.25, 0.006)], ("tin", seed, k), tick=0.3), 0.05 * k, 1.0 - 0.5 * k)
    return fade(norm(x), 0.0, 0.02)


def phone_speaker(x, muffle=0.0):
    """A small phone speaker: no lows, a peaky midrange, a little breakup; muffle (0..1) presses it into a
    hoodie."""
    y = hp(x, 560, 4)
    y = lp(y, 7000 - 4500 * muffle, 4)
    y = peq(y, 1900, 6, 1.2)
    y = peq(y, 3600, 3, 1.5)
    y = peq(y, 950, 3, 2.0)
    y = np.tanh(1.7 * norm(y)) / np.tanh(1.7)
    return y


def chime(seed=0):
    """A soft message chime (generic): two mallet notes, rising, from the phone's speaker."""
    r = rng("chime", seed)
    n = ns(0.7)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k, m in enumerate((83, 88)):
        f = midi(m)
        tt = t[: n - ns(0.085 * k)]
        y = np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.22) + 0.25 * np.sin(2 * np.pi * 4 * f * tt) * np.exp(-tt / 0.03)
        y *= smooth(0, 0.002, tt)
        place_m(x, y, 0.085 * k, 0.8 + 0.2 * k)
    return fade(phone_speaker(x), 0.0, 0.08)


def ui_ping(n_midi, seed=0):
    """A soft, tuned UI ping (a chat bubble arriving): a clean bell-ish sine with a little glass."""
    f = midi(n_midi)
    t = ta(0.9)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.26) + 0.22 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.11)
    x += 0.07 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.05) + 0.04 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.035)
    x *= smooth(0, 0.003, t)
    return fade(norm(x), 0.0, 0.1)


def ui_tick(seed=0):
    """A muted, unpitched tick (the tapback)."""
    r = rng("uitick", seed)
    n = ns(0.04)
    t = np.arange(n) / SR
    x = bp(r.standard_normal(n), 1500, 4500, 2) * np.exp(-t / 0.0035)
    return fade(norm(x), 0.0, 0.01)


def thud(f=90, tau=0.05, lpf=400, seed=0, click=0.1):
    """A generic dull thump (a bed frame into the wall, a heel in a mattress, a car door far off)."""
    r = rng("thud", f, seed)
    n = ns(max(0.15, tau * 6))
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * (1 + 0.4 * np.exp(-t / 0.01)) * t) * np.exp(-t / tau)
    x = norm(x) + 0.6 * norm(lp(r.standard_normal(n), lpf, 2) * np.exp(-t / (tau * 0.5)))
    x += click * norm(bp(r.standard_normal(n), 1200, 4000, 2) * np.exp(-t / 0.002))
    return fade(norm(x), 0.0005, 0.03)


# ============================================================================================ ambience

def room_tone(sec, kind="night", seed=0):
    """The house's own sound (stereo): a low, slow rumble and a faint air. 'first' is the new house in 2004
    (bigger, hollow: bare rooms ring); 'night' a lived-in bedroom; 'lapse' the time-lapse's flicker."""
    r = rng("room", kind, seed)
    n = ns(sec)
    out = np.zeros((n, 2))
    for c in range(2):
        low = hp(lp(pink(n, r, 0.7), 260, 2), 28, 2)
        air = bp(pink(n, r, 0.4), 300, 4000, 2) * 0.12
        x = low + air
        if kind == "first":
            x = peq(peq(peq(x, 74, 7, 5), 121, 6, 5), 168, 5, 5)
        drift = 1 + 0.18 * wander(n, 0.25, r)
        out[:, c] = x * drift
    out = hp(out, 22, 2)
    return fade(out / np.std(out) * 0.01, 0.02, 0.02)


def furnace(sec, seed=0):
    """Christmas Eve 2025: the furnace running in the basement, heard through the floors and the vents: the
    blower's hum and the air in the ducts."""
    r = rng("furnace", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    wob = 1 + 0.002 * wander(n, 0.5, r)
    hum = 0.5 * np.sin(2 * np.pi * 120 * np.cumsum(wob) / SR) + 0.22 * np.sin(2 * np.pi * 240 * np.cumsum(wob) / SR) + 0.08 * np.sin(2 * np.pi * 361 * t)
    for c in range(2):
        duct = bp(pink(n, r, 0.6), 70, 700, 2) * (1 + 0.15 * wander(n, 0.3, r))
        out[:, c] = lp(duct / np.std(duct) + 0.25 * hum, 900, 2)
    return fade(out / np.std(out) * 0.01, 0.05, 0.05)


def snow_hush(sec, seed=0):
    """Snow falling outside: the soft, smothered quiet (a faint, very smooth air)."""
    r = rng("snow", seed)
    n = ns(sec)
    out = np.zeros((n, 2))
    for c in range(2):
        x = bp(pink(n, r, 0.5), 160, 1300, 2) * (1 + 0.25 * wander(n, 0.15, r))
        out[:, c] = x
    return fade(out / np.std(out) * 0.01, 0.1, 0.1)


def wind(sec, seed=0, gust=1.0, whistle=0.3):
    """Wind on the glass: gusts in band-passed noise, the window's faint whistle at the peaks."""
    r = rng("wind", seed)
    n = ns(sec)
    g = np.clip(0.55 + 0.45 * wander(n, 0.35, r) * gust, 0.08, 1.5)
    out = np.zeros((n, 2))
    for c in range(2):
        body = bp(pink(n, r, 0.6), 140, 950, 2)
        wh = reson(r.standard_normal(n), 640 + 40 * c, 28) + 0.7 * reson(r.standard_normal(n), 930 - 30 * c, 30)
        out[:, c] = body / np.std(body) * g + whistle * wh / np.std(wh) * g**3
    return fade(out / np.std(out) * 0.01, 0.1, 0.1), g


def leaves(sec, gust_env, seed=0):
    """Dry leaves skittering across the porch roof, in runs when the gusts peak."""
    r = rng("leaves", seed)
    n = ns(sec)
    out = np.zeros((n, 2))
    env = np.clip(gust_env[:n] - 0.55, 0, None) ** 1.5
    for c in range(2):
        k = ns(0.004)
        ker = hp(r.standard_normal(k), 1600, 2) * np.exp(-np.arange(k) / (0.0009 * SR))
        x = conv(scatter(n, 180, r, 1.0, env=env / (env.max() + 1e-9)), ker)
        # tumbling runs: a leaf cartwheeling, a dozen scrapes in a row
        for j in range(int(sec * 1.2)):
            a = r.uniform(0, sec - 0.4)
            if env[int(a * SR)] < 0.02:
                continue
            per = r.uniform(0.016, 0.03)
            for q in range(r.integers(6, 14)):
                place_m(x, ker * r.uniform(0.6, 1.4), a + q * per * r.uniform(0.85, 1.15), 2.5)
        out[:, c] = lp(x, 6000, 2)
    return fade(out / (np.std(out) + 1e-9) * 0.01, 0.05, 0.05)


def bark(seed=0):
    """A dog somewhere down the street: one bark (a voiced burst through the snout's formants)."""
    r = rng("bark", seed)
    sec = 0.17
    n = ns(sec)
    t = np.arange(n) / SR
    f0 = 300 + 230 * np.exp(-t / 0.05) * smooth(0, 0.012, t) + 40 * smooth(0, 0.01, t)
    src = polyblep_saw(f0, r) + 0.3 * r.standard_normal(n)
    x = reson(src, 650, 4) + 0.8 * reson(src, 1250, 5) + 0.35 * reson(src, 2700, 6)
    x = x * smooth(0, 0.012, t) * (1 - smooth(0.08, sec, t))
    return fade(norm(x), 0.003, 0.02)


def crickets(sec, count=8, seed=0, chorus=0.4):
    """Field crickets (chirps of 3-5 pulses on a ~4.5 kHz carrier) and a soft tree-cricket chorus, outside."""
    r = rng("crickets", seed)
    n = ns(sec)
    out = np.zeros((n, 2))
    for c in range(count):
        fc = r.uniform(4100, 5200)
        per = r.uniform(0.38, 0.8)
        npul = r.integers(3, 6)
        prate = r.uniform(26, 34)
        amp = r.uniform(0.25, 1.0) ** 1.5
        pan = r.uniform(-0.9, 0.9)
        env = np.zeros(n)
        pl = ns(1 / prate * 0.55)
        shape = np.sin(np.pi * np.arange(pl) / pl) ** 2
        tt = r.uniform(0, per)
        while tt < sec - 0.3:
            for q in range(npul):
                place_m(env, shape, tt + q / prate)
            tt += per * r.uniform(0.92, 1.08)
        ph = 2 * np.pi * np.cumsum(fc * (1 + 0.004 * np.sin(2 * np.pi * 7 * np.arange(n) / SR))) / SR
        y = np.sin(ph) + 0.15 * np.sin(2 * ph)
        out += pan2(y * env * amp, pan)
    if chorus > 0:
        for c in range(2):
            t = np.arange(n) / SR
            am = 0.5 + 0.5 * np.sin(2 * np.pi * r.uniform(45, 55) * t)
            ch = bp(r.standard_normal(n), 2700, 3300, 2) * am**3 * (0.7 + 0.3 * wander(n, 0.4, r))
            out[:, c] += chorus * ch / np.std(ch) * 0.25
    out = lp(out, 7500, 2)
    return fade(out / np.std(out) * 0.01, 0.1, 0.1)


def rain(sec, intensity=1.0, seed=0):
    """Rain: the downpour's wash, drops on the asphalt shingles of the porch roof, sharp ticks on the window
    glass, all a little swept by gusts (stereo, front of the house)."""
    r = rng("rain", seed)
    n = ns(sec)
    gust = np.clip(1 + 0.25 * wander(n, 0.4, r), 0.6, 1.5)
    out = np.zeros((n, 2))
    for c in range(2):
        wash = bp(pink(n, r, 0.45), 350, 8000, 2)
        k1 = ns(0.006)
        roofk = bp(r.standard_normal(k1), 500, 3200, 2) * np.exp(-np.arange(k1) / (0.0016 * SR))
        roof = conv(scatter(n, 2400 * intensity, r, 0.7, env=gust), roofk)
        k2 = ns(0.003)
        glassk = bp(r.standard_normal(k2), 2500, 9000, 2) * np.exp(-np.arange(k2) / (0.0005 * SR))
        glass = conv(scatter(n, 320 * intensity, r, 0.9, env=gust), glassk)
        x = 0.55 * wash / np.std(wash) * gust + 0.8 * roof / (np.std(roof) + 1e-9) + 0.45 * glass / (np.std(glass) + 1e-9)
        out[:, c] = lp(x, 9000, 2)
    return fade(out / np.std(out) * 0.01, 0.05, 0.05)


def gutter(sec, seed=0):
    """The gutter overflowing onto the porch roof: a pouring sheet (bubbles ringing up in pitch) and its
    splash."""
    r = rng("gutter", seed)
    n = ns(sec)
    out = np.zeros((n, 2))
    for c in range(2):
        x = np.zeros(n)
        for k in range(int(sec * 150)):
            a = r.uniform(0, sec - 0.03)
            f0 = np.exp(r.uniform(np.log(500), np.log(2600)))
            tau = r.uniform(0.004, 0.012)
            tt = ta(tau * 5)
            f = f0 * (1 + 0.6 * tt / (tau * 5))
            place_m(x, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / tau), a, r.uniform(0.2, 1.0))
        splash = lp(bp(pink(n, r, 0.3), 300, 5000, 2), 3500, 2) * (1 + 0.3 * wander(n, 3, r))
        out[:, c] = x / np.std(x) * 0.6 + splash / np.std(splash) * 0.8
    return fade(out / np.std(out) * 0.01, 0.05, 0.05)


def thunder(sec, crack=False, seed=0, swells=((0.4, 1.2, 1.0),)):
    """Thunder: a close strike's crack (a tearing run of N-waves) and the rumble (brown noise under slow
    swells: (time, width, gain))."""
    r = rng("thunder", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    env = np.zeros(n)
    for a, wdt, g in swells:
        env += g * np.exp(-0.5 * ((t - a) / wdt) ** 2) * (t > a - 2.5 * wdt)
    env *= smooth(0, 0.05, t)
    cr = np.zeros(n)
    if crack:
        # the tearing crack: a run of N-waves, densest at the start, and its splintered air
        k = ns(0.003)
        nw = np.linspace(1, -1, k) * np.hanning(k)
        for q in range(70):
            a = r.uniform(0, 1) ** 2.2 * 0.32
            place_m(cr, nw * r.uniform(0.2, 1.0) * np.exp(-a / 0.12), a)
        cr = lp(cr, 6500, 2) + 0.25 * norm(lp(r.standard_normal(n), 2500, 2) * np.exp(-t / 0.05))
        cr = norm(cr)
    for c in range(2):
        rum = lp(pink(n, r, 1.0), 170, 2) + 0.35 * bp(pink(n, r, 0.8), 150, 500, 2)
        rum = hp(rum, 28, 4)  # (nothing below hearing)
        x = rum / np.std(rum) * env
        out[:, c] = 0.75 * norm(x) + float(crack) * cr * (0.9 if c == 0 else 1.0)
    return fade(out / np.max(np.abs(out)), 0.002, 0.1)


def birds(sec, density=1.0, seed=0):
    """Distant songbirds (short FM chirps in little trills)."""
    r = rng("birds", seed)
    n = ns(sec)
    out = np.zeros((n, 2))
    for k in range(int(sec * 3 * density) + 1):
        a = r.uniform(0, max(0.01, sec - 0.5))
        pan = r.uniform(-0.8, 0.8)
        f0 = r.uniform(2600, 5200)
        y = np.zeros(ns(0.6))
        for q in range(r.integers(2, 7)):
            d = r.uniform(0.03, 0.08)
            tt = ta(d)
            sweep = f0 * (1 + r.uniform(-0.35, 0.35) * np.sin(np.pi * tt / d * r.uniform(0.5, 1.5)))
            place_m(y, np.sin(2 * np.pi * np.cumsum(sweep) / SR) * np.sin(np.pi * tt / d) ** 2, q * r.uniform(0.06, 0.11))
        place_m(out[:, 0], y * np.sqrt(0.5 * (1 - pan)) * r.uniform(0.3, 1), a)
        place_m(out[:, 1], y * np.sqrt(0.5 * (1 + pan)) * r.uniform(0.3, 1), a)
    out = lp(out, 7000, 2)
    return fade(out / (np.std(out) + 1e-9) * 0.01, 0.05, 0.05)


def lawnmower(sec, seed=0):
    """A lawnmower a few gardens away."""
    r = rng("mower", seed)
    n = ns(sec)
    f = 49 * (1 + 0.03 * wander(n, 0.8, r))
    saw = polyblep_saw(f, r)
    x = lp(saw, 1100, 2) + 0.3 * bp(r.standard_normal(n), 300, 2000, 2)
    x *= 0.7 + 0.3 * wander(n, 0.5, r)
    x = lp(x, 900, 2)
    return fade(np.stack([x, x * 0.8], axis=1) / np.std(x) * 0.01, 0.05, 0.05)


def car_pass(sec, seed=0):
    """A car on the street, passing: tyre roar swelling and fading, left to right, through the windows."""
    r = rng("carpass", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    env = np.exp(-0.5 * ((t - sec * 0.5) / (sec * 0.2)) ** 2)
    x = bp(pink(n, r, 0.5), 150, 1800, 2)
    x = lp(x, 1500, 2)
    pan = np.linspace(-0.7, 0.7, n)
    th = (pan + 1) * np.pi / 4
    out = np.stack([x * np.cos(th), x * np.sin(th)], axis=1) * np.sqrt(2) * env[:, None]
    return fade(out / np.max(np.abs(out)), 0.05, 0.05)


def tyres_on_snow(sec, seed=0):
    """A car rolling slowly into the drive on fresh snow: the tread's crunch and squeak, the engine idling."""
    r = rng("tyres", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    v = 1 - smooth(0, sec, t) ** 1.5  # slowing to a stop
    k = ns(0.008)
    ker = bp(r.standard_normal(k), 400, 3500, 2) * np.exp(-np.arange(k) / (0.0018 * SR))
    crunch = conv(scatter(n, 900, r, 0.8, env=v), ker)
    eng = lp(polyblep_saw(np.full(n, 26.0) * (1 + 0.01 * wander(n, 1, r)), r), 220, 2)
    x = lp(crunch / (np.std(crunch) + 1e-9), 2400, 2) + 0.5 * eng / np.std(eng)
    x *= smooth(0, 0.25, t)
    return fade(np.stack([x, x], axis=1) / np.std(x) * 0.01, 0.1, 0.05)


# ============================================================================================ instruments

class Music:
    """The score's buses: the close sound (dry) and the send to the score's room; every note's onset."""

    def __init__(self):
        self.dry = bus()
        self.send = bus()
        self.onsets = []

    def add(self, x, t, pan=0.0, gain=1.0, send=0.25, name="", note=None):
        place(self.dry, x, t, gain, pan)
        place(self.send, x, t, gain * send, pan)
        self.onsets.append((t, name, note))

    def cut(self, t, f=0.06):
        """Everything already written stops at t (a hard cut in the picture), over f seconds."""
        i = int(t * SR)
        k = ns(f)
        for b in (self.dry, self.send):
            b[i : i + k] *= _ramp(k, False)[:, None]
            b[i + k :] = 0

    def fade(self, t0, t1):
        i0, i1 = int(t0 * SR), int(t1 * SR)
        for b in (self.dry, self.send):
            b[i0:i1] *= _ramp(i1 - i0, False)[:, None]
            b[i1:] = 0


PIANO_G = 0.5
PAD_G = 0.14
_PIANO = {}


def piano_raw(n, held, vel, seed=0, tail=2.6):
    key = (int(n), round(held, 3), round(vel, 3), seed, tail)
    if key not in _PIANO:
        _PIANO[key] = fp.piano(int(n), held=held, vel=vel, tail=tail, seed=seed)
    return _PIANO[key]


def piano(M, t, n, vel=0.3, held=1.2, gain=1.0, distant=False, seed=0):
    """A felt piano note (scripts/feltpiano.py), close-miked and spread across the keyboard; 'distant' is the
    drift's piano: heavier felt, further away."""
    x = piano_raw(n, held, vel, seed)
    comp = (midi(n) / 261.6) ** 0.32
    if distant:
        x = lp(x, 1400, 2) * 0.6
    pan = float(np.clip((n - 62) / 34, -0.45, 0.45))
    M.add(x * comp * gain * PIANO_G, t, pan=pan, send=0.6 if distant else 0.22, name="piano", note=n)


def chord(M, t, notes, vel, held, roll=0.03, distant=False, gain=1.0):
    for i, m in enumerate(notes):
        piano(M, t + i * roll, m, vel * (1 - 0.05 * i), held, gain=gain, distant=distant, seed=i)


def pedal(M, t, down=True):
    """The sustain pedal's own sound (kept, close-miked): the felt thump going down, the dampers' swish."""
    r = rng("pedal", round(t, 3), down)
    n = ns(0.3)
    tt = np.arange(n) / SR
    if down:
        x = lp(r.standard_normal(n), 170, 2) * np.exp(-tt / 0.025) + 0.15 * bp(r.standard_normal(n), 900, 3000, 2) * np.exp(-tt / 0.008)
    else:
        x = bp(r.standard_normal(n), 500, 2600, 2) * np.sin(np.pi * np.clip(tt / 0.18, 0, 1)) ** 2
    M.add(fade(norm(x), 0.001, 0.05) * 0.0035, t, pan=0.0, send=0.1, name="pedal")


def music_box(n, vel=0.5, seed=0):
    """A music-box tine: a steel cantilever plucked by a pin (a clean fundamental with its paired tine
    beating slowly, the bright 6.27x bending mode at the attack, the pin's tick), on a small wooden box."""
    r = rng("mbox", n, seed)
    f = midi(n)
    t = ta(3.2)
    tau = float(np.clip(2.2 * (523.25 / f) ** 0.5, 0.8, 3.0))
    glide = 1 + 0.002 * np.exp(-t / 0.015)
    ph = 2 * np.pi * np.cumsum(f * glide) / SR
    env = 0.72 * np.exp(-t / tau) + 0.28 * np.exp(-t / (0.18 * tau))
    x = np.sin(ph + r.uniform(0, 6.28)) * env
    x += 0.32 * np.sin(2 * np.pi * np.cumsum(f * 2 ** (0.9 / 1200) * glide) / SR + r.uniform(0, 6.28)) * env
    x += 0.09 * np.sin(2 * ph) * np.exp(-t / (0.3 * tau))
    f2 = 6.267 * f
    if f2 < 16000:
        x += 0.2 * np.sin(2 * np.pi * f2 * t) * np.exp(-t / 0.03)
    x = x * smooth(0, 0.0015, t) + 0.12 * hp(r.standard_normal(len(t)), 2500, 2) * np.exp(-t / 0.0006)
    x = x + 0.3 * reson(x, 1100, 2) + 0.2 * reson(x, 2400, 3)
    return fade(norm(x) * vel, 0.0, 0.3)


def mbox(M, t, n, vel=0.5):
    M.add(music_box(n, vel, seed=int(t * 100)) * 0.22, t, pan=0.12, send=0.32, name="musicbox", note=n)


def celesta_note(n, vel=0.4, seed=0):
    """A celesta: a felt hammer on a steel bar over a wooden resonator (a round fundamental, a little of
    the octave and twelfth, the bar's upper mode gone in a moment)."""
    r = rng("cel", n, seed)
    f = midi(n)
    t = ta(2.6)
    tau = float(np.clip(1.4 * (523.25 / f) ** 0.6, 0.45, 2.4))
    x = np.sin(2 * np.pi * f * t) * (0.62 * np.exp(-t / tau) + 0.38 * np.exp(-t / (0.2 * tau)))
    x += 0.14 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (0.35 * tau)) + 0.06 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / (0.2 * tau))
    x += 0.05 * np.sin(2 * np.pi * 4.07 * f * t) * np.exp(-t / 0.05)
    x = x * smooth(0, 0.0025, t) + 0.04 * bp(r.standard_normal(len(t)), 2000, 6000, 2) * np.exp(-t / 0.001)
    return fade(norm(x) * vel, 0.0, 0.3)


def celesta(M, t, n, vel=0.4, pan=-0.15):
    M.add(celesta_note(n, vel, seed=int(t * 100)) * 0.2, t, pan=pan, send=0.38, name="celesta", note=n)


def brush_tap(seed=0, accent=1.0):
    """A brush on the snare: the bristles' spread of tiny hits, the wires' buzz, a little of the head."""
    r = rng("brush", seed)
    n = ns(0.3)
    t = np.arange(n) / SR
    imp = np.zeros(n)
    for k in range(r.integers(5, 9)):
        imp[int(r.uniform(0, 0.009) * SR)] += r.uniform(0.3, 1.0)
    wires = bp(conv(imp, r.standard_normal(ns(0.002))), 2200, 9000, 2)
    wires = conv(wires, np.exp(-np.arange(ns(0.1)) / (0.03 * SR)) * r.standard_normal(ns(0.1)) * 0.05) + wires
    head = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.035) * 0.2
    x = norm(bp(wires, 1800, 9500, 2)) * np.exp(-t / 0.07) + head
    return fade(norm(x) * accent, 0.0005, 0.05)


def brush_sweep(sec, seed=0):
    """The other brush stirring circles on the head: a soft, breathing swish."""
    r = rng("sweep", seed)
    n = ns(sec)
    t = np.arange(n) / SR
    x = bp(pink(n, r, 0.3), 2500, 8500, 2)
    shape = np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 1.3 * (0.75 + 0.25 * np.sin(2 * np.pi * t / sec * 2))
    return fade(norm(x * shape), 0.02, 0.05)


def shaker_hit(seed=0, accent=1.0):
    r = rng("shaker", seed)
    n = ns(0.12)
    t = np.arange(n) / SR
    grains = conv(scatter(n, 6000, r, 0.6), np.ones(4))
    x = bp(grains, 3500, 11000, 2) * smooth(0, 0.007, t) * np.exp(-np.maximum(0, t - 0.007) / 0.022)
    return fade(norm(x) * accent, 0.001, 0.02)


def pad_note(n, dur, att=1.6, rel=1.8, cutoff=1000.0, seed=0):
    """A warm analog pad voice: three slightly detuned, slowly drifting saws and a sine under them, through a
    four-pole low-pass with a touch of resonance (stereo)."""
    r = rng("pad", n, seed)
    total = dur + rel
    t = ta(total)
    m = len(t)
    f = midi(n)
    L = np.zeros(m)
    R = np.zeros(m)
    for cents, (gl, gr) in ((-7, (1.0, 0.35)), (6, (0.35, 1.0)), (0, (0.7, 0.7))):
        ff = f * 2 ** (cents / 1200) * (1 + 0.0012 * wander(m, 0.3, r))
        s = polyblep_saw(ff, r)
        L += gl * s
        R += gr * s
    sub = 0.45 * np.sin(2 * np.pi * f * t)
    st = np.stack([L + sub, R + sub], axis=1)
    st = lp(st, cutoff, 4)
    st = peq(st, cutoff * 0.85, 2.5, 1.2)
    env = smooth(0, att, t) * (1 - smooth(dur, dur + rel, t))
    return st * env[:, None] / 2.5


def pad(M, t0, t1, notes, gain=1.0, att=1.6, rel=1.8, cutoff=1000.0):
    for i, m in enumerate(notes):
        x = pad_note(m, t1 - t0, att, rel, cutoff, seed=int(t0 * 10) + i)
        g = gain * (midi(m) / 261.6) ** -0.15 * PAD_G
        place(M.dry, x * g * 0.55, t0)
        place(M.send, x * g * 0.5, t0)
        M.onsets.append((t0, "pad", m))


BODY = {
    # the instrument body's resonances as peaking filters (f, dB, Q)
    "bass": [(62, 6, 1.2), (115, 5, 1.4), (230, 3, 1.4), (480, 2, 1.5), (1100, -4, 1.0)],
    "cello": [(105, 6, 1.2), (205, 5, 1.6), (420, 4, 1.4), (590, 2.5, 1.5), (1400, 3, 1.2), (2600, -4, 1.0)],
    "viola": [(270, 5, 1.4), (460, 4, 1.5), (880, 3, 1.4), (1700, 2, 1.2), (2500, 3, 1.5)],
}


def string_line(notes, t_end, part, dyn, seed=0, vib_cents=14.0):
    """One bowed string player, legato through a line of notes [(t, midi)] to t_end, under a dynamic curve
    dyn(t) (0..1, pp~0.12, mf~0.6): a band-limited Helmholtz (sawtooth) motion whose brightness follows
    the bow, vibrato blooming after each change, the bow's noise, the body's resonances."""
    r = rng("str", part, seed)
    t0 = notes[0][0]
    sec = t_end - t0 + 1.2
    n = ns(sec)
    t = np.arange(n) / SR
    tabs = t0 + t
    lf = np.full(n, np.log(midi(notes[0][1])))
    since = t.copy()
    for tc, m in notes[1:]:
        k = smooth(tc - t0 - 0.035, tc - t0 + 0.045, t)
        lf = lf * (1 - k) + np.log(midi(m)) * k
        since = np.where(t >= tc - t0, t - (tc - t0), since)
    f = np.exp(lf)
    rate = 5.2 + r.uniform(-0.3, 0.3) + 0.15 * wander(n, 0.7, r)
    vib = (vib_cents / 1200 * np.log(2)) * smooth(0.25, 0.75, since) * np.sin(2 * np.pi * np.cumsum(rate) / SR + r.uniform(0, 6))
    jit = 0.0007 * wander(n, 7, r)
    ph = 2 * np.pi * np.cumsum(f * (1 + vib + jit)) / SR
    d = np.clip(dyn(tabs), 0, 1)
    fb = 650 + 3300 * d**1.2
    flut = [wander(n, 9, r) for _ in range(4)]
    x = np.zeros(n)
    fmin = float(f.min())
    K = int(min(60, 10000 / fmin))
    for k in range(1, K + 1):
        a = (1.0 / k) * np.exp(-(k * f) / fb) * (1 + 0.1 * flut[k % 4])
        a = np.where(k * f < 11000, a, 0.0)
        x += a * np.sin(k * ph + r.uniform(0, 6.28))
    bow = bp(r.standard_normal(n), 1200, 5000, 2) * 0.012
    dip = np.ones(n)
    for tc, m in notes[1:]:
        dip -= 0.18 * np.exp(-0.5 * ((t - (tc - t0)) / 0.03) ** 2)
        bow += 0.04 * bp(r.standard_normal(n), 1500, 6000, 2) * np.exp(-0.5 * ((t - (tc - t0)) / 0.02) ** 2)
    amp = d * smooth(0, 0.3, t) * (1 - smooth(t_end - t0, t_end - t0 + 0.6, t)) * dip
    y = (x + bow * (0.4 + d)) * amp
    for fq, g, q in BODY[part]:
        y = peq(y, fq, g, q)
    return lp(y, 7000, 2) * 0.12


def strings_payoff(M):
    """60.5-68.6: the low strings (double bass, two celli, viola) swelling from pp to mf, cresting at 64.2
    (Bm7 to G as you appear in her doorway, A7, home to D with the viola holding the E: Dmaj9 with the
    piano's C#), released into the end card."""

    def dyn(T):
        rise = smooth(60.5, 64.2, T)
        fall = smooth(64.25, 66.4, T)
        d = 0.1 + 0.52 * rise - 0.24 * fall
        return d * (1 - smooth(67.4, 68.6, T))

    lines = {
        "bass": ("bass", [(60.5, 38), (62.43, 35), (64.14, 31), (65.43, 33), (66.29, 38)], 0.4, 8.0),
        "cello1": ("cello", [(60.5, 45), (62.43, 45), (64.14, 47), (65.43, 49), (66.29, 45)], 0.2, 14.0),
        "cello2": ("cello", [(60.9, 54), (62.43, 54), (64.14, 55), (65.43, 55), (66.29, 54)], 0.05, 15.0),
        "viola": ("viola", [(61.4, 62), (63.71, 66), (64.14, 67), (65.43, 64), (66.29, 64)], -0.3, 16.0),
    }
    for i, (key, (part, notes, pan, vc)) in enumerate(lines.items()):
        y = string_line(notes, 68.6, part, dyn, seed=i, vib_cents=vc)
        g = {"bass": 1.1, "cello1": 1.0, "cello2": 0.9, "viola": 0.85}[key] * 0.7
        M.add(y * g, notes[0][0], pan=pan, send=0.42, name="strings", note=notes[0][1])
        for tc, m in notes[1:]:
            M.onsets.append((tc, "strings", m))


Q = 60.0 / 70.0
E8 = Q / 2


def brushes(M, t0, t1):
    """b4: a soft brushed snare (taps on 2 and 4, the other brush sweeping) and a shaker in sixteenths at
    70 BPM; any stroke that would land on a knock is left out."""
    kt = [k["t"] for k in KNOCKS]
    clear = lambda tt: all(not (-0.03 < tt - x < 0.15) for x in kt)
    b = 0
    while t0 + b * Q < t1 - 0.05:
        tb = t0 + b * Q
        if clear(tb):
            M.add(brush_sweep(Q * 0.95, seed=b) * 0.018, tb, pan=-0.1, send=0.2, name="sweep")
        if b % 2 == 1 and clear(tb):
            M.add(brush_tap(seed=b, accent=1.0) * 0.06, tb, pan=-0.05, send=0.2, name="brush")
        for s in range(4):
            ts = tb + s * Q / 4
            if ts < t1 - 0.05 and clear(ts):
                acc = (1.0, 0.45, 0.75, 0.45)[s]
                M.add(shaker_hit(seed=b * 4 + s, accent=acc) * 0.022, ts, pan=0.3, send=0.15, name="shaker")
        b += 1


def score():
    """The whole score, laid out in video seconds."""
    M = Music()
    # ---- b1 0-8: the felt piano enters pianissimo, Dmaj9 to Gmaj7, resting under the knocks
    pedal(M, 0.0)
    piano(M, 0.05, 38, 0.3, 3.3)
    piano(M, 0.07, 45, 0.24, 3.2)
    piano(M, 0.05 + Q, 64, 0.26, 2.4)
    piano(M, 0.05 + 1.5 * Q, 57, 0.2, 2.0)
    piano(M, 0.05 + 2 * Q, 66, 0.27, 1.6)
    piano(M, 0.05 + 3 * Q, 73, 0.24, 0.9)
    pedal(M, 3.46, down=False)
    pedal(M, 3.48)
    chord(M, 3.48, [43, 50, 59], 0.28, 2.2, 0.06)
    piano(M, 5.14, 66, 0.24, 0.65)  # between the two exchanges
    # 6.8: the music box plays the motif in the knocks' own rhythm; the piano answers with an open D
    for k, m in enumerate((78, 76, 74)):
        mbox(M, 6.8 + 0.3 * k, m, 0.5)
    pedal(M, 7.66, down=False)
    pedal(M, 7.68)
    chord(M, 7.7, [50, 57, 62, 66], 0.22, 1.6, 0.025)
    # ---- b2 8-15: the D-A-F# ostinato, celesta sparkles on the night pulses
    piano(M, 8.0, 38, 0.25, 2.3)
    pat = [62, 69, 66]
    for k in range(6):
        piano(M, 8.0 + k * E8, pat[k % 3], 0.3 if k % 3 == 0 else 0.26, 0.6)
    sparkle = [81, 86, 90, 88, 83, 81, 90]
    pulsesN = [k["t"] for k in KNOCKS if k["kind"] == "pulse" and k["side"] == "N" and k["t"] < 10.4]
    for i, tp in enumerate(pulsesN):
        celesta(M, tp + 0.01, sparkle[i % len(sparkle)], 0.33, pan=0.25 * (-1) ** i)
    # 10.4: the hard cut to the fight night: a single held low D
    M.cut(10.4, 0.05)
    piano(M, 10.4, 38, 0.32, 3.45)
    # 13.9: after the grudging exchange, the motif, a little firm and quick; the ostinato picks up again
    piano(M, 13.95, 66, 0.5, 0.25)
    piano(M, 14.15, 64, 0.47, 0.25)
    piano(M, 14.35, 62, 0.45, 0.6)
    piano(M, 14.35, 38, 0.24, 0.65)
    piano(M, 14.35 + E8, 69, 0.27, 0.4)
    M.cut(15.0, 0.04)
    # ---- b3 15-22.5: low Bm(add9) and G under the rain, clear of the knocks; the celesta's motif at 21.0
    pedal(M, 15.3)
    chord(M, 15.3, [35, 42, 50, 61], 0.3, 2.1, 0.06, gain=0.7)
    pedal(M, 17.53, down=False)
    pedal(M, 17.55)
    chord(M, 17.55, [31, 38, 47, 57], 0.28, 1.5, 0.06, gain=0.7)
    pedal(M, 19.2)
    chord(M, 19.2, [35, 42, 50, 61], 0.26, 1.0, 0.06, gain=0.7)
    pedal(M, 20.35)
    chord(M, 20.35, [31, 38, 47, 54], 0.26, 1.5, 0.06, gain=0.7)
    for k, m in enumerate((66, 64, 62)):
        celesta(M, 21.0 + k * E8, m, 0.45, pan=-0.1)
    M.cut(22.5, 0.04)
    # ---- b4 22.5-28: brushes and shaker join the piano at 70 BPM; the motif at 27.2 on piano and music box
    brushes(M, 22.5, 27.95)
    pedal(M, 22.5)
    chord(M, 22.5, [43, 50, 57, 59, 66], 0.28, 1.6, 0.02)
    chord(M, 22.5 + 2 * Q, [45, 52, 59, 61], 0.27, 1.6, 0.02)
    chord(M, 26.05, [47, 54, 57, 62], 0.26, 0.6, 0.02)  # (just after her third, muffled knock)
    for k, m in enumerate((66, 64, 62)):
        piano(M, 27.2 + 0.28 * k, m, 0.34, 0.5 if k < 2 else 1.4)
        mbox(M, 27.2 + 0.28 * k, m + 12, 0.42)
    chord(M, 27.76, [50, 57], 0.22, 1.4, 0.02)
    # ---- b5 28-36: piano alone, sparse, rubato; a barely-there low D under the non-answer; the motif one
    # last time, slower, the D left to decay to nothing by 36.0
    pedal(M, 28.25)
    chord(M, 28.25, [47, 54, 62], 0.24, 0.9, 0.08, gain=0.8)
    piano(M, 29.95, 38, 0.12, 4.3, gain=0.4)
    chord(M, 33.25, [43, 59, 64], 0.2, 0.6, 0.1, gain=0.75)
    pedal(M, 34.78)
    piano(M, 34.8, 66, 0.3, 0.3, gain=0.85)
    piano(M, 35.12, 64, 0.28, 0.3, gain=0.85)
    piano(M, 35.45, 62, 0.27, 0.55, gain=0.85)
    chord(M, 35.45, [50, 57], 0.18, 0.55, 0.02, gain=0.85)
    M.fade(35.55, 36.0)
    # ---- b6/b7 36-47.5: the drift: a warm pad and a distant felt piano; the motif only F#-E (37.4, 40.6);
    # no D anywhere (the chords avoid it: Em(add9), A(add9), Gmaj9 no 5th, F#m7)
    pad(M, 36.0, 39.3, [52, 55, 59, 66], 0.9)
    pad(M, 36.0, 39.3, [40], 0.5)
    pad(M, 39.0, 42.3, [45, 52, 59, 61], 0.9)
    pad(M, 42.0, 44.9, [43, 59, 66, 69], 0.85)
    # b8's thinning: F#m7, the voices leaving one by one until only the E is left, gone by 52.0
    pad(M, 44.7, 48.0, [42], 0.85, rel=1.0)
    pad(M, 44.7, 48.6, [57], 0.85, rel=1.0)
    pad(M, 44.7, 49.2, [61], 0.85, rel=1.0)
    pad(M, 44.7, 50.3, [64], 0.95, rel=1.7)
    piano(M, 36.6, 59, 0.16, 0.8, distant=True)
    piano(M, 37.4, 66, 0.22, 0.4, distant=True)
    piano(M, 37.85, 64, 0.2, 1.2, distant=True)
    chord(M, 38.9, [55, 59], 0.14, 1.0, 0.05, distant=True)
    piano(M, 40.6, 66, 0.22, 0.4, distant=True)
    piano(M, 41.05, 64, 0.2, 1.2, distant=True)
    piano(M, 41.7, 61, 0.14, 0.8, distant=True)
    chord(M, 42.9, [55, 59], 0.13, 1.0, 0.05, distant=True)
    chord(M, 45.4, [57, 61], 0.12, 1.2, 0.05, distant=True)
    M.fade(51.95, 52.0)
    # ---- 52.0-59.0: true silence. 59.0: her third knock lands on D; the full open D major chord and the
    # music box completes the motif
    pedal(M, 58.99)
    chord(M, 59.012, [38, 45, 54, 57, 62], 0.5, 2.8, 0.004, gain=0.7)
    for k, m in enumerate((78, 76, 74)):
        mbox(M, 59.4 + 0.36 * k, m, 0.4)
    # 60.5-66.5: the low strings swell, cresting at 64.2; the b2 ostinato returns underneath; Dmaj9 by 66.5
    strings_payoff(M)
    for k in range(9):
        tk = 62.43 + k * E8
        piano(M, tk, pat[k % 3], 0.26 + 0.08 * float(smooth(62.4, 64.2, tk)) - 0.06 * float(smooth(64.3, 66.3, tk)), 0.6)
    pedal(M, 62.43)
    piano(M, 62.43, 47, 0.26, 1.6)
    pedal(M, 64.12, down=False)
    pedal(M, 64.14)
    piano(M, 64.14, 43, 0.3, 1.2)
    piano(M, 65.43, 45, 0.28, 0.8)
    pedal(M, 66.27, down=False)
    pedal(M, 66.29)
    chord(M, 66.29, [38, 45], 0.3, 1.6, 0.02)
    chord(M, 66.71, [73, 76], 0.2, 0.9, 0.04)
    # ---- the end card: the motif once more, slowly; a final soft Dmaj9 gone by 70.3
    pedal(M, 67.78)
    piano(M, 67.8, 66, 0.3, 0.55)
    piano(M, 68.4, 64, 0.28, 0.55)
    piano(M, 69.0, 62, 0.27, 0.6)
    chord(M, 69.0, [50, 57], 0.17, 0.6, 0.02)
    pedal(M, 69.78)
    chord(M, 69.8, [38, 50, 57, 61, 64, 66], 0.22, 0.35, 0.012)
    M.fade(69.95, 70.3)
    return M


# ============================================================================================ the house, beat by beat

class Buses:
    """The diegetic buses: K the knocks; F foley in the two rooms (into the era's room); H the hallway
    (into the hall); O outside, heard through the windows; A the room tones (a little room); C close inside
    the wall cavity (the macros' own sounds); U the HUD (odometer, chat pings: dry, a touch of room)."""

    def __init__(self):
        for k in "KFHOACU":
            setattr(self, k, bus())
            _BUSNAME[id(getattr(self, k))] = k
        self.subs = []  # (t, gain): the earplug knocks, felt not heard (added after the earplug filter)
        self.close = []  # (t, x, pan): sounds at your own ear (added after the earplug filter)
        self.events = []  # (t, label) for the report


def xpan(x):
    """Pan for a position across the house (x in metres, the shared wall at 0)."""
    return float(np.clip(x / 2.46 * 0.85, -0.9, 0.9))


# the director's stride for the two hurried night walks (direct.ts WALK_STRIDE)
WALK_STRIDE = 1.15


def path_walk(path, t0, speed, k, step_len_scale=0.62):
    """Footfalls along a director's path (walkAlong: a foot lands every half stride, the first a quarter
    stride in): [(t, x, z, distance)]."""
    P = np.array(path, float)
    seg = np.sqrt(((P[1:] - P[:-1]) ** 2).sum(axis=1))
    total = seg.sum()
    stride = step_len_scale * k
    out = []
    d = stride / 4
    while d < total:
        rem = d
        i = 0
        while i < len(seg) - 1 and rem > seg[i]:
            rem -= seg[i]
            i += 1
        p = P[i] + (P[i + 1] - P[i]) * min(1.0, rem / seg[i])
        out.append((t0 + d / speed, p[0], p[1], d))
        d += stride / 2
    return out, t0 + total / speed


def at_dist(path, d):
    P = np.array(path, float)
    seg = np.sqrt(((P[1:] - P[:-1]) ** 2).sum(axis=1))
    rem = d
    i = 0
    while i < len(seg) - 1 and rem > seg[i]:
        rem -= seg[i]
        i += 1
    return P[i] + (P[i + 1] - P[i]) * min(1.0, rem / seg[i])


def dist_to_x(path, x_target, start=0.0):
    """The first distance along the path (from `start`) where it crosses x = x_target."""
    for d in np.arange(start, 20, 0.005):
        p = at_dist(path, d)
        q = at_dist(path, d + 0.005)
        if (p[0] - x_target) * (q[0] - x_target) <= 0 and abs(q[0] - p[0]) > 1e-6:
            return d
    return None


def dist_to_z(path, z_target, start=0.0):
    """The first distance along the path (from `start`) where it crosses z = z_target (a doorway)."""
    for d in np.arange(start, 20, 0.005):
        p = at_dist(path, d)
        q = at_dist(path, d + 0.005)
        if (p[1] - z_target) * (q[1] - z_target) <= 0 and abs(q[1] - p[1]) > 1e-6:
            return d
    return None


def in_hall(z):
    return z < -3.6 - 0.02


def season_bed(B, t0, t1, level, xf=0.06, kind="b2", night=True):
    """The time-lapse's seasons flicking past at low level (the porch-roof schedule in Fixtures.tsx: a
    season every two nights, leaves, snow, rain, summer)."""
    sec = t1 - t0 + 2 * xf
    n = ns(sec)
    tt = t0 - xf + np.arange(n) / SR
    s = np.floor((tt - 8) * 1.5).astype(int) % 4
    # crossfaded masks
    masks = []
    for q in range(4):
        m = (s == q).astype(float)
        m = uniform_filter1d(m, ns(xf))
        masks.append(m)
    w, g = wind(sec, seed=("sb", kind, t0), gust=1.2, whistle=0.15)
    lv = leaves(sec, g, seed=("sb", kind, t0))
    layer0 = w * 0.9 + lv * 0.7
    layer1 = snow_hush(sec, ("sb", kind, t0)) * 0.9 + wind(sec, seed=("sbs", kind, t0), gust=0.5, whistle=0.0)[0] * 0.35
    layer2 = rain(sec, 0.45, seed=("sb", kind, t0)) * 1.0
    if kind == "b2":
        layer3 = birds(sec, 2.5, seed=("sb", t0)) * 0.9 + lawnmower(sec, ("sb", t0)) * 0.35
    else:
        layer3 = crickets(sec, 4, seed=("sb", kind, t0), chorus=0.2) * 0.6 + birds(sec, 0.8, seed=("sbb", t0)) * 0.3
    x = sum(L * m[:, None] for L, m in zip((layer0, layer1, layer2, layer3), masks))
    x = fade(x, xf, xf)
    place(B.O, x * level, t0 - xf)


def odo_spin(B, t0, t1, a, b, level):
    """The drums spinning through a time-lapse: a tick on every increment, which at hundreds a second is a
    soft mechanical purr, the tens and hundreds drums' carries ticking a little louder."""
    sec = t1 - t0
    n = ns(sec)
    t = np.arange(n) / SR
    k = np.clip(t / sec, 0, 1)
    v = a + (b - a) * k**3 * (k * (k * 6 - 15) + 10)
    x = np.zeros(n)
    tick = odo_tick(("spin", t0))
    for place_val, g in ((1, 0.03), (10, 0.12), (100, 0.35)):
        c = np.floor(v / place_val)
        idx = np.nonzero(np.diff(c) > 0)[0]
        for i in idx:
            place_m(x, tick, i / SR, g)
    place(B.U, x * level, t0)


def odo_step(B, t0, level=1.0):
    """One counted step: the pawl kicks the drum (t0) and it drops into its detent as the digit lands."""
    place(B.U, odo_tick(("a", t0)) * 0.05 * level, t0 + 0.03)
    place(B.U, odo_tick(("b", t0)) * 0.085 * level, t0 + 0.27)
    B.events.append((t0, "odometer"))


def clock(B, t0, t1, phase, level, gain_fn=None):
    """The hallway clock ticking once a second (tick, tock), from the hall."""
    tt = math.ceil((t0 - phase) - 1e-9) + phase
    k = 0
    while tt < t1:
        g = level * (gain_fn(tt) if gain_fn else 1.0)
        if g > 0:
            place(B.H, clock_tick(tock=bool(int(round(tt)) % 2), seed=int(round(tt * 10))) * g, tt, pan=0.12)
        tt += 1.0
        k += 1


def place_knocks(B):
    for i, k in enumerate(KNOCKS):
        side = -1 if k["side"] == "N" else 1
        nat, f = stud_natural(i)
        r = rng("kvar", i)
        near, far = knock_dry(k["kind"], f, seed=i, var=10 ** (r.uniform(-0.8, 0.8) / 20))
        lvl = KLEVEL[k["kind"]] * k["gain"]
        place(B.K, near * lvl, k["t"], pan=KPAN * side)
        if far is not None:
            place(B.K, far * lvl, k["t"] + FAR_DELAY, pan=-KPAN * side)
        if k["kind"] == "pulse":
            # distant: more of the house in them
            place(B.H, near * lvl * 0.5, k["t"], pan=0.4 * side)
        if "earplugs" in k.get("note", ""):
            B.subs.append((k["t"], 1.0))


def b1(B):
    """2004, the first night: a bigger, echoey, half-unpacked house; wind on the glass, leaves on the porch
    roof, a dog down the street; the hall light's click, a far door; her taps, your fists, the T-rex."""
    place(B.A, room_tone(8.2, "first", 1), 0.0, 0.55)
    w, g = wind(8.2, seed=1, gust=1.0, whistle=0.35)
    place(B.O, w * 0.8, 0.0)
    place(B.O, leaves(8.2, g, seed=1), 0.0, 0.65)
    for tb, s in ((1.34, 1), (1.71, 2)):
        place(B.O, lp(bark(s), 1500, 2) * 0.012, tb, pan=-0.55)
    place(B.H, switch_click(1) * 0.2, 3.0, pan=0.0)
    B.events.append((3.0, "hall switch"))
    place(B.H, lp(door("close", 1), 2400, 2) * 0.04, 3.42, pan=-0.45)
    place(B.F, cloth(0.45, "cotton", 1) * 0.55, 3.24, pan=0.45)  # you, the duvet to your nose
    place(B.F, cloth(0.42, "quilt", 2) * 0.45, 3.68, pan=-0.45)  # Nora rolls to the wall
    place(B.F, cloth(0.5, "cotton", 3) * 0.55, 5.12, pan=0.45)  # you roll to the wall
    for tk in (5.9, 6.2, 6.5):
        place(B.F, shelf_jolt(1.0, ("b1", tk), trex=True) * 0.06, tk + 0.004, pan=0.22)
    place(B.F, trex_fall(1) * 0.075, 6.73, pan=0.22)
    B.events.append((6.73, "T-rex falls"))
    odo_step(B, 6.7)
    place(B.F, cloth(0.6, "quilt", 4) * 0.4, 6.62, pan=-0.45)  # Nora, the quilt over her laugh
    place(B.F, cloth(0.55, "cotton", 5) * 0.5, 7.28, pan=0.45)  # you burrow down


def b2(B):
    """2004-2008: the time-lapse (distant knock pairs, the seasons flicking past), then the fight night of
    2007 in real time: crickets, the hall clock, the note's paper, the macro, the grudging knocks."""
    place(B.A, room_tone(2.5, "night", 21), 8.0, 0.4)
    place(B.A, room_tone(1.2, "night", 22), 13.9, 0.4)
    season_bed(B, 8.0, 10.4, 1.25, kind="b2")
    season_bed(B, 13.9, 15.0, 1.25, kind="b2")
    odo_spin(B, 8.0, 10.4, 1, 897, 0.055)
    odo_spin(B, 14.3, 15.0, 898, 1520, 0.055)
    # real time, 10.4-13.9
    place(B.A, room_tone(3.6, "night", 23), 10.4, 0.45)
    place(B.O, crickets(3.6, 5, seed=2, chorus=0.25), 10.4, 0.55)
    clock(B, 10.4, 13.9, 0.0, 0.04)
    place(B.F, cloth(0.25, "sheet", 21) * 0.25, 11.33, pan=-0.4)  # she unfolds her arms
    place(B.F, paper(0.36, "slide", 1) * 0.11, 11.4, pan=-0.3)
    place(B.F, paper(0.26, "scrape", 2) * 0.13, 11.98, pan=-0.1)
    place(B.F, cloth(0.25, "sheet", 22) * 0.22, 12.42, pan=-0.4)
    # the macro: inside the wall, close (the cavity's own sounds, not hollowed)
    place(B.C, flutter(0.62, 2.6, 1) * 0.06, 12.33, pan=-0.05)
    place(B.C, paper_tap(1) * 0.12, 12.97, pan=-0.05)
    B.events.append((12.97, "note lands"))
    odo_step(B, 13.9)


def b3(B):
    """2009, 2:14 AM: heavy rain on the glass and the porch roof, the gutter overflowing, thunder (a close
    crack at 15.0), eleven urgent knocks; she comes: the quilt, bare feet, her door, the hall's creak, your
    door, the pillow and quilt on the rug; Moose's tags and paws, his flop. The thunder rolls away by 22.5."""
    place(B.A, room_tone(7.6, "night", 31), 15.0, 0.4)
    place(B.O, rain(7.6, 1.0, seed=3), 15.0, 1.4)
    place(B.O, gutter(7.6, seed=3), 15.0, 0.64)
    # thunder: the crack with the 15.0 flash; 15.8's rolls in after the knocks; 19.5's; 21.0's far off
    place(B.O, thunder(3.0, True, 1, swells=((0.25, 0.35, 1.0), (0.9, 0.6, 0.55))) * 0.3, 15.0)
    B.events.append((15.0, "thunder crack"))
    place(B.O, thunder(3.5, False, 2, swells=((0.6, 0.5, 0.7), (1.5, 0.7, 1.0), (2.4, 0.6, 0.5))) * 0.2, 17.25)
    place(B.O, thunder(3.0, False, 3, swells=((0.5, 0.45, 1.0), (1.3, 0.6, 0.6))) * 0.18, 20.0)
    place(B.O, thunder(1.6, False, 4, swells=((0.45, 0.35, 0.7), (0.9, 0.4, 0.35))) * 0.09, 21.25)
    # you
    place(B.F, cloth(0.3, "cotton", 31) * 0.4, 15.78, pan=0.45)
    place(B.F, cloth(0.5, "cotton", 32) * 0.4, 17.45, pan=0.45)
    # Nora: the quilt thrown back, up, feet down, the bundle gathered
    place(B.F, cloth(0.42, "quilt", 33) * 0.65, 17.62, pan=-0.5)
    place(B.F, cloth(0.35, "sheet", 34) * 0.4, 18.0, pan=-0.5)
    place(B.F, step("bare", "wood", 0.5, 31) * 0.025, 18.41, pan=-0.62)
    place(B.F, step("bare", "wood", 0.5, 32) * 0.025, 18.46, pan=-0.55)
    place(B.F, cloth(0.3, "quilt", 35) * 0.55, 18.32, pan=-0.55)
    path = [(-1.18, -3.0), (-1.5, -3.35), (-1.52, -3.95), (-1.15, -4.32), (1.15, -4.32), (1.52, -3.95), (1.52, -3.35), (1.42, -2.75)]
    steps, arrive = path_walk(path, 18.6, 2.7, 0.9, step_len_scale=WALK_STRIDE)
    for j, (ts, x, z, d) in enumerate(steps):
        hall = in_hall(z)
        place(B.H if hall else B.F, step("bare", "wood", 0.55, ("n09", j)) * (0.022 if hall else 0.025), ts, pan=xpan(x))
    # the quilt dragging behind her, all the way
    drag = cloth(arrive - 18.6 + 0.1, "quilt", 36, rms=0.05)
    nd = len(drag)
    pans = [xpan(at_dist(path, (q / nd) * (arrive - 18.6) * 2.7)[0]) for q in range(0, nd, ns(0.05))]
    pv = np.interp(np.arange(nd), np.arange(0, nd, ns(0.05)), pans)
    th = (pv + 1) * np.pi / 4
    place(B.F, np.stack([drag * np.cos(th), drag * np.sin(th)], axis=1) * np.sqrt(2) * 0.28, 18.6)
    d_her = dist_to_z(path, -3.66)
    t_her = 18.6 + d_her / 2.7
    place(B.H, door("open", 31) * 0.062, t_her - 0.06, pan=xpan(-1.4))
    d_mid = dist_to_x(path, 0.05, 1.5)
    place(B.H, creak(0.42, 150, 210, 31) * 0.055, 18.6 + d_mid / 2.7 - 0.1, pan=0.0)
    d_yours = dist_to_z(path, -3.66, d_mid)
    t_yours = 18.6 + d_yours / 2.7
    place(B.H, door("open", 32) * 0.062, t_yours - 0.06, pan=xpan(1.4))
    B.events += [(t_her, "her door"), (t_yours, "your door"), (arrive, "she arrives")]
    place(B.F, pillow(31, big=1.6) * 0.1, arrive + 0.2, pan=xpan(1.42))
    place(B.F, flop(0.35, 31, 0.3) * 0.09, arrive + 0.5, pan=xpan(1.42))
    place(B.F, flop(0.6, 32, 0.5) * 0.11, arrive + 0.85, pan=xpan(1.42))
    place(B.F, cloth(0.5, "quilt", 37) * 0.35, arrive + 0.9, pan=xpan(1.42))
    # Moose: lifts his head in the hall as she passes; trots after her (tags, paws), and drops at her feet
    place(B.H, tags(1, 1) * 0.02, 18.65, pan=xpan(-0.7))
    dpath = [(-0.7, -4.36), (1.15, -4.36), (1.52, -3.98), (1.56, -3.4), (2.03, -2.95), (2.03, -1.6)]
    stride = 0.42
    dsteps, darrive = path_walk(dpath, 19.0, 1.9, 1.0, step_len_scale=stride * 1.6)
    for j, (ts, x, z, d) in enumerate(dsteps):
        hall = in_hall(z)
        fl = "wood" if hall or z < -3.35 else "rug"
        place(B.H if hall else B.F, paw(fl, ("m", j)) * 0.017, ts, pan=xpan(x))
        place(B.H if hall else B.F, paw(fl, ("m2", j)) * 0.012, ts + 0.012, pan=xpan(x))
        if j % 2 == 0:
            place(B.H if hall else B.F, tags(int(rng("tg", j).integers(1, 3)), ("m", j)) * 0.01, ts + 0.02, pan=xpan(x))
    # (he waits at her feet until she's down; the director's flop runs over 0.45 s from max(arrive + 0.15, 21.8))
    t_flop = max(darrive + 0.15, 21.8) + 0.3
    place(B.F, flop(0.45, 33, 0.35) * 0.05, t_flop, pan=xpan(2.0))
    place(B.F, tags(2, 9) * 0.012, t_flop + 0.01, pan=xpan(2.0))
    B.events.append((t_flop, "Moose flops"))


def b4(B):
    """2011, 11:52 PM: her phone's tinny pop loop and message chimes, her heels drumming, the bed bumping
    the wall; the pillow off your head, the tin, the earplugs rolled and in; 24.8-26.2 the earplugs (the
    whole mix low-passed, her knocks only felt); 26.2 one out, the mix opening right ear first; your knocks."""
    place(B.A, room_tone(5.6, "night", 41), 22.5, 0.45)
    place(B.O, wind(5.6, seed=41, gust=0.6, whistle=0.0)[0], 22.5, 0.35)
    # the phone (on her side, its tiny speaker): 22.5-25.0 in her hand; 25.0-27.3 on her chest; then up again
    loop = pop_loop(5.6)
    t = np.arange(len(loop)) / SR + 22.5
    m = smooth(24.95, 25.25, t) * (1 - smooth(27.25, 27.5, t))
    sp = phone_speaker(loop) * (1 - m) + phone_speaker(loop, muffle=0.85) * m * 0.5
    place(B.F, sp * 0.012, 22.5, pan=-0.5)
    for tc, s in ((22.78, 1), (23.62, 2)):
        place(B.F, chime(s) * 0.019, tc, pan=-0.5)
    # her heels on the mattress, the bed frame bumping the wall
    for j, th_ in enumerate(np.arange(22.6, 24.0, 0.2415)):
        place(B.F, thud(62, 0.035, 220, ("heel", j), 0.0) * 0.05, th_, pan=-0.55)
    for j, tb in enumerate((22.836, 23.319, 23.802)):
        place(B.F, thud(92, 0.045, 380, ("bed", j), 0.15) * 0.05, tb, pan=-0.2)
        B.events.append((tb, "bed bumps the wall"))
    # you: the pillow off your head, the tin on the shelf, the foam rolled, in
    place(B.F, cloth(0.3, "cotton", 41) * 0.35, 23.92, pan=0.42)
    place(B.F, pillow(41, 0.6) * 0.05, 24.08, pan=0.5)
    place(B.F, tin_clink(1) * 0.018, 24.27, pan=0.22)
    place(B.F, foam(0.3, 1) * 0.013, 24.33, pan=0.32)
    B.close.append((24.7, earplug_in(1) * 0.05, 0.25))
    place(B.F, cloth(0.3, "sheet", 42) * 0.3, 25.08, pan=-0.45)  # she rolls to the wall
    # 26.2 the right earplug out (at your ear), you roll and knock; 27.2 back in
    B.close.append((26.18, earplug_out(1) * 0.06, 0.6))
    place(B.F, cloth(0.35, "hoodie", 43) * 0.35, 26.15, pan=0.45)
    odo_step(B, 27.1)
    B.close.append((27.2, foam(0.14, 2) * 0.03, 0.55))
    place(B.F, cloth(0.25, "sheet", 44) * 0.2, 27.3, pan=-0.45)


def pop_loop(sec, seed=0):
    """The song on her phone: an instrumental synth-pop loop at 140 BPM (twice the score's 70) in D major,
    D-Bm-G-A: a plucked arpeggio, a square-lead hook, kick, clap, hats, bass. No vocals."""
    r = rng("pop", seed)
    n = ns(sec)
    x = np.zeros(n)
    beat = 60 / 140
    t_start = -0.62  # already playing when we cut in
    chords = [(62, 66, 69), (59, 62, 66), (55, 59, 62), (57, 61, 64)]
    roots = [38, 35, 31, 33]
    hook = [[81, None, 78, 81, 83, None, 81, None], [78, None, 74, 78, 81, None, 78, None], [79, None, 83, 86, 83, None, 81, None], [81, 85, None, 88, 85, None, 81, None]]
    bar = 4 * beat
    nb = int((sec - t_start) / bar) + 2
    for b in range(nb):
        tb = t_start + b * bar
        ci = b % 4
        for s in range(16):
            ts = tb + s * beat / 4
            if 0 <= ts < sec - 0.2:
                m = chords[ci][(0, 1, 2, 1)[s % 4]] + 12
                y = ta(0.18)
                pl = lp(polyblep_saw(np.full(len(y), midi(m)), r), 2500, 2) * np.exp(-y / 0.07)
                place_m(x, pl * 0.25, ts)
        for e in range(8):
            ts = tb + e * beat / 2
            hm = hook[ci][e]
            if hm and 0 <= ts < sec - 0.3:
                y = ta(0.2)
                ph = np.cumsum(np.full(len(y), midi(hm))) / SR
                sq = np.where((ph % 1.0) < 0.3, 1.0, -1.0)
                place_m(x, lp(sq, 4500, 2) * smooth(0, 0.005, y) * np.exp(-y / 0.15) * 0.2, ts)
            if 0 <= ts < sec - 0.1 and e % 2 == 1:
                place_m(x, hp(r.standard_normal(ns(0.03)), 7000, 2) * np.exp(-ta(0.03) / 0.008) * 0.12, ts)
            if 0 <= ts < sec - 0.3:
                y = ta(0.2)
                place_m(x, lp(polyblep_saw(np.full(len(y), midi(roots[ci])), r), 500, 2) * np.exp(-y / 0.12) * 0.3, ts)
        for q in range(4):
            tq = tb + q * beat
            if 0 <= tq < sec - 0.2:
                y = ta(0.12)
                place_m(x, np.sin(2 * np.pi * np.cumsum(70 + 110 * np.exp(-y / 0.01)) / SR) * np.exp(-y / 0.05) * 0.6, tq)
                if q % 2 == 1:
                    c = np.zeros(ns(0.12))
                    for o in (0, 0.009, 0.018):
                        place_m(c, bp(r.standard_normal(ns(0.1)), 900, 4000, 2) * np.exp(-ta(0.1) / (0.012 if o < 0.018 else 0.05)), o)
                    place_m(x, c * 0.35, tq)
    return fade(norm(x), 0.0, 0.05)


def b5(B):
    """2013, her last night: late-August crickets, a far car; her clear knocks; 2.5 s of crickets only;
    her softer knocks; the sleeping bag; you roll over, forehead to the wall; your soft knocks; her palm on
    the wall; the odometer's last tick and the detent's lock at 35.3."""
    place(B.A, room_tone(8.1, "night", 51), 28.0, 0.5)
    place(B.O, crickets(8.1, 10, seed=5, chorus=0.5), 28.0, 0.78)
    place(B.O, car_pass(1.6, 5) * 0.012, 28.05)
    place(B.F, cloth(0.4, "nylon", 51) * 0.18, 28.15, pan=-0.45)
    place(B.F, cloth(0.85, "nylon", 52) * 0.3, 33.05, pan=-0.45)
    place(B.F, cloth(0.5, "cotton", 53) * 0.4, 33.45, pan=0.45)
    place(B.F, thud(115, 0.02, 300, "forehead", 0.0) * 0.022, 33.93, pan=0.3)
    B.events.append((33.93, "forehead to the wall"))
    place(B.F, thud(140, 0.015, 500, "palm", 0.05) * 0.042, 34.47, pan=-0.3)
    B.events.append((34.47, "her palm on the wall"))
    odo_step(B, 34.8)
    place(B.U, odo_detent(1) * 0.09, 35.3)
    B.events.append((35.3, "odometer detent (lock)"))


def b6(B):
    """2013-2016: the time-lapse (room tone, the seasons at low level); 2014 in real time: mom's treadmill
    (motor, belt, sneakers, the wall's dull thuds, the stop key and its soft beep, the run-down, her two
    staggering steps and the whump onto the carpet); then hangers and laundry piling up, packing tape, a
    door closing."""
    place(B.A, room_tone(6.1, "first", 61), 36.0, 0.45)
    season_bed(B, 36.0, 37.0, 1.0, kind="drift")
    season_bed(B, 38.8, 42.0, 1.0, kind="drift")
    place(B.O, birds(1.9, 1.0, seed=61), 37.0, 0.35)
    place(B.F, treadmill_run() * 0.6, 37.0, pan=-0.45)
    for j, k in enumerate([k for k in KNOCKS if k["kind"] == "grey"]):
        place(B.F, step("sneaker", "deck", 1.0, ("mom", j)) * 0.07, k["t"], pan=-0.5)
    place(B.F, plastic([(1350, 1, 0.01), (2400, 0.6, 0.006)], "console", thud=0.6) * 0.06, 37.93, pan=-0.5)
    place(B.F, stop_beep() * 0.025, 37.97, pan=-0.5)
    B.events.append((37.93, "treadmill stop"))
    # (carried off the belt's end by 38.27, two staggering steps, the flop lands at 38.7)
    place(B.F, step("sneaker", "carpet", 1.0, "off") * 0.06, 38.22, pan=-0.55)
    for j, ts in enumerate((38.32, 38.45)):
        place(B.F, step("sneaker", "carpet", 0.9, ("stag", j)) * 0.06, ts, pan=-0.6)
    place(B.F, flop(1.0, "mom", 0.6) * 0.1, 38.69, pan=-0.7)
    place(B.F, cloth(0.4, "cotton", 61) * 0.3, 38.67, pan=-0.7)
    place(B.F, plastic([(2600, 1, 0.006), (4100, 0.5, 0.004)], "readers", thud=0.1) * 0.01, 38.75, pan=-0.75)
    B.events.append((38.69, "mom's whump"))
    # the laundry rack growing (time-lapse)
    r = rng("laundry")
    for j in range(9):
        th_ = 38.9 + j * 0.16 + r.uniform(0, 0.06)
        place(B.F, hanger(("h", j)) * 0.022, th_, pan=-0.5 + r.uniform(-0.1, 0.1))
        if j % 2 == 0:
            place(B.F, cloth(0.25, "towel", ("l", j)) * 0.25, th_ + 0.03, pan=-0.5)
    place(B.F, tape_screech(0.32, 1) * 0.025, 39.64, pan=0.55)
    place(B.F, tape_screech(0.24, 2) * 0.021, 40.02, pan=0.5)
    place(B.H, door("close", 61) * 0.06, 40.0, pan=xpan(1.5))
    B.events.append((40.44, "door closes"))


def treadmill_run():
    """Mom's treadmill, 37.0-38.8: the motor's whir and its controller's faint whine, the rollers and belt,
    the belt seam slapping round; she hits stop at 37.93 and it winds down."""
    sec = 1.9
    n = ns(sec)
    t = np.arange(n) / SR
    r = rng("tread")
    T = 37.0 + t
    v = np.where(T < 37.93, 1.0, np.clip(1 - (T - 37.93) / 0.85, 0, 1) ** 1.6)
    fm = 140 * v
    ph = 2 * np.pi * np.cumsum(fm) / SR
    motor = sum((0.6 / k) * np.sin(k * ph) for k in range(1, 9))
    whine = 0.08 * np.sin(2 * np.pi * np.cumsum(3400 * v) / SR) * v
    roll = lp(pink(n, r, 0.8), 260, 2) * (1 + 0.4 * np.sin(2 * np.pi * np.cumsum(10.8 * v) / SR)) * v
    hiss = bp(r.standard_normal(n), 800, 4000, 2) * 0.25 * v
    x = norm(motor) * 0.45 + whine + norm(roll) * 0.6 + norm(hiss) * 0.25
    for ts in (37.42, 38.0):
        if ts < 38.4:
            place_m(x, thud(160, 0.012, 1200, ("seam", ts), 0.4) * 0.25 * float(np.interp(ts, T, v)), ts - 37.0)
    x = x * smooth(0, 0.02, t) * (1 - smooth(sec - 0.2, sec, t))
    return fade(norm(x) * 0.035, 0.005, 0.1)


def stop_beep():
    t = ta(0.16)
    x = np.sin(2 * np.pi * 1975 * t) * smooth(0, 0.005, t) * (1 - smooth(0.11, 0.16, t))
    return fade(x + 0.1 * np.sin(2 * np.pi * 3950 * t) * (1 - smooth(0.11, 0.16, t)), 0.002, 0.02)


def b7(B):
    """2016-2024: the rooms empty at dusk; very low wind, snow hush and rain crossfading with the seasons;
    a soft tuned ping as each bubble arrives (F# then E, never D); the tapback's muted tick."""
    place(B.A, room_tone(5.6, "first", 71), 42.0, 0.4)
    season_bed(B, 42.0, 47.5, 0.8, xf=0.18, kind="drift")
    for tp, m, pan in ((42.5, 78, -0.3), (43.2, 76, 0.3), (44.3, 78, 0.3), (45.0, 76, -0.3), (45.9, 78, -0.3)):
        place(B.U, ui_ping(m, int(tp * 10)) * 0.043, tp, pan=pan)
        B.events.append((tp, f"ping {midi_name(m)}"))
    place(B.U, ui_tick(1) * 0.05, 46.6, pan=0.3)
    B.events.append((46.6, "tapback tick"))


def b8(B):
    """Christmas Eve 2025: tyres on snow, two car doors, the front door far below; then the house at night:
    the furnace, the snow's hush, the hall clock once a second; your phone face-down; the air mattress's
    vinyl under her; while your knuckles hover, only the clock."""
    place(B.A, room_tone(1.6, "night", 81), 47.5, 0.1)
    place(B.O, snow_hush(1.6, 81), 47.5, 0.1)
    place(B.O, tyres_on_snow(1.1, 1) * 1.1, 47.5, pan=0.0)
    for tc, s in ((48.6, 1), (48.8, 2)):
        place(B.O, lp(thud(88, 0.05, 500, ("cardoor", s), 0.4), 900, 2) * 0.05, tc, pan=0.15)
    place(B.H, lp(thud(70, 0.06, 260, "frontdoor", 0.2), 400, 2) * 0.036, 48.94, pan=0.0)
    B.events += [(48.6, "car door"), (48.8, "car door"), (48.94, "front door below")]


def b9(B):
    """The payoff: your knocks (the T-rex tips), the wait with two clock ticks, her knocks, the macro, the
    grin; her eleven; you up with your pillow (pillows tumbling, feet, your door, the hall's creak), her
    vinyl as she scoots, the pillow on the rug; the string lights' switch far off at 66.8."""
    for tk in (55.0, 55.3, 55.6):
        place(B.F, shelf_jolt(0.6, ("b9", tk), trex=True) * 0.035, tk + 0.004, pan=0.22)
    place(B.F, trex_fall(9, size=0.7) * 0.1, 55.84, pan=0.22)
    B.events.append((55.84, "T-rex tips"))
    place(B.U, metal([(2200, 1, 0.004), (3700, 0.5, 0.003)], "unlock", tick=0.3) * 0.02, 59.07)
    odo_step(B, 59.1, 1.1)
    place(B.F, cloth(0.42, "cotton", 91) * 0.4, 60.1, pan=0.45)  # back from the roll
    place(B.F, cloth(0.3, "cotton", 92) * 0.25, 60.5, pan=0.4)  # the grin into the pillow
    # 62.0 up with your pillow
    place(B.F, cloth(0.62, "cotton", 93) * 0.45, 62.0, pan=0.45)
    place(B.F, creak(0.3, 210, 260, 91) * 0.03, 62.25, pan=0.45)
    for j, tp in enumerate((62.36, 62.52)):
        place(B.F, pillow(("deco", j), 0.5) * 0.025, tp, pan=0.75)
    for j, ts in enumerate((62.58, 62.63)):
        place(B.F, step("sock", "wood", 0.5, ("feet", j)) * 0.045, ts, pan=0.62)
    place(B.F, creak(0.25, 260, 200, 92) * 0.025, 62.62, pan=0.45)
    path = [(1.18, -3.0), (1.5, -3.35), (1.52, -3.95), (1.15, -4.32), (-1.15, -4.32), (-1.52, -3.95), (-1.52, -3.35), (-1.42, -2.75)]
    steps, arrive = path_walk(path, 62.85, 2.35, 1.0, step_len_scale=WALK_STRIDE)
    for j, (ts, x, z, d) in enumerate(steps):
        hall = in_hall(z)
        place(B.H if hall else B.F, step("sock", "wood", 0.6, ("y27", j)) * (0.025 if hall else 0.04), ts, pan=xpan(x))
    carry = cloth(arrive - 62.85, "cotton", 94, rms=0.05)
    place(B.F, carry * 0.15, 62.85, pan=0.0)
    d_door = dist_to_z(path, -3.66)
    t_door = 62.85 + d_door / 2.35
    place(B.H, door("open", 91) * 0.05, t_door - 0.06, pan=xpan(1.4))
    d_mid = dist_to_x(path, 0.05, 1.5)
    t_mid = 62.85 + d_mid / 2.35
    place(B.H, creak(0.45, 140, 200, 93) * 0.1, t_mid - 0.1, pan=0.0)
    B.events += [(t_door, "your door"), (t_mid, "hall creak"), (arrive, "you arrive")]
    # Nora scoots to the wall, pats the rug
    place(B.F, vinyl(0.32, "squeak", 91) * 0.03, 64.42, pan=-0.35)
    place(B.F, cloth(0.3, "sheet", 95) * 0.25, 64.42, pan=-0.35)
    for j, tp in enumerate((64.72, 64.95)):
        place(B.F, thud(180, 0.012, 700, ("pat", j), 0.05) * 0.018, tp, pan=xpan(-1.12))
    place(B.F, pillow(95, 0.8) * 0.064, arrive + 0.35, pan=xpan(-1.38))
    B.events.append((arrive + 0.35, "pillow on the rug"))
    place(B.F, flop(0.4, 91, 0.3) * 0.07, arrive + 0.72, pan=xpan(-1.4))
    place(B.F, flop(0.5, 92, 0.35) * 0.08, arrive + 1.08, pan=xpan(-1.4))
    place(B.F, flop(0.6, 93, 0.5) * 0.09, arrive + 1.45, pan=xpan(-1.4))
    place(B.F, cloth(0.5, "cotton", 96) * 0.3, arrive + 1.1, pan=xpan(-1.4))
    # mom, at the far end of the hall, switches the string lights off
    place(B.H, lp(switch_click(9), 5000, 2) * 0.1, 66.8, pan=0.55)
    B.events.append((66.8, "string lights switch"))


def house_2025(B):
    """Christmas Eve's house sounds under b8, b9 and the end card: the furnace, the snow's hush, the room;
    the hall clock 47.5-67.5 (tick on x.4 s: two ticks in the wait, the third under her first knock)."""
    place(B.A, room_tone(22.6, "night", 99), 49.0, 0.05)
    place(B.A, furnace(22.6, 1), 49.0, 0.045)
    place(B.O, snow_hush(22.6, 99), 49.0, 0.05)
    clock(B, 47.5, 67.5, 0.4, 0.11, gain_fn=lambda tt: 0.55 if tt < 49.0 else 1.0)
    place(B.F, vinyl(0.45, "creak", 81) * 0.045, 49.45, pan=-0.4)
    place(B.F, phone_down(1) * 0.09, 50.6, pan=0.42)
    B.events.append((50.6, "phone face-down"))
    place(B.F, vinyl(0.5, "creak", 82) * 0.04, 53.7, pan=-0.4)


def diegetic():
    B = Buses()
    place_knocks(B)
    for f in (b1, b2, b3, b4, b5, b6, b7, b8, house_2025, b9):
        f(B)
    return B


# ============================================================================================ the mix

ROOMS["cavity"] = dict(rt=0.22, pre=0.0008, er=0.6, n=12, span=0.006, hf=0.5, seed=7)
ROOM_PLAN = [
    (0.0, 8.0, "empty04", 0.34, 0.1),
    (8.0, 10.4, "bedroom", 0.22, 0.06),
    (10.4, 13.9, "bedroom", 0.2, 0.06),
    (13.9, 15.0, "bedroom", 0.22, 0.04),
    (15.0, 22.5, "bedroom", 0.2, 0.06),
    (22.5, 28.0, "bedroom", 0.2, 0.06),
    (28.0, 36.0, "stripped", 0.26, 0.06),
    (36.0, 42.0, "stripped", 0.28, 0.06),
    (42.0, 47.5, "stripped", 0.25, 0.06),
    (47.5, DUR + 0.5, "bedroom", 0.22, 0.4),
]
# the score's room, cut with the picture's hard cuts (the D at 27.76 rings over the cut into b5)
MUSIC_VERB_PLAN = [(0.0, 10.4, 0.12), (10.4, 15.0, 0.1), (15.0, 22.5, 0.06), (22.5, 28.0, 1.8), (28.0, 36.0, 0.0), (36.0, 52.0, 0.0), (59.0, DUR + 0.5, 0.0)]
# the music's gates: (start fading, silent from, silent until, back by)
MUSIC_GATES = [(35.55, 36.0, 36.08, 36.25), (51.4, 52.0, 59.0, 59.0), (69.95, 70.3, 99.0, 99.0)]


def tvec(n):
    return np.arange(n) / SR


def music_render(M):
    wet = era_verb(M.send, [(a, b, "score", 1.0, keep) for a, b, keep in MUSIC_VERB_PLAN])
    m = M.dry + wet
    t = tvec(len(m))
    g = np.ones(len(m))
    for a, b, c, d in MUSIC_GATES:
        down = smooth(a, b, t)
        up = smooth(c, d, t) if d > c else (t >= c).astype(float)
        g *= 1 - down * (1 - up)
    return m * g[:, None]


def duck_curve(n, depth=None):
    """-4 dB under every knock: down over 15 ms just before it, held 150 ms, back over 300 ms. depth(k)
    may give a knock its own depth (dB)."""
    t = tvec(n)
    db = np.zeros(n)
    for k in KNOCKS:
        a = k["t"]
        d = DUCK_DB if depth is None else depth(k)
        i0, i1 = int((a - 0.03) * SR), min(n, int((a + 0.5) * SR))
        tt = t[i0:i1]
        c = d * smooth(a - 0.02, a - 0.005, tt) * (1 - smooth(a + 0.15, a + 0.45, tt))
        db[i0:i1] = np.minimum(db[i0:i1], c)
    return 10 ** (db / 20)


def hollow(x):
    """Inside the wall: low-passed and close, the cavity's resonances (the 2.4 m height, the 40 cm stud bay,
    the 9 cm depth) lifting it."""
    y = lp(x, 780, 4)
    for f, g, q in ((72, 6, 2), (145, 4, 3), (476, 7, 4), (952, 4, 5)):
        y = peq(y, f, g, q)
    return lowshelf(y, 120, 4)


def macro_mask(n):
    t = tvec(n)
    m = np.zeros(n)
    for a, b in EV["macro"]:
        m = np.maximum(m, smooth(a - 0.02, a + 0.02, t) * (1 - smooth(b - 0.02, b + 0.02, t)))
    return m


def cavity_tone(n):
    """The cavity's own close tone: a low, still air; in 2007 the nightlight's outlet box hums faintly."""
    r = rng("cavtone")
    t = tvec(n)
    x = bp(pink(n, r, 0.8), 30, 140, 2)
    x = x / np.std(x) * 0.006
    hum = (0.004 * np.sin(2 * np.pi * 60 * t) + 0.002 * np.sin(2 * np.pi * 120 * t)) * (t < 30)
    y = x + hum
    return np.stack([y, y * 0.95], axis=1)


def earplug_masks(n):
    t = tvec(n)
    e0, e1 = EV["earplugs"]
    on = smooth(e0 - 0.12, e0, t)
    mL = on * (1 - smooth(e1 + 0.1, e1 + 0.45, t))
    mR = on * (1 - smooth(e1 - 0.01, e1 + 0.05, t))
    return mL, mR


def earplugs(x):
    """24.8-26.2: the whole mix through foam earplugs (a heavy low-pass, the occluded ear's low boost);
    the right ear opens first at 26.2, the left a beat later."""
    mL, mR = earplug_masks(len(x))
    y = lowshelf(lp(x, 250, 4), 110, 5) * 0.9
    out = x.copy()
    out[:, 0] = x[:, 0] * (1 - mL) + y[:, 0] * mL
    out[:, 1] = x[:, 1] * (1 - mR) + y[:, 1] * mR
    return out


# per-bus trims (dB) applied when the buses are rendered
TRIM = {"K": -6.0, "F": 7.0, "H": 6.0, "O": 0.0, "A": 2.0, "C": 0.0, "U": 3.0}


def diegetic_render(B):
    for k, v in TRIM.items():
        if v:
            setattr(B, k, getattr(B, k) * 10 ** (v / 20))
    room = era_verb(B.K + B.F, ROOM_PLAN)
    H = lp(B.H, 6500, 2)
    hall = H * 0.7 + verb(H, "hall", 0.5)
    # the weather outside steps back 5 dB under every knock (it never covers one), 8 dB under the storm's
    # eleven
    O = lp(B.O, 5500, 2) * duck_curve(len(B.O), lambda k: -8.0 if 15 < k["t"] < 22.5 else -5.0)[:, None]
    out = O + verb(O, "outdoor", 0.22) + verb(O, "bedroom", 0.12)
    amb = B.A + verb(B.A, "bedroom", 0.15)
    die = B.K + B.F + room + hall + out + amb
    m = macro_mask(len(die))
    die = die * (1 - m)[:, None] + (hollow(die) + cavity_tone(len(die))) * m[:, None]
    die += B.C + verb(B.C, "cavity", 0.5)
    ui = B.U + verb(B.U, "bedroom", 0.08)
    return die, ui


def post_earplugs(B, n):
    """What the earplugs don't stop: the knocks felt through the pillow, the body's own low hum, and the
    sounds right at your ear."""
    x = np.zeros((n, 2))
    for t0, g in B.subs:
        place(x, sub_thump(int(t0 * 100)) * 0.12 * g, t0, pan=-0.2)
    mL, mR = earplug_masks(n)
    r = rng("occl")
    body = bp(pink(n, r, 0.9), 30, 90, 2)
    body = body / np.std(body) * 0.0035
    x += np.stack([body * mL, body * mR], axis=1)
    for t0, y, pan in B.close:
        place(x, y, t0, pan=pan)
    return x


def assemble(die, ui, mus, extra, mg):
    duck = duck_curve(len(mus))
    mix = die + ui + mus * (mg * duck)[:, None]
    mix = earplugs(mix) + extra
    mix = hp(mix, 22, 2)[:N]
    return fade(mix, 0.01, 0.03)


# ============================================================================================ loudness

_K1 = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
_K2 = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def kweight(x):
    y = signal.lfilter(_K1[0], _K1[1], x, axis=0)
    return signal.lfilter(_K2[0], _K2[1], y, axis=0)


def block_loudness(x, win=0.4, hop=0.1):
    """BS.1770 loudness of blocks (LUFS) and their centre times."""
    y = kweight(x if x.ndim == 2 else np.stack([x, x], axis=1))
    p = np.sum(y**2, axis=1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    w, h = ns(win), ns(hop)
    starts = np.arange(0, max(1, len(p) - w + 1), h)
    ms = (c[starts + w] - c[starts]) / w
    return -0.691 + 10 * np.log10(ms + 1e-20), (starts + w / 2) / SR


def integrated(x):
    L, _ = block_loudness(x, 0.4, 0.1)
    z = 10 ** ((L + 0.691) / 10)
    g = L > -70
    if not g.any():
        return -99.0
    lr = -0.691 + 10 * np.log10(np.mean(z[g])) - 10
    g2 = g & (L > lr)
    return float(-0.691 + 10 * np.log10(np.mean(z[g2])))


def true_peak_db(x):
    up = signal.resample_poly(x, 4, 1, axis=0)
    return float(20 * np.log10(np.max(np.abs(up)) + 1e-12))


def limit(x, ceil_db=TP_CEIL, look=0.0015, rel=0.025):
    """A look-ahead true-peak limiter: the gain each sample needs (from the 4x oversampled peak), held over
    the look-ahead and smoothed so it never lets a peak through; a gentle release."""
    thr = 10 ** (ceil_db / 20)
    for _ in range(4):
        up = signal.resample_poly(x, 4, 1, axis=0)
        pk = np.max(np.abs(up), axis=1)
        m = len(pk) // 4
        pk = pk[: m * 4].reshape(m, 4).max(axis=1)
        pk = np.concatenate([pk, np.zeros(len(x) - m)])
        g = np.minimum(1.0, thr / np.maximum(pk, 1e-9))
        if g.min() >= 0.9995:
            break
        L = ns(look)
        g = minimum_filter1d(g, 2 * L + 1)
        g = uniform_filter1d(g, L + 1)
        gd = 20 * np.log10(np.maximum(g, 1e-6))
        a = np.exp(-1 / (rel * SR))
        sm = signal.lfilter([1 - a], [1, -a], gd)
        gd = np.minimum(gd, sm)
        x = x * (10 ** (gd / 20))[:, None]
    return x


def music_level(die, ui, mus, extra, mg):
    """The music's median short-term loudness (where it plays) once the whole mix is normalised."""
    mix = assemble(die, ui, mus, extra, mg)
    G = 10 ** ((TARGET_LUFS - integrated(mix)) / 20)
    L, _ = block_loudness(mus[:N] * mg * G, 3.0, 0.1)
    act = L[L > -50]
    return (float(np.median(act)) if len(act) else -99.0), G


def master(die, ui, mus, extra, verbose=True):
    """Set the music so it sits at its target short-term loudness in the finished mix (the median where it
    plays), normalise to -16 LUFS integrated, limit the true peak. Returns the mix, the music's gain and
    the total gain the whole mix got."""
    # secant search on the music's gain (dB): the music's level after normalisation rises with it, but
    # less than 1:1 because the music is much of what is being normalised
    x0, x1 = -10.0, -25.0
    f0 = music_level(die, ui, mus, extra, 10 ** (x0 / 20))[0] - MUSIC_ST
    f1 = music_level(die, ui, mus, extra, 10 ** (x1 / 20))[0] - MUSIC_ST
    for it in range(8):
        if abs(f1) < 0.15 or f1 == f0:
            break
        x2 = float(np.clip(x1 - f1 * (x1 - x0) / (f1 - f0), -60, 10))
        x0, f0 = x1, f1
        x1 = x2
        f1 = music_level(die, ui, mus, extra, 10 ** (x1 / 20))[0] - MUSIC_ST
        if verbose:
            print(f"  music {x1:+.1f} dB -> its short-term median {f1 + MUSIC_ST:.1f} LUFS")
    mg = 10 ** (x1 / 20)
    mix = assemble(die, ui, mus, extra, mg)
    G_total = 1.0
    for it in range(3):
        g = 10 ** ((TARGET_LUFS - integrated(mix)) / 20)
        G_total *= g
        mix = limit(mix * g)
    return mix, mg, G_total


# ============================================================================================ writing

def write_wav24(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    r = rng("dither")
    lsb = 1 / 8388608
    d = (r.random(x.shape) - r.random(x.shape)) * lsb
    q = np.clip(np.round((x + d) * 8388607), -8388608, 8388607).astype("<i4")
    b = q.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(b)


def write_mp3(wav, mp3):
    os.makedirs(os.path.dirname(mp3), exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "320k", "-ar", str(SR), mp3], check=True)


def ffmpeg_loudness(path):
    p = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", path, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    txt = p.stderr[p.stderr.rfind("Summary:") :]
    out = {}
    for line in txt.splitlines():
        line = line.strip()
        for key in ("I:", "LRA:", "Peak:"):
            if line.startswith(key):
                out[key[:-1]] = float(line.split()[1])
    return out


def build(verbose=True):
    if verbose:
        print("score ...")
    M = score()
    mus = music_render(M)
    if verbose:
        print("house ...")
    B = diegetic()
    die, ui = diegetic_render(B)
    extra = post_earplugs(B, len(die))
    if verbose:
        print("mix ...")
    mix, mg, G = master(die, ui, mus, extra, verbose)
    return dict(M=M, B=B, mus=mus, die=die, ui=ui, extra=extra, mix=mix, mg=mg, G=G)


# ============================================================================================ the report

def _env(x, band, smooth_ms=0.4):
    if band == "hi":
        y = hp(x, 1500, 4)
    elif band == "mid":
        y = bp(x, 150, 3000, 2)
    else:
        y = bp(x, 40, 600, 2)
    e = np.abs(y)
    return uniform_filter1d(e, max(1, ns(smooth_ms * 1e-3)))


def knock_onsets(mix):
    """Each knock's onset found in the rendered mix (the knocker's channel): the first moment its band's
    envelope climbs a third of the way from the floor just before it to its peak."""
    envs = {}
    for ch in (0, 1):
        envs[(ch, "hi")] = _env(mix[:, ch], "hi")
        envs[(ch, "mid")] = _env(mix[:, ch], "mid", 1.0)
        envs[(ch, "lo")] = _env(mix[:, ch], "lo", 2.0)
    e0, e1 = EV["earplugs"]
    rows = []
    for i, k in enumerate(KNOCKS):
        ch = 0 if k["side"] == "N" else 1
        muff = e0 <= k["t"] <= e1
        band = "lo" if (k["kind"] in ("pulse", "grey") or muff) else "mid" if k["kind"] in ("fist", "soft", "urgent") else "hi"
        env = envs[(ch, band)]
        a, b = int((k["t"] - 0.05) * SR), int((k["t"] + 0.06) * SR)
        seg = env[a:b]
        floor = float(np.percentile(env[int((k["t"] - 0.075) * SR) : int((k["t"] - 0.02) * SR)], 90))
        pk = float(seg.max())
        thr = floor + 0.33 * (pk - floor)
        j = int(np.argmax(seg > thr))
        rows.append((i, k, a / SR + j / SR, band, 20 * np.log10(pk / max(floor, 1e-9))))
    return rows


def stud_measure(i):
    k = KNOCKS[i]
    nat, f = stud_natural(i)
    if f is None:
        return None
    r = rng("kvar", i)
    near, _ = knock_dry(k["kind"], f, seed=i, var=10 ** (r.uniform(-0.8, 0.8) / 20))
    seg = near[ns(0.015) : ns(0.2)]
    seg = seg * np.hanning(len(seg))
    X = np.abs(np.fft.rfft(seg, n=SR * 4))
    fr = np.fft.rfftfreq(SR * 4, 1 / SR)
    m = (fr > 100) & (fr < 1000)
    fpk = float(fr[m][np.argmax(X[m])])
    return nat, f, fpk


def mix_peak_pitch(mix, t, side, lo=120, hi=800):
    ch = 0 if side == "N" else 1
    seg = mix[int((t + 0.02) * SR) : int((t + 0.16) * SR), ch]
    seg = seg * np.hanning(len(seg))
    X = np.abs(np.fft.rfft(seg, n=SR * 4))
    fr = np.fft.rfftfreq(SR * 4, 1 / SR)
    m = (fr > lo) & (fr < hi)
    return float(fr[m][np.argmax(X[m])])


def cents(f, ref):
    return 1200 * math.log2(f / ref)


def report(R, outdir):
    os.makedirs(outdir, exist_ok=True)
    mix, mus, M, B, G, mg = R["mix"], R["mus"], R["M"], R["B"], R["G"], R["mg"]
    print("\n================ KNOCK TIMING (rendered mix vs script.json; one frame = 33.3 ms)")
    rows = knock_onsets(mix)
    worst = 0.0
    for i, k, t_det, band, snr in rows:
        d = (t_det - k["t"]) * 1000
        worst = max(worst, abs(d))
        print(f"  #{i:02d} {k['t']:7.3f}s {k['side']} {k['kind']:6s} g{k['gain']:.2f}  found {t_det:7.3f}s  {d:+6.1f} ms  ({band}, {snr:4.1f} dB over the floor)")
    print(f"  worst |offset| {worst:.1f} ms  ->  {'OK, all within one frame' if worst < 1000 / FPS else 'OUT OF SYNC'}")
    starts = []
    for i, k in enumerate(KNOCKS):
        nat, f = stud_natural(i)
        near, _ = knock_dry(k["kind"], f, seed=i)
        j = int(np.argmax(np.abs(near) > 0.05 * np.max(np.abs(near))))
        starts.append(round(k["t"] * SR) / SR + j / SR - k["t"])
    print(f"  each knock as placed (its sound's onset vs script.json): max |offset| {1000 * max(abs(x) for x in starts):.2f} ms")

    print("\n================ STUD RESONANCE PITCH (each knock's ring, natural -> shifted onto the motif)")
    for i, k in enumerate(KNOCKS):
        s = stud_measure(i)
        if s is None:
            continue
        nat, f, fpk = s
        if k["kind"] in ("pulse",) and i % 4 not in (0, 1):
            continue
        print(f"  #{i:02d} {k['t']:7.3f}s {k['side']} {k['kind']:6s} {midi_name(PITCHES[i]):4s} target {midi(PITCHES[i]):7.2f} Hz  natural {nat:7.2f} ({cents(nat, midi(PITCHES[i])):+5.1f} c)  played {f:7.2f}  measured peak {fpk:7.2f} Hz ({cents(fpk, midi(PITCHES[i])):+5.1f} c)")
    print("  b9 in the finished mix (dominant peak 120-800 Hz, 20-160 ms after each knock):")
    for i, k in enumerate(KNOCKS):
        if 54.9 < k["t"] < 59.1:
            fpk = mix_peak_pitch(mix, k["t"], k["side"])
            print(f"    {k['t']:6.2f}s {k['side']} expected {midi_name(PITCHES[i]):4s} -> {fpk:7.2f} Hz = {midi_name(69 + 12 * math.log2(fpk / 440))} ({cents(fpk, midi(PITCHES[i])):+5.1f} c)")

    print("\n================ MUSIC CHECKS")
    bad = []
    for t, name, note in M.onsets:
        if name in ("pedal", "strings", "pad", "sweep"):
            continue  # (bowed and swelled entries have no attack to cover a knock)
        for k in KNOCKS:
            if k["kind"] in ("pulse", "grey"):
                continue  # the time-lapse heartbeat and the treadmill run under the music by design
            if -0.03 < t - k["t"] < 0.15 and not (abs(k["t"] - 59.0) < 0.01) and not (abs(t - 13.95) < 0.01):
                bad.append((t, name, note, k["t"]))
    print(f"  note attacks landing on a knock (-30..+150 ms; the 59.0 chord and the 13.95 motif are meant to): {len(bad)}", *[f"\n    {b}" for b in bad[:12]])
    dnotes = [(round(t, 2), name, midi_name(n)) for t, name, n in M.onsets if n is not None and 36.0 <= t < 59.0 and int(n) % 12 == 2]
    print(f"  D played anywhere 36.0-59.0 (must be none): {dnotes if dnotes else 'none'}")
    i0, i1 = int(52.0 * SR), int(59.0 * SR)
    print(f"  music bus peak 52.0-59.0: {np.max(np.abs(mus[i0:i1])):.2e} (true silence: 0)")
    i2 = int(70.3 * SR)
    print(f"  music bus peak after 70.3: {np.max(np.abs(mus[i2:N])):.2e}")
    seg = mix[int(55.95 * SR) : int(58.35 * SR)]
    Lw, tw = block_loudness(seg, 0.4, 0.05)
    Lt, tt2 = block_loudness(seg, 0.05, 0.01)
    ticks = [round(t + 55.95, 2) for t, l in zip(tt2, Lt) if l > np.median(Lt) + 10]
    ticks = [x for i, x in enumerate(ticks) if i == 0 or x - ticks[i - 1] > 0.2]
    print(f"  the wait 55.9-58.4 in the mix: room tone {np.median(Lw):.1f} LUFS (momentary median); what stands out of it: {ticks} (the clock)")

    print("\n================ LOUDNESS (finished mix)")
    print(f"  music gain {20*np.log10(mg):+.1f} dB, normalisation {20*np.log10(G):+.1f} dB")
    Lm, tm = block_loudness(mus[:N] * mg * G, 3.0, 0.1)
    act = Lm[Lm > -45]
    print(f"  music short-term (3 s) where playing: median {np.median(act):.1f}, p75 {np.percentile(act, 75):.1f}, max {act.max():.1f} LUFS")
    dg = (R["die"][:N] + R["ui"][:N]) * G
    Ld, td = block_loudness(dg, 3.0, 0.1)
    Lmom, tmom = block_loudness(dg, 0.4, 0.05)
    groups = []
    for k in KNOCKS:
        if k["kind"] in ("pulse", "grey"):
            continue
        if groups and k["t"] - groups[-1][-1] < 0.6:
            groups[-1].append(k["t"])
        else:
            groups.append([k["t"]])
    print("  knock exchanges: knocks+foley short-term (3 s), their momentary (400 ms) max, the music's short-term (3 s) there,")
    print("  and how far under the knocks the music sits (momentary max minus the music):")
    for g in groups:
        c = (g[0] + g[-1]) / 2
        ld = float(np.interp(c, td, Ld))
        lmo = float(np.max(Lmom[(tmom > g[0] - 0.05) & (tmom < g[-1] + 0.3)]))
        lmu = float(np.interp(c, tm, Lm))
        rel = f"{lmo - lmu:+5.1f} dB" if lmu > -90 else "  (no music: the silence)"
        print(f"    {g[0]:6.2f}-{g[-1]:6.2f}s  knocks/foley ST {ld:6.1f}  M max {lmo:6.1f}  music ST {lmu:6.1f}  music under the knocks {rel}")
    # how clear each knock is: its own band (1-6 kHz, first 60 ms) against everything else in the mix
    print("\n================ MASKING (each knock against everything else in the mix, first 80 ms, in its own band:")
    print("  the body 100-1000 Hz for every knock, plus the contact 1-6 kHz for the crisp kinds)")
    kn = (B.K + era_verb(B.K, ROOM_PLAN))[:N] * G
    rest = mix - kn
    worst = {"body": 99.0, "contact": 99.0}
    for i, k in enumerate(KNOCKS):
        if k["kind"] in ("pulse", "grey") or EV["earplugs"][0] <= k["t"] <= EV["earplugs"][1]:
            continue
        ch = 0 if k["side"] == "N" else 1
        a, b = int(k["t"] * SR), int((k["t"] + 0.08) * SR)
        out = []
        bands = [("body", 100, 1000)] + ([("contact", 1000, 6000)] if k["kind"] in ("tap", "hard", "urgent") else [])
        for name, lo, hi in bands:
            ek = np.mean(bp(kn[a - 2000 : b, ch], lo, hi, 2)[2000:] ** 2)
            er = np.mean(bp(rest[a - 2000 : b, ch], lo, hi, 2)[2000:] ** 2)
            snr = 10 * np.log10(ek / max(er, 1e-15))
            worst[name] = min(worst[name], snr)
            out.append(f"{name} {snr:+5.1f}")
        if min(float(x.split()[1]) for x in out) < 6:
            print(f"    #{i:02d} {k['t']:6.2f}s {k['kind']:6s} " + ", ".join(out) + " dB")
    print(f"  weakest: body {worst['body']:+.1f} dB, contact {worst['contact']:+.1f} dB (positive: the knock is louder than everything else in its band)")

    print("\n================ CLICK SCAN (energy above 14 kHz jumping far over its local level, away from any placed sound)")
    known = sorted(set([k["t"] for k in KNOCKS] + [k["t"] + FAR_DELAY for k in KNOCKS] + [t for t, _ in PLACED] + [t for t, _, _ in M.onsets]))
    known = np.array(known)
    hf = np.abs(hp(mix, 14000, 4)).max(axis=1)
    hf = uniform_filter1d(hf, 24)
    loc = uniform_filter1d(hf, ns(0.08)) + 1e-9
    ratio = hf / loc
    cand = np.nonzero((ratio > 6) & (hf > 10 ** (-70 / 20)))[0]
    sus = []
    last = -1.0
    for c in cand:
        tt = c / SR
        if tt - last < 0.03:
            continue
        last = tt
        near = known[(known > tt - 0.9) & (known < tt + 0.02)]
        if len(near) == 0:
            sus.append((round(tt, 3), round(float(ratio[c]), 1), round(float(20 * np.log10(hf[c] + 1e-12)), 1)))
    print(f"  {len(sus)} unexplained", sus[:20])
    # the seams the code makes (cuts, gates, crossfades): the largest sample-to-sample step at each
    seams = [10.4, 13.9, 15.0, 22.5, 28.0, 35.55, 36.0, 36.08, 36.25, 51.4, 52.0, 59.0, 69.95, 70.3] + [x for ab in EV["macro"] for x in ab] + list(EV["earplugs"]) + [b[0] for b in ROOM_PLAN]
    d1 = np.abs(np.diff(mix, axis=0)).max(axis=1)
    worst = []
    for sm in sorted(set(seams)):
        i = int(sm * SR)
        if np.any(np.abs(known - sm) < 0.015):
            continue
        if 0 < i < N - 1:
            w = d1[i - ns(0.01) : i + ns(0.01)]
            ref = np.percentile(d1[i - ns(0.3) : i + ns(0.3)], 99.5) + 1e-9
            worst.append((sm, round(float(w.max() / ref), 2)))
    print("  seams (largest step within +-10 ms over the local 99.5th percentile step; <~1.5 is smooth):", worst)

    # ---- plots
    paths = [overview_png(R, os.path.join(outdir, "audio-overview.png"))]
    for name, a, b, title in (
        ("audio-b1.png", 2.8, 7.9, "b1 2004: the hall switch 3.0, her taps 4.0-4.6 (L), your fists 5.9-6.5 (R), the T-rex, the music box motif 6.8"),
        ("audio-b2.png", 10.2, 15.1, "b2 2007: clock, paper, the macro 12.3-13.1 (hollow), grudging knocks, the quick motif 13.9"),
        ("audio-storm.png", 14.8, 22.6, "b3 2009: the crack at 15.0, eleven urgent knocks, the walk, the celesta motif 21.0"),
        ("audio-earplugs.png", 22.4, 28.2, "b4 2011: the phone loop, the earplugs 24.8-26.2 (muffled, sub-thumps), right ear opens 26.2, the motif 27.2"),
        ("audio-lastnight.png", 28.0, 36.3, "b5 2013: knocks, 2.5 s of crickets, softer knocks, your answer, the last motif, the detent 35.3"),
        ("audio-drift.png", 36.0, 52.5, "b6-b8: treadmill, the pad, F#-E only, chat pings F#/E, the E alone fading out by 52.0"),
        ("audio-payoff.png", 51.5, 61.0, "52.0-59.0 true silence (room, clock), your F# E E, the wait, her F# E D, the D chord at 59.0"),
        ("audio-end.png", 60.5, 71.5, "b9-end: her eleven, the walk, the crest 64.2, the Dmaj9, the end motif, gone by 70.3, three knocks"),
    ):
        marks = [(k["t"], k["side"]) for k in KNOCKS if a <= k["t"] <= b and k["kind"] != "pulse"]
        paths.append(plot_sound(os.path.join(outdir, name), mix, title, a, b, marks=marks))
    print("\nwrote", *paths, sep="\n  ")
    return paths


def overview_png(R, path):
    from PIL import Image, ImageDraw

    mix, mus, G, mg = R["mix"], R["mus"], R["G"], R["mg"]
    W, x0 = 1800, 80
    Hs, Hw, Hl = 380, 140, 220
    H = 60 + Hs + 20 + Hw + 20 + Hl + 50
    im = Image.new("RGB", (W + x0 + 20, H), (12, 12, 16))
    d = ImageDraw.Draw(im)
    f, fs = _font(14), _font(11)
    X = lambda t: x0 + int(t / DUR * W)
    d.text((x0, 10), "TOLD BY THE WALL - soundtrack overview (finished mix, -16 LUFS)  blue: Nora's knocks (L)  amber: yours (R)  grey: treadmill", fill=(235, 235, 235), font=f)
    spec, fy = spectro_img(mix.mean(axis=1), 0, DUR, W, Hs, floor_db=-110)
    y0 = 60
    im.paste(Image.fromarray(spec), (x0, y0))
    for fq in (50, 100, 200, 500, 1000, 2000, 5000, 10000):
        y = y0 + int(np.argmin(np.abs(fy - fq)))
        d.text((10, y - 7), f"{fq if fq < 1000 else str(fq // 1000) + 'k'} Hz", fill=(170, 170, 170), font=fs)
    for b in S["beats"]:
        d.line([(X(b["t0"]), 40), (X(b["t0"]), H - 40)], fill=(80, 80, 95))
        d.text((X(b["t0"]) + 3, 40), b["name"], fill=(200, 200, 210), font=fs)
    for k in KNOCKS:
        col = (127, 180, 255) if k["side"] == "N" else (255, 180, 92)
        if k["kind"] == "grey":
            col = (154, 163, 171)
        d.line([(X(k["t"]), y0 - 8), (X(k["t"]), y0 - 1)], fill=col, width=2)
    yw = y0 + Hs + 20
    hop = len(mix) // W
    for c, col in ((0, (127, 180, 255)), (1, (255, 180, 92))):
        ch = mix[: hop * W, c].reshape(W, hop)
        mx, mn = ch.max(axis=1), ch.min(axis=1)
        yc = yw + Hw // 2
        for k in range(W):
            d.line([(x0 + k, yc - mx[k] * Hw / 2), (x0 + k, yc - mn[k] * Hw / 2)], fill=col)
    yl = yw + Hw + 20
    lo, hi = -60.0, -6.0
    Y = lambda v: yl + Hl - int((np.clip(v, lo, hi) - lo) / (hi - lo) * Hl)
    for ref, lab in ((-16, "-16"), (-24, "-24"), (-40, "-40")):
        d.line([(x0, Y(ref)), (x0 + W, Y(ref))], fill=(55, 55, 65))
        d.text((30, Y(ref) - 7), lab, fill=(150, 150, 160), font=fs)
    Lmo, tmo = block_loudness(mix, 0.4, 0.05)
    Lst, tst = block_loudness(mix, 3.0, 0.1)
    Lmu, tmu = block_loudness(mus[:N] * mg * G, 3.0, 0.1)
    for L, tt, col in ((Lmo, tmo, (90, 90, 100)), (Lst, tst, (235, 235, 235)), (Lmu, tmu, (100, 220, 150))):
        pts = [(X(t), Y(v)) for t, v in zip(tt, L)]
        d.line(pts, fill=col, width=1 if col[0] == 90 else 2)
    d.text((x0, yl + Hl + 8), "loudness (LUFS): grey momentary mix, white short-term mix, green short-term music alone", fill=(200, 200, 200), font=fs)
    for a, b, lab, col in ((52.0, 59.0, "true silence (music)", (120, 200, 255)), (EV["earplugs"][0], EV["earplugs"][1], "earplugs", (255, 160, 80))) + tuple((a, b, "macro", (200, 160, 255)) for a, b in EV["macro"]):
        d.rectangle([X(a), yl - 14, X(b), yl - 6], outline=col)
        d.text((X(a), yl - 30), lab, fill=col, font=fs)
    for s in range(0, int(DUR) + 1, 5):
        d.text((X(s) - 6, H - 30), f"{s}s", fill=(170, 170, 170), font=fs)
    im.save(path)
    return path


# ============================================================================================ main

if __name__ == "__main__":
    args = sys.argv[1:]
    rep = None
    if "--report" in args:
        i = args.index("--report")
        rep = args[i + 1] if i + 1 < len(args) and not args[i + 1].startswith("--") else os.path.join(ROOT, "out", "knock")
    R = build()
    write_wav24(OUT_WAV, R["mix"])
    write_mp3(OUT_WAV, OUT_MP3)
    print(f"wrote {OUT_WAV} ({len(R['mix']) / SR:.3f} s, 48 kHz, 24-bit) and {OUT_MP3}")
    print(f"  own meter: {integrated(R['mix']):.2f} LUFS integrated, {true_peak_db(R['mix']):.2f} dBTP")
    for pth in (OUT_WAV, OUT_MP3):
        L = ffmpeg_loudness(pth)
        print(f"  ffmpeg ebur128 {os.path.basename(pth)}: I {L.get('I')} LUFS, LRA {L.get('LRA')} LU, true peak {L.get('Peak')} dBTP")
    if rep:
        report(R, rep)
