#!/usr/bin/env python3
"""
First-person track for the Hole composition: "POV: you jump into a hole through the Earth" (72 s at 30 fps).

Physics: a straight vacuum tunnel through the centre. Gravity inside the Earth from the PREM density model
(it rises to 1.09 g at the core-mantle boundary, then falls to zero at the centre); you fall from rest, reach
your top speed at the centre and coast up to the far side, arriving with zero speed about 38 minutes later.
The video compresses that into ~60 s with depth keys; the HUD shows the real depth, temperature, gravity,
speed and elapsed time for wherever you are.

Writes src/hole/track.json: per-frame camera (surface scenes in world space; in the shaft the camera stays
put and the walls scroll by `s`), the physics readouts, and the events the picture and the sound share.

    python3 scripts/generate-hole-path.py
"""

import json
import math
import os

import numpy as np
from scipy.interpolate import PchipInterpolator

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 30
DUR = 72.0
N = int(DUR * FPS)
R_E = 6371.0  # km
G = 6.674e-11

# ------------------------------------------------------------------ the Earth (PREM, continental crust)


def rho(r_km):
    """PREM density (kg/m^3) at radius r (km)."""
    x = r_km / R_E
    if r_km < 1221.5:
        d = 13.0885 - 8.8381 * x * x
    elif r_km < 3480.0:
        d = 12.5815 - 1.2638 * x - 3.6426 * x**2 - 5.5281 * x**3
    elif r_km < 5701.0:
        d = 7.9565 - 6.4761 * x + 5.5283 * x**2 - 3.0807 * x**3
    elif r_km < 5771.0:
        d = 5.3197 - 1.4836 * x
    elif r_km < 5971.0:
        d = 11.2494 - 8.0298 * x
    elif r_km < 6151.0:
        d = 7.1089 - 3.8045 * x
    elif r_km < 6346.6:
        d = 2.6910 + 0.6924 * x
    elif r_km < 6356.0:
        d = 2.900
    else:
        d = 2.600
    return d * 1000.0


rs = np.linspace(0, R_E, 63711)
dr = (rs[1] - rs[0]) * 1000.0
mass = np.concatenate([[0.0], np.cumsum([4 * math.pi * (r * 1000.0) ** 2 * rho(r) * dr for r in rs[1:]])])
g_r = np.where(rs > 0, G * mass / np.maximum(1.0, (rs * 1000.0) ** 2), 0.0)  # m/s^2
G_SURF = g_r[-1]
# fall from rest at the surface: v(r)^2 = 2 * integral_r^R g dr
pot = np.concatenate([np.cumsum((g_r[::-1][:-1] + g_r[::-1][1:]) / 2 * dr)[::-1], [0.0]])  # J/kg from r to R
v_r = np.sqrt(2 * pot)  # m/s
# time to fall from the surface to radius r: each step at the mean speed across it (exact for the first,
# uniformly accelerating step from rest, where 1/v blows up)
v_in = v_r[::-1]  # from the surface inward
dt_in = dr / np.maximum((v_in[:-1] + v_in[1:]) / 2, 1e-9)
t_r = np.concatenate([[0.0], np.cumsum(dt_in)])[::-1]
T_CENTRE = t_r[0]  # s


def at_depth(depth_km):
    r = max(0.0, R_E - depth_km)
    g = float(np.interp(r, rs, g_r)) / G_SURF
    v = float(np.interp(r, rs, v_r))
    tt = float(np.interp(r, rs, t_r))
    if depth_km < 0.5:  # free fall from rest, by hand (the integral is singular at the start)
        x = depth_km * 1000.0
        v = math.sqrt(2 * G_SURF * x)
        tt = math.sqrt(2 * x / G_SURF)
    return g, v, tt


def temperature(depth_km):
    """A geotherm (deg C): Kola measured 180 at 12 km; the core-mantle boundary jumps ~300; ~5,400 at the inner core."""
    keys = [
        (0, 15), (4, 60), (12.3, 180), (35, 600), (100, 1300), (150, 1400), (410, 1500), (660, 1900),
        (2890, 3700), (2890.1, 4000), (5150, 5400), (6371, 5500),
    ]
    xs, ys = zip(*keys)
    return float(np.interp(depth_km, xs, ys))


# ------------------------------------------------------------------ the video's depth keys
# video time (s) -> distance travelled along the tunnel (km); the far surface is at 2 R_E

