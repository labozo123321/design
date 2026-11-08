import * as THREE from "three";
import { LIFT_FONT } from "./fonts";

/**
 * The cartoon look's building blocks: soft three-band toon materials (the reel's flat colours with a
 * gentle shadow side), glow materials for holograms and lights, and canvas textures for labels.
 * Everything is cached by key so a frame never rebuilds what the last one made.
 */

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A soft ramp: shadow side, half tone, lit; linear filtering blurs the band edges a little. */
const ramp = (() => {
  const data = new Uint8Array([120, 120, 120, 255, 175, 175, 175, 255, 228, 228, 228, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const mats = new Map<string, THREE.Material>();
const cached = <T extends THREE.Material>(key: string, make: () => T): T => {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m as T;
};

export type ToonOpts = { emissive?: string; ei?: number; side?: THREE.Side; map?: THREE.Texture | null; opacity?: number; flat?: boolean; emap?: boolean };

/** Flat cartoon colour with a soft shadow side. */
export const toon = (color: string, o: ToonOpts = {}): THREE.MeshToonMaterial =>
  cached(`toon|${color}|${o.emissive ?? ""}|${o.ei ?? 0}|${o.side ?? 0}|${o.map?.uuid ?? ""}|${o.opacity ?? 1}|${o.flat ?? false}|${o.emap ?? false}`, () => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp, side: o.side ?? THREE.FrontSide, map: o.map ?? null });
    if (o.emissive) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.ei ?? 1;
      if (o.emap && o.map) m.emissiveMap = o.map;
    }
    if ((o.opacity ?? 1) < 1) {
      m.transparent = true;
      m.opacity = o.opacity ?? 1;
    }
    return m;
  });

/** Glossy dark plastic (the hoodies, shoes, screens): a soft highlight on black. */
export const gloss = (color: string, rough = 0.38): THREE.MeshStandardMaterial =>
  cached(`gloss|${color}|${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.0 }));

/** Unlit colour (screens, signs, the sky's things); `glow` > 1 feeds the bloom. */
export const flat = (color: string, glow = 1, o: { opacity?: number; side?: THREE.Side; map?: THREE.Texture | null; depthWrite?: boolean; additive?: boolean } = {}): THREE.MeshBasicMaterial =>
  cached(`flat|${color}|${glow}|${o.opacity ?? 1}|${o.side ?? 0}|${o.map?.uuid ?? ""}|${o.depthWrite ?? true}|${o.additive ?? false}`, () => {
    const c = new THREE.Color(color).multiplyScalar(glow);
    const m = new THREE.MeshBasicMaterial({ color: c, side: o.side ?? THREE.FrontSide, map: o.map ?? null, toneMapped: true });
    if ((o.opacity ?? 1) < 1 || o.additive) {
      m.transparent = true;
      m.opacity = o.opacity ?? 1;
    }
    if (o.additive) m.blending = THREE.AdditiveBlending;
    m.depthWrite = o.depthWrite ?? !(o.additive || (o.opacity ?? 1) < 1);
    return m;
  });

// ------------------------------------------------------------------------------------------- textures
const texs = new Map<string, THREE.Texture>();
export const canvasTex = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, o: { srgb?: boolean; repeat?: [number, number]; mip?: boolean } = {}): THREE.Texture => {
  let t = texs.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  if (o.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (o.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(o.repeat[0], o.repeat[1]);
  }
  if (o.mip === false) {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
  }
  tex.needsUpdate = true;
  texs.set(key, tex);
  t = tex;
  return t;
};

export const FONT = LIFT_FONT;

export type LabelOpts = {
  size?: number;
  color?: string;
  stroke?: string;
  strokeW?: number;
  bg?: string;
  radius?: number;
  pad?: number;
  weight?: number;
  w?: number;
  h?: number;
  font?: string;
  spacing?: number;
};

/** A word or two on a transparent (or filled) card, for signs and on-screen labels in 3D. Returns the
 * texture and its aspect (w/h). */
export const labelTex = (text: string, o: LabelOpts = {}): { tex: THREE.Texture; aspect: number } => {
  const size = o.size ?? 120;
  const pad = o.pad ?? Math.round(size * 0.35);
  const weight = o.weight ?? 900;
  const font = `${weight} ${size}px ${o.font ?? FONT}`;
  const meas = document.createElement("canvas").getContext("2d")!;
  meas.font = font;
  const lines = text.split("\n");
  const tw = Math.max(...lines.map((l) => meas.measureText(l).width + (o.spacing ?? 0) * l.length));
  const w = o.w ?? Math.ceil(tw + pad * 2);
  const h = o.h ?? Math.ceil(size * 1.18 * lines.length + pad * 2);
  const key = `label|${text}|${JSON.stringify(o)}`;
  const tex = canvasTex(key, w, h, (g) => {
    if (o.bg) {
      g.fillStyle = o.bg;
      const r = o.radius ?? size * 0.3;
      g.beginPath();
      g.roundRect(0, 0, w, h, r);
      g.fill();
    }
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if ("letterSpacing" in g && o.spacing) (g as unknown as { letterSpacing: string }).letterSpacing = `${o.spacing}px`;
    lines.forEach((l, i) => {
      const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.18;
      if (o.stroke) {
        g.lineJoin = "round";
        g.strokeStyle = o.stroke;
        g.lineWidth = o.strokeW ?? size * 0.16;
        g.strokeText(l, w / 2, y);
      }
      g.fillStyle = o.color ?? "#ffffff";
      g.fillText(l, w / 2, y);
    });
  });
  return { tex, aspect: w / h };
};

// ------------------------------------------------------------------------------------------- easing
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
export const smoother = (u: number) => {
  const x = clamp01(u);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const easeOut = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);
export const easeIn = (u: number) => Math.pow(clamp01(u), 3);
export const expoOut = (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(u)));
export const backOut = (u: number, s = 1.6) => {
  const x = clamp01(u) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const mixV = (a: THREE.Vector3, b: THREE.Vector3, k: number) => a.clone().lerp(b, k);
/** Deterministic hash noise in [0, 1). */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Smooth 1D value noise in [-1, 1]. */
export const noise1 = (x: number, seed = 0) => {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i + seed * 57.3) * 2 - 1;
  const b = hash(i + 1 + seed * 57.3) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
};
