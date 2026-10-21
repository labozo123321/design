"""A soft felt piano and a few quiet companions for gentle scores.

piano(n, held, vel): one note, additive. Each string's partials are slightly stretched (inharmonicity), the
felt hammer rounds off the top (a soft low-pass whose corner rises with the velocity), every partial dies
in two stages (the prompt sound, then the long aftersound), three detuned strings beat slowly against each
other, and the hammer's felt thump and the key's soft knock sit under the attack. When the key is let go
the damper takes the sound in about a fifth of a second (a little longer for low notes).

strings(notes, sec): a slow bowed pad (detuned saws through a soft low-pass, a slow swell).
felt_noise(sec): the mechanism's quiet noises (pedal, felt, the room) for intimacy.
"""

import numpy as np
from scipy import signal

SR = 48000
_RNG = np.random.default_rng(11)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def piano(n, held=1.2, vel=0.6, tail=2.4, seed=0):
    """A felt piano note (mono). held: seconds the key is down; vel 0..1."""
    rng = np.random.default_rng(int(n * 131 + seed * 7 + vel * 1000))
    f0 = midi(n)
    total = held + tail
    t = np.arange(int(total * SR)) / SR
    out = np.zeros_like(t)
    # stretch: low strings a little more inharmonic than high
    B = 0.00012 * (261.6 / f0) ** 0.4 + 0.00004
    # the felt: a soft corner, higher when struck harder
    fc = 700 + 2600 * vel**1.6
    # the note's decay: low notes ring long, high ones short
    tau0 = 7.0 * (261.6 / f0) ** 0.55
    tau0 = min(14.0, max(1.2, tau0))
    # the damper: after the key is up, a fast fade (low strings damp a little slower)
    rel = 0.18 + 0.25 * max(0.0, (60 - n) / 36)
    damp = np.ones_like(t)
    k_up = int(held * SR)
    if k_up < len(t):
        damp[k_up:] = np.exp(-(t[k_up:] - held) / rel)
    for k in range(1, 40):
        fk = k * f0 * np.sqrt(1 + B * k * k)
        if fk > 9000:
            break
        amp = (1.0 / k**1.05) / (1 + (fk / fc) ** 2)
        # the odd dip of partials near the striking point (1/7 of the string): the 7th is quiet
        if k % 7 == 0:
            amp *= 0.25
        if amp < 1e-4:
            continue
        tau = tau0 / (1 + 0.00055 * fk)
        env = 0.68 * np.exp(-t / (tau * 0.22)) + 0.32 * np.exp(-t / tau)
        # three strings, detuned by a cent or so, beating slowly
        for s, cents in enumerate((-0.9, 0.15, 1.1) if n > 40 else (-0.6, 0.6)):
            ph = rng.uniform(0, 2 * np.pi)
            fs = fk * 2 ** (cents / 1200)
            out += amp * env * np.sin(2 * np.pi * fs * t + ph) / (3 if n > 40 else 2)
    # the attack: a short soft rise (felt), not a click
    att = np.minimum(1, t / (0.004 + 0.006 * (1 - vel)))
    out *= att * damp
    # the hammer's thump and the key's knock under it
    nt = int(0.05 * SR)
    th = rng.standard_normal(nt)
    th = signal.lfilter(*signal.butter(2, min(0.9, (180 + 220 * vel) / (SR / 2)), "low"), th)
    th *= np.exp(-np.arange(nt) / (0.012 * SR)) * (0.35 + 0.4 * vel)
    out[:nt] += th * 0.6
    knock = rng.standard_normal(int(0.02 * SR))
    knock = signal.lfilter(*signal.butter(2, [600 / (SR / 2), 2200 / (SR / 2)], "band"), knock) * np.exp(-np.arange(len(knock)) / (0.003 * SR))
    out[: len(knock)] += knock * 0.05
    return out * (0.35 + 0.65 * vel)


def strings(notes, sec, swell=0.4, bright=1800, seed=0):
    """A slow bowed pad, stereo."""
    rng = np.random.default_rng(seed + 5)
    t = np.arange(int(sec * SR)) / SR
    L = np.zeros_like(t)
    R = np.zeros_like(t)
    for n in notes:
        f = midi(n)
        for v in range(4):
            d = (v - 1.5) * 0.004
            vib = 1 + 0.0025 * np.sin(2 * np.pi * (4.8 + v * 0.3) * t + rng.uniform(0, 6))
            ph = np.cumsum(f * (1 + d) * vib) / SR
            saw = 2 * (ph % 1.0) - 1
            pan = (v / 3) * 2 - 1
            L += saw * np.sqrt((1 - pan * 0.6) / 2)
            R += saw * np.sqrt((1 + pan * 0.6) / 2)
    b, a = signal.butter(2, bright / (SR / 2), "low")
    L = signal.lfilter(b, a, L)
    R = signal.lfilter(b, a, R)
    env = np.minimum(1, t / max(0.05, swell * sec)) * np.minimum(1, (sec - t) / max(0.05, 0.35 * sec))
    st = np.stack([L, R], axis=1) * env[:, None]
    return st / (len(notes) * 4)


def felt_noise(sec, seed=0):
    """The room and the instrument's quiet mechanism: a very low, warm hiss."""
    rng = np.random.default_rng(seed + 9)
    x = rng.standard_normal(int(sec * SR))
    x = signal.lfilter(*signal.butter(2, [120 / (SR / 2), 2500 / (SR / 2)], "band"), x)
    return x * 0.004
