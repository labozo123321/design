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

# (cut start, cut end, film start, film end): as src/knock/cut.ts SEGS
SEGS = [
    (0.0, 13.5, 0.0, 7.95),
    (13.5, 27.0, 15.0, 22.4),
    (27.0, 40.5, 28.07, 35.9),
    (40.5, 64.0, 49.07, 67.45),
    (64.0, 70.0, 67.45, 73.45),
]
BOUNDS = [13.5, 27.0, 40.5]


def out_at(t):
    """The cut's second for a moment of the long film (None if the cut leaves it out)."""
    for o0, o1, s0, s1 in SEGS:
        if s0 <= t < s1:
            return o0 + (t - s0) * (o1 - o0) / (s1 - s0)
    return None


def stretch(x, f, seed=0):
    """x made f times longer without changing its pitch: overlapping grains (85 ms, Hann), each read from a
    slightly jittered place, laid four to a grain length (for noise beds this is seamless)."""
    x = np.asarray(x, float)
    st = x.ndim == 2
    if not st:
        x = x[:, None]
    win = 4096
    hop = win // 4
    n_out = int(len(x) * f)
    if len(x) < win + 2:
        y = np.repeat(x, int(np.ceil(f)), axis=0)[:n_out]
        return y if st else y[:, 0]
    out = np.zeros((n_out + win, x.shape[1]))
    norm = np.zeros(n_out + win)
    w = np.hanning(win)
    r = np.random.default_rng(seed)
    pos_out = 0
    while pos_out < n_out:
        c = pos_out / f
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
    for o0, o1, s0, s1 in SEGS:
        a, e = max(float(t), s0), min(float(t) + L, s1)
        if e - a < 0.02:
            continue
        sl = x[int((a - t) * SR) : int((e - t) * SR)]
        f = (o1 - o0) / (s1 - s0)
        _n_long[0] += 1
        y = stretch(sl, f, seed=_n_long[0]) if abs(f - 1) > 1e-3 else sl
        _place(b, y, o0 + (a - s0) * f, gain, pan)


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
    """A slower, simpler score in the cut's own seconds: the felt piano and its D-major world, the music
    box's three notes (the knock's motif, F#-E-D) after each answered knock, silence while you wait in
    2025, the open D chord on her third knock, the low strings under your walk to her room."""
    M = g.Music()
    piano, chord, pedal, mbox, celesta, pad = g.piano, g.chord, g.pedal, g.mbox, g.celesta, g.pad
    # ---- 2004, 0-13.5: Dmaj9 unfolding slowly; Gmaj7 as the hall light goes off (5.1); nothing on her
    # knocks (6.8-7.8) or yours (10.0-11.0); the music box answers after them; an open D into the black
    pedal(M, 0.0)
    piano(M, 0.35, 38, 0.26, 4.6)
    piano(M, 0.37, 45, 0.21, 4.5)
    piano(M, 1.6, 66, 0.24, 2.2)
    piano(M, 2.5, 57, 0.19, 2.0)
    piano(M, 3.4, 64, 0.22, 1.7)
    piano(M, 4.3, 73, 0.2, 0.9)
    pedal(M, 5.05, down=False)
    pedal(M, 5.08)
    chord(M, 5.12, [43, 50, 59, 66], 0.24, 2.6, 0.07)
    piano(M, 8.6, 66, 0.2, 1.1)
    for k, m in enumerate((78, 76, 74)):
        mbox(M, 11.65 + 0.42 * k, m, 0.46)
    pedal(M, 12.48, down=False)
    pedal(M, 12.5)
    chord(M, 12.52, [50, 57, 62, 66], 0.2, 1.0, 0.03)
    M.fade(12.85, 13.5)
    # ---- 2009, 13.5-27.0: Bm(add9) and G low under the rain, never on the eleven knocks (15.3-17.6);
    # the celesta's motif as she lies down and the dog flops
    pedal(M, 13.95)
    chord(M, 13.95, [35, 42, 50, 61], 0.27, 1.25, 0.07, gain=0.7)
    pedal(M, 18.4)
    chord(M, 18.4, [31, 38, 47, 57], 0.25, 2.4, 0.07, gain=0.7)
    pedal(M, 21.0)
    chord(M, 21.0, [35, 42, 50, 61], 0.24, 2.2, 0.07, gain=0.7)
    pedal(M, 23.4)
    chord(M, 23.4, [31, 38, 47, 54], 0.24, 2.4, 0.07, gain=0.7)
    for k, m in enumerate((66, 64, 62)):
        celesta(M, 24.85 + 0.45 * k, m, 0.42, pan=-0.1)
    M.fade(26.35, 27.0)
    # ---- 2013, 27.0-40.5: piano alone, sparse; nothing under her knocks (28.9-29.9, 34.4-35.6) or your
    # answer (37.2-38.3); then the motif, slowly
    pedal(M, 27.5)
    chord(M, 27.5, [47, 54, 62], 0.22, 1.1, 0.09, gain=0.8)
    piano(M, 30.9, 38, 0.12, 3.3, gain=0.4)
    chord(M, 36.05, [43, 59, 64], 0.18, 0.9, 0.1, gain=0.75)
    pedal(M, 38.7)
    piano(M, 38.75, 66, 0.27, 0.42, gain=0.85)
    piano(M, 39.2, 64, 0.25, 0.42, gain=0.85)
    piano(M, 39.65, 62, 0.24, 0.6, gain=0.85)
    chord(M, 39.65, [50, 57], 0.16, 0.6, 0.02, gain=0.85)
    M.fade(40.0, 40.5)
    # ---- 2025, 40.5-64.0: a warm pad that thins away (no D in it) to silence by 47.3; your knock (48.1)
    # and the wait in silence; her third knock (53.2) lands on the open D chord, the music box completes
    # the motif; the low strings and the D-A-F# ostinato under her laughing knocks and your walk to her
    pad(M, 40.6, 44.6, [52, 55, 59, 66], 0.8)
    pad(M, 40.6, 44.6, [40], 0.45)
    pad(M, 43.6, 46.0, [57], 0.75, rel=1.0)
    pad(M, 43.6, 46.6, [61], 0.75, rel=1.0)
    pad(M, 43.6, 47.0, [64], 0.85, rel=1.4)
    piano(M, 42.4, 66, 0.18, 0.6, distant=True)
    piano(M, 42.95, 64, 0.16, 1.2, distant=True)
    M.fade(47.0, 47.3)
    pedal(M, 53.19)
    chord(M, 53.212, [38, 45, 54, 57, 62], 0.48, 2.8, 0.004, gain=0.7)
    for k, m in enumerate((78, 76, 74)):
        mbox(M, 53.75 + 0.45 * k, m, 0.4)
    strings_cut(M)
    pat = [62, 69, 66]
    e8 = 0.5
    for k in range(10):
        tk = 57.2 + k * e8
        piano(M, tk, pat[k % 3], 0.24 + 0.08 * float(g.smooth(57.2, 60.0, tk)) - 0.06 * float(g.smooth(60.2, 62.4, tk)), 0.7)
    pedal(M, 57.2)
    piano(M, 57.2, 47, 0.24, 2.0)
    pedal(M, 59.68, down=False)
    pedal(M, 59.7)
    piano(M, 59.7, 43, 0.28, 1.6)
    piano(M, 61.3, 45, 0.26, 1.1)
    pedal(M, 62.38, down=False)
    pedal(M, 62.4)
    chord(M, 62.4, [38, 45], 0.28, 2.0, 0.02)
    chord(M, 62.95, [73, 76], 0.18, 1.0, 0.05)
    # ---- the end card, 64-70: the motif once more, slowly (clear of her three goodnight knocks at
    # 66.95-67.55); a last soft Dmaj9 gone into the black
    pedal(M, 64.85)
    piano(M, 64.9, 66, 0.26, 0.6)
    piano(M, 65.55, 64, 0.24, 0.6)
    piano(M, 66.2, 62, 0.23, 0.7)
    chord(M, 66.2, [50, 57], 0.15, 0.7, 0.02)
    pedal(M, 67.95)
    chord(M, 68.0, [38, 50, 57, 61, 64, 66], 0.2, 1.4, 0.014)
    M.fade(69.2, 69.95)
    return M


