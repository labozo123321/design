#!/usr/bin/env python3
"""
Sound for the BlackHole composition (no narration): every sound is synthesised here and timed from
src/blackhole/track.json.

  0-3.5 s    a deep hit and an organ chord under the title
  3.5-29 s   the fall in: organ in A minor, slow and wide; your breathing in the helmet; soft HUD blips;
             the disk's roar swelling as you skim over it
  29-34.3 s  braking: thrusters thunder, alarms, the music climbs to the photon sphere
  34.3-38.5  hovering at the photon sphere: the chord resolves, a high choir
  38.5-50 s  hovering lower: a clock ticking Earth's time, faster and faster until the ticks run into a
             buzz (an hour, a day, years every second); a rising whine of blueshifted light
  50 s       thrusters off: everything cuts out
  53.5 s     the event horizon: nothing happens. One low bell.
  54-61 s    inside: a dark drone, a quickening heartbeat, streams of gas rushing past
  61-66 s    spaghettification: metal groaning, a riser, the alarm, then a tearing roar cut dead
  66.5-70 s  the opening chord again, as the video loops

    python3 scripts/generate-bh-audio.py   # writes public/blackhole/bed.mp3
"""

import importlib.util
import json
import math
import os

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ga", os.path.join(HERE, "generate-audio.py"))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)

SR, midi = ga.SR, ga.midi
lp, hp, bp, adsr, decay, stereo, reverb, place, sat = ga.lp, ga.hp, ga.bp, ga.adsr, ga.decay, ga.stereo, ga.reverb, ga.place, ga.sat
bell, kick, noise, sine, t_axis = ga.bell, ga.kick, ga.noise, ga.sine, ga.t_axis
ROOT = os.path.dirname(HERE)
with open(os.path.join(ROOT, "src", "blackhole", "track.json")) as f:
    TR = json.load(f)
FPS = TR["fps"]
FR = TR["frames"]
DUR = FR / FPS
N = int(DUR * SR)
PAD = SR * 6
EV = TR["events"]
tf = np.arange(FR) / FPS
ts = np.arange(N) / SR
RNG = np.random.default_rng(1977)

# the fact cards' start times (must match src/blackhole/Hud.tsx)
CARDS = [3.9, 9.0, 14.0, 19.1, 34.6, 40.8, 45.2, 48.0, 50.3, 53.8, 57.4, 61.2]


def bus():
    return np.zeros((N + PAD, 2))


def env_curve(points, n=None):
    xs, ys = zip(*points)
    return np.interp(np.arange(n or N) / SR, xs, ys)


def smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


# ------------------------------------------------------------------ instruments


def organ(notes, sec, attack=1.5, release=2.0, bright=1.0):
    """A pipe organ: octave-stacked sines (16', 8', 4', 2', and a quint), a slow swell, a slight tremulant."""
    t = t_axis(sec)
    trem = 1 + 0.025 * np.sin(2 * np.pi * 5.2 * t)
    ranks = [(0.5, 0.35), (1, 1.0), (2, 0.55 * bright), (4, 0.22 * bright), (3, 0.18 * bright)]
    l = np.zeros(len(t))
    r = np.zeros(len(t))
    for i, nn in enumerate(notes):
        f = midi(nn)
        for m, a in ranks:
            ph = RNG.uniform(0, 6.28)
            det = 1 + RNG.uniform(-0.0015, 0.0015)
            v = a * np.sin(2 * np.pi * f * m * det * t + ph)
            pan = -0.6 + 1.2 * ((i * 3 + m) % 5) / 4
            l += v * math.sqrt((1 - pan) / 2)
            r += v * math.sqrt((1 + pan) / 2)
    st = np.stack([l, r], axis=1) * trem[:, None] / (len(notes) * 2.2)
    return st * adsr(len(t), attack, release, 1.4)[:, None]


def choir(notes, sec, attack=1.4):
    out = np.zeros((int(sec * SR), 2))
    for i, nn in enumerate(notes):
        v = ga.saw_voice(midi(nn), sec, 12)
        v = bp(v, 400, 1200) + 0.45 * bp(v, 2300, 3100)
        out += stereo(v * adsr(len(v), attack, min(2.5, sec * 0.5), 1.5), -0.6 + 1.2 * i / max(1, len(notes) - 1), 0.5)
    return out / len(notes)


