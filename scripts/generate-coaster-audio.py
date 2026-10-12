#!/usr/bin/env python3
"""
Sound for the Coaster composition ("POV: your little sister wanted the front row"): all synthesised, timed
from src/coaster/track.json (the ride: speed per frame, the moments) and src/coaster/ending.json. No voice.

  0-2.0      the station: the crowd, the park, the song muffled through the station's speakers; the
             restraints lock, the floor drops away, the air brakes let go
  2.0-5.35   the tyres push you out
  5.05-27.5  the lift: the chain catches, its ratchet clacks in time with the song, which opens up and
             builds: arpeggios, a snare roll that doubles and doubles again, a riser, your heartbeat
  27.5       the holding brake: the song stops dead. Wind, creaking steel, the heartbeat; your sister's
             bubblegum stretching...
  30.95      POP, the brake lets go, a sharp breath; the train creeps over the edge
  32.13      THE DROP: the song drops with the train (a festival drop in F minor at 128); the wind and the
             roar of the wheels follow the speed, riders scream behind you
  36.9-37.7  the tunnel: the roar goes boomy, the light strips whip past
  45.9       the splashdown
  47.1-50.9  the zero-g roll: the drums fall away, weightless
  59.95      the brakes: the song tape-stops, the magnets hum the train down
  62.33      the ride photo: a ding, the hook on a marimba, and her "again?"

    python3 scripts/generate-coaster-audio.py   # writes public/coaster/bed.mp3 (and out/coaster/bed.wav)
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
noise, sine, t_axis, kick, clap, hat = ga.noise, ga.sine, ga.t_axis, ga.kick, ga.clap, ga.hat
ROOT = os.path.dirname(HERE)
with open(os.path.join(ROOT, "src", "coaster", "track.json")) as f:
    TR = json.load(f)
with open(os.path.join(ROOT, "src", "coaster", "ending.json")) as f:
    END = json.load(f)
FPS = TR["fps"]
C = TR["cues"]
V = np.array(TR["frames"]["v"])
GN = np.array(TR["frames"]["gn"])
RIDE_END = END["rideEnd"]
DUR = RIDE_END + END["dur"]
N = int(DUR * SR)
PAD = SR * 6
RNG = np.random.default_rng(77)

BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
STEP = BEAT / 4
T_DROP = C["over"]  # the song's drop, on the train's
T_HOLD = C["holdStart"]  # the song stops dead
LIFT0 = T_HOLD - 12 * BAR  # the lift's 12 bars end at the hold
INTRO0 = LIFT0 - 3 * BAR


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


def smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def speed_at(t):
    """The train's speed (m/s) at video time t (array ok)."""
    fr = np.clip(np.asarray(t) * FPS, 0, len(V) - 1)
    return np.interp(fr, np.arange(len(V)), V)


def env_at(t, keys):
    """Piecewise-linear automation through (time, value) keys."""
    ts = [k[0] for k in keys]
    vs = [k[1] for k in keys]
    return np.interp(t, ts, vs)


def vfilter(x, fc, kind="low", block=512):
    """A filter whose cutoff follows fc (array, per sample), block by block."""
    out = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        f = float(np.clip(fc[min(i, len(fc) - 1)], 30, SR / 2 - 500))
        sos = signal.butter(2, f / (SR / 2), kind, output="sos")
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        out[i : i + block], zi = signal.sosfilt(sos, x[i : i + block], zi=zi)
    return out


# ===================================================================== instruments

def supersaw(f, sec, n=7, det=0.18, bright=1.0):
    """Detuned saws (n voices spread over +-det semitones), stereo."""
    t = t_axis(sec)
    L = np.zeros(len(t))
    R = np.zeros(len(t))
    for k in range(n):
        c = (k / (n - 1) - 0.5) * 2 * det
        ff = f * 2 ** (c / 12)
        ph = RNG.uniform(0, 2 * np.pi)
        v = signal.sawtooth(2 * np.pi * ff * t + ph)
        pan = (k / (n - 1) - 0.5) * 1.6
        L += v * np.sqrt((1 - pan / 2) / 2)
        R += v * np.sqrt((1 + pan / 2) / 2)
    st = np.stack([L, R], axis=1) / n
    if bright < 1:
        st = np.stack([lp(st[:, 0], 900 + 8000 * bright), lp(st[:, 1], 900 + 8000 * bright)], axis=1)
    return st


