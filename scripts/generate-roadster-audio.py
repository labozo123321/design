#!/usr/bin/env python3
"""
Sound for the Roadster composition ("POV: you're driving the new Tesla Roadster at its demo"), all
synthesised and timed from src/roadster/timeline.json (per frame: the segment and the world time) and
src/roadster/path.json (the car's speed, thrusters, fans, in world time). No voices.

Three clocks:
  video time   what you hear when: the crowd, the PA hum, the footsteps, the screens, the phone's audio,
               the frozen moments
  world time   the car (its motors, tyres, wind, the fans, the cold-gas thrusters, the landings, the slide,
               the coffee): rendered in world time and played back at the world's speed, so in slow motion
               it all slows and drops in pitch, and spins back up with it
  music time   the score: follows the world too through the stunts (the groove sinks into the slow motion
               over the top of the ramp, freezes in the bullet time, spins back up into the landings), and
               runs straight through the replay

The score: dark synth, D minor, 120 bpm. Intro (night air, a pad, a heartbeat of sub); the screens wake
and an arp starts; the starter's count: three big hits; the launch: drop one (kick, an angry saw bass that
pumps, arps, hats); up the ramp it sinks with the world into a frozen pad (the coffee floating, the
heartbeat); the thrusters spin it back up into drop two on the landing (the lead comes in); through the
phone's speaker for the replay; a breakdown and a riser for run two, the launch, the jump, the freeze; drop
three on the landing, the biggest; the victory; then everything stops when the yoke turns by itself: a
plucked "hm?", the spotlight's clunk, and a last chord on the thumbs-up.

    python3 scripts/generate-roadster-audio.py   # writes public/roadster/bed.mp3 (and out/roadster/bed.wav)
"""

import importlib.util
import json
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
noise, t_axis, clap, hat, kick, bell = ga.noise, ga.t_axis, ga.clap, ga.hat, ga.kick, ga.bell
ROOT = os.path.dirname(HERE)
with open(os.path.join(ROOT, "src", "roadster", "timeline.json")) as f:
    TL = json.load(f)
with open(os.path.join(ROOT, "src", "roadster", "path.json")) as f:
    PATH = json.load(f)
FPS = TL["fps"]
C = TL["cues"]
CW = TL["cuesW"]
FR = TL["frames"]
SEGS = {s["name"]: s for s in TL["segs"]}
NF = len(FR)
DUR = NF / FPS
N = int(DUR * SR)
PAD = SR * 8
RNG = np.random.default_rng(1015)
RATE = PATH["rate"]


def bus(n=None):
    return np.zeros(((n if n else N) + PAD, 2))


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


def st_filter(st, fn):
    return np.stack([fn(st[:, 0]), fn(st[:, 1])], axis=1)


# ============================================================================ the clocks

V_FR = np.arange(NF) / FPS
SEG_FR = np.array([fr[0] for fr in FR])
W_FR = np.array([fr[1] for fr in FR])
SEG_NAMES = ["pov1", "replay", "pov2", "bullet"]


def v_of_w(w, seg=None):
    """The first video moment at which world time w happens (in a given segment kind)."""
    for k in range(NF - 1):
        if seg is not None and SEG_NAMES[SEG_FR[k]] != seg:
            continue
        a, b = W_FR[k], W_FR[k + 1]
        if SEG_FR[k] != SEG_FR[k + 1]:
            continue
        if a <= w <= b and b > a:
            return (k + (w - a) / (b - a)) / FPS
    return None


def per_sample(vals_fr):
    """Per-frame values to per-sample (linear within segments)."""
    t = np.arange(N) / SR
    return np.interp(t, V_FR, vals_fr)


# the music clock M(v): video time to the drop, then the world through run one; straight on through the
# replay; the world again for run two (frozen in the bullet time)
M_FR = np.zeros(NF)
r_seg = SEGS["replay"]
p2_seg = SEGS["pov2"]
for k in range(NF):
    v = V_FR[k]
    seg = SEG_NAMES[SEG_FR[k]]
    w = W_FR[k]
    if v < C["launch1"]:
        M_FR[k] = v
    elif seg == "pov1":
        M_FR[k] = w
    elif seg == "replay":
        M_FR[k] = SEGS["pov1"]["w1"] + (v - r_seg["v0"])
    else:
        M_FR[k] = SEGS["pov1"]["w1"] + (r_seg["v1"] - r_seg["v0"]) + (w - p2_seg["w0"])
M_END = float(M_FR[-1])
REPLAY_M0 = SEGS["pov1"]["w1"]
RUN2_M0 = REPLAY_M0 + (r_seg["v1"] - r_seg["v0"])


def m_of_w2(w):
    """Music time of a run-two world time."""
    return RUN2_M0 + (w - p2_seg["w0"])


A1 = C["launch1"]  # the first drop's downbeat (music time = video time here)
A2 = m_of_w2(CW["launch2"])  # run two's launch
A3 = m_of_w2(CW["touch2"])  # the last drop
BEAT = 0.5
print(f"music clock: drop1 {A1:.2f}  run2 launch {A2:.2f}  drop3 {A3:.2f}  end {M_END:.2f}")


def resample(sig, clock):
    """Play a stereo signal sig (sampled at SR on its own clock) back on a per-sample clock (seconds)."""
    idx = clock * SR
    x = np.arange(len(sig))
    return np.stack([np.interp(idx, x, sig[:, c], left=0, right=0) for c in range(2)], axis=1)


# ============================================================================ instruments

def supersaw(f, sec, n=7, det=0.16, bright=1.0):
    t = t_axis(sec)
    L = np.zeros(len(t))
    R = np.zeros(len(t))
    for k in range(n):
        c = (k / (n - 1) - 0.5) * 2 * det
        ff = f * 2 ** (c / 12)
        v = signal.sawtooth(2 * np.pi * ff * t + RNG.uniform(0, 2 * np.pi))
        pan = (k / (n - 1) - 0.5) * 1.6
        L += v * np.sqrt((1 - pan / 2) / 2)
        R += v * np.sqrt((1 + pan / 2) / 2)
    st = np.stack([L, R], axis=1) / n
    if bright < 1:
        st = st_filter(st, lambda x: lp(x, 700 + 8000 * bright))
    return st


