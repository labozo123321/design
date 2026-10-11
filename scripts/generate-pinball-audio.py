#!/usr/bin/env python3
"""
Sound for the Pinball composition ("POV: you're a pinball"): every sound synthesised here, timed from
src/pinball/track.json (the physics events) and src/pinball/script.json (the captions). No voice.

  0-0.9 s    the cold open: the song mid-chorus, BONK, then a record scratch into the freeze frame
  0.9-3      silence under "yep. that's me."
  3-4        the VHS rewind: tape whine, the cold open squealing backwards
  4-5.45     "15 SECONDS EARLIER": a xylophone run
  5.45-8.6   the coin, the plunger creaking back, a drum roll and a climbing bass... BOING
  8.6-28.6   the song: funky chiptune, 128 BPM in F; every hit has its own sound (bumpers bonk, slings
             thwack, flippers clack), pitched down in the slow motion
  28.6-33    CHOMP: inside the monster the song is muffled; chewing, the multiball siren outside
  33         BURRRP, the song back at full tilt (multiball)
  49.7       JACKPOT fanfare and a shower of coins
  50.7-53    the player shoving the machine: DANGER buzzers
  53         TILT: buzzer, the power-down, the song tape-stops
  53-60      rolling to the drain in silence; a sad trombone
  60-66      plop, a falling whistle, the trough's hum; GAME OVER jingle; a coin
  66-70      the eject: THUNK, a rising whistle; the drum roll starts again (the loop)

    python3 scripts/generate-pinball-audio.py   # writes public/pinball/bed.mp3 (and out/pinball/bed.wav)
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
bell, noise, sine, t_axis = ga.bell, ga.noise, ga.sine, ga.t_axis
ROOT = os.path.dirname(HERE)
with open(os.path.join(ROOT, "src", "pinball", "track.json")) as f:
    TR = json.load(f)
with open(os.path.join(ROOT, "src", "pinball", "script.json")) as f:
    SCRIPT = json.load(f)
FPS = TR["fps"]
FR = TR["frames"]
DUR = FR / FPS
N = int(DUR * SR)
PAD = SR * 4
M = TR["marks"]
EV = [e for e in TR["events"] if not e.get("cold")]
COLD = [e for e in TR["events"] if e.get("cold")]
RATE = np.abs(np.array(TR["rate"]))
SPEED = np.array(TR["speed"])
YOU = np.array(TR["you"])  # three.js: x, height, -table y
RNG = np.random.default_rng(2026)

# moments (video seconds), matching src/pinball/show.ts and Overlay.tsx
KEY = {
    "chomp": M["chomp"],
    "burp": M["burp"],
    "multiball": M["multiball"],
    "jackpot": M["jackpot"],
    "tilt": M["tilt"],
    "drain": M["drain"],
    "launch": M["launch"],
    "freeze": M["freeze"],
    "coin1": 5.5,
    "coin2": 64.6,
    "gameOver": M["drain"] + 1.6,
    "card": M["rewind"][1],
    "title": M["rewind"][1] + 1.45,
    "pull": M["plunge"] + 1.5,
    "eject": M["drain"] + 6.15,
}
NUDGES = [KEY["tilt"] - 2.3, KEY["tilt"] - 1.1, KEY["tilt"] - 0.05]
BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
STEP = BEAT / 4


def bus():
    return np.zeros((N + PAD, 2))


def place(b, st, sec, gain=1.0):
    """Mix `st` into bus `b` starting at `sec` (which may be before 0: the start is trimmed)."""
    i = int(round(sec * SR))
    if i < 0:
        st = st[-i:]
        i = 0
    if i >= len(b) or len(st) == 0:
        return
    j = min(len(b), i + len(st))
    b[i:j] += st[: j - i] * gain


def smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def rate_at(t):
    return float(RATE[int(np.clip(round(t * FPS), 0, FR - 1))])


def slowmo(t, lo=0.55):
    """Pitch factor for a diegetic sound at video time t: deeper and longer in slow motion."""
    return float(np.clip(rate_at(t) ** 0.35, lo, 1.0))


def repitch(x, p):
    """Play a sound at p times the speed (p < 1: lower and longer)."""
    if abs(p - 1) < 0.02:
        return x
    n = max(8, int(len(x) / p))
    if x.ndim == 1:
        return signal.resample(x, n)
    return np.stack([signal.resample(x[:, c], n) for c in range(x.shape[1])], axis=1)


def glide(f0, f1, sec, curve=1.0):
    """Phase of a tone gliding from f0 to f1 (exponential), for np.sin."""
    t = t_axis(sec)
    u = (t / max(sec, 1e-6)) ** curve
    f = f0 * (f1 / f0) ** u
    return 2 * np.pi * np.cumsum(f) / SR


def square(ph, duty=0.5):
    return np.where((ph / (2 * np.pi)) % 1 < duty, 1.0, -1.0)


def tri(ph):
    return 2 / np.pi * np.arcsin(np.sin(ph))


def vfilter(x, fc, kind="low", block=256):
    """A filter whose cutoff follows fc (Hz, one per sample), applied in blocks."""
    out = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        c = float(np.clip(np.mean(fc[i : i + block]), 40, SR / 2 - 400))
        sos = signal.butter(2, c / (SR / 2), kind, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i : i + block], zi = signal.sosfilt(sos, x[i : i + block], zi=zi)
    return out


# ================================================================== sound effects


def thump(f0=170, f1=55, tau=0.07, sec=0.25):
    ph = glide(f0, f1, sec, 0.4)
    return np.sin(ph) * decay(len(ph), tau)


def click(sec=0.01, tone=4000):
    return hp(noise(sec), tone) * decay(int(sec * SR), 0.0015)


def bumper_sfx(k):
    """BONK: a punchy knock, the coil's clack, and a cartoon bloop that drops in pitch."""
    sec = 0.45
    n = int(sec * SR)
    knock = np.zeros(n)
    th = thump(210, 60, 0.06, sec)
    knock[: len(th)] += th * 0.9
    ck = click(0.02, 2500)
    knock[: len(ck)] += ck * 0.7
    f0 = [700, 560, 820][k % 3]
    ph = glide(f0, f0 * 0.45, 0.16, 0.7)
    bloop = square(ph, 0.3) * decay(len(ph), 0.06)
    bloop = lp(bloop, 3500)
    knock[: len(bloop)] += bloop * 0.32
    ring = bell(f0 * 1.5, 0.4)[:n] * 0.12
    knock[: len(ring)] += ring
    return sat(knock, 1.3)


