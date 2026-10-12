#!/usr/bin/env python3
"""
Sound for the Wedding composition ("POV: you're the drone carrying the wedding rings"): all synthesised,
timed from src/wedding/flight.json (the cues in video seconds, the drone's path frame by frame). No voice.

  0-1.6      a lakeside wedding: birds, a breeze, the guests murmuring, a string quartet playing the Canon
             in D (Pachelbel, 1680s) at a tempo that puts its second time round on the reveal and its third
             on the couple; the kid's controller beeps as it connects
  1.6        the motors arm (their three rising beeps) and the props spin up; grass thrashing
  3.6        liftoff; the drone's buzz follows its throttle all the way (thrust from the flight path)
  15.3       the yank: the first violin slips off its note; 16.4 the dip over the guests: gasps, the
             quartet loses its place; 16.9 a hat goes
  20.4       the quartet stops dead. Silence: the drone hovering in the officiant's face, a cricket, a cough,
             grandma losing it, the room starting to giggle; the gimbal turning to the groom, to the bride
  29.4       full throttle, straight up: a riser, a snare roll, the guests' "whoa"
  32.5       the top, the sunset: the DJ's house remix of the canon drops (124 bpm, D major)
  36.75      past the waiter; 37.2 in under the tent (the room's reverb); 40.3 the DJ's air horn;
             43.1 the chandelier's crystals
  45.3       slow motion: everything on tape at half speed, a heartbeat; the champagne tower shatters
  49.7       back to speed for the tumble; 50.75 slow again; 51.75 into the cake (the music dies with it)
  53.4       the props clogged, winding down, everything muffled by frosting; 54.6 the feed breaks up
  56.2       back: the tent, quiet; gasps, the baker fainting, the bride, the groom's breath, the kid (and
             grandma somewhere behind, losing it again); the groom turning slowly to look at the kid
  63.2       digging in the cake, the ribbon coming out with nothing on it; a beat of silence
  66.2       the kid points; the gimbal whirs round; 67.8 the zoom: a dramatic orchestra hit... on the dog.
             Its tail thumping, the strings come back warm, its little "hm?" on the head tilt, the room's
             "aww", and the canon's last cadence.

    python3 scripts/generate-wedding-audio.py   # writes public/wedding/bed.mp3 (and out/wedding/bed.wav)
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
noise, t_axis, kick, clap, hat = ga.noise, ga.t_axis, ga.kick, ga.clap, ga.hat
ROOT = os.path.dirname(HERE)
with open(os.path.join(ROOT, "src", "wedding", "flight.json")) as f:
    FL = json.load(f)
FPS = FL["fps"]
C = FL["cues"]
SLOW = FL["slow"]
FR = FL["frames"]
NF = len(FR)
DUR = NF / FPS
N = int(DUR * SR)
PAD = SR * 8
RNG = np.random.default_rng(1215)
G = 9.81


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
    k = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def vfilter(x, fc, kind="low", block=256):
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


def vfilter_st(st, fc, kind="low"):
    return np.stack([vfilter(st[:, c], fc, kind) for c in range(2)], axis=1)


def pan_st(st, pan):
    """Re-pan a stereo signal (keeps its width)."""
    l, r = st[:, 0], st[:, 1]
    return np.stack([l * math.sqrt((1 - pan) / 2) * 1.414, r * math.sqrt((1 + pan) / 2) * 1.414], axis=1)


# ===================================================================== the flight, per sample

T_FR = np.arange(NF) / FPS
W_FR = np.array([fr["w"] for fr in FR])
P_FR = np.array([fr["p"] for fr in FR])
SPEED_FR = np.array([fr["speed"] for fr in FR])


def at_t(arr, t):
    return np.interp(np.asarray(t) * FPS, np.arange(NF), arr)


def tape_speed(t):
    """How fast the 'tape' runs at video time t: 1, half speed in the slow motion, stopping in the cake."""
    t = np.asarray(t, float)
    r = np.ones_like(t)
    for a0, a1, b0, b1, _ in SLOW:
        r -= 0.5 * smooth(a0, a1, t) * (1 - smooth(b0, b1, t))
    # the second slow motion ends in the cake: no coming back up to speed, the music dies
    r = np.where(t > C["cakeHit"], 0.5 * (1 - smooth(C["cakeHit"], C["cakeHit"] + 1.1, t)), r)
    return r


def throttle_track():
    """The props' speed (1 = hover) through the flight, from the thrust the path needs: |a + g| with drag."""
    w = W_FR
    p = P_FR
    dw = np.gradient(w)
    dw[dw < 1e-4] = 1e-4
    v = np.gradient(p, axis=0) / dw[:, None]
    a = np.gradient(v, axis=0) / dw[:, None]
    for k in range(3):
        a[:, k] = np.convolve(a[:, k], np.ones(5) / 5, mode="same")
    thrust = a + np.array([0, G, 0]) + 0.05 * v * np.linalg.norm(v, axis=1)[:, None]
    thr = np.sqrt(np.clip(np.linalg.norm(thrust, axis=1) / G, 0.3, 4.0))
    # on the grass: off, spinning up to idle, then lifting
    t = T_FR
    idle = 0.72 * smooth(C["spinUp"], C["spinUp"] + 1.1, t)
    thr = np.where(t < C["liftoff"], idle + (1.0 - 0.72) * smooth(C["liftoff"] - 0.35, C["liftoff"], t) * (t > C["spinUp"]), thr)
    thr = np.convolve(thr, np.ones(3) / 3, mode="same")
    # after the cake: clogged, sputtering down to nothing
    dead = smooth(C["cakeHit"], C["rest"] + 0.5, t)
    thr = thr * (1 - dead) + 0.0 * dead
    thr[t > C["rest"] + 0.6] = 0
    return thr


THR = throttle_track()


# ===================================================================== instruments

def bowed(f, sec, part="violin", vib=0.0055, att=0.09, rel=0.22, bright=1.0, trem=0.0, slide=None, seed=0):
    """A bowed string: two slightly detuned saws with a delayed vibrato, bow noise, the body's resonances."""
    r = np.random.default_rng(seed)
    t = t_axis(sec)
    ff = np.full(len(t), f)
    if slide is not None:
        # (start, semitones, duration): a slip off the note and back
        s0, semi, d = slide
        k = np.clip((t - s0) / d, 0, 1)
        ff = ff * 2 ** (semi * np.sin(np.pi * k) / 12)
    vrate = 5.2 + r.uniform(-0.4, 0.4)
    vibr = 1 + vib * np.sin(2 * np.pi * vrate * t + r.uniform(0, 6)) * smooth(0.12, 0.45, t)
    ph = 2 * np.pi * np.cumsum(ff * vibr) / SR
    v = signal.sawtooth(ph + r.uniform(0, 6)) * 0.6 + signal.sawtooth(ph * 1.0025 + r.uniform(0, 6)) * 0.4
    v += bp(r.standard_normal(len(t)), min(f * 2, 6000), min(f * 9, 16000)) * 0.05
    body = {"violin": [(290, 1.0), (470, 0.8), (1050, 0.6), (2900, 0.45)], "viola": [(230, 1.0), (380, 0.8), (900, 0.5), (2400, 0.35)], "cello": [(110, 1.0), (210, 0.9), (550, 0.5), (1600, 0.3)]}[part]
    out = lp(v, (3600 if part == "violin" else 2600 if part == "viola" else 1800) * bright) * 0.6
    for fc, g in body:
        out += bp(v, fc * 0.85, fc * 1.15) * g * 0.5
    env = adsr(len(t), att, rel, 1.4)
    if trem > 0:
        env = env * (1 - trem + trem * (0.5 + 0.5 * np.sin(2 * np.pi * 13 * t)))
    return out * env


