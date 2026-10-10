#!/usr/bin/env python3
"""
The sky around Sagittarius A*, baked into a cube map for the BlackHole composition's ray tracer.

From the centre of the galaxy the Milky Way is a band of star clouds all the way round (we're in its
plane), cut by dark dust lanes, over the glow of the nuclear star cluster, which is bright in every
direction. Near the centre there are red streamers of ionised gas (the "minispiral") and the odd blue
reflection nebula. Millions of faint stars are baked in here; the shader adds the bright, sharp ones.

The faces use the raw GL cube map convention (the shader samples them directly with a world direction):
  +X: (1, -t, -s)  -X: (-1, -t, s)  +Y: (s, 1, t)  -Y: (s, -1, -t)  +Z: (s, -t, 1)  -Z: (-s, -t, -1)
with s, t in [-1, 1] across and down the image.

    python3 scripts/generate-bh-sky.py   ->  public/blackhole/sky_{px,nx,py,ny,pz,nz}.jpg
"""

import os

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "blackhole")
N = int(os.environ.get("SKY_N", "2048"))

# the galactic plane: a great circle tilted 35 deg, passing 20 deg above the hole as you set off (so the
# lensing bends it into an arc over the shadow rather than a ring round it)
TILT = np.radians(35.0)
_n = np.array([-np.sin(TILT), np.cos(TILT), 0.0])
_lift = np.radians(-20.0)  # rotate the plane about the x axis
_rx = np.array([[1, 0, 0], [0, np.cos(_lift), -np.sin(_lift)], [0, np.sin(_lift), np.cos(_lift)]])
N_GAL = _rx @ _n
E1 = _rx @ np.array([0.0, 0.0, -1.0])
E2 = np.cross(N_GAL, E1)

rng = np.random.default_rng(2026)
GRID = rng.random((96, 96, 96)).astype(np.float32)
GRID2 = rng.random((96, 96, 96)).astype(np.float32)
ROTS = [np.linalg.qr(rng.standard_normal((3, 3)))[0] for _ in range(8)]


def noise(p, grid=GRID, oct_i=0):
    """Smooth periodic 3D value noise in [0, 1] at points p (3, M) in grid cells."""
    q = ROTS[oct_i % len(ROTS)] @ p
    return map_coordinates(grid, q, order=3, mode="grid-wrap")


def fbm(d, freq, octaves, grid=GRID, gain=0.5, seed=0):
    total = np.zeros(d.shape[1], dtype=np.float32)
    amp = 1.0
    norm = 0.0
    f = freq
    for i in range(octaves):
        total += amp * (noise(d * f + 13.7 * (i + seed), grid, i + seed) - 0.5)
        norm += amp
        amp *= gain
        f *= 2.03
    return 0.5 + total / norm * 1.6


def face_dirs(face):
    s = (np.arange(N) + 0.5) / N * 2 - 1
    ss, tt = np.meshgrid(s, s)
    one = np.ones_like(ss)
    x, y, z = {
        "px": (one, -tt, -ss),
        "nx": (-one, -tt, ss),
        "py": (ss, one, tt),
        "ny": (ss, -one, -tt),
        "pz": (ss, -tt, one),
        "nz": (-ss, -tt, -one),
    }[face]
    d = np.stack([x.ravel(), y.ravel(), z.ravel()])
    return d / np.linalg.norm(d, axis=0)


