import * as THREE from "three";

/**
 * One seamless 1024 x 1024 noise tile the shaft shader builds all of its rock from (deterministic: the
 * same pixels in every render tab).
 *   R  fine fBm (grain, speckle)          G  coarse warped fBm (blotches, band wobble)
 *   B  ridged noise (cracks and veins)     A  cellular edges (pebbles, crystal facets)
 */

const SIZE = 1024;

const hash2 = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Gradient tables per (period, seed): the angles are hashed once, not per lookup. */
const gradCache = new Map<string, Float32Array>();
const grads = (p: number, s: number) => {
  const key = `${p}:${s}`;
  let g = gradCache.get(key);
  if (!g) {
    g = new Float32Array(p * p * 2);
    for (let j = 0; j < p; j++)
      for (let i = 0; i < p; i++) {
        const a = hash2(i, j, s) * Math.PI * 2;
        g[(j * p + i) * 2] = Math.cos(a);
        g[(j * p + i) * 2 + 1] = Math.sin(a);
      }
    gradCache.set(key, g);
  }
  return g;
};

/** Periodic gradient (Perlin) noise in [0, 1]: no lattice-aligned creases, so ridges wander freely. */
const gnoise = (x: number, y: number, p: number, s: number) => {
  const g = grads(p, s);
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const x0 = ((xi % p) + p) % p;
  const y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p;
  const y1 = (y0 + 1) % p;
  const k00 = (y0 * p + x0) * 2;
  const k10 = (y0 * p + x1) * 2;
  const k01 = (y1 * p + x0) * 2;
  const k11 = (y1 * p + x1) * 2;
  const n00 = g[k00] * xf + g[k00 + 1] * yf;
  const n10 = g[k10] * (xf - 1) + g[k10 + 1] * yf;
  const n01 = g[k01] * xf + g[k01 + 1] * (yf - 1);
  const n11 = g[k11] * (xf - 1) + g[k11 + 1] * (yf - 1);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return (nx0 + (nx1 - nx0) * v) * 0.75 + 0.5;
};

const fbm = (u: number, v: number, base: number, oct: number, gain: number, s: number) => {
  let f = 0;
  let amp = 0.5;
  let norm = 0;
  let p = base;
  for (let i = 0; i < oct; i++) {
    f += amp * gnoise(u * p, v * p, p, s + i * 17);
    norm += amp;
    amp *= gain;
    p *= 2;
  }
  return f / norm;
};

const ridged = (u: number, v: number, base: number, oct: number, s: number) => {
  let f = 0;
  let amp = 0.5;
  let norm = 0;
  let p = base;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(gnoise(u * p, v * p, p, s + i * 31) * 2 - 1);
    f += amp * n * n;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return f / norm;
};

/** Distance to the nearest cell edge (F2 - F1) on a periodic jittered grid of `p` cells. */
const cellEdge = (u: number, v: number, p: number, s: number) => {
  const x = u * p;
  const y = v * p;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const wx = ((cx % p) + p) % p;
      const wy = ((cy % p) + p) % p;
      const px = cx + 0.15 + 0.7 * hash2(wx, wy, s);
      const py = cy + 0.15 + 0.7 * hash2(wx, wy, s + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) f2 = d;
    }
  return f2 - f1;
};

let tex: THREE.DataTexture | null = null;
export const rockTexture = () => {
  if (tex) return tex;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const r = fbm(u, v, 8, 6, 0.55, 11);
      // warp the coarse field by another, for the swirly blotches of real rock
      const wu = u + 0.08 * (fbm(u, v, 3, 3, 0.5, 41) - 0.5);
      const wv = v + 0.08 * (fbm(u, v, 3, 3, 0.5, 59) - 0.5);
      const g = fbm(((wu % 1) + 1) % 1, ((wv % 1) + 1) % 1, 3, 4, 0.5, 23);
      const b = ridged(u, v, 5, 4, 71);
      const a = Math.min(1, cellEdge(u, v, 24, 97) * 2.2);
      const k = (y * SIZE + x) * 4;
      data[k] = Math.round(Math.min(1, Math.max(0, (r - 0.5) * 1.9 + 0.5)) * 255);
      data[k + 1] = Math.round(Math.min(1, Math.max(0, (g - 0.5) * 2.2 + 0.5)) * 255);
      data[k + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
      data[k + 3] = Math.round(a * 255);
    }
  tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
};
