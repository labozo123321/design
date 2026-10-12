#!/usr/bin/env python3
"""
Track and ride for the Coaster composition: "POV: your little sister wanted the front row".

Builds THE DROP (scripts/coaster_layout.py: a dive coaster laid out along its heartline), then runs the
train on it: three cars of six, the front row at s, the other rows 3.6 m and 7.2 m behind. The station's
tyres push it out, the chain takes it up the lift, tyres carry it round the turnaround, the holding brake
stops it with the front row hanging over the vertical drop, and then it is gravity, rolling resistance, air
drag, the water in the splashdown and the magnetic brakes.

Writes src/coaster/track.json:
  - the heartline every 0.5 m: position, forward T, the riders' up U;
  - per video frame: the front row's s, speed, the g's it feels (normal, lateral, along the track);
  - marks (s of each element) and cues (the video time of each moment), for the picture and the sound.

    python3 scripts/generate-coaster-path.py
"""

import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import coaster_layout as layout  # noqa: E402
from coaster_track import DRAG, MU, G  # noqa: E402

FPS = 30
ROW = 3.6  # row spacing (one row of six per car)
NROW = 3
DS_OUT = 0.5

# ---------------------------------------------------------------- the ride's timing (video seconds)
DISPATCH = 2.0  # the train leaves the station
HOLD = 3.4  # seconds held over the drop
V_TYRES = 3.2
V_LIFT = 6.8
V_TOP = 6.0  # tyres through the turnaround
S_LOAD = 37.6  # the front row's s in the station (x = -8.4)
HOLD_AT = 9.6  # metres past the holding brake's start: the front row tipped about 40 degrees down
DUR_RIDE = 70.0  # simulate this long; the video cuts on the brake run


# ---------------------------------------------------------------- the site and the supports
# The lake the splashdown and the zero-g roll run over: a rounded blob (centre, radii, wobble), water at
# LAKE_Y. The ground is otherwise flat at 0, except the cut the drop dives into (where the heartline is
# under CUT_Y) and the tunnel.
LAKE = {"cx": -108.0, "cz": 46.0, "rx": 82.0, "rz": 25.0, "y": -0.15}
CUT_Y = 1.6  # below this heartline height the track runs in a cut (or the tunnel)


def lake_r(ang):
    """The lake's radius scale in direction ang (a wobbly superellipse)."""
    return 1.0 + 0.07 * math.sin(3 * ang + 0.6) + 0.05 * math.sin(5 * ang + 2.1) + 0.03 * math.sin(9 * ang + 0.4)


def in_lake(x, z, pad=0.0):
    dx = (x - LAKE["cx"]) / (LAKE["rx"] + pad)
    dz = (z - LAKE["cz"]) / (LAKE["rz"] + pad)
    ang = math.atan2(dz, dx)
    return (abs(dx) ** 2.4 + abs(dz) ** 2.4) ** (1 / 2.4) < lake_r(ang)


ENV_R = 2.55  # the train's half width with the outer riders' legs
ENV_DOWN = 1.35  # feet below the heartline
ENV_UP = 1.55  # heads above it
SPINE_OUT = 1.95 + 0.4  # the spine's outer face below the heartline


