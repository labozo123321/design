import * as THREE from "three";
import { canvasTex, mat, rand } from "../../roadster/materials";

/**
 * Shared builders for the knock props: a geometry cache, normal maps from height functions, a hand-drawn
 * marker stroke font (no font files: every letter is a few jittered marker strokes), a signed-distance-field
 * mesher (surface nets) for the toys, a flat-cable sweep, and every procedural texture and material factory
 * (the note's lined paper, kraft board, the posters, the rugs, the bedding, phone screens).
 * Everything is deterministic (rand(seed)) and cached.
 */

export { mat, canvasTex, rand };

// ------------------------------------------------------------------------------------------------ caches
const geoCache = new Map<string, THREE.BufferGeometry>();
/** A geometry made once per key. */
export const geo = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
};
const anyCache = new Map<string, unknown>();
/** Anything made once per key. */
export const once = <T>(key: string, make: () => T): T => {
  if (!anyCache.has(key)) anyCache.set(key, make());
  return anyCache.get(key) as T;
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const sstep = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const fract = (x: number) => x - Math.floor(x);

/** A texture that shares a cached one's image with its own repeat (and wrap). */
export const withRepeat = (t: THREE.Texture, rx: number, ry: number) => {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
};

/** A tangent-space normal map from a tiling height function h(u, v) (u, v in [0,1), v up). */
export const normalFromFn = (key: string, w: number, h: number, fn: (u: number, v: number) => number, strength = 2) =>
  canvasTex(
    `nrm-${key}`,
    w,
    h,
    (g) => {
      const H = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = fn((x + 0.5) / w, 1 - (y + 0.5) / h);
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const hx = H[y * w + ((x + 1) % w)] - H[y * w + ((x - 1 + w) % w)];
          const hy = H[((y + 1) % h) * w + x] - H[((y - 1 + h) % h) * w + x];
          // canvas rows run down (v decreasing)
          let nx = -hx * strength;
          let ny = hy * strength;
          let nz = 1;
          const l = Math.hypot(nx, ny, nz);
          nx /= l;
          ny /= l;
          nz /= l;
          const o = (y * w + x) * 4;
          img.data[o] = (nx * 0.5 + 0.5) * 255;
          img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
          img.data[o + 2] = (nz * 0.5 + 0.5) * 255;
          img.data[o + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    undefined,
    false,
  );

/** A colour map drawn per pixel (u, v in [0,1), v up) as [r,g,b] 0..255. */
export const pixelTex = (key: string, w: number, h: number, fn: (u: number, v: number, x: number, y: number) => [number, number, number] | [number, number, number, number], srgb = true) =>
  canvasTex(
    key,
    w,
    h,
    (g) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const c = fn((x + 0.5) / w, 1 - (y + 0.5) / h, x, y);
          const o = (y * w + x) * 4;
          img.data[o] = c[0];
          img.data[o + 1] = c[1];
          img.data[o + 2] = c[2];
          img.data[o + 3] = c.length > 3 ? (c as number[])[3] : 255;
        }
      g.putImageData(img, 0, 0);
    },
    undefined,
    srgb,
  );

const noiseCache = new Map<string, (u: number, v: number) => number>();
/** Tiling value noise (0..1) on an n x n lattice, smooth (each lattice is made once and cached). */
export const tileNoise = (seed: number, n: number) => {
  const key = `${seed}:${n}`;
  const hit = noiseCache.get(key);
  if (hit) return hit;
  const r = rand(seed);
  const L = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) L[i] = r();
  const fn = (u: number, v: number) => {
    const x = fract(u) * n;
    const y = fract(v) * n;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = L[(j % n) * n + (i % n)];
    const b = L[(j % n) * n + ((i + 1) % n)];
    const c = L[((j + 1) % n) * n + (i % n)];
    const d = L[((j + 1) % n) * n + ((i + 1) % n)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  noiseCache.set(key, fn);
  return fn;
};

const hex2rgb = (h: string): [number, number, number] => {
  const c = new THREE.Color(h);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
};
// (THREE.Color stores linear values when colour management is on; read hex the plain way instead)
const rgbOf = (h: string): [number, number, number] => {
  const s = h.replace("#", "");
  if (s.length === 6) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  return hex2rgb(h);
};
export const mixRGB = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
export { rgbOf };

// ------------------------------------------------------------------------------------ marker stroke font
type Pt = [number, number];
type Glyph = Pt[][];
/** an elliptical arc (degrees, y up) as points */
const E = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 0): Pt[] => {
  const k = n || Math.max(6, Math.ceil(Math.abs(a1 - a0) / 15));
  const out: Pt[] = [];
  for (let i = 0; i <= k; i++) {
    const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / k);
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
};
const cat = (...parts: Pt[][]): Pt[] => parts.flat();
const dot = (x: number, y: number): Pt[] => [
  [x - 0.012, y + 0.01],
  [x + 0.012, y - 0.01],
];

/** Single-stroke glyphs: cap height 1, baseline 0, x-height 0.62. */
const GLYPHS: Record<string, Glyph> = {
  A: [[[0, 0], [0.32, 1], [0.64, 0]], [[0.14, 0.38], [0.5, 0.38]]],
  B: [[[0, 0], [0, 1]], cat([[0, 1], [0.28, 1]], E(0.28, 0.76, 0.22, 0.24, 90, -90), [[0, 0.52], [0.32, 0.52]], E(0.32, 0.26, 0.26, 0.26, 90, -90), [[0, 0]])],
  C: [E(0.36, 0.5, 0.36, 0.5, 48, 312)],
  D: [[[0, 0], [0, 1]], cat([[0, 1], [0.22, 1]], E(0.22, 0.5, 0.38, 0.5, 90, -90), [[0, 0]])],
  E: [[[0.56, 1], [0, 1], [0, 0], [0.58, 0]], [[0, 0.52], [0.44, 0.52]]],
  F: [[[0.56, 1], [0, 1], [0, 0]], [[0, 0.52], [0.44, 0.52]]],
  G: [cat(E(0.36, 0.5, 0.36, 0.5, 45, 345), [[0.72, 0.42], [0.42, 0.42]])],
  H: [[[0, 0], [0, 1]], [[0.6, 0], [0.6, 1]], [[0, 0.52], [0.6, 0.52]]],
  I: [[[0.08, 0], [0.08, 1]]],
  J: [cat([[0.46, 1], [0.46, 0.26]], E(0.24, 0.26, 0.22, 0.26, 0, -180))],
  K: [[[0, 0], [0, 1]], [[0.56, 1], [0, 0.4]], [[0.18, 0.6], [0.6, 0]]],
  L: [[[0, 1], [0, 0], [0.52, 0]]],
  M: [[[0, 0], [0.05, 1], [0.38, 0.32], [0.71, 1], [0.76, 0]]],
  N: [[[0, 0], [0, 1], [0.6, 0], [0.6, 1]]],
  O: [E(0.36, 0.5, 0.36, 0.5, 100, 470)],
  P: [cat([[0, 0], [0, 1], [0.3, 1]], E(0.3, 0.74, 0.26, 0.26, 90, -90), [[0, 0.48]])],
  Q: [E(0.36, 0.5, 0.36, 0.5, 100, 470), [[0.42, 0.24], [0.78, -0.06]]],
  R: [cat([[0, 0], [0, 1], [0.3, 1]], E(0.3, 0.74, 0.26, 0.26, 90, -90), [[0, 0.48]]), [[0.24, 0.48], [0.6, 0]]],
  S: [cat(E(0.3, 0.75, 0.28, 0.25, 25, 270), E(0.3, 0.25, 0.3, 0.25, 90, -155))],
  T: [[[0, 1], [0.62, 1]], [[0.31, 1], [0.31, 0]]],
  U: [cat([[0, 1], [0, 0.32]], E(0.3, 0.32, 0.3, 0.32, 180, 360), [[0.6, 1]])],
  V: [[[0, 1], [0.31, 0], [0.62, 1]]],
  W: [[[0, 1], [0.2, 0], [0.41, 0.72], [0.62, 0], [0.82, 1]]],
  X: [[[0, 1], [0.6, 0]], [[0.6, 1], [0, 0]]],
  Y: [[[0, 1], [0.31, 0.5], [0.62, 1]], [[0.31, 0.5], [0.31, 0]]],
  Z: [[[0, 1], [0.6, 1], [0, 0], [0.62, 0]]],
  "0": [E(0.3, 0.5, 0.3, 0.5, 90, 450)],
  "1": [[[0.06, 0.78], [0.26, 1], [0.26, 0]]],
  "2": [cat(E(0.28, 0.72, 0.27, 0.27, 165, -35), [[0, 0], [0.6, 0]])],
  "3": [cat(E(0.27, 0.76, 0.24, 0.24, 155, -90), E(0.27, 0.27, 0.29, 0.27, 90, -155))],
  "4": [[[0.46, 0], [0.46, 1], [0, 0.32], [0.64, 0.32]]],
  "5": [cat([[0.56, 1], [0.08, 1], [0.04, 0.58]], E(0.3, 0.32, 0.3, 0.32, 125, -155))],
  "6": [cat(E(0.34, 0.55, 0.3, 0.45, 70, 180), E(0.31, 0.3, 0.29, 0.3, 180, 545))],
  "7": [[[0, 1], [0.6, 1], [0.2, 0]]],
  "8": [E(0.3, 0.76, 0.23, 0.24, -90, 270), E(0.3, 0.27, 0.29, 0.27, 90, 450)],
  "9": [E(0.3, 0.7, 0.28, 0.3, 0, 360), [[0.58, 0.7], [0.48, 0]]],
  "'": [[[0.06, 1], [0.03, 0.74]]],
  "’": [[[0.06, 1], [0.03, 0.74]]],
  "—": [[[0, 0.47], [0.86, 0.5]]],
  "–": [[[0, 0.47], [0.6, 0.49]]],
  "-": [[[0, 0.46], [0.36, 0.47]]],
  ".": [dot(0.04, 0.02)],
  ",": [[[0.06, 0.06], [0.0, -0.16]]],
  "!": [[[0.06, 1], [0.05, 0.3]], dot(0.05, 0.02)],
  "?": [cat(E(0.25, 0.74, 0.25, 0.26, 160, -50), [[0.29, 0.5], [0.29, 0.3]]), dot(0.29, 0.02)],
  ":": [dot(0.05, 0.55), dot(0.05, 0.03)],
  "/": [[[0, 0], [0.42, 1]]],
  "+": [[[0, 0.45], [0.5, 0.45]], [[0.25, 0.2], [0.25, 0.7]]],
  "&": [[[0.62, 0], [0.12, 0.62], [0.12, 0.86], [0.3, 1], [0.44, 0.86], [0.36, 0.66], [0.05, 0.36], [0.06, 0.1], [0.26, 0], [0.48, 0.12], [0.62, 0.34]]],
  "♥": [[[0.32, 0], [0.04, 0.38], [0.02, 0.62], [0.16, 0.76], [0.32, 0.62], [0.48, 0.76], [0.62, 0.62], [0.6, 0.38], [0.32, 0]]],
  a: [E(0.26, 0.31, 0.26, 0.31, 10, 370), [[0.52, 0.62], [0.54, 0]]],
  b: [[[0, 1], [0, 0]], E(0.26, 0.31, 0.26, 0.31, 180, 540)],
  c: [E(0.28, 0.31, 0.28, 0.31, 40, 320)],
  d: [E(0.26, 0.31, 0.26, 0.31, 0, 360), [[0.52, 1], [0.52, 0]]],
  e: [cat([[0.04, 0.32], [0.54, 0.32]], E(0.28, 0.31, 0.27, 0.31, 5, 320))],
  f: [cat(E(0.36, 0.84, 0.16, 0.16, 30, 180), [[0.2, 0.84], [0.2, 0]]), [[0.04, 0.6], [0.4, 0.6]]],
  g: [E(0.26, 0.33, 0.26, 0.29, 0, 360), cat([[0.52, 0.62], [0.52, -0.1]], E(0.27, -0.1, 0.25, 0.22, 0, -165))],
  h: [[[0, 1], [0, 0]], cat([[0, 0.38]], E(0.25, 0.38, 0.25, 0.24, 180, 0), [[0.5, 0]])],
  i: [[[0.06, 0.62], [0.06, 0]], dot(0.06, 0.86)],
  j: [cat([[0.22, 0.62], [0.22, -0.12]], E(0.06, -0.12, 0.16, 0.18, 0, -165)), dot(0.22, 0.86)],
  k: [[[0, 1], [0, 0]], [[0.42, 0.62], [0, 0.24]], [[0.14, 0.36], [0.46, 0]]],
  l: [[[0.06, 1], [0.06, 0]]],
  m: [[[0, 0.62], [0, 0]], cat([[0, 0.4]], E(0.18, 0.42, 0.18, 0.2, 180, 0), [[0.36, 0]]), cat([[0.36, 0.42]], E(0.54, 0.42, 0.18, 0.2, 180, 0), [[0.72, 0]])],
  n: [[[0, 0.62], [0, 0]], cat([[0, 0.38]], E(0.24, 0.38, 0.24, 0.24, 180, 0), [[0.48, 0]])],
  o: [E(0.27, 0.31, 0.27, 0.31, 100, 465)],
  p: [[[0, 0.62], [0, -0.36]], E(0.26, 0.31, 0.26, 0.31, 180, 540)],
  q: [E(0.26, 0.31, 0.26, 0.31, 0, 360), [[0.52, 0.62], [0.52, -0.36]]],
  r: [[[0, 0.62], [0, 0]], cat([[0, 0.34]], E(0.22, 0.38, 0.22, 0.22, 180, 55))],
  s: [cat(E(0.22, 0.46, 0.2, 0.16, 25, 270), E(0.22, 0.15, 0.22, 0.15, 90, -150))],
  t: [cat([[0.18, 0.92], [0.18, 0.1]], E(0.32, 0.1, 0.14, 0.1, 180, 320)), [[0, 0.6], [0.38, 0.6]]],
  u: [cat([[0, 0.62], [0, 0.24]], E(0.24, 0.24, 0.24, 0.24, 180, 360), [[0.48, 0.62]]), [[0.48, 0.62], [0.5, 0]]],
  v: [[[0, 0.62], [0.25, 0], [0.5, 0.62]]],
  w: [[[0, 0.62], [0.17, 0], [0.34, 0.45], [0.51, 0], [0.68, 0.62]]],
  x: [[[0, 0.62], [0.48, 0]], [[0.48, 0.62], [0, 0]]],
  y: [[[0, 0.62], [0.26, 0.04]], [[0.52, 0.62], [0.2, -0.3], [0.04, -0.36]]],
  z: [[[0, 0.62], [0.48, 0.62], [0, 0], [0.5, 0]]],
};
const glyphW = (ch: string) => {
  if (ch === " ") return 0.42;
  const g = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()];
  if (!g) return 0.42;
  let m = 0;
  for (const s of g) for (const p of s) m = Math.max(m, p[0]);
  return m;
};
const ADV = 0.2;

