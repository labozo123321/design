import * as THREE from "three";
import { neutralPoint, type Shape } from "./sculpt";

/**
 * Painted maps for the heads, drawn in the sphere's UV space (the face is at u = 0.25, v = 0.5):
 *  - skin: the person's tone with warmth in the cheeks, nose, ears and chin, a little mottling, the lips'
 *    border, freckles if they have them; and a roughness map (shinier forehead and nose);
 *  - irises: fibres, a darker limbal ring, the collarette, the pupil;
 *  - hair: fine strands to break up the shells' colour and shine;
 *  - lashes: strands on a clear card.
 */

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, y: number) => {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j);
  const b = hash(i + 1, j);
  const c = hash(i, j + 1);
  const d = hash(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};
const g2 = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  Math.exp(-(((x - cx) / rx) ** 2) - ((y - cy) / ry) ** 2);

export type SkinLook = {
  /** the brows' colour, painted softly under the hairs */
  browTint?: string;
  tone: string;
  blush: number;
  freckles: number;
  lip: string;
  seed: number;
  /** years on the face, 0..1 (0: none, 0.5: the fifties, 1: the late seventies): forehead lines, crow's
   * feet, the folds from nose to mouth, softer under the eyes, a few age spots; and a bump map for them */
  age?: number;
};

/** A wrinkle: a polyline in face coordinates (x, y on the neutral surface, metres), its width and depth. */
type Crease = { pts: [number, number][]; w: number; k: number };
const creasesFor = (sh: Shape, age: number, seed: number): Crease[] => {
  const out: Crease[] = [];
  const ey = sh.eyeY;
  const ex = sh.eyeX;
  const j = (n: number) => (hash(n, seed) - 0.5) * 0.0016;
  // the forehead: three long shallow lines, a little wavy, deeper with age
  for (let r = 0; r < 3; r++) {
    const y0 = ey + 0.036 + r * 0.0105;
    const span = 0.042 - r * 0.004;
    const pts: [number, number][] = [];
    for (let q = 0; q <= 8; q++) {
      const x = -span + (2 * span * q) / 8;
      pts.push([x, y0 + Math.cos((x / span) * 1.4) * 0.0022 + j(r * 13 + q)]);
    }
    out.push({ pts, w: 0.0011, k: 0.55 * age });
  }
  // between the brows: two short upright lines past the middle years
  for (const sd of [-1, 1]) out.push({ pts: [[sd * 0.0055, ey + 0.016], [sd * 0.0065, ey + 0.029]], w: 0.0009, k: Math.max(0, age - 0.35) * 0.8 });
  for (const sd of [-1, 1]) {
    // crow's feet: three fanned lines from the outer corner of each eye
    const cx = sd * (ex + sh.eyeR * 1.35);
    for (const a of [-0.45, 0, 0.42]) {
      const len = 0.0105 + 0.002 * Math.cos(a * 3);
      out.push({ pts: [[cx, ey + a * 0.004], [cx + sd * Math.cos(a) * len, ey + Math.sin(a) * len - 0.001]], w: 0.0008, k: 0.75 * age });
    }
    // under the eye: the lid's lower fold
    const pts: [number, number][] = [];
    for (let q = 0; q <= 6; q++) {
      const t = q / 6;
      const x = sd * (ex - sh.eyeR * 0.9 + t * sh.eyeR * 2.2);
      pts.push([x, ey - sh.eyeR * 1.25 - Math.sin(t * Math.PI) * 0.0032]);
    }
    out.push({ pts, w: 0.0012, k: 0.6 * age });
    // nose to the corner of the mouth: the deepest, widest fold
    const nl: [number, number][] = [];
    for (let q = 0; q <= 8; q++) {
      const t = q / 8;
      const x = sd * (sh.noseW * 0.0165 + t * (sh.mouthW * 0.5 + 0.004 - sh.noseW * 0.0165) + Math.sin(t * Math.PI) * 0.004);
      nl.push([x, sh.noseY + 0.003 - t * (sh.noseY + 0.003 - (sh.mouthY - 0.008))]);
    }
    out.push({ pts: nl, w: 0.0022, k: 0.85 * age });
    // and past sixty, from the mouth's corners toward the chin
    out.push({ pts: [[sd * (sh.mouthW * 0.5 + 0.002), sh.mouthY - 0.004], [sd * (sh.mouthW * 0.5 + 0.004), sh.chinY + 0.018]], w: 0.0016, k: Math.max(0, age - 0.55) * 1.1 });
  }
  return out;
};
const segDist = (x: number, y: number, a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};
const creaseAt = (cs: Crease[], x: number, y: number) => {
  let v = 0;
  for (const c of cs) {
    if (c.k <= 0) continue;
    let d = 1;
    for (let i = 0; i < c.pts.length - 1; i++) d = Math.min(d, segDist(x, y, c.pts[i], c.pts[i + 1]));
    if (d < c.w * 3) v += c.k * Math.exp(-((d / c.w) ** 2));
  }
  return Math.min(1, v);
};