def sling_sfx():
    """THWACK: the rubber snapping, a thud, a short twang."""
    sec = 0.35
    n = int(sec * SR)
    out = np.zeros(n)
    th = thump(140, 50, 0.05, sec)
    out[: len(th)] += th * 0.8
    snap = bp(noise(0.08), 900, 4500) * decay(int(0.08 * SR), 0.018)
    out[: len(snap)] += snap * 0.9
    tw = np.sin(glide(380, 300, 0.25)) * decay(int(0.25 * SR), 0.06)
    out[: len(tw)] += tw * 0.25
    return sat(out, 1.4)


def flipper_sfx(hit=False):
    """The solenoid: a hard mechanical clack and a thunk; a big THWACK when it hits you."""
    sec = 0.5 if hit else 0.18
    n = int(sec * SR)
    out = np.zeros(n)
    ck = click(0.012, 3000)
    out[: len(ck)] += ck * 1.0
    th = thump(130, 55, 0.04, 0.18)
    out[: len(th)] += th * 0.7
    buzz = lp(square(2 * np.pi * 95 * t_axis(0.06)), 900) * decay(int(0.06 * SR), 0.02)
    out[: len(buzz)] += buzz * 0.15
    if hit:
        smack = bp(noise(0.2), 600, 6000) * decay(int(0.2 * SR), 0.05)
        out[: len(smack)] += smack * 0.8
        boom = thump(110, 38, 0.14, 0.5)
        out[: len(boom)] += boom * 0.9
    return sat(out, 1.5)


def ding(notes=(84, 88), gap=0.07, sec=0.9, k=0.5):
    n = int((sec + gap * len(notes)) * SR)
    out = np.zeros(n)
    for i, nn in enumerate(notes):
        b = bell(midi(nn), sec)
        i0 = int(i * gap * SR)
        out[i0 : i0 + len(b)] += b * k
    return out


def drop_sfx():
    """CLONK: the target knocked down (a plastic knock and a thunk), and a tooth's plink."""
    sec = 0.6
    n = int(sec * SR)
    out = np.zeros(n)
    knock = bp(noise(0.06), 350, 1800) * decay(int(0.06 * SR), 0.015)
    out[: len(knock)] += knock * 1.0
    th = thump(160, 70, 0.05, 0.2)
    out[: len(th)] += th * 0.6
    pl = np.sin(glide(2400, 1500, 0.3)) * decay(int(0.3 * SR), 0.05)
    i0 = int(0.03 * SR)
    out[i0 : i0 + len(pl)] += pl * 0.3
    return out


def ballhit_sfx():
    """Two steel balls: a hard bright clack."""
    sec = 0.3
    n = int(sec * SR)
    out = click(0.02, 2000) * 1.0
    out = np.concatenate([out, np.zeros(n - len(out))])
    for f, a in ((3100, 0.5), (4700, 0.35), (6900, 0.2)):
        out += np.sin(2 * np.pi * f * t_axis(sec)) * decay(n, 0.035) * a
    return out


def clack_sfx(speed):
    """The ball off a steel guide: a metallic tink, louder and lower the harder it hits."""
    sec = 0.25
    n = int(sec * SR)
    f = 2200 - 500 * min(1.0, speed / 2)
    out = np.sin(2 * np.pi * f * t_axis(sec)) * decay(n, 0.03) * 0.4
    out += np.sin(2 * np.pi * f * 2.7 * t_axis(sec)) * decay(n, 0.015) * 0.2
    c = click(0.01, 2500)
    out[: len(c)] += c * 0.6
    return out


def slurp():
    """Onto the tongue: a wet slurp sweeping up."""
    sec = 0.55
    x = noise(sec)
    fc = np.geomspace(300, 2600, int(sec * SR))
    y = vfilter(x, fc, "low") - vfilter(x, fc * 0.4, "low")
    y *= adsr(len(y), 0.05, 0.25) * (1 + 0.6 * np.sin(2 * np.pi * 22 * t_axis(sec)))
    return y * 1.6


def chomp_sfx():
    """CHOMP: a heavy thud, crunching teeth, the click of the jaws."""
    sec = 1.2
    n = int(sec * SR)
    out = np.zeros(n)
    th = thump(90, 35, 0.22, 1.0)
    out[: len(th)] += th * 1.0
    for i, (t0, g) in enumerate(((0.0, 1.0), (0.05, 0.7), (0.12, 0.5), (0.2, 0.35))):
        cr = bp(noise(0.12), 1200, 7000) * decay(int(0.12 * SR), 0.025) * g
        cr *= 1 + 0.8 * (RNG.random(len(cr)) > 0.93)
        i0 = int(t0 * SR)
        out[i0 : i0 + len(cr)] += cr
    ck = click(0.015, 1500)
    out[: len(ck)] += ck * 1.2
    return sat(out, 1.6)


def chew_sfx(sec):
    """Muffled chewing: squelches and crunches, the jaw working."""
    out = np.zeros(int(sec * SR))
    t = 0.15
    while t < sec - 0.3:
        sq = lp(noise(0.22), 700) * adsr(int(0.22 * SR), 0.03, 0.12) * (0.6 + 0.4 * RNG.random())
        i0 = int(t * SR)
        out[i0 : i0 + len(sq)] += sq * 1.2
        if RNG.random() < 0.6:
            cr = bp(noise(0.06), 800, 3000) * decay(int(0.06 * SR), 0.015)
            i1 = i0 + int(0.05 * SR)
            out[i1 : i1 + len(cr)] += cr * 0.5
        t += 0.31 + 0.06 * RNG.random()
    return out


