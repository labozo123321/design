#!/usr/bin/env python3
"""
First-person track for the BlackHole composition: "POV: you fall into a black hole" (70 s at 30 fps).

The black hole is Sagittarius A*, at the centre of our galaxy: 4.3 million solar masses, a Schwarzschild
radius r_s of 12.7 million km. Everything visual is in units of r_s with the hole at the origin and its
accretion disk in the y = 0 plane (inner edge at the innermost stable orbit, 3 r_s).

The story, in video seconds:
   0-29   free fall from 26 r_s, swinging round over the disk (time-lapse: about an hour of your time)
  29-34   thrusters brake you to a hover at the photon sphere, 1.5 r_s
  34-38   looking along the photon sphere: half the sky is the black hole
  38-50   hovering lower and lower, 1 km, 1 m, 1 mm, 1 um above the horizon (real time): your clock
          creeps, Earth's races by years; the whole universe shrinks to a dot above you
  50-53.5 thrusters off: you fall, the sky behind you swells as you approach light speed
  53.5    the event horizon
  53.5-66 inside: about 66 s of your time to the singularity (shown 5x sped up), tidal stretching
  66-70   back to the opening shot (it loops)

Writes src/blackhole/track.json: per-frame camera (position, forward, up, fov, the observer's velocity for
the aberration), and the physics readouts for the HUD.

    python3 scripts/generate-bh-path.py
"""

import json
import math
import os

import numpy as np
from scipy.interpolate import PchipInterpolator

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 30
DUR = 70.0
N = int(DUR * FPS)

G = 6.674e-11
C = 2.998e8
M_SUN = 1.989e30
MASS = 4.3e6 * M_SUN
RS = 2 * G * MASS / C**2  # m
RS_KM = RS / 1000
T_RS = RS / C  # s: light-crossing time of r_s
GM_C3 = G * MASS / C**3  # s
SUN_D_KM = 1.3927e6

T_BRAKE = 29.0
T_HOVER = 34.3
T_DESCEND = 38.5
T_RELEASE = 50.0
T_HORIZON = 53.5
T_STRETCH = 60.5
T_END = 66.0
INSIDE_LAPSE = 66.0 / (T_END - T_HORIZON)  # the 66 s inside are shown sped up to fit


def pchip(keys, t):
    ks = np.array(keys, dtype=float)
    return PchipInterpolator(ks[:, 0], ks[:, 1])(np.clip(t, ks[0, 0], ks[-1, 0]))


def smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def main():
    t = np.arange(N) / FPS

    # ---------------- where you are (visual, r_s units)
    r_keys = [
        (0, 26.0), (5, 22.5), (10, 17.5), (15, 12.8), (20, 8.4), (25, 5.2), (29, 3.45),
        (31.5, 2.25), (33.4, 1.6), (T_HOVER, 1.5), (T_DESCEND, 1.5),
    ]
    r_vis = pchip(r_keys, t)
    # hovering lower: the physical altitude above the horizon (m), log-interpolated
    # (the sky closes in over about 4 s, 40.5 to 45: then 1 km, 1 m, 1 mm, 1 um above the horizon)
    # (the leading key holds the start level, so the descent eases in rather than lurching off at full speed)
    alt_keys = [(T_DESCEND - 0.5, 0.5 * RS), (T_DESCEND, 0.5 * RS), (40.5, 1.5e9), (42.5, 1.0e8), (44.0, 1.0e6), (45.3, 1.0e3), (46.3, 1.0),
                (47.2, 1.0e-3), (48.0, 1.0e-6), (T_RELEASE, 1.0e-6)]
    la = pchip([(a, math.log10(b)) for a, b in alt_keys], t)
    alt_hover = 10 ** la
    hovering_lower = t >= T_DESCEND
    # keep the height above the horizon (in r_s) separately: 1 um is 8e-17 r_s, below double precision of 1 + eps
    eps = np.where(hovering_lower, alt_hover / RS, r_vis - 1)
    r_phys = 1 + eps
    # the picture can't resolve the sky shrinking below ~5 px: hold the visual radius there
    r_vis = np.where(hovering_lower, 1 + np.maximum(alt_hover / RS, 2.0e-6), r_vis)
    # falling from the hover: physically you're at the horizon almost at once; the picture takes 3.5 s
    r_vis = np.where(t >= T_RELEASE, 1 + 1.0e-6 * (1 - smooth(T_RELEASE, T_HORIZON, t)) + 1.0e-6, r_vis)

    y_keys = [(0, 3.4), (10, 2.0), (20, 0.78), (25, 0.48), (29, 0.4), (31.5, 0.36), (T_HOVER, 0.35)]
    el = np.arcsin(np.clip(pchip(y_keys, t) / np.maximum(r_vis, 1.0), -1, 1))
    # once hovering, you descend straight down the same radial line
    el_hover = math.asin(0.35 / 1.5)
    el = np.where(t >= T_HOVER, el_hover, el)
    phi_keys = [(0, 0.0), (10, 0.5), (20, 1.15), (25, 1.75), (29, 2.25), (31.5, 2.5), (T_HOVER, 2.62)]
    phi = pchip(phi_keys, t)
    phi = np.where(t >= T_HOVER, 2.62, phi)

    rho = r_vis * np.cos(el)
    pos = np.stack([rho * np.sin(phi), r_vis * np.sin(el), rho * np.cos(phi)], axis=1)
    radial = pos / np.linalg.norm(pos, axis=1, keepdims=True)
    # the direction you're moving along the path (for aberration), and the orbit's tangent
    dpos = np.gradient(pos, axis=0)
    move = dpos / np.maximum(1e-9, np.linalg.norm(dpos, axis=1, keepdims=True))
    up_w = np.array([0.0, 1.0, 0.0])
    tang = np.cross(up_w, radial)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)  # the orbit's prograde direction (increasing phi)

    # ---------------- your speed relative to observers hovering where you are
    beta_ff = np.sqrt(1.0 / np.maximum(r_phys, 1.0))  # free fall from rest far away
    brake = 1 - smooth(T_BRAKE, T_HOVER, t)
    beta = np.where(t < T_HOVER, beta_ff * brake, 0.0)
    # dropped from rest at height eps0: relative to observers hovering where you pass, you reach
    # beta = sqrt(1 - (1 - 1/r) / (1 - 1/r0)), close to c at the horizon (in the picture's scaled-up heights,
    # so the dot of sky above you grows the way it really would: about twofold)
    eps_vis = r_vis - 1
    i_rel = int(round(T_RELEASE * FPS))
    e0 = eps_vis[i_rel]
    beta_drop = np.sqrt(np.clip(1 - (eps_vis / (1 + eps_vis)) / (e0 / (1 + e0)), 0, 1))
    beta = np.where(t >= T_RELEASE, beta_drop, beta)
    vdir = np.where((t >= T_RELEASE)[:, None], -radial, move)
    # the picture uses a softened aberration on the way in (0.6 of it), the full effect in the last plunge
    vis_k = np.where(t >= T_RELEASE, 1.0, 0.6)
    beta_vis = np.clip(beta * vis_k, 0, 0.995)

    # ---------------- where you look
    to_bh = -radial
    looks = {
        "in": to_bh,
        "tan": tang,
        "out": radial,
    }
    # weights: (time, in, tan, out)
    # once the shadow fills the view ahead (about 28 s), turn to look along the orbit: braking, the black
    # hole rises below you like a planet's horizon, until at the photon sphere it is exactly half the sky
    LW = [
        (0.0, 1, 0, 0), (27.6, 1, 0, 0), (31.2, 0, 1, 0), (T_DESCEND, 0, 1, 0),
        (T_DESCEND + 2.2, 0, 0, 1), (52.3, 0, 0, 1), (52.95, 0, 1, 0), (53.6, 1, 0, 0), (DUR, 1, 0, 0),
    ]
    lt = [k[0] for k in LW]
    w_in = np.interp(t, lt, [k[1] for k in LW])
    w_tan = np.interp(t, lt, [k[2] for k in LW])
    w_out = np.interp(t, lt, [k[3] for k in LW])
    sm = lambda x: x * x * (3 - 2 * x)  # noqa: E731
    w_in, w_tan, w_out = sm(w_in), sm(w_tan), sm(w_out)
    fwd = w_in[:, None] * looks["in"] + w_tan[:, None] * looks["tan"] + w_out[:, None] * looks["out"]
    # aim a little below the hole on the way in, so its lensed halo sits mid-frame; tilt up along the
    # photon sphere so the shadow's edge runs across the lower half
    fwd = fwd + (w_in * (1 - smooth(T_BRAKE, T_HOVER, t)) * -0.04)[:, None] * up_w
    fwd = fwd + (w_tan * 0.16)[:, None] * radial
    fwd /= np.linalg.norm(fwd, axis=1, keepdims=True)
    # that's where things are for an observer hovering here; you're moving, so aim where you see them
    # (aberration: n_o = [n_s + (g - 1)(n_s.b^)b^ + g b] / [g (1 + b.n_s)])
    bv = beta_vis[:, None] * vdir
    bm = np.maximum(np.linalg.norm(bv, axis=1, keepdims=True), 1e-12)
    bh = bv / bm
    gm = 1 / np.sqrt(1 - bm**2)
    ns_b = np.sum(fwd * bh, axis=1, keepdims=True)
    fwd = (fwd + (gm - 1) * ns_b * bh + gm * bv) / (gm * (1 + np.sum(fwd * bv, axis=1, keepdims=True)))
    fwd /= np.linalg.norm(fwd, axis=1, keepdims=True)
    # drift and shake: a slow wander on the way in; thrusters shake you braking and hovering
    rng = np.random.default_rng(7)

    def band_noise(scale, hann):
        x = rng.standard_normal(N)
        k = np.hanning(hann)
        k /= k.sum()
        return np.convolve(x, k, mode="same") * scale

    wander = np.stack([np.sin(t * 0.37) * 0.012 + np.sin(t * 0.71 + 1) * 0.006,
                       np.sin(t * 0.29 + 2) * 0.008, np.sin(t * 0.53 + 4) * 0.01], axis=1)
    shake_k = (smooth(T_BRAKE, T_BRAKE + 0.6, t) * (1 - smooth(T_HOVER - 0.3, T_HOVER + 1.2, t)) * 1.0
               + smooth(T_DESCEND, T_DESCEND + 0.5, t) * (1 - smooth(T_RELEASE - 0.2, T_RELEASE + 0.2, t)) * 0.35
               + np.exp(-np.maximum(0, t - T_RELEASE) * 3.0) * (t >= T_RELEASE) * 1.2)
    shake = np.stack([band_noise(1.0, 9), band_noise(1.0, 9), band_noise(1.0, 9)], axis=1) * 0.035 * shake_k[:, None]
    fwd = fwd + wander + shake
    fwd /= np.linalg.norm(fwd, axis=1, keepdims=True)
    # up: the galaxy's "up" looking in; away from the hole looking along the orbit (it's below you); and
    # looking straight out, the way you were facing (so turning between them is a plain tilt, no spin).
    # Roll slowly while you stare at the shrinking sky.
    roll = 0.25 * smooth(T_DESCEND + 2, 50, t) * np.sin((t - T_DESCEND) * 0.35)
    upv = w_in[:, None] * up_w + w_tan[:, None] * radial - w_out[:, None] * tang
    right = np.cross(fwd, upv)
    right /= np.linalg.norm(right, axis=1, keepdims=True)
    upv = np.cross(right, fwd)
    upv = upv * np.cos(roll)[:, None] + right * np.sin(roll)[:, None]
    fov_keys = [(0, 64), (20, 60), (T_BRAKE, 62), (T_HOVER, 72), (T_DESCEND, 76), (T_DESCEND + 2.5, 58),
                (T_RELEASE, 60), (T_HORIZON, 78), (T_END, 92), (DUR, 92)]
    fov = pchip(fov_keys, t)

    # the ending cuts back to the opening shot, so the video loops
    end = t >= T_END + 0.5
    pos[end] = pos[0]
    fwd[end] = fwd[0]
    upv[end] = upv[0]
    fov[end] = fov[0]
    beta_vis[end] = beta_vis[0]
    vdir[end] = vdir[0]
    eps_vis = eps_vis.copy()
    eps_vis[end] = eps_vis[0]

    # ---------------- readouts
    # after you let go, the last micrometre to the horizon goes by as you fall
    eps_show = np.where(t >= T_RELEASE, eps * (1 - smooth(T_RELEASE, T_HORIZON, t)), eps)
    dist_km = np.maximum(0, eps_show * RS_KM)
    # thrust to hold still at r (proper acceleration), in g; 1 - 1/r = eps / (1 + eps)
    a_hover = (C**2 / (2 * RS)) / (r_phys**2 * np.sqrt(eps / (1 + eps))) / 9.81
    thrust = np.where((t >= T_BRAKE) & (t < T_RELEASE), a_hover * np.clip((t - T_BRAKE) / 1.2, 0, 1), 0.0)
    # your clock and Earth's (seconds since you set off)
    tau = np.zeros(N)
    earth = np.zeros(N)
    # the approach is a time-lapse: real free-fall time from 26 r_s to each r
    tau_ff = (2.0 / 3.0) * (26.0**1.5 - np.minimum(r_phys, 26.0) ** 1.5) * T_RS
    for i in range(1, N):
        dtv = 1.0 / FPS
        if t[i] <= T_HOVER:
            tau[i] = max(tau[i - 1], tau_ff[i])
            r = r_phys[i]
            earth[i] = earth[i - 1] + (tau[i] - tau[i - 1]) / max(1e-6, 1 - 1 / r)
        elif t[i] <= T_HORIZON:
            tau[i] = tau[i - 1] + dtv
            f = 1 / math.sqrt(eps[i] / (1 + eps[i])) if t[i] < T_RELEASE else 1.0
            earth[i] = earth[i - 1] + dtv * f
        else:
            tau[i] = tau[i - 1]
            earth[i] = earth[i - 1]
    # inside: the 66 s to the singularity, sped up at first, then slowed right down for the last instant,
    # when the stretching actually happens (log-interpolated time left)
    T_INSIDE = math.pi * GM_C3
    left_keys = [(T_HORIZON, T_INSIDE), (56.5, 30.0), (58.5, 8.0), (60.5, 1.5), (62.5, 0.2), (64.0, 0.02),
                 (65.5, 0.002), (T_END, 0.0006)]
    time_left_in = 10 ** pchip([(a, math.log10(b)) for a, b in left_keys], t)
    tau = np.where(t > T_HORIZON, tau + (T_INSIDE - time_left_in), tau)
    lapse = np.where(t < T_HOVER, np.gradient(tau) * FPS, np.where(t < T_HORIZON, 1.0, np.gradient(tau) * FPS))
    # inside: falling from rest at the horizon, r = (1 + cos eta)/2 r_s, tau = M (eta + sin eta)
    tau_in = np.clip(T_INSIDE - time_left_in, 0, T_INSIDE * 0.999999)
    eta = np.zeros(N)
    for i in range(N):
        if t[i] > T_HORIZON:
            target = tau_in[i] / GM_C3
            lo, hi = 0.0, math.pi
            for _ in range(60):
                mid = (lo + hi) / 2
                if mid + math.sin(mid) < target:
                    lo = mid
                else:
                    hi = mid
            eta[i] = (lo + hi) / 2
    r_in = np.where(t > T_HORIZON, (1 + np.cos(eta)) / 2, r_phys)
    time_left = np.where(t > T_HORIZON, time_left_in, T_INSIDE)
    # tidal stretch across your 2 m body (g)
    tidal = C**2 * 2.0 / (RS**2 * np.maximum(1e-5, r_in) ** 3) / 9.81
    # speed shown: relative to hovering observers (outside), none inside; dropped from 1 um you reach
    # nearly c by the horizon
    e0p = eps[i_rel]
    beta_phys_drop = np.sqrt(np.clip(1 - (eps_show / (1 + eps_show)) / (e0p / (1 + e0p)), 0, 1))
    speed = np.where(t < T_RELEASE, beta, np.where(t < T_HORIZON, beta_phys_drop, 1.0))

    out = {
        "fps": FPS,
        "frames": N,
        "pos": np.round(pos, 7).tolist(),
        "fwd": np.round(fwd, 6).tolist(),
        "up": np.round(upv, 6).tolist(),
        "fov": np.round(fov, 3).tolist(),
        "beta": np.round(beta_vis, 5).tolist(),
        "vdir": np.round(vdir, 5).tolist(),
        "rVis": np.round(r_vis, 8).tolist(),
        "eVis": [float(f"{x:.6g}") for x in eps_vis],
        "rPhys": [float(f"{x:.12g}") for x in r_phys],
        "distKm": [float(f"{x:.6g}") for x in dist_km],
        "speed": np.round(speed, 4).tolist(),
        "thrust": [float(f"{x:.4g}") for x in thrust],
        "tidal": [float(f"{x:.4g}") for x in tidal],
        "tau": np.round(tau, 2).tolist(),
        "earth": [float(f"{x:.6g}") for x in earth],
        "lapse": np.round(lapse, 2).tolist(),
        "timeLeft": [float(f"{x:.4g}") for x in time_left],
        "events": {
            "brake": T_BRAKE, "hover": T_HOVER, "descend": T_DESCEND, "release": T_RELEASE,
            "horizon": T_HORIZON, "stretch": T_STRETCH, "end": T_END,
        },
        "consts": {"rsKm": RS_KM, "massSuns": 4.3e6, "insideS": math.pi * GM_C3, "insideLapse": INSIDE_LAPSE},
    }
    os.makedirs(os.path.join(ROOT, "src", "blackhole"), exist_ok=True)
    with open(os.path.join(ROOT, "src", "blackhole", "track.json"), "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"r_s = {RS_KM:,.0f} km (horizon {2 * RS_KM / 1e6:.1f} million km across = {2 * RS_KM / SUN_D_KM:.1f} Suns)")
    print(f"light-crossing r_s/c = {T_RS:.1f} s; horizon to singularity (from rest) = {math.pi * GM_C3:.1f} s")
    for tt in (0, 10, 20, 29, 34.3, 38.5, 40.5, 42.5, 44, 45.3, 46.3, 47.2, 48.0, 49.0, 49.9, 52, 53.4, 56, 60, 64, 65.9):
        i = min(N - 1, int(round(tt * FPS)))
        yrs = earth[i] / 3.156e7
        print(f"t={tt:5.1f} r={r_phys[i]:.10g} dist={dist_km[i]:.4g} km beta={speed[i]:.3f} thrust={thrust[i]:.3g} g "
              f"tidal={tidal[i]:.3g} g you={tau[i]:.0f}s earth={earth[i]:.4g}s ({yrs:.3g} yr) left={time_left[i]:.1f}s "
              f"fov={fov[i]:.0f}")


if __name__ == "__main__":
    main()