def harp(f, sec=2.5):
    t = t_axis(sec)
    v = sum((0.8 / k) * np.sin(2 * np.pi * k * f * t) * np.exp(-t * (1.6 + k * 1.1)) for k in range(1, 7))
    return v * adsr(len(t), 0.003, 0.3)


def glock(f, sec=1.4):
    return ga.bell(f, sec) * 0.6


def house_piano(notes, sec):
    """The house piano stab: bright, percussive, a little detuned."""
    t = t_axis(sec)
    out = np.zeros(len(t))
    for n in notes:
        f = midi(n)
        for k, a in ((1, 1.0), (2, 0.55), (3, 0.3), (4, 0.18), (5, 0.1), (6, 0.06)):
            out += a * np.sin(2 * np.pi * f * k * 1.0008 ** k * t) * np.exp(-t * (3.2 + 1.6 * k))
    out = out / len(notes)
    return sat(out * 1.4, 1.3) * adsr(len(t), 0.002, 0.04)


def funk_bass(f, sec):
    t = t_axis(sec)
    ph = 2 * np.pi * f * t
    v = signal.sawtooth(ph) * 0.5 + np.sin(ph) * 0.8
    fc = 300 + 1500 * np.exp(-t * 14)
    v = vfilter(v, fc, "low", 128)
    return sat(v * 1.3, 1.5) * adsr(len(t), 0.003, 0.03)


def synth_lead(f, sec):
    t = t_axis(sec)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.8 * t) * smooth(0.1, 0.3, t)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    v = signal.square(ph, 0.35) * 0.5 + signal.sawtooth(ph * 1.003) * 0.5
    v = lp(v, 4200)
    return v * adsr(len(t), 0.008, 0.06) * np.exp(-t * 1.2)


def snare(sec=0.25, tone=190):
    n = noise(sec)
    body = np.sin(2 * np.pi * tone * t_axis(sec)) * decay(int(sec * SR), 0.05)
    return bp(n, 1500, 9000) * decay(int(sec * SR), 0.08) + body * 0.5


def crash(sec=2.5):
    n = noise(sec)
    return hp(n, 3000) * decay(len(n), 0.8) * 0.5 + bp(n, 5000, 12000) * decay(len(n), 1.3) * 0.25


def timpani(f, sec=2.0):
    t = t_axis(sec)
    ff = f * (1 + 0.04 * np.exp(-t * 12))
    v = np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t * 2.2) + 0.4 * np.sin(2 * np.pi * np.cumsum(ff * 1.5) / SR) * np.exp(-t * 4)
    v += lp(noise(sec), 400) * np.exp(-t * 30) * 0.5
    return v * adsr(len(t), 0.002, 0.2)


# ===================================================================== the quartet: Canon in D

# the ground (cello), one note a beat, and the chords over it
GROUND = [50, 45, 47, 42, 43, 38, 43, 45]  # D3 A2 B2 F#2 G2 D2 G2 A2
CHORDS = [[62, 66, 69], [61, 64, 69], [62, 66, 71], [61, 66, 69], [62, 67, 71], [62, 66, 69], [62, 67, 71], [61, 64, 69]]
LINE1 = [78, 76, 74, 73, 71, 69, 71, 73]  # F#5 E5 D5 C#5 B4 A4 B4 C#5, a note a beat
LINE2 = [74, 73, 71, 69, 67, 66, 67, 64]  # D5 C#5 B4 A4 G4 F#4 G4 E4
LINE3 = [62, 66, 69, 67, 66, 62, 66, 64, 62, 59, 62, 69, 67, 71, 69, 67]  # in eighths
Q_BEAT = C["reveal"] / 8  # the second time round lands on the reveal, the third on the couple
assert abs(Q_BEAT * 16 - C["couple"]) < 0.05


def quartet():
    """The ceremony's canon, until the quartet stops dead at the officiant. Laid out in video time."""
    b = bus()
    stop = C["silence"]
    beat = Q_BEAT
    falter0, falter1 = C["dip"], C["dip"] + 0.95  # they lose their place as it skims the guests
    yank = C["yank"]

    def play(part, n, t0, dur, gain, pan, seed, **kw):
        if t0 >= stop:
            return
        dur = min(dur, stop - t0 + 0.06)
        if falter0 <= t0 < falter1:
            return
        trem = 0.55 if (falter1 <= t0 < falter1 + 1.0) else 0.0
        s = bowed(midi(n), dur + 0.25, part, trem=trem, seed=seed, **kw)
        # cut short at the stop, with the bow's scrape
        place(b, stereo(s, pan, 0.2) * gain, t0)

    seed = 1
    for g in range(3):
        g0 = g * 8 * beat
        for i in range(8):
            t0 = g0 + i * beat
            seed += 1
            play("cello", GROUND[i], t0, beat * 0.98, 0.5, 0.35, seed, vib=0.003, att=0.05, rel=0.12)
            # the viola holds the chord's middle, the second violin the top, both soft
            ch = CHORDS[i]
            play("viola", ch[1] - 12 + 12, t0, beat, 0.13, 0.15, seed + 100, att=0.18, rel=0.25)
            if g >= 1:
                play("violin", LINE1[i] - 12 if g == 2 else LINE1[i], t0, beat, 0.2, -0.3, seed + 200)
        # the first violin's line for this time round
        line = [LINE1, LINE2, None][g]
        if line is not None:
            for i, n in enumerate(line):
                t0 = g0 + i * beat
                seed += 1
                play("violin", n, t0, beat * 1.02, 0.3, -0.15, seed + 300)
        else:
            for i, n in enumerate(LINE3):
                t0 = g0 + i * beat / 2
                seed += 1
                sl = None
                if t0 <= yank < t0 + beat / 2:
                    sl = (yank - t0, -2.5, 0.45)
                play("violin", n, t0, beat / 2 * 1.05, 0.32, -0.15, seed + 300, slide=sl, att=0.04, rel=0.08)
    # the falter: a held, anxious tremolo after the dip
    for n, part, pan in ((74, "violin", -0.15), (69, "violin", -0.3), (66, "viola", 0.15), (50, "cello", 0.35)):
        s = bowed(midi(n), 1.0, part, trem=0.7, seed=900 + n, att=0.05, rel=0.2)
        place(b, stereo(s, pan, 0.2) * 0.22, falter0 + 0.05)
    # the stop: the first violin's bow scrapes off the string
    sc = t_axis(0.35)
    scrape = signal.sawtooth(2 * np.pi * np.cumsum(midi(76) * (1 - 0.25 * sc / 0.35)) / SR) * 0.4 + bp(noise(0.35), 1500, 7000) * 0.6
    scrape = bp(scrape, 600, 6000) * adsr(len(sc), 0.005, 0.15)
    place(b, stereo(scrape, -0.15) * 0.3, stop)
    # cut everything at the stop (a fast fade so held notes don't ring on)
    i0 = int(stop * SR)
    fade = int(0.08 * SR)
    b[i0 : i0 + fade] *= np.linspace(1, 0, fade)[:, None]
    b[i0 + fade :] = 0
    place(b, stereo(scrape, -0.15) * 0.3, stop)
    return reverb(b, 2.6, 0.32, 4200)[: len(b)]


