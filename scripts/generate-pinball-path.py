#!/usr/bin/env python3
"""
First-person track for the Pinball composition: "POV: you're a pinball" (70 s at 30 fps).

The ball's life is simulated (scripts/pinball_sim.py: a standard playfield, tilted 6.5 degrees), and the
player's flips are found by search, so every bounce is real physics:

  launch -> up the shooter lane and over the top arch, peeling off into the skill-shot lanes -> the pop
  bumpers (six hits in 0.15 s) -> slingshots -> the right flipper sends you up the monster's tongue (a ramp)
  -> CHOMP: the mouth (a scoop) holds you while two more balls are launched (multiball) -> it spits you back
  down the tongue -> a flipper shot up the spinner lane: JACKPOT -> the player shakes the machine: TILT, the
  flippers die -> you roll down the middle and drain -> the trough.

The video plays that ~13 s of pinball in slow motion (and real time where it's calm), after a cold open
(a freeze frame from the multiball, then a rewind to the start). Writes src/pinball/track.json: per frame,
the camera, every ball, the flippers and moving parts; the events for picture and sound.

    python3 scripts/generate-pinball-path.py
"""

import copy
import importlib.util
import json
import math
import os

import numpy as np
from scipy.interpolate import PchipInterpolator

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
_spec = importlib.util.spec_from_file_location("pinball_sim", os.path.join(HERE, "pinball_sim.py"))
ps = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ps)

FPS = 30
DUR = 70.0
NF = int(DUR * FPS)
SIM_HZ = 600
R = ps.R

# ---------------------------------------------------------------- the monster's tongue (a ramp)
# entrance on the playfield, a gentle S, up into the mouth 5 cm above the playfield
TONGUE_CP = np.array([[0.120, 0.600, 0.0], [0.134, 0.700, 0.010], [0.118, 0.810, 0.032], [0.098, 0.935, 0.050]])


def tongue_curve(n=400):
    """Points along the tongue's centre line (Catmull-Rom through the control points), arc length."""
    P = np.vstack([TONGUE_CP[0] * 2 - TONGUE_CP[1], TONGUE_CP, TONGUE_CP[-1] * 2 - TONGUE_CP[-2]])
    pts = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for u in np.linspace(0, 1, n // 3, endpoint=False):
            u2, u3 = u * u, u * u * u
            pts.append(0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3))
    pts.append(TONGUE_CP[-1])
    pts = np.array(pts)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    return pts, s


TONGUE_PTS, TONGUE_S = tongue_curve()
TONGUE_LEN = TONGUE_S[-1]
MOUTH_IN = np.array([0.086, 0.958, 0.044])  # where you end up, inside the mouth


def tongue_at(s):
    s = np.clip(s, 0, TONGUE_LEN)
    return np.array([np.interp(s, TONGUE_S, TONGUE_PTS[:, k]) for k in range(3)])


def ride_tongue(v0, up=True, dt=1 / SIM_HZ):
    """Roll along the tongue (1D): rolling ball, playfield tilt plus the tongue's own climb."""
    g = 9.81
    sin6 = math.sin(math.radians(6.5))
    cos6 = math.cos(math.radians(6.5))
    s = 0.0 if up else TONGUE_LEN
    v = v0
    out = []
    while True:
        p = tongue_at(s)
        p2 = tongue_at(s + (1e-3 if up else -1e-3))
        d = (p2 - p) / np.linalg.norm(p2 - p)
        # height in the room rises with table y (tilt) and with the tongue's z
        dh = d[1] * sin6 + d[2] * cos6
        # going down the tongue, d points down it: the ball speeds up
        a = -5 / 7 * g * dh if up else 5 / 7 * g * (-dh)
        out.append((s, v))
        v += a * dt
        s = s + v * dt if up else s - v * dt
        if up and s >= TONGUE_LEN:
            out.append((TONGUE_LEN, v))
            break
        if not up and s <= 0:
            out.append((0.0, v))
            break
        if up and v <= 0:
            raise RuntimeError("didn't make it up the tongue")
    return out