export type MarkerOpts = { seed?: number; width?: number; slant?: number; jitter?: number; alpha?: number; spacing?: number };

/** The width of a line of marker text at cap height `size` (px). */
export const markerWidth = (text: string, size: number, spacing = ADV) => {
  let w = 0;
  for (const ch of text) w += (glyphW(ch) + spacing) * size;
  return Math.max(0, w - spacing * size);
};

/** Hand-written marker text: each glyph jittered (scale, baseline, tilt), smooth round-capped strokes;
 * overlapping strokes read darker like real ink. (x, y) is the left end of the baseline. */
export const drawMarker = (g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, o: MarkerOpts = {}) => {
  const r = rand(o.seed ?? 11);
  const lw = o.width ?? size * 0.13;
  const slant = o.slant ?? 0.06;
  const jit = o.jitter ?? 1;
  g.save();
  g.strokeStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = lw;
  g.globalAlpha = o.alpha ?? 0.9;
  let cx = x;
  for (const ch of text) {
    const gl = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()];
    const adv = (glyphW(ch) + (o.spacing ?? ADV)) * size;
    if (!gl) {
      cx += adv;
      continue;
    }
    const sc = size * (1 + (r() - 0.5) * 0.1 * jit);
    const by = y + (r() - 0.5) * 0.08 * size * jit;
    const rot = (r() - 0.5) * 0.08 * jit;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    for (const stroke of gl) {
      const pts = stroke.map(([gx, gy]) => {
        const px = (gx + slant * gy) * sc + (r() - 0.5) * 0.025 * size * jit;
        const py = -gy * sc + (r() - 0.5) * 0.025 * size * jit;
        return [cx + px * cs - py * sn, by + px * sn + py * cs] as Pt;
      });
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      if (pts.length <= 5) for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      else {
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        const l = pts[pts.length - 1];
        g.lineTo(l[0], l[1]);
      }
      g.stroke();
      // a little ink pooled where the pen lifted
      const e = pts[pts.length - 1];
      g.beginPath();
      g.arc(e[0], e[1], lw * 0.55, 0, Math.PI * 2);
      g.fillStyle = color;
      g.globalAlpha = (o.alpha ?? 0.9) * 0.35;
      g.fill();
      g.globalAlpha = o.alpha ?? 0.9;
    }
    cx += adv;
  }
  g.restore();
};