# ===================================================================== the DJ's house remix of the canon

BPM = 124
BEAT = 60 / BPM
STEP = BEAT / 4
T_DROP = C["drop"]
BUILD0 = C["throttle"]


def house():
    """The remix, laid out in 'tape time' (it gets slowed with the slow motion): from the drop to well past
    the crash; the build before it (the riser, the roll) in video time."""
    sec = 40.0
    b = np.zeros((int(sec * SR) + PAD, 2))
    bars = int(sec / (4 * BEAT)) + 1
    for bar in range(bars):
        t_bar = bar * 4 * BEAT
        for q in range(4):
            tb = t_bar + q * BEAT
            place(b, stereo(kick(0.45, 150, 46, 0.17)) * 0.95, tb)
            # off-beat open hat, sixteenth closed hats with a swing
            place(b, stereo(hat(0.16, 0.05), 0.25) * 0.22, tb + BEAT / 2)
            for s16 in (1, 3):
                place(b, stereo(hat(0.05, 0.012), -0.3) * 0.1, tb + s16 * STEP + (0.012 if s16 == 3 else 0))
            if q in (1, 3):
                place(b, stereo(clap(0.3), 0, 0.4) * 0.42, tb)
        # the ground: a chord every two beats
        for half in range(2):
            i = (bar * 2 + half) % 8
            t0 = t_bar + half * 2 * BEAT
            root = GROUND[i] - 12 + (12 if GROUND[i] < 43 else 0)
            # the bass: root, octave, a pickup, funk
            for st, n, d in ((0, root, 0.8), (3, root + 12, 0.5), (4, root, 0.6), (6, root + 12, 0.4), (7, root + 7, 0.3)):
                place(b, stereo(funk_bass(midi(n), STEP * (2.2 if d > 0.5 else 1.3))) * 0.42 * d, t0 + st * STEP)
            # house piano stabs: the classic off-beat push
            ch = [n - 0 for n in CHORDS[i]] + [CHORDS[i][0] + 12]
            for st in (0, 3, 6):
                place(b, stereo(house_piano(ch, 0.32), 0.1, 0.4) * 0.3, t0 + st * STEP)
        # the canon's eighth-note line on a lead from the third bar
        if bar >= 2:
            for k, n in enumerate(LINE3[(bar % 2) * 8 : (bar % 2) * 8 + 8]):
                place(b, stereo(synth_lead(midi(n + 12), BEAT * 0.48), -0.2, 0.5) * 0.14, t_bar + k * BEAT / 2)
    place(b, stereo(crash(3.0), 0, 0.5) * 0.5, 0)
    place(b, stereo(kick(0.6, 120, 38, 0.3)) * 0.8, 0)
    return reverb(b, 1.2, 0.12, 6000)[: len(b)]


def build():
    """Full throttle to the top: a riser, a snare roll doubling up, the canon's ground speeding up."""
    b = bus()
    sec = T_DROP - BUILD0
    tt = t_axis(sec)
    n = noise(sec)
    fc = 300 * (9000 / 300) ** (tt / sec)
    rise = vfilter(n, fc, "low") * (tt / sec) ** 1.5 * 0.5
    place(b, stereo(rise, 0, 0.6), BUILD0)
    # the roll: quarters, eighths, sixteenths, thirty-seconds
    t = BUILD0 + 0.2
    while t < T_DROP - 0.03:
        u = (t - BUILD0) / sec
        rate = 2 if u < 0.3 else 4 if u < 0.6 else 8 if u < 0.85 else 16
        place(b, stereo(snare(0.2), 0.05) * (0.12 + 0.3 * u), t)
        t += 2 * BEAT / rate  # rate 2, 4, 8, 16: quarters, eighths, sixteenths, thirty-seconds
    # the strings sawing up the ground, faster and faster, then gone into the drop
    t = BUILD0 + 0.1
    k = 0
    while t < T_DROP - 0.12:
        u = (t - BUILD0) / sec
        d = 0.42 - 0.3 * u
        s = bowed(midi(GROUND[k % 8] + 24), d + 0.1, "violin", att=0.02, rel=0.05, seed=2000 + k)
        place(b, stereo(s, -0.2, 0.3) * (0.08 + 0.12 * u), t)
        t += d
        k += 1
    # the gap before the drop: a breath
    i0 = int((T_DROP - 0.1) * SR)
    b[i0 : int(T_DROP * SR)] *= 0.15
    return b


def music():
    """Everything musical under the flight: the quartet, the build, the remix (on tape, slowed)."""
    out = bus()
    out += quartet() * 0.95
    out += build() * 0.9
    # the remix on its tape: tape time tau(t) runs with the tape speed from the drop
    t = np.arange(N) / SR
    r = tape_speed(t)
    tau = np.cumsum(r) / SR
    tau -= tau[int(T_DROP * SR)]
    h = house()
    idx = tau * SR
    valid = (t >= T_DROP) & (idx >= 0) & (idx < len(h) - 1)
    # as the tape stops the sound goes with it (and a stopped tape is silent, not held on one sample)
    gone = np.clip(r / 0.12, 0, 1)
    for c in range(2):
        out[: N, c] += np.where(valid, np.interp(idx, np.arange(len(h)), h[:, c]), 0) * gone * 0.85
    # under the tent the remix gets the room: more bass and a reverb tail
    return out


# ===================================================================== the drone

