#!/usr/bin/env python3
"""
Sound for the Pinball composition ("POV: you're a pinball"): every sound synthesised here, timed from
src/pinball/track.json (the physics events) and src/pinball/script.json (the captions). No voice.

  0-0.9 s    the cold open: the song mid-chorus, BONK, then a record scratch into the freeze frame
  0.9-3      silence over the freeze frame (the delivered cut keeps just the scratch)
  3-4        the VHS rewind: tape whine, the cold open squealing backwards
  4-5.45     (cut from the delivered video)
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
  70-86.6    hard cut to a beach (src/tsunami/cues.json): surf and gulls, a wash over your feet, the sea
             sucked out, silence, a white line, the rumble, people running past, BRAAAM, the roar...
             hard cut to black and silence at 86.2

The music runs under everything now (an island-funk band: drums, bass guitar, ukulele, clav, horns and a
whistled tune), except the freeze frame; a sad violin takes over when the flippers die.

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
with open(os.path.join(ROOT, "src", "tsunami", "cues.json")) as f:
    CUES = json.load(f)
FPS = TR["fps"]
FR = TR["frames"]
# the pinball runs 70 s, then a hard cut to the beach (src/tsunami: the sea pulls back, the tsunami)
END0 = FR / FPS
assert abs(CUES["start"] - END0) < 1e-6
DUR = END0 + CUES["dur"]
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
# ukulele voicings (re-entrant feel: everything round middle C)
UKE = {"F": [60, 65, 69, 72], "Dm": [62, 65, 69, 74], "Bb": [62, 65, 70, 74], "C": [60, 64, 67, 72], "Am": [60, 64, 69, 72]}
PROG_A = ["F", "Dm", "Bb", "C"]
PROG_B = ["F", "Am", "Bb", "C"]
# the tune, 8 bars of eighths: midi note, 0 rest, -1 tie (whistled, an octave up)
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


_KS = {}


def ks(f, sec, bright=0.6, damp=0.996):
    """Karplus-Strong plucked string at f Hz: a burst of filtered noise round a damped loop, retuned to f.
    Cached (the same notes come round every bar)."""
    key = (round(f, 3), round(sec, 3), bright, damp)
    hit = _KS.get(key)
    if hit is not None:
        return hit
    n = int(sec * SR)
    L = max(2, int(SR / f - 0.5))
    m = min(n, L)
    r = np.random.default_rng(int(f * 7) % 10007)
    burst = r.uniform(-1, 1, m)
    if bright < 0.99:
        burst = lp(burst, 300 + 9000 * bright)
    exc = np.zeros(n)
    exc[:m] = burst
    a = np.zeros(L + 2)
    a[0] = 1.0
    a[L] = a[L + 1] = -0.5 * damp
    y = signal.lfilter([1.0], a, exc)
    # the loop rings at SR / (L + 0.5): read it back slower or faster to land on f exactly
    ratio = f / (SR / (L + 0.5))
    y = np.interp(np.arange(n) * ratio, np.arange(n), y)
    y = y * adsr(n, 0.001, min(0.06, sec * 0.3))
    y /= max(1e-9, float(np.max(np.abs(y))))
    _KS[key] = y
    return y


def kick_drum():
    return ga.kick(0.35, 175, 48, 0.12)


def snare():
    sec = 0.25
    n = int(sec * SR)
    body = np.sin(glide(240, 180, sec)) * decay(n, 0.05) * 0.6
    sn = bp(noise(sec), 1500, 8000) * decay(n, 0.09)
    return sat(body + sn * 0.9, 1.3)


def snare_clap():
    s1 = snare()
    c = ga.clap(0.25)
    out = np.zeros(max(len(s1), len(c)))
    out[: len(s1)] += s1
    out[: len(c)] += c * 0.8
    return out


def hat_c():
    return ga.hat(0.06, 0.016)


def hat_o():
    return ga.hat(0.3, 0.09) * 0.8


def tamb():
    sec = 0.2
    n = int(sec * SR)
    e = np.zeros(n)
    for off in (0.0, 0.011, 0.026):
        i = int(off * SR)
        e[i:] += decay(n - i, 0.035)
    return hp(noise(sec), 5500, 2) * e * 0.5


def shaker():
    sec = 0.07
    return hp(noise(sec), 6500) * adsr(int(sec * SR), 0.015, 0.045)


def snap():
    sec = 0.12
    n = int(sec * SR)
    return bp(noise(sec), 1800, 5000) * decay(n, 0.012) + np.sin(2 * np.pi * 1350 * t_axis(sec)) * decay(n, 0.006) * 0.4


def bass_note(nn, sec, vel):
    """Bass guitar: a plucked string with a round sine under it, a touch of grit."""
    f = midi(nn)
    s1 = ks(f, sec, 0.45 + 0.25 * vel, 0.9985)
    sub = np.sin(2 * np.pi * f * t_axis(sec)) * adsr(int(sec * SR), 0.004, min(0.05, sec * 0.3))
    return sat(s1 * 0.8 + sub * 0.7, 1.4) * vel


def strum(ch, sec, down=True, k=1.0, bright=0.72):
    """A ukulele strum: four plucked strings a few ms apart (low to high going down)."""
    notes = UKE[ch] if down else UKE[ch][::-1]
    n = int((sec + 0.05) * SR)
    out = np.zeros(n)
    for i, nn in enumerate(notes):
        v = ks(midi(nn), sec, bright, 0.993)
        i0 = int(i * 0.0105 * SR)
        j = min(n, i0 + len(v))
        out[i0:j] += v[: j - i0] * (1.0 if i == 0 else 0.85)
    return out * k * 0.32


def clav(notes, sec=0.2):
    """Funky clavinet stab: bright plucks, muted fast, no bottom."""
    n = int(sec * SR)
    out = np.zeros(n)
    for nn in notes:
        out += ks(midi(nn), sec, 1.0, 0.985)
    return hp(out / len(notes), 280) * adsr(n, 0.001, 0.05)


def whistle(nn, sec, prev=None):
    """Someone whistling the tune: a pure tone with a little breath, sliding in from the last note."""
    t = t_axis(sec)
    f0 = midi(nn)
    if prev:
        f = f0 * (midi(prev) / f0) ** np.exp(-t / 0.03)
    else:
        f = np.full(len(t), f0) * (1 - 0.03 * np.exp(-t / 0.04))
    f = f * (1 + 0.011 * np.sin(2 * np.pi * 5.6 * t) * smooth(0.1, 0.3, t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) + 0.06 * np.sin(2 * ph)
    breath = bp(noise(sec), f0 * 0.85, f0 * 1.2) * 0.14
    return (tone + breath) * adsr(len(t), 0.02, min(0.07, sec * 0.3))


def arp_note(nn, sec):
    ph = 2 * np.pi * midi(nn) * t_axis(sec)
    return tri(ph) * adsr(int(sec * SR), 0.002, sec * 0.6)


GROOVE = {"drums": 1, "bass": 1, "uke": 1, "clav": 0, "brass": 0, "lead": 1, "arp": 0, "tamb": 0, "shaker": 1, "snap": 0}


def song(t0, t1, start_bar=0, energy=None):
    """The groove from video time t0 to t1 on a 128 BPM grid that starts at t0 (bar `start_bar`).
    `energy(bar)` -> which parts play (see GROOVE). An island-funk band: drums with a swing in the 16ths,
    bass guitar, ukulele, clav stabs, horns, someone whistling the tune."""
    drums = bus()
    bass = bus()
    keys = bus()
    lead = bus()
    nbars = int(math.ceil((t1 - t0) / BAR))
    prev = None
    for b in range(nbars):
        gb = start_bar + b
        bt = t0 + b * BAR
        if bt >= t1:
            break
        e = {**GROOVE, **(energy(gb) if energy else {})}
        prog = PROG_A if (gb // 4) % 2 == 0 else PROG_B
        ch = prog[gb % 4]
        root = ROOTS[ch]
        for s in range(16):
            st = bt + s * STEP + (0.016 if s % 2 else 0.0)
            if st >= t1:
                break
            if e["drums"]:
                if s % 4 == 0:
                    place(drums, stereo(kick_drum()), st, 0.8)
                if s in (4, 12):
                    place(drums, stereo(snare_clap(), 0.05, 0.25), st, 0.5)
                if s % 2 == 0:
                    place(drums, stereo(hat_c(), 0.35), st, 0.26 if s % 4 else 0.18)
                elif e["drums"] > 1:
                    place(drums, stereo(hat_c(), 0.3), st, 0.1)
                if s % 4 == 2 and e["drums"] > 1:
                    place(drums, stereo(hat_o(), 0.35), st, 0.13)
                if gb % 4 == 3 and s >= 12 and e["drums"] > 1:
                    place(drums, stereo(snare(), -0.1, 0.2), st, 0.22 + 0.06 * (s - 12))
            if e["tamb"] and s % 4 == 2:
                place(drums, stereo(tamb(), -0.45, 0.3), st, 0.22)
            if e["shaker"]:
                place(drums, stereo(shaker(), 0.5, 0.2), st, 0.09 if s % 2 else 0.05)
            if e["snap"] and s in (4, 12):
                place(drums, stereo(snap(), -0.3, 0.3), st, 0.4)
        if e["bass"]:
            for s, iv, ln, vel in BASS:
                st = bt + s * STEP + (0.016 if s % 2 else 0.0)
                if st < t1:
                    place(bass, stereo(bass_note(root + iv, ln * STEP * 0.92, vel)), st, 0.42)
        if e["uke"]:
            # island strum: down on the off-beats, a light up-strum after the 2 and the 4
            for s, dn, k in ((2, True, 0.75), (6, True, 1.0), (7, False, 0.4), (10, True, 0.75), (14, True, 1.0), (15, False, 0.4)):
                st = bt + s * STEP + (0.016 if s % 2 else 0.0)
                if st < t1:
                    place(keys, stereo(strum(ch, 0.3, dn, k), 0.25 if dn else -0.2, 0.3), st, 0.5)
        if e["clav"]:
            for s in (3, 11):
                st = bt + s * STEP + 0.016
                if st < t1:
                    place(keys, stereo(clav([n + 12 for n in CHORDS[ch][1:]]), -0.35, 0.2), st, 0.3)
        if e["brass"]:
            # horn stabs on the "and" of 2 and 4
            for s in (6, 14):
                st = bt + s * STEP
                if st < t1:
                    place(keys, stereo(brass([n + 12 for n in CHORDS[ch][1:]], STEP * 1.6, 0.6), 0.3 if s == 6 else -0.3, 0.3), st, 0.36)
        if e["lead"]:
            mel = MELODY[gb % 8]
            for i, nn in enumerate(mel):
                if nn <= 0:
                    if nn == 0:
                        prev = None
                    continue
                ln = 1
                while i + ln < 8 and mel[i + ln] == -1:
                    ln += 1
                st = bt + i * 2 * STEP + (0.0 if i % 2 == 0 else 0.016)
                if st < t1:
                    place(lead, stereo(whistle(nn + 12, ln * 2 * STEP * 0.95, (prev + 12) if prev else None), 0.1, 0.4), st, 0.3)
                prev = nn
        if e["arp"]:
            tones = CHORDS[ch]
            for s in range(16):
                st = bt + s * STEP
                if st < t1:
                    place(lead, stereo(arp_note(tones[s % 4] + 24, STEP * 0.9), -0.4 if s % 2 else 0.4), st, 0.09)
    # sidechain: everything but the drums ducks a little under the kick
    pump = np.ones(N + PAD)
    for b in range(nbars * 4):
        i = int((t0 + b * BEAT) * SR)
        if i < 0:
            continue
        if i >= len(pump):
            break
        m = int(0.16 * SR)
        seg = pump[i : i + m]
        pump[i : i + m] = np.minimum(seg, 0.7 + 0.3 * np.linspace(0, 1, len(seg)) ** 0.7)
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
        place(b, stereo(bass_note(nn, 0.3, 0.8)), t, 0.5)
        nn += 1
        t += 0.39
    sw = hp(noise(sec), 4000) * smooth(0, sec, t_axis(sec)) ** 3
    place(b, stereo(sw, 0, 0.6), t0, 0.25)
    i1 = int(t1 * SR)
    b[i1:] = 0
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


def violin(nn, sec):
    """A sad solo violin: a bowed saw through the body's resonances, slow vibrato, a soft attack."""
    t = t_axis(sec)
    f0 = midi(nn)
    f = f0 * (1 + 0.008 * np.sin(2 * np.pi * 5.3 * t) * smooth(0.15, 0.45, t))
    v = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR)
    v = bp(v, 380, 4200) + bp(v, 2400, 3400) * 0.6 + bp(v, 600, 900) * 0.4
    bow = bp(noise(sec), f0, f0 * 3) * 0.06
    return (v + bow) * adsr(len(t), 0.16, min(0.3, sec * 0.4), 1.4)