def pad_chord(notes, sec, cutoff=1500, attack=0.6, release=1.0):
    st = sum(supersaw(midi(n), sec, 5, 0.12, 1.0) for n in notes) / len(notes)
    st = st_filter(st, lambda x: lp(x, cutoff))
    return st * adsr(len(st), attack, release, 1.5)[:, None]


def bass_note(f, sec, cut=900, drive=2.4):
    t = t_axis(sec)
    v = signal.sawtooth(2 * np.pi * f * t) * 0.7 + signal.square(2 * np.pi * f * 0.5 * t) * 0.35 + np.sin(2 * np.pi * f * 0.5 * t) * 0.6
    env_f = cut * (0.35 + 0.65 * np.exp(-t / 0.09))
    v = vfilter(v, env_f, "low", 128)
    return sat(v, drive) * adsr(len(t), 0.004, 0.05)


def pluck(f, sec=0.25, bright=1.0):
    t = t_axis(sec)
    v = signal.sawtooth(2 * np.pi * f * t) * 0.6 + signal.square(2 * np.pi * f * t, 0.3) * 0.4
    v = lp(v, 1800 + 3200 * bright) * decay(len(t), 0.09)
    return v * adsr(len(t), 0.002, 0.03)


def lead(f, sec, glide_from=None):
    t = t_axis(sec)
    ff = np.full(len(t), f)
    if glide_from:
        ff = f + (glide_from - f) * np.exp(-t / 0.04)
    vib = 1 + 0.005 * np.sin(2 * np.pi * 5.2 * t) * smooth(0.12, 0.35, t)
    ph = 2 * np.pi * np.cumsum(ff * vib) / SR
    v = signal.sawtooth(ph) * 0.45 + signal.sawtooth(ph * 1.006) * 0.35 + signal.sawtooth(ph * 0.994) * 0.35 + signal.square(ph * 0.5, 0.5) * 0.2
    v = lp(v, 4200)
    return v * adsr(len(t), 0.01, 0.12, 1.3)


def stab(notes, sec=0.45):
    st = sum(supersaw(midi(n), sec, 5, 0.1, 1.0) for n in notes) / len(notes)
    t = t_axis(sec)
    st = np.stack([vfilter(st[:, c], 600 + 7000 * np.exp(-t / 0.08), "low", 128) for c in range(2)], axis=1)
    return st * adsr(len(st), 0.003, 0.15)[:, None]


def kick_big():
    return sat(kick(0.5, 170, 44, 0.22) * 1.2, 1.4)


def snare(sec=0.3, tone=185):
    n = noise(sec)
    body = np.sin(2 * np.pi * tone * t_axis(sec)) * decay(int(sec * SR), 0.05)
    return bp(n, 1400, 9000) * decay(int(sec * SR), 0.09) * 0.9 + body * 0.55 + clap(sec) * 0.5


def tom(f, sec=0.9):
    t = t_axis(sec)
    ff = f * (1 + 0.7 * np.exp(-t / 0.03))
    v = np.sin(2 * np.pi * np.cumsum(ff) / SR) * decay(len(t), 0.28)
    v += lp(noise(sec), 900) * decay(len(t), 0.05) * 0.5
    return sat(v * 1.3, 1.3)


def crash(sec=2.8):
    n = noise(sec)
    return hp(n, 3000) * decay(len(n), 0.8) * 0.5 + bp(n, 5000, 12000) * decay(len(n), 1.3) * 0.25


def impact(gain=1.0):
    """A cinematic hit: a sub drop, a crash, a burst of noise, a low tom."""
    st = np.zeros((int(3.3 * SR), 2))
    for sig in (stereo(ga.sub_boom(3.2, 75, 30) * 0.9), stereo(crash(3.0) * 0.6, 0, 0.5), stereo(lp(noise(0.6), 2400) * decay(int(0.6 * SR), 0.08) * 0.8, 0, 0.3), stereo(tom(55, 0.9) * 0.8)):
        st[: len(sig)] += sig[: len(st)]
    return st * gain


def riser(sec, f0=250, f1=7000, gain=1.0):
    n = noise(sec)
    t = np.linspace(0, 1, len(n))
    fc = f0 * (f1 / f0) ** t
    v = vfilter(n, fc, "low") * (t**1.7) * 0.6
    tone = np.sin(2 * np.pi * np.cumsum(120 * 2 ** (t * 3)) / SR) * (t**2) * 0.25
    return stereo(v + tone, 0, 0.6) * gain


def downlifter(sec=1.5, gain=1.0):
    r = riser(sec)[::-1]
    return r * gain


def reverse_cymbal(sec=1.6):
    c = crash(sec)[::-1] * smooth(0, 1, np.linspace(0, 1, int(sec * SR)))
    return stereo(c, 0, 0.6)


def heartbeat(sec=0.7):
    t = t_axis(sec)
    a = np.sin(2 * np.pi * 52 * t) * decay(len(t), 0.07)
    b = np.zeros(len(t))
    i = int(0.24 * SR)
    b[i:] = np.sin(2 * np.pi * 46 * t[: len(t) - i]) * decay(len(t) - i, 0.09) * 0.8
    return lp(a + b, 220) * 1.4


# ============================================================================ the score (music time)