/** Wrap text (explicit \n, and a break before " — " or at spaces) into lines that fit maxW px. */
export const markerLines = (text: string, size: number, maxW: number) => {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(" ");
    let line = "";
    for (const w of words) {
      const tryL = line ? `${line} ${w}` : w;
      if (markerWidth(tryL, size) <= maxW || !line) line = tryL;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
};

/** A centred block of marker text that fits (w, h) px around (cx, cy); returns the size used. */
export const drawMarkerBlock = (g: CanvasRenderingContext2D, text: string, cx: number, cy: number, w: number, h: number, color: string, o: MarkerOpts & { maxSize?: number; wrap?: boolean } = {}) => {
  let size = o.maxSize ?? h * 0.4;
  const lay = (sz: number) => (o.wrap === false ? text.split("\n") : markerLines(text, sz, w));
  let lines = lay(size);
  for (let i = 0; i < 40; i++) {
    lines = lay(size);
    const lw = Math.max(...lines.map((l) => markerWidth(l, size)));
    const lh = lines.length * size * 1.45 - size * 0.45;
    if (lw <= w && lh <= h) break;
    size *= 0.93;
  }
  const lh = size * 1.45;
  const total = lines.length * lh - size * 0.45;
  lines.forEach((l, i) => {
    const lw = markerWidth(l, size);
    drawMarker(g, l, cx - lw / 2 + (i % 2 ? size * 0.12 : 0), cy - total / 2 + size + i * lh, size, color, { ...o, seed: (o.seed ?? 3) + i * 17 });
  });
  return size;
};

// ------------------------------------------------------------------------------------- SDF surface nets
export type Sdf = (x: number, y: number, z: number) => number;
export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
export const sdSphere = (x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number) => Math.hypot(x - cx, y - cy, z - cz) - r;
/** an ellipsoid (iq's bound) */
export const sdEll = (x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) => {
  const px = (x - cx) / rx;
  const py = (y - cy) / ry;
  const pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
};
/** iq's round cone between a (radius r1) and b (radius r2) */
export const sdRoundCone = (x: number, y: number, z: number, a: [number, number, number], b: [number, number, number], r1: number, r2: number) => {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = x - a[0];
  const pay = y - a[1];
  const paz = z - a[2];
  const yy = pax * bax + pay * bay + paz * baz;
  const zz = yy - l2;
  const xvx = pax * l2 - bax * yy;
  const xvy = pay * l2 - bay * yy;
  const xvz = paz * l2 - baz * yy;
  const x2 = xvx * xvx + xvy * xvy + xvz * xvz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
};
export const sdCapsule = (x: number, y: number, z: number, a: [number, number, number], b: [number, number, number], r: number) => sdRoundCone(x, y, z, a, b, r, r);
export const sdRoundBox = (x: number, y: number, z: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r: number) => {
  const qx = Math.abs(x - cx) - hx + r;
  const qy = Math.abs(y - cy) - hy + r;
  const qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};

export type SdfMesh = { geometry: THREE.BufferGeometry; com: THREE.Vector3; volume: number };

/**
 * Surface nets over an SDF (negative inside) in the box [min, max] at a grid step: one vertex per crossing
 * cell (averaged edge crossings, then projected onto the surface), quads across every crossing edge, and
 * gradient normals. A coarse pass skips the far field. color(x,y,z) paints vertex colours (linear 0..1).
 */
export const sdfMesh = (f: Sdf, min: [number, number, number], max: [number, number, number], step: number, color?: (x: number, y: number, z: number) => [number, number, number]): SdfMesh => {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const V = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  // a coarse pass (every 4th point) to skip the far field
  const C = 4;
  const cx = Math.ceil(nx / C) + 1;
  const cy = Math.ceil(ny / C) + 1;
  const cz = Math.ceil(nz / C) + 1;
  const CV = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) CV[i + cx * (j + cy * k)] = f(min[0] + i * C * step, min[1] + j * C * step, min[2] + k * C * step);
  const band = C * step * 1.9;
  let inside = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const ci = Math.round(i / C);
        const cj = Math.round(j / C);
        const ck = Math.round(k / C);
        const cv = CV[ci + cx * (cj + cy * ck)];
        const x = min[0] + i * step;
        const y = min[1] + j * step;
        const z = min[2] + k * step;
        const v = Math.abs(cv) > band ? cv : f(x, y, z);
        V[id(i, j, k)] = v;
        if (v < 0) {
          inside++;
          sx += x;
          sy += y;
          sz += z;
        }
      }
  const cellId = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const P: number[] = [];
  const corner = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const cv8 = new Float32Array(8);
  const grad = (x: number, y: number, z: number, h: number) => {
    const gx = f(x + h, y, z) - f(x - h, y, z);
    const gy = f(x, y + h, z) - f(x, y - h, z);
    const gz = f(x, y, z + h) - f(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = V[id(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
          cv8[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        let n = 0;
        for (const [a, b] of edges) {
          const va = cv8[a];
          const vb = cv8[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          ax += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
          ay += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
          az += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
          n++;
        }
        let x = min[0] + (i + ax / n) * step;
        let y = min[1] + (j + ay / n) * step;
        let z = min[2] + (k + az / n) * step;
        // project onto the surface (kept inside its cell)
        for (let it = 0; it < 2; it++) {
          const d = f(x, y, z);
          const g = grad(x, y, z, step * 0.25);
          x -= g[0] * d;
          y -= g[1] * d;
          z -= g[2] * d;
        }
        const x0 = min[0] + i * step;
        const y0 = min[1] + j * step;
        const z0 = min[2] + k * step;
        x = Math.min(x0 + step, Math.max(x0, x));
        y = Math.min(y0 + step, Math.max(y0, y));
        z = Math.min(z0 + step, Math.max(z0, z));
        cellV[cellId(i, j, k)] = P.length / 3;
        P.push(x, y, z);
      }
  const I: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) {
      const t = b;
      b = d;
      d = t;
    }
    // split along the shorter diagonal
    const dac = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const dbd = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (dac <= dbd) I.push(a, b, c, a, c, d);
    else I.push(a, b, d, b, c, d);
  };
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v0 = V[id(i, j, k)];
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) {
          const v1 = V[id(i + 1, j, k)];
          if (v0 < 0 !== v1 < 0) quad(cellV[cellId(i, j - 1, k - 1)], cellV[cellId(i, j, k - 1)], cellV[cellId(i, j, k)], cellV[cellId(i, j - 1, k)], !(v0 < 0));
        }
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) {
          const v1 = V[id(i, j + 1, k)];
          if (v0 < 0 !== v1 < 0) quad(cellV[cellId(i - 1, j, k - 1)], cellV[cellId(i - 1, j, k)], cellV[cellId(i, j, k)], cellV[cellId(i, j, k - 1)], !(v0 < 0));
        }
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) {
          const v1 = V[id(i, j, k + 1)];
          if (v0 < 0 !== v1 < 0) quad(cellV[cellId(i - 1, j - 1, k)], cellV[cellId(i, j - 1, k)], cellV[cellId(i, j, k)], cellV[cellId(i - 1, j, k)], !(v0 < 0));
        }
      }
  const nv = P.length / 3;
  const N = new Float32Array(nv * 3);
  const Cc = color ? new Float32Array(nv * 3) : null;
  for (let v = 0; v < nv; v++) {
    const g = grad(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], step * 0.5);
    N[v * 3] = g[0];
    N[v * 3 + 1] = g[1];
    N[v * 3 + 2] = g[2];
    if (Cc && color) {
      const c = color(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      Cc[v * 3] = c[0];
      Cc[v * 3 + 1] = c[1];
      Cc[v * 3 + 2] = c[2];
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  if (Cc) geom.setAttribute("color", new THREE.BufferAttribute(Cc, 3));
  geom.setIndex(I);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  const dv = step ** 3;
  return { geometry: geom, com: new THREE.Vector3(sx / Math.max(1, inside), sy / Math.max(1, inside), sz / Math.max(1, inside)), volume: inside * dv };
};

/** sRGB hex to the linear [r,g,b] vertex colours want. */
export const lin = (h: string): [number, number, number] => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
export const mix3 = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ------------------------------------------------------------------------------------------ sweeps etc.
/**
 * Sweep a closed 2D profile (points in the (side, up) plane) along a curve. The frame is parallel-
 * transported from the END of the curve, where `endSide` sets which way the profile's first axis points
 * (so a flat cable can lie flat on whatever it ends on). Caps both ends.
 */
export const sweepGeometry = (curve: THREE.Curve<THREE.Vector3>, profile: [number, number][], segs: number, endSide: THREE.Vector3) => {
  const pts = curve.getSpacedPoints(segs);
  const T: THREE.Vector3[] = pts.map((_, i) => curve.getTangentAt(i / segs).normalize());
  const S: THREE.Vector3[] = new Array(pts.length);
  const last = pts.length - 1;
  S[last] = endSide.clone().sub(T[last].clone().multiplyScalar(endSide.dot(T[last]))).normalize();
  for (let i = last - 1; i >= 0; i--) {
    // rotate the next side vector by the rotation taking T[i+1] to T[i]
    const q = new THREE.Quaternion().setFromUnitVectors(T[i + 1], T[i]);
    S[i] = S[i + 1].clone().applyQuaternion(q);
    S[i].sub(T[i].clone().multiplyScalar(S[i].dot(T[i]))).normalize();
  }
  const np = profile.length;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // profile normals (approx: outward from centroid via the polygon's edge normals)
  const pn = profile.map((_, i) => {
    const a = profile[(i - 1 + np) % np];
    const b = profile[(i + 1) % np];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1;
    return [ey / l, -ex / l] as [number, number];
  });
  // orientation: make sure normals point outward
  const area = profile.reduce((s, p, i) => {
    const q = profile[(i + 1) % np];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const sgn = area > 0 ? 1 : -1;
  for (let i = 0; i <= last; i++) {
    const U = new THREE.Vector3().crossVectors(T[i], S[i]).normalize();
    for (let j = 0; j <= np; j++) {
      const p = profile[j % np];
      const n = pn[j % np];
      const P = pts[i].clone().addScaledVector(S[i], p[0]).addScaledVector(U, p[1]);
      const N = S[i].clone().multiplyScalar(n[0] * sgn).addScaledVector(U, n[1] * sgn).normalize();
      pos.push(P.x, P.y, P.z);
      nrm.push(N.x, N.y, N.z);
      uv.push(j / np, i / last);
    }
  }
  const row = np + 1;
  for (let i = 0; i < last; i++)
    for (let j = 0; j < np; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      if (sgn > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  // caps
  for (const [end, dir] of [
    [0, -1],
    [last, 1],
  ] as [number, number][]) {
    const U = new THREE.Vector3().crossVectors(T[end], S[end]).normalize();
    const c0 = pos.length / 3;
    const nT = T[end].clone().multiplyScalar(dir);
    pos.push(pts[end].x, pts[end].y, pts[end].z);
    nrm.push(nT.x, nT.y, nT.z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < np; j++) {
      const p = profile[j];
      const P = pts[end].clone().addScaledVector(S[end], p[0]).addScaledVector(U, p[1]);
      pos.push(P.x, P.y, P.z);
      nrm.push(nT.x, nT.y, nT.z);
      uv.push(0.5 + p[0], 0.5 + p[1]);
    }
    for (let j = 0; j < np; j++) {
      const a = c0 + 1 + j;
      const b = c0 + 1 + ((j + 1) % np);
      if ((dir > 0) === (sgn > 0)) idx.push(c0, a, b);
      else idx.push(c0, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
};

/** An ellipse (or rounded-oval) profile: a = half-width along side, b = half-height along up. */
export const ellipseProfile = (a: number, b: number, n = 14): [number, number][] => Array.from({ length: n }, (_, i) => [a * Math.cos((i / n) * Math.PI * 2), b * Math.sin((i / n) * Math.PI * 2)]);
/** A flat "NM cable" profile: a stadium a x b. */
export const stadiumProfile = (a: number, b: number, n = 6): [number, number][] => {
  const out: [number, number][] = [];
  const s = a - b;
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (i / n) * Math.PI;
    out.push([s + b * Math.cos(t), b * Math.sin(t)]);
  }
  for (let i = 0; i <= n; i++) {
    const t = Math.PI / 2 + (i / n) * Math.PI;
    out.push([-s + b * Math.cos(t), b * Math.sin(t)]);
  }
  return out;
};

/** A rounded rectangle shape (centred) with per-corner radii [tl, tr, br, bl]. */
export const roundRectShape = (w: number, h: number, r: number | [number, number, number, number]) => {
  const [tl, tr, br, bl] = typeof r === "number" ? [r, r, r, r] : r;
  const s = new THREE.Shape();
  const x0 = -w / 2;
  const y0 = -h / 2;
  const x1 = w / 2;
  const y1 = h / 2;
  s.moveTo(x0 + bl, y0);
  s.lineTo(x1 - br, y0);
  if (br) s.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - tr);
  if (tr) s.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false);
  s.lineTo(x0 + tl, y1);
  if (tl) s.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + bl);
  if (bl) s.absarc(x0 + bl, y0 + bl, bl, Math.PI, Math.PI * 1.5, false);
  return s;
};
/** The same as a path (for holes). */
export const roundRectPath = (w: number, h: number, r: number, cx = 0, cy = 0) => {
  const p = new THREE.Path();
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;
  p.moveTo(x0 + r, y0);
  p.lineTo(x1 - r, y0);
  p.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  p.lineTo(x1, y1 - r);
  p.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  p.lineTo(x0 + r, y1);
  p.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(x0, y0 + r);
  p.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return p;
};

/** Planar UVs for a geometry from two of its axes over a box (u from axis a over [a0,a1], v from b). */
export const planarUV = (g: THREE.BufferGeometry, a: "x" | "y" | "z", b: "x" | "y" | "z", a0: number, a1: number, b0: number, b1: number) => {
  const p = g.getAttribute("position");
  const uv = new Float32Array(p.count * 2);
  const ai = { x: 0, y: 1, z: 2 }[a];
  const bi = { x: 0, y: 1, z: 2 }[b];
  for (let i = 0; i < p.count; i++) {
    const va = [p.getX(i), p.getY(i), p.getZ(i)][ai];
    const vb = [p.getX(i), p.getY(i), p.getZ(i)][bi];
    uv[i * 2] = (va - a0) / (a1 - a0);
    uv[i * 2 + 1] = (vb - b0) / (b1 - b0);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
};

/** A soft round sprite (white centre fading out) for halos. */
export const haloTex = () =>
  canvasTex("knock-halo", 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.18, "rgba(255,255,255,0.55)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.14)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });

// ===================================================================================== textures: paper
const RULE = "#86ADD9";
const MARGIN = "#E49A9F";

/**
 * The note's sheet, 0.1 x 0.14 m (two 0.07 m leaves either side of the fold at v = 0.5). Inside: wide rule,
 * the margin, old crease shading, the torn spiral edge, 'sorry —N' in purple marker on the lower leaf
 * (letters' tops toward the fold). Outside: the same rule and a faint mirrored show-through of the ink.
 */
export const noteTex = (side: "in" | "out", text = "sorry —N", ink = "#6A3FB0") =>
  canvasTex(`note-${side}-${text}-${ink}`, 512, 716, (g, w, h) => {
    g.fillStyle = "#FBFAF4";
    g.fillRect(0, 0, w, h);
    const r = rand(side === "in" ? 41 : 42);
    // paper tooth
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${120 + r() * 40},${110 + r() * 40},${90 + r() * 30},${r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // rules every 8.7 mm (the sheet is 140 mm tall: 716 px)
    const pxmm = h / 140;
    for (let y = 9; y < 140; y += 8.7) {
      g.fillStyle = RULE;
      g.globalAlpha = 0.75;
      g.fillRect(0, y * pxmm, w, 1.4);
    }
    g.globalAlpha = 1;
    // the margin (the sheet is the left part of a page)
    const mx = side === "in" ? 26 * pxmm : w - 26 * pxmm;
    g.fillStyle = MARGIN;
    g.globalAlpha = 0.8;
    g.fillRect(mx, 0, 1.6, h);
    g.globalAlpha = 1;
    // old creases: the page was folded in quarters before this fold
    const crease = (x0: number, y0: number, x1: number, y1: number) => {
      const grd = g.createLinearGradient(x0 - 6, y0, x0 + 6, y0);
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(0.5, "rgba(80,70,50,0.12)");
      grd.addColorStop(1, "rgba(255,255,255,0.0)");
      g.strokeStyle = "rgba(90,80,60,0.12)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x0 + 2, y0);
      g.lineTo(x1 + 2, y1);
      g.stroke();
    };
    crease(w * 0.52, 0, w * 0.5, h);
    // the fold itself (darker band at v=0.5)
    const fg = g.createLinearGradient(0, h / 2 - 10, 0, h / 2 + 10);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(0.5, "rgba(70,60,40,0.16)");
    fg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fg;
    g.fillRect(0, h / 2 - 10, w, 20);
    // the writing on the lower leaf (canvas bottom half), tops of the letters toward the fold; seen from the
    // back (the outside face uses the same UVs) the faint show-through reads mirrored, as it should
    const size = 86;
    const lw = markerWidth(text, size);
    drawMarker(g, text, w / 2 - lw / 2, h * 0.5 + 200, size, ink, { seed: 23, width: 12, slant: 0.12, alpha: side === "in" ? 0.92 : 0.07 });
    // the spiral tear along u = 0: a ragged edge with fringe, cut from the alpha (identical on both faces)
    g.globalCompositeOperation = "destination-out";
    const rr = rand(77);
    for (let y = 0; y < h; y += 3) {
      const d = 3 + rr() * 6 + (y % 26 < 9 ? 7 : 0);
      g.fillRect(0, y, d, 3);
    }
    g.globalCompositeOperation = "source-over";
  });

// ================================================================================= textures: kraft board
/** Kraft corrugated board: fibre noise, faint flute ridges (vertical), scuffs, darker near the edges. */
export const kraftTex = (key: string, w: number, h: number, base = "#C49A68", seed = 5, inner = false) =>
  canvasTex(`kraft-${key}`, w, h, (g) => {
    const r = rand(seed);
    g.fillStyle = inner ? "#B99470" : base;
    g.fillRect(0, 0, w, h);
    // flutes (8 mm pitch on a face of ~0.4 m: a faint ridge every few px)
    for (let x = 0; x < w; x += 6) {
      g.fillStyle = `rgba(255,240,210,${0.03 + r() * 0.02})`;
      g.fillRect(x, 0, 2, h);
    }
    for (let i = 0; i < (w * h) / 30; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(90,60,30,${r() * 0.08})` : `rgba(240,215,170,${r() * 0.07})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 0.6 + r() * 1.2);
    }
    // a few scuffs and a shoe-print smudge
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = `rgba(70,45,25,${0.05 + r() * 0.06})`;
      g.lineWidth = 1 + r() * 3;
      g.beginPath();
      const x = r() * w;
      const y = r() * h;
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 20);
      g.stroke();
    }
    // edges a touch darker (handled)
    const eg = g.createLinearGradient(0, 0, 0, h);
    eg.addColorStop(0, "rgba(60,40,20,0.12)");
    eg.addColorStop(0.06, "rgba(0,0,0,0)");
    eg.addColorStop(0.94, "rgba(0,0,0,0)");
    eg.addColorStop(1, "rgba(60,40,20,0.14)");
    g.fillStyle = eg;
    g.fillRect(0, 0, w, h);
  });

/** A box face with marker writing (multiply onto the kraft so it soaks in) and optional printed arrows. */
export const boxFaceTex = (key: string, wm: number, hm: number, text: string | null, ink: string, seed: number, arrows = false, region?: [number, number, number, number], wrap = true) => {
  const pxm = 900;
  const w = Math.max(64, Math.round(wm * pxm));
  const h = Math.max(64, Math.round(hm * pxm));
  return canvasTex(`boxface-${key}`, w, h, (g) => {
    const base = kraftTex(`b-${seed}-${w}x${h}`, w, h, "#C49A68", seed).image as HTMLCanvasElement;
    g.drawImage(base, 0, 0);
    if (arrows) {
      // generic "this way up" arrows in faded print, bottom right
      g.save();
      g.globalAlpha = 0.45;
      g.fillStyle = "#5C4128";
      const s = h * 0.09;
      for (let i = 0; i < 2; i++) {
        const x = w * 0.84 + i * s * 0.9;
        const y = h * 0.86;
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x + s * 0.4, y - s * 0.55);
        g.lineTo(x + s * 0.14, y - s * 0.55);
        g.lineTo(x + s * 0.14, y);
        g.lineTo(x - s * 0.14, y);
        g.lineTo(x - s * 0.14, y - s * 0.55);
        g.lineTo(x - s * 0.4, y - s * 0.55);
        g.closePath();
        g.fill();
      }
      g.fillRect(w * 0.84 - s * 0.45, h * 0.86 + s * 0.12, s * 1.8, s * 0.07);
      g.restore();
    }
    if (text) {
      const [rx, ry, rw, rh] = region ?? [0.08, 0.12, 0.84, 0.76];
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const cg = c.getContext("2d")!;
      drawMarkerBlock(cg, text, (rx + rw / 2) * w, (ry + rh / 2) * h, rw * w, rh * h, ink, { seed: seed + 3, maxSize: rh * h * 0.42, width: undefined, alpha: 0.95, slant: 0.03, wrap });
      g.globalCompositeOperation = "multiply";
      g.drawImage(c, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 0.25;
      g.drawImage(c, 0, 0);
      g.globalAlpha = 1;
    }
  });
};

/** Brown packing tape: glossy amber with bubbles, stretch lines and serrated ends (alpha). */
export const tapeTex = (color = "#B9813F") =>
  canvasTex(`tape-${color}`, 128, 512, (g, w, h) => {
    const r = rand(9);
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(255,230,180,${0.05 + r() * 0.1})`;
      g.lineWidth = 1;
      g.beginPath();
      const y = r() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 20, w * 0.7, y + (r() - 0.5) * 20, w, y + (r() - 0.5) * 10);
      g.stroke();
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(255,240,210,${0.1 + r() * 0.15})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 2 + r() * 5, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(120,70,20,0.25)";
    g.fillRect(0, 0, 3, h);
    g.fillRect(w - 3, 0, 3, h);
  });

// ===================================================================================== textures: posters
export type PosterKind = "unicorn" | "trex" | "soccer" | "band";

const star4 = (g: CanvasRenderingContext2D, x: number, y: number, s: number) => {
  g.beginPath();
  g.moveTo(x, y - s);
  g.quadraticCurveTo(x, y, x + s, y);
  g.quadraticCurveTo(x, y, x, y + s);
  g.quadraticCurveTo(x, y, x - s, y);
  g.quadraticCurveTo(x, y, x, y - s);
  g.fill();
};
const star5 = (g: CanvasRenderingContext2D, x: number, y: number, R: number, rIn: number, rot = 0) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? rIn : R;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
};

const drawUnicorn = (g: CanvasRenderingContext2D, w: number, h: number) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#F7B8D8");
  sky.addColorStop(0.45, "#D7B4F0");
  sky.addColorStop(1, "#A9D4F5");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // rainbow
  const bands = ["#FF6F8E", "#FFA45C", "#FFE066", "#7CDB8A", "#6FB8FF", "#A98BFF"];
  bands.forEach((c, i) => {
    g.strokeStyle = c;
    g.lineWidth = 26;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.arc(w * 0.5, h * 0.78, w * 0.62 - i * 25, Math.PI * 1.04, Math.PI * 1.96);
    g.stroke();
  });
  g.globalAlpha = 1;
  // sparkles
  const r = rand(4);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.9)" : "rgba(255,236,150,0.9)";
    star4(g, r() * w, r() * h * 0.7, 4 + r() * 10);
  }
  // clouds
  const cloud = (x: number, y: number, s: number) => {
    g.fillStyle = "#FFFFFF";
    for (const [dx, dy, rr] of [
      [0, 0, 1],
      [0.9, 0.15, 0.8],
      [-0.9, 0.2, 0.75],
      [0.4, -0.45, 0.8],
      [-0.4, -0.35, 0.7],
    ]) {
      g.beginPath();
      g.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
      g.fill();
    }
  };
  cloud(w * 0.18, h * 0.86, 46);
  cloud(w * 0.82, h * 0.88, 52);
  cloud(w * 0.5, h * 0.95, 60);
  // the unicorn (prancing, facing right)
  g.save();
  g.translate(w * 0.5, h * 0.56);
  g.lineJoin = "round";
  g.lineWidth = 5;
  g.strokeStyle = "#9C7FC7";
  g.fillStyle = "#FFFFFF";
  // tail
  const tail = ["#FF7FB0", "#B98BFF", "#7FC8FF"];
  tail.forEach((c, i) => {
    g.strokeStyle = c;
    g.lineWidth = 16 - i * 3;
    g.beginPath();
    g.moveTo(-120, -10 + i * 6);
    g.bezierCurveTo(-200, -40 + i * 10, -190, 60 + i * 12, -230, 110 + i * 10);
    g.stroke();
  });
  g.strokeStyle = "#9C7FC7";
  g.lineWidth = 5;
  // legs (back two)
  const leg = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(x1, y1, x2, y2);
    g.lineWidth = 22;
    g.strokeStyle = "#9C7FC7";
    g.stroke();
    g.lineWidth = 16;
    g.strokeStyle = "#FFFFFF";
    g.stroke();
    g.fillStyle = "#E8C25A";
    g.beginPath();
    g.ellipse(x2, y2 + 6, 11, 8, 0, 0, Math.PI * 2);
    g.fill();
  };
  leg(-90, 20, -110, 90, -100, 150);
  leg(70, 20, 120, 60, 150, 20);
  leg(-60, 30, -50, 100, -70, 160);
  leg(40, 30, 50, 100, 30, 160);
  // body
  g.fillStyle = "#FFFFFF";
  g.strokeStyle = "#9C7FC7";
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(-20, 0, 120, 62, -0.05, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // neck + head
  g.beginPath();
  g.moveTo(50, -30);
  g.bezierCurveTo(80, -110, 110, -150, 150, -160);
  g.bezierCurveTo(190, -150, 215, -120, 210, -100);
  g.bezierCurveTo(200, -85, 175, -95, 160, -90);
  g.bezierCurveTo(140, -60, 120, -10, 90, 20);
  g.closePath();
  g.fill();
  g.stroke();
  // ear
  g.beginPath();
  g.moveTo(140, -158);
  g.lineTo(150, -190);
  g.lineTo(162, -158);
  g.closePath();
  g.fill();
  g.stroke();
  // horn
  const hornG = g.createLinearGradient(160, -170, 200, -250);
  hornG.addColorStop(0, "#F4C94F");
  hornG.addColorStop(1, "#FFF2B8");
  g.fillStyle = hornG;
  g.beginPath();
  g.moveTo(158, -165);
  g.lineTo(205, -255);
  g.lineTo(176, -158);
  g.closePath();
  g.fill();
  g.strokeStyle = "#C79A2E";
  g.lineWidth = 3;
  g.stroke();
  for (let i = 1; i < 5; i++) {
    g.beginPath();
    g.moveTo(160 + i * 9, -168 - i * 17);
    g.lineTo(172 + i * 8, -162 - i * 18);
    g.stroke();
  }
  // mane
  const mane = ["#FF7FB0", "#B98BFF", "#7FC8FF", "#FFD36B"];
  mane.forEach((c, i) => {
    g.fillStyle = c;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.ellipse(120 - k * 22 + i * 4, -150 + k * 32 + i * 6, 22, 13, -0.9, 0, Math.PI * 2);
      g.fill();
    }
  });
  // eye + cheek
  g.fillStyle = "#3B2A55";
  g.beginPath();
  g.arc(175, -128, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#FFFFFF";
  g.beginPath();
  g.arc(177, -130, 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,130,170,0.5)";
  g.beginPath();
  g.arc(185, -108, 9, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // a white sparkle frame
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = 8;
  g.strokeRect(14, 14, w - 28, h - 28);
};

const drawTrexPoster = (g: CanvasRenderingContext2D, w: number, h: number) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#2B1638");
  sky.addColorStop(0.35, "#B8402C");
  sky.addColorStop(0.62, "#F39A3A");
  sky.addColorStop(1, "#3A2614");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // sun
  g.fillStyle = "rgba(255,226,140,0.9)";
  g.beginPath();
  g.arc(w * 0.72, h * 0.52, 70, 0, Math.PI * 2);
  g.fill();
  // volcano
  g.fillStyle = "#3B1E18";
  g.beginPath();
  g.moveTo(w * 0.05, h * 0.68);
  g.lineTo(w * 0.28, h * 0.36);
  g.lineTo(w * 0.38, h * 0.36);
  g.lineTo(w * 0.62, h * 0.68);
  g.closePath();
  g.fill();
  // lava
  g.strokeStyle = "#FF6A1A";
  g.lineWidth = 6;
  for (const [x0, x1] of [
    [0.3, 0.2],
    [0.35, 0.45],
  ]) {
    g.beginPath();
    g.moveTo(w * x0, h * 0.37);
    g.quadraticCurveTo(w * ((x0 + x1) / 2), h * 0.5, w * x1, h * 0.62);
    g.stroke();
  }
  const r = rand(8);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(255,${120 + r() * 100},40,${0.5 + r() * 0.5})`;
    g.beginPath();
    g.arc(w * (0.33 + (r() - 0.5) * 0.2), h * (0.33 - r() * 0.2), 2 + r() * 5, 0, Math.PI * 2);
    g.fill();
  }
  // smoke
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(60,40,50,${0.35 + r() * 0.2})`;
    g.beginPath();
    g.arc(w * (0.33 + (r() - 0.3) * 0.25), h * (0.25 - i * 0.025), 30 + r() * 30, 0, Math.PI * 2);
    g.fill();
  }
  // ground and ferns
  g.fillStyle = "#1E2A12";
  g.fillRect(0, h * 0.8, w, h * 0.2);
  g.strokeStyle = "#2F4A1A";
  g.lineWidth = 3;
  for (let i = 0; i < 22; i++) {
    const x = r() * w;
    const y = h * (0.8 + r() * 0.15);
    for (let k = -3; k <= 3; k++) {
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + k * 6, y - 26, x + k * 14, y - 30 + Math.abs(k) * 6);
      g.stroke();
    }
  }
  // palm silhouettes
  const palm = (x: number, y: number, s: number) => {
    g.strokeStyle = "#140C08";
    g.lineWidth = 7 * s;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 20 * s, y - 120 * s, x + 10 * s, y - 200 * s);
    g.stroke();
    g.fillStyle = "#140C08";
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.6;
      g.beginPath();
      g.moveTo(x + 10 * s, y - 200 * s);
      g.quadraticCurveTo(x + 10 * s + Math.cos(a) * 60 * s, y - 220 * s + Math.sin(a) * 30 * s, x + 10 * s + Math.cos(a) * 100 * s, y - 180 * s + Math.sin(a) * 10 * s);
      g.quadraticCurveTo(x + 10 * s + Math.cos(a) * 50 * s, y - 200 * s, x + 10 * s, y - 196 * s);
      g.fill();
    }
  };
  palm(w * 0.88, h * 0.82, 1.1);
  palm(w * 0.08, h * 0.84, 0.8);
  // the T-rex, roaring to the left
  g.save();
  g.translate(w * 0.52, h * 0.74);
  g.fillStyle = "#3E7C33";
  g.strokeStyle = "#16300F";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(230, -60); // tail tip
  g.bezierCurveTo(150, -110, 80, -150, 20, -150);
  g.bezierCurveTo(-30, -150, -70, -170, -100, -220); // neck up
  g.lineTo(-170, -230); // top of head
  g.bezierCurveTo(-210, -230, -230, -215, -235, -200); // snout
  g.lineTo(-180, -190); // upper jaw
  g.lineTo(-215, -160); // open jaw
  g.lineTo(-150, -165);
  g.bezierCurveTo(-120, -140, -100, -120, -90, -100); // throat
  g.bezierCurveTo(-80, -80, -40, -60, -30, -40); // chest
  g.lineTo(-20, 0); // front leg
  g.lineTo(-45, 30);
  g.lineTo(5, 30);
  g.lineTo(20, -30);
  g.bezierCurveTo(60, -20, 70, -10, 70, 10);
  g.lineTo(55, 30);
  g.lineTo(110, 30);
  g.bezierCurveTo(120, -10, 120, -40, 110, -60);
  g.bezierCurveTo(160, -60, 200, -55, 230, -60);
  g.closePath();
  g.fill();
  g.stroke();
  // stripes
  g.strokeStyle = "rgba(20,50,15,0.7)";
  g.lineWidth = 8;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(-60 + i * 40, -150 + i * 10);
    g.lineTo(-50 + i * 40, -110 + i * 10);
    g.stroke();
  }
  // teeth, eye, arm
  g.fillStyle = "#FFF6DC";
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(-225 + i * 10, -195);
    g.lineTo(-221 + i * 10, -184);
    g.lineTo(-217 + i * 10, -194);
    g.fill();
  }
  g.fillStyle = "#FFD23A";
  g.beginPath();
  g.arc(-170, -214, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#111";
  g.beginPath();
  g.arc(-169, -214, 2.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#16300F";
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(-70, -95);
  g.lineTo(-95, -80);
  g.lineTo(-100, -70);
  g.stroke();
  g.restore();
  // title
  g.font = "bold 92px 'DejaVu Sans', sans-serif";
  g.textAlign = "center";
  g.lineWidth = 10;
  g.strokeStyle = "#2A1206";
  g.strokeText("T-REX", w / 2, 108);
  const tg = g.createLinearGradient(0, 30, 0, 110);
  tg.addColorStop(0, "#FFF08A");
  tg.addColorStop(1, "#F2A21E");
  g.fillStyle = tg;
  g.fillText("T-REX", w / 2, 108);
};

const drawSoccerPoster = (g: CanvasRenderingContext2D, w: number, h: number) => {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0C1A3A");
  bg.addColorStop(0.55, "#16507A");
  bg.addColorStop(1, "#0E3A24");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // stadium lights
  for (const [x, y] of [
    [0.15, 0.08],
    [0.85, 0.07],
  ]) {
    const grd = g.createRadialGradient(w * x, h * y, 0, w * x, h * y, 220);
    grd.addColorStop(0, "rgba(255,255,240,0.95)");
    grd.addColorStop(0.1, "rgba(220,235,255,0.5)");
    grd.addColorStop(1, "rgba(120,160,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }
  // crowd bokeh
  const r = rand(12);
  for (let i = 0; i < 180; i++) {
    g.fillStyle = `rgba(${200 + r() * 55},${200 + r() * 55},${220 + r() * 35},${0.05 + r() * 0.15})`;
    g.beginPath();
    g.arc(r() * w, h * (0.2 + r() * 0.35), 3 + r() * 9, 0, Math.PI * 2);
    g.fill();
  }
  // pitch
  const pg = g.createLinearGradient(0, h * 0.7, 0, h);
  pg.addColorStop(0, "#1F7A3A");
  pg.addColorStop(1, "#0F4A22");
  g.fillStyle = pg;
  g.fillRect(0, h * 0.72, w, h * 0.28);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
    g.fillRect(0, h * (0.72 + i * 0.047), w, h * 0.047);
  }
  // the player: a silhouette mid-strike (left foot planted, right leg swinging through)
  g.save();
  g.translate(w * 0.45, h * 0.73);
  g.fillStyle = "#05070C";
  g.strokeStyle = "#05070C";
  g.lineCap = "round";
  g.lineJoin = "round";
  const limb = (pts: [number, number][], wd: number) => {
    g.lineWidth = wd;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
    g.stroke();
  };
  limb([[-10, -230], [-30, -120], [-20, -5]], 34); // torso + standing leg
  limb([[-20, -120], [-60, -10], [-55, 0]], 0.1);
  limb([[-25, -130], [40, -80], [120, -110]], 30); // kicking leg
  limb([[-10, -215], [-70, -170], [-120, -190]], 18); // arm back
  limb([[-5, -215], [50, -235], [95, -205]], 18); // arm forward
  limb([[-20, -10], [-15, 0]], 26);
  g.beginPath();
  g.arc(-5, -268, 26, 0, Math.PI * 2);
  g.fill();
  // standing foot
  g.beginPath();
  g.ellipse(-12, 2, 30, 10, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // the ball with motion lines
  const bx = w * 0.77;
  const by = h * 0.55;
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(bx - 40 - i * 5, by + 30 + i * 12);
    g.lineTo(bx - 140 - i * 20, by + 70 + i * 12);
    g.stroke();
  }
  g.fillStyle = "#F4F4F0";
  g.beginPath();
  g.arc(bx, by, 32, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#111";
  star5(g, bx + 4, by - 2, 12, 9, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = 0.3 + (i * Math.PI * 2) / 5 - Math.PI / 2;
    g.beginPath();
    g.arc(bx + 4 + Math.cos(a) * 26, by - 2 + Math.sin(a) * 26, 7, 0, Math.PI * 2);
    g.fill();
  }
  // halftone overlay
  for (let y = 0; y < h; y += 10)
    for (let x = (y / 10) % 2 ? 5 : 0; x < w; x += 10) {
      g.fillStyle = "rgba(255,255,255,0.025)";
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  // a big number (no team, no name)
  g.font = "bold 150px 'DejaVu Sans', sans-serif";
  g.textAlign = "right";
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillText("10", w - 30, h * 0.36);
};

const drawBandPoster = (g: CanvasRenderingContext2D, w: number, h: number) => {
  g.fillStyle = "#EFE4CC";
  g.fillRect(0, 0, w, h);
  const r = rand(21);
  // the sun (misregistered two-colour print)
  g.fillStyle = "#E8643A";
  g.beginPath();
  g.arc(w * 0.5, h * 0.34, w * 0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(240,180,60,0.7)";
  g.beginPath();
  g.arc(w * 0.5 + 6, h * 0.34 - 5, w * 0.24, 0, Math.PI * 2);
  g.fill();
  // waves
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = i % 2 ? "#1F6E73" : "#173F52";
    g.lineWidth = 12;
    g.beginPath();
    for (let x = -10; x <= w + 10; x += 8) {
      const y = h * 0.5 + i * 22 + Math.sin(x * 0.03 + i * 0.8) * 10;
      if (x === -10) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // black triangles (mountains)
  g.fillStyle = "#16161A";
  g.beginPath();
  g.moveTo(0, h * 0.86);
  g.lineTo(w * 0.22, h * 0.6);
  g.lineTo(w * 0.4, h * 0.82);
  g.lineTo(w * 0.62, h * 0.55);
  g.lineTo(w * 0.86, h * 0.84);
  g.lineTo(w, h * 0.7);
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.closePath();
  g.fill();
  // abstract lettering: bars and circles, unreadable as any name
  g.fillStyle = "#16161A";
  let x = w * 0.1;
  for (let i = 0; i < 9; i++) {
    const kind = r();
    if (kind < 0.4) g.fillRect(x, h * 0.08, 12 + r() * 14, 46);
    else if (kind < 0.7) {
      g.beginPath();
      g.arc(x + 18, h * 0.08 + 23, 21, 0, Math.PI * 2);
      g.lineWidth = 9;
      g.strokeStyle = "#16161A";
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(x, h * 0.08 + 46);
      g.lineTo(x + 18, h * 0.08);
      g.lineTo(x + 36, h * 0.08 + 46);
      g.lineWidth = 9;
      g.strokeStyle = "#16161A";
      g.stroke();
    }
    x += 52;
  }
  // small print
  g.font = "bold 26px 'DejaVu Sans', sans-serif";
  g.textAlign = "center";
  g.fillStyle = "#EFE4CC";
  g.fillText("LIVE · NOV 12 · 2011", w / 2, h * 0.94);
  g.font = "16px 'DejaVu Sans', sans-serif";
  g.fillText("DOORS 8PM · ALL AGES", w / 2, h * 0.975);
  // grain
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.08})` : `rgba(255,250,235,${r() * 0.1})`;
    g.fillRect(r() * w, r() * h, 1.5, 1.5);
  }
};

/** A 0.45 x 0.6 poster's print (600 x 800). */
export const posterTex = (kind: PosterKind) =>
  canvasTex(`poster-${kind}`, 600, 800, (g, w, h) => {
    if (kind === "unicorn") drawUnicorn(g, w, h);
    else if (kind === "trex") drawTrexPoster(g, w, h);
    else if (kind === "soccer") drawSoccerPoster(g, w, h);
    else drawBandPoster(g, w, h);
    // a white paper border and gentle aging
    g.strokeStyle = "#F7F3EA";
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    const r = rand(kind.length * 13);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(255,248,230,${r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
  });

// ======================================================================================= textures: rugs
/** Nora's braided oval rug: concentric three-strand braids in lavenders and cream (u, v over the oval's box). */
export const braidTex = () =>
  once("braidTex", () => {
    const n = tileNoise(31, 64);
    const ringCols = ["#B9A3D6", "#A48CC8", "#CDBDE6", "#EDE6F2", "#9A84C2", "#C3B0E0", "#E2D8EE", "#8E77B5"];
    const rr = rand(90);
    const order = Array.from({ length: 40 }, () => Math.floor(rr() * ringCols.length));
    const ROW = 0.034; // m per braid row
    const A = 0.6;
    const B = 0.4;
    const sample = (u: number, v: number) => {
      const x = (u - 0.5) * 2 * A;
      const y = (v - 0.5) * 2 * B;
      // distance-like coordinate from the centre line (braided ovals grow from a straight centre run)
      const cl = A - B;
      const dx = Math.max(0, Math.abs(x) - cl);
      const d = Math.hypot(dx, y);
      const ring = d / ROW;
      const ri = Math.floor(ring);
      const rf = ring - ri;
      const ang = Math.abs(x) > cl ? Math.atan2(y, (Math.abs(x) - cl) * Math.sign(x)) : 0;
      // arc length along the ring
      const s = Math.abs(x) <= cl ? x * Math.sign(y || 1) : cl * Math.sign(x) * Math.sign(y || 1) + ang * d;
      const k = (s / 0.022) * 1;
      const half = rf < 0.5 ? 1 : -1;
      const chev = fract(k + (rf - 0.5) * 1.6 * half);
      const strand = Math.sin(chev * Math.PI); // 0 at strand edges
      const groove = Math.sin(rf * Math.PI);
      return { ri, strand, groove, chev, k, n: n(u * 4, v * 4) };
    };
    const map = pixelTex("braid-map", 1024, 683, (u, v) => {
      const p = sample(u, v);
      const strandI = ((Math.floor(p.k + (p.chev < 0.5 ? 0 : 0.5)) % 3) + 3) % 3;
      const base = rgbOf(ringCols[order[p.ri % 40]]);
      const alt = rgbOf(ringCols[order[(p.ri + 1 + strandI) % 40]]);
      const c = mixRGB(base, alt, strandI === 1 ? 0.35 : 0);
      const sh = 0.62 + 0.38 * Math.pow(p.strand, 0.6) * (0.55 + 0.45 * Math.pow(p.groove, 0.5));
      const f = sh * (0.94 + 0.12 * p.n);
      return [c[0] * f, c[1] * f, c[2] * f];
    });
    const normal = normalFromFn("braid", 1024, 683, (u, v) => {
      const p = sample(u, v);
      return 0.6 * Math.pow(p.groove, 0.5) * (0.5 + 0.5 * Math.pow(p.strand, 0.7));
    }, 3.5);
    return { map, normal };
  });

/** Your blue rug: a soft pile in mid-blue, a lighter border, and a diagonal trail of three-toed footprints. */
export const dinoRugTex = () =>
  canvasTex("dinoRug", 1040, 720, (g, w, h) => {
    const r = rand(55);
    g.fillStyle = "#4D7DBF";
    g.fillRect(0, 0, w, h);
    // pile
    for (let i = 0; i < 60000; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(20,40,90,${r() * 0.12})` : `rgba(200,220,255,${r() * 0.1})`;
      g.fillRect(r() * w, r() * h, 1.2, 1.2 + r() * 2);
    }
    // border band
    g.strokeStyle = "#9CC0EA";
    g.lineWidth = 22;
    g.strokeRect(40, 40, w - 80, h - 80);
    g.strokeStyle = "#2E558F";
    g.lineWidth = 6;
    g.strokeRect(62, 62, w - 124, h - 124);
    // footprints: three toes and a heel pad, alternating along a wavy path
    const foot = (x: number, y: number, ang: number, s: number, col: string) => {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(0, 0.25 * s, 0.32 * s, 0.38 * s, 0, 0, Math.PI * 2);
      g.fill();
      for (const a of [-0.55, 0, 0.55]) {
        g.save();
        g.rotate(a);
        g.beginPath();
        g.moveTo(-0.12 * s, -0.05 * s);
        g.quadraticCurveTo(-0.1 * s, -0.8 * s, 0, -0.95 * s);
        g.quadraticCurveTo(0.1 * s, -0.8 * s, 0.12 * s, -0.05 * s);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.restore();
    };
    const trail = (x0: number, y0: number, x1: number, y1: number, n: number, s: number, col: string, ph: number) => {
      const ang = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const side = i % 2 ? 1 : -1;
        const nx = Math.cos(ang - Math.PI / 2 + Math.PI / 2);
        const ny = Math.sin(ang - Math.PI / 2 + Math.PI / 2);
        const wob = Math.sin(t * 6 + ph) * 18;
        foot(x0 + (x1 - x0) * t + nx * (side * s * 0.45 + wob), y0 + (y1 - y0) * t + ny * (side * s * 0.45 + wob), ang + side * 0.12, s, col);
      }
    };
    trail(130, h - 120, w - 150, 130, 9, 64, "#2B4F86", 0.3);
    trail(220, 150, w * 0.55, h - 140, 6, 36, "#7FB0E6", 1.7);
  });

// ===================================================================================== textures: bedding
/** Cotton plain weave as a height function (threads at `pitch` per tile unit). */
const weaveH = (u: number, v: number, n: number) => {
  const a = Math.sin(u * Math.PI * 2 * n);
  const b = Math.sin(v * Math.PI * 2 * n);
  const over = Math.sign(Math.sin(u * Math.PI * n) * Math.sin(v * Math.PI * n));
  return 0.5 + 0.25 * (Math.abs(a) * (over > 0 ? 1 : 0.6) + Math.abs(b) * (over > 0 ? 0.6 : 1));
};

/** Distance (in tile units) to the nearest diamond-grid stitch line (lines at 45 deg, `n` per tile). */
const diamondD = (u: number, v: number, n: number) => {
  const a = fract((u + v) * n);
  const b = fract((u - v) * n);
  return Math.min(a, 1 - a, b, 1 - b) / n;
};
const gridD = (u: number, v: number, n: number) => {
  const a = fract(u * n);
  const b = fract(v * n);
  return Math.min(a, 1 - a, b, 1 - b) / n;
};

export type BeddingOpts = {
  /** the physical size (m) the mesh's UV 0..1 spans (default the 0.95 x 2 m bed top: u across, v along) */
  uvSize?: [number, number];
};

type FabricSpec = { map: THREE.Texture; normal?: THREE.Texture; tile: [number, number]; rough?: number; sheen?: number; sheenColor?: string; normalScale?: number; color?: string; clearcoat?: number };
const fabricMat = (key: string, o: BeddingOpts, make: () => FabricSpec) => {
  const uv = o.uvSize ?? [0.95, 2];
  return mat(`fabric-${key}-${uv[0]}x${uv[1]}`, () => {
    const s = make();
    const rx = uv[0] / s.tile[0];
    const ry = uv[1] / s.tile[1];
    const m = new THREE.MeshPhysicalMaterial({
      map: withRepeat(s.map, rx, ry),
      roughness: s.rough ?? 0.88,
      sheen: s.sheen ?? 0.4,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(s.sheenColor ?? "#ffffff"),
      color: s.color ?? "#ffffff",
      clearcoat: s.clearcoat ?? 0,
      clearcoatRoughness: 0.5,
    });
    if (s.normal) {
      m.normalMap = withRepeat(s.normal, rx, ry);
      m.normalScale.set(s.normalScale ?? 1, s.normalScale ?? 1);
    }
    return m;
  });
};

/** 2004, Nora: a purple quilt scattered with small yellow and lilac stars, diamond-quilted (0.48 m tile). */
export const starQuiltMat = (o: BeddingOpts = {}) =>
  fabricMat("starQuilt", o, () => {
    const map = canvasTex("starQuilt", 1024, 1024, (g, w, h) => {
      g.fillStyle = "#5E3F92";
      g.fillRect(0, 0, w, h);
      const r = rand(61);
      for (let i = 0; i < 26000; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(30,10,60,${r() * 0.08})` : `rgba(200,170,255,${r() * 0.06})`;
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
      // stars on a jittered grid (tiling: wrap the drawing)
      const cols = ["#F4D35E", "#F4D35E", "#E8DAFF", "#FFFFFF", "#B9A0F0"];
      for (let j = 0; j < 9; j++)
        for (let i = 0; i < 9; i++) {
          const x = ((i + (j % 2) * 0.5 + (r() - 0.5) * 0.5) / 9) * w;
          const y = ((j + (r() - 0.5) * 0.5) / 9) * h;
          const s = 12 + r() * 16;
          g.fillStyle = cols[Math.floor(r() * cols.length)];
          const rot = r() * 1.2;
          for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) star5(g, x + dx, y + dy, s, s * 0.45, rot);
        }
      // stitch dashes along the diamond lines (4 per tile)
      g.strokeStyle = "rgba(230,215,255,0.55)";
      g.lineWidth = 2;
      g.setLineDash([7, 6]);
      for (let k = -4; k <= 8; k++) {
        g.beginPath();
        g.moveTo((k / 4) * w, 0);
        g.lineTo((k / 4) * w - w, h);
        g.stroke();
        g.beginPath();
        g.moveTo((k / 4) * w - w, 0);
        g.lineTo((k / 4) * w, h);
        g.stroke();
      }
      g.setLineDash([]);
    });
    const normal = normalFromFn("starQuilt", 512, 512, (u, v) => {
      const d = diamondD(u, v, 4);
      return Math.pow(Math.min(1, d / 0.05), 0.55) * 1.0 + 0.04 * weaveH(u, v, 90);
    }, 6);
    return { map, normal, tile: [0.48, 0.48], sheen: 0.5, sheenColor: "#C9B5FF", normalScale: 1 };
  });

const swatch = (g: CanvasRenderingContext2D, x: number, y: number, s: number, kind: number, c1: string, c2: string, seed: number) => {
  const r = rand(seed);
  g.save();
  g.beginPath();
  g.rect(x, y, s, s);
  g.clip();
  g.fillStyle = c1;
  g.fillRect(x, y, s, s);
  g.fillStyle = c2;
  if (kind === 0) {
    // gingham
    g.globalAlpha = 0.5;
    for (let i = 0; i < s; i += s / 8) {
      g.fillRect(x + i, y, s / 16, s);
      g.fillRect(x, y + i, s, s / 16);
    }
    g.globalAlpha = 1;
  } else if (kind === 1) {
    // polka dots
    for (let j = 0; j < 7; j++)
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.arc(x + (i + (j % 2) * 0.5) * (s / 6), y + j * (s / 6), s / 40, 0, Math.PI * 2);
        g.fill();
      }
  } else if (kind === 2) {
    // small florals
    for (let k = 0; k < 14; k++) {
      const fx = x + r() * s;
      const fy = y + r() * s;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(fx + Math.cos(a) * s * 0.025, fy + Math.sin(a) * s * 0.025, s * 0.02, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#F7E7A0";
      g.beginPath();
      g.arc(fx, fy, s * 0.012, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = c2;
    }
  } else if (kind === 3) {
    // stripes
    for (let i = -s; i < s * 2; i += s / 7) {
      g.fillRect(x + i, y, s / 18, s);
    }
  } else if (kind === 4) {
    // calico sprigs
    g.strokeStyle = c2;
    g.lineWidth = s * 0.012;
    for (let k = 0; k < 18; k++) {
      const fx = x + r() * s;
      const fy = y + r() * s;
      g.beginPath();
      g.moveTo(fx, fy);
      g.quadraticCurveTo(fx + s * 0.03, fy - s * 0.03, fx + s * 0.05, fy);
      g.stroke();
    }
  } else if (kind === 5) {
    // tiny stars
    for (let k = 0; k < 16; k++) star5(g, x + r() * s, y + r() * s, s * 0.035, s * 0.016, r());
  }
  // kind 6: solid
  g.restore();
};

/** 2007, Nora: a patchwork quilt of 0.15 m squares (gingham, dots, florals, stripes, calico, solids). */
export const patchworkQuiltMat = (o: BeddingOpts = {}) =>
  fabricMat("patchwork", o, () => {
    const pal: [string, string][] = [
      ["#B8A2D9", "#7A5BB0"],
      ["#7FBFB5", "#F4F0E6"],
      ["#E7A3B3", "#FFFFFF"],
      ["#F2E6CF", "#9C7FC7"],
      ["#9BB88A", "#F4F0E6"],
      ["#E9C46A", "#B5651D"],
      ["#6E8FC2", "#F2E6CF"],
      ["#C97B84", "#F4E3E6"],
      ["#5E4B8B", "#E8DAFF"],
    ];
    const map = canvasTex("patchwork", 1536, 1536, (g, w, h) => {
      const n = 6;
      const s = w / n;
      const r = rand(63);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const p = pal[Math.floor(r() * pal.length)];
          swatch(g, i * s, j * s, s, Math.floor(r() * 7), p[0], p[1], 100 + i * 7 + j * 31);
        }
      // cotton tooth
      for (let i = 0; i < 60000; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.05})` : `rgba(255,255,255,${r() * 0.05})`;
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
      // seams (stitch-in-the-ditch) and stitching
      g.strokeStyle = "rgba(60,40,70,0.35)";
      g.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo(i * s, 0);
        g.lineTo(i * s, h);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i * s);
        g.lineTo(w, i * s);
        g.stroke();
      }
    });
    const normal = normalFromFn("patchwork", 768, 768, (u, v) => {
      const d = gridD(u, v, 6);
      return Math.pow(Math.min(1, d / 0.03), 0.5) + 0.03 * weaveH(u, v, 160);
    }, 7);
    return { map, normal, tile: [0.9, 0.9], sheen: 0.45, normalScale: 1 };
  });

/** A cartoon race car (side view) for the duvet print. */
const raceCar = (g: CanvasRenderingContext2D, x: number, y: number, s: number, body: string, num: string, flip: boolean) => {
  g.save();
  g.translate(x, y);
  if (flip) g.scale(-1, 1);
  g.fillStyle = body;
  g.strokeStyle = "#1A1A22";
  g.lineWidth = s * 0.04;
  g.beginPath();
  g.moveTo(-s, 0.1 * s);
  g.lineTo(-0.95 * s, -0.25 * s);
  g.lineTo(-0.4 * s, -0.3 * s);
  g.lineTo(-0.2 * s, -0.6 * s);
  g.lineTo(0.25 * s, -0.6 * s);
  g.lineTo(0.45 * s, -0.3 * s);
  g.lineTo(1.0 * s, -0.2 * s);
  g.lineTo(1.05 * s, 0.1 * s);
  g.closePath();
  g.fill();
  g.stroke();
  // spoiler
  g.fillRect(-1.05 * s, -0.5 * s, 0.25 * s, 0.08 * s);
  g.fillRect(-0.95 * s, -0.45 * s, 0.06 * s, 0.22 * s);
  // window
  g.fillStyle = "#BFE3FF";
  g.beginPath();
  g.moveTo(-0.15 * s, -0.33 * s);
  g.lineTo(0.02 * s, -0.53 * s);
  g.lineTo(0.22 * s, -0.53 * s);
  g.lineTo(0.36 * s, -0.33 * s);
  g.closePath();
  g.fill();
  // number roundel
  g.fillStyle = "#FFFFFF";
  g.beginPath();
  g.arc(-0.5 * s, -0.08 * s, 0.17 * s, 0, Math.PI * 2);
  g.fill();
  g.save();
  if (flip) g.scale(-1, 1);
  g.fillStyle = "#1A1A22";
  g.font = `bold ${Math.round(0.22 * s)}px 'DejaVu Sans', sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(num, (flip ? 0.5 : -0.5) * s, -0.07 * s);
  g.restore();
  // wheels
  for (const wx of [-0.62, 0.62]) {
    g.fillStyle = "#1A1A22";
    g.beginPath();
    g.arc(wx * s, 0.12 * s, 0.22 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#C9CED6";
    g.beginPath();
    g.arc(wx * s, 0.12 * s, 0.1 * s, 0, Math.PI * 2);
    g.fill();
  }
  // speed lines
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = s * 0.04;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(-1.2 * s - i * 0.05 * s, (-0.3 + i * 0.15) * s);
    g.lineTo(-1.6 * s - i * 0.1 * s, (-0.3 + i * 0.15) * s);
    g.stroke();
  }
  g.restore();
};

/** 2004, you: a royal-blue duvet with cartoon race cars, checkered flags and a winding track (0.6 m tile). */
export const racecarDuvetMat = (o: BeddingOpts = {}) =>
  fabricMat("racecar", o, () => {
    const map = canvasTex("racecar", 1024, 1024, (g, w, h) => {
      g.fillStyle = "#2457A8";
      g.fillRect(0, 0, w, h);
      const r = rand(64);
      // a winding track (tiles: drawn at offsets)
      for (const dy of [-h, 0, h]) {
        g.strokeStyle = "#5E6470";
        g.lineWidth = 70;
        g.beginPath();
        for (let x = -20; x <= w + 20; x += 10) {
          const y = h * 0.5 + Math.sin((x / w) * Math.PI * 2) * h * 0.18 + dy;
          if (x === -20) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.strokeStyle = "#F4F0E0";
        g.lineWidth = 4;
        g.setLineDash([22, 18]);
        g.stroke();
        g.setLineDash([]);
      }
      // stars and flags
      for (let i = 0; i < 26; i++) {
        g.fillStyle = r() < 0.5 ? "#F5D547" : "#FFFFFF";
        const [sx, sy, so, si, sr] = [r() * w, r() * h, 9 + r() * 7, 4 + r() * 3, r()];
        for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) star5(g, sx + dx, sy + dy, so, si, sr);
      }
      const flag = (x: number, y: number, s: number) => {
        g.fillStyle = "#EEE";
        g.fillRect(x - 3, y - s, 4, s * 1.6);
        for (let j = 0; j < 3; j++)
          for (let i = 0; i < 4; i++) {
            g.fillStyle = (i + j) % 2 ? "#111" : "#FFF";
            g.fillRect(x + i * (s / 4), y - s + j * (s / 4), s / 4, s / 4);
          }
      };
      flag(w * 0.12, h * 0.16, 44);
      flag(w * 0.68, h * 0.88, 44);
      flag(w * 0.9, h * 0.32, 36);
      const cars: [number, number, string, string, boolean][] = [
        [0.25, 0.18, "#E63B2E", "7", false],
        [0.72, 0.12, "#F2C230", "3", true],
        [0.4, 0.78, "#3FB34F", "5", false],
        [0.85, 0.66, "#FF7A1A", "9", true],
        [0.1, 0.55, "#F2F2F2", "1", false],
      ];
      for (const [x, y, c, nm, f] of cars) for (const dx of [-w, 0, w]) raceCar(g, x * w + dx, y * h, 78, c, nm, f);
      for (let i = 0; i < 30000; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(0,0,40,${r() * 0.06})` : `rgba(255,255,255,${r() * 0.05})`;
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
    });
    const normal = normalFromFn("cotton-fine", 512, 512, (u, v) => weaveH(u, v, 64), 1.2);
    return { map, normal, tile: [0.8, 0.8], sheen: 0.35, normalScale: 0.5 };
  });

const soccerBallDraw = (g: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) => {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = "#F7F7F2";
  g.beginPath();
  g.arc(0, 0, s, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#222";
  g.lineWidth = s * 0.06;
  g.stroke();
  g.fillStyle = "#1A1A1A";
  star5(g, 0, 0, s * 0.36, s * 0.3, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const b = a + (k / 5) * Math.PI * 2;
      const px = Math.cos(a) * s * 0.92 + Math.cos(b) * s * 0.2;
      const py = Math.sin(a) * s * 0.92 + Math.sin(b) * s * 0.2;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.36);
    g.lineTo(Math.cos(a) * s * 0.75, Math.sin(a) * s * 0.75);
    g.lineWidth = s * 0.05;
    g.stroke();
  }
  g.restore();
};

/** 2007, you: green pitch stripes with white lines and scattered soccer balls (0.6 m tile). */
export const soccerDuvetMat = (o: BeddingOpts = {}) =>
  fabricMat("soccerDuvet", o, () => {
    const map = canvasTex("soccerDuvet", 1024, 1024, (g, w, h) => {
      // pitch stripes along the bed (u across), a halfway line and centre circle, a few big balls
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 ? "#2E8B45" : "#277A3C";
        g.fillRect((i * w) / 6, 0, w / 6, h);
      }
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 7;
      g.beginPath();
      g.arc(w / 2, h / 2, 170, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(w / 2, h / 2, 9, 0, Math.PI * 2);
      g.fill();
      const r = rand(65);
      const balls: [number, number, number][] = [
        [0.2, 0.18, 74],
        [0.74, 0.3, 62],
        [0.36, 0.72, 80],
        [0.86, 0.82, 58],
        [0.08, 0.6, 52],
      ];
      for (const [x, y, s] of balls) for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) soccerBallDraw(g, x * w + dx, y * h + dy, s, x * 9);
      for (let i = 0; i < 30000; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(0,30,0,${r() * 0.07})` : `rgba(255,255,255,${r() * 0.05})`;
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
    });
    const normal = normalFromFn("cotton-fine", 512, 512, (u, v) => weaveH(u, v, 64), 1.2);
    return { map, normal, tile: [0.95, 0.95], sheen: 0.35, normalScale: 0.5 };
  });

/** A plain heathered colour (for duvets and sheets): mottled threads at the given tile. */
const heatherTex = (key: string, base: string, var_: number, seed: number) =>
  canvasTex(`heather-${key}`, 512, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = rand(seed);
    for (let i = 0; i < 40000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * var_})` : `rgba(255,255,255,${r() * var_ * 0.8})`;
      g.fillRect(r() * w, r() * h, r() < 0.5 ? 3 : 1, r() < 0.5 ? 1 : 3);
    }
  });

/** 2011, you: a plain navy duvet, heathered, with a fine twill. */
export const navyDuvetMat = (o: BeddingOpts = {}) =>
  fabricMat("navy", o, () => ({
    map: heatherTex("navy", "#1F2A44", 0.12, 66),
    normal: normalFromFn("twill", 512, 512, (u, v) => 0.5 + 0.5 * Math.sin((u * 96 + v * 96) * Math.PI * 2) * 0.5 + 0.2 * weaveH(u, v, 96), 1.4),
    tile: [0.25, 0.25],
    sheen: 0.55,
    sheenColor: "#8FA3D8",
    normalScale: 0.6,
  }));

/** 2016+, the guest bed: beige with a subtle waffle / matelasse weave. */
export const guestDuvetMat = (o: BeddingOpts = {}) =>
  fabricMat("guest", o, () => ({
    map: canvasTex("guestDuvet", 512, 512, (g, w, h) => {
      const base = heatherTex("guest0", "#D9CBB0", 0.06, 67).image as HTMLCanvasElement;
      g.drawImage(base, 0, 0);
      // waffle cells, light shading
      const n = 16;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = (i * w) / n;
          const y = (j * h) / n;
          const grd = g.createRadialGradient(x + w / n / 2, y + h / n / 2, 2, x + w / n / 2, y + h / n / 2, w / n / 1.6);
          grd.addColorStop(0, "rgba(90,70,40,0.10)");
          grd.addColorStop(1, "rgba(255,250,235,0.08)");
          g.fillStyle = grd;
          g.fillRect(x, y, w / n, h / n);
        }
    }),
    normal: normalFromFn("waffle", 512, 512, (u, v) => {
      const d = gridD(u, v, 16);
      return Math.min(1, d / 0.012) * 0.9 + 0.08 * weaveH(u, v, 128);
    }, 3),
    tile: [0.2, 0.2],
    sheen: 0.45,
    sheenColor: "#FFF3DC",
    normalScale: 0.8,
  }));

/** 2009, you: striped sheets (blues and white, along the bed). */
export const stripedSheetMat = (o: BeddingOpts = {}) =>
  fabricMat("striped", o, () => ({
    map: canvasTex("stripedSheet", 512, 512, (g, w, h) => {
      g.fillStyle = "#F3F5F7";
      g.fillRect(0, 0, w, h);
      const bands: [number, number, string][] = [
        [0, 60, "#3E6FB0"],
        [80, 12, "#8FB4E0"],
        [110, 26, "#3E6FB0"],
        [150, 8, "#C94B4B"],
        [256, 60, "#3E6FB0"],
        [336, 12, "#8FB4E0"],
        [366, 26, "#3E6FB0"],
        [406, 8, "#C94B4B"],
      ];
      for (const [x, bw, c] of bands) {
        g.fillStyle = c;
        g.fillRect(x, 0, bw, h);
      }
      const r = rand(68);
      for (let i = 0; i < 20000; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.05})` : `rgba(255,255,255,${r() * 0.06})`;
        g.fillRect(r() * w, r() * h, 1, 2);
      }
    }),
    normal: normalFromFn("cotton-fine", 512, 512, (u, v) => weaveH(u, v, 64), 1.2),
    tile: [0.3, 0.3],
    sheen: 0.3,
    normalScale: 0.5,
  }));

