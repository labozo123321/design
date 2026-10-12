#!/usr/bin/env python3
"""
The flight for the Wedding composition ("POV: you're the drone carrying the wedding rings"), and the
place it happens. Writes src/wedding/flight.json: the layout (lawn, ceremony, tent, who sits and stands
where), and for every video frame the world time, the camera (the drone's gimbal) and the drone's body,
the ring box swinging on its ribbon, and the moments everything else is timed from.

World: metres, y up, north is -z. The ceremony faces north to an arch on the lakeshore with the sun low
over the mountains beyond it; the reception tent stands on the lawn to the east.

Time: the video mostly runs at world speed, slows right down twice (through the champagne tower and into
the cake), and jumps on after the drone's feed cuts out (everyone has come running).

    python3 scripts/generate-wedding-path.py
"""

import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "wedding", "flight.json")
FPS = 30
DUR = 72.0
NF = int(round(DUR * FPS))

# ----------------------------------------------------------------------------------------------------
# The place
# ----------------------------------------------------------------------------------------------------

ROWS_Z = [3.2, 4.6, 6.0, 7.4, 8.8, 10.2]
SEATS_X = [1.05, 1.62, 2.19, 2.76]
SEATED_HEAD = 1.2  # an adult's eyes over the lawn, sitting
STANDING_HEAD = 1.62

LAYOUT = {
    "sun": [-0.45, 0.12, -0.88],
    "lake": {"shore": -7.5},
    "arch": {"z": 0.0, "half": 1.3, "h": 2.75},
    "aisle": {"z0": 1.4, "z1": 15.0, "half": 0.6},
    "groom": [-0.5, 0.0, 0.6],
    "bride": [0.5, 0.0, 0.6],
    "officiant": [0.0, 0.0, -0.45],
    "kid": [1.3, 0.0, 16.0],
    "dog": [0.92, 0.0, 15.6],
    "droneStart": [1.3, 0.14, 14.65],
    "tent": {"x0": 18.0, "x1": 30.0, "z0": -9.5, "z1": 10.5, "eave": 2.9, "ridge": 5.6},
    "tables": [[21.0, -1.0], [21.0, 4.6], [26.9, -1.0], [26.9, 4.6], [21.0, 8.6], [26.9, -5.2], [21.0, -5.2]],
    "tableR": 0.9,
    "danceFloor": {"x0": 22.2, "x1": 25.8, "z0": -0.2, "z1": 3.4},
    "chandelier": [24.0, 4.15, 1.6],
    "dj": {"booth": [28.7, 8.4], "at": [29.35, 0.0, 8.4]},
    "towerTable": [24.0, -4.8],
    "tower": {"at": [24.0, 0.76, -4.8], "tiers": 5, "pitch": 0.118, "h": 0.128},
    "cakeTable": [24.0, -7.6],
    "cake": {"at": [24.0, 0.76, -7.6], "tiers": [[0.32, 0.2], [0.26, 0.18], [0.2, 0.17], [0.14, 0.16]]},
    "pourer": [24.55, 0.0, -5.55],
    "baker": [24.72, 0.0, -8.28],
    "waiterOut": [16.4, 0.0, 2.45],
    # where the dog sits at the end with the ring box, looking up at the camera in the cake
    "dogEnd": [25.12, 0.0, -7.12],
}

# who sits where: (row, side, seat) -> skipped seats are empty chairs
EMPTY = {(5, -1, 3), (5, 1, 3), (5, 1, 2), (4, -1, 3), (5, -1, 0), (3, 1, 3), (5, 1, 0), (4, 1, 3)}
GUESTS = []
for r, z in enumerate(ROWS_Z):
    for side in (-1, 1):
        for s, x in enumerate(SEATS_X):
            if (r, side, s) in EMPTY:
                continue
            GUESTS.append({"row": r, "side": side, "seat": s, "at": [side * x, 0.0, z]})
LAYOUT["chairs"] = [[side * x, z] for z in ROWS_Z for side in (-1, 1) for x in SEATS_X]
LAYOUT["guests"] = GUESTS

# ----------------------------------------------------------------------------------------------------
# Time: video -> world
# ----------------------------------------------------------------------------------------------------