D, F_, G, A, Bb, C_, E = 50, 53, 55, 57, 58, 60, 52
PROG = [  # (root for the bass, chord notes) per bar: Dm  Bb  F  C
    (38, [62, 65, 69]),
    (34, [58, 62, 65]),
    (41, [60, 65, 69]),
    (36, [60, 64, 67]),
]
PROG_DARK = [(38, [62, 65, 69]), (34, [58, 62, 65]), (31, [58, 62, 67]), (33, [61, 64, 69])]  # Dm Bb Gm A
HOOK = [  # (16th, note, len in 16ths) over two bars
    (0, 74, 3), (3, 77, 3), (6, 76, 2), (8, 74, 4), (12, 72, 2), (14, 69, 2),
    (16, 70, 3), (19, 74, 3), (22, 72, 2), (24, 69, 6), (30, 72, 2),
]


def groove(m0, bars, anchor, energy=1.0, lead_on=False, prog=PROG, hats=True, bass=True, arp=True, kick_on=True, out=None):
    """Bars of the groove from music time m0 (on the grid anchored at anchor) into the music bus."""
    b = out
    bar_len = 4 * BEAT
    for k in range(bars):
        t0 = m0 + k * bar_len
        root, chord = prog[int(round((t0 - anchor) / bar_len)) % len(prog)]
        # the pad under it all
        place(b, pad_chord([n - 12 for n in chord] + [chord[0]], bar_len + 0.4, 1400 + 1200 * energy, 0.05, 0.3) * 0.22 * energy, t0)
        for beat in range(4):
            tb = t0 + beat * BEAT
            if kick_on:
                place(b, stereo(kick_big()) * 0.95, tb)
            if beat in (1, 3):
                place(b, stereo(snare(), 0, 0.2) * (0.55 + 0.15 * energy), tb)
            if hats:
                for s in range(4):
                    acc = 1.0 if s == 2 else 0.55
                    place(b, stereo(hat(0.07, 0.016), 0.25 if s % 2 else -0.25) * 0.22 * acc * energy, tb + s * BEAT / 4)
            if bass:
                # 8ths, ducked under the kick (pumping)
                for e in range(2):
                    te = tb + e * BEAT / 2
                    bn = bass_note(midi(root + (12 if (e == 1 and beat == 3) else 0)), BEAT / 2 - 0.01, 700 + 600 * energy)
                    duck = 0.35 + 0.65 * smooth(0.0, 0.16, t_axis(BEAT / 2 - 0.01))
                    place(b, stereo(bn * duck) * 0.42, te)
        if arp:
            notes = chord + [chord[0] + 12, chord[1] + 12]
            for s in range(16):
                f = midi(notes[(s * 3) % len(notes)] + (12 if s % 8 == 7 else 0))
                place(b, stereo(pluck(f, 0.2, 0.6 + 0.4 * energy), 0.35 * np.sin(s * 1.1), 0.2) * 0.13 * energy, t0 + s * BEAT / 4)
        if lead_on:
            half = k % 2
            for (s, n, ln) in HOOK:
                if (s >= 16) != bool(half):
                    continue
                ss = s - 16 * half
                place(b, stereo(lead(midi(n), ln * BEAT / 4 + 0.05), 0, 0.3) * 0.16, t0 + ss * BEAT / 4)
    return b


def score():
    b = bus(int((M_END + 6) * SR))
    # ---- intro (music = video time): night air, a dark pad, a sub heartbeat; the arp wakes with the screens
    place(b, pad_chord([38, 45, 50, 53], 11.5, 900, 3.0, 1.5) * 0.3, 0.0)
    for k in range(9):
        place(b, stereo(heartbeat()) * 0.55, 0.6 + k * 1.2)
    # the screens boot: the arp fades in on the drop's grid (filtered, opening)
    boot = C["boot"]
    for s in range(int((A1 - boot) / (BEAT / 4))):
        tb = A1 - (s + 1) * BEAT / 4
        if tb < boot:
            break
        k = 1 - (A1 - tb) / (A1 - boot)
        chord = [62, 65, 69, 74]
        f = midi(chord[s % 4])
        place(b, stereo(pluck(f, 0.18, 0.2 + 0.6 * k), 0.3 * np.sin(s * 1.3), 0.2) * 0.11 * (0.25 + 0.75 * k), tb)
    # Track Mode: a deep power-up
    place(b, riser(1.6, 80, 900, 0.5), C["track"])
    # the count: three big hits (taiko and a brass stab), a riser to the go, a breath, then the drop
    for i, key in enumerate(["count3", "count2", "count1"]):
        t = C[key]
        place(b, stereo(tom(62 - 4 * i, 1.0)) * 0.9, t)
        place(b, stab([62, 65, 69, 74] if i < 2 else [61, 64, 69, 73], 0.5) * 0.35, t)
        place(b, stereo(kick_big()) * 0.6, t)
    place(b, riser(A1 - C["count3"] - 0.12, 300, 9000, 0.8), C["count3"])
    place(b, reverse_cymbal(0.9) * 0.5, A1 - 0.9)
    # ---- drop one: the launch (four bars, to the landing)
    T1 = CW["touch1"]
    place(b, impact(1.1), A1)
    groove(A1, int(round((T1 - A1) / (4 * BEAT))), A1, 1.0, out=b)
    # ---- drop two on the landing: the lead comes in (through the replay)
    place(b, reverse_cymbal(1.2) * 0.5, T1 - 1.2)
    place(b, impact(1.2), T1)
    groove(T1, 4, T1, 1.0, lead_on=True, out=b)
    # ---- run two: a breakdown (no kick, the darker chords), a riser into the launch
    br0 = T1 + 4 * 4 * BEAT
    nbr = int(np.ceil((A2 - br0) / (4 * BEAT)))
    tmp = bus(int((M_END + 6) * SR))
    groove(br0, nbr, br0, 0.6, kick_on=False, hats=False, prog=PROG_DARK, out=tmp)
    i1 = int(A2 * SR)
    tmp[i1:] *= 0
    b += tmp
    place(b, riser(min(3.5, A2 - br0), 200, 8000, 0.8), A2 - min(3.5, A2 - br0))
    place(b, impact(0.9), A2)
    groove(A2, 2, A2, 0.95, prog=PROG_DARK, out=b)
    # a fill into the last drop: toms rolling up
    f0 = A2 + 2 * 4 * BEAT
    for k in range(int((A3 - f0) / (BEAT / 2))):
        place(b, stereo(tom(70 + 6 * k, 0.4), 0.3 * np.sin(k)) * 0.5, f0 + k * BEAT / 2)
    # ---- drop three on the landing: everything
    place(b, impact(1.35), A3)
    creep_m = m_of_w2(CW["creep0"])
    bars3 = int(np.floor((creep_m - A3) / (4 * BEAT) + 0.25))
    groove(A3, bars3, A3, 1.15, lead_on=True, out=b)
    return b