def gurgle(sec):
    """A stomach somewhere below: low bubbling."""
    t = t_axis(sec)
    f = 70 + 30 * np.sin(2 * np.pi * 0.7 * t) + 25 * np.sin(2 * np.pi * 3.1 * t)
    v = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t) ** 2)
    return lp(v, 400) * adsr(len(t), 0.3, 0.5)


def burp_sfx():
    """BURRRP: a buzzing low pulse through an 'aw' vowel, flutter, a wet pop at the start."""
    sec = 1.5
    t = t_axis(sec)
    f = 92 - 18 * (t / sec) + 6 * np.sin(2 * np.pi * 3.5 * t) + RNG.standard_normal(len(t)).cumsum() * 0.0005
    ph = 2 * np.pi * np.cumsum(f) / SR
    pulse = signal.sawtooth(ph) * 0.6 + square(ph, 0.2) * 0.4
    flutter = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 27 * t + np.sin(2 * np.pi * 3 * t)))
    v = pulse * flutter
    vowel = bp(v, 550, 950) * 1.2 + bp(v, 1050, 1400) * 0.6 + lp(v, 300) * 0.8
    vowel *= adsr(len(t), 0.04, 0.35, 1.2) * (1 - 0.3 * t / sec)
    pop = lp(noise(0.05), 1500) * decay(int(0.05 * SR), 0.01)
    vowel[: len(pop)] += pop * 1.5
    return sat(vowel * 1.4, 1.8)


def siren(sec=2.0):
    """The multiball siren: a square wave whooping up and down."""
    t = t_axis(sec)
    f = 700 + 500 * (0.5 - 0.5 * np.cos(2 * np.pi * 1.6 * t))
    v = square(2 * np.pi * np.cumsum(f) / SR, 0.5)
    return lp(v, 4000) * adsr(len(t), 0.02, 0.2) * 0.35


def chip_arp(notes, step=0.07, sec=0.18, duty=0.25, k=0.3):
    n = int((len(notes) * step + sec) * SR)
    out = np.zeros(n)
    for i, nn in enumerate(notes):
        v = square(2 * np.pi * midi(nn) * t_axis(sec), duty) * adsr(int(sec * SR), 0.003, 0.08)
        i0 = int(i * step * SR)
        out[i0 : i0 + len(v)] += v * k
    return lp(out, 6000)


def brass(notes, sec, k=1.0):
    """A brass stab: detuned saws through a filter that opens and closes."""
    t = t_axis(sec)
    out = np.zeros(len(t))
    for nn in notes:
        out += ga.saw_voice(midi(nn), sec, 8)
    fc = 600 + 4200 * np.exp(-t / 0.12)
    out = vfilter(out / len(notes), fc, "low")
    return out * adsr(len(t), 0.01, min(0.2, sec * 0.5)) * k


def crash(sec=2.0):
    x = hp(noise(sec), 3500) * decay(int(sec * SR), 0.6)
    return x + bp(noise(sec), 6000, 12000) * decay(int(sec * SR), 0.25) * 0.5


def jackpot_sfx():
    """JACKPOT: da-DAAA brass, a crash, bells running up, and a shower of coins."""
    sec = 3.0
    n = int(sec * SR)
    out = np.zeros(n)
    b1 = brass([65, 69, 72, 77], 0.16)
    out[: len(b1)] += b1
    b2 = brass([65, 69, 72, 77, 81], 1.2)
    i0 = int(0.2 * SR)
    out[i0 : i0 + len(b2)] += b2 * 1.1
    cr = crash(2.4)
    out[i0 : i0 + len(cr)] += cr * 0.35
    run = ding((77, 81, 84, 89, 93, 96), 0.06, 1.0, 0.25)
    i1 = int(0.25 * SR)
    out[i1 : i1 + len(run)] += run
    t = 0.3
    while t < 2.4:
        c = ding((96 + RNG.integers(-3, 4),), 0.0, 0.25, 0.08)
        i2 = int(t * SR)
        out[i2 : i2 + len(c)] += c
        t += 0.03 + 0.05 * RNG.random()
    return out


def buzzer(sec=0.35, f=110):
    t = t_axis(sec)
    v = square(2 * np.pi * f * t, 0.5) + 0.6 * square(2 * np.pi * f * 1.5 * t, 0.5)
    return sat(lp(v, 2500) * adsr(len(t), 0.005, 0.03) * 0.5, 2.0)


def shove():
    """The player shoving the cabinet: a deep thud, loose parts rattling, the glass buzzing."""
    sec = 0.7
    n = int(sec * SR)
    out = np.zeros(n)
    th = thump(80, 32, 0.15, 0.7)
    out[: len(th)] += th * 1.0
    for i in range(9):
        c = click(0.01, 1800) * (0.6 - i * 0.05)
        i0 = int((0.02 + i * 0.03 + RNG.random() * 0.02) * SR)
        out[i0 : i0 + len(c)] += c
    gl = bp(noise(0.5), 2500, 6000) * decay(int(0.5 * SR), 0.12) * (1 + 0.5 * np.sin(2 * np.pi * 60 * t_axis(0.5)))
    out[: len(gl)] += gl * 0.2
    return out


def tilt_sfx():
    """TILT: a harsh buzzer, an electrical zap, then everything powering down."""
    sec = 2.4
    n = int(sec * SR)
    out = np.zeros(n)
    bz = buzzer(0.7, 90)
    out[: len(bz)] += bz * 1.2
    zap = bp(noise(0.12), 1500, 9000) * decay(int(0.12 * SR), 0.03)
    out[: len(zap)] += zap * 0.8
    pd = signal.sawtooth(glide(320, 30, 1.6, 0.6)) + 0.5 * np.sin(glide(160, 15, 1.6, 0.6))
    pd = lp(pd, 1800) * adsr(int(1.6 * SR), 0.01, 0.6)
    i0 = int(0.25 * SR)
    out[i0 : i0 + len(pd)] += pd * 0.6
    return sat(out, 1.3)