SLOW1 = (45.3, 45.7, 49.2, 49.7, 0.12)  # ramp in, hold, ramp out, rate
SLOW2 = (50.75, 51.05, 53.0, 53.4, 0.15)
JUMP_AT = 55.4  # the feed is gone; when it comes back, everyone is there
JUMP = 21.0


def rate(v):
    r = 1.0
    for a, b, c, d, k in (SLOW1, SLOW2):
        if a <= v < b:
            u = (v - a) / (b - a)
            u = u * u * (3 - 2 * u)
            r = min(r, 1 + (k - 1) * u)
        elif b <= v < c:
            r = min(r, k)
        elif c <= v < d:
            u = (v - c) / (d - c)
            u = u * u * (3 - 2 * u)
            r = min(r, k + (1 - k) * u)
    return r


def world_times():
    sub = 20
    ws = np.zeros(NF)
    w = 0.0
    for f in range(NF):
        ws[f] = w
        for s in range(sub):
            v = (f + (s + 0.5) / sub) / FPS
            w += rate(v) / FPS / sub
        if f + 1 < NF and (f + 1) / FPS >= JUMP_AT > f / FPS:
            w += JUMP
    return ws


W = world_times()


def w_of_v(v):
    return float(np.interp(v * FPS, np.arange(NF), W))


# ----------------------------------------------------------------------------------------------------
# The flight: keys in WORLD time. (x, y, z, yaw, pitch, fpv) - yaw 0 looks north (-z), + turns right
# (east); pitch + looks up; fpv 0 = a smooth gimbal, 1 = the camera banks and shakes with the drone.
# ----------------------------------------------------------------------------------------------------

PI = math.pi
TW = w_of_v  # shorthand: a video time's world time