/** Direction on the unit sphere for a UV of THREE.SphereGeometry. */
export const dirOfUV = (u: number, v: number, out = new THREE.Vector3()) => {
  const phi = u * Math.PI * 2;
  const theta = (1 - v) * Math.PI;
  return out.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
};

const cache: Record<string, { map: THREE.Texture; rough: THREE.Texture; bump?: THREE.Texture }> = {};

export const skinMaps = (sh: Shape, look: SkinLook) => {
  const key = `${JSON.stringify(sh)}|${JSON.stringify(look)}`;
  if (cache[key]) return cache[key];
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  const cr = document.createElement("canvas");
  cr.width = W;
  cr.height = H;
  const gr = cr.getContext("2d")!;
  const rimg = gr.createImageData(W, H);
  const age = look.age ?? 0;
  const creases = age > 0 ? creasesFor(sh, age, look.seed) : [];
  const cb = age > 0 ? document.createElement("canvas") : null;
  const gb = cb ? ((cb.width = W), (cb.height = H), cb.getContext("2d")!) : null;
  const bimg = gb ? gb.createImageData(W, H) : null;
  const spot = new THREE.Color(look.tone).multiplyScalar(0.72).lerp(new THREE.Color("#7A4A2A"), 0.3);
  const base = new THREE.Color(look.tone);
  // older skin: a little less colour and less flush
  if (age > 0) base.lerp(new THREE.Color(look.tone).offsetHSL(0, -0.06 * age, 0.01 * age), 1);
  const warm = base.clone().lerp(new THREE.Color("#D9584E"), 0.32);
  const lip = new THREE.Color(look.lip);
  const shade = base.clone().multiplyScalar(0.86).lerp(new THREE.Color("#7A5A6A"), 0.12);
  const freckle = base.clone().multiplyScalar(0.68).lerp(new THREE.Color("#8A4A2A"), 0.35);
  const dir = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W;
      const v = 1 - (j + 0.5) / H;
      dirOfUV(u, v, dir);
      neutralPoint(sh, dir, p);
      const x = p.x;
      const y = p.y;
      const front = Math.max(0, Math.min(1, (p.z + 0.01) / 0.05));
      col.copy(base);
      // mottling: large soft patches and fine grain
      const n1 = vnoise(x * 90 + look.seed, y * 90) - 0.5;
      const n2 = vnoise(x * 700 + look.seed * 3, y * 700) - 0.5;
      col.multiplyScalar(1 + n1 * 0.06 + n2 * 0.025);
      // warmth: cheeks, nose, ears, chin, and around the eyes a touch
      let w = 0;
      w += look.blush * front * (g2(Math.abs(x), y, 0.04, sh.mouthY + 0.02, 0.02, 0.017) * 0.9);
      w += front * g2(x, y, 0, sh.noseY, 0.012, 0.01) * 0.55;
      w += front * g2(x, y, 0, sh.chinY + 0.012, 0.016, 0.01) * 0.3;
      w += Math.max(0, Math.abs(dir.x) - 0.85) * 4 * (1 - front) * 0.7 * (1 - Math.abs(dir.y) * 1.4);
      col.lerp(warm, Math.min(1, w));
      // a little darker in the eye sockets
      const sock = front * (g2(Math.abs(x), y, sh.eyeX, sh.eyeY - 0.004, 0.02, 0.013) * 0.35);
      col.lerp(shade, sock);
      // a soft shadow of brow under the brow hairs
      if (look.browTint) {
        const bt = new THREE.Color(look.browTint);
        for (const sd of [-1, 1]) {
          const tt = (x * sd - sh.eyeX * 0.38) / (sh.eyeX * 1.2);
          if (tt > -0.1 && tt < 1.1) {
            const by = sh.eyeY + 0.0195 + 0.0055 * Math.sin(Math.PI * Math.min(1, Math.max(0, tt) * 1.2)) - 0.0035 * tt;
            const th = (sh.kid ? 0.0032 : 0.0042) * (1 - 0.55 * Math.max(0, tt));
            const k = Math.exp(-(((y - by) / th) ** 2)) * Math.min(1, Math.max(0, tt + 0.1) / 0.15) * Math.min(1, (1.1 - tt) / 0.2);
            col.lerp(bt, front * k * 0.5);
          }
        }
      }
      // the lips' border on the skin (the lips themselves are their own meshes)
      const lipW = sh.mouthW * 0.52;
      const lk = Math.min(1, Math.abs(x) / lipW);
      const lipBand = front * (1 - lk * lk) * Math.exp(-(((y - sh.mouthY) / (sh.portrait ? 0.0048 : 0.0065)) ** 2));
      col.lerp(lip, Math.min(1, lipBand * (sh.portrait ? 0.55 : 1.1)));
      // freckles over the nose and cheeks
      if (look.freckles > 0) {
        const fz = front * g2(x, y, 0, sh.noseY + 0.006, 0.05, 0.022);
        if (fz > 0.05) {
          const cx = Math.floor(x * 520);
          const cy = Math.floor(y * 520);
          const h = hash(cx + look.seed * 7, cy);
          if (h > 1 - 0.22 * look.freckles * fz) {
            const ox = (hash(cx, cy + 9) - 0.5) * 0.8;
            const oy = (hash(cx + 4, cy) - 0.5) * 0.8;
            const fx = x * 520 - cx - 0.5 - ox * 0.5;
            const fy = y * 520 - cy - 0.5 - oy * 0.5;
            const d = Math.sqrt(fx * fx + fy * fy);
            col.lerp(freckle, Math.max(0, 1 - d * 2.2) * 0.75);
          }
        }
      }
      // the years: creases (darker in their valleys), a little shadow under the eyes, a few age spots
      let crease = 0;
      if (age > 0 && front > 0.05) {
        crease = creaseAt(creases, x, y) * front;
        col.lerp(shade, crease * 0.72);
        col.lerp(shade, front * age * 0.25 * (g2(Math.abs(x), y, sh.eyeX, sh.eyeY - sh.eyeR * 1.5, 0.014, 0.006)));
        if (age > 0.5) {
          const sx = Math.floor(x * 260);
          const sy = Math.floor(y * 260);
          if (hash(sx + look.seed * 3, sy - 7) > 1 - 0.035 * (age - 0.5)) {
            const fx = x * 260 - sx - 0.5;
            const fy = y * 260 - sy - 0.5;
            col.lerp(spot, Math.max(0, 1 - Math.hypot(fx, fy) * 2.4) * 0.5);
          }
        }
      }
      const o = (j * W + i) * 4;
      if (bimg) {
        const bv = Math.round(Math.max(0, Math.min(1, 0.75 - crease * 0.75)) * 255);
        bimg.data[o] = bv;
        bimg.data[o + 1] = bv;
        bimg.data[o + 2] = bv;
        bimg.data[o + 3] = 255;
      }
      img.data[o] = Math.round(Math.min(1, col.r) ** (1 / 2.2) * 255);
      img.data[o + 1] = Math.round(Math.min(1, col.g) ** (1 / 2.2) * 255);
      img.data[o + 2] = Math.round(Math.min(1, col.b) ** (1 / 2.2) * 255);
      img.data[o + 3] = 255;
      // roughness: forehead and nose shinier, lips a little shiny, the rest soft
      let r = 0.56;
      r -= 0.12 * front * g2(x, y, 0, sh.eyeY + 0.05, 0.035, 0.022);
      r -= 0.14 * front * g2(x, y, 0, sh.noseY + 0.004, 0.01, 0.02);
      r -= 0.18 * lipBand;
      r += n2 * 0.08;
      const rv = Math.round(Math.max(0, Math.min(1, r)) * 255);
      rimg.data[o] = rv;
      rimg.data[o + 1] = rv;
      rimg.data[o + 2] = rv;
      rimg.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  gr.putImageData(rimg, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const rough = new THREE.CanvasTexture(cr);
  rough.anisotropy = 8;
  let bump: THREE.Texture | undefined;
  if (gb && bimg && cb) {
    gb.putImageData(bimg, 0, 0);
    bump = new THREE.CanvasTexture(cb);
    bump.anisotropy = 8;
  }
  cache[key] = { map, rough, bump };
  return cache[key];
};

const irisCache: Record<string, THREE.Texture> = {};
/** The eye's front, planar-mapped: (0.5, 0.5) is the pupil; the iris reaches IRIS_R. */
export const IRIS_R = 0.29;
export const irisMap = (colour: string, seed: number) => {
  const key = `${colour}${seed}`;
  if (irisCache[key]) return irisCache[key];
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  // the white, a little warm and veined toward the edge
  g.fillStyle = "#F4EFEA";
  g.fillRect(0, 0, S, S);
  const rg = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.52);
  rg.addColorStop(0, "rgba(255,255,255,0)");
  rg.addColorStop(1, "rgba(214,160,150,0.55)");
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = "rgba(190,70,70,0.35)";
  g.lineWidth = 0.7;
  for (let k = 0; k < 14; k++) {
    const a = hash(k, seed) * Math.PI * 2;
    let x = S / 2 + Math.cos(a) * S * 0.5;
    let y = S / 2 + Math.sin(a) * S * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let st = 0; st < 6; st++) {
      x += (S / 2 - x) * 0.09 + (hash(k, st) - 0.5) * 6;
      y += (S / 2 - y) * 0.09 + (hash(st, k) - 0.5) * 6;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const R = S * IRIS_R;
  const base = new THREE.Color(colour);
  const dark = base.clone().multiplyScalar(0.45);
  const light = base.clone().lerp(new THREE.Color("#E8C27A"), 0.35);
  // the iris: base colour, fibres, the darker limbal ring
  const ig = g.createRadialGradient(S / 2, S / 2, R * 0.3, S / 2, S / 2, R);
  ig.addColorStop(0, `#${light.getHexString()}`);
  ig.addColorStop(0.55, `#${base.getHexString()}`);
  ig.addColorStop(0.86, `#${base.clone().multiplyScalar(0.8).getHexString()}`);
  ig.addColorStop(1, `#${dark.clone().multiplyScalar(0.5).getHexString()}`);
  g.fillStyle = ig;
  g.beginPath();
  g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
  g.fill();
  for (let k = 0; k < 220; k++) {
    const a = (k / 220) * Math.PI * 2 + hash(k, seed) * 0.03;
    const r0 = R * (0.32 + hash(k, 2) * 0.1);
    const r1 = R * (0.75 + hash(k, 3) * 0.24);
    g.strokeStyle = hash(k, 5) > 0.5 ? `rgba(255,240,210,${0.12 + hash(k, 6) * 0.12})` : `rgba(20,10,5,${0.12 + hash(k, 7) * 0.14})`;
    g.lineWidth = 0.6 + hash(k, 8) * 0.8;
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0);
    g.lineTo(S / 2 + Math.cos(a + (hash(k, 9) - 0.5) * 0.05) * r1, S / 2 + Math.sin(a) * r1);
    g.stroke();
  }
  // collarette ring and the pupil
  g.strokeStyle = `rgba(${Math.round(light.r * 255)},${Math.round(light.g * 220)},${Math.round(light.b * 160)},0.45)`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(S / 2, S / 2, R * 0.5, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#070608";
  g.beginPath();
  g.arc(S / 2, S / 2, R * 0.36, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  irisCache[key] = tex;
  return tex;
};

let strandTex: THREE.Texture | null = null;
let strandBump: THREE.Texture | null = null;
/** Fine hair strands running along v (tileable): a colour multiplier and a bump. */
export const strandMaps = () => {
  if (strandTex && strandBump) return { map: strandTex, bump: strandBump };
  const W = 256;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b0b0b0";
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 900; k++) {
    const x = hash(k, 1) * W;
    const w = 0.6 + hash(k, 2) * 1.6;
    const l = hash(k, 3);
    g.fillStyle = l > 0.5 ? `rgba(255,255,255,${0.06 + l * 0.12})` : `rgba(0,0,0,${0.06 + (1 - l) * 0.14})`;
    // gently wavy strand
    g.beginPath();
    for (let y = 0; y <= H; y += 16) {
      const xx = x + Math.sin(y * 0.02 + k) * 2;
      if (y === 0) g.moveTo(xx, y);
      else g.lineTo(xx, y);
    }
    g.lineWidth = w;
    g.strokeStyle = g.fillStyle;
    g.stroke();
  }
  strandTex = new THREE.CanvasTexture(c);
  strandTex.wrapS = strandTex.wrapT = THREE.RepeatWrapping;
  strandTex.anisotropy = 8;
  strandBump = strandTex;
  return { map: strandTex, bump: strandBump };
};

let lashTex: THREE.Texture | null = null;
/** Eyelashes on a clear card: u along the lid, v from the root (0) to the tips (1). */
export const lashMap = () => {
  if (lashTex) return lashTex;
  const W = 256;
  const H = 64;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, W, H);
  for (let k = 0; k < 70; k++) {
    const x = (k / 70) * W + (hash(k, 1) - 0.5) * 4;
    const len = H * (0.55 + 0.45 * Math.sin((k / 70) * Math.PI)) * (0.8 + hash(k, 2) * 0.2);
    const curl = (x / W - 0.5) * 10 + (hash(k, 3) - 0.5) * 4;
    g.strokeStyle = "rgba(20,14,12,0.95)";
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x + curl * 0.3, len * 0.6, x + curl, len);
    g.stroke();
  }
  lashTex = new THREE.CanvasTexture(c);
  lashTex.colorSpace = THREE.SRGBColorSpace;
  return lashTex;
};