# the reveal (video time, after the music stops): a plucked "hm?", the spotlight, the last chord
def reveal_music():
    b = bus()
    v0 = v_of_w(CW["creep0"], "pov2")
    # the music stops dead: a tape stop on the last of it is done by the mix's cut; then a tiptoe pluck motif
    notes = [(0.55, 69), (0.85, 70), (1.15, 69), (1.95, 74)]
    for dt, n in notes:
        place(b, stereo(pluck(midi(n), 0.4, 0.4), 0.2, 0.2) * 0.18, v0 + dt)
        place(b, stereo(pluck(midi(n - 12), 0.4, 0.3), -0.2, 0.2) * 0.1, v0 + dt)
    # a bass "doom" when he looks round
    place(b, stereo(bass_note(midi(38), 1.2, 400, 1.6) * adsr(int(1.2 * SR), 0.02, 0.6)) * 0.35, v0 + 2.0)
    # caught: the snap zoom's whoosh and a "dun!" (a low stab and a timpani hit)
    vz = v_of_w(CW["creep0"] + 2.68, "pov2")
    place(b, st_filter(reverse_cymbal(0.3), lambda x: hp(x, 1500)) * 0.6, vz - 0.3)
    place(b, stab([38, 45, 50, 53], 0.7) * 0.5, vz)
    place(b, stereo(tom(48, 1.2)) * 0.9, vz)
    place(b, stereo(ga.sub_boom(1.5, 60, 35)) * 0.5, vz)
    # the thumbs-up: the last chord, big and warm, with a sparkle
    vt = v_of_w(CW["creep0"] + 3.9, "pov2")
    place(b, pad_chord([50, 57, 62, 65, 69, 74], 3.8, 3200, 0.02, 2.5) * 0.45, vt)
    place(b, stab([62, 65, 69, 74], 0.6) * 0.4, vt)
    place(b, stereo(kick_big()) * 0.8, vt)
    place(b, stereo(crash(3.0)) * 0.35, vt)
    for i, n in enumerate([74, 77, 81, 86]):
        place(b, stereo(bell(midi(n), 2.0) * 0.18, 0.3 * (i - 1.5), 0.3), vt + 0.12 + i * 0.07)
    return b


# ============================================================================ the car (world time)

W_END = len(PATH["speed"]) / RATE
NW = int(W_END * SR)
TW = np.arange(NW) / SR
SPEED = np.interp(TW, np.arange(len(PATH["speed"])) / RATE, PATH["speed"])
FAN = np.interp(TW, np.arange(len(PATH["fan"])) / RATE, PATH["fan"])
THR = np.array(PATH["thr"]).reshape(-1, 10)
REAR = np.interp(TW, np.arange(len(THR)) / RATE, THR[:, :4].max(axis=1))
DOWN = np.interp(TW, np.arange(len(THR)) / RATE, THR[:, 4:].max(axis=1))
ALT = np.interp(TW, np.arange(len(PATH["alt"])) / RATE, PATH["alt"])
F = np.array(PATH["f"]).reshape(-1, 3)
GLOAD = np.interp(TW, np.arange(len(F)) / RATE, np.linalg.norm(F, axis=1))
ACC = np.gradient(SPEED) * SR