def trombone(nn, sec, glide_in=0.0, vib=0.0):
    """A muted trombone note: a saw through a 'wah' that opens with the note."""
    t = t_axis(sec)
    f = midi(nn) * (1 + glide_in * np.exp(-t / 0.06)) * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * smooth(0.3, 0.8, t))
    v = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) + 0.3 * signal.sawtooth(2 * np.pi * np.cumsum(f * 2.003) / SR)
    fc = 400 + 1600 * np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 0.8
    v = vfilter(v, fc, "low")
    return v * adsr(len(t), 0.05, 0.15)


def sad_trombone():
    """Wah wah wah waaah."""
    notes = [(58, 0.5), (57, 0.5), (56, 0.5), (55, 1.6)]
    total = sum(s for _, s in notes) + 0.3
    out = np.zeros(int(total * SR))
    t = 0.0
    for i, (nn, s) in enumerate(notes):
        v = trombone(nn, s + 0.05, -0.04, 0.03 if i == 3 else 0.0)
        i0 = int(t * SR)
        out[i0 : i0 + len(v)] += v
        t += s
    return out * 0.7


def slide_whistle(f0, f1, sec):
    t = t_axis(sec)
    f = f0 * (f1 / f0) ** (t / sec) * (1 + 0.012 * np.sin(2 * np.pi * 6 * t))
    v = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.08 * lp(noise(sec), 3000)
    return v * adsr(len(t), 0.04, 0.12) * 0.5


def plop():
    v = np.sin(glide(900, 160, 0.16, 0.5)) * decay(int(0.16 * SR), 0.06)
    return v


def metal_clank(f=900):
    sec = 0.6
    n = int(sec * SR)
    out = np.zeros(n)
    for m, a, d in ((1, 0.5, 0.12), (2.3, 0.35, 0.08), (3.7, 0.25, 0.05), (5.2, 0.15, 0.03)):
        out += np.sin(2 * np.pi * f * m * t_axis(sec)) * decay(n, d) * a
    th = thump(120, 50, 0.05, 0.3)
    out[: len(th)] += th * 0.8
    return out


def game_over_jingle():
    """A chiptune that gives up: down the scale, a wobbling bwomp."""
    notes = [(72, 0.16), (67, 0.16), (64, 0.16), (60, 0.5)]
    total = sum(s for _, s in notes) + 0.9
    out = np.zeros(int(total * SR))
    t = 0.0
    for nn, s in notes:
        v = square(2 * np.pi * midi(nn) * t_axis(s), 0.5) * adsr(int(s * SR), 0.004, 0.05) * 0.35
        i0 = int(t * SR)
        out[i0 : i0 + len(v)] += v
        t += s
    bw = signal.sawtooth(glide(110, 45, 0.8, 0.7)) * adsr(int(0.8 * SR), 0.01, 0.3) * 0.5
    i0 = int(t * SR)
    out[i0 : i0 + len(bw)] += lp(bw, 900)
    return lp(out, 5000)


def coin_sfx():
    """A coin: clink in the slot, rattling down the mechanism, the credit chime."""
    sec = 1.6
    n = int(sec * SR)
    out = np.zeros(n)
    for f, a in ((3300, 0.5), (4400, 0.35), (6100, 0.2)):
        out[: int(0.5 * SR)] += np.sin(2 * np.pi * f * t_axis(0.5)) * decay(int(0.5 * SR), 0.09) * a
    t = 0.12
    gap = 0.07
    for i in range(6):
        c = click(0.015, 2500) * (0.5 - i * 0.05)
        i0 = int(t * SR)
        out[i0 : i0 + len(c)] += c
        t += gap
        gap *= 0.8
    ch = ding((79, 84), 0.09, 0.8, 0.35)
    i0 = int(0.6 * SR)
    out[i0 : i0 + len(ch)] += ch[: n - i0]
    return out


def eject_sfx():
    """The trough's kicker: THUNK, then a whistle rising as you come up through the trapdoor."""
    sec = 1.8
    n = int(sec * SR)
    out = np.zeros(n)
    th = thump(140, 45, 0.08, 0.4)
    out[: len(th)] += th * 1.0
    c = click(0.02, 1500)
    out[: len(c)] += c * 0.8
    sw = slide_whistle(320, 1300, 1.2)
    i0 = int(0.3 * SR)
    out[i0 : i0 + len(sw)] += sw * 0.8
    return out


def record_scratch():
    """The vinyl scratch: noise and a tone yanked back and forth through a resonant filter."""
    sec = 0.55
    t = t_axis(sec)
    lfo = np.sin(2 * np.pi * np.cumsum(5 + 9 * t / sec) / SR)
    fc = 1200 * 2 ** (1.6 * lfo)
    x = vfilter(noise(sec), fc, "low", 128) - vfilter(noise(sec), fc * 0.3, "low", 128)
    tone = np.sin(2 * np.pi * np.cumsum(260 * 2 ** (1.4 * lfo)) / SR) * 0.6
    v = (x * 1.5 + tone) * adsr(len(t), 0.005, 0.12)
    return sat(v, 2.0)


def tape_rewind(sec, src):
    """A VHS rewinding: a high whine, the motor's whir, and `src` (stereo, sped up and reversed: the ball's
    life squealing backwards) under it."""
    t = t_axis(sec)
    whine = np.sin(2 * np.pi * np.cumsum(3200 + 300 * np.sin(2 * np.pi * 7 * t)) / SR) * 0.08
    whir = bp(noise(sec), 900, 3000) * (0.6 + 0.4 * np.sin(2 * np.pi * 13 * t)) * 0.25
    p = len(src) / len(t)
    fast = repitch(src[::-1], p)[: len(t)]
    if len(fast) < len(t):
        fast = np.pad(fast, ((0, len(t) - len(fast)), (0, 0)))
    out = np.stack([whine + whir] * 2, axis=1) + fast * 0.5
    return out * adsr(len(t), 0.02, 0.05)[:, None]