def piano(nn, sec=1.6):
    t = t_axis(sec)
    f = midi(nn)
    v = sum((0.6 ** (k - 1)) * np.sin(2 * np.pi * k * f * 1.0006 ** k * t) * np.exp(-t * (1.6 + 1.2 * k)) for k in range(1, 6))
    return v * adsr(len(t), 0.003, 0.2)


def sad_interlude(t0, t1, soft_from):
    """Rolling to the drain with the flippers dead: a slow sad violin over soft piano, D minor, 80 BPM.
    The violin bows out just before the sad trombone takes over; the piano carries on, softer, through
    GAME OVER until the next coin."""
    b = bus()
    beat = 0.75
    prog = [[50, 57, 62, 65], [46, 53, 58, 62], [43, 50, 55, 58], [45, 52, 57, 61]]
    i = 0
    while True:
        ct = t0 + i * 2 * beat
        if ct >= t1 - 0.5:
            break
        notes = prog[i % 4]
        g = 0.26 if ct < soft_from else 0.15
        for j, nn in enumerate(notes):
            place(b, stereo(piano(nn, 2.2), -0.2 + 0.13 * j, 0.3), ct + j * 0.12, g)
        place(b, stereo(piano(notes[0] - 12, 2.4), 0, 0.2), ct, g * 0.9)
        i += 1
    mel = [(0.0, 74, 1.5), (1.5, 72, 0.5), (2.0, 70, 1.0), (3.0, 69, 1.1)]
    for st, nn, ln in mel:
        place(b, stereo(violin(nn, ln * beat * 1.05), 0.1, 0.4), t0 + st * beat, 0.45)
    i1 = int(t1 * SR)
    b[i1:] = 0
    return b