def car_world():
    """Everything the car does, in world time (stereo)."""
    b = np.zeros((NW + PAD, 2))
    on = (TW > 4.2).astype(float)
    # the motors: a whine that climbs with the speed (and a growl under it when it pulls)
    pull = np.clip(np.abs(ACC) / 12, 0, 1)
    pull = lp(pull, 8)
    f1 = 140 + SPEED * 62
    ph1 = 2 * np.pi * np.cumsum(f1) / SR
    whine = (np.sin(ph1) * 0.5 + np.sin(ph1 * 2.02) * 0.25 + np.sin(ph1 * 3.5) * 0.12) * (0.08 + 0.55 * pull + 0.25 * np.clip(SPEED / 30, 0, 1))
    growl = sat(np.sin(2 * np.pi * np.cumsum(40 + SPEED * 6) / SR) * 1.5, 2) * pull * 0.35
    inv = np.sin(2 * np.pi * np.cumsum(f1 * 7.3) / SR) * 0.05 * pull
    motor = (whine + growl + inv) * on
    b[:NW] += stereo(motor * 0.55, 0, 0.2)
    # the tyres and the wind
    rn = noise(W_END)[:NW]
    grounded = (ALT < 0.05).astype(float)
    tyre = lp(rn, 500) * np.clip(SPEED / 25, 0, 1) ** 1.2 * grounded * 0.5
    wind = vfilter(noise(W_END)[:NW], 300 + SPEED * 90, "low", 512) * np.clip(SPEED / 25, 0, 1.4) ** 2 * 0.35
    b[:NW] += stereo(tyre, 0, 0.3) + stereo(wind, 0, 0.6)
    # the fans: a turbine whine climbing with their speed
    ff = 90 + FAN * 1100
    fph = 2 * np.pi * np.cumsum(ff) / SR
    fan = (np.sin(fph) * 0.3 + np.sin(fph * 2.5) * 0.15 + bp(noise(W_END)[:NW], 400, 3000) * 0.4) * FAN**1.3
    b[:NW] += stereo(fan * 0.55, 0, 0.4)
    # the cold-gas thrusters: a roaring hiss, a low thud in it; a crack when they open
    gas = (hp(noise(W_END)[:NW], 500) * 0.6 + lp(noise(W_END)[:NW], 220) * 0.9)
    thr = np.clip(REAR + DOWN, 0, 1.4)
    b[:NW] += stereo(gas * thr * 0.75, 0, 0.7)
    opens = np.where((np.diff((thr > 0.05).astype(int)) == 1))[0]
    for i in opens:
        place(b, stereo(add(lp(noise(0.25), 3000) * decay(int(0.25 * SR), 0.03) * 0.9, kick(0.3, 120, 40, 0.08) * 0.6), 0, 0.4), i / SR)
    # the launch: the tyres bite
    tl = CW["launch1"]
    place(b, stereo(bp(noise(0.6), 900, 3200) * decay(int(0.6 * SR), 0.18) * 0.35, 0, 0.3), tl)
    # onto the ramp: a clunk, then the deck's seams going by
    ri = CW["rampIn"]
    place(b, stereo(ga.sub_boom(1.0, 90, 40) * 0.8 + lp(noise(1.0), 1200) * decay(SR, 0.08) * 0.6), ri)
    for k in range(8):
        place(b, stereo(lp(noise(0.12), 900) * decay(int(0.12 * SR), 0.02) * 0.5, 0, 0.3), ri + 0.25 + k * 0.24)
    # the structure groans under the g
    groan = np.sin(2 * np.pi * np.cumsum(70 + 30 * np.sin(TW * 3)) / SR) * smooth(ri, ri + 0.3, TW) * (1 - smooth(CW["release"] - 0.2, CW["release"], TW)) * 0.25
    b[:NW] += stereo(lp(groan, 300))
    # the release: the fans let go (a sigh of air)
    place(b, stereo(lp(noise(0.8), 1500) * adsr(int(0.8 * SR), 0.02, 0.6) * 0.5, 0, 0.5), CW["release"])
    # the coffee: a bloop as it rises out of the cup, a wobble, the plop back in
    rel = CW["release"]
    tt = t_axis(0.35)
    bloop = np.sin(2 * np.pi * np.cumsum(260 + 500 * tt / 0.35) / SR) * decay(len(tt), 0.08) * 0.5
    place(b, stereo(bloop, 0.3), rel + 0.12)
    for k in range(3):
        tt = t_axis(0.25)
        place(b, stereo(np.sin(2 * np.pi * np.cumsum(420 + 180 * np.sin(tt * 30 + k)) / SR) * decay(len(tt), 0.07) * 0.18, 0.3), rel + 0.45 + k * 0.3)
    for s in CW["splashes"]:
        tt = t_axis(0.4)
        plop = np.sin(2 * np.pi * np.cumsum(900 * np.exp(-tt / 0.03) + 180) / SR) * decay(len(tt), 0.06) * 0.6
        plop += bp(noise(0.4), 1200, 5000) * decay(len(tt), 0.04) * 0.4
        place(b, stereo(plop, 0.3), s)
    # the landings: a thud through the chassis, the suspension, a chirp
    for key, g in (("touch1", 1.0), ("touch2", 1.1)):
        t = CW[key]
        place(b, stereo(ga.sub_boom(1.6, 110, 35) * 1.1 + lp(noise(1.6), 900) * decay(int(1.6 * SR), 0.1) * 0.6) * g, t)
        place(b, stereo(bp(noise(0.3), 1500, 4500) * decay(int(0.3 * SR), 0.06) * 0.4, 0, 0.3) * g, t + 0.05)
        place(b, stereo(np.sin(2 * np.pi * 95 * t_axis(0.5)) * decay(int(0.5 * SR), 0.12) * 0.4), t + 0.12)
    # run two's slide: the tyres scream sideways
    t2 = CW["touch2"]
    sl = 2.4
    tt = t_axis(sl)
    squeal = bp(noise(sl), 1400, 3200) * (0.6 + 0.4 * np.sin(2 * np.pi * 11 * tt)) + np.sin(2 * np.pi * np.cumsum(1900 + 300 * np.sin(tt * 7)) / SR) * 0.25
    squeal *= adsr(len(tt), 0.05, 0.5) * (1 - smooth(1.4, sl, tt)) * 0.45
    place(b, stereo(squeal, -0.1, 0.5), t2 + 0.1)
    place(b, stereo(lp(noise(sl), 350) * adsr(len(tt), 0.05, 0.6) * 0.6), t2 + 0.1)
    # the canopy: hydraulics, the seal; up again at the end
    for t0, t1, down in ((CW["canopy0"], CW["canopy1"], True), (CW["canopyUp"], CW["canopyUp"] + 1.6, False)):
        sec = t1 - t0
        tt = t_axis(sec)
        hyd = np.sin(2 * np.pi * np.cumsum(180 + 60 * tt / sec) / SR) * 0.12 + bp(noise(sec), 300, 1800) * 0.15
        place(b, stereo(hyd * adsr(len(tt), 0.1, 0.3), 0, 0.4), t0)
        if down:
            place(b, stereo(lp(noise(0.3), 700) * decay(int(0.3 * SR), 0.04) * 0.9 + np.sin(2 * np.pi * 70 * t_axis(0.3)) * decay(int(0.3 * SR), 0.06) * 0.8), t1)
            place(b, stereo(hp(noise(0.7), 3000) * adsr(int(0.7 * SR), 0.01, 0.6) * 0.12, 0, 0.6), t1 + 0.05)
        else:
            place(b, stereo(hp(noise(0.5), 2000) * adsr(int(0.5 * SR), 0.01, 0.4) * 0.25, 0, 0.6), t0)
    # Track Mode: it squats (a hiss and a clunk), the wing's actuators, the fans spin up to idle
    tm = CW["track"]
    place(b, stereo(hp(noise(0.5), 1500) * adsr(int(0.5 * SR), 0.01, 0.35) * 0.3 + lp(noise(0.5), 300) * decay(int(0.5 * SR), 0.1) * 0.4, 0, 0.4), tm)
    tt = t_axis(1.0)
    servo = np.sin(2 * np.pi * np.cumsum(900 + 400 * tt) / SR) * 0.08 * adsr(len(tt), 0.05, 0.1)
    place(b, stereo(servo, 0.1, 0.3), tm + 0.3)
    # the creep at the end: the motor hums, the steering servo whirs (nobody's hands on it)
    c0 = CW["creep0"]
    sec = CW["creep1"] - c0 + 0.4
    tt = t_axis(sec)
    servo2 = np.sin(2 * np.pi * np.cumsum(1200 + 500 * np.sin(np.pi * tt / sec)) / SR) * 0.1 * np.sin(np.pi * np.clip(tt / sec, 0, 1))
    hum = np.sin(2 * np.pi * np.cumsum(160 + 80 * np.sin(np.pi * tt / sec)) / SR) * 0.15 * np.sin(np.pi * np.clip(tt / sec, 0, 1))
    place(b, stereo(servo2 + hum, 0.0, 0.3), c0 - 0.2)
    return b