KEYS = [
    # on the grass, looking up at the ring bearer and the dog
    (0.0, 1.3, 0.14, 14.65, PI + 0.12, 0.52, 0),
    (3.4, 1.3, 0.14, 14.65, PI + 0.12, 0.52, 0),
    # lift-off, eye to eye with him, then up and round to the ceremony
    (4.4, 1.3, 1.2, 15.0, PI + 0.02, -0.02, 0),
    (5.0, 1.27, 1.5, 15.05, PI, -0.02, 0),
    (6.0, 0.85, 3.1, 15.5, PI * 0.55, -0.32, 0),
    (7.3, 0.3, 5.0, 16.4, 0.04, -0.14, 0),
    # down the aisle: the gimbal tips down to show the rings over everyone's heads, then up to the couple
    (9.2, 0.0, 4.6, 13.0, 0.0, -0.62, 0),
    (11.2, 0.0, 3.85, 8.8, 0.0, -0.8, 0),
    (13.0, 0.0, 3.0, 4.8, 0.0, -0.3, 0),
    (14.6, -0.12, 2.3, 1.3, 0.0, -0.3, 0),
    # the groom reaches for the box; the drone jerks up and away
    (15.3, 0.05, 2.65, 2.2, 0.02, -0.38, 0.4),
    # lurching off over the left-hand guests (they duck; a hat goes)
    (16.4, -1.15, 2.15, 3.15, -0.62, -0.42, 0.7),
    (17.4, -2.35, 2.0, 5.1, -0.22, -0.3, 0.8),
    (18.4, -1.1, 2.4, 3.3, 0.3, -0.28, 0.6),
    # and right up to the officiant's nose (between the bride and groom)
    (19.2, -0.1, 2.15, 1.65, 0.08, -0.12, 0.3),
    (19.9, 0.0, 1.92, 0.62, 0.02, -0.06, 0.15),
    (20.6, 0.0, 1.72, 0.12, 0.0, -0.06, 0.1),
    (24.0, 0.0, 1.73, 0.14, 0.0, -0.06, 0.1),
    # back off and look at the couple: the groom, then the bride
    (24.9, 0.0, 1.95, 1.12, 0.0, -0.1, 0),
    (25.9, 0.0, 1.95, 1.12, -0.86, -0.3, 0),
    (26.9, 0.0, 1.95, 1.12, -0.82, -0.29, 0),
    (27.7, 0.0, 1.95, 1.12, 0.86, -0.3, 0),
    (28.6, 0.0, 1.95, 1.12, 0.84, -0.28, 0),
    (29.4, 0.0, 2.1, 1.5, 0.0, -0.05, 0),
    # full throttle, straight up; the wedding shrinks underneath, then the sunset
    (30.6, 0.2, 13.0, 2.0, 0.2, -1.2, 0.3),
    (31.6, 0.5, 25.0, 2.5, -0.1, -0.7, 0.3),
    (32.5, 1.0, 30.0, 3.0, -0.42, 0.04, 0.2),
    (33.1, 1.4, 30.8, 3.2, -0.38, 0.06, 0.4),
    # whip round and dive at the tent
    (34.0, 2.8, 27.5, 3.4, 1.25, -0.95, 1),
    (35.4, 10.8, 9.5, 3.6, 1.45, -0.5, 1),
    (36.4, 14.6, 2.4, 3.5, 1.55, -0.12, 1),
    (37.2, 18.2, 1.95, 3.0, 1.52, -0.06, 1),
    # in: between the tables, at the DJ, round his booth, under the chandelier, down the dance floor
    (38.2, 22.0, 1.85, 2.0, 1.78, -0.08, 1),
    (39.3, 25.7, 1.75, 3.1, 2.3, -0.1, 1),
    (40.3, 27.4, 2.1, 6.3, 2.4, -0.16, 1),
    (41.2, 26.4, 2.45, 8.25, -2.62, -0.12, 1),
    (42.2, 23.6, 2.3, 6.35, -0.85, -0.14, 1),
    (43.1, 22.8, 2.75, 2.3, -0.12, -0.05, 1),
    (44.1, 23.65, 2.0, -1.4, 0.06, -0.16, 1),
]
# the crash, keyed in world time from the video moments it should happen at
t_tower_in = TW(45.95)
t_tower_out = TW(49.0)
t_cake = TW(51.75)
t_rest = TW(53.4)
KEYS += [
    (TW(45.3), 23.97, 1.52, -3.35, 0.0, -0.12, 1),
    (t_tower_in, 24.0, 1.39, -4.62, 0.0, -0.08, 1),
    (t_tower_out, 24.0, 1.33, -5.25, 0.04, -0.1, 1),
    (TW(50.4), 24.02, 1.3, -6.1, 0.15, -0.14, 1),
    (t_cake, 24.02, 1.23, -7.08, 0.05, -0.1, 1),
    (t_rest, 24.02, 1.12, -7.42, 0.0, 0.0, 1),
    (TW(55.3), 24.02, 1.12, -7.42, 0.0, 0.0, 1),
]
# the camera, lying in the cake, after the feed comes back: looking back out at everyone (south-ish, up)
t_back = TW(55.5)
# the dog (sitting by the cake table, looking up at the camera in the cake): its head is 0.12 m in front of
# where it sits; the camera aims a little below it, at its chest and the ring box
_dx = LAYOUT["dogEnd"][0] - 24.02
_dz = LAYOUT["dogEnd"][2] + 7.42
_d = math.hypot(_dx, _dz)
_dx, _dz = _dx * (1 - 0.12 / _d), _dz * (1 - 0.12 / _d)
DOG_YAW = math.atan2(_dx, -_dz)
DOG_PITCH = math.atan2(0.45 - 1.12, math.hypot(_dx, _dz))
END_YAW, END_PITCH, END_ROLL = PI * 0.97, 0.62, 0.15
KEYS += [
    (t_back, 24.02, 1.12, -7.42, END_YAW, END_PITCH, 0),
    (TW(66.6), 24.02, 1.12, -7.42, END_YAW, END_PITCH - 0.02, 0),
    # the kid points: the camera follows his arm, down to the dog (then the zoom)
    (TW(67.6), 24.02, 1.12, -7.42, DOG_YAW, DOG_PITCH, 0),
    (TW(72.0), 24.02, 1.12, -7.42, DOG_YAW - 0.01, DOG_PITCH - 0.01, 0),
]
KEYS.sort(key=lambda k: k[0])