def drone_sound():
    """Four rotors' buzz (blade-pass at ~210 Hz in the hover, up with the throttle), the motors' whine, all
    on the tape speed in the slow motion; with the props' wash on the mic."""
    t = np.arange(N) / SR
    thr = np.interp(t * FPS, np.arange(NF), THR)
    r = tape_speed(t)
    r = np.where(t > C["cakeHit"], 0.5 + 0.5 * smooth(C["cakeHit"], C["cakeHit"] + 0.3, t), r)
    on = (thr > 0.01).astype(float)
    out = np.zeros((N, 2))
    for k, (det, pan) in enumerate(((1.0, -0.5), (1.013, 0.5), (0.991, -0.35), (1.021, 0.35))):
        f = 210 * thr * det * r
        f = f + 2.5 * np.sin(2 * np.pi * (0.7 + 0.2 * k) * t)  # the ESCs hunting
        ph = 2 * np.pi * np.cumsum(f) / SR
        v = np.zeros(N)
        for h in range(1, 13):
            v += (1 / h**0.85) * np.sin(h * ph + RNG.uniform(0, 6))
        # the blades chopping air: noise pulsed at the blade rate
        chop = bp(RNG.standard_normal(N), 400, 3500) * (0.5 + 0.5 * np.sin(ph)) ** 2
        v = v * 0.5 + chop * 0.6
        out += stereo(v, pan * 0.6) * 0.25
    # the motors' whine
    fw = 210 * thr * 3.5 * r
    wh = np.sin(2 * np.pi * np.cumsum(fw) / SR) * 0.08 + np.sin(2 * np.pi * np.cumsum(fw * 2.01) / SR) * 0.03
    out += stereo(wh) * 1.0
    loud = (0.5 + 0.4 * np.clip(thr - 0.7, 0, 1.5)) * on
    # after the crash: clogged with cake, sputtering
    sput = 1 - 0.85 * smooth(C["cakeHit"], C["cakeHit"] + 0.2, t) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 7.3 * t + 3 * np.sin(2 * np.pi * 1.7 * t))))
    out *= (loud * sput)[:, None]
    out = np.stack([lp(out[:, 0], 7000), lp(out[:, 1], 7000)], axis=1)
    b = bus()
    b[:N] += out
    return b


def wind():
    """Wind over the mic: with the drone's airspeed (as heard on the tape), buffeting."""
    t = np.arange(N) / SR
    sp = np.interp(t * FPS, np.arange(NF), SPEED_FR)
    r = tape_speed(t)
    g = np.clip(sp / 14, 0, 1.4) ** 2 * (0.75 + 0.25 * r)
    buff = np.clip(1 + 30 * lp(RNG.standard_normal(N), 5), 0.4, 1.8)
    fc = (400 + 2600 * np.clip(sp / 14, 0, 1)) * (0.4 + 0.6 * r)
    l = vfilter(RNG.standard_normal(N), fc, "low") * g * buff * 0.55
    rr = vfilter(RNG.standard_normal(N), fc * 1.05, "low") * g * buff * 0.55
    b = bus()
    b[:N] += np.stack([l, rr], axis=1)
    return b


# ===================================================================== people (no words)

FORMANTS = {"a": [(800, 1200, 2500)], "o": [(500, 850, 2400)], "e": [(500, 1800, 2500)], "u": [(350, 700, 2300)], "m": [(280, 1200, 2300)]}


def voiced(f0, sec, vowel_from="a", vowel_to=None, breath=0.3, seed=0, contour=None):
    """A non-verbal voice: a glottal buzz through formants (sliding from one vowel to another)."""
    r = np.random.default_rng(seed)
    t = t_axis(sec)
    ff = f0 * (contour(t) if contour else 1.0) * (1 + 0.01 * lp(r.standard_normal(len(t)), 20) * 6)
    ph = 2 * np.pi * np.cumsum(ff) / SR
    src = signal.sawtooth(ph) * 0.7 + r.standard_normal(len(t)) * breath
    fa = FORMANTS[vowel_from][0]
    fb = FORMANTS[vowel_to or vowel_from][0]
    out = np.zeros(len(t))
    for j, bw in enumerate((110, 140, 220)):
        fc = fa[j] + (fb[j] - fa[j]) * smooth(0.1, 0.9, t / max(sec, 1e-3))
        out += vfilter(vfilter(src, fc + bw, "low"), fc - bw, "high") * (1.0 if j == 0 else 0.7 if j == 1 else 0.4)
    return out


def gasp(sec=0.45, seed=0, vowel="a"):
    """An in-breath of shock: breathy noise through a vowel, fast in, quick out."""
    r = np.random.default_rng(seed)
    t = t_axis(sec)
    n = r.standard_normal(len(t))
    f1, f2, f3 = FORMANTS[vowel][0]
    v = bp(n, f1 * 0.8, f1 * 1.25) + bp(n, f2 * 0.85, f2 * 1.15) * 0.8 + bp(n, f3 * 0.9, f3 * 1.1) * 0.4 + hp(n, 3000) * 0.2
    return v * adsr(len(t), 0.03, 0.25, 1.2) * np.exp(-t * 3)


def crowd_gasp(t0, n=14, spread=0.25, gain=1.0):
    b = bus()
    for k in range(n):
        s = gasp(0.4 + RNG.uniform(0, 0.25), 300 + k + int(t0 * 10), "a" if k % 3 else "o")
        place(b, stereo(s, RNG.uniform(-0.8, 0.8)) * 0.05 * gain, t0 + RNG.uniform(0, spread))
    return b


def laugh(t0, sec, f0, rate, seed, gain, pan, vowel="a"):
    """Ha-ha-ha: voiced pulses with breath between, the pitch falling over the laugh."""
    b = bus()
    r = np.random.default_rng(seed)
    t = 0.0
    k = 0
    while t < sec:
        d = 1 / rate * r.uniform(0.85, 1.15)
        on = d * 0.55
        fall = 1 - 0.18 * t / sec
        s = voiced(f0 * fall * r.uniform(0.95, 1.08), on, vowel, None, 0.45, seed + k, contour=lambda tt: 1 + 0.06 * np.exp(-tt * 30))
        s = s * adsr(len(s), 0.01, on * 0.5, 1.2)
        place(b, stereo(s, pan) * gain * (1 - 0.3 * t / sec), t0 + t)
        # the breath in between
        place(b, stereo(hp(r.standard_normal(int(d * 0.4 * SR)), 1500) * adsr(int(d * 0.4 * SR), 0.02, 0.05) * 0.12, pan) * gain, t0 + t + on)
        t += d
        k += 1
    return b


def crowd_laugh(t0, sec, n=10, gain=1.0):
    b = bus()
    for k in range(n):
        f0 = RNG.choice([120, 140, 190, 220, 250, 280])
        b += laugh(t0 + RNG.uniform(0, 0.6), sec * RNG.uniform(0.6, 1.0), f0, RNG.uniform(4.5, 6.5), 700 + k + int(t0), 0.03 * gain, RNG.uniform(-0.9, 0.9), "a" if k % 2 else "e")
    return b


def aww(t0, sec, n=16, gain=1.0):
    """The room's 'awww': voices sliding from 'a' to 'o', the pitch falling."""
    b = bus()
    for k in range(n):
        f0 = RNG.choice([130, 160, 200, 230, 260, 300])
        s = voiced(f0, sec * RNG.uniform(0.8, 1.1), "a", "o", 0.35, 900 + k + int(t0), contour=lambda tt: 1.12 - 0.22 * smooth(0, 1.2, tt))
        s = s * adsr(len(s), 0.12, 0.35, 1.3)
        place(b, stereo(s, RNG.uniform(-0.9, 0.9)) * 0.022 * gain, t0 + RNG.uniform(0, 0.2))
    return b


