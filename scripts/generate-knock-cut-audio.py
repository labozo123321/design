#!/usr/bin/env python3
"""
The simple cut's soundtrack (src/knock/cut.ts): the long film's house sounds, moved onto the cut's slower
timeline, under a new, slower score.

    python3 scripts/generate-knock-cut-audio.py      # out/knock/cut_bed.wav (48 kHz 24-bit)

How the house sounds move: every sound the long film's generator places on one of its buses is re-placed
through the cut's edit (four nights, each played slower). A short sound (a knock, a step, a rustle, a tick)
keeps its own length and lands at the moment its picture now shows; a long one (rain, the room, the
furnace, thunder) is cut to the nights it covers and stretched to their new length (grains of it, laid
end to end, so its pitch and grain stay its own). Sounds from moments the cut leaves out are dropped. The
long film's time-keyed steps follow the edit too: each night keeps its own room, the weather and the music
still step back under every knock (at the knocks' new times), and the inside-the-wall and earplug passes
are left out (the cut has neither). The sound dips to silence through the black between nights.
"""
import importlib.util
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
_spec = importlib.util.spec_from_file_location("knockaudio", os.path.join(HERE, "generate-knock-audio.py"))
g = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(g)

SR = g.SR
CUT_DUR = 70.0
OUT_WAV = os.path.join(ROOT, "out", "knock", "cut_bed.wav")

# (cut start, cut end, knots (cut second, film second)): as src/knock/cut.ts SEGS
SEGS = [
    (0.0, 12.0, [(0.0, 0.0), (4.4, 3.5), (10.6, 7.0), (12.0, 7.95)]),
    (12.0, 27.5, [(12.0, 15.0), (15.9, 17.4), (18.9, 18.6), (23.57, 20.7), (27.5, 22.4)]),
    (27.5, 39.5, [(27.5, 28.07), (28.83, 29.0), (34.7, 33.4), (38.7, 35.4), (39.5, 35.9)]),
    (39.5, 64.5, [(39.5, 49.07), (41.64, 51.0), (45.74, 54.9), (46.97, 55.7), (50.22, 58.3), (51.55, 59.1),
                  (54.96, 62.0), (57.2, 62.85), (61.28, 65.3), (63.74, 66.9), (64.5, 67.45)]),
    (64.5, 70.0, [(64.5, 67.45), (70.0, 72.95)]),
]
BOUNDS = [12.0, 27.5, 39.5]


def _slopes(k):
    """Monotone cubic (Fritsch-Carlson) slopes at the knots (as cut.ts)."""
    n = len(k)
    h = [k[i + 1][0] - k[i][0] for i in range(n - 1)]
    d = [(k[i + 1][1] - k[i][1]) / h[i] for i in range(n - 1)]
    if n == 2:
        return [d[0], d[0]]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            continue
        w1 = 2 * h[i] + h[i - 1]
        w2 = h[i] + 2 * h[i - 1]
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def end(h0, h1, d0, d1):
        e = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
        if np.sign(e) != np.sign(d0):
            e = 0.0
        elif np.sign(d0) != np.sign(d1) and abs(e) > abs(3 * d0):
            e = 3 * d0
        return e

    m[0] = end(h[0], h[1], d[0], d[1])
    m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3])
    return m


SLOPES = [_slopes(k) for _, _, k in SEGS]


def warp(si, o):
    """The film second shown at the cut's second o, within night si (o may be an array)."""
    k = SEGS[si][2]
    m = SLOPES[si]
    x = np.clip(np.asarray(o, float), k[0][0], k[-1][0])
    xs = np.array([q[0] for q in k])
    i = np.clip(np.searchsorted(xs, x, side="right") - 1, 0, len(k) - 2)
    x0, x1 = xs[i], xs[i + 1]
    y0 = np.array([q[1] for q in k])[i]
    y1 = np.array([q[1] for q in k])[i + 1]
    m0, m1 = np.array(m)[i], np.array(m)[i + 1]
    hh = x1 - x0
    u = (x - x0) / hh
    u2, u3 = u * u, u * u * u
    return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * hh * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * hh * m1


def out_in(si, t):
    """The cut's second at which night si shows the film's moment t (t within its stretch)."""
    o0, o1, k = SEGS[si]
    a, b = o0, o1
    for _ in range(48):
        c = (a + b) / 2
        if float(warp(si, c)) < t:
            a = c
        else:
            b = c
    return (a + b) / 2


def out_at(t):
    """The cut's second for a moment of the long film (None if the cut leaves it out)."""
    for si, (o0, o1, k) in enumerate(SEGS):
        if k[0][1] <= t < k[-1][1]:
            return out_in(si, t)
    return None