# roll of the camera while it lies in the cake (the drone came to rest on its side)
REST_ROLL = 0.32
TUMBLE = (TW(49.7), TW(50.8))  # the drone rolls over twice between the tower and the cake


def pchip(xs, ys):
    """Monotone cubic interpolant (no overshoot) through (xs, ys)."""
    xs = np.asarray(xs, float)
    ys = np.asarray(ys, float)
    h = np.diff(xs)
    d = np.diff(ys) / h
    m = np.zeros_like(ys)
    for i in range(1, len(xs) - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0
        else:
            w1 = 2 * h[i] + h[i - 1]
            w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m[0] = d[0] if len(d) else 0
    m[-1] = d[-1] if len(d) else 0

    def f(x):
        x = np.clip(x, xs[0], xs[-1])
        i = np.clip(np.searchsorted(xs, x) - 1, 0, len(xs) - 2)
        t = (x - xs[i]) / h[i]
        h00 = (2 * t ** 3 - 3 * t ** 2 + 1)
        h10 = (t ** 3 - 2 * t ** 2 + t)
        h01 = (-2 * t ** 3 + 3 * t ** 2)
        h11 = (t ** 3 - t ** 2)
        return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1]

    return f


def unwrap(a):
    out = [a[0]]
    for v in a[1:]:
        p = out[-1]
        while v - p > PI:
            v -= 2 * PI
        while v - p < -PI:
            v += 2 * PI
        out.append(v)
    return out


KT = [k[0] for k in KEYS]
FX = pchip(KT, [k[1] for k in KEYS])
FY = pchip(KT, [k[2] for k in KEYS])
FZ = pchip(KT, [k[3] for k in KEYS])
FYAW = pchip(KT, unwrap([k[4] for k in KEYS]))
FPITCH = pchip(KT, [k[5] for k in KEYS])
FFPV = pchip(KT, [k[6] for k in KEYS])


def drone_pos(w):
    return np.array([FX(w), FY(w), FZ(w)], float)


def hash1(n):
    x = math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - math.floor(x)


def vnoise(t, seed):
    i = math.floor(t)
    f = t - i
    a = hash1(i + seed * 17.3) * 2 - 1
    b = hash1(i + 1 + seed * 17.3) * 2 - 1
    u = f * f * (3 - 2 * f)
    return a + (b - a) * u


def smooth(a, b, x):
    k = min(1.0, max(0.0, (x - a) / (b - a)))
    return k * k * (3 - 2 * k)


# ----------------------------------------------------------------------------------------------------
# Per frame: camera, body, ring box (a damped pendulum on its ribbon, driven by the drone)
# ----------------------------------------------------------------------------------------------------

RIBBON = 0.42
G = 9.81


def quat_from_euler_yxz(pitch, yaw, roll):
    """Camera looking down -z, yawed (about y, + turns right i.e. toward +x), pitched (+ up), rolled."""
    # three.js Euler(pitch, -yaw, roll, 'YXZ'): q = qy * qx * qz
    def qy(a):
        return np.array([0, math.sin(a / 2), 0, math.cos(a / 2)])

    def qx(a):
        return np.array([math.sin(a / 2), 0, 0, math.cos(a / 2)])

    def qz(a):
        return np.array([0, 0, math.sin(a / 2), math.cos(a / 2)])

    def mul(a, b):
        ax, ay, az, aw = a
        bx, by, bz, bw = b
        return np.array([
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz,
        ])

    return mul(mul(qy(-yaw), qx(pitch)), qz(roll))