def supports(P, T, U, ds, marks, skip):
    """Columns and arms holding the track up, each checked clear of the train's swept envelope (and of
    the track itself) along the whole circuit."""
    step = max(1, int(round(1.0 / ds)))
    Pe, Te, Ue = P[::step], T[::step], U[::step]
    Re = np.cross(Te, Ue)

    def clear(pts, own_s):
        pts = np.asarray(pts)
        d = pts[:, None, :] - Pe[None, :, :]
        a = np.einsum("knj,nj->kn", d, Te)
        b = np.einsum("knj,nj->kn", d, Re)
        c = np.einsum("knj,nj->kn", d, Ue)
        # the train's envelope, and the track's own rails/spine (except where this support holds it)
        inside_train = (np.abs(a) < 1.2) & (np.abs(b) < ENV_R + 0.35) & (c > -ENV_DOWN - 0.35) & (c < ENV_UP + 0.35)
        inside_track = (np.abs(a) < 0.9) & (np.abs(b) < 0.9) & (c > -SPINE_OUT - 0.3) & (c < -1.0)
        sidx = np.arange(len(Pe)) * step * ds
        mine = np.abs(sidx - own_s) < 3.0
        bad = inside_train | (inside_track & ~mine[None, :])
        return not bad.any()

    def seg(a, b, n=None):
        a, b = np.asarray(a), np.asarray(b)
        L = np.linalg.norm(b - a)
        k = max(2, int(L / 0.4))
        return [a + (b - a) * i / (k - 1) for i in range(k)]

    out = []
    s = 46.0
    total = (len(P) - 1) * ds
    while s < total - 2:
        i = int(round(s / ds))
        h, t, u = P[i], T[i], U[i]
        wet = in_lake(h[0], h[2], 3.0)
        if any(a <= s <= b for a, b in skip) or (h[1] < CUT_Y and not (wet and h[1] > 0.9)):
            s += 2.0
            continue
        r = np.cross(t, u)
        out_dir = -u
        A = h + out_dir * SPINE_OUT
        ground = LAKE["y"] - 0.6 if in_lake(A[0], A[2], 2.0) else 0.0
        made = None
        if out_dir[1] < -0.55:
            # the spine faces down: a column straight down from it
            base = np.array([A[0], ground, A[2]])
            pts = seg(A + np.array([0, -0.3, 0]), base)
            if clear(pts, s):
                made = {"kind": "column", "pts": [A.tolist(), base.tolist()]}
        else:
            # banked or upside down: an arm out from the spine, then down
            hz = np.array([out_dir[0], 0.0, out_dir[2]])
            cands = []
            if np.linalg.norm(hz) > 0.45:
                hz /= np.linalg.norm(hz)
                cands.append(hz)
            rh = np.array([r[0], 0.0, r[2]])
            if np.linalg.norm(rh) > 0.3:
                rh /= np.linalg.norm(rh)
                cands += [rh, -rh]
            for side in cands:
                for reach in (1.4, 2.4, 3.6, 4.8):
                    up = max(0.0, out_dir[1]) * 0.6
                    B = A + np.array([0.0, up, 0.0]) + side * reach
                    base = np.array([B[0], ground, B[2]])
                    pts = seg(A, A + np.array([0.0, up, 0.0])) + seg(A + np.array([0.0, up, 0.0]), B) + seg(B, base)
                    if clear(pts, s):
                        made = {"kind": "arm", "pts": [A.tolist(), (A + np.array([0.0, up, 0.0])).tolist(), B.tolist(), base.tolist()]}
                        break
                if made:
                    break
        if made:
            hgt = made["pts"][0][1] - ground
            made["r"] = 0.36 if hgt < 5 else 0.42 if hgt < 14 else 0.55 if hgt < 32 else 0.7
            made["s"] = round(s, 2)
            made["pts"] = [[round(c, 3) for c in p] for p in made["pts"]]
            out.append(made)
            s += 11.0 if hgt > 20 else 9.0 if hgt > 5 else 6.5
        else:
            s += 1.5
    # columns that stand within a metre of each other are one column
    merged = []
    for sp in out:
        b = sp["pts"][-1]
        for m in merged:
            mb = m["pts"][-1]
            if math.hypot(b[0] - mb[0], b[2] - mb[2]) < 1.0:
                m.setdefault("extra", []).append(sp)
                break
        else:
            merged.append(sp)
    return merged