def murmur(t0, sec, gain, n=5):
    """Guests chatting (no words): bands of noise with a syllable rhythm."""
    b = bus()
    tt = t_axis(sec)
    m = np.zeros(len(tt))
    for k in range(n):
        syl = np.clip(0.5 + 2.4 * lp(RNG.standard_normal(len(tt)), 6) * 6, 0, 1.4)
        m += bp(RNG.standard_normal(len(tt)), 250 + 180 * k, 900 + 350 * k) * syl
    m *= adsr(len(tt), 0.5, 0.8)
    place(b, stereo(m, 0, 0.7) * gain, t0)
    return b


# ===================================================================== things

def whoosh(sec, f0=300, f1=2500, gain=1.0, pan=0.0):
    tt = t_axis(sec)
    n = RNG.standard_normal(len(tt))
    fc = f0 * (f1 / f0) ** smooth(0, 1, tt / sec)
    w = vfilter(vfilter(n, fc * 1.6, "low"), fc * 0.5, "high") * np.sin(np.pi * tt / sec) ** 1.5
    return stereo(w, pan, 0.4) * gain


def glass_tink(f, sec, seed):
    r = np.random.default_rng(seed)
    t = t_axis(sec)
    partials = [(1, 1.0, 0.25), (2.32, 0.6, 0.12), (4.25, 0.4, 0.07), (6.63, 0.25, 0.04)]
    v = sum(a * np.sin(2 * np.pi * f * m * r.uniform(0.99, 1.01) * t) * np.exp(-t / (d * r.uniform(0.6, 1.3))) for m, a, d in partials)
    return v * adsr(len(t), 0.0005, 0.02)


def shatter(sec=1.6, seed=0, density=60):
    """Glass breaking: a crack, a spray of high tinks, a hissing crash."""
    r = np.random.default_rng(seed)
    b = np.zeros((int(sec * SR) + SR, 2))
    crack = hp(r.standard_normal(int(0.08 * SR)), 1800) * decay(int(0.08 * SR), 0.012)
    place(b, stereo(crack) * 0.9, 0)
    crash_n = hp(r.standard_normal(int(sec * SR)), 2500) * decay(int(sec * SR), 0.25) * 0.35
    place(b, stereo(crash_n, 0, 0.5), 0)
    for k in range(density):
        tk = r.exponential(0.18)
        f = r.uniform(2400, 7500)
        place(b, stereo(glass_tink(f, 0.4, seed * 100 + k), r.uniform(-1, 1)) * r.uniform(0.04, 0.12), tk)
    return b


def splash_liquid(sec=1.0, seed=0):
    r = np.random.default_rng(seed)
    t = t_axis(sec)
    n = r.standard_normal(len(t))
    body = vfilter(n, 4000 * np.exp(-t * 3) + 500, "low") * decay(len(t), 0.25)
    out = stereo(body, 0, 0.6) * 0.4
    for k in range(30):
        tk = r.exponential(0.15)
        dl = int(0.03 * SR)
        f = r.uniform(900, 2200)
        blip = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.8 * np.linspace(0, 1, dl))) / SR) * decay(dl, 0.008)
        place(out, stereo(blip, r.uniform(-1, 1)) * 0.06, tk)
    return out


def splat(sec=1.4, seed=0):
    """Into the cake: a deep wet thud, the squelch of sponge and cream closing round, bits landing."""
    r = np.random.default_rng(seed)
    t = t_axis(sec)
    thud = np.sin(2 * np.pi * np.cumsum(90 * np.exp(-t * 4) + 38) / SR) * decay(len(t), 0.22)
    wet = vfilter(r.standard_normal(len(t)), 2500 * np.exp(-t * 5) + 250, "low") * decay(len(t), 0.3) * 1.2
    sq_f = 600 * np.exp(-t * 6) + 160
    squelch = np.sin(2 * np.pi * np.cumsum(sq_f * (1 + 0.3 * np.sin(2 * np.pi * 23 * t))) / SR) * decay(len(t), 0.18) * 0.5
    out = sat((thud * 1.2 + wet + squelch) * 1.2, 1.6)
    st = stereo(out, 0, 0.3)
    for k in range(40):
        tk = 0.08 + r.exponential(0.25)
        dl = int(0.06 * SR)
        blob = lp(r.standard_normal(dl), 900) * decay(dl, 0.012)
        place(st, stereo(blob, r.uniform(-1, 1)) * 0.12, tk)
    return st


def squelch(sec, seed):
    r = np.random.default_rng(seed)
    t = t_axis(sec)
    f = 220 + 400 * r.uniform() * np.exp(-t * 8)
    v = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.4 * np.sin(2 * np.pi * r.uniform(15, 35) * t))) / SR) * 0.4
    v += vfilter(r.standard_normal(len(t)), 1500 * np.exp(-t * 6) + 300, "low") * 0.8
    return v * adsr(len(t), 0.01, sec * 0.6)


def airhorn(sec=0.42):
    t = t_axis(sec)
    f = 466 * (1 + 0.02 * np.exp(-t * 20))
    v = sum(signal.sawtooth(2 * np.pi * np.cumsum(f * m) / SR) * a for m, a in ((1, 1.0), (1.26, 0.6), (1.5, 0.5), (2.0, 0.3)))
    v = bp(v, 300, 5000)
    return sat(v * 1.5, 1.8) * adsr(len(t), 0.01, 0.06)


def crickets(t0, sec):
    b = bus()
    t = t0
    while t < t0 + sec:
        for k in range(3):
            dl = int(0.025 * SR)
            ch = np.sin(2 * np.pi * 4300 * t_axis(0.025)) * np.sin(np.pi * np.linspace(0, 1, dl)) * (0.6 + 0.4 * np.sin(2 * np.pi * 150 * t_axis(0.025)))
            place(b, stereo(ch, 0.55) * 0.05, t + k * 0.045)
        t += 0.62 + RNG.uniform(-0.05, 0.08)
    return b


def birds(t0, sec, n=24, gain=1.0):
    b = bus()
    for k in range(n):
        tk = t0 + RNG.uniform(0, sec)
        kind = k % 3
        pan = RNG.uniform(-0.9, 0.9)
        for j in range(RNG.integers(2, 5)):
            d = RNG.uniform(0.04, 0.09)
            tt = t_axis(d)
            if kind == 0:
                f = 3800 + 1500 * (tt / d)
            elif kind == 1:
                f = 5200 - 2200 * (tt / d)
            else:
                f = 3000 + 600 * np.sin(2 * np.pi * 40 * tt)
            ch = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / d)
            place(b, stereo(ch, pan) * 0.025 * gain, tk + j * (d + RNG.uniform(0.02, 0.06)))
    return b


def servo(sec=0.35, f0=900):
    tt = t_axis(sec)
    f = f0 * (1 + 0.15 * np.sin(np.pi * tt / sec))
    v = signal.square(2 * np.pi * np.cumsum(f) / SR, 0.3) * 0.3 + bp(RNG.standard_normal(len(tt)), 2000, 6000) * 0.2
    return bp(v, 500, 5000) * adsr(len(tt), 0.02, 0.06)