def music():
    b = bus()
    launch = KEY["launch"]
    # the cold open: the chorus, already going (a bar and a bit before the video starts)
    cold = song(-BAR * 1.5, KEY["freeze"], 4, lambda gb: {"drums": 2, "brass": 1, "tamb": 1, "clav": 1})
    b += cold
    # under the time card and the title, while the coin goes in: just the bass, snaps, a shaker, the uke
    intro = song(KEY["title"] - BAR * 0.5, launch, 0, lambda gb: {"drums": 0, "lead": 0, "snap": 1})
    b += intro * 0.8
    # the drop at the launch, verse then chorus; multiball adds the arpeggio
    def energy(gb):
        t = launch + gb * BAR
        if t < 12.4:
            return {"lead": 0, "clav": 1}
        if t < 20.0:
            return {"clav": 1}
        if t < KEY["burp"] - 0.5:
            return {"drums": 2, "brass": 1, "tamb": 1}
        return {"drums": 2, "brass": 1, "tamb": 1, "arp": 1}

    main = song(launch, KEY["tilt"] + 1.0, 0, energy)
    # inside the monster: muffled (as if from outside a mouth), quieter
    m0, m1 = int(KEY["chomp"] * SR), int(KEY["burp"] * SR)
    inside = np.stack([lp(main[:, c], 380, 4) for c in range(2)], axis=1)
    main[m0:m1] = inside[m0:m1] * 0.55
    # the TILT: tape stop
    main = tape_stop(main, KEY["tilt"] + 0.05, 0.8)
    b += main
    b += roll_build(KEY["pull"], launch)
    # the flippers are dead: sad violin down to the drain
    b += sad_interlude(KEY["tilt"] + 1.15, KEY["coin2"] + 0.3, KEY["drain"])
    # the next coin: the groove creeps back (bass, shaker, snaps), the band comes in on the eject...
    def again(gb):
        t = KEY["coin2"] + 0.35 + gb * BAR
        if t < KEY["eject"]:
            return {"drums": 0, "lead": 0, "uke": 0, "snap": 1}
        return {"drums": 1, "lead": 0}

    b += song(KEY["coin2"] + 0.35, END0, 0, again) * 0.85
    # ... and the roll builds for the drop that never comes: hard cut to the beach at 70 s
    b += roll_build(KEY["eject"] + 1.4, END0)
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