# ---------------------------------------------------------------- the simulation, stage by stage
def run():
    rec = []  # (tau, {ball: (x, y, z, mode)}, flipL, flipR, drops)
    table = ps.Table()
    you = ps.Ball((0.4945, 0.075), (0.0, 1.2575), "you")
    balls = [you]
    extra = {"you": {"z": R, "mode": "free"}}

    def snap(t):
        st = {}
        for b in balls:
            e = extra.setdefault(b.name, {"z": R, "mode": "free"})
            st[b.name] = (b.px, b.py, e["z"], e["mode"])
        rec.append((t, st, table.flip["L"], table.flip["R"], list(table.drops)))

    # 1. launch: up the shooter lane, round the arch, the lanes, the bumpers, down to the flippers
    table.events.append((0.0, "launch", {"ball": "you"}))
    t = ps.simulate(balls, table, 0.0, 9.0, record=snap, stop=lambda t, bs: t > 0.5 and bs[0].py < 0.24)

    # 2. the right flipper sends you up the tongue (the flip time is the one the search found)
    T_FLIP1 = 6.562
    state = {"pressed": False, "prev": you.py, "in": None}

    def script2(t, tb, bs):
        if not state["pressed"] and t >= T_FLIP1:
            tb.press("R", t, 0.3)
            state["pressed"] = True

    def stop2(t, bs):
        y0 = state["prev"]
        state["prev"] = you.py
        if t > T_FLIP1 and y0 < ps.RAMP_ENTRY[1] <= you.py:
            state["in"] = (t, you.px, you.vx, you.vy)
            return True
        return you.py < 0.06

    t = ps.simulate(balls, table, t, 12.0, script=script2, record=snap, stop=stop2)
    assert state["in"], "the flip missed the tongue"
    t_in, x_in, vx_in, vy_in = state["in"]
    print(f"onto the tongue at {t_in:.3f} s, x {x_in:.3f}, v ({vx_in:.2f}, {vy_in:.2f})")
    table.events.append((t_in, "ramp_in", {"ball": "you"}))

    # 3. up the tongue (1D), into the mouth
    you.mode = "ramp"
    ride = ride_tongue(math.hypot(vx_in, vy_in) * 0.9)
    for k, (s, v) in enumerate(ride):
        tt = t_in + k / SIM_HZ
        p = tongue_at(s)
        you.px, you.py = p[0], p[1]
        extra["you"] = {"z": R + p[2], "mode": "ramp"}
        table.step_flippers(tt, 1 / SIM_HZ)
        snap(tt)
    t = t_in + (len(ride) - 1) / SIM_HZ
    v_mouth = ride[-1][1]
    print(f"into the mouth at {t:.3f} s at {v_mouth:.2f} m/s")
    table.events.append((t, "chomp", {"ball": "you", "speed": v_mouth}))
    # a short drop into the mouth
    p0 = tongue_at(TONGUE_LEN)
    for k in range(1, 31):
        u = k / 30
        q = p0 + (MOUTH_IN - p0) * (1 - (1 - u) ** 2)
        you.px, you.py = q[0], q[1]
        extra["you"] = {"z": R + q[2], "mode": "mouth"}
        snap(t + k / SIM_HZ)
    t += 30 / SIM_HZ
    you.mode = "held"

    # 4. held in the mouth: multiball, two more balls come up the shooter lane
    T_HOLD = 1.6
    launches = [(t + 0.35, 1.62), (t + 0.95, 1.55)]
    t_hold_end = t + T_HOLD
    pending = list(launches)

    def script4(tt, tb, bs):
        while pending and tt >= pending[0][0]:
            when, v0 = pending.pop(0)
            nb = ps.Ball((0.4945, 0.075), (0.0, v0), f"b{len(bs) + 1}")
            bs.append(nb)
            extra[nb.name] = {"z": R, "mode": "free"}
            tb.events.append((tt, "launch", {"ball": nb.name}))

    table.events.append((t + 0.2, "multiball", {}))
    t = ps.simulate(balls, table, t, t_hold_end, script=script4, record=snap)

    # 5. spat out: back down the tongue and onto the playfield
    table.events.append((t, "burp", {"ball": "you"}))
    for k in range(1, 21):
        u = k / 20
        q = MOUTH_IN + (p0 - MOUTH_IN) * u
        you.px, you.py = q[0], q[1]
        extra["you"] = {"z": R + q[2], "mode": "mouth"}
        ps.simulate(balls[1:], table, t, t + 1 / SIM_HZ) if len(balls) > 1 else None
        snap(t + 1 / SIM_HZ)
        t += 1 / SIM_HZ
    down = ride_tongue(0.7, up=False)
    for s, v in down[1:]:
        p = tongue_at(s)
        you.px, you.py = p[0], p[1]
        extra["you"] = {"z": R + p[2], "mode": "ramp"}
        ps.simulate(balls[1:], table, t, t + 1 / SIM_HZ)
        t += 1 / SIM_HZ
        snap(t)
    v_out = down[-1][1]
    d = tongue_at(0.0) - tongue_at(0.002)
    d = d[:2] / np.linalg.norm(d[:2])
    you.px, you.py = TONGUE_PTS[0][0], TONGUE_PTS[0][1]
    you.vx, you.vy = d[0] * v_out, d[1] * v_out
    you.mode = "free"
    extra["you"] = {"z": R, "mode": "free"}
    table.events.append((t, "ramp_out", {"ball": "you", "speed": v_out}))
    table.you_tongue = True
    print(f"spat out onto the playfield at {t:.3f} s at {v_out:.2f} m/s")
    return table, balls, extra, rec, t, snap