FAR = 2 * R_E
DEPTH_KEYS = [
    (3.2, 0.0),
    (4.4, 0.012),
    (5.6, 0.045),
    (6.9, 0.105),  # the deepest subway station
    (7.9, 0.2),  # fossil beds
    (8.9, 0.3),  # the cave of crystals
    (10.8, 1.3),
    (12.7, 4.0),  # the deepest mine
    (15.6, 12.3),  # the deepest hole ever dug
    (18.5, 35.0),  # the crust ends
    (21.6, 150.0),  # diamonds
    (25.8, 660.0),
    (30.0, 2000.0),  # gravity is stronger here
    (34.0, 2890.0),  # outer core: liquid iron
    (38.0, 3900.0),  # the geodynamo
    (43.0, 5150.0),  # inner core
    (47.5, R_E),  # the centre
    (50.8, FAR - 5150.0),
    (53.8, FAR - 2890.0),
    (57.5, FAR - 660.0),
    (60.3, FAR - 35.0),
    (62.7, FAR - 1.0),
    (64.6, FAR),  # out of the far side
]


def dist_at(t):
    """Distance along the tunnel (km) at video time t: log-interpolated near each surface, smooth everywhere."""
    if t <= DEPTH_KEYS[0][0]:
        return 0.0
    if t >= DEPTH_KEYS[-1][0]:
        return FAR
    # interpolate the depth below the nearest surface in log space, separately for each half
    half1 = [(tt, d) for tt, d in DEPTH_KEYS if d <= R_E]
    half2 = [(tt, FAR - d) for tt, d in DEPTH_KEYS if d >= R_E]
    if t <= 47.5:
        ts, ds = zip(*half1)
        y = PchipInterpolator(ts, np.log10(np.array(ds) + 0.002))(t)
        return float(10**y - 0.002)
    ts, ds = zip(*half2)
    y = PchipInterpolator(ts, np.log10(np.array(ds) + 0.002))(t)
    return FAR - float(10**y - 0.002)


# ------------------------------------------------------------------ build