def chord_stab(notes, sec, bright=0.85):
    st = sum(supersaw(midi(n), sec, 5, 0.14, bright) for n in notes) / len(notes)
    return st * adsr(len(st), 0.005, 0.06, 1.0)[:, None]


def sub_bass(f, sec):
    t = t_axis(sec)
    v = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return sat(v, 1.3) * adsr(len(t), 0.004, 0.04)


def pluck_arp(f, sec):
    t = t_axis(sec)
    v = signal.sawtooth(2 * np.pi * f * t) * 0.6 + signal.square(2 * np.pi * f * t, 0.3) * 0.4
    v = lp(v, 2600) * decay(len(t), 0.11)
    return v * adsr(len(t), 0.002, 0.03)


def lead(f, sec, glide_from=None):
    t = t_axis(sec)
    ff = np.full(len(t), f)
    if glide_from:
        ff = f + (glide_from - f) * np.exp(-t / 0.03)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * smooth(0.15, 0.4, t)
    ph = 2 * np.pi * np.cumsum(ff * vib) / SR
    v = signal.sawtooth(ph) * 0.5 + signal.sawtooth(ph * 1.005) * 0.35 + signal.square(ph * 0.5, 0.5) * 0.25
    v = lp(v, 5200)
    return v * adsr(len(t), 0.006, 0.08, 1.2)


def marimba(f, sec=0.7):
    t = t_axis(sec)
    v = np.sin(2 * np.pi * f * t) * np.exp(-t * 6) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 18)
    v += 0.15 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t * 40)
    return v * adsr(len(t), 0.001, 0.05)


def glock(f, sec=1.2):
    return ga.bell(f, sec) * 0.6


def snare_hit(tone=200, sec=0.25):
    n = noise(sec)
    body = np.sin(2 * np.pi * tone * t_axis(sec)) * decay(int(sec * SR), 0.04)
    return (bp(n, 1500, 8000) * decay(int(sec * SR), 0.07) * 0.9 + body * 0.5)


def big_kick():
    return kick(0.5, 160, 45, 0.2) * 1.1


def crash(sec=2.5):
    n = noise(sec)
    return hp(n, 3000) * decay(len(n), 0.7) * 0.5 + bp(n, 5000, 12000) * decay(len(n), 1.2) * 0.25


def reverse_swell(sec):
    c = crash(sec)
    return c[::-1] * smooth(0, 1, np.linspace(0, 1, len(c)))


def riser(sec, f0=300, f1=6000):
    n = noise(sec)
    t = np.linspace(0, 1, len(n))
    fc = f0 * (f1 / f0) ** t
    return vfilter(n, fc, "low") * (t ** 1.6) * 0.6


# ===================================================================== the song

# F minor: Fm - Db - Ab - Eb
PROG = [("Fm", [53, 56, 60], 29), ("Db", [49, 53, 56], 25), ("Ab", [51, 56, 60], 32), ("Eb", [51, 55, 58], 27)]
# the hook: (step in 16ths from the bar's start, MIDI note, length in 16ths), two bars
HOOK = [
    (0, 72, 2), (2, 72, 2), (4, 75, 2), (6, 72, 2), (8, 70, 3), (11, 68, 3), (14, 67, 2),
    (16, 68, 2), (18, 68, 2), (20, 72, 2), (22, 70, 2), (24, 68, 3), (27, 65, 3), (30, 67, 2),
]