def stage_after_spit(table, balls, extra, rec, t, snap, flip_side, t_flip, t_end, tilt_at=None, nudge=(0.0, 0.0)):
    """From the spit: a flip (side, time), optionally a tilt; run to t_end. Returns what happened."""
    you = balls[0]
    st = {"pressed": False, "tilted": False}

    def script(tt, tb, bs):
        if not st["pressed"] and t_flip is not None and tt >= t_flip:
            tb.press(flip_side, tt, 0.3)
            st["pressed"] = True
        if tilt_at is not None and not st["tilted"] and tt >= tilt_at:
            st["tilted"] = True
            tb.events.append((tt, "tilt", {}))
            tb.dead = True
            for b in bs:
                if b.mode == "free":
                    b.vx += nudge[0]
                    b.vy += nudge[1]

    def stop(tt, bs):
        return you.py < 0.03

    t = ps.simulate(balls, table, t, t_end, script=script, record=snap, stop=stop)
    return t


def main():
    table, balls, extra, rec, t_spit, snap = run()
    you = balls[0]
    # 6. search a flip that sends you back up into the pop bumpers (where the jackpot is lit)
    found = None
    for i in range(0, 760):
        for side in ("L", "R"):
            tf = t_spit + 0.05 + i * 0.004
            tb, bs = copy.deepcopy(table), copy.deepcopy(balls)
            st = {"p": False, "hit": None, "n0": len(tb.events)}

            def script(tt, tbl, bbs, tf=tf, side=side):
                if not st["p"] and tt >= tf:
                    tbl.press(side, tt, 0.3)
                    st["p"] = True

            def stop(tt, bbs):
                if tt <= tf:
                    return bbs[0].py < 0.04
                for e in tb.events[st["n0"]:]:
                    if e[1] == "bumper" and e[2].get("ball") == "you" and e[0] > tf:
                        st["hit"] = e
                        return True
                return bbs[0].py < 0.04 or tt > tf + 1.6

            ps.simulate(bs, tb, t_spit, tf + 1.6, script=script, stop=stop)
            shot = [e for e in tb.events[st["n0"]:] if e[1] == "flipper_" + side and e[2].get("ball") == "you" and e[0] >= tf]
            if st["hit"] and shot:
                found = (side, tf, st["hit"])
                break
        if found:
            break
    assert found, "no flip gets you back to the bumpers"
    side2, t_flip2, jack = found
    lane = (jack[0], jack[2]["x"], 0.0)
    print(f"bumper shot: {side2} flipper at {t_flip2:.3f} s, jackpot (bumper {jack[2]['k']}) at {jack[0]:.3f} s")
    # 7. the jackpot, then the player loses it: shakes the machine, TILT; then you drain
    table.events.append((jack[0], "jackpot", {"ball": "you"}))
    t_tilt = jack[0] + 2.2
    t = stage_after_spit(table, balls, extra, rec, t_spit, snap, side2, t_flip2, t_tilt + 6.0, tilt_at=t_tilt, nudge=(0.35, 0.05))
    print(f"drained at {t:.3f} s at ({you.px:.3f}, {you.py:.3f})")
    return table, balls, extra, rec, t_spit, t_flip2, lane, t_tilt, t