# ================================================================== the ending: the beach


def gull_call(sec=0.42, f0=1950, f1=1250, k=1.0):
    """A herring gull's 'kee-ow': a raspy tone that drops, through a nasal filter."""
    t = t_axis(sec)
    f = f1 + (f0 - f1) * np.exp(-t / (sec * 0.32))
    f = f * (1 + 0.025 * np.sin(2 * np.pi * 31 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    v = sum((0.7 ** h) * np.sin((h + 1) * ph) for h in range(5))
    v = bp(v, 800, 5200) + bp(v, 2400, 3600) * 0.6
    return v * adsr(len(t), 0.015, sec * 0.45, 1.3) * k


def gull_laugh(n=5, k=1.0):
    out = np.zeros(int((n * 0.17 + 0.3) * SR))
    for i in range(n):
        v = gull_call(0.14, 1650 - i * 25, 1350, 1.0)
        i0 = int(i * 0.17 * SR)
        out[i0 : i0 + len(v)] += v
    return out * k


def flap(sec=0.09):
    return lp(noise(sec), 900) * np.sin(np.pi * np.linspace(0, 1, int(sec * SR))) ** 2


def fish_flop():
    sec = 0.16
    n = int(sec * SR)
    slap = bp(noise(sec), 300, 2600) * decay(n, 0.018)
    thud = np.sin(2 * np.pi * 120 * t_axis(sec)) * decay(n, 0.03) * 0.5
    return slap + thud


def step_sand(k=1.0):
    """A running footfall on wet sand: a soft thud and a squelch."""
    sec = 0.14
    n = int(sec * SR)
    thud = lp(noise(sec), 260) * decay(n, 0.03) * 2.2
    squelch = bp(noise(sec), 700, 2600) * decay(n, 0.02) * 0.5
    return (thud + squelch) * k


def braam(sec=3.2, root=26, k=1.0):
    """The trailer horn: a wall of low brass (root, fifth, octave), the filter tearing open, distorted."""
    t = t_axis(sec)
    out = np.zeros(len(t))
    for nn, g in ((root, 1.0), (root + 7, 0.7), (root + 12, 0.8), (root + 15, 0.35)):
        out += ga.saw_voice(midi(nn), sec, 14) * g
    fc = 140 + 2400 * (1 - np.exp(-t / 0.35)) * np.exp(-t / 1.6)
    v = sat(vfilter(out / 2.5, fc, "low") * 2.2, 2.4)
    sub = np.sin(2 * np.pi * midi(root - 12) * t) * 0.8
    return (v + sub) * adsr(len(t), 0.02, 1.2, 1.5) * k


def choir(notes, sec, k=1.0):
    """Voices on 'aah': detuned saws through the vowel's formants, slow swell."""
    t = t_axis(sec)
    out = np.zeros(len(t))
    for nn in notes:
        for d in (-6, 0, 6):
            f = midi(nn) * 2 ** (d / 1200) * (1 + 0.005 * np.sin(2 * np.pi * (4.8 + d * 0.03) * t + nn))
            out += signal.sawtooth(2 * np.pi * np.cumsum(f) / SR)
    out /= 3 * len(notes)
    v = bp(out, 650, 950) + bp(out, 1000, 1300) * 0.6 + bp(out, 2600, 3200) * 0.3
    return v * adsr(len(t), sec * 0.5, 0.05, 1.8) * k


def taiko(k=1.0):
    sec = 0.9
    n = int(sec * SR)
    body = np.sin(glide(95, 42, sec, 0.5)) * decay(n, 0.28)
    skin = lp(noise(sec), 500) * decay(n, 0.05) * 0.6
    return sat(body + skin, 1.6) * k


def ending():
    """The beach, from the cut (u = 0 at 70 s) to the cut to black. Times from src/tsunami/cues.json."""
    E = CUES["dur"]
    n = int(E * SR)
    b = np.zeros((n + PAD, 2))
    u = np.arange(n) / SR
    sw0, sw1 = CUES["swash"]
    bw0, bw1 = CUES["backwash"]
    p0, p1 = CUES["pull"]
    z0, z1 = CUES["zoom"]
    cut = CUES["cut"]
    rng = np.random.default_rng(86)

    def put(st, t, g=1.0):
        place(b, st, t, g)

    # ---- the sea: breakers rolling in, gone quiet as the water goes out
    sea = lp(hp(noise(E), 70), 900) * 0.6 + bp(noise(E), 900, 3000) * 0.18
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * u / 5.6 + 1.2) ** 4
    put(stereo(sea * swell * (1 - smooth(3.4, 7.0, u)), 0, 0.8), 0, 0.5)
    # a wave breaks just off the beach...
    crash_n = int(1.8 * SR)
    br = bp(noise(1.8), 200, 4000) * adsr(crash_n, 0.12, 1.2, 1.5) + lp(noise(1.8), 180) * decay(crash_n, 0.3)
    put(stereo(br, 0.1, 0.7), 0.45, 0.55)
    # ... its wash fizzes up the sand to your feet
    wn = int((sw1 - sw0 + 1.4) * SR)
    wash = bp(noise(wn / SR), 1200, 7500) * np.concatenate([np.linspace(0, 1, int((sw1 - sw0) * SR)) ** 1.5, np.exp(-np.arange(wn - int((sw1 - sw0) * SR)) / SR / 0.6)])
    put(stereo(wash, 0, 0.6), sw0, 0.42)
    t = sw0 + 0.3
    while t < bw0 + 0.3:
        put(stereo(hp(noise(0.012), 2500) * decay(int(0.012 * SR), 0.002), float(rng.uniform(-0.6, 0.6))), t, 0.25 * float(rng.uniform(0.3, 1)))
        t += float(rng.uniform(0.004, 0.02))
    # the backwash: the water running out, shells and pebbles rattling after it
    bn = int((bw1 - bw0 + 0.8) * SR)
    env = np.interp(np.arange(bn) / SR, [0, 0.35, bw1 - bw0, bw1 - bw0 + 0.8], [0, 1, 0.5, 0])
    put(stereo(bp(noise(bn / SR), 500, 4000) * env, 0, 0.7), bw0, 0.45)
    t = bw0
    while t < bw1 + 0.6:
        dens = float(np.interp(t, [bw0, bw0 + 0.4, bw1, bw1 + 0.6], [0.2, 1, 0.5, 0]))
        put(stereo(bp(noise(0.006), 2500, 7000) * decay(int(0.006 * SR), 0.0012), float(rng.uniform(-0.8, 0.8))), t, 0.4 * float(rng.uniform(0.2, 1)) * dens)
        t += 0.004 + 0.02 * (1 - dens) + float(rng.uniform(0, 0.006))
    # the whole sea being sucked out: a long draining whoosh, falling, with gurgles
    pn = int((p1 - p0 + 1) * SR)
    pt = np.arange(pn) / SR
    suck = vfilter(noise(pn / SR), 1400 * (120 / 1400) ** np.clip(pt / (p1 - p0), 0, 1), "low")
    put(stereo(suck * np.interp(pt, [0, 0.6, 3.0, p1 - p0, p1 - p0 + 1], [0, 1, 0.7, 0.15, 0]), 0, 0.9), p0, 0.7)
    for _ in range(26):
        tg = float(rng.uniform(p0, p0 + 3.2))
        sec = float(rng.uniform(0.08, 0.2))
        put(stereo(np.sin(glide(float(rng.uniform(90, 160)), float(rng.uniform(200, 380)), sec)) * adsr(int(sec * SR), 0.01, 0.05), float(rng.uniform(-0.5, 0.5))), tg, 0.12)
    # ---- wind: a breeze, then the air the wave pushes ahead of it
    wind = lp(noise(E), 420) * (0.6 + 0.4 * np.sin(2 * np.pi * u / 4.3) ** 2) + hp(lp(noise(E), 2500), 600) * 0.3 * smooth(11, 16, u)
    put(stereo(wind * (0.18 + 0.9 * smooth(10, 16, u)), 0, 0.9), 0, 0.3)
    # ---- gulls: calling over the shallows, laughing, then all of them screaming off inland
    for tg, pan, g in ((0.3, -0.4, 0.5), (1.6, 0.5, 0.35), (2.9, -0.2, 0.3), (5.1, 0.3, 0.45), (6.7, -0.5, 0.35), (7.9, 0.2, 0.3)):
        put(stereo(gull_call(), pan, 0.5), tg, g * 0.5)
    put(stereo(gull_laugh(5), 0.35, 0.5), 4.2, 0.22)
    for i in range(14):
        tg = 9.3 + i * 0.09 + float(rng.uniform(0, 0.25))
        put(stereo(gull_call(0.3 + float(rng.uniform(0, 0.15)), 2300, 1500), float(rng.uniform(-0.8, 0.8)), 0.4), tg, 0.2)
    t = 9.4
    while t < 11.6:
        put(stereo(flap(), float(rng.uniform(-0.7, 0.7))), t, 0.25 * float(np.interp(t, [9.4, 10.4, 11.6], [0.3, 1, 0])))
        t += float(rng.uniform(0.04, 0.11))
    # ---- fish flapping about on the sand
    t = 4.6
    while t < cut:
        put(stereo(fish_flop(), float(rng.uniform(-0.8, 0.8))), t, 0.12 * float(rng.uniform(0.4, 1)))
        t += float(rng.uniform(0.25, 0.9))
    # ---- the dread: a low drone, ringing ears and a heartbeat through the zoom
    dn = int((cut - 5.8) * SR)
    dt = np.arange(dn) / SR
    drone = sum(signal.sawtooth(2 * np.pi * midi(nn) * (1 + 0.003 * np.sin(2 * np.pi * 0.3 * dt + nn)) * dt) for nn in (38, 45, 50))
    drone = lp(drone / 3, 520) * np.interp(dt, [0, 2.5, 7.0, cut - 5.8], [0, 0.6, 0.9, 1.0])
    put(stereo(drone, 0, 0.8), 5.8, 0.22)
    ring = np.sin(2 * np.pi * 3900 * t_axis(z1 - z0)) * np.interp(t_axis(z1 - z0), [0, z1 - z0 - 0.4, z1 - z0], [0, 1, 0])
    put(stereo(ring, 0, 0.2), z0, 0.035)
    t = z0
    while t < z1:
        put(stereo(ga.kick(0.3, 70, 38, 0.09)), t, 0.55)
        put(stereo(ga.kick(0.3, 65, 36, 0.08)), t + 0.24, 0.35)
        t += 0.78
    # ---- the white line on the horizon: a far-off boom and a distant horn
    put(stereo(ga.sub_boom(3.0, 60, 30), 0, 0.3), CUES["line"], 0.7)
    put(stereo(braam(2.6, 26, 1.0), 0, 0.6), CUES["line"] + 0.05, 0.18)
    # ---- the rumble and roar, growing till the cut
    rn = int((cut - 9.2) * SR)
    rt = np.arange(rn) / SR
    gk = np.clip(rt / (cut - 9.2), 0, 1)
    rumble = lp(noise(rn / SR), 75) * 2.4 + lp(noise(rn / SR), 170)
    roar = bp(noise(rn / SR), 140, 900) * (0.7 + 0.3 * np.sin(2 * np.pi * 2.3 * rt) * np.sin(2 * np.pi * 0.7 * rt))
    hiss = bp(noise(rn / SR), 1500, 6500) * (0.6 + 0.4 * lp(np.abs(noise(rn / SR)), 6) * 3)
    put(stereo(rumble * gk ** 1.3, 0, 0.6), 9.2, 0.5)
    put(stereo(roar * gk ** 2.2, 0, 0.9), 9.2, 0.75)
    put(stereo(hiss * gk ** 3.0, 0, 0.9), 9.2, 0.42)
    t = 12.0
    while t < cut:
        put(stereo(ga.kick(0.25, 55, 30, 0.07), float(rng.uniform(-0.3, 0.3))), t, 0.25 * float(smooth(12, cut, t)))
        t += float(rng.uniform(0.15, 0.4))
    # ---- people running past you, and you turning round and back
    for tp, pan in CUES["passes"]:
        for kk in range(-5, 6):
            put(stereo(step_sand(), pan * (0.4 + 0.6 * min(1, abs(kk) / 4)), 0.1), tp + kk * 0.31 + float(rng.uniform(-0.02, 0.02)), 0.5 * math.exp(-abs(kk) * 0.4))
        put(stereo(whoosh(0.45, 200, 1400), pan, 0.3), tp - 0.22, 0.35)
    put(stereo(whoosh(0.6, 150, 2500), -0.3, 0.6), CUES["turn"][0], 0.5)
    put(stereo(whoosh(0.5, 150, 3200), 0.3, 0.6), CUES["back"][0], 0.6)
    # ---- the reveal: BRAAAM, then the strings, the choir and the drums climbing to the cut
    rv = CUES["back"][1]
    put(stereo(braam(3.4, 26, 1.0), 0, 0.5), rv - 0.05, 0.55)
    put(stereo(ga.sub_boom(3.0, 70, 28), 0, 0.3), rv - 0.05, 0.6)
    t = rv + 0.4
    step = 60 / 120 / 4
    i = 0
    pattern = [38, 38, 41, 38, 45, 38, 41, 38]
    while t < cut:
        k = smooth(rv, cut, t)
        v = ga.saw_voice(midi(pattern[i % 8] + 12 * (i // 64)), step * 0.9, 9)
        v = lp(v, 900 + 2600 * k) * adsr(len(v), 0.004, 0.03)
        put(stereo(v, -0.3 if i % 2 else 0.3, 0.3), t, 0.1 + 0.22 * k)
        t += step
        i += 1
    put(stereo(choir([62, 65, 69], cut - rv - 0.8, 1.0), 0, 0.7), rv + 0.6, 0.55)
    put(stereo(choir([58, 62, 70], 1.2, 1.0), 0, 0.7), cut - 1.2, 0.35)
    t = 14.0
    while t < cut - 0.05:
        put(stereo(taiko(), 0, 0.3), t, 0.45 + 0.4 * float(smooth(14, cut, t)))
        t += 0.5 if t < 15.4 else 0.25
    riser = vfilter(noise(cut - 14.6), np.geomspace(400, 9000, int((cut - 14.6) * SR)), "low")
    put(stereo(riser * np.linspace(0, 1, len(riser)) ** 2, 0, 0.8), 14.6, 0.35)
    # a little room round it all, then the hard cut to silence
    out = reverb(b[:n], 1.6, 0.12, 7000)[:n]
    out[int(cut * SR) :] = 0
    k = int(0.004 * SR)
    i = int(cut * SR)
    out[i - k : i] *= np.linspace(1, 0, k)[:, None]
    return out


def mix():
    mus = music()
    fx = sfx()
    roll = rolling()
    amb = ambience()
    # the music ducks under the big moments
    ts = np.arange(N + PAD) / SR
    duck = np.ones(N + PAD)
    for t0, depth, length in ((KEY["chomp"], 0.35, 0.8), (KEY["burp"], 0.3, 1.3), (KEY["jackpot"], 0.35, 1.2), (KEY["launch"], 0.5, 0.6)):
        duck *= 1 - depth * np.exp(-np.clip(ts - t0, 0, None) / length) * (ts >= t0)
    mus = mus * duck[:, None]
    mus = reverb(mus, 1.8, 0.16, 7000)[: N + PAD]
    fx = reverb(fx, 1.2, 0.14, 8000)[: N + PAD]
    out = mus * 0.85 + fx * 0.95 + roll * 0.45 + amb
    if os.environ.get("STEMS"):
        # for checking the balance: the music on its own, and everything else
        w = os.path.join(ROOT, "out", "pinball")
        os.makedirs(w, exist_ok=True)
        wavfile.write(os.path.join(w, "stem-music.wav"), SR, (mus[:N] * 0.85 * 0.5).astype(np.float32))
        wavfile.write(os.path.join(w, "stem-rest.wav"), SR, ((fx * 0.95 + roll * 0.45 + amb)[:N] * 0.5).astype(np.float32))
    # the rewind: the six seconds before the jackpot, backwards at six times the speed, on tape
    r0, r1 = M["rewind"]
    src = out[int((KEY["jackpot"] - 6.0) * SR) : int(KEY["jackpot"] * SR)].copy()
    place(out, tape_rewind(r1 - r0, src), r0, 0.6)
    out = out[:N]
    # the hard cut at 70 s: the pinball stops dead and the beach starts
    i0 = int(END0 * SR)
    out[i0:] = 0
    out[i0:] += ending()[: N - i0]
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