def glitch_noise(t0, sec):
    b = bus()
    tt = t_axis(sec)
    n = RNG.standard_normal(len(tt))
    # bursts of crushed data noise, blocks of buzz, dropouts
    gate = (lp(RNG.standard_normal(len(tt)), 25) * 30 > -0.2).astype(float)
    buzz = signal.square(2 * np.pi * RNG.choice([180, 360, 720]) * tt) * 0.3
    v = ga.crush(n * 0.5 + buzz, 4, 6) * gate * (0.3 + 0.7 * smooth(0, sec * 0.6, tt))
    v *= 1 - smooth(sec - 0.08, sec, tt)
    place(b, stereo(v, 0, 0.6) * 0.18, t0)
    return b


def dog_whine(sec=0.42):
    """The dog's little 'hm?': a nasal whine rising at the end."""
    tt = t_axis(sec)
    f = 720 + 380 * smooth(0.45, 1.0, tt / sec) - 60 * smooth(0, 0.3, tt / sec)
    ph = 2 * np.pi * np.cumsum(f * (1 + 0.012 * np.sin(2 * np.pi * 9 * tt))) / SR
    v = np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph) + bp(RNG.standard_normal(len(tt)), 1500, 4000) * 0.05
    return v * adsr(len(tt), 0.05, 0.12, 1.2)


def thump(gain=1.0):
    dl = int(0.12 * SR)
    v = np.sin(2 * np.pi * np.cumsum(np.linspace(110, 60, dl)) / SR) * decay(dl, 0.035) + lp(RNG.standard_normal(dl), 300) * decay(dl, 0.02) * 0.5
    return v * gain


# ===================================================================== the scenes

def opening():
    b = bus()
    b += birds(0, 9, 26, 1.0)
    b += birds(9, 11, 10, 0.5)
    b += murmur(0, 15.5, 0.022)
    # a breeze over the lawn
    sec = 20.4
    tt = t_axis(sec)
    br = lp(RNG.standard_normal(len(tt)), 900) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.13 * tt) ** 2) * 0.05
    place(b, stereo(br, 0, 0.8), 0)
    # the controller connecting: two beeps; the motors arming: three rising beeps from the drone
    for k, f in enumerate((2700, 2700)):
        place(b, stereo(np.sin(2 * np.pi * f * t_axis(0.07)) * adsr(int(0.07 * SR), 0.003, 0.02), 0.3) * 0.08, 0.55 + k * 0.13)
    for k, f in enumerate((1047, 1319, 1568)):
        tone = np.sin(2 * np.pi * f * t_axis(0.13)) * adsr(int(0.13 * SR), 0.004, 0.03)
        place(b, stereo(tone) * 0.12, C["spinUp"] - 0.55 + k * 0.16)
    # the props' wash on the grass: a thrash that dies as it climbs
    sec = C["reveal"] - C["spinUp"]
    tt = t_axis(sec)
    lift = smooth(C["liftoff"] - C["spinUp"] + 0.6, C["liftoff"] - C["spinUp"] + 2.6, tt)
    gr = bp(RNG.standard_normal(len(tt)), 1200, 7000) * smooth(0.5, 1.6, tt) * (1 - lift) * (0.6 + 0.4 * np.sin(2 * np.pi * 6 * tt) ** 2) * 0.12
    place(b, stereo(gr, 0, 0.8), C["spinUp"])
    place(b, whoosh(0.9, 200, 1200, 0.25), C["liftoff"] - 0.2)
    # the guests' "aww" as the rings come down the aisle
    b += aww(C["ringsShot"] + 0.3, 1.3, 14, 0.8)
    return b


def ceremony():
    b = bus()
    # the grab and the yank
    place(b, whoosh(0.3, 500, 2500, 0.18, -0.3), C["grab"] - 0.05)
    place(b, whoosh(0.45, 300, 3000, 0.35), C["yank"] - 0.05)
    b += crowd_gasp(C["yank"] + 0.15, 6, 0.2, 0.7)
    # the dip over the guests: gasps, a whoosh past heads, the hat flying off
    b += crowd_gasp(C["dip"] - 0.05, 18, 0.35, 1.3)
    place(b, whoosh(0.8, 250, 2200, 0.4, 0.2), C["dip"] + 0.1)
    place(b, whoosh(0.6, 400, 3200, 0.3, -0.4), C["hat"])
    flut = bp(RNG.standard_normal(int(0.9 * SR)), 300, 1800) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 14 * t_axis(0.9)))) * adsr(int(0.9 * SR), 0.05, 0.4) * 0.08
    place(b, stereo(flut, -0.5), C["hat"] + 0.1)
    b += crowd_laugh(C["hat"] + 0.6, 1.2, 6, 0.6)
    # the silence: a cricket, a cough, then grandma can't hold it, and the room goes
    b += crickets(C["silence"] + 0.3, 4.5)
    cough = (bp(RNG.standard_normal(int(0.16 * SR)), 300, 2500) * adsr(int(0.16 * SR), 0.01, 0.1)) * 0.25
    place(b, stereo(cough, 0.6) * 0.5, C["silence"] + 2.1)
    place(b, stereo(cough * 0.7, 0.6) * 0.5, C["silence"] + 2.36)
    b += laugh(C["officiant"] + 1.5, 4.2, 330, 5.2, 4401, 0.07, -0.2, "e")
    b += crowd_laugh(C["officiant"] + 2.6, 3.2, 12, 1.0)
    # the gimbal turning: to the groom, to the bride
    place(b, stereo(servo(0.38, 850)) * 0.05, C["groomLook"] - 0.35)
    place(b, stereo(servo(0.42, 900)) * 0.05, C["brideLook"] - 0.4)
    # full throttle: the guests' "whoa"
    b += aww(C["throttle"] + 0.1, 0.9, 12, 0.7)
    b += crowd_gasp(C["throttle"] + 0.05, 10, 0.3, 0.9)
    return b


def chase():
    b = bus()
    place(b, whoosh(0.9, 300, 3500, 0.35), C["whip"] - 0.2)
    # the waiter: a whoosh past and the glasses on his tray rattling
    place(b, whoosh(0.5, 400, 4000, 0.4, -0.4), C["waiter"] - 0.2)
    for k in range(9):
        place(b, stereo(glass_tink(RNG.uniform(2600, 4200), 0.3, 50 + k), -0.4) * 0.06, C["waiter"] + 0.05 + k * 0.045 + RNG.uniform(0, 0.02))
    # under the tent's edge
    place(b, whoosh(0.6, 200, 1500, 0.35), C["tentIn"] - 0.25)
    fl = bp(RNG.standard_normal(int(0.5 * SR)), 200, 1200) * (0.5 + 0.5 * np.sin(2 * np.pi * 21 * t_axis(0.5))) * adsr(int(0.5 * SR), 0.02, 0.3) * 0.15
    place(b, stereo(fl, 0, 0.5), C["tentIn"] - 0.1)
    # the party in the tent
    b += murmur(C["tentIn"], C["towerHit"] - C["tentIn"] - 0.3, 0.03, 6)
    # the DJ's air horn
    for k in range(3):
        place(b, stereo(airhorn(0.42 if k < 2 else 0.8), 0.4, 0.3) * 0.16, C["dj"] + 0.05 + k * 0.48)
    b += crowd_laugh(C["dj"] + 0.4, 1.4, 6, 0.6)
    # the chandelier's crystals
    for k in range(14):
        place(b, stereo(glass_tink(RNG.uniform(3500, 6500), 0.9, 80 + k), RNG.uniform(-0.6, 0.6)) * 0.05, C["chandelier"] - 0.25 + k * 0.05 + RNG.uniform(0, 0.03))
    return b