# ============================================================================ video time

def crowd_bed(sec, density=1.0, seed=0):
    """A big crowd: many murmuring voices (formant-ish noise), some whoops and whistles."""
    n = int(sec * SR)
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    for k in range(6):
        v = bp(rng.standard_normal(n), 250 + 150 * k, 900 + 350 * k)
        am = lp(rng.standard_normal(n), 3 + k) * 6
        out += v * (0.6 + 0.4 * np.tanh(am)) * 0.18
    return out * density


def whoops(sec, rate, seed=0):
    """Whoops, cheers and whistles scattered over sec (rate per second)."""
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    out = np.zeros((n, 2))
    k = int(sec * rate)
    for i in range(k):
        t0 = rng.uniform(0, sec - 0.8)
        d = rng.uniform(0.35, 0.8)
        tt = t_axis(d)
        if rng.uniform() < 0.3:
            # a whistle
            f = 1800 + 900 * rng.uniform() + 600 * np.sin(np.pi * tt / d)
            v = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.12
        else:
            # a "woo": a voice-ish glide (pulse train through two formants)
            f0 = rng.uniform(180, 380) * (1 + 0.35 * np.sin(np.pi * tt / d))
            pulse = signal.sawtooth(2 * np.pi * np.cumsum(f0) / SR)
            v = bp(pulse, 500, 1300) * 0.5 + bp(pulse, 1800, 3000) * 0.25
            v *= 0.25
        v *= adsr(len(tt), 0.05, 0.25)
        pan = rng.uniform(-0.8, 0.8)
        i0 = int(t0 * SR)
        out[i0 : i0 + len(v)] += stereo(v, pan)[: n - i0]
    return out


def claps(sec, rate, seed=0):
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    out = np.zeros((n, 2))
    for i in range(int(sec * rate)):
        t0 = rng.uniform(0, sec - 0.2)
        c = clap(0.15) * rng.uniform(0.05, 0.12)
        i0 = int(t0 * SR)
        out[i0 : i0 + len(c)] += stereo(c, rng.uniform(-0.9, 0.9))[: n - i0]
    return out