frames = []
dt = 1 / FPS
box = None
boxv = np.zeros(3)
prev_pos = None
prev_vel = np.zeros(3)
cut = False
for f in range(NF):
    v = f / FPS
    w = float(W[f])
    p = drone_pos(w)
    # velocity / acceleration in world time (finite differences)
    e = 1 / 120
    vel = (drone_pos(w + e) - drone_pos(w - e)) / (2 * e)
    acc = (drone_pos(w + e) - 2 * p + drone_pos(w - e)) / (e * e)
    yaw = float(FYAW(w))
    pitch = float(FPITCH(w))
    fpv = float(np.clip(FFPV(w), 0, 1))
    # the body tilts toward its acceleration (plus gravity): its roll seen from the camera
    fwd = np.array([math.sin(yaw), 0, -math.cos(yaw)])
    right = np.array([math.cos(yaw), 0, math.sin(yaw)])
    a_lat = float(acc @ right)
    a_fwd = float(acc @ fwd)
    body_roll = math.atan2(a_lat, G + acc[1])
    body_pitch = -math.atan2(a_fwd, G + acc[1])
    shake = fpv * (0.012 + 0.0009 * float(np.linalg.norm(vel)))
    roll = -body_roll * 0.85 * fpv
    roll += shake * vnoise(w * 13, 1) + 0.004 * vnoise(w * 0.7, 2)
    pitch_c = pitch + shake * 0.8 * vnoise(w * 11, 3) + 0.003 * vnoise(w * 0.6, 4)
    yaw_c = yaw + shake * 0.6 * vnoise(w * 9, 5) + 0.003 * vnoise(w * 0.5, 6)
    # the tumble: two rolls over, a pitch spin
    if TUMBLE[0] <= w <= TUMBLE[1] + 0.6:
        u = smooth(TUMBLE[0], TUMBLE[1], w)
        roll += 2 * 2 * PI * u
        pitch_c += 0.5 * math.sin(u * PI * 2)
    if w >= TUMBLE[1] and v < JUMP_AT:
        roll += REST_ROLL * smooth(t_cake - 0.05, t_rest, w)
    if v >= JUMP_AT:
        roll = END_ROLL + 0.004 * vnoise(w * 0.5, 7)
    # hover wobble when it's holding still in someone's face (the kid's thumbs never quite still)
    wob = 0.025 * (1 - fpv) * smooth(0.0, 0.4, float(np.linalg.norm(p - drone_pos(0))))
    p = p + np.array([wob * vnoise(w * 0.9, 8), wob * 0.6 * vnoise(w * 1.1, 9), wob * vnoise(w * 0.8, 10)])
    if v >= 53.4:
        p = drone_pos(w)
    fov = 74.0 + 6.0 * smooth(3, 10, float(np.linalg.norm(vel)))
    if v >= JUMP_AT:
        # lying in the cake: the wide lens, so everyone leaning in fits; then the zoom onto the dog
        fov = 100.0 - 34.0 * smooth(67.8, 68.1, v)
    q = quat_from_euler_yxz(pitch_c, yaw_c, roll)
    # the ring box: a damped pendulum hanging from the drone (until the ribbon snaps in the cake)
    anchor = p + np.array([0, -0.06, 0])
    if box is None:
        box = anchor + np.array([0.0, -0.06, -0.3])  # resting on the grass in front of the drone
    if v < 3.6:
        # on the lawn: the box sits on the grass
        box = np.array([p[0] + 0.0, 0.035, p[2] - 0.32])
        boxv = np.zeros(3)
    elif w < t_cake:
        sub = 8
        h = (W[f] - W[f - 1]) / sub if f > 0 else dt / sub
        for _ in range(sub):
            boxv += np.array([0, -G, 0]) * h
            boxv *= math.exp(-0.9 * h)
            box = box + boxv * h
            d = box - anchor
            n = np.linalg.norm(d)
            if n > RIBBON:
                d = d / n
                box = anchor + d * RIBBON
                vr = boxv @ d
                if vr > 0:
                    boxv = boxv - d * vr
            if box[1] < 0.035:
                box[1] = 0.035
                boxv[1] = max(0.0, boxv[1])
                boxv[0] *= 0.6
                boxv[2] *= 0.6
    frames.append({
        "w": round(w, 5),
        "p": [round(float(x), 4) for x in p],
        "q": [round(float(x), 6) for x in q],
        "fov": round(fov, 3),
        "bt": [round(float(body_pitch - pitch * (1 - fpv) * 0), 4), round(float(body_roll), 4)],
        "box": [round(float(x), 4) for x in box],
        "speed": round(float(np.linalg.norm(vel)), 3),
        "fpv": round(fpv, 3),
    })
    prev_pos = p

# ----------------------------------------------------------------------------------------------------
# Clearances: the drone (0.24 m round its centre) and the ring box against everything it must miss
# ----------------------------------------------------------------------------------------------------

