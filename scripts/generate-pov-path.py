#!/usr/bin/env python3
"""
First-person track for the Pov composition (66 s at 30 fps).

Simulates the viewer: walking across the plaza while gravity fades from 100% (at 4 s) to 0 (at 32 s),
leaping on a schedule (each leap higher and longer as g falls), the last leap at 28.5 s that never comes
down, then the updraft (the atmosphere rushing to space) carrying them up through the clouds to ~125 km.

Writes src/pov/track.json: per-frame camera position, look angles, fov, gravity, speed, plus events
(steps, take-offs, landings) that the picture and the sound both use.

    python3 scripts/generate-pov-path.py
"""

import json
import math
import os

import numpy as np
from scipy.interpolate import PchipInterpolator

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 30
DUR = 66.0
N = int(DUR * FPS)
SUB = 8  # physics substeps per frame
G0 = 9.81
EYE = 1.68


def gravity(t):
    return min(1.0, max(0.0, 1 - (t - 4) / 28))


# walking route (x, z); speed along it 1.3 m/s from t = 1.5
ROUTE = [(12, 23), (8, 16), (2.5, 7.5), (-1.6, 2), (-3.2, -5), (-5.4, -10.5), (-6.2, -12.2)]
SEG = [math.dist(ROUTE[i], ROUTE[i + 1]) for i in range(len(ROUTE) - 1)]
TOTAL = sum(SEG)


def route_at(s):
    s = max(0.0, min(TOTAL - 1e-6, s))
    for i, L in enumerate(SEG):
        if s <= L:
            a, b = ROUTE[i], ROUTE[i + 1]
            k = s / L
            return a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, math.atan2(-(b[0] - a[0]), -(b[1] - a[1]))
        s -= L
    a, b = ROUTE[-2], ROUTE[-1]
    return b[0], b[1], math.atan2(-(b[0] - a[0]), -(b[1] - a[1]))


JUMPS = [10.5, 13.5, 16.5, 19.5, 22.5, 25.5, 28.5]
V_JUMP = 3.2
WALK_V = 1.3


def simulate():
    dt = 1 / (FPS * SUB)
    s = 0.0
    y = 0.0
    vy = 0.0
    floating = False
    hx = 0.0  # horizontal drift once floating
    hz = 0.0
    fx = fz = 0.0
    steps, takeoffs, landings = [], [], []
    step_phase = 0.0
    jumps = list(JUMPS)
    out = []
    for f in range(N):
        for k in range(SUB):
            t = (f * SUB + k) * dt
            g = G0 * gravity(t)
            walking = t >= 1.5 and not floating
            if walking:
                if y <= 0 and vy <= 0:
                    s += WALK_V * dt
                    step_phase += WALK_V * dt / 0.72  # one step per 0.72 m
                    if step_phase >= 1:
                        step_phase -= 1
                        steps.append(round(t * FPS))
                else:
                    s += WALK_V * dt  # keep momentum through the air
            if jumps and t >= jumps[0] and y <= 0:
                vy = V_JUMP
                takeoffs.append(round(t * FPS))
                jumps.pop(0)
                if not jumps:
                    # the last leap: it will never come back down
                    floating = True
                    x0, z0, _ = route_at(s)
                    fx, fz = x0, z0
                    hx, hz = -0.35, -0.55
            if y > 0 or vy > 0:
                y += vy * dt
                vy -= g * dt
                if y <= 0:
                    landings.append((round(t * FPS), round(-vy, 3)))
                    y = 0
                    vy = 0
            if floating:
                fx += hx * dt
                fz += hz * dt
                hx *= 1 - 0.08 * dt
                hz *= 1 - 0.08 * dt
        t = f / FPS
        if floating:
            x, z = fx, fz
            heading = None
        else:
            x, z, heading = route_at(s)
        out.append({"t": t, "x": x, "y": y, "z": z, "vy": vy, "heading": heading, "floating": floating})
    return out, steps, takeoffs, landings


def smooth_angle(arr, win=9):
    a = np.unwrap(np.array(arr))
    k = np.hanning(win * 2 + 1)
    k /= k.sum()
    pad = np.pad(a, win, mode="edge")
    return np.convolve(pad, k, mode="valid")