def organ_note(nn, sec, k=1.0):
    """One short organ note for the arpeggio: bright stops, quick swell, quick release."""
    t = t_axis(sec)
    f = midi(nn)
    v = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) + 0.25 * np.sin(2 * np.pi * 4 * f * t)
    v += 0.15 * np.sin(2 * np.pi * 3 * f * t)
    return v * adsr(len(t), 0.012, sec * 0.55, 1.2) * k


def arpeggio():
    """The pulse of the fall: repeating organ eighths over the chords, building into the brake."""
    b = bus()
    pats = [
        (3.9, 13.0, [57, 64, 69, 64, 60, 64, 69, 72]),  # A minor
        (13.0, 20.0, [53, 60, 65, 60, 57, 60, 65, 69]),  # F
        (20.0, 28.6, [55, 62, 67, 62, 59, 62, 67, 71]),  # G
        (28.6, EV["hover"], [52, 59, 64, 59, 56, 59, 64, 68]),  # E
    ]
    for t0, t1, pat in pats:
        t = t0
        k = 0
        while t < t1 - 0.05:
            step = 0.25 if t < 24 else (0.1875 if t < EV["brake"] else 0.125)
            g = 0.18 + 0.32 * smooth(3.9, EV["brake"], t)
            nn = pat[k % len(pat)] + (12 if (t > 24 and k % 16 >= 8) else 0)
            place(b, stereo(organ_note(nn, min(0.5, step * 1.8)), -0.35 + 0.7 * ((k * 5) % 8) / 7, 0.3), t, g)
            t += step
            k += 1
    return b


def hit(sec=4.0, f0=62, f1=27):
    return ga.sub_boom(sec, f0, f1)


def breath(sec, inhale=True, k=1.0):
    """Breathing inside the helmet: filtered air, close and a little muffled."""
    n = int(sec * SR)
    x = bp(noise(sec), 300 if inhale else 220, 2400 if inhale else 1500)
    x = x + 0.3 * lp(noise(sec), 400)
    shape = np.sin(np.linspace(0, np.pi, n)) ** (1.0 if inhale else 1.6)
    if not inhale:
        shape *= np.linspace(1.0, 0.6, n)
    return x * shape * k


def heartbeat(k=1.0):
    sec = 0.6
    n = int(sec * SR)
    a = lp(kick(0.3, 64, 34, 0.09), 160)
    x = np.zeros(n)
    x[: len(a)] += a
    st = int(0.17 * SR)
    x[st : st + len(a)] += a[: n - st] * 0.6
    return x * k


def blip(f=1900, sec=0.05):
    n = int(sec * SR)
    return np.sin(2 * np.pi * f * t_axis(sec)) * adsr(n, 0.002, 0.02)


def tick():
    """A clock's tick: a tiny woody click."""
    sec = 0.03
    n = int(sec * SR)
    return (bp(noise(sec), 2200, 7000) * 0.8 + np.sin(2 * np.pi * 1300 * t_axis(sec)) * 0.5) * decay(n, 0.004)


def creak(f, sec):
    """Metal under strain: a resonance rubbed by grainy noise."""
    n = int(sec * SR)
    grains = (RNG.random(n) < 0.004) * RNG.uniform(-1, 1, n)
    grains = lp(grains, 3000)
    tt = t_axis(sec)
    fm = f * (1 + 0.04 * np.sin(2 * np.pi * 3 * tt) + 0.08 * tt / sec)
    ring = signal.lfilter([1], [1, -1.97 * np.cos(2 * np.pi * fm.mean() / SR), 0.985], grains)
    return ring / (np.max(np.abs(ring)) + 1e-9) * np.sin(np.linspace(0, np.pi, n)) ** 0.7


def whoosh(sec=0.6, lo=250, hi=3500):
    n = int(sec * SR)
    return ga.sweep(noise(sec), lo, hi, "band", 0.6) * np.sin(np.linspace(0, np.pi, n)) ** 1.8


# ------------------------------------------------------------------ layers