/** Plain percale sheets: white ("white") or cream ("cream"). */
export const plainSheetMat = (tone: "white" | "cream" = "white", o: BeddingOpts = {}) =>
  fabricMat(`plain-${tone}`, o, () => ({
    map: heatherTex(`plain-${tone}`, tone === "white" ? "#F2F1EC" : "#EDE3CC", 0.035, tone === "white" ? 69 : 70),
    normal: normalFromFn("percale", 512, 512, (u, v) => weaveH(u, v, 110), 1.0),
    tile: [0.2, 0.2],
    sheen: 0.3,
    sheenColor: "#FFFFFF",
    normalScale: 0.45,
  }));

/** 2013, Nora's sleeping bag: ripstop nylon with sewn-through baffle channels every 0.15 m (along u). */
export const sleepingBagMat = (color = "#2F6F86", o: BeddingOpts = {}) =>
  fabricMat(`sleepingBag-${color}`, o, () => ({
    map: canvasTex(`sleepingBag-${color}`, 512, 512, (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      // ripstop grid
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.lineWidth = 1.5;
      for (let i = 0; i < w; i += 16) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, h);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i);
        g.lineTo(w, i);
        g.stroke();
      }
      // baffle seams (3 per tile of 0.45 m), stitched
      for (let k = 0; k < 3; k++) {
        const y = ((k + 0.5) * h) / 3;
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(0, y - 2, w, 4);
        g.strokeStyle = "rgba(255,255,255,0.25)";
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
        g.setLineDash([]);
      }
    }),
    normal: normalFromFn("baffles", 256, 512, (u, v) => {
      const k = fract(v * 3 + 0.5);
      const d = Math.min(k, 1 - k);
      return Math.pow(Math.min(1, d / 0.5), 0.45) + 0.03 * (gridD(u, v, 32) < 0.002 ? 1 : 0);
    }, 9),
    tile: [0.45, 0.45],
    rough: 0.42,
    sheen: 0.2,
    clearcoat: 0.25,
    normalScale: 1,
  }));