def guest_head(g):
    x, _, z = g["at"]
    return np.array([x, SEATED_HEAD, z + 0.06])


obst = []  # (name, kind, data)
for g in GUESTS:
    obst.append((f"guest r{g['row']}s{g['side']}{g['seat']}", "sphere", (guest_head(g), 0.2)))
for name, key in (("groom", "groom"), ("bride", "bride"), ("officiant", "officiant")):
    x, _, z = LAYOUT[key]
    obst.append((name, "capsule", (np.array([x, 0.0, z]), np.array([x, 1.4, z]), 0.24)))
    obst.append((name + " head", "sphere", (np.array([x, 1.66, z]), 0.14)))
obst.append(("arch L", "capsule", (np.array([-1.3, 0, 0]), np.array([-1.3, 2.75, 0]), 0.2)))
obst.append(("arch R", "capsule", (np.array([1.3, 0, 0]), np.array([1.3, 2.75, 0]), 0.2)))
obst.append(("arch top", "capsule", (np.array([-1.3, 2.75, 0]), np.array([1.3, 2.75, 0]), 0.25)))
for i, (tx, tz) in enumerate(LAYOUT["tables"]):
    # the table and its chairs (backs to 0.95 m), the flowers in the middle to 1.25 m
    obst.append((f"table {i}", "cyl", (np.array([tx, 0.0, tz]), LAYOUT["tableR"] + 0.45, 0.97)))
    obst.append((f"flowers {i}", "cyl", (np.array([tx, 0.0, tz]), 0.25, 1.28)))
cx, cy, cz = LAYOUT["chandelier"]
obst.append(("chandelier", "capsule", (np.array([cx, cy - 0.65, cz]), np.array([cx, 5.4, cz]), 0.55)))
bx, bz = LAYOUT["dj"]["booth"]
obst.append(("dj booth", "capsule", (np.array([bx, 0, bz]), np.array([bx, 1.2, bz]), 0.75)))
obst.append(("dj", "capsule", (np.array([29.35, 0, 8.4]), np.array([29.35, 1.5, 8.4]), 0.3)))
obst.append(("dj head", "sphere", (np.array([29.35, 1.68, 8.4]), 0.16)))
obst.append(("pourer", "capsule", (np.array([24.55, 0, -5.55]), np.array([24.55, 1.4, -5.55]), 0.22)))
obst.append(("pourer head", "sphere", (np.array([24.55, 1.56, -5.55]), 0.13)))
obst.append(("waiter out", "capsule", (np.array([16.4, 0, 2.45]), np.array([16.4, 1.5, 2.45]), 0.3)))
obst.append(("waiter tray", "sphere", (np.array([16.4, 1.75, 2.45]), 0.32)))
tent = LAYOUT["tent"]
for side_x in (tent["x0"], tent["x1"]):
    for z in np.arange(tent["z0"], tent["z1"] + 0.01, (tent["z1"] - tent["z0"]) / 6):
        obst.append((f"pole {side_x:.0f},{z:.1f}", "capsule", (np.array([side_x, 0, z]), np.array([side_x, tent["eave"], z]), 0.12)))
for side_z in (tent["z0"], tent["z1"]):
    for x in np.arange(tent["x0"], tent["x1"] + 0.01, 4.0):
        obst.append((f"pole {x:.0f},{side_z:.1f}", "capsule", (np.array([x, 0, side_z]), np.array([x, tent["eave"], side_z]), 0.12)))


def dist_point(o, pt):
    kind, data = o[1], o[2]
    if kind == "sphere":
        c, r = data
        return np.linalg.norm(pt - c) - r
    if kind == "cyl":
        c, r, top = data
        dr = math.hypot(pt[0] - c[0], pt[2] - c[2]) - r
        dy = pt[1] - top
        if dr <= 0:
            return dy
        if dy <= 0:
            return dr
        return math.hypot(dr, dy)
    a, b, r = data
    ab = b - a
    t = np.clip((pt - a) @ ab / (ab @ ab), 0, 1)
    return np.linalg.norm(pt - (a + ab * t)) - r