def song():
    """The song on its own, with the timeline baked in (stops, drops, the tape stop)."""
    m = bus()
    drums = bus()
    t_all = np.arange(N + PAD) / SR

    def bars(t0, t1):
        b = 0
        while t0 + b * BAR < t1 - 1e-6:
            yield b, t0 + b * BAR
            b += 1

    # ---- intro (station speakers): stabs on the off-beats, soft kick, all muffled
    for b, t0 in bars(INTRO0, LIFT0):
        name, notes, root = PROG[b % 4]
        for k in range(4):
            place(m, chord_stab(notes, BEAT * 0.45, 0.5) * 0.35, t0 + k * BEAT + BEAT / 2)
            place(drums, kick(0.35, 120, 45, 0.12) * 0.35, t0 + k * BEAT)
        place(m, stereo(sub_bass(midi(root + 12), BAR * 0.95)) * 0.25, t0)

    # ---- the lift: arpeggio opening up, kick, hats, the build
    for b, t0 in bars(LIFT0, T_HOLD):
        name, notes, root = PROG[b % 4]
        build = b >= 4
        for s in range(16):
            n = notes[s % 3] + (12 if (s // 3) % 2 else 0)
            place(m, stereo(pluck_arp(midi(n), STEP * 0.9), (s % 2) * 0.6 - 0.3) * 0.22, t0 + s * STEP)
        place(m, stereo(sub_bass(midi(root + 12), BAR * 0.95)) * 0.3, t0)
        if b < 10:
            for k in range(4):
                place(drums, kick(0.4, 140, 45, 0.15) * 0.55, t0 + k * BEAT)
        for k in range(8):
            place(drums, stereo(hat(0.06), 0.3) * (0.12 if k % 2 else 0.06), t0 + k * BEAT / 2)
        if build:
            # the snare roll: quarters, eighths, sixteenths, thirty-seconds
            bb = b - 4
            div = 4 if bb < 4 else 8 if bb < 6 else 16 if bb < 7 else 32
            for k in range(div):
                tt = t0 + k * BAR / div
                g = 0.15 + 0.35 * ((bb * BAR + k * BAR / div) / (8 * BAR))
                place(drums, stereo(snare_hit(220 + 20 * bb), (k % 2) * 0.2 - 0.1) * g, tt)
        if b >= 8:
            # a rising saw chord in the last four bars
            rise = supersaw(midi(notes[0] + 12) * 2 ** ((b - 8) / 4), BAR, 7, 0.2, 0.3 + 0.15 * (b - 8))
            place(m, rise * 0.12 * (0.6 + 0.1 * (b - 8)), t0)
    place(m, stereo(riser(8 * BAR)) * 0.9, T_HOLD - 8 * BAR)
    # the stop: a little reverse swell into the cut, then nothing
    place(m, reverse_swell(BEAT * 2) * 0.5, T_HOLD - BEAT * 2)

    # ---- the hold: silence; the creep: a reverse cymbal into the drop
    place(m, reverse_swell(T_DROP - C["release"]) * 0.9, C["release"])

    # ---- the drop: two sections round a breakdown
    BRK0 = T_DROP + 8 * BAR
    BRK1 = BRK0 + 2 * BAR
    END_SONG = C["brakes"] + 0.2
    for b, t0 in bars(T_DROP, END_SONG + BAR):
        if t0 >= END_SONG:
            break
        name, notes, root = PROG[b % 4]
        brk = BRK0 - 1e-6 <= t0 < BRK1 - 1e-6
        if not brk:
            for k in range(4):
                place(drums, big_kick() * 0.85, t0 + k * BEAT)
                place(drums, stereo(hat(0.07, 0.03), 0.25) * 0.16, t0 + k * BEAT + BEAT / 2)
            for k in (1, 3):
                place(drums, stereo(clap(0.35) * 0.9 + snare_hit(200, 0.35) * 0.5, 0) * 0.5, t0 + k * BEAT)
            for k in range(16):
                if k % 4:
                    place(drums, stereo(hat(0.04), -0.3) * 0.05, t0 + k * STEP)
            # off-beat saw stabs (ducked by the kick in the mix) and the sub
            for k in range(4):
                place(m, chord_stab([n + 12 for n in notes], BEAT * 0.48, 0.95) * 0.55, t0 + k * BEAT + BEAT / 2)
            for k in range(4):
                place(m, stereo(sub_bass(midi(root), BEAT * 0.9)) * 0.75, t0 + k * BEAT)
            if b == 0 or t0 >= BRK1 - 1e-6 and abs(t0 - BRK1) < 1e-3:
                place(m, crash(3.0) * 0.8, t0)
        else:
            # breakdown: wide pad, the hook alone in a big room
            pad = ga.pad([n + 12 for n in notes], BAR, 2400, 0.3, 0.6)
            place(m, pad * 0.5, t0)
        # the hook over every second bar pair
        hb = b % 2
        for st, n, ln in HOOK:
            if (st // 16) != hb:
                continue
            nn = n + (12 if b >= 10 and not brk else 0) - (0 if b < 10 else 0)
            v = stereo(lead(midi(nn), ln * STEP * 0.95), 0, 0.4) * (0.32 if not brk else 0.26)
            if brk:
                v = reverb(v, 3.0, 0.5, 6000)
            place(m, v, t0 + (st % 16) * STEP)
    place(m, crash(3.0) * 0.6, BRK1)
    place(m, stereo(riser(2 * BAR, 400, 9000)) * 0.6, BRK0)

    # ---- the outro: the hook on marimba and glockenspiel, claps, light and silly
    O0 = RIDE_END + 0.0
    for b, t0 in bars(O0, DUR + 0.5):
        name, notes, root = PROG[b % 4]
        for st, n, ln in HOOK:
            if (st // 16) != b % 2:
                continue
            place(m, stereo(marimba(midi(n), 0.6), 0.2) * 0.32, t0 + (st % 16) * STEP)
        for k in range(4):
            place(m, stereo(marimba(midi(root + 24), 0.4), -0.3) * 0.25, t0 + k * BEAT)
            place(drums, stereo(kick(0.3, 120, 50, 0.1)) * 0.3, t0 + k * BEAT)
        for k in (1, 3):
            place(drums, stereo(clap(0.3)) * 0.3, t0 + k * BEAT)

    # mix: the song ducks under its kick on the drop (sidechain pump), then the timeline's edits
    mix = m.copy()
    pump = np.ones(len(mix))
    for b, t0 in bars(T_DROP, END_SONG + BAR):
        if BRK0 - 1e-6 <= t0 < BRK1 - 1e-6 or t0 >= END_SONG:
            continue
        for k in range(4):
            i = int((t0 + k * BEAT) * SR)
            L = int(BEAT * SR)
            e = 1 - 0.65 * np.exp(-np.arange(L) / (0.07 * SR))
            pump[i : i + L] = np.minimum(pump[i : i + L], e[: max(0, min(L, len(pump) - i))])
    mix *= pump[:, None]
    mix += drums
    # the station speakers: muffled, mono-ish, smaller
    sp = smooth(LIFT0 + 0.2, LIFT0 - 0.6, t_all)
    for ch in range(2):
        muff = lp(mix[:, ch], 1100)
        mix[:, ch] = mix[:, ch] * (1 - sp) + muff * sp * 0.8
    # the lift: the filter opens over the first bars of the climb
    fc = 900 + 15000 * smooth(LIFT0, LIFT0 + 6 * BAR, t_all) ** 2
    lift_zone = (t_all >= LIFT0) & (t_all < T_HOLD + 0.1)
    filt = np.stack([vfilter(mix[:, ch], fc) for ch in range(2)], axis=1)
    mix[lift_zone] = filt[lift_zone]
    # the build: the whole song swells up the lift
    swell = 0.55 + 0.75 * smooth(LIFT0, T_HOLD, t_all) ** 1.5
    lz = (t_all >= LIFT0 - 0.5) & (t_all < T_HOLD + 0.1)
    mix[lz] *= swell[lz][:, None]
    # the outro a little louder (it's the punchline)
    mix[t_all >= RIDE_END] *= 1.6
    # the stop at the hold (a 30 ms fade), silence to the release
    g = np.ones(len(mix))
    g *= 1 - smooth(T_HOLD - 0.01, T_HOLD + 0.02, t_all)
    g = np.maximum(g, smooth(C["release"] - 0.02, C["release"] + 0.02, t_all))
    mix *= g[:, None]
    # the tunnel: boomy and dull
    tun = smooth(C["tunnel0"] - 0.1, C["tunnel0"] + 0.1, t_all) * (1 - smooth(C["tunnel1"] - 0.05, C["tunnel1"] + 0.2, t_all))
    fct = 16000 - 14500 * tun
    zone = (t_all > C["tunnel0"] - 0.3) & (t_all < C["tunnel1"] + 0.5)
    filt = np.stack([vfilter(mix[:, ch], fct) for ch in range(2)], axis=1)
    mix[zone] = filt[zone]
    # the brakes: tape stop (playback slows to nothing over 1.3 s), then the outro starts clean
    ts0 = C["brakes"] + 0.15
    ts1 = ts0 + 1.3
    i0 = int(ts0 * SR)
    i1 = int(ts1 * SR)
    if i1 < len(mix):
        seg = mix[i0 : i0 + int(1.3 * SR)].copy()
        u = np.linspace(0, 1, i1 - i0)
        rate = (1 - u) ** 1.6
        pos = np.cumsum(rate)
        pos = pos / pos[-1] * len(seg) * 0.55
        tape = np.stack([np.interp(pos, np.arange(len(seg)), seg[:, ch]) for ch in range(2)], axis=1)
        tape *= (1 - u ** 3)[:, None]
        o0 = int(RIDE_END * SR)
        mix[i0:i1] = tape
        mix[i1:o0] = 0
    return mix


# ===================================================================== the ride's sounds

def wind_and_roar():
    """Wind on your ears (with buffeting) and the wheels' roar, both following the speed."""
    sec = DUR
    t = np.arange(int(sec * SR)) / SR
    v = speed_at(t)
    n1 = noise(sec)
    n2 = noise(sec)
    # wind: high-passed hiss, louder as v^2, buffeted; on the lift a gentle breeze growing with height
    buff = 1 + 0.35 * lp(noise(sec), 6) * 30
    wind_g = (v / 32) ** 2 * 0.55 * np.clip(buff, 0.3, 2.0)
    wind_g += 0.04 * smooth(C["chain"], C["liftTop"], t) * (1 - smooth(C["release"], C["over"], t))
    wl = vfilter(n1, 500 + 3500 * np.clip(v / 32, 0, 1), "high") * wind_g
    wr = vfilter(n2, 520 + 3400 * np.clip(v / 32, 0, 1), "high") * wind_g
    # the roar: low rumble and the box-spine's hollow note, from 3 m/s up
    roar_g = smooth(3, 30, v) * 0.5
    r = lp(noise(sec), 220) * 2.2 + bp(noise(sec), 300, 900) * 0.6
    hum = np.sin(2 * np.pi * np.cumsum(70 + 1.5 * v) / SR) * 0.25
    roar = (r + hum) * roar_g
    st = np.stack([wl + roar, wr + roar], axis=1)
    # in the tunnel the roar and wind bounce back
    tun = smooth(C["tunnel0"] - 0.1, C["tunnel0"] + 0.15, t) * (1 - smooth(C["tunnel1"] - 0.1, C["tunnel1"] + 0.3, t))
    wet = reverb(st * tun[:, None], 1.2, 1.0, 2500)[: len(st)]
    st = st * (1 - 0.3 * tun[:, None]) + wet * 0.9
    return st


def chain_lift():
    """The chain: its motor's drone and the ratchet's clacks, on the song's sixteenths."""
    b = bus()
    t0, t1 = C["chain"], C["liftTop"]
    sec = t1 - t0 + 0.5
    tt = t_axis(sec)
    drone = (np.sin(2 * np.pi * 58 * tt) * 0.5 + np.sin(2 * np.pi * 116 * tt) * 0.25 + lp(noise(sec), 300) * 0.5)
    drone *= smooth(0, 0.3, tt) * (1 - smooth(sec - 0.8, sec, tt)) * 0.18
    place(b, stereo(drone), t0)
    # the catch: a heavy clunk
    clunk = sat(lp(noise(0.4), 600) * decay(int(0.4 * SR), 0.05) * 2 + np.sin(2 * np.pi * 70 * t_axis(0.4)) * decay(int(0.4 * SR), 0.12), 2)
    place(b, stereo(clunk) * 0.8, t0)
    k = math.ceil((t0 - LIFT0) / STEP)
    while LIFT0 + k * STEP < t1:
        ts = LIFT0 + k * STEP
        clk = hp(noise(0.05), 1800) * decay(int(0.05 * SR), 0.006) + np.sin(2 * np.pi * 2400 * t_axis(0.05)) * decay(int(0.05 * SR), 0.01) * 0.4
        place(b, stereo(clk, 0.0, 0.3) * (0.16 if k % 2 == 0 else 0.1), ts)
        k += 1
    return b


def heartbeat():
    """Your heart from the top of the lift through the hold, quickening."""
    b = bus()
    t = C["liftTop"] - 3
    while t < C["over"] + 0.3:
        rate = 1.6 + 0.9 * smooth(C["liftTop"], C["release"], t)
        for off, g in ((0, 1.0), (0.13, 0.7)):
            th = np.sin(2 * np.pi * 52 * t_axis(0.18)) * decay(int(0.18 * SR), 0.05)
            place(b, stereo(lp(th, 150)) * 0.55 * g * smooth(C["liftTop"] - 3, C["liftTop"] + 2, t), t + off)
        t += 1 / rate
    return b


def station():
    """The station: crowd murmur, the restraints locking, the floor dropping, the air brakes."""
    b = bus()
    sec = C["chain"] + 2
    murmur = sum(bp(noise(sec), 300 + 200 * k, 900 + 300 * k) * (1 + 0.6 * lp(noise(sec), 2) * 20) for k in range(4)) * 0.05
    murmur *= (1 - smooth(C["dispatch"], C["chain"] + 1, t_axis(sec)))[: len(murmur)]
    place(b, stereo(murmur, 0, 0.6), 0)
    # restraints: a ripple of hydraulic clunks down the train at 0.45 s
    for k in range(18):
        tt = 0.38 + 0.012 * k + RNG.uniform(0, 0.02)
        cl = lp(noise(0.12), 900) * decay(int(0.12 * SR), 0.02) + np.sin(2 * np.pi * 140 * t_axis(0.12)) * decay(int(0.12 * SR), 0.03) * 0.6
        place(b, stereo(cl, RNG.uniform(-0.6, 0.6)) * (0.5 if k in (2, 3) else 0.18), tt)
    # yours and hers, close: a click and a ratchet
    for k in range(5):
        place(b, stereo(hp(noise(0.02), 2500) * decay(int(0.02 * SR), 0.003), -0.1) * 0.3, 0.5 + k * 0.03)
    # the floor dropping away: hiss and a thud below
    hiss = hp(noise(0.7), 2000) * adsr(int(0.7 * SR), 0.02, 0.4) * 0.25
    place(b, stereo(hiss), C["dispatch"] - 1.0)
    thud = lp(noise(0.3), 300) * decay(int(0.3 * SR), 0.06) * 0.8
    place(b, stereo(thud), C["dispatch"] - 0.45)
    # dispatch: the air brakes let go
    psh = bp(noise(0.9), 1500, 7000) * adsr(int(0.9 * SR), 0.01, 0.6) * 0.35
    place(b, stereo(psh, 0.2, 0.5), C["dispatch"])
    # the tyres pushing you out
    sec2 = C["chain"] - C["dispatch"] + 0.4
    ty = lp(noise(sec2), 180) * 0.4 + np.sin(2 * np.pi * np.cumsum(40 + 15 * smooth(0, 1.5, t_axis(sec2))) / SR) * 0.15
    ty *= smooth(0, 0.4, t_axis(sec2)) * (1 - smooth(sec2 - 0.4, sec2, t_axis(sec2)))
    place(b, stereo(ty), C["dispatch"])
    return b


def hold_and_release():
    b = bus()
    h0, rel = C["holdStart"], C["release"]
    # the holding brake grabs: a hiss and a deep clank
    place(b, stereo(bp(noise(0.6), 1200, 6000) * adsr(int(0.6 * SR), 0.01, 0.4) * 0.3), h0 - 0.1)
    clank = sat(np.sin(2 * np.pi * 95 * t_axis(0.8)) * decay(int(0.8 * SR), 0.18) + lp(noise(0.8), 800) * decay(int(0.8 * SR), 0.05), 1.5)
    place(b, stereo(clank) * 0.6, h0)
    # creaking steel while you hang there
    for k in range(6):
        tt = h0 + 0.4 + k * 0.52 + RNG.uniform(0, 0.15)
        sec = 0.35 + RNG.uniform(0, 0.3)
        f = 180 + RNG.uniform(0, 160)
        tc = t_axis(sec)
        cr = signal.sawtooth(2 * np.pi * np.cumsum(f * (1 + 0.3 * np.sin(2 * np.pi * 9 * tc))) / SR) * 0.3
        cr = bp(cr, 300, 2500) * adsr(len(tc), 0.05, 0.1) * (1 + 0.5 * np.sin(2 * np.pi * 23 * tc))
        place(b, stereo(cr, RNG.uniform(-0.7, 0.7), 0.4) * 0.12, tt)
    # wind gusts up there
    sec = rel - h0 + 1.2
    gust = hp(noise(sec), 700) * (0.06 + 0.05 * np.sin(2 * np.pi * 0.4 * t_axis(sec)) ** 2)
    place(b, stereo(gust, 0, 0.8), h0)
    # her bubble: a rubbery stretching squeak, rising
    b0, b1 = h0 + 0.7, rel
    sec = b1 - b0
    tb = t_axis(sec)
    f = 300 + 500 * (tb / sec) ** 1.5
    sq = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * tb))
    sq = bp(sq, 250, 1800) * smooth(0, 0.3, tb) * 0.05
    place(b, stereo(sq, 0.55), b0)
    # POP
    pop = hp(noise(0.05), 1200) * decay(int(0.05 * SR), 0.004) * 1.2 + np.sin(2 * np.pi * 1400 * t_axis(0.05)) * decay(int(0.05 * SR), 0.006)
    place(b, stereo(pop, 0.5) * 0.9, rel)
    # the brake lets go: a clunk and a long hiss
    place(b, stereo(clank * 0.7), rel + 0.04)
    place(b, stereo(bp(noise(1.0), 1500, 7000) * adsr(int(1.0 * SR), 0.01, 0.7) * 0.25), rel + 0.05)
    # your breath: a sharp gasp in
    gasp = bp(noise(0.5), 600, 3500) * adsr(int(0.5 * SR), 0.12, 0.2) * 0.22
    place(b, stereo(gasp), rel + 0.35)
    # the train creaking forward over the edge
    rum = lp(noise(C["over"] - rel + 0.5), 160) * smooth(0, C["over"] - rel, t_axis(C["over"] - rel + 0.5)) * 0.4
    place(b, stereo(rum), rel)
    return b


def scream(sec, f0, seed, vowel="a"):
    """A rider's scream: a harsh high voice through an 'aah' formant filter, wavering."""
    r = np.random.default_rng(seed)
    t = t_axis(sec)
    contour = f0 * (1 + 0.15 * smooth(0, 0.3, t) - 0.1 * smooth(sec * 0.5, sec, t))
    jit = 1 + 0.01 * lp(r.standard_normal(len(t)), 30) * 8 + 0.012 * np.sin(2 * np.pi * (6 + r.uniform(-1, 1)) * t)
    ph = 2 * np.pi * np.cumsum(contour * jit) / SR
    src = signal.sawtooth(ph) + 0.25 * r.standard_normal(len(t))
    forms = {"a": [(850, 120), (1250, 140), (2900, 200)], "e": [(560, 100), (1900, 160), (2700, 200)]}[vowel]
    out = np.zeros(len(t))
    for fc, bw in forms:
        out += bp(src, fc - bw, fc + bw, 2)
    out = sat(out * 2.5, 2)
    return out * adsr(len(t), 0.08, 0.35, 1.3)


def screams():
    b = bus()
    moments = [(C["over"] + 0.2, 2.6), (C["immTop"] - 0.8, 1.6), (C["splash0"] - 0.3, 1.2), (C["zrRoll"] + 0.4, 1.4), (C["hopTop"] - 0.3, 1.0)]
    seed = 10
    for t0, sec in moments:
        for k in range(5):
            seed += 1
            f0 = [520, 610, 700, 450, 780][k]
            s = scream(sec + RNG.uniform(-0.3, 0.3), f0, seed, "a" if k % 2 else "e")
            place(b, stereo(lp(s, 3500), RNG.uniform(-0.8, 0.8), 0.6) * 0.035, t0 + RNG.uniform(0, 0.3))
    # behind you, and windswept
    return b


PHOTO_T = 35.1  # src/coaster/world.ts BEAT.photo: the on-ride camera's flash


def flash():
    """The on-ride camera as you pass it: the flash's crack and whine, the shutter."""
    b = bus()
    crack = hp(noise(0.08), 1500) * decay(int(0.08 * SR), 0.01)
    tw = t_axis(0.5)
    whine = np.sin(2 * np.pi * np.cumsum(3000 + 2500 * tw) / SR) * decay(len(tw), 0.12) * 0.15
    place(b, stereo(crack, -0.5) * 0.6, PHOTO_T)
    place(b, stereo(whine, -0.5) * 0.4, PHOTO_T + 0.02)
    return b


def splash():
    b = bus()
    t0 = C["splash0"]
    sec = 2.6
    tt = t_axis(sec)
    n = noise(sec)
    body = vfilter(n, 7000 * np.exp(-tt * 1.4) + 600, "low") * (decay(len(tt), 0.5) * 1.0 + 0.2 * decay(len(tt), 1.5))
    whoosh = bp(noise(0.6), 300, 2500) * adsr(int(0.6 * SR), 0.3, 0.1) * 0.6
    place(b, stereo(whoosh, 0, 0.5), t0 - 0.45)
    place(b, stereo(body, 0, 0.7) * 0.9, t0)
    # spray pattering down
    for k in range(120):
        tk = t0 + 0.3 + RNG.exponential(0.6)
        drop = hp(noise(0.02), 3000) * decay(int(0.02 * SR), 0.003)
        place(b, stereo(drop, RNG.uniform(-1, 1)) * 0.08, tk)
    return b


def tunnel_lights():
    """A soft whoomp as each strip light whips past in the tunnel."""
    b = bus()
    t = C["tunnel0"] + 0.02
    while t < C["tunnel1"]:
        w = bp(noise(0.08), 200, 1200) * decay(int(0.08 * SR), 0.02)
        place(b, stereo(w) * 0.12, t)
        t += 2.4 / max(5, speed_at(t))
    # pressure in and out
    place(b, stereo(lp(noise(0.5), 300) * adsr(int(0.5 * SR), 0.05, 0.3)) * 0.6, C["tunnel0"] - 0.05)
    place(b, stereo(lp(noise(0.5), 300) * adsr(int(0.5 * SR), 0.05, 0.3)) * 0.5, C["tunnel1"] - 0.05)
    return b


def brakes():
    b = bus()
    t0 = C["brakes"]
    sec = 2.6
    tt = t_axis(sec)
    f = 520 * np.exp(-tt * 0.9) + 90
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25 + bp(noise(sec), 400, 3000) * 0.5
    tone *= adsr(len(tt), 0.05, 0.6) * (1 - 0.6 * smooth(0, sec, tt))
    place(b, stereo(tone, 0, 0.4) * 0.5, t0)
    # cheering and laughing riders (a happy murmur)
    sec = 2.2
    laugh = sum(bp(noise(sec), 500 + 300 * k, 1500 + 400 * k) * (0.5 + 0.5 * np.sin(2 * np.pi * (5 + k) * t_axis(sec))) for k in range(3)) * 0.05
    place(b, stereo(laugh, 0, 0.8), t0 + 0.8)
    return b


def ending():
    b = bus()
    e0 = RIDE_END
    # the exit: a different room, people chatting
    sec = END["dur"]
    murmur = sum(bp(noise(sec), 300 + 200 * k, 900 + 300 * k) * (1 + 0.6 * lp(noise(sec), 2) * 20) for k in range(4)) * 0.035
    place(b, stereo(murmur, 0, 0.6), e0)
    # the photo comes up: a shutter, then a bright ding
    shut = hp(noise(0.06), 2000) * decay(int(0.06 * SR), 0.008)
    place(b, stereo(shut) * 0.4, e0 + END["ding"] - 0.15)
    place(b, stereo(shut) * 0.3, e0 + END["ding"] - 0.08)
    ding = ga.bell(midi(96), 1.8) * 0.4 + ga.bell(midi(91), 1.8) * 0.25
    place(b, stereo(ding, 0, 0.3), e0 + END["ding"])
    # the zoom into your face: a comedic slide whistle up
    sec = END["zoom"][1] - END["zoom"][0]
    tw = t_axis(sec)
    fw = 700 * 2 ** (1.4 * tw / sec)
    wh = np.sin(2 * np.pi * np.cumsum(fw) / SR) * adsr(len(tw), 0.05, 0.1) * 0.12
    place(b, stereo(wh), e0 + END["zoom"][0])
    # "again?": a bright stinger
    for k, n in enumerate([77, 81, 84, 89]):
        place(b, stereo(glock(midi(n), 1.2), 0.2) * 0.3, e0 + END["again"] + k * 0.07)
    return b


def mix():
    out = bus()
    out += song() * 0.82
    w = wind_and_roar()
    out[: len(w)] += w * 0.72
    out += chain_lift() * 1.0
    out += heartbeat() * 0.9
    out += station() * 1.0
    out += hold_and_release() * 1.0
    out += screams() * 1.0
    out += splash() * 0.9
    out += flash() * 1.0
    out += tunnel_lights() * 1.0
    out += brakes() * 1.0
    out += ending() * 1.0
    # nothing after the end; a 10 ms fade at the very end
    n_end = int(DUR * SR)
    out = out[:n_end]
    out[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))[:, None]
    return out


if __name__ == "__main__":
    st = mix()
    peak = np.max(np.abs(st))
    print("peak before norm", round(float(peak), 3), "duration", round(len(st) / SR, 3))
    st = st / peak * 0.89
    os.makedirs(os.path.join(ROOT, "out", "coaster"), exist_ok=True)
    wavfile.write(os.path.join(ROOT, "out", "coaster", "bed.wav"), SR, st.astype(np.float32))
    ga.write_mp3(os.path.join(ROOT, "public", "coaster", "bed.mp3"), st, 0.89)
    print("wrote public/coaster/bed.mp3 and out/coaster/bed.wav")