def stretch_map(x, idx, seed=0):
    """x laid along a new timeline without changing its pitch: idx gives, for every output sample, the input
    sample it should show; overlapping grains (85 ms, Hann), each read from a slightly jittered place, laid
    four to a grain length (for noise beds this is seamless)."""
    x = np.asarray(x, float)
    st = x.ndim == 2
    if not st:
        x = x[:, None]
    n_out = len(idx)
    win = 4096
    hop = win // 4
    if len(x) < win + 2:
        y = x[np.clip(np.asarray(idx, int), 0, len(x) - 1)]
        return y if st else y[:, 0]
    out = np.zeros((n_out + win, x.shape[1]))
    norm = np.zeros(n_out + win)
    w = np.hanning(win)
    r = np.random.default_rng(seed)
    pos_out = 0
    while pos_out < n_out:
        c = idx[pos_out] - win // 2
        j = int(np.clip(c + r.uniform(-hop / 2, hop / 2), 0, len(x) - win))
        out[pos_out : pos_out + win] += x[j : j + win] * w[:, None]
        norm[pos_out : pos_out + win] += w
        pos_out += hop
    out = out[:n_out] / np.maximum(norm[:n_out], 1e-3)[:, None]
    return out if st else out[:, 0]


_place = g.place
REMAP = [False]
_n_long = [0]


def place_cut(b, x, t, gain=1.0, pan=0.0):
    """g.place, through the edit, for the house's own buses while the house is being built."""
    if not REMAP[0] or id(b) not in g._BUSNAME:
        return _place(b, x, t, gain, pan)
    x = np.asarray(x, float)
    L = len(x) / SR
    if L <= 1.5:
        o = out_at(float(t))
        if o is not None:
            _place(b, x, o, gain, pan)
        return
    for si, (o0, o1, k) in enumerate(SEGS):
        s0, s1 = k[0][1], k[-1][1]
        a, e = max(float(t), s0), min(float(t) + L, s1)
        if e - a < 0.02:
            continue
        oa = o0 if a <= s0 else out_in(si, a)
        oe = o1 if e >= s1 else out_in(si, e)
        n_out = int((oe - oa) * SR)
        if n_out < 8:
            continue
        # (each output sample shows the film moment the picture shows then)
        src = warp(si, oa + np.arange(n_out) / SR)
        idx = np.clip(((src - float(t)) * SR).astype(int), 0, len(x) - 1)
        _n_long[0] += 1
        _place(b, stretch_map(x, idx, seed=_n_long[0]), oa, gain, pan)


def dip(n):
    """The sound's own fade through black: in at the start, down to nothing and back up around each change
    of night, out at the end (as the picture's blackAt)."""
    t = np.arange(n) / SR
    k = 1 - g.smooth(0.0, 0.8, t)
    for b in BOUNDS:
        k = np.maximum(k, g.smooth(b - 0.7, b - 0.05, t) * (1 - g.smooth(b + 0.05, b + 0.8, t)))
    k = np.maximum(k, g.smooth(69.2, 69.95, t))
    return 1 - k


# ============================================================================================ the score