# ---------------------------------------------------------------- the video
V_PLUNGE0 = 4.0  # the plunger scene starts (after the cold open and the rewind)
V_LAUNCH = 8.6  # the plunger lets go
DRAIN_EDGE = 0.030  # the playfield ends under the apron: past here a ball falls into the trough
TROUGH_STOP = 0.470  # the ball stop at the right-hand end of the trough
LANE_C = 0.4945  # the shooter lane's centre line
# after the TILT, while the ball rocks on the dead flippers, it looks down at the drain (video seconds)
TILT_LOOK = (53.8, 60.5)
# (video t0, t1, fade, table point): look at the jackpot bumper as it fires, not past it
LOOK_AT = [(48.4, 50.45, 0.6, (ps.BUMPERS[1][0], ps.BUMPERS[1][1], 0.058))]  # its cap and eyes
T_FREEZE_PRE = 0.9  # the cold open plays this long before the freeze frame
V_REWIND = (3.0, 4.0)


def smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def assemble(table, balls, rec, t_drain, t_tilt, warp_keys, tau_freeze):
    names = [b.name for b in balls]
    tau = np.array([r[0] for r in rec])
    order = np.argsort(tau, kind="stable")
    tau = tau[order]
    rec = [rec[i] for i in order]
    # per ball: x, y, z, visible (before launch a ball waits in the trough, unseen)
    pos = {n: np.full((len(rec), 4), np.nan) for n in names}
    for i, r in enumerate(rec):
        for n, (x, y, z, mode) in r[1].items():
            pos[n][i] = (x, y, z, 1.0)
    flipL = np.array([r[2] for r in rec])
    flipR = np.array([r[3] for r in rec])

    # after the drain: off the end of the playfield (it stops under the raised apron), down into the
    # trough, along it to the ball stop, then the eject: along the pocket under the shooter lane and up
    # through the trapdoor in front of the plunger
    xd, yd = pos["you"][-1][0], pos["you"][-1][1]
    T_TROUGH = [(0.0, (xd, yd, R)), (0.05, (xd, 0.019, 0.010)), (0.13, (xd, 0.012, -0.012)),
                (0.22, (xd, 0.008, -0.030)), (0.34, (xd + 0.014, 0.008, -0.029)),
                (1.7, (TROUGH_STOP, 0.008, -0.030)), (5.6, (TROUGH_STOP, 0.008, -0.030)),
                (5.8, (LANE_C, 0.008, -0.030)), (6.0, (LANE_C, 0.075, -0.030)),
                (6.3, (LANE_C, 0.075, R)), (6.4, (LANE_C, 0.075, R)), (12.0, (LANE_C, 0.075, R))]
    kt = np.array([k[0] for k in T_TROUGH])
    kp = np.array([k[1] for k in T_TROUGH])
    extra_t = np.arange(1, int(12.0 * SIM_HZ)) / SIM_HZ
    ext = np.stack([PchipInterpolator(kt, kp[:, j])(extra_t) for j in range(3)], axis=1)
    tau = np.concatenate([tau, t_drain + extra_t])
    for n in names:
        last = pos[n][-1].copy()
        add = np.tile(last, (len(extra_t), 1))
        if n == "you":
            add[:, :3] = ext
            add[:, 3] = 1.0
        else:
            add[:, 3] = 0.0  # the other balls have drained by now
        pos[n] = np.vstack([pos[n], add])
    # the other balls: off the end of the playfield they drop into the trough and out of sight
    for n in names:
        if n == "you":
            continue
        P = pos[n]
        low = P[:, 1] < DRAIN_EDGE
        P[low, 2] = R - (DRAIN_EDGE - P[low, 1]) * 2.2
        P[low & (P[:, 2] < -0.04), 3] = 0.0
    flipL = np.concatenate([flipL, np.full(len(extra_t), flipL[-1])])
    flipR = np.concatenate([flipR, np.full(len(extra_t), flipR[-1])])

    # the time map: video seconds -> pinball seconds
    V = np.arange(NF) / FPS
    wk = np.array(warp_keys)
    warp = PchipInterpolator(wk[:, 0], wk[:, 1])
    T = np.zeros(NF)
    for f, v in enumerate(V):
        if v < T_FREEZE_PRE:
            T[f] = tau_freeze - 0.12 + 0.12 * v / T_FREEZE_PRE
        elif v < V_REWIND[0]:
            T[f] = tau_freeze
        elif v < V_REWIND[1]:
            u = (v - V_REWIND[0]) / (V_REWIND[1] - V_REWIND[0])
            T[f] = tau_freeze * (1 - (u * u * (3 - 2 * u)))
        elif v < V_LAUNCH:
            T[f] = 0.0
        else:
            T[f] = float(warp(min(v, wk[-1, 0])))
    rate = np.gradient(T) * FPS  # pinball seconds per video second (1 = real time)

    def sample(n, t):
        P = pos[n]
        i = np.searchsorted(tau, t)
        i = np.clip(i, 1, len(tau) - 1)
        a, b = P[i - 1], P[i]
        u = (t - tau[i - 1]) / max(1e-9, tau[i] - tau[i - 1])
        if np.isnan(a[0]) or np.isnan(b[0]):
            return np.array([0, 0, 0, 0.0])
        out = a + (b - a) * u
        out[3] = min(a[3], b[3])
        return out

    balls_f = {n: np.array([sample(n, t) for t in T]) for n in names}
    fl = np.interp(T, tau, flipL)
    fr = np.interp(T, tau, flipR)
    return V, T, rate, balls_f, fl, fr, tau, pos