def video_world():
    b = bus()
    t = np.arange(N) / SR
    # ---- the crowd, all the way through; how loud follows the action (cheers at the big moments)
    ex = np.zeros(N)
    for key, a, hold in (("launch1", 0.6, 1.5), ("release", 0.8, 4.0), ("touch1", 1.0, 2.0), ("replayRelease", 0.9, 2.5), ("replayTouch", 1.0, 2.0), ("lift2", 0.8, 3.0), ("touch2", 1.0, 3.0), ("stop2", 1.0, 5.0)):
        if key in C:
            ex = np.maximum(ex, a * smooth(C[key] - 0.2, C[key] + 0.3, t) * (1 - smooth(C[key] + hold, C[key] + hold + 1.5, t)))
    ex = np.maximum(ex, 0.75 * smooth(C["stop2"], C["stop2"] + 0.5, t))
    murmur = crowd_bed(DUR, 1.0, 3)
    roar = crowd_bed(DUR, 1.0, 7)
    crowd = stereo(murmur * (0.35 + 0.25 * ex), 0, 0.8) + stereo(hp(roar, 200) * ex * 1.3, 0, 0.8)
    crowd += whoops(DUR, 3.0, 11) * (0.3 + 1.2 * ex)[:, None]
    crowd += claps(DUR, 10, 13) * (0.2 + 0.8 * ex)[:, None]
    # the PA's hum and the generators, the night's air
    hum = (np.sin(2 * np.pi * 60 * t) * 0.03 + np.sin(2 * np.pi * 120 * t) * 0.02 + lp(noise(DUR)[:N], 120) * 0.12)
    air = bp(noise(DUR)[:N], 200, 1200) * 0.05
    outside = crowd + stereo(hum + air, 0, 0.6)
    # inside with the canopy down, the outside is muffled (but not in the replay, from the crowd)
    shut = smooth(C["canopy0"] + 0.3, C["canopy0"] + 1.1, t) * (1 - smooth(C["canopyUp"] - 0.1, C["canopyUp"] + 0.8, t))
    replay = (t >= SEGS["replay"]["v0"]) & (t < SEGS["replay"]["v1"])
    shut = np.where(replay, 0.0, shut)
    muf = st_filter(outside, lambda x: vfilter(x, 3500 - 3000 * shut, "low", 512))
    muf *= (1 - 0.55 * shut)[:, None]
    # the replay is the phone's audio: louder, closer, clipped a little
    muf[replay] *= 2.2
    b[:N] += muf
    # ---- the walk: steps on the tarmac, the coffee sloshing
    for k in range(int(CW["walk1"] * 1.85 * 2)):
        ts = 0.15 + k / (1.85 * 2)
        if ts > CW["walk1"] - 0.1:
            break
        st = lp(noise(0.12), 1800) * decay(int(0.12 * SR), 0.018) * 0.5 + bp(noise(0.12), 2000, 6000) * decay(int(0.12 * SR), 0.01) * 0.2
        place(b, stereo(st, -0.15 if k % 2 else 0.15), ts)
    # climbing in: fabric, the seat, the harness
    w1 = CW["walk1"]
    place(b, stereo(bp(noise(0.8), 300, 2500) * adsr(int(0.8 * SR), 0.1, 0.4) * 0.15, 0, 0.5), w1 + 0.1)
    place(b, stereo(lp(noise(0.25), 500) * decay(int(0.25 * SR), 0.06) * 0.5), CW["seated"] - 0.05)
    for k in range(2):
        place(b, stereo(bp(noise(0.05), 2500, 8000) * decay(int(0.05 * SR), 0.008) * 0.6, 0.2), CW["seated"] + 0.25 + k * 0.2)
    # the screens boot: a chime
    for i, n in enumerate([62, 69, 74, 81]):
        place(b, stereo(bell(midi(n), 1.6) * 0.12, 0.2, 0.3), C["boot"] + i * 0.06)
    # the cup into the holder: a cardboard tock
    tock = v_of_w(CW["cup0"] + 0.85, "pov1")
    place(b, stereo(bp(noise(0.08), 400, 2400) * decay(int(0.08 * SR), 0.015) * 0.6, 0.3), tock)
    # ---- the frozen top of the ramp: a high shimmer and a heartbeat (in video time, under the slowed world)
    fr0 = v_of_w(CW["release"], "pov1") - 0.8
    fr1 = v_of_w(CW["roll1b"] + 0.15, "pov1")
    sec = fr1 - fr0 + 1.5
    shimmer = pad_chord([74, 77, 81, 86], sec, 5000, 1.0, 1.5) * 0.12
    place(b, st_filter(shimmer, lambda x: hp(x, 800)), fr0)
    place(b, pad_chord([38, 45, 50], sec, 500, 1.0, 1.5) * 0.25, fr0)
    for k in range(int((fr1 - fr0) / 1.1)):
        place(b, stereo(heartbeat()) * 0.8, fr0 + 0.4 + k * 1.1)
    # ---- run two's lift into the freeze: a riser and a shimmer while the world slows (the groove sinks away)
    lv = C["lift2"] + 0.4
    bt0 = SEGS["bullet"]["v0"]
    place(b, riser(bt0 - lv, 300, 9000, 0.9), lv)
    place(b, st_filter(pad_chord([69, 74, 77, 81], bt0 - lv + 0.5, 6000, 0.8, 0.4), lambda x: hp(x, 900)) * 0.14, lv)
    for k in range(int((bt0 - lv) / 0.9)):
        place(b, stereo(heartbeat()) * 0.7, lv + 0.2 + k * 0.9)
    # ---- after the freeze, down to the landing: a riser, the heartbeat quickening, a reversed crash into it
    av = SEGS["bullet"]["v1"]
    tv = C["touch2"]
    place(b, riser(tv - av, 200, 10000, 1.0), av)
    place(b, pad_chord([50, 57, 62, 65], tv - av, 1200, 0.3, 0.2) * 0.2, av)
    gap = 0.8
    tb = av + 0.2
    while tb < tv - 0.25:
        place(b, stereo(heartbeat()) * 0.75, tb)
        gap = max(0.32, gap * 0.85)
        tb += gap
    place(b, reverse_cymbal(1.3) * 0.7, tv - 1.3)
    # ---- the bullet time: the world stops (a sucked-in hush), a sustained shimmer, the camera's whoosh
    bt = SEGS["bullet"]
    sec = bt["v1"] - bt["v0"]
    place(b, reverse_cymbal(0.6) * 0.4, bt["v0"] - 0.6)
    place(b, pad_chord([62, 69, 74, 77, 81], sec + 0.8, 3000, 0.05, 0.8) * 0.18, bt["v0"])
    place(b, stereo(ga.sub_boom(2.5, 60, 28)) * 0.7, bt["v0"])
    # the camera's moves: whipped out of his window and round to the car (a whoosh across, left to right),
    # the slow orbit (air going by), whipped back in on the roll (right to left, rising into the kick)
    def whoosh(dur, peak, f0, f1, pan0, pan1, gain):
        tt = t_axis(dur)
        env = np.exp(-(((tt - peak) / (0.2 * dur)) ** 2))
        x = vfilter(noise(dur), f0 + (f1 - f0) * env, "low", 256) * env * gain
        pan = np.linspace(pan0, pan1, len(tt))
        return np.stack([x * np.sqrt((1 - pan) / 2), x * np.sqrt((1 + pan) / 2)], axis=1)

    place(b, whoosh(1.1, 0.5, 250, 3400, -0.75, 0.75, 0.5), bt["v0"] - 0.02)
    place(b, whoosh(sec * 0.5, sec * 0.25, 300, 900, 0.4, -0.4, 0.16), bt["v0"] + sec * 0.25)
    place(b, whoosh(1.1, 0.68, 300, 4200, 0.75, -0.75, 0.52), bt["v1"] - 1.1)
    place(b, stereo(kick(0.4, 200, 50, 0.1)) * 0.5, bt["v1"])
    # ---- the show: the CO2 cannons and the cold sparks
    shots = [CW["touch1"] - 0.05, CW["lift2"] + 0.1, CW["stop2"] - 0.4, CW["stop2"] + 2.6]
    for i, sw in enumerate(shots):
        seg = "pov1" if sw < 30 else None
        v = v_of_w(sw, seg)
        if v is None:
            continue
        jet = hp(noise(0.9), 600) * adsr(int(0.9 * SR), 0.01, 0.35) * 0.45 + lp(noise(0.9), 200) * decay(int(0.9 * SR), 0.15) * 0.5
        g = 0.4 if (v < C["canopyUp"] and v > C["canopy0"]) else 0.9
        place(b, stereo(jet, -0.5, 0.6) * g, v)
    sv0 = v_of_w(CW["stop2"] + 0.1)
    sv1 = v_of_w(CW["stop2"] + 4.6)
    if sv0 and sv1:
        sec = sv1 - sv0
        crackle = np.zeros(int(sec * SR))
        for k in range(int(sec * 220)):
            i0 = RNG.integers(0, len(crackle) - 400)
            crackle[i0 : i0 + 200] += hp(RNG.standard_normal(200), 2500) * RNG.uniform(0.05, 0.2) * decay(200, 0.0008)
        crackle *= adsr(len(crackle), 0.1, 0.5)
        place(b, stereo(crackle, -0.6, 0.6) * 0.7, sv0)
    # ---- the reveal: the follow spot slams round onto him (a big clunk and the lamp's buzz)
    vs = v_of_w(CW["creep0"] + 2.45)
    if vs:
        clunk = lp(noise(0.25), 1200) * decay(int(0.25 * SR), 0.03) * 1.2 + np.sin(2 * np.pi * 85 * t_axis(0.25)) * decay(int(0.25 * SR), 0.05)
        place(b, stereo(clunk, -0.4, 0.3), vs)
        tt = t_axis(4.0)
        buzz = (np.sin(2 * np.pi * 120 * tt) * 0.04 + np.sin(2 * np.pi * 240 * tt) * 0.02) * adsr(len(tt), 0.05, 1.0)
        place(b, stereo(buzz, -0.4), vs)
        # and the crowd's "ooooh", and laughing
        oo = bp(signal.sawtooth(2 * np.pi * np.cumsum(np.full(int(2.0 * SR), 210.0) * (1 + 0.2 * np.sin(np.pi * t_axis(2.0) / 2.0))) / SR), 350, 900) * adsr(int(2.0 * SR), 0.3, 0.8) * 0.12
        place(b, stereo(oo, -0.2, 0.8), vs + 0.2)
        laugh = sum(bp(noise(2.6), 500 + 300 * k, 1500 + 400 * k) * (0.5 + 0.5 * np.sin(2 * np.pi * (5.5 + k) * t_axis(2.6))) for k in range(4)) * 0.07
        place(b, stereo(laugh * adsr(int(2.6 * SR), 0.2, 1.0), -0.2, 0.8), vs + 1.2)
    return b