def strings_cut(M):
    """55.0-66: the low strings swelling from pp under her laughing knocks, cresting as you reach her door
    (60.0), home to D as you lie down (62.4), released into the end card."""

    def dyn(T):
        rise = g.smooth(55.0, 60.0, T)
        fall = g.smooth(60.1, 62.8, T)
        d = 0.1 + 0.5 * rise - 0.24 * fall
        return d * (1 - g.smooth(64.6, 66.2, T))

    lines = {
        "bass": ("bass", [(55.0, 38), (57.2, 35), (59.7, 31), (61.3, 33), (62.4, 38)], 0.4, 8.0),
        "cello1": ("cello", [(55.0, 45), (57.2, 45), (59.7, 47), (61.3, 49), (62.4, 45)], 0.2, 14.0),
        "cello2": ("cello", [(55.4, 54), (57.2, 54), (59.7, 55), (61.3, 55), (62.4, 54)], 0.05, 15.0),
        "viola": ("viola", [(56.0, 62), (59.2, 66), (59.7, 67), (61.3, 64), (62.4, 64)], -0.3, 16.0),
    }
    for i, (key, (part, notes, pan, vc)) in enumerate(lines.items()):
        y = g.string_line(notes, 66.2, part, dyn, seed=i, vib_cents=vc)
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
        (0.0, 13.5, "empty04", 0.34, 0.1),
        (13.5, 27.0, "bedroom", 0.2, 0.06),
        (27.0, 40.5, "stripped", 0.26, 0.06),
        (40.5, CUT_DUR + 0.5, "bedroom", 0.22, 0.4),
    ]
    g.MUSIC_VERB_PLAN = [(0.0, 13.5, 0.12), (13.5, 27.0, 0.06), (27.0, 40.5, 0.0), (40.5, CUT_DUR + 0.5, 0.0)]
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
            if -0.03 < t - k["t"] < 0.15 and abs(k["t"] - 53.2) > 0.05:
                bad.append((round(t, 3), name, note, round(k["t"], 3)))
    print(f"  note attacks on a knock: {len(bad)} {bad[:10]}")
    print(f"  knocks kept: {len(R['knocks'])}: {[round(k['t'], 2) for k in R['knocks']]}")