def main():
    t = np.arange(N) / FPS
    dist = np.array([dist_at(x) for x in t])
    depth = np.minimum(dist, FAR - dist)
    phys = [at_depth(d) for d in depth]
    gfrac = np.array([p[0] for p in phys])
    speed = np.array([p[1] for p in phys])  # m/s
    elapsed = np.array([p[2] if d <= R_E else 2 * T_CENTRE - p[2] for p, d in zip(phys, dist)])
    temp = np.array([temperature(d) for d in depth])

    # visual scroll of the shaft walls (m): a speed you can read, rising with the real speed, then slowing
    # to a stop as you coast out of the far side
    # (on the far side it coasts out through the surface and stops 2.35 m above it, at 66 s)
    vkeys_t = [0, 3.2, 4.4, 6.0, 9.0, 13.0, 18.5, 25.0, 34.0, 43.0, 47.5, 52.0, 58.0, 61.5, 63.2, 64.6, 66.0, 72]
    vkeys_v = [0, 0, 9, 16, 22, 34, 55, 80, 105, 130, 150, 130, 80, 40, 15, 6.5, 0, 0]
    vis = PchipInterpolator(vkeys_t, vkeys_v)(t)
    vis = np.maximum(vis, 0)
    s = np.concatenate([[0], np.cumsum((vis[1:] + vis[:-1]) / 2 / FPS)])

    # ---------------- the camera
    # The hole is where the plaza fountain was: axis at (HX, HZ), radius HR. You start a few steps back on the
    # north side looking south at it (the lit towers across the river behind), step to the rim, hop out over the
    # middle and drop. In the shaft the camera stops 80 m down and the walls scroll by: `wall` is how far below
    # the local surface you are along the shaft (from the far surface after the centre). Past the centre the
    # far side's world is up: you rise head-first, out of a hole on an island at night, hang there, fall back.
    HX, HZ, HR = -8.0, 3.0, 4.4
    EYE = 1.7
    CAM_DROP = 80.0
    PEAK = 2.35  # how far above the far rim your eye coasts before you stop
    S_END = float(s[-1]) - PEAK  # scroll at which you pass the far surface
    i_c = int(round(47.5 * FPS))
    S_C = float(s[i_c])
    side = (t >= 47.5).astype(int)
    wall = np.where(side == 0, s, S_END - s)
    # after hanging at the top you drop back in under real gravity
    T_DROP = 68.4
    fall = np.where(t > T_DROP, 0.5 * 9.81 * (t - T_DROP) ** 2, 0.0)
    wall = np.where(t > T_DROP, -PEAK + fall, wall)
    x = np.full(N, HX)
    z = np.full(N, HZ)
    y = np.zeros(N)
    # standing, stepping to the rim and hopping out over the middle in one smooth move (you leave the rim
    # at about 3.25 s, already moving, and drift out to the axis as you drop)
    z0 = HZ + 6.6
    u = np.clip((t - 2.2) / 2.7, 0, 1)
    z = z0 + (HZ - z0) * u**3 * (u * (6 * u - 15) + 10)
    lift = np.where((t >= 3.2) & (t < 3.6), 0.18 * np.sin(np.pi * (t - 3.2) / 0.4), 0.0)
    y = EYE - np.minimum(wall, CAM_DROP) + lift
    # a breath of a bob while you hang at the top
    hang = np.clip((t - 65.6) / 0.4, 0, 1) * np.clip((T_DROP - t) / 0.3, 0, 1)
    y = y + hang * 0.04 * np.sin((t - 65.6) * 2.4)
    # a slow sway about the axis while in the shaft (never near the walls)
    sway = np.clip((t - 4.6) / 2, 0, 1) * np.clip((61.5 - t) / 1.5, 0, 1)
    x = x + sway * 0.35 * np.sin(t * 0.45) + sway * 0.12 * np.sin(t * 1.3 + 1)
    z = z + sway * 0.3 * np.cos(t * 0.38 + 0.5)
    # look: yaw 0 faces -z (south); + turns toward -x
    LOOK = [  # time, yaw, pitch, roll
        (0.0, 0.0, -0.52, 0.0),
        (2.2, 0.02, -0.6, 0.0),
        (3.1, 0.0, -0.98, 0.0),
        (4.0, 0.05, -1.4, 0.02),
        (5.4, 0.1, -1.48, 0.0),
        (5.9, 0.3, 1.2, -0.04),  # look up: the sky shrinking, faces peering over the rim
        (6.4, 0.35, 1.3, -0.04),
        (6.95, 0.4, -1.35, 0.0),  # the train below
        (7.6, 1.2, -0.35, 0.03),  # the fossils
        (8.2, 1.9, -0.45, 0.0),
        (8.9, 3.0, -0.55, 0.04),  # the crystal cave
        (9.7, 3.6, -1.1, 0.0),
        (11.0, 3.7, -1.45, 0.0),
        (12.3, 4.6, -0.3, 0.03),  # the mine
        (13.3, 4.8, -1.2, 0.0),
        (16.0, 5.0, -1.48, 0.0),
        (19.0, 5.2, -1.3, 0.02),
        (21.4, 5.9, -0.45, 0.04),  # diamonds in the walls
        (22.6, 6.3, -0.6, 0.0),
        (24.5, 6.5, -1.45, 0.0),
        (28.0, 6.9, -1.2, 0.03),
        (31.0, 7.4, -0.7, 0.0),  # magma pouring across the walls
        (33.2, 7.6, -1.45, 0.0),
        (34.6, 7.9, -0.9, 0.0),  # into the core: an ocean of liquid iron
        (36.5, 9.0, -0.25, -0.03),
        (38.5, 10.2, 0.25, 0.03),  # the field lines overhead
        (40.5, 11.2, -0.35, 0.0),
        (42.6, 11.6, -1.4, 0.0),
        (45.0, 11.8, -1.48, 0.0),  # the white-hot crystals
        (47.2, 11.9, -1.5, 0.0),
        (47.8, 11.9, 1.5, 0.0),  # through the flash: now rising, head first, toward the far side
        (52.0, 12.1, 1.45, 0.0),
        (55.0, 12.4, 1.2, 0.03),
        (58.0, 12.6, 1.45, 0.0),
        (62.4, 12.8, 1.45, 0.0),
        (63.6, 12.9, 0.5, 0.0),  # out into the night
        (64.6, 13.0, -0.05, 0.0),
        (66.0, 13.9, 0.1, 0.02),  # the beach, the fire, the stars
        (67.6, 14.7, 0.25, 0.0),
        (68.6, 14.9, -0.3, 0.0),
        (69.6, 15.0, -1.3, 0.0),  # and back down the hole
        (72.0, 15.0, -1.45, 0.0),
    ]
    lt = [k[0] for k in LOOK]
    yaw = PchipInterpolator(lt, [k[1] for k in LOOK])(t)
    pitch = PchipInterpolator(lt, [k[2] for k in LOOK])(t)
    roll = PchipInterpolator(lt, [k[3] for k in LOOK])(t)
    # the pitch flips through the flash at the centre (the somersault happens in the white-out)
    flip = (t > 47.2) & (t < 47.8)
    pitch = np.where(flip, np.where(t < 47.5, -1.5, 1.5), pitch)
    fov = np.full(N, 74.0)
    rush = np.clip(vis / 150.0, 0, 1)
    fov = fov + 14 * rush ** 1.5  # speed widens the view
    fov = np.where(t > 62.5, 74 + (fov - 74) * np.clip((64 - t) / 1.5, 0, 1), fov)

    # where the set pieces sit along the shaft (wall coordinate, m), from when they should pass the eye
    def wall_at(tt):
        return float(np.interp(tt, t, wall))

    events = {
        "train": wall_at(6.9) + 2.0,
        "fossils": wall_at(7.75),
        "cave": wall_at(8.9),
        "mine": wall_at(12.6),
        "kola": wall_at(15.6),
        "moho": wall_at(18.5),
        "diamonds": wall_at(21.6),
        "magma": wall_at(31.0),
        "coreIn": wall_at(34.0),
        "coreOut": wall_at(43.0),
        "centre": S_C,
        "farCoreIn": float(S_END - np.interp(50.8, t, s)),
        "farCoreOut": float(S_END - np.interp(53.8, t, s)),
        "sEnd": S_END,
    }
    # wall coordinate -> physical depth (km), per side, for the shaft shader
    near_w = s[: i_c + 1]
    near_d = depth[: i_c + 1]
    far_w = (S_END - s)[i_c:][::-1]
    far_d = depth[i_c:][::-1]
    W_N = np.linspace(0, float(near_w[-1]) + 600, 2048)
    W_F = np.linspace(0, float(far_w[-1]) + 600, 2048)
    D_N = np.interp(W_N, near_w, near_d)
    D_F = np.interp(W_F, far_w, far_d)

    out = {
        "fps": FPS,
        "frames": N,
        "x": np.round(x, 4).tolist(),
        "y": np.round(y, 4).tolist(),
        "z": np.round(z, 4).tolist(),
        "yaw": np.round(yaw, 4).tolist(),
        "pitch": np.round(pitch, 4).tolist(),
        "roll": np.round(roll, 4).tolist(),
        "fov": np.round(fov, 2).tolist(),
        "side": side.tolist(),
        "wall": np.round(wall, 3).tolist(),
        "events": {k: round(v, 2) for k, v in events.items()},
        "wallDepth": {
            "near": {"w0": 0, "w1": float(W_N[-1]), "d": np.round(D_N, 4).tolist()},
            "far": {"w0": 0, "w1": float(W_F[-1]), "d": np.round(D_F, 4).tolist()},
        },
        "dist": np.round(dist, 4).tolist(),
        "depth": np.round(depth, 4).tolist(),
        "g": np.round(gfrac, 4).tolist(),
        "speed": np.round(speed, 1).tolist(),
        "elapsed": np.round(elapsed, 1).tolist(),
        "temp": np.round(temp, 1).tolist(),
        "s": np.round(s, 3).tolist(),
        "vis": np.round(vis, 3).tolist(),
        "tCentre": round(T_CENTRE, 1),
        "gMax": round(float(g_r.max() / G_SURF), 4),
        "vMax": round(float(v_r[0]), 1),
    }
    os.makedirs(os.path.join(ROOT, "src", "hole"), exist_ok=True)
    with open(os.path.join(ROOT, "src", "hole", "track.json"), "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"surface g {G_SURF:.3f} m/s2, max {g_r.max():.3f} m/s2 at r = {rs[np.argmax(g_r)]:.0f} km")
    print(f"centre speed {v_r[0] / 1000:.2f} km/s = {v_r[0] * 3.6:,.0f} km/h; surface-to-centre {T_CENTRE / 60:.1f} min,"
          f" through {2 * T_CENTRE / 60:.1f} min")
    for tt in (3.2, 6.9, 8.9, 12.7, 15.6, 18.5, 21.6, 30, 34, 38, 43, 47.5, 53.8, 60.3, 63.8):
        i = min(N - 1, int(round(tt * FPS)))
        print(f"t={tt:5.1f}  depth {depth[i]:9.3f} km  {temp[i]:6.0f} C  {gfrac[i]:.3f} g  {speed[i] * 3.6:9,.0f} km/h"
              f"  T+{elapsed[i] / 60:5.1f} min  s={s[i]:7.1f} m  vis={vis[i]:5.1f}")


if __name__ == "__main__":
    main()