def score_cut():
    """A slower, simpler score in the cut's own seconds (its moments found through the edit): the felt piano
    and its D-major world, the music box's three notes (the knock's motif, F#-E-D) after each answered knock,
    silence while you wait in 2025, the open D chord on her third knock, the low strings under your walk to
    her room."""
    M = g.Music()
    O = out_at
    piano, chord, pedal, mbox, celesta, pad = g.piano, g.chord, g.pedal, g.mbox, g.celesta, g.pad
    # ---- 2004, 0-12.0: Dmaj9 unfolding slowly; Gmaj7 as the hall light goes off; nothing on her knocks
    # (5.2-6.2) or yours (8.7-9.8); the music box answers after them; an open D into the black
    pedal(M, 0.0)
    piano(M, 0.35, 38, 0.26, 4.6)
    piano(M, 0.37, 45, 0.21, 4.5)
    piano(M, 1.6, 66, 0.24, 2.2)
    piano(M, 2.5, 57, 0.19, 1.1)
    hall_off = O(3.0)
    pedal(M, hall_off - 0.07, down=False)
    pedal(M, hall_off - 0.04)
    chord(M, hall_off, [43, 50, 59, 66], 0.24, 1.4, 0.07)
    piano(M, O(4.75) + 0.25, 66, 0.2, 1.0)
    for k, m in enumerate((78, 76, 74)):
        mbox(M, O(6.75) + 0.1 + 0.4 * k, m, 0.46)
    pedal(M, 11.26, down=False)
    pedal(M, 11.28)
    chord(M, 11.3, [50, 57, 62, 66], 0.2, 0.8, 0.03)
    M.fade(11.35, 11.95)
    # ---- 2009, 12.0-27.5: Bm(add9) and G low under the rain, never on the eleven knocks (13.4-15.5); the
    # celesta's motif as she lies down and the dog flops
    pedal(M, 12.45)
    chord(M, 12.45, [35, 42, 50, 61], 0.27, 0.9, 0.07, gain=0.7)
    pedal(M, O(17.4) + 0.2)
    chord(M, O(17.4) + 0.2, [31, 38, 47, 57], 0.25, 2.4, 0.07, gain=0.7)
    pedal(M, O(19.1))
    chord(M, O(19.1), [35, 42, 50, 61], 0.24, 2.2, 0.07, gain=0.7)
    pedal(M, O(20.3))
    chord(M, O(20.3), [31, 38, 47, 54], 0.24, 2.4, 0.07, gain=0.7)
    for k, m in enumerate((66, 64, 62)):
        celesta(M, O(21.65) - 0.1 + 0.42 * k, m, 0.42, pan=-0.1)
    M.fade(26.85, 27.45)
    # ---- 2013, 27.5-39.5: piano alone, sparse; nothing under her knocks (29.1-29.8, 33.2-34.1) or your
    # answer (35.8-37.1); then the motif, slowly
    pedal(M, 28.0)
    chord(M, 28.0, [47, 54, 62], 0.22, 0.9, 0.09, gain=0.8)
    piano(M, 31.0, 38, 0.12, 2.0, gain=0.4)
    chord(M, O(33.6), [43, 59, 64], 0.18, 0.9, 0.1, gain=0.75)
    m0 = O(34.6) + 0.45
    pedal(M, m0 - 0.05)
    piano(M, m0, 66, 0.27, 0.42, gain=0.85)
    piano(M, m0 + 0.45, 64, 0.25, 0.42, gain=0.85)
    piano(M, m0 + 0.9, 62, 0.24, 0.6, gain=0.85)
    chord(M, m0 + 0.9, [50, 57], 0.16, 0.6, 0.02, gain=0.85)
    M.fade(38.85, 39.45)
    # ---- 2025, 39.5-64.5: a warm pad that thins away (no D in it) to silence before your knock; the wait
    # in silence; her third knock lands on the open D chord, the music box completes the motif; the low
    # strings and the D-A-F# ostinato under her laughing knocks and your walk to her room
    y_knock = O(54.9)
    pad(M, 39.6, 42.8, [52, 55, 59, 66], 0.8)
    pad(M, 39.6, 42.8, [40], 0.45)
    pad(M, 41.8, 43.6, [57], 0.75, rel=1.0)
    pad(M, 41.8, 43.9, [61], 0.75, rel=1.0)
    pad(M, 41.8, 44.2, [64], 0.85, rel=1.4)
    piano(M, 41.0, 66, 0.18, 0.6, distant=True)
    piano(M, 41.55, 64, 0.16, 1.2, distant=True)
    M.fade(y_knock - 1.0, y_knock - 0.7)
    third = O(59.0)
    pedal(M, third - 0.02)
    chord(M, third, [38, 45, 54, 57, 62], 0.48, 2.8, 0.004, gain=0.7)
    for k, m in enumerate((78, 76, 74)):
        mbox(M, third + 0.55 + 0.45 * k, m, 0.4)
    up, door, there, down = O(62.17), O(64.1), O(65.35), O(66.2)
    strings_cut(M, O(60.41), up, door, there, down)
    pat = [62, 69, 66]
    e8 = 0.6
    for k in range(11):
        tk = up + k * e8
        piano(M, tk, pat[k % 3], 0.24 + 0.08 * float(g.smooth(up, up + 2.8, tk)) - 0.06 * float(g.smooth(up + 3.6, up + 6.0, tk)), 0.7)
    pedal(M, up)
    piano(M, up, 47, 0.24, 2.0)
    pedal(M, door - 0.02, down=False)
    pedal(M, door)
    piano(M, door, 43, 0.28, 1.6)
    piano(M, there, 45, 0.26, 1.1)
    pedal(M, down - 0.02, down=False)
    pedal(M, down)
    chord(M, down, [38, 45], 0.28, 2.0, 0.02)
    chord(M, O(66.6), [73, 76], 0.18, 1.0, 0.05)
    # ---- the end card, 64.5-70: the motif once more, slowly (clear of her three goodnight knocks at
    # 67.45-68.05); a last soft Dmaj9 gone into the black
    pedal(M, 65.05)
    piano(M, 65.1, 66, 0.26, 0.6)
    piano(M, 65.75, 64, 0.24, 0.6)
    piano(M, 66.4, 62, 0.23, 0.7)
    chord(M, 66.4, [50, 57], 0.15, 0.7, 0.02)
    pedal(M, 68.35)
    chord(M, 68.4, [38, 50, 57, 61, 64, 66], 0.2, 1.2, 0.014)
    M.fade(69.2, 69.95)
    return M