const gumCache: Record<string, THREE.Texture> = {};

/**
 * Where a popped bubble's skin sticks to a face: a film over the mouth and chin, torn and ragged at the
 * edges, with bits on a cheek, the tip of the nose and under one eye. r: cover (0..1), g: the film's rim.
 */
export const gumMap = (sh: Shape, seed: number) => {
  const key = `${JSON.stringify(sh)}|${seed}`;
  if (gumCache[key]) return gumCache[key];
  const W = 2048;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  const s = sh.w / 0.073;
  const my = sh.mouthY;
  // [x, y, rx, ry, angle]: the sheet over the mouth, a cap on the nose, a patch on one cheek, and strands
  // stretched out from the sheet's edge
  const blobs: [number, number, number, number, number][] = [
    [0.002 * s, my + 0.003 * s, 0.03 * s, 0.022 * s, 0],
    [0.0, sh.noseY + 0.002 * s, 0.0095 * s, 0.009 * s, 0],
    [0.029 * s, my + 0.014 * s, 0.011 * s, 0.008 * s, 0.3],
    [0.04 * s, my + 0.006 * s, 0.017 * s, 0.0019 * s, 0.18],
    [-0.035 * s, my - 0.001 * s, 0.013 * s, 0.0017 * s, -0.12],
    [0.012 * s, my - 0.026 * s, 0.0021 * s, 0.012 * s, 0.25],
    [-0.022 * s, my + 0.024 * s, 0.014 * s, 0.0015 * s, -0.75],
    [-0.008 * s, my - 0.024 * s, 0.0016 * s, 0.009 * s, -0.2],
  ];
  // torn holes in the sheet
  const holes: [number, number, number][] = [
    [-0.017 * s, my - 0.009 * s, 0.0042 * s],
    [0.017 * s, my + 0.013 * s, 0.003 * s],
    [0.021 * s, my - 0.012 * s, 0.0025 * s],
  ];
  const dir = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let j = 0; j < H; j++) {
    const v = 1 - (j + 0.5) / H;
    if (v < 0.2 || v > 0.62) continue;
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W;
      if (u < 0.1 || u > 0.4) continue;
      dirOfUV(u, v, dir);
      neutralPoint(sh, dir, p);
      if (p.z < 0) continue;
      const x = p.x;
      const y = p.y;
      // a smooth union of the blobs (1 at a centre, 0 on its edge)
      let f = -1;
      blobs.forEach(([cx, cy, rx, ry, a], bi) => {
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const dx = x - cx;
        const dy = y - cy;
        const b = 1 - ((dx * ca + dy * sa) / rx) ** 2 - ((-dx * sa + dy * ca) / ry) ** 2;
        f = bi === 0 ? b : Math.max(f, b) + 0.12 * Math.exp(-Math.abs(f - b) * 6);
      });
      // ragged edges
      f += (vnoise(x * 330 + seed, y * 330) - 0.5) * 0.4 + (vnoise(x * 1300 + seed * 2, y * 1300) - 0.5) * 0.18;
      for (const [hx, hy, hr] of holes) f -= 1.4 * Math.exp(-(((x - hx) ** 2 + (y - hy) ** 2) / (hr * hr)));
      const cover = Math.min(1, Math.max(0, f / 0.1));
      const rim = Math.exp(-(((f - 0.05) / 0.09) ** 2));
      const o = (j * W + i) * 4;
      img.data[o] = Math.round(cover * 255);
      img.data[o + 1] = Math.round(rim * cover * 255);
    }
  }
  for (let o = 3; o < img.data.length; o += 4) img.data[o] = 255;
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  gumCache[key] = t;
  return t;
};