def music():
    m = bus()
    # chords (MIDI): A minor, F, G, E (the braking), A minor (photon sphere)
    Am = [33, 45, 52, 57, 60, 64]
    F = [29, 41, 48, 53, 57, 60]
    G = [31, 43, 50, 55, 59, 62]
    E = [28, 40, 47, 52, 56, 59]
    place(m, organ(Am, 14.6, 0.04, 2.0), 0.0, 0.9)
    place(m, organ(F, 8.0, 1.6, 2.0), 13.0, 0.9)
    place(m, organ(G, 9.0, 1.6, 1.8), 20.0, 0.95)
    place(m, organ(E, 6.4, 1.2, 1.0, bright=1.3), 28.6, 1.15)
    place(m, organ(Am, 5.6, 0.25, 2.2, bright=1.2), EV["hover"], 1.2)
    place(m, choir([69, 72, 76, 81], 5.0, 0.6), EV["hover"] + 0.1, 0.5)
    # hovering lower: a pedal on A with the top creeping up a semitone at a time
    tops = [64, 65, 66, 67, 68, 69, 70]
    for i, top in enumerate(tops):
        t0 = EV["descend"] + i * 1.65
        place(m, organ([33, 45, top - 12, top], 2.6, 0.5, 1.0, bright=0.8), t0, 0.75 + 0.05 * i)
    # the horizon: one low bell over a dark pedal; then inside, D minor with a flat sixth, swelling
    place(m, stereo(bell(midi(33), 6.0), 0, 0.6), EV["horizon"], 0.55)
    place(m, organ([26, 38, 45, 46, 53], 13.0, 2.0, 0.6, bright=0.6), EV["horizon"] + 0.3, 0.8)
    # the loop: the opening chord rising back to where the video starts
    place(m, organ(Am, 4.0, 2.4, 0.01), EV["end"] + 0.5, 0.9)
    # hits: the title, the brake, the photon sphere
    place(m, stereo(hit(5.0), 0, 0.2), 0.0, 0.95)
    place(m, stereo(hit(3.5, 70, 30), 0, 0.2), EV["brake"], 0.8)
    place(m, stereo(hit(4.5, 58, 26), 0, 0.3), EV["hover"], 0.75)
    # a slow pulse under the approach (felt more than heard), quickening into the brake
    t = 4.0
    while t < EV["brake"]:
        place(m, stereo(lp(kick(0.5, 55, 34, 0.2), 140), 0, 0), t, 0.32 + 0.25 * smooth(15, 29, t))
        t += 1.0 if t < 20 else 0.75
    while t < EV["hover"]:
        place(m, stereo(lp(kick(0.5, 60, 34, 0.15), 160), 0, 0), t, 0.6)
        t += 0.5
    return m


def thrusters():
    """Thrust: a roar while braking, a steadier rumble while hovering (rising with the thrust), cut at 50 s."""
    x = lp(noise(DUR), 180) * 1.4 + bp(noise(DUR), 500, 2600) * 0.35
    throb = 1 + 0.35 * np.sin(2 * np.pi * 7.5 * ts) * np.sin(2 * np.pi * 0.31 * ts)
    hum = lp(signal.sawtooth(2 * np.pi * (41 + 8 * smooth(EV["descend"], EV["release"], ts)) * ts), 300) * 0.35
    thrust = np.array(TR["thrust"])
    lt = np.log10(np.maximum(thrust, 1.0))
    lev = np.interp(ts, tf, np.clip((lt - 4.0) / 10.0, 0, 1))
    g = env_curve([(0, 0), (EV["brake"] - 0.1, 0), (EV["brake"] + 0.25, 1.0), (EV["hover"] - 0.2, 1.0),
                   (EV["hover"] + 1.0, 0.42), (EV["release"] - 0.02, 0.42), (EV["release"] + 0.05, 0), (DUR, 0)])
    g = g * (0.75 + 0.5 * lev)
    out = (x * throb + hum) * g
    st = stereo(out, 0, 0.6)
    b = bus()
    b[:N] += st
    # power-down: the hum falls away as the thrusters cut
    sec = 0.9
    tt = t_axis(sec)
    f = 120 * np.exp(-tt / 0.25) + 25
    pd = np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(len(tt), 0.3) * 0.6
    place(b, stereo(pd, 0, 0.3), EV["release"], 0.9)
    return b


def disk_roar():
    """The disk's roar as you skim over it."""
    x = bp(noise(DUR), 70, 700) * 0.8 + bp(noise(DUR), 900, 3000) * 0.15
    wob = 1 + 0.3 * np.sin(2 * np.pi * 0.21 * ts + 1) + 0.2 * np.sin(2 * np.pi * 0.47 * ts)
    g = env_curve([(0, 0.05), (12, 0.12), (20, 0.35), (25, 0.7), (29, 0.85), (33, 0.5), (37, 0.15), (40, 0.0), (DUR, 0)])
    b = bus()
    b[:N] += stereo(x * wob * g, 0, 0.8)
    return b