def heartbeat(t0, t1, gain=0.5, rate=0.85):
    b = bus()
    t = t0
    while t < t1:
        for off, g in ((0, 1.0), (0.17, 0.7)):
            th = lp(np.sin(2 * np.pi * 50 * t_axis(0.2)) * decay(int(0.2 * SR), 0.05), 160)
            place(b, stereo(th) * gain * g, t + off)
        t += 1 / rate
    return b


def slowmo_swoop(t0):
    """Into slow motion: a deep drop and a reversed swell."""
    b = bus()
    sec = 1.2
    tt = t_axis(sec)
    boom = np.sin(2 * np.pi * np.cumsum(70 * np.exp(-tt * 1.5) + 28) / SR) * decay(len(tt), 0.5) * 0.8
    place(b, stereo(sat(boom, 1.3)), t0)
    c = crash(0.7)
    rev = (c[::-1] * smooth(0, 1, np.linspace(0, 1, len(c)))) * 0.5
    place(b, stereo(lp(rev, 5000), 0, 0.5), t0 - 0.7)
    return b


def crash_sequence():
    b = bus()
    # the first slow motion: the tower
    b += slowmo_swoop(SLOW[0][0])
    b += heartbeat(SLOW[0][0] + 0.25, SLOW[0][2], 0.55)
    sh = shatter(2.8, 7, 90)
    # heard in slow motion: down an octave, a long tail
    sh_slow = np.stack([np.interp(np.arange(0, len(sh), 0.5), np.arange(len(sh)), sh[:, c]) for c in range(2)], axis=1)
    sh_slow = reverb(sh_slow, 3.2, 0.45, 5000)
    place(b, sh_slow * 1.1, C["towerHit"])
    sp = splash_liquid(1.6, 3)
    sp_slow = np.stack([np.interp(np.arange(0, len(sp), 0.5), np.arange(len(sp)), sp[:, c]) for c in range(2)], axis=1)
    place(b, reverb(sp_slow, 2.5, 0.4, 4000) * 0.9, C["towerHit"] + 0.15)
    # the tiers going one after another
    for k in range(7):
        s2 = shatter(1.0, 20 + k, 18)
        s2s = np.stack([np.interp(np.arange(0, len(s2), 0.5), np.arange(len(s2)), s2[:, c]) for c in range(2)], axis=1)
        place(b, pan_st(s2s, RNG.uniform(-0.6, 0.6)) * 0.35, C["towerHit"] + 0.4 + k * 0.38)
    # back up to speed: a tape spin-up, then the tumble
    place(b, whoosh(0.5, 150, 2000, 0.3), SLOW[0][2])
    for k in range(2):
        place(b, whoosh(0.32, 300, 2800, 0.32, -0.5 + k), C["tumble"] + k * 0.38)
    # the second: into the cake
    b += slowmo_swoop(SLOW[1][0])
    b += heartbeat(SLOW[1][0] + 0.2, C["cakeHit"] + 0.1, 0.6, 1.1)
    sl = splat(2.0, 11)
    sl_slow = np.stack([np.interp(np.arange(0, len(sl), 0.6), np.arange(len(sl)), sl[:, c]) for c in range(2)], axis=1)
    place(b, sl_slow * 1.2, C["cakeHit"])
    # the room's gasp, muffled through the cake
    b += crowd_gasp(C["cakeHit"] + 0.2, 16, 0.3, 1.1)
    # the props stalling in the cream: wet chops
    for k in range(9):
        place(b, stereo(squelch(0.12, 600 + k)) * 0.12 * (1 - k / 10), C["cakeHit"] + 0.4 + k * 0.16)
    # winding down
    sec = 1.4
    tt = t_axis(sec)
    wd = np.sin(2 * np.pi * np.cumsum(800 * np.exp(-tt * 2.2) + 40) / SR) * decay(len(tt), 0.5) * 0.12
    place(b, stereo(wd), C["rest"] - 0.3)
    for k in range(4):
        place(b, stereo(hp(RNG.standard_normal(int(0.03 * SR)), 2000) * decay(int(0.03 * SR), 0.004)) * 0.08, C["rest"] + 0.3 + k * 0.21)
    b += glitch_noise(C["glitch"], 0.8)
    return b


def finale():
    b = bus()
    fb = C["feedBack"]
    # the tent again, hushed, close round the cake: its air, people murmuring
    b += murmur(fb - 0.1, DUR - fb + 0.1, 0.014, 4)
    sec = DUR - fb + 0.1
    air = lp(RNG.standard_normal(int(sec * SR)), 700) * 0.012 + hp(RNG.standard_normal(int(sec * SR)), 4000) * 0.002
    place(b, stereo(air, 0, 0.9) * adsr(int(sec * SR), 0.3, 0.5)[:, None], fb - 0.1)
    # the baker: a horrified gasp; then he goes down
    place(b, stereo(gasp(0.6, 51, "a"), 0.1) * 0.22, C["baker"] - 0.05)
    place(b, stereo(lp(voiced(150, 0.5, "o", "u", 0.4, 52, contour=lambda tt: 1.1 - 0.35 * smooth(0, 0.5, tt)), 2500) * adsr(int(0.5 * SR), 0.05, 0.3), 0.1) * 0.05, C["baker"] + 0.95)
    place(b, stereo(thump(0.12), 0.1), C["baker"] + 1.33)
    b += crowd_gasp(C["baker"] + 1.36, 8, 0.25, 0.8)
    # the bride
    place(b, stereo(gasp(0.5, 53, "a"), -0.3) * 0.2, C["bride"] - 0.1)
    # the groom, breathing through his nose
    for k in range(2):
        hm = bp(RNG.standard_normal(int(0.45 * SR)), 250, 1800) * adsr(int(0.45 * SR), 0.03, 0.35) * 0.3
        place(b, stereo(hm, 0.3) * 0.3, C["groom"] + 0.5 + k * 1.2)
    # grandma, somewhere behind, helpless
    b += laugh(C["kid"] - 0.2, 2.4, 340, 5.6, 7701, 0.045, 0.5, "e")
    b += laugh(C["ribbon"] + 0.5, 1.6, 330, 6.0, 7702, 0.045, 0.5, "e")
    # the kid: a guilty little giggle through his nose as his dad turns to look at him
    b += laugh(C["glare"] + 0.6, 0.6, 430, 7.5, 7801, 0.035, -0.2, "m")
    # digging in the cake
    for k in range(7):
        place(b, stereo(squelch(0.18, 900 + k), 0.25) * 0.1, C["dig"] + 0.1 + k * 0.17 + RNG.uniform(0, 0.05))
    # the ribbon coming out: a long wet pull
    sec = 0.5
    tt = t_axis(sec)
    pull = vfilter(RNG.standard_normal(len(tt)), 1800 * smooth(0, 0.5, tt) + 300, "low") * adsr(len(tt), 0.05, 0.2) * 0.5
    place(b, stereo(pull, 0.2) * 0.35, C["ribbon"] - 0.15)
    # the gimbal whirring round to follow his finger
    place(b, stereo(servo(1.0, 760)) * 0.06, C["point"] + 0.35)
    # the dog: tail thumping the floor, panting
    t = C["dog"] + 0.5
    while t < DUR:
        place(b, stereo(thump(0.12), -0.3), t)
        t += 0.32 + RNG.uniform(-0.03, 0.03)
    pant = bp(RNG.standard_normal(int((DUR - C["dog"]) * SR)), 600, 3000) * (0.5 + 0.5 * np.sin(2 * np.pi * 3.2 * t_axis(DUR - C["dog"]))) ** 3 * 0.03
    place(b, stereo(pant, -0.3), C["dog"] + 0.2)
    place(b, stereo(dog_whine(0.45), -0.2) * 0.12, C["tilt"] - 0.05)
    # the room: "awww", and laughing
    b += aww(C["tilt"] + 0.35, 1.5, 18, 1.1)
    b += crowd_laugh(C["tilt"] + 1.3, 1.6, 10, 0.8)
    return b