def xylophone(nn, sec=0.6):
    t = t_axis(sec)
    f = midi(nn)
    v = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.18) + 0.4 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.05)
    return v * adsr(len(t), 0.001, 0.05)


def card_jingle():
    """The time card: a xylophone running up F major, a ding at the top."""
    notes = [65, 69, 72, 77, 81, 84, 89]
    out = np.zeros(int(1.6 * SR))
    for i, nn in enumerate(notes):
        v = xylophone(nn, 0.7) * 0.5
        i0 = int(i * 0.055 * SR)
        out[i0 : i0 + len(v)] += v
    b = bell(midi(96), 1.0) * 0.25
    i0 = int(0.42 * SR)
    out[i0 : i0 + len(b)] += b
    return out


def whoosh(sec=0.5, f0=300, f1=3000, k=1.0):
    x = noise(sec)
    fc = np.geomspace(f0, f1, len(x))
    y = vfilter(x, fc, "low") - vfilter(x, fc * 0.5, "low")
    return y * np.sin(np.pi * np.linspace(0, 1, len(x))) ** 1.5 * k


def bubble_pop():
    v = np.sin(glide(700, 1500, 0.06, 0.6)) * adsr(int(0.06 * SR), 0.003, 0.03)
    return v * 0.5


def boing():
    """BOING: a spring let go, wobbling."""
    sec = 1.1
    t = t_axis(sec)
    f = 150 + 260 * np.exp(-t / 0.5) * (1 + 0.35 * np.sin(2 * np.pi * 13 * t) * np.exp(-t / 0.45))
    v = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR)
    v *= adsr(len(t), 0.004, 0.3)
    whack = thump(150, 50, 0.05, 0.3)
    v[: len(whack)] += whack * 0.8
    return v


def creak(f, sec):
    """A spring creaking: a resonant buzz of grains."""
    t = t_axis(sec)
    grains = (RNG.random(len(t)) < 0.004).astype(float)
    grains = np.convolve(grains, np.hanning(64), mode="same")
    v = bp(grains, f * 0.8, f * 1.25) * 6 + bp(noise(sec), f, f * 1.1) * 0.15
    return v * adsr(len(t), 0.05, 0.1)


# ================================================================== the song


CHORDS = {"F": [53, 57, 60, 65], "Dm": [50, 53, 57, 62], "Bb": [46, 50, 53, 58], "C": [48, 52, 55, 60], "Am": [45, 48, 52, 57]}
ROOTS = {"F": 41, "Dm": 38, "Bb": 34, "C": 36, "Am": 33}
PROG_A = ["F", "Dm", "Bb", "C"]
PROG_B = ["F", "Am", "Bb", "C"]
# the lead, 8 bars of eighths: midi note, 0 rest, -1 tie
MELODY = [
    [72, -1, 69, 72, 77, -1, 76, 74],
    [74, -1, 69, 74, 77, -1, 74, 72],
    [70, -1, 74, 77, 79, 77, 74, 70],
    [72, -1, 76, 79, 84, -1, -1, 0],
    [77, 76, 77, 72, 69, 72, 65, 0],
    [74, 72, 74, 69, 65, 69, 62, 0],
    [70, 72, 74, 77, 79, -1, 77, 79],
    [84, -1, 79, -1, 76, -1, 72, 0],
]
# funky bass: (16th step, interval, length in steps, velocity)
BASS = [(0, 0, 2, 1.0), (3, 12, 1, 0.6), (4, 0, 1, 0.8), (6, 12, 1, 0.7), (8, 0, 2, 0.9), (10, 7, 1, 0.6),
        (11, 12, 1, 0.7), (12, 0, 1, 0.8), (14, 10, 1, 0.6), (15, 12, 1, 0.5)]


def kick_drum():
    return ga.kick(0.35, 170, 50, 0.11)


def snare():
    sec = 0.25
    n = int(sec * SR)
    body = np.sin(glide(240, 180, sec)) * decay(n, 0.05) * 0.6
    sn = bp(noise(sec), 1500, 8000) * decay(n, 0.09)
    return sat(body + sn * 0.9, 1.3)


def hat_c():
    return ga.hat(0.06, 0.016)


def hat_o():
    return ga.hat(0.3, 0.09) * 0.8


def bass_note(nn, sec, vel):
    t = t_axis(sec)
    f = midi(nn)
    ph = 2 * np.pi * f * t
    v = 0.6 * square(ph, 0.5) + 0.6 * signal.sawtooth(ph)
    fc = 300 + 2400 * vel * np.exp(-t / 0.07)
    v = vfilter(v, fc, "low", 64) + 0.35 * np.sin(ph)
    return v * adsr(len(t), 0.003, 0.03) * vel