def roof_clear(pt):
    """Distance below the tent roof (positive inside and clear)."""
    if not (tent["x0"] < pt[0] < tent["x1"] and tent["z0"] < pt[2] < tent["z1"]):
        return 99
    xm = (tent["x0"] + tent["x1"]) / 2
    frac = abs(pt[0] - xm) / ((tent["x1"] - tent["x0"]) / 2)
    roof = tent["ridge"] + (tent["eave"] - tent["ridge"]) * frac
    return roof - pt[1]


report = {}
worst = []
for f, fr in enumerate(frames):
    v = f / FPS
    if v > 45.3:  # from here on it is meant to hit things
        break
    if v < 3.6:
        continue
    pt = np.array(fr["p"])
    bx_ = np.array(fr["box"])
    for o in obst:
        d1 = dist_point(o, pt) - 0.24
        d2 = dist_point(o, bx_) - 0.05
        d = min(d1, d2)
        if o[0] not in report or d < report[o[0]][0]:
            report[o[0]] = (d, round(v, 2), "drone" if d1 <= d2 else "box")
    rc = roof_clear(pt) - 0.3
    if rc < 0.3:
        worst.append(("roof", round(rc, 3), round(v, 2)))
    if pt[1] - 0.24 < 0.05 and v > 4:
        worst.append(("ground", round(pt[1], 3), round(v, 2)))

close = sorted(((d, n, t, who) for n, (d, t, who) in report.items()), key=lambda x: x[0])[:14]
print("closest approaches (clearance m, what, video s, drone/box):")
for d, n, t, who in close:
    flag = "  <-- HIT" if d < 0 else ("  (close)" if d < 0.15 else "")
    print(f"  {d:6.3f}  {n:22s} {t:6.2f}s {who}{flag}")
for w_ in worst[:10]:
    print("  !!", w_)

# ----------------------------------------------------------------------------------------------------
# When each guest feels the drone go over (for ducking) and when it is nearest
# ----------------------------------------------------------------------------------------------------

for g in GUESTS:
    hd = guest_head(g)
    best = (99, 0)
    for f, fr in enumerate(frames):
        v = f / FPS
        if v < 3.6 or v > 30:
            continue
        d = np.linalg.norm(np.array(fr["p"]) - hd)
        if d < best[0]:
            best = (d, v)
    g["nearest"] = [round(best[0], 3), round(best[1], 3)]

CUES = {
    "spinUp": 1.6,
    "liftoff": 3.6,
    "eyeToEye": 4.4,
    "reveal": 7.3,
    "ringsShot": 9.2,
    "couple": 14.6,
    "grab": 15.05,
    "yank": 15.3,
    "dip": 16.4,
    "hat": 16.9,
    "officiant": 20.6,
    "silence": 20.4,
    "groomLook": 25.9,
    "brideLook": 27.7,
    "throttle": 29.4,
    "top": 32.5,
    "drop": 32.5,
    "whip": 33.4,
    "waiter": 36.75,
    "tentIn": 37.2,
    "dj": 40.3,
    "chandelier": 43.1,
    "towerHit": 45.95,
    "tumble": 49.7,
    "cakeHit": 51.75,
    "rest": 53.4,
    "glitch": 54.6,
    "feedBack": 56.2,
    "baker": 56.7,
    "bride": 57.9,
    "groom": 59.1,
    "grandma": 60.4,
    "kid": 61.7,
    "dig": 63.2,
    "ribbon": 64.4,
    "point": 66.2,
    "dog": 67.6,
    "tilt": 69.2,
}
# the same moments in world time
CUES_W = {k: round(w_of_v(v), 4) for k, v in CUES.items()}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as fh:
    json.dump({"fps": FPS, "frames": frames, "layout": LAYOUT, "cues": CUES, "cuesW": CUES_W,
               "slow": [list(SLOW1), list(SLOW2)], "jump": [JUMP_AT, JUMP], "ribbon": RIBBON}, fh, separators=(",", ":"))
print("wrote", os.path.normpath(OUT), len(frames), "frames;", "world end", round(W[-1], 2),
      "tower", round(t_tower_in, 3), "cake", round(t_cake, 3))