export type PillowcaseKind = "white" | "cream" | "lilac" | "starQuilt" | "racecar" | "soccer" | "navy" | "striped" | "beige";
/** Pillowcases (UV 0..1 across a 0.62 x 0.4 pillow top by default; u along the pillow's width). */
export const pillowcaseMat = (kind: PillowcaseKind, o: BeddingOpts = {}) => {
  const uv = o.uvSize ?? [0.62, 0.4];
  switch (kind) {
    case "white":
    case "cream":
      return plainSheetMat(kind, { uvSize: uv });
    case "starQuilt":
      return starQuiltMat({ uvSize: uv });
    case "racecar":
      return racecarDuvetMat({ uvSize: uv });
    case "soccer":
      return soccerDuvetMat({ uvSize: uv });
    case "navy":
      return navyDuvetMat({ uvSize: uv });
    case "striped":
      return stripedSheetMat({ uvSize: uv });
    case "beige":
      return guestDuvetMat({ uvSize: uv });
    case "lilac":
    default:
      return fabricMat("lilacCase", { uvSize: uv }, () => ({
        map: heatherTex("lilac", "#C8B4E8", 0.05, 71),
        normal: normalFromFn("percale", 512, 512, (u, v) => weaveH(u, v, 110), 1.0),
        tile: [0.2, 0.2],
        sheen: 0.4,
        sheenColor: "#EDE0FF",
        normalScale: 0.45,
      }));
  }
};