def finale_music():
    """The zoom's orchestra hit, then the strings back, warm: the canon's opening and its last cadence."""
    b = bus()
    hit = C["dog"] + 0.47  # the zoom lands (67.8-68.1)
    for n, part, g in ((38, "cello", 0.6), (50, "cello", 0.5), (57, "viola", 0.4), (62, "violin", 0.35), (66, "violin", 0.3)):
        s = bowed(midi(n), 1.3, part, att=0.01, rel=0.9, seed=3000 + n, bright=1.2)
        place(b, stereo(s, 0, 0.3) * g * 0.8, hit)
    place(b, stereo(timpani(midi(38), 2.0)) * 0.6, hit)
    place(b, stereo(crash(2.2), 0, 0.5) * 0.25, hit)
    # the harp up, and the strings, warm: D A G A | D
    place(b, stereo(sum(harp(midi(n), 1.8) * np.concatenate([np.zeros(int(k * 0.035 * SR)), np.ones(int(1.8 * SR) - int(k * 0.035 * SR))]) for k, n in enumerate([62, 66, 69, 74, 78, 81, 86])), 0.1, 0.4) * 0.12, hit + 0.5)
    t0 = hit + 0.83
    beat = 0.5
    prog = [(50, [62, 66, 69], 78), (45, [61, 64, 69], 76), (43, [62, 67, 71], 74), (45, [61, 64, 69], 73)]
    for i, (bass, ch, mel) in enumerate(prog):
        t = t0 + i * beat
        place(b, stereo(bowed(midi(bass), beat + 0.2, "cello", att=0.08, seed=3100 + i)) * 0.32, t)
        for j, n in enumerate(ch):
            place(b, stereo(bowed(midi(n), beat + 0.25, "viola" if j == 0 else "violin", att=0.15, seed=3200 + i * 3 + j), 0.2 - 0.2 * j, 0.3) * 0.09, t)
        place(b, stereo(bowed(midi(mel), beat + 0.2, "violin", seed=3300 + i), -0.15) * 0.22, t)
    # the last chord: D, held and dying away at the end
    tl = t0 + len(prog) * beat
    sec = DUR - tl + 0.3
    assert sec > 0.8, sec
    for n, part, g in ((38, "cello", 0.3), (50, "cello", 0.25), (57, "viola", 0.12), (62, "violin", 0.1), (66, "violin", 0.1), (74, "violin", 0.2)):
        s = bowed(midi(n), sec, part, att=0.2, rel=0.8, seed=3400 + n)
        place(b, stereo(s, 0.1 if part == "violin" else -0.1, 0.3) * g, tl)
    for k, n in enumerate([86, 90, 93, 98]):
        place(b, stereo(glock(midi(n), 1.6), 0.3) * 0.07, tl + 0.1 + k * 0.09)
    return reverb(b, 2.4, 0.3, 4500)[: len(b)]


# ===================================================================== the mix

def muffle(st):
    """From the cake hit the mic is under frosting: everything diegetic low-passed; less once the feed's back."""
    t = np.arange(len(st)) / SR
    fc = np.full(len(st), 18000.0)
    fc = np.where(t > C["cakeHit"], 650 + 17000 * (1 - smooth(C["cakeHit"], C["cakeHit"] + 0.15, t)), fc)
    fc = np.where(t > C["feedBack"] - 0.5, 2600.0, fc)
    return vfilter_st(st, fc, "low")


def tent_room(st):
    """Under the tent: the sounds in it get the canvas room's early reflections."""
    t = np.arange(len(st)) / SR
    k = smooth(C["tentIn"] - 0.2, C["tentIn"] + 0.4, t)
    wet = reverb(st * k[:, None], 0.9, 1.0, 5000)[: len(st)]
    return st + wet * 0.35


def mix():
    out = bus()
    m = music()
    out += tent_room(m) * 0.8
    dr = drone_sound()
    wi = wind()
    diegetic = bus()
    diegetic += dr * 0.38
    diegetic += wi * 0.5
    diegetic += opening() * 1.0
    diegetic += ceremony() * 1.0
    diegetic += tent_room(chase()) * 1.0
    diegetic += crash_sequence() * 1.0
    fin = finale()
    # the music too goes under the frosting once it's in the cake (it dies there anyway)
    out = muffle(out + diegetic)
    # the hush round the cake is close to the mic: up front; then under the strings for the dog
    tf = np.arange(len(fin)) / SR
    fin_g = 5.0 - 3.0 * smooth(C["dog"] + 0.2, C["dog"] + 0.6, tf)
    out += fin * fin_g[:, None]
    out += finale_music() * 0.9
    # silence while the feed is black
    t = np.arange(len(out)) / SR
    black = smooth(C["glitch"] + 0.7, C["glitch"] + 0.8, t) * (1 - smooth(C["feedBack"] - 0.15, C["feedBack"], t))
    out *= (1 - black)[:, None]
    n_end = int(DUR * SR)
    out = out[:n_end]
    out = np.stack([hp(out[:, c], 25) for c in range(2)], axis=1)
    out[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))[:, None]
    return out


if __name__ == "__main__":
    st = mix()
    peak = np.max(np.abs(st))
    print("peak before norm", round(float(peak), 3), "duration", round(len(st) / SR, 3))
    st = st / peak * 0.89
    os.makedirs(os.path.join(ROOT, "out", "wedding"), exist_ok=True)
    wavfile.write(os.path.join(ROOT, "out", "wedding", "bed.wav"), SR, st.astype(np.float32))
    ga.write_mp3(os.path.join(ROOT, "public", "wedding", "bed.mp3"), st, 0.89)
    print("wrote public/wedding/bed.mp3 and out/wedding/bed.wav")