def time_ticks():
    """Earth's clock, ticking at a rate set by how fast its time runs compared with yours: from about one
    tick a second at the photon sphere to a buzz at a micrometre (years go by every second)."""
    earth = np.array(TR["earth"])
    rate_f = np.gradient(earth) * FPS  # Earth seconds per second of the video
    on = (tf >= EV["hover"] + 0.5) & (tf < EV["release"])
    rate = np.interp(ts, tf, np.where(on, rate_f, 0.0))
    fr = np.where(rate > 0, 1.15 * np.maximum(rate / 1.7, 1.0) ** 0.27, 0.0)
    ph = np.cumsum(fr) / SR
    b = bus()
    tk = tick()
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    for k, i in enumerate(idx):
        sec = i / SR
        # alternate tick / tock, and fade the clicks as they run into a tone
        f = fr[i]
        g = 0.55 * (1.0 if k % 2 == 0 else 0.75) * (1 - 0.6 * smooth(30, 90, f))
        place(b, stereo(tk, 0.15 if k % 2 else -0.15, 0), sec, g)
    # the buzz they become
    buzz = signal.sawtooth(2 * np.pi * ph) * smooth(25, 70, fr) * 0.12
    b[:N] += stereo(lp(buzz, 1800), 0, 0.3)
    # the ticking stops dead when the thrusters cut
    cut = env_curve([(0, 1), (EV["release"] - 0.01, 1), (EV["release"] + 0.03, 0), (DUR, 0)], N + PAD)
    return b * cut[:, None]


def blueshift_whine():
    """The light of the whole universe squeezed into X-rays: a thin rising whine while you hover low."""
    f = 1800 * 2 ** (2.2 * smooth(EV["descend"] + 2, EV["release"], ts))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.4 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    g = env_curve([(0, 0), (41.0, 0), (45.0, 0.05), (49.5, 0.09), (EV["release"] + 0.3, 0.06), (EV["horizon"], 0.0), (DUR, 0)])
    b = bus()
    b[:N] += stereo(x * g, 0, 0.7)
    return b


def breathing():
    """Your breathing: calm on the way in, fast braking, held when the thrusters cut, ragged at the end."""
    b = bus()
    t = 3.2
    while t < DUR - 4:
        if t < EV["brake"]:
            period, k = 4.6, 0.32
        elif t < EV["hover"]:
            period, k = 2.1, 0.45
        elif t < EV["release"]:
            period, k = 3.3, 0.33
        elif t < EV["horizon"] + 0.8:
            # a sharp breath in when the thrusters go, then held
            if t < EV["release"] + 0.1:
                t = EV["release"] + 0.15
                place(b, stereo(breath(0.55, True, 1.3), 0, 0.1), t, 0.5)
            t = EV["horizon"] + 0.8
            continue
        elif t < 61.0:
            period, k = 3.6, 0.36
        elif t < EV["end"] - 0.3:
            period, k = 1.25, 0.5
        else:
            break
        ins = min(1.4, period * 0.32)
        place(b, stereo(breath(ins, True, k), 0, 0.1), t, 1.0)
        place(b, stereo(breath(min(1.9, period * 0.42), False, k), 0, 0.1), t + ins + 0.15, 0.85)
        t += period
    return b


def heart():
    b = bus()
    t = EV["descend"]
    while t < EV["end"] - 0.2:
        if t < EV["release"]:
            bpm = 68 + 22 * smooth(EV["descend"], EV["release"], t)
            k = 0.35
        elif t < EV["horizon"]:
            bpm = 100
            k = 0.45
        else:
            bpm = 80 + 80 * smooth(EV["horizon"], EV["end"], t) ** 1.5
            k = 0.45 + 0.35 * smooth(EV["horizon"], EV["end"], t)
        place(b, stereo(heartbeat(k), 0, 0), t, 1.0)
        t += 60.0 / bpm
    return b


def hud():
    """Blips when a card comes up; alarms for the brake, the thrusters going off, and the tides."""
    b = bus()
    for t in CARDS:
        place(b, stereo(blip(1800) * 0.5, 0.3, 0), t, 0.5)
        place(b, stereo(blip(2400) * 0.5, 0.3, 0), t + 0.07, 0.5)
    for i in range(3):
        place(b, stereo(blip(980, 0.12), -0.2, 0), EV["brake"] + 0.15 + i * 0.22, 0.45)
    for i, f in enumerate((1200, 900, 600)):
        place(b, stereo(blip(f, 0.14), 0, 0), EV["release"] + 0.1 + i * 0.18, 0.5)
    for i, f in enumerate((700, 700)):
        place(b, stereo(blip(f, 0.2), 0, 0), EV["horizon"] + 0.05 + i * 0.35, 0.3)
    t = 61.0
    while t < EV["end"] - 0.2:
        place(b, stereo(blip(1400, 0.09), -0.3, 0), t, 0.35)
        place(b, stereo(blip(1050, 0.09), -0.3, 0), t + 0.11, 0.35)
        t += 0.55 - 0.25 * smooth(61, 66, t)
    return b