// ======================================================================================= textures: screens
export type ScreenKind = "chat" | "feed" | "lock" | "video" | "off";
/** A generic phone screen (no brand): a chat thread, a photo feed, a lock screen or a video. */
export const phoneScreenTex = (kind: ScreenKind, accent = "#4C8DFF") =>
  canvasTex(`screen-${kind}-${accent}`, 360, 740, (g, w, h) => {
    if (kind === "off") {
      g.fillStyle = "#000";
      g.fillRect(0, 0, w, h);
      return;
    }
    if (kind === "lock") {
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#2B3A67");
      bg.addColorStop(1, "#C76D7E");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.92)";
      g.font = "200 92px 'DejaVu Sans', sans-serif";
      g.textAlign = "center";
      g.fillText("11:47", w / 2, h * 0.27);
      g.font = "22px 'DejaVu Sans', sans-serif";
      g.fillText("Wednesday 24", w / 2, h * 0.32);
      return;
    }
    g.fillStyle = kind === "video" ? "#000" : "#101318";
    g.fillRect(0, 0, w, h);
    // status bar
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillRect(20, 16, 40, 8);
    g.fillRect(w - 60, 16, 40, 8);
    const r = rand(kind.length * 7);
    if (kind === "chat") {
      g.fillStyle = "#1B2029";
      g.fillRect(0, 36, w, 70);
      g.fillStyle = accent;
      g.beginPath();
      g.arc(46, 71, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.fillRect(78, 62, 120, 14);
      let y = 140;
      for (let i = 0; i < 9; i++) {
        const mine = r() < 0.5;
        const bw = 90 + r() * 160;
        const bh = 34 + Math.floor(r() * 2) * 26;
        g.fillStyle = mine ? accent : "#2A303B";
        const x = mine ? w - 16 - bw : 16;
        g.beginPath();
        g.roundRect(x, y, bw, bh, 16);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.75)";
        for (let l = 0; l < bh / 26; l++) g.fillRect(x + 14, y + 13 + l * 24, bw * (0.5 + r() * 0.35), 8);
        y += bh + 12;
      }
      g.fillStyle = "#1B2029";
      g.fillRect(0, h - 70, w, 70);
      g.fillStyle = "#2A303B";
      g.beginPath();
      g.roundRect(16, h - 56, w - 32, 40, 20);
      g.fill();
    } else if (kind === "feed") {
      let y = 50;
      for (let i = 0; i < 3; i++) {
        g.fillStyle = "#3A4250";
        g.beginPath();
        g.arc(34, y + 20, 14, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.fillRect(56, y + 14, 110, 10);
        const ph = g.createLinearGradient(0, y + 44, w, y + 44 + 200);
        const hue = r() * 360;
        ph.addColorStop(0, `hsl(${hue},45%,55%)`);
        ph.addColorStop(1, `hsl(${(hue + 60) % 360},50%,35%)`);
        g.fillStyle = ph;
        g.fillRect(0, y + 44, w, 200);
        g.fillStyle = "rgba(255,255,255,0.5)";
        g.fillRect(16, y + 256, 200, 9);
        y += 290;
      }
    } else {
      const ph = g.createLinearGradient(0, h * 0.3, w, h * 0.7);
      ph.addColorStop(0, "#5A7FA8");
      ph.addColorStop(1, "#E3B37A");
      g.fillStyle = ph;
      g.fillRect(0, h * 0.36, w, h * 0.28);
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.fillRect(20, h * 0.66, w - 40, 4);
      g.fillStyle = accent;
      g.fillRect(20, h * 0.66, (w - 40) * 0.4, 4);
    }
  });