def strings_cut(M, t0, up, door, there, down):
    """From her laugh (t0): the low strings swelling from pp under her laughing knocks, cresting as you
    reach her door, home to D as you lie down, released into the end card."""

    def dyn(T):
        rise = g.smooth(t0, door, T)
        fall = g.smooth(door + 0.1, down + 0.4, T)
        d = 0.1 + 0.5 * rise - 0.24 * fall
        return d * (1 - g.smooth(64.9, 66.5, T))

    lines = {
        "bass": ("bass", [(t0, 38), (up, 35), (door, 31), (there, 33), (down, 38)], 0.4, 8.0),
        "cello1": ("cello", [(t0, 45), (up, 45), (door, 47), (there, 49), (down, 45)], 0.2, 14.0),
        "cello2": ("cello", [(t0 + 0.4, 54), (up, 54), (door, 55), (there, 55), (down, 54)], 0.05, 15.0),
        "viola": ("viola", [(t0 + 1.0, 62), (door - 0.5, 66), (door, 67), (there, 64), (down, 64)], -0.3, 16.0),
    }
    for i, (key, (part, notes, pan, vc)) in enumerate(lines.items()):
        y = g.string_line(notes, 66.5, part, dyn, seed=i, vib_cents=vc)
        gg = {"bass": 1.1, "cello1": 1.0, "cello2": 0.9, "viola": 0.85}[key] * 0.7
        M.add(y * gg, notes[0][0], pan=pan, send=0.42, name="strings", note=notes[0][1])
        for tc, m in notes[1:]:
            M.onsets.append((tc, "strings", m))


# ============================================================================================ building it

def build():
    # the cut's length for every bus, its rooms, no macro or earplug passes
    g.DUR = CUT_DUR
    g.N = int(round(CUT_DUR * SR))
    g.ROOM_PLAN = [
        (0.0, 12.0, "empty04", 0.34, 0.1),
        (12.0, 27.5, "bedroom", 0.2, 0.06),
        (27.5, 39.5, "stripped", 0.26, 0.06),
        (39.5, CUT_DUR + 0.5, "bedroom", 0.22, 0.4),
    ]
    g.MUSIC_VERB_PLAN = [(0.0, 12.0, 0.12), (12.0, 27.5, 0.06), (27.5, 39.5, 0.0), (39.5, CUT_DUR + 0.5, 0.0)]
    g.MUSIC_GATES = [(69.2, 69.95, 99.0, 99.0)]
    g.macro_mask = lambda n: np.zeros(n)
    g.cavity_tone = lambda n: np.zeros((n, 2))
    g.earplugs = lambda x: x
    print("score ...")
    M = score_cut()
    mus = g.music_render(M)
    print("house (through the edit) ...")
    g.place = place_cut
    REMAP[0] = True
    film_knocks = g.KNOCKS
    B = g.diegetic()
    REMAP[0] = False
    g.place = _place
    B.C[:] = 0  # (the macros' own close sounds: the cut has no macro)
    print(f"  {_n_long[0]} long sounds stretched")
    # the knocks the cut keeps, at their new times (the weather and the music duck under them)
    cut_knocks = []
    for k in film_knocks:
        o = out_at(k["t"])
        if o is not None:
            cut_knocks.append({**k, "t": o})
    g.KNOCKS = cut_knocks
    die, ui = g.diegetic_render(B)
    d = dip(len(die))[:, None]
    die = die * d
    ui = ui * d
    extra = np.zeros_like(die)
    print("mix ...")
    mix, mg, G = g.master(die, ui, mus, extra, True)
    return dict(M=M, B=B, mus=mus, die=die, mix=mix, mg=mg, G=G, knocks=cut_knocks)


if __name__ == "__main__":
    R = build()
    g.write_wav24(OUT_WAV, R["mix"])
    print(f"wrote {OUT_WAV} ({len(R['mix']) / SR:.3f} s)")
    print(f"  own meter: {g.integrated(R['mix']):.2f} LUFS integrated, {g.true_peak_db(R['mix']):.2f} dBTP")
    L = g.ffmpeg_loudness(OUT_WAV)
    print(f"  ffmpeg ebur128: I {L.get('I')} LUFS, LRA {L.get('LRA')} LU, true peak {L.get('Peak')} dBTP")
    # music attacks landing on a kept knock (the 53.2 chord is meant to)
    bad = []
    for t, name, note in R["M"].onsets:
        if name in ("pedal", "strings", "pad", "sweep"):
            continue
        for k in R["knocks"]:
            if -0.03 < t - k["t"] < 0.15 and abs(k["t"] - out_at(59.0)) > 0.05:
                bad.append((round(t, 3), name, note, round(k["t"], 3)))
    print(f"  note attacks on a knock: {len(bad)} {bad[:10]}")
    print(f"  knocks kept: {len(R['knocks'])}: {[round(k['t'], 2) for k in R['knocks']]}")