def camera(V, T, rate, you, tau, pos, t_events):
    """Ball-cam: from the middle of the ball, looking where it's going (smoothed in video time)."""
    n = len(V)
    # direction of travel, from the ball's path in pinball time
    d = np.zeros((n, 3))
    P = pos["you"]
    for f in range(n):
        t = T[f]
        a = np.interp(t - 0.01, tau, P[:, 0]), np.interp(t - 0.01, tau, P[:, 1]), np.interp(t - 0.01, tau, P[:, 2])
        b = np.interp(t + 0.01, tau, P[:, 0]), np.interp(t + 0.01, tau, P[:, 1]), np.interp(t + 0.01, tau, P[:, 2])
        d[f] = np.array(b) - np.array(a)
    sp = np.linalg.norm(d, axis=1) / 0.02  # m/s
    sph = np.linalg.norm(d[:, :2], axis=1) / 0.02  # along the playfield
    # where you'd look standing still: up the shooter lane; out of the monster's mouth; along the trough
    # to the eject, then up the lane again
    look_rest = np.zeros((n, 3))
    for f in range(n):
        x, y, z = you[f][:3]
        if z > 0.03 and y > 0.9:  # in the mouth: looking out at the playfield
            v = np.array([0.30, 0.30, 0.0]) - np.array([x, y, 0.0])
        elif z < R - 0.002 and y < 0.04 and x < LANE_C - 0.004:  # falling into the trough, in it
            v = np.array([1.0, 0.12, 0.0])
        elif TILT_LOOK[0] < V[f] < TILT_LOOK[1]:  # flippers dead: staring down at the drain
            v = np.array([ps.XC, 0.0, 0.0]) - np.array([x, y, 0.0])
        else:
            v = np.array([0.0, 1.0, 0.0])
        look_rest[f] = v / np.linalg.norm(v)
    moving = np.clip((sph - 0.05) / 0.25, 0, 1)
    dirs = np.where(sph[:, None] > 1e-6, d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9), look_rest)
    # flatten (look along the playfield, a little up), except on the tongue where you climb
    dirs[:, 2] = np.where(you[:, 2] > R + 0.002, dirs[:, 2], 0.0)
    dirs = dirs / np.maximum(np.linalg.norm(dirs, axis=1, keepdims=True), 1e-9)
    dirs = dirs * moving[:, None] + look_rest * (1 - moving[:, None])
    dirs = dirs / np.maximum(np.linalg.norm(dirs, axis=1, keepdims=True), 1e-9)
    # moments where you'd stare at what's hitting you rather than where you're going
    for t0, t1, fade, target in LOOK_AT:
        for f in range(n):
            w = smooth(t0, t0 + fade, V[f]) * (1 - smooth(t1 - fade, t1, V[f]))
            if w <= 0:
                continue
            v = np.array(target, dtype=float) - np.asarray(you[f][:3], dtype=float)
            v /= np.linalg.norm(v)
            mix = dirs[f] * (1 - w) + v * w
            dirs[f] = mix / max(np.linalg.norm(mix), 1e-9)
    # zero-phase smoothing (forward then backward exponential, about 0.15 s): whips round after each bounce
    # without snapping
    k = 0.2
    sm = dirs.copy()
    for f in range(1, n):
        sm[f] = sm[f - 1] + (dirs[f] - sm[f - 1]) * k
        sm[f] /= np.linalg.norm(sm[f])
    for f in range(n - 2, -1, -1):
        sm[f] = sm[f + 1] + (sm[f] - sm[f + 1]) * k
        sm[f] /= np.linalg.norm(sm[f])
    # tilt the view up a touch: the backbox's display looms over the far end of the table
    up = np.array([0, 0, 1.0])
    fwd = sm + up * 0.07
    fwd /= np.linalg.norm(fwd, axis=1, keepdims=True)
    return fwd, sp