def inside():
    """Inside the horizon: a low drone with slow beats, streams of gas whooshing past, then the stretch."""
    b = bus()
    t0 = EV["horizon"]
    sec = EV["end"] - t0
    tt = t_axis(sec)
    drone = (np.sin(2 * np.pi * 36.7 * tt) + 0.7 * np.sin(2 * np.pi * 38.9 * tt) + 0.3 * np.sin(2 * np.pi * 73.4 * tt))
    drone *= smooth(0, 2.5, tt) * (0.25 + 0.5 * smooth(0, sec, tt))
    place(b, stereo(sat(drone * 0.9, 1.4), 0, 0.5), t0, 0.5)
    # gas streaming past, ever faster
    t = t0 + 1.5
    while t < EV["end"] - 0.4:
        k = smooth(t0, EV["end"], t)
        w = whoosh(0.5 + 0.5 * RNG.random(), 200 + 300 * k, 1800 + 3500 * k)
        place(b, stereo(w, RNG.uniform(-0.8, 0.8), 0.4), t, 0.12 + 0.3 * k)
        t += 1.3 - 0.9 * k + 0.3 * RNG.random()
    # spaghettification: a riser that climbs out of hearing, and metal groaning
    s0 = 61.0
    rs = EV["end"] - s0
    tr = t_axis(rs)
    f = 55 * 2 ** (3.5 * (tr / rs) ** 1.8)
    riser = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * signal.sawtooth(2 * np.pi * np.cumsum(f * 0.5) / SR)
    riser = sat(lp(riser, 2500) * smooth(0, rs, tr) ** 1.4, 2.0)
    place(b, stereo(riser, 0, 0.6), s0, 0.35)
    t = 61.6
    while t < EV["end"] - 0.3:
        place(b, stereo(creak(RNG.uniform(180, 700), RNG.uniform(0.5, 1.2)), RNG.uniform(-0.7, 0.7), 0.3), t, 0.18 + 0.3 * smooth(61, 66, t))
        t += RNG.uniform(0.35, 0.8)
    # the tear: a roar that rips up to white noise, cut dead at the end
    tsec = EV["end"] - 65.1
    tn = t_axis(tsec)
    tear = (hp(noise(tsec), 300) * 0.8 + lp(noise(tsec), 250) * 0.6) * smooth(0, tsec, tn) ** 2
    tear = sat(tear * 2.0, 2.5)
    place(b, stereo(tear, 0, 0.8), 65.1, 0.75)
    return b


def mix():
    mus = reverb(music() + arpeggio() * 0.8, 3.6, 0.35, 6000)[: N + PAD]
    sfx = thrusters() * 0.55 + disk_roar() * 0.35 + inside() * 0.9
    sfx = reverb(sfx, 1.6, 0.18, 7000)[: N + PAD]
    tic = reverb(time_ticks(), 1.2, 0.22, 8000)[: N + PAD]
    close = breathing() * 0.55 + heart() * 0.9 + hud() * 0.8
    out = mus * 0.85 + sfx + tic * 0.9 + blueshift_whine() * 0.6 + close
    out = out[:N]
    # thrusters off: the music drops away with them; dead silence for half a second after the tear
    g = env_curve([(0, 1), (EV["release"] - 0.05, 1), (EV["release"] + 0.3, 0.35), (EV["horizon"], 0.55),
                   (EV["end"] - 0.02, 1), (EV["end"] + 0.01, 0), (EV["end"] + 0.5, 0), (EV["end"] + 0.52, 1), (DUR, 1)])
    out *= g[:, None]
    # a few ms of fade at the very start and end (the end flows straight back into the start)
    k = int(0.01 * SR)
    out[:k] *= np.linspace(0, 1, k)[:, None]
    out[-k:] *= np.linspace(1, 0, k)[:, None]
    return out


if __name__ == "__main__":
    out = mix()
    path = os.path.join(ROOT, "public", "blackhole", "bed.mp3")
    ga.write_mp3(path, out, 0.89)
    print("black hole bed written", round(len(out) / SR, 2), "s")