def lead_note(nn, sec):
    t = t_axis(sec)
    f = midi(nn) * (1 + 0.006 * np.sin(2 * np.pi * 6 * t) * smooth(0.12, 0.3, t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    v = square(ph, 0.25) * 0.7 + square(ph * 1.003, 0.5) * 0.3
    return lp(v, 5200) * adsr(len(t), 0.004, 0.04)


def arp_note(nn, sec):
    ph = 2 * np.pi * midi(nn) * t_axis(sec)
    return tri(ph) * adsr(int(sec * SR), 0.002, sec * 0.6)


def song(t0, t1, start_bar=0, energy=None):
    """The groove from video time t0 to t1 on a 128 BPM grid that starts at t0 (bar `start_bar`).
    `energy(bar)` -> dict of which parts play."""
    drums = bus()
    bass = bus()
    keys = bus()
    lead = bus()
    nbars = int(math.ceil((t1 - t0) / BAR))
    for b in range(nbars):
        gb = start_bar + b
        bt = t0 + b * BAR
        if bt >= t1:
            break
        e = energy(gb) if energy else {"drums": 1, "bass": 1, "keys": 1, "lead": 1, "arp": 0}
        prog = PROG_A if (gb // 4) % 2 == 0 else PROG_B
        ch = prog[gb % 4]
        root = ROOTS[ch]
        for s in range(16):
            st = bt + s * STEP
            if st >= t1:
                break
            if e["drums"]:
                if s % 4 == 0:
                    place(drums, stereo(kick_drum()), st, 0.75)
                if s in (4, 12):
                    place(drums, stereo(snare(), 0.05, 0.2), st, 0.55)
                if s % 2 == 0:
                    place(drums, stereo(hat_c(), 0.35), st, 0.3 if s % 4 else 0.2)
                if s % 4 == 2 and e["drums"] > 1:
                    place(drums, stereo(hat_o(), 0.35), st, 0.16)
                if gb % 4 == 3 and s >= 12 and e["drums"] > 1:
                    place(drums, stereo(snare(), -0.1, 0.2), st, 0.25 + 0.06 * (s - 12))
        if e["bass"]:
            for s, iv, ln, vel in BASS:
                st = bt + s * STEP
                if st < t1:
                    place(bass, stereo(bass_note(root + iv, ln * STEP * 0.9, vel)), st, 0.34)
        if e["keys"]:
            # brass-ish stabs on the "and" of 2 and 4
            for s in (6, 14):
                st = bt + s * STEP
                if st < t1:
                    place(keys, stereo(brass([n + 12 for n in CHORDS[ch][1:]], STEP * 1.6, 0.6), 0.3 if s == 6 else -0.3, 0.3), st, 0.42)
        if e["lead"]:
            mel = MELODY[gb % 8]
            for i, nn in enumerate(mel):
                if nn <= 0:
                    continue
                ln = 1
                while i + ln < 8 and mel[i + ln] == -1:
                    ln += 1
                st = bt + i * 2 * STEP
                if st < t1:
                    place(lead, stereo(lead_note(nn, ln * 2 * STEP * 0.92), 0.1, 0.4), st, 0.38)
        if e.get("arp"):
            tones = CHORDS[ch]
            for s in range(16):
                st = bt + s * STEP
                if st < t1:
                    place(lead, stereo(arp_note(tones[s % 4] + 24, STEP * 0.9), -0.4 if s % 2 else 0.4), st, 0.12)
    # sidechain: everything but the drums ducks under the kick
    pump = np.ones(N + PAD)
    for b in range(nbars * 4):
        i = int((t0 + b * BEAT) * SR)
        if i < 0:
            continue
        if i >= len(pump):
            break
        m = int(0.18 * SR)
        seg = pump[i : i + m]
        pump[i : i + m] = np.minimum(seg, 0.55 + 0.45 * np.linspace(0, 1, len(seg)) ** 0.7)
    mix = (bass + keys + lead) * pump[:, None] + drums
    # hard edges at t0/t1 (the cuts are part of the comedy)
    i1 = int(t1 * SR)
    mix[i1:] = 0
    return mix


def roll_build(t0, t1):
    """A snare roll crescendo, a bass climbing chromatically, a cymbal swell: into the launch."""
    b = bus()
    sec = t1 - t0
    t = t0
    while t < t1:
        k = smooth(t0, t1, t)
        place(b, stereo(snare(), 0.0, 0.3), t, 0.08 + 0.32 * k)
        t += 0.11 - 0.06 * k
    nn = 29
    t = t0
    while t < t1 - 0.1:
        place(b, stereo(bass_note(nn, 0.3, 0.8)), t, 0.45)
        nn += 1
        t += 0.39
    sw = hp(noise(sec), 4000) * smooth(0, sec, t_axis(sec)) ** 3
    place(b, stereo(sw, 0, 0.6), t0, 0.25)
    return b


def tape_stop(x, t0, sec=0.7):
    """Slow the bus to a halt from t0 (the pitch sinks to nothing), silence after."""
    i0 = int(t0 * SR)
    n = int(sec * SR)
    u = np.arange(n) / n
    speed = (1 - u) ** 1.3
    pos = i0 + np.cumsum(speed)
    out = x.copy()
    for c in range(2):
        out[i0 : i0 + n, c] = np.interp(pos, np.arange(len(x)), x[:, c]) * (1 - u) ** 0.5
    out[i0 + n :] = 0
    return out


def music():
    b = bus()
    launch = KEY["launch"]
    # the cold open: the chorus, already going (a bar and a bit before the video starts)
    cold = song(-BAR * 1.5, KEY["freeze"], 4, lambda gb: {"drums": 2, "bass": 1, "keys": 1, "lead": 1, "arp": 1})
    b += cold
    # the drop at the launch, verse then chorus; multiball adds the arpeggio
    def energy(gb):
        t = launch + gb * BAR
        if t < 12.4:
            return {"drums": 1, "bass": 1, "keys": 0, "lead": 0, "arp": 0}
        if t < 20.0:
            return {"drums": 1, "bass": 1, "keys": 1, "lead": 1, "arp": 0}
        if t < KEY["burp"] - 0.5:
            return {"drums": 2, "bass": 1, "keys": 1, "lead": 1, "arp": 0}
        return {"drums": 2, "bass": 1, "keys": 1, "lead": 1, "arp": 1}

    main = song(launch, KEY["tilt"] + 1.0, 0, energy)
    # inside the monster: muffled (as if from outside a mouth), quieter
    m0, m1 = int(KEY["chomp"] * SR), int(KEY["burp"] * SR)
    inside = np.stack([lp(main[:, c], 380, 4) for c in range(2)], axis=1)
    main[m0:m1] = inside[m0:m1] * 0.55
    # the TILT: tape stop
    main = tape_stop(main, KEY["tilt"] + 0.05, 0.8)
    b += main
    b += roll_build(KEY["pull"], launch)
    # the loop: the roll again from the eject into the cold open's chorus
    b += roll_build(KEY["eject"] + 1.4, DUR)
    return b


# ================================================================== the mix


def sfx():
    b = bus()
    first_lane = True
    for e in EV:
        t = e["t"]
        k = e.get("k", 0)
        mine = e.get("ball") == "you"
        p = slowmo(t)
        pan = float(np.clip((e.get("x", 0.257) - 0.257) / 0.3, -0.8, 0.8))
        kind = e["kind"]
        if kind == "bumper":
            g = 1.0 if mine else 0.35
            place(b, stereo(repitch(bumper_sfx(k), p), pan, 0.2), t, 0.55 * g)
        elif kind in ("sling_L", "sling_R"):
            g = 1.0 if mine else 0.35
            place(b, stereo(repitch(sling_sfx(), p), -0.5 if kind == "sling_L" else 0.5, 0.2), t, 0.55 * g)
        elif kind in ("flip_L", "flip_R"):
            place(b, stereo(repitch(flipper_sfx(False), p), -0.4 if kind == "flip_L" else 0.4), t, 0.4)
        elif kind in ("flipper_L", "flipper_R"):
            g = 1.0 if mine else 0.3
            place(b, stereo(repitch(flipper_sfx(True), p), -0.3 if kind == "flipper_L" else 0.3, 0.2), t, 0.6 * g)
        elif kind == "drop":
            place(b, stereo(repitch(drop_sfx(), p), pan, 0.2), t, 0.5)
        elif kind == "ballhit":
            place(b, stereo(repitch(ballhit_sfx(), p), pan, 0.2), t, 0.5)
        elif kind == "clack" and mine:
            sp = e.get("speed", 0.5)
            place(b, stereo(repitch(clack_sfx(sp), p), pan, 0.1), t, 0.12 + 0.15 * min(1.0, sp))
        elif kind == "lane" and mine:
            if first_lane:
                first_lane = False
                place(b, stereo(ding((84, 88, 91, 96), 0.08, 1.0, 0.4), 0, 0.4), t, 0.55)
                place(b, stereo(coin_sfx()[: int(0.5 * SR)], 0.2), t + 0.15, 0.3)
            else:
                place(b, stereo(ding((84,), 0, 0.6, 0.3), pan), t, 0.3)
        elif kind == "launch":
            if mine:
                place(b, stereo(boing(), 0, 0.3), t, 0.7)
            else:
                place(b, stereo(lp(boing(), 1200), 0.6), t, 0.25)
        elif kind == "ramp_in":
            place(b, stereo(repitch(slurp(), p), -0.2, 0.3), t, 0.55)
    # the cold open's BONK, slowed with the slow motion
    for e in COLD:
        if e["kind"] == "bumper":
            place(b, stereo(repitch(bumper_sfx(e.get("k", 1)), 0.6), 0, 0.3), e["t"], 0.7)
    # the big set pieces
    place(b, stereo(repitch(chomp_sfx(), slowmo(KEY["chomp"], 0.7)), 0, 0.4), KEY["chomp"], 0.95)
    chew = chew_sfx(KEY["burp"] - KEY["chomp"] - 0.35)
    place(b, stereo(chew, 0, 0.5), KEY["chomp"] + 0.25, 0.55)
    place(b, stereo(gurgle(KEY["burp"] - KEY["chomp"]), 0, 0.6), KEY["chomp"] + 0.2, 0.25)
    place(b, stereo(lp(siren(2.0), 900), 0.5, 0.4), KEY["multiball"], 0.6)
    place(b, stereo(repitch(burp_sfx(), 0.92), 0, 0.3), KEY["burp"], 1.1)
    place(b, stereo(jackpot_sfx(), 0, 0.6), KEY["jackpot"], 0.7)
    for i, tn in enumerate(NUDGES):
        place(b, stereo(shove(), 0, 0.4), tn, 0.8)
        if i < 2:
            place(b, stereo(buzzer(0.3, 120), 0, 0.2), tn + 0.08, 0.3)
            place(b, stereo(buzzer(0.3, 120), 0, 0.2), tn + 0.45, 0.3)
    place(b, stereo(tilt_sfx(), 0, 0.4), KEY["tilt"], 0.85)
    place(b, stereo(sad_trombone(), 0, 0.3), 57.3, 0.75)
    # the drain: plop, a falling whistle, landing in the trough, rolling along it
    d = KEY["drain"]
    place(b, stereo(plop(), 0), d + 0.08, 0.6)
    place(b, stereo(slide_whistle(1400, 260, 0.75), 0, 0.2), d + 0.1, 0.45)
    place(b, stereo(metal_clank(700), 0.1, 0.3), d + 0.55, 0.5)
    place(b, stereo(game_over_jingle(), 0, 0.3), KEY["gameOver"], 0.55)
    place(b, stereo(coin_sfx(), 0.3, 0.3), KEY["coin1"], 0.6)
    place(b, stereo(coin_sfx(), 0.3, 0.3), KEY["coin2"], 0.6)
    place(b, stereo(eject_sfx(), 0.2, 0.3), KEY["eject"], 0.75)
    # the plunger creaking back as it's pulled, the spring wobbling at full stretch
    t = KEY["pull"]
    while t < KEY["launch"] - 1.2:
        k = smooth(KEY["pull"], KEY["launch"] - 1.2, t)
        place(b, stereo(creak(500 + 900 * k, 0.18), 0.3), t, 0.35)
        t += 0.16
    # the cold open: record scratch into the freeze (the VHS rewind is added in the mix), the time card,
    # the title
    place(b, stereo(record_scratch(), 0, 0.3), KEY["freeze"] - 0.05, 0.9)
    place(b, stereo(card_jingle(), 0, 0.5), KEY["card"], 0.55)
    place(b, stereo(whoosh(0.5, 200, 2500), 0, 0.6), KEY["title"] - 0.15, 0.4)
    place(b, stereo(ga.kick(0.5, 90, 40, 0.25)), KEY["title"], 0.45)
    # the captions: a soft pop for each thought, a whoosh and a ding for each fact
    for th in SCRIPT["thoughts"]:
        place(b, stereo(bubble_pop(), 0), th["t0"], 0.18)
    for f in SCRIPT["facts"]:
        place(b, stereo(whoosh(0.35, 400, 4000), -0.3, 0.6), f["t0"] - 0.05, 0.22)
        place(b, stereo(ding((88,), 0, 0.5, 0.25), 0), f["t0"] + 0.22, 0.25)
    return b


def rolling():
    """The ball rolling: a rumble that follows your speed (deeper in slow motion), wet on the tongue,
    metallic in the trough; silent in the air, in the mouth, at rest."""
    tf = np.arange(FR) / FPS
    sp = SPEED * np.clip(RATE, 0, 2)
    h = YOU[:, 1]
    on_floor = (np.abs(h - 0.0135) < 0.003).astype(float)
    on_tongue = ((h > 0.016) & (h < 0.07)).astype(float) * (tf < KEY["chomp"]) + ((h > 0.016) & (tf > KEY["burp"]) & (tf < KEY["burp"] + 1.5))
    in_trough = (h < -0.02).astype(float)
    cold = (tf < M["rewind"][1]).astype(float)
    ts = np.arange(N) / SR
    amp = np.interp(ts, tf, np.clip(sp / 1.5, 0, 1) * (on_floor + 0.7 * on_tongue + 0.8 * in_trough) * (1 - cold))
    pitch = np.interp(ts, tf, np.clip(np.sqrt(np.clip(RATE, 0.05, 1.5)), 0.3, 1.2))
    x = noise(DUR)
    rumble = vfilter(x, 260 * pitch, "low") * 1.4 + vfilter(x, 900 * pitch, "low") * 0.3
    rumble *= amp
    # wet: a squelchy flutter on the tongue
    wet = np.interp(ts, tf, on_tongue) * amp
    rumble += bp(noise(DUR), 400, 1600) * wet * (0.5 + 0.5 * np.sin(2 * np.pi * 17 * ts)) * 0.25
    out = bus()
    out[:N] = stereo(rumble, 0, 0.3)
    return out


def ambience():
    """The machine: a 60 Hz hum and a fan, there all along (quieter after the tilt); the trough's buzz."""
    ts = np.arange(N) / SR
    hum = (np.sin(2 * np.pi * 60 * ts) + 0.4 * np.sin(2 * np.pi * 120 * ts) + 0.15 * np.sin(2 * np.pi * 180 * ts)) * 0.05
    fan = lp(noise(DUR), 500) * 0.04
    lvl = 1 - 0.6 * smooth(KEY["tilt"], KEY["tilt"] + 0.5, ts) * (1 - smooth(KEY["gameOver"], KEY["gameOver"] + 1, ts))
    trough = smooth(KEY["drain"] + 0.4, KEY["drain"] + 1.0, ts) * (1 - smooth(KEY["eject"] + 0.8, KEY["eject"] + 1.4, ts))
    buzz = lp(square(2 * np.pi * 100 * ts, 0.5), 800) * 0.03 * trough
    out = bus()
    out[:N] = stereo((hum + fan) * lvl + buzz, 0, 0.5)
    return out


def mix():
    mus = music()
    fx = sfx()
    roll = rolling()
    amb = ambience()
    # the music ducks under the big moments
    ts = np.arange(N + PAD) / SR
    duck = np.ones(N + PAD)
    for t0, depth, length in ((KEY["chomp"], 0.5, 0.8), (KEY["burp"], 0.45, 1.3), (KEY["jackpot"], 0.5, 1.2), (KEY["launch"], 0.7, 0.6)):
        duck *= 1 - depth * np.exp(-np.clip(ts - t0, 0, None) / length) * (ts >= t0)
    mus = mus * duck[:, None]
    mus = reverb(mus, 1.8, 0.16, 7000)[: N + PAD]
    fx = reverb(fx, 1.2, 0.14, 8000)[: N + PAD]
    out = mus * 0.62 + fx * 0.95 + roll * 0.45 + amb
    # the rewind: the six seconds before the jackpot, backwards at six times the speed, on tape
    r0, r1 = M["rewind"]
    src = out[int((KEY["jackpot"] - 6.0) * SR) : int(KEY["jackpot"] * SR)].copy()
    place(out, tape_rewind(r1 - r0, src), r0, 0.6)
    out = out[:N]
    # for phone speakers: less sub, more presence; nothing below 30 Hz
    out = np.stack([hp(out[:, c], 30) for c in range(2)], axis=1)
    low = np.stack([lp(out[:, c], 120) for c in range(2)], axis=1)
    pres = np.stack([bp(out[:, c], 1800, 6000) for c in range(2)], axis=1)
    out = out - 0.4 * low + 0.35 * pres
    # dead silence in the freeze frame (after the scratch rings out), and a hair of fade at the ends
    g = np.interp(np.arange(N) / SR, [0, KEY["freeze"] + 0.5, KEY["freeze"] + 0.75, M["rewind"][0] - 0.05, M["rewind"][0], DUR],
                  [1, 1, 0.08, 0.08, 1, 1])
    out *= g[:, None]
    k = int(0.008 * SR)
    out[:k] *= np.linspace(0, 1, k)[:, None]
    out[-k:] *= np.linspace(1, 0, k)[:, None]
    return out


if __name__ == "__main__":
    out = mix()
    d = os.path.join(ROOT, "public", "pinball")
    os.makedirs(d, exist_ok=True)
    peak = np.max(np.abs(out))
    # the mp3 is what the composition plays; the wav (not committed) is for the final mastering pass
    w = os.path.join(ROOT, "out", "pinball")
    os.makedirs(w, exist_ok=True)
    wavfile.write(os.path.join(w, "bed.wav"), SR, (out / max(peak, 1e-9) * 0.89).astype(np.float32))
    ga.write_mp3(os.path.join(d, "bed.mp3"), out, 0.89)
    print("pinball bed written", round(len(out) / SR, 2), "s, peak", round(float(peak), 3))