# ============================================================================ the mix

def mix():
    t = np.arange(N) / SR
    clock_v = t
    # the per-sample clocks
    W_S = per_sample(W_FR)
    M_S = per_sample(M_FR)
    seg_s = SEG_FR[np.clip((t * FPS).astype(int), 0, NF - 1)]
    out = bus()
    # ---- the score on the music clock
    mus = score()
    mus_v = resample(mus, M_S)
    # where the world crawls (slower than ~0.45) the groove is too low and muddy: fade it under the frozen pad
    rate = np.gradient(M_S) * SR
    rate = lp(rate, 6)
    deep = 1 - smooth(0.32, 0.55, rate)
    deep = np.where(t < C["launch1"], 0, deep)
    # in the replay the score comes through the phone: band-limited, a bit crushed
    rep = (seg_s == 1)
    mus_v = mus_v * (1 - deep)[:, None]
    phone = st_filter(mus_v, lambda x: bp(x, 250, 5000)) * 2.2
    mus_v = np.where(rep[:, None], phone, mus_v)
    # the music stops when the yoke turns by itself
    cut = v_of_w(CW["creep0"] - 0.05, "pov2")
    stop = 1 - smooth(cut - 0.05, cut + 0.05, t)
    # (a quick tape stop into it: the last 0.35 s pitch down)
    ts0 = cut - 0.35
    k = (t >= ts0) & (t < cut)
    if k.any():
        idx = np.where(k)[0]
        u = (t[idx] - ts0) / 0.35
        warp = ts0 + 0.35 * (u - 0.5 * u * u)
        for c in range(2):
            mus_v[idx, c] = np.interp(warp * SR, np.arange(N), mus_v[:N, c])
    out[:N] += mus_v[:N] * stop[:, None] * 0.9
    out += reveal_music()
    # ---- the car on the world clock (seen from the seat; distant and filtered in the replay; nothing in the
    # bullet time, where the world's frozen)
    car = car_world()
    car_v = resample(car, W_S)
    frozen = (seg_s == 3)
    car_v[frozen] = 0
    near = car_v.copy()
    far = st_filter(car_v, lambda x: lp(x, 1800)) * 0.45
    far = reverb(far, 2.2, 0.35, 3000)[:N]
    car_v = np.where(rep[:, None], far, near)
    out[:N] += car_v * 0.85
    # ---- video-time sounds
    out += video_world() * 1.0
    out = out[:N]
    # no DC (a frozen clock holds a sample)
    out = st_filter(out, lambda x: hp(x, 22))
    out[-int(0.6 * SR):] *= np.linspace(1, 0, int(0.6 * SR))[:, None] ** 2
    out[: int(0.25 * SR)] *= np.linspace(0, 1, int(0.25 * SR))[:, None]
    return out


if __name__ == "__main__":
    st = mix()
    peak = np.max(np.abs(st))
    print("peak before norm", round(float(peak), 3), "duration", round(len(st) / SR, 3))
    st = st / peak * 0.89
    os.makedirs(os.path.join(ROOT, "out", "roadster"), exist_ok=True)
    wavfile.write(os.path.join(ROOT, "out", "roadster", "bed.wav"), SR, st.astype(np.float32))
    ga.write_mp3(os.path.join(ROOT, "public", "roadster", "bed.mp3"), st, 0.89)
    print("wrote public/roadster/bed.mp3 and out/roadster/bed.wav")