def main():
    sim, steps, takeoffs, landings = simulate()
    t = np.array([p["t"] for p in sim])
    x = np.array([p["x"] for p in sim])
    z = np.array([p["z"] for p in sim])
    y = np.array([p["y"] for p in sim])

    # ---------------- altitude: physics until 36 s, then the updraft, interpolated in log space
    i36 = int(36 * FPS)
    keys_t = [34, 35, 36, 40, 44, 48, 51, 53.5, 57, 61, 64, 66]
    keys_a = [y[int(34 * FPS)] + EYE, y[int(35 * FPS)] + EYE, y[i36] + EYE, 16, 95, 430, 1500, 2600, 12000, 60000, 110000, 125000]
    curve = PchipInterpolator(keys_t, np.log(keys_a))
    alt = y + EYE
    tail = t >= 34
    alt[tail] = np.exp(curve(np.clip(t[tail], 34, 66)))

    # ---------------- look direction (yaw: 0 = north / -z, + turns west / -x; pitch + looks up)
    heading = []
    last = 0.78
    for p in sim:
        if p["heading"] is not None:
            last = p["heading"]
        heading.append(last)
    heading = smooth_angle(heading, 20)

    LOOK = [  # (time, yaw offset from heading or absolute, pitch, roll, absolute?)
        (0.0, 0.78, -0.10, 0.0, True),
        (1.5, 0.0, -0.08, 0.0, False),
        (5.5, 0.35, -0.12, 0.0, False),  # glance at the balloon cart
        (8.0, 0.0, -0.06, 0.0, False),
        (11.0, -0.25, 0.02, 0.0, False),  # kids bounding on the right
        (14.0, 0.0, 0.06, 0.0, False),
        (17.0, 0.95, 0.10, 0.0, False),  # the fountain, shooting high
        (20.5, 0.4, 0.05, 0.0, False),
        (24.0, 0.0, 0.0, 0.0, False),
        (27.5, 0.0, -0.05, 0.0, False),
        (29.5, 0.0, -0.75, 0.0, False),  # look down: the ground is not coming back
        (32.0, 0.2, -1.05, 0.05, False),
        (35.0, 1.2, -0.9, 0.08, False),
        (37.5, 1.9, 0.55, -0.05, False),  # look up: everything is going up
        (40.0, 2.2, 0.75, -0.08, False),
        (42.5, 2.6, -1.1, 0.0, False),  # straight down at the city falling away
        (47.5, 3.6, -1.25, 0.12, False),
        (50.0, 3.9, 0.85, 0.0, False),  # clouds coming
        (52.0, 4.1, 0.45, 0.0, False),
        (54.0, 4.6, -0.08, 0.0, False),  # sea of clouds, into the sun
        (58.0, 4.8, -0.32, 0.10, False),  # the curve of the planet
        (62.5, 5.0, -0.42, 0.14, False),
        (66.0, 5.1, -0.15, 0.10, False),
    ]
    lt = [k[0] for k in LOOK]

    def key_interp(idx):
        return PchipInterpolator(lt, [k[idx] for k in LOOK])(t)

    yaw_off = key_interp(1)
    pitch = key_interp(2)
    roll = key_interp(3)
    absolute = t < 1.5
    float_yaw_base = heading[takeoffs[-1]]
    yaw = np.where(absolute, yaw_off, np.where(t < takeoffs[-1] / FPS, heading + yaw_off, float_yaw_base + yaw_off))
    # blend the absolute start into the walking heading
    blend = np.clip((t - 0.5) / 2.0, 0, 1)
    yaw = np.where(t < 2.5, (1 - blend) * 0.78 + blend * (heading + yaw_off), yaw)

    # ---------------- head bob, step jolts, landing shake (deterministic noise)
    rng = np.random.default_rng(11)
    bob_y = np.zeros(N)
    bob_x = np.zeros(N)
    shake_p = np.zeros(N)
    shake_r = np.zeros(N)
    on_ground = (y <= 1e-4) & (t >= 1.5) & (t < takeoffs[-1] / FPS)
    phase = np.cumsum(np.where(on_ground, WALK_V / 0.72 * math.pi / FPS, 0.0))
    bob_y += np.where(on_ground, -np.abs(np.sin(phase)) * 0.035, 0)
    bob_x += np.where(on_ground, np.sin(phase) * 0.018, 0)
    shake_r += np.where(on_ground, np.sin(phase) * 0.006, 0)
    noise = rng.standard_normal((N, 2))
    # the landing shake is band-limited (a few frames wide) with a 3-frame attack, so a touchdown reads as a
    # thud and a nod rather than single frames popping
    soft = np.stack([np.convolve(noise[:, k], np.hanning(9)[1:-1], mode="same") for k in range(2)], axis=1)
    soft /= soft.std(axis=0)
    for f0, v in landings:
        amp = min(1.0, v / 5.0)
        for d in range(0, 22):
            f = f0 + d
            if f >= N:
                break
            e = amp * math.exp(-d / 5.0)
            bob_y[f] -= e * 0.16 * math.sin(d * 0.9)
            es = e * min(1.0, (d + 1) / 3.0)
            shake_p[f] += es * 0.03 * soft[f, 0] - e * 0.05 * math.sin(d * 0.5)
            shake_r[f] += es * 0.02 * soft[f, 1]
    # turbulence in the updraft
    turb = np.clip((t - 38) / 3, 0, 1) * np.clip((53 - t) / 3, 0, 1)
    smooth_noise = np.convolve(rng.standard_normal(N + 40), np.hanning(21) / np.hanning(21).sum(), mode="same")[:N]
    smooth_noise2 = np.convolve(rng.standard_normal(N + 40), np.hanning(21) / np.hanning(21).sum(), mode="same")[:N]
    shake_p += turb * smooth_noise * 0.06
    shake_r += turb * smooth_noise2 * 0.05

    # ---------------- speed + fov
    vel = np.gradient(alt) * FPS
    fov = 72 + np.clip(vel, 0, None) ** 0.5 * 0.0  # base
    rising = np.clip((t - 38.5) / 2.5, 0, 1) * np.clip((55 - t) / 3, 0, 1)
    fov = 72 + rising * 18
    for f0 in takeoffs:
        # long enough to decay to nothing: cutting it off while still 0.7 deg wide snapped the view 1% in a frame
        for d in range(0, 75):
            f = f0 + d
            if f < N:
                fov[f] += 4 * math.sin(min(1, d / 4) * math.pi / 2) * math.exp(-d / 10)

    track = {
        "fps": FPS,
        "frames": N,
        "x": np.round(x + bob_x * np.cos(yaw), 3).tolist(),
        "y": np.round(alt + bob_y, 3).tolist(),
        "z": np.round(z - bob_x * np.sin(yaw), 3).tolist(),
        "yaw": np.round(yaw, 4).tolist(),
        "pitch": np.round(pitch + shake_p, 4).tolist(),
        "roll": np.round(roll + shake_r, 4).tolist(),
        "fov": np.round(fov, 2).tolist(),
        "g": [round(gravity(tt), 4) for tt in t],
        "vel": np.round(vel, 2).tolist(),
        "steps": steps,
        "takeoffs": takeoffs,
        "landings": [[f, v] for f, v in landings],
        "floatAt": takeoffs[-1],
    }
    os.makedirs(os.path.join(ROOT, "src", "pov"), exist_ok=True)
    with open(os.path.join(ROOT, "src", "pov", "track.json"), "w") as fh:
        json.dump(track, fh, separators=(",", ":"))
    print("steps", len(steps), "takeoffs", takeoffs, "landings", landings)
    for tt in (0, 10, 20, 28.5, 30, 33, 36, 40, 44, 48, 51, 54, 58, 62, 66):
        i = min(N - 1, int(tt * FPS))
        print(f"t={tt:5.1f} alt={alt[i]:10.1f}  x={x[i]:6.1f} z={z[i]:6.1f}  g={gravity(tt):.2f}")


if __name__ == "__main__":
    main()