def to3(p):
    """Table (x across, y up the table, z up off the playfield) -> three.js (x, y up, z towards you)."""
    return [round(float(p[0]), 6), round(float(p[2]), 6), round(float(-p[1]), 6)]


def main_out():
    table, balls, extra, rec, t_spit, t_flip2, lane, t_tilt, t_drain = main()
    ev = sorted(table.events, key=lambda e: e[0])
    tj = [e[0] for e in ev if e[1] == "jackpot"][0]
    tau_freeze = tj + 0.05
    # the time map (video s, pinball s): slow motion where things happen fast
    E = {e[1]: e[0] for e in reversed(ev)}  # first time of each kind
    warp_keys = [
        (V_LAUNCH, 0.0), (10.0, 0.30), (11.5, 1.05), (13.0, 1.755), (15.25, 4.0), (17.75, 4.25), (20.0, 5.30),
        (22.0, 5.60), (24.0, 6.40), (27.0, 6.62), (28.6, E["chomp"]), (33.0, E["burp"]), (34.2, E["ramp_out"]),
        (36.5, 9.40), (38.9, 9.95), (41.4, 10.45), (44.0, 10.56), (46.0, 10.80), (48.0, 11.45), (49.0, 11.93),
        (50.5, 12.03), (53.0, t_tilt), (60.0, t_drain),
        (63.0, t_drain + 1.6), (66.0, t_drain + 5.6), (68.0, t_drain + 6.4), (70.0, t_drain + 7.0),
    ]
    V, T, rate, bf, fl, fr, tau, pos = assemble(table, balls, rec, t_drain, t_tilt, warp_keys, tau_freeze)
    fwd, sp = camera(V, T, rate, bf["you"], tau, pos, ev)
    # events in video time
    wk = np.array(warp_keys)
    inv = lambda t: float(np.interp(t, wk[:, 1], wk[:, 0]))  # noqa: E731
    events = []
    for t, kind, info in ev:
        if kind == "clack" and info.get("speed", 1) < 0.35:
            continue
        item = {"t": round(inv(t), 4), "tau": round(t, 4), "kind": kind}
        for k in ("k", "ball", "x", "y", "speed", "s", "a", "b"):
            if k in info:
                item[k] = round(float(info[k]), 4) if isinstance(info[k], (float, np.floating)) else info[k]
        events.append(item)
        # the cold open plays the jackpot hit too
        if tau_freeze - 0.12 <= t <= tau_freeze:
            c = dict(item)
            c["t"] = round((t - (tau_freeze - 0.12)) / 0.12 * T_FREEZE_PRE, 4)
            c["cold"] = True
            events.append(c)
    events.sort(key=lambda e: e["t"])
    out = {
        "fps": FPS,
        "frames": NF,
        "tau": np.round(T, 5).tolist(),
        "rate": np.round(rate, 4).tolist(),
        "you": [to3(p) for p in bf["you"]],
        "others": {n: [to3(p) + [int(p[3] > 0.5)] for p in bf[n]] for n in bf if n != "you"},
        "fwd": [to3(f) for f in fwd],
        "speed": np.round(sp, 3).tolist(),
        "flipL": np.round(fl, 2).tolist(),
        "flipR": np.round(fr, 2).tolist(),
        "events": events,
        "marks": {"plunge": V_PLUNGE0, "launch": V_LAUNCH, "freeze": T_FREEZE_PRE, "rewind": list(V_REWIND),
                  "tilt": inv(t_tilt), "drain": inv(t_drain), "chomp": inv(E["chomp"]), "burp": inv(E["burp"]),
                  "jackpot": inv(tj), "multiball": inv(E["multiball"]), "flip1": inv(6.562), "flip2": inv(t_flip2)},
        "layout": {
            "W": ps.W, "L": ps.L, "R": ps.R, "XC": ps.XC, "laneX": ps.LANE_X,
            "flippers": ps.FLIPPERS, "flipLen": ps.FLIP_LEN, "flipR0": ps.FLIP_R0, "flipR1": ps.FLIP_R1,
            "bumpers": ps.BUMPERS, "bumperR": ps.BUMPER_R, "monster": ps.MONSTER, "monsterR": ps.MONSTER_R,
            "archC": ps.ARCH_C, "archR": ps.ARCH_R, "laneGuides": ps.LANE_GUIDES, "laneY": ps.LANE_Y,
            "drops": ps.DROP_TARGETS, "dropW": ps.DROP_W, "rightLane": ps.RIGHT_LANE, "spinner": ps.SPINNER,
            "slings": ps.SLINGS, "inlanes": ps.INLANE_GUIDES, "apronY": ps.APRON_Y, "gateY": ps.GATE_Y,
            "tongue": TONGUE_CP.tolist(), "mouthIn": MOUTH_IN.tolist(),
        },
    }
    os.makedirs(os.path.join(ROOT, "src", "pinball"), exist_ok=True)
    with open(os.path.join(ROOT, "src", "pinball", "track.json"), "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print("frames", NF, "pinball seconds", round(T[-1], 2), "freeze at", round(tau_freeze, 3))
    for m, v in out["marks"].items():
        print(f"  {m}: {v}")
    return out


if __name__ == "__main__":
    main_out()