def sky(d):
    sb = N_GAL @ d  # sin(latitude)
    b = np.arcsin(np.clip(sb, -1, 1))
    lon = np.arctan2(E2 @ d, E1 @ d)
    # star clouds: mottled band + the cluster's glow everywhere
    clouds = fbm(d, 3.0, 6, seed=1)
    fine = fbm(d, 14.0, 4, seed=5)
    # the band's width breathes along its length
    wid = 1.0 + 0.45 * (fbm(d, 1.2, 3, GRID2, seed=11) - 0.5) * 2
    band = np.exp(-((b / (0.12 * wid)) ** 2)) * 1.0 + np.exp(-((b / (0.4 * wid)) ** 2)) * 0.28
    band *= np.clip(0.25 + 1.2 * clouds * (0.7 + 0.6 * fine), 0.05, 2.0) ** 1.6
    glow = 0.006 + 0.012 * np.exp(-((b / 0.9) ** 2))
    # dust: a broken lane wandering along the plane, and ragged clouds and filaments either side of it
    wob = (fbm(d, 1.6, 3, GRID2, seed=2) - 0.5) * 0.14
    lw = 0.025 + 0.03 * np.clip(fbm(d, 2.5, 3, GRID2, seed=4), 0, 1)
    breaks = np.clip((fbm(d, 3.5, 4, GRID2, seed=6) - 0.38) * 2.5, 0, 1)
    lane = np.exp(-(((b - wob) / lw) ** 2)) * breaks
    fil = np.clip((fbm(d, 6.0, 6, GRID2, seed=3) - 0.5) * 3.0, 0, 1) ** 1.3
    tau = 2.6 * lane * (0.4 + fine) + 2.2 * fil * np.exp(-((b / 0.22) ** 2))
    # colours: golden old stars in the band, bluer and fainter away from it
    warm = np.array([1.0, 0.8, 0.56])[:, None]
    cool = np.array([0.72, 0.8, 1.0])[:, None]
    mixk = np.clip(np.abs(b) / 0.6, 0, 1)[None, :]
    star_col = warm * (1 - mixk) + cool * mixk
    col = star_col * (band + glow)[None, :]
    redden = np.exp(-tau[None, :] * np.array([0.55, 0.8, 1.15])[:, None])
    col = col * redden
    # ionised gas near the centre of the view at the start: red streamers (H-alpha) and a blue haze
    ridge = 1 - np.abs(fbm(d, 4.5, 5, GRID2, seed=7) - 0.5) * 2
    streamers = np.clip((ridge - 0.6) * 2.5, 0, 1) ** 2 * np.clip(fbm(d, 3.0, 4, seed=8) * 1.4 - 0.3, 0, 1)
    region = np.exp(-((lon - 0.35) ** 2 / 0.5 + ((b - 0.12) / 0.32) ** 2))
    region += 0.7 * np.exp(-((lon + 2.2) ** 2 / 0.4 + ((b + 0.2) / 0.3) ** 2))
    col += np.array([1.0, 0.16, 0.24])[:, None] * (0.22 * streamers * region)[None, :]
    blue = np.clip(fbm(d, 2.2, 4, GRID2, seed=9) - 0.52, 0, 1) * np.exp(-((lon - 1.9) ** 2 / 0.3 + (b / 0.35) ** 2))
    col += np.array([0.3, 0.5, 1.0])[:, None] * (0.25 * blue)[None, :]
    return col


def faint_stars(shape):
    """Millions of faint stars, a few per hundred texels, power-law brightness, star colours."""
    h, w = shape
    img = np.zeros((3, h, w), dtype=np.float32)
    n = int(h * w * 0.03)
    ys = rng.integers(0, h, n)
    xs = rng.integers(0, w, n)
    lum = (rng.pareto(2.2, n) + 1) * 0.05
    lum = np.minimum(lum, 1.5)
    tcol = rng.random(n)
    cols = np.stack([
        0.75 + 0.25 * tcol,
        0.72 + 0.18 * (1 - np.abs(tcol - 0.5) * 2),
        1.0 - 0.45 * tcol,
    ])
    for c in range(3):
        np.add.at(img[c], (ys, xs), lum * cols[c])
    for c in range(3):
        img[c] = gaussian_filter(img[c], 0.55) * 3.0
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for face in ("px", "nx", "py", "ny", "pz", "nz"):
        d = face_dirs(face)
        col = sky(d).reshape(3, N, N)
        b = np.arcsin(np.clip(N_GAL @ d, -1, 1)).reshape(N, N)
        dens = 0.35 + 1.3 * np.exp(-((b / 0.25) ** 2))
        col += faint_stars((N, N)) * dens[None] * 0.22
        # soft shoulder into 8 bits (sRGB): the shader scales it back up
        v = col / (1 + col * 0.5)
        v = np.clip(v / 0.8, 0, 1)
        srgb = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
        im = (np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8).transpose(1, 2, 0)
        Image.fromarray(im).save(os.path.join(OUT, f"sky_{face}.jpg"), quality=90, subsampling=0)
        print(face, "mean", col.mean(axis=(1, 2)).round(4), "max", col.max().round(3))


if __name__ == "__main__":
    main()