/** A generic laptop screen: a platform game, a video, or a dark desktop. */
export const laptopScreenTex = (kind: "game" | "video" | "desktop" = "game") =>
  canvasTex(`laptop-${kind}`, 640, 400, (g, w, h) => {
    const r = rand(kind.length * 9);
    if (kind === "game") {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#5CA8F0");
      sky.addColorStop(1, "#BFE6FF");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.beginPath();
        g.ellipse(r() * w, 40 + r() * 100, 40, 16, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#3C9A3C";
      g.fillRect(0, h * 0.8, w, h * 0.2);
      g.fillStyle = "#8A5A2B";
      g.fillRect(0, h * 0.86, w, h * 0.14);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = "#C98A3A";
        g.fillRect(120 + i * 120, h * 0.55 - (i % 2) * 40, 80, 20);
      }
      g.fillStyle = "#E23A3A";
      g.fillRect(200, h * 0.8 - 40, 26, 40);
      g.fillStyle = "#FFD23A";
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(300 + i * 40, h * 0.45, 8, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === "video") {
      g.fillStyle = "#000";
      g.fillRect(0, 0, w, h);
      const ph = g.createLinearGradient(0, 0, w, h);
      ph.addColorStop(0, "#3B4A6B");
      ph.addColorStop(1, "#C98A5A");
      g.fillStyle = ph;
      g.fillRect(0, h * 0.1, w, h * 0.8);
    } else {
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#1C2A3E");
      bg.addColorStop(1, "#3C4E6E");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(0, h - 26, w, 26);
    }
  });