def main():
    B = layout.build()
    P, T, U, v_design, gn_design, gl_design = B.arrays()
    ds = B.ds
    S = np.arange(len(P)) * ds
    marks = dict(B.marks)
    L = S[-1]

    def at(arr, s):
        return np.array([np.interp(s, S, arr[:, k]) for k in range(arr.shape[1])])

    def ty(s):
        return np.interp(s, S, T[:, 1])

    # curvature vector at s (dT/ds), for the g's
    dT = np.gradient(T, ds, axis=0)

    def felt(s, v, a_long):
        t = at(T, s)
        u = at(U, s)
        u = u - np.dot(u, t) * t
        u /= np.linalg.norm(u)
        r = np.cross(t, u)
        k = at(dT, s)
        f = v * v * k + np.array([0.0, G, 0.0]) + a_long * t
        return np.dot(f, u) / G, np.dot(f, r) / G, np.dot(f, t) / G

    # ---------------------------------------------------------------- simulate
    dt = 1.0 / 600.0
    t = 0.0
    s = S_LOAD
    v = 0.0
    phase = "station"
    hold_t0 = None
    cues = {}
    out_s, out_v, out_a = [], [], []
    next_frame = 0.0
    lift0, lift1 = marks["lift0"], marks["lift1"]
    hold_stop = marks["hold"] + HOLD_AT
    splash0, splash1 = marks["splash0"], marks["splash1"]
    brake0, brake1 = marks["brake0"], marks["brake1"]
    v_prev = 0.0
    while t <= DUR_RIDE + 1e-9:
        rows = [s - i * ROW for i in range(NROW)]
        a = 0.0
        if phase == "station":
            if t >= DISPATCH:
                phase = "tyres"
                cues["dispatch"] = t
        if phase == "tyres":
            a = min(1.2, (V_TYRES - v) * 3.0)
            if s >= lift0 + 1.0:
                phase = "chain"
                cues["chain"] = t
        elif phase == "chain":
            a = min(1.1, (V_LIFT - v) * 2.0)
            if rows[-1] >= lift1:
                phase = "top"
                cues["liftTop"] = t
        elif phase == "top":
            # tyres hold the turnaround speed, then the holding brake brings the front row to rest just over
            # the edge (constant deceleration to the stop)
            d = hold_stop - s
            if d <= 0.02:
                v = 0.0
                a = 0.0
                phase = "hold"
                hold_t0 = t
                cues["holdStart"] = t
            else:
                need = v * v / (2 * d)
                if need > 1.5 or s > marks["hold"] + 4.0:
                    a = -need
                else:
                    a = (V_TOP - v) * 1.5
        elif phase == "hold":
            v = 0.0
            a = 0.0
            if t - hold_t0 >= HOLD:
                phase = "free"
                cues["release"] = t
        if phase == "free" or phase == "brakes":
            # gravity on the whole train, rolling resistance on each car's felt load, air drag on the front
            slope = np.mean([ty(r) for r in rows])
            gns = [felt(r, v, 0.0) for r in rows]
            load = np.mean([math.hypot(g[0], g[1]) for g in gns])
            a = -G * slope - MU * G * load - DRAG * v * v
            if splash0 <= s <= splash1 + 6.0:
                a -= 2.2  # the scoops in the water
            if s >= brake0 and s <= brake1 + 30.0:
                phase = "brakes"
                if "brakes" not in cues:
                    cues["brakes"] = t
                # eddy-current brakes: force grows with speed, down to the run-out speed
                a = min(a, -0.42 * max(0.0, v - 4.0) - 0.0)
        v = max(0.0, v + a * dt)
        s += v * dt
        t += dt
        if t >= next_frame - 1e-9:
            out_s.append(s)
            out_v.append(v)
            out_a.append((v - v_prev) / dt if out_v else 0.0)
            next_frame += 1.0 / FPS
        v_prev = v

    out_s = np.array(out_s)
    out_v = np.array(out_v)
    nf = len(out_s)
    # the felt forces at the front row, from geometry and speed; smoothed a touch (the seat and the body)
    a_long = np.gradient(out_v, 1.0 / FPS)
    gn = np.zeros(nf)
    gl = np.zeros(nf)
    gt = np.zeros(nf)
    for i in range(nf):
        gn[i], gl[i], gt[i] = felt(out_s[i], out_v[i], a_long[i])

    def first_time(cond):
        idx = np.nonzero(cond)[0]
        return float(idx[0] / FPS) if len(idx) else None

    for name in [
        "vertical",
        "tunnel0",
        "tunnel1",
        "immTop",
        "imm1",
        "dive0",
        "splash0",
        "splash1",
        "zrRoll",
        "zr1",
        "swoop0",
        "swoop1",
        "hopTop",
        "brake0",
        "brake1",
    ]:
        cues[name] = first_time(out_s >= marks[name])
    # the moment the train goes over the edge: the front row's pitch passes -60 degrees
    tys = np.interp(out_s, S, T[:, 1])
    cues["over"] = first_time((tys < -math.sin(math.radians(60))) & (np.arange(nf) / FPS > cues["release"]))
    cues["bottom"] = first_time((out_s > marks["vertical"]) & (tys > -0.02))
    cues = {k: (round(val, 4) if val is not None else None) for k, val in cues.items()}

    # ---------------------------------------------------------------- report
    print("track length %.1f m, %d frames" % (L, nf))
    for k, val in sorted(cues.items(), key=lambda kv: kv[1] if kv[1] is not None else 1e9):
        if val is None:
            print("  %-10s  (not reached)" % k)
            continue
        i = min(nf - 1, int(round(val * FPS)))
        print("  %-10s %6.2f s   s=%7.1f  v=%5.1f m/s (%3.0f km/h)  gn=%5.2f" % (k, val, out_s[i], out_v[i], out_v[i] * 3.6, gn[i]))
    print("max speed %.1f m/s (%.0f km/h); gn %.2f..%.2f; gl %.2f..%.2f" % (out_v.max(), out_v.max() * 3.6, gn.min(), gn.max(), gl.min(), gl.max()))

    # ---------------------------------------------------------------- supports
    skip = [(0.0, 46.0)]
    sup = supports(P, T, U, ds, marks, skip)
    print("supports: %d (%d columns, %d arms)" % (len(sup), sum(1 for x in sup if x["kind"] == "column"), sum(1 for x in sup if x["kind"] == "arm")))

    # ---------------------------------------------------------------- write
    idx = np.arange(0, len(P), int(round(DS_OUT / ds)))
    out = {
        "fps": FPS,
        "ds": DS_OUT,
        "row": ROW,
        "nrow": NROW,
        "length": round(float(S[idx[-1]]), 3),
        "P": [round(float(x), 3) for x in P[idx].ravel()],
        "T": [round(float(x), 4) for x in T[idx].ravel()],
        "U": [round(float(x), 4) for x in U[idx].ravel()],
        "marks": {k: round(float(val), 3) for k, val in marks.items()},
        "supports": sup,
        "site": {"lake": LAKE, "cutY": CUT_Y},
        "cues": cues,
        "frames": {
            "s": [round(float(x), 3) for x in out_s],
            "v": [round(float(x), 3) for x in out_v],
            "gn": [round(float(x), 3) for x in gn],
            "gl": [round(float(x), 3) for x in gl],
            "gt": [round(float(x), 3) for x in gt],
        },
    }
    os.makedirs(os.path.join(ROOT, "src", "coaster"), exist_ok=True)
    with open(os.path.join(ROOT, "src", "coaster", "track.json"), "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print("wrote src/coaster/track.json")


if __name__ == "__main__":
    main()
