import React, { useMemo } from "react";
import * as THREE from "three";
import { random } from "remotion";
import { EARTH_R } from "./timeline";

/** Low golden sun to the north-west, behind the river. */
export const SUN_DIR = new THREE.Vector3(-0.8, 0.5, -0.33).normalize();

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** 0 on the ground, 1 in space (log-altitude). */
export const spaceness = (alt: number) => smooth(Math.log(3000), Math.log(60000), Math.log(Math.max(1, alt)));
export const horizonDip = (alt: number) => Math.acos(EARTH_R / (EARTH_R + Math.max(0, alt)));

const C = (h: string) => new THREE.Color(h);
const GROUND = { zenith: C("#5C8FD3"), mid: C("#A9C6E8"), horizon: C("#F4D3A8"), sun: C("#FFC77A") };
const SPACE = { zenith: C("#000003"), mid: C("#02030A"), horizon: C("#5D9BFF"), sun: C("#FFF3DC") };

/** Sky colour in a world direction, at a given altitude. */
export const skyColor = (dir: THREE.Vector3, alt: number, out = new THREE.Color()) => {
  const s = spaceness(alt);
  const dip = horizonDip(alt);
  const e = Math.asin(Math.max(-1, Math.min(1, dir.y))) + dip; // elevation above the true horizon
  const band = 0.25 * (1 - s) + 0.02 * s; // horizon glow gets thin up high
  const k = Math.min(1, Math.max(0, e / band));
  const zen = GROUND.zenith.clone().lerp(SPACE.zenith, s);
  const mid = GROUND.mid.clone().lerp(SPACE.mid, s);
  const hor = GROUND.horizon.clone().lerp(SPACE.horizon, s);
  if (e < 0) out.copy(hor).multiplyScalar(1 - s * 0.6);
  else if (k < 1) out.copy(hor).lerp(mid, k);
  else out.copy(mid).lerp(zen, Math.min(1, (e - band) / (0.9 - band * 0.5)));
  const sd = Math.max(0, dir.dot(SUN_DIR));
  out.lerp(GROUND.sun.clone().lerp(SPACE.sun, s), Math.pow(sd, 18) * 0.85 + Math.pow(sd, 4) * 0.2 * (1 - s));
  return out;
};

/** Sky dome centred on the camera, vertex coloured every frame. */
export const SkyDome: React.FC<{ cam: THREE.Vector3; alt: number }> = ({ cam, alt }) => {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 96, 64);
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }, []);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    skyColor(v, alt, c);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  const R = 9e6;
  return (
    <mesh geometry={geo} position={cam} scale={R} renderOrder={-10} frustumCulled={false}>
      <meshBasicMaterial
        vertexColors
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
};

let glowTex: THREE.Texture | null = null;
export const glow = () => {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.12, "rgba(255,250,235,0.9)");
  grd.addColorStop(0.35, "rgba(255,220,170,0.25)");
  grd.addColorStop(1, "rgba(255,200,150,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
};

export const Sun: React.FC<{ cam: THREE.Vector3; alt: number }> = ({ cam, alt }) => {
  const s = spaceness(alt);
  const d = 8e6;
  const p = cam.clone().addScaledVector(SUN_DIR, d);
  const size = d * (0.07 + 0.05 * (1 - s));
  return (
    <sprite position={p} scale={[size, size, 1]} renderOrder={-9} frustumCulled={false}>
      <spriteMaterial
        map={glow()}
        color={s > 0.5 ? "#FFFFFF" : "#FFE2B0"}
        transparent
        depthWrite={false}
        fog={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
};

export const Stars: React.FC<{ cam: THREE.Vector3; o: number }> = ({ cam, o }) => {
  const geo = useMemo(() => {
    const n = 2600;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = random(`su${i}`) * 2 - 1;
      const th = random(`st${i}`) * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      a.set([r * Math.cos(th), u, r * Math.sin(th)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    return g;
  }, []);
  if (o <= 0.01) return null;
  return (
    <points geometry={geo} position={cam} scale={8.5e6} renderOrder={-9} frustumCulled={false}>
      <pointsMaterial
        color="#FFFFFF"
        size={2.2}
        sizeAttenuation={false}
        transparent
        opacity={o}
        depthWrite={false}
        fog={false}
      />
    </points>
  );
};

/* ------------------------------------------------------------------ */
/* Clouds                                                               */
/* ------------------------------------------------------------------ */

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, y: number, period: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const w = (a: number) => ((a % period) + period) % period;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(w(xi), w(yi));
  const b = hash(w(xi + 1), w(yi));
  const c = hash(w(xi), w(yi + 1));
  const d = hash(w(xi + 1), w(yi + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const cloudTexCache: Record<string, THREE.Texture> = {};
/** Tileable fbm cloud cover (alpha). */
export const cloudTex = (seed: number, cover: number) => {
  const key = `${seed}${cover}`;
  if (cloudTexCache[key]) return cloudTexCache[key];
  const N = 512;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let f = 0;
      let amp = 0.5;
      let fr = 4;
      for (let o = 0; o < 5; o++) {
        f += amp * vnoise((x / N) * fr + seed * 17, (y / N) * fr + seed * 31, fr);
        amp *= 0.5;
        fr *= 2;
      }
      const a = Math.min(1, Math.max(0, (f - (1 - cover)) * 3.2));
      const shade = 225 + 30 * Math.min(1, f);
      const i = (y * N + x) * 4;
      img.data[i] = shade;
      img.data[i + 1] = shade;
      img.data[i + 2] = Math.min(255, shade + 6);
      img.data[i + 3] = a * 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cloudTexCache[key] = t;
  return t;
};

let puffTex: THREE.Texture | null = null;
const puff = () => {
  if (puffTex) return puffTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  for (let k = 0; k < 18; k++) {
    const x = 128 + (random(`pf${k}x`) - 0.5) * 110;
    const y = 128 + (random(`pf${k}y`) - 0.5) * 70;
    const r = 40 + random(`pf${k}r`) * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
};

export const CLOUD_BASE = 1450;
export const CLOUD_TOP = 1850;
const PUFFS = Array.from({ length: 150 }).map((_, i) => {
  const r = (k: string) => random(`cp${i}${k}`);
  const near = i < 40;
  const rad = near ? r("r") * 380 : 300 + r("r") * 3500;
  const a = r("a") * Math.PI * 2;
  return {
    x: -8 + Math.cos(a) * rad,
    z: -14 + Math.sin(a) * rad,
    y: CLOUD_BASE + r("y") * (CLOUD_TOP - CLOUD_BASE),
    s: 260 + r("s") * 420,
  };
});

/** Round cloud deck with vertex alpha: soft rim, no hard plane edge, fades as you climb far above it. */
const deckGeo = (() => {
  let cache: THREE.BufferGeometry | null = null;
  return () => {
    if (cache) return cache;
    const SEG = 128;
    const RINGS = 40;
    const R = 32000;
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k <= RINGS; k++) {
      const r = R * Math.pow(k / RINGS, 1.6);
      const a0 = 1 - Math.min(1, Math.max(0, (r - R * 0.45) / (R * 0.55)));
      for (let s2 = 0; s2 < SEG; s2++) {
        const a = (s2 / SEG) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pos.push(x, 0, z);
        col.push(1, 1, 1, a0 * a0 * (3 - 2 * a0));
        uv.push(x / 4200, z / 4200);
      }
    }
    for (let k = 0; k < RINGS; k++)
      for (let s2 = 0; s2 < SEG; s2++) {
        const a = k * SEG + s2;
        const b = k * SEG + ((s2 + 1) % SEG);
        const c = (k + 1) * SEG + s2;
        const d = (k + 1) * SEG + ((s2 + 1) % SEG);
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    cache = g;
    return g;
  };
})();

export const Clouds: React.FC<{ cam: THREE.Vector3; sunlit: THREE.Color }> = ({ cam, sunlit }) => {
  const near = Math.abs(cam.y - (CLOUD_BASE + CLOUD_TOP) / 2) < 3000;
  const deckO = 1 - Math.min(1, Math.max(0, (cam.y - 7000) / 18000));
  if (deckO <= 0.01) return null;
  return (
    <group>
      {[
        { y: CLOUD_BASE + 60, seed: 1, cover: 0.6, rot: 0 },
        { y: CLOUD_TOP - 80, seed: 2, cover: 0.48, rot: 0.7 },
      ].map((l) => {
        // a deck is infinitely thin, so passing through it would flip it from above to below in one frame:
        // it thins out within ~200 m of the camera, where the whiteout takes over
        const k = Math.min(1, Math.max(0, (Math.abs(cam.y - l.y) - 20) / 180));
        const o = deckO * k * k * (3 - 2 * k);
        if (o <= 0.005) return null;
        const tex = cloudTex(l.seed, l.cover);
        tex.repeat.set(1, 1);
        return (
          <mesh
            key={l.seed}
            geometry={deckGeo()}
            position={[-8, l.y, -14]}
            rotation={[0, l.rot, 0]}
            renderOrder={2}
          >
            <meshBasicMaterial
              map={tex}
              color={sunlit}
              vertexColors
              transparent
              opacity={o}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
      {near
        ? PUFFS.map((p, i) => {
            const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
            // fade puffs that the camera is about to pass through, so nothing pops at the near plane
            const o = Math.min(1, Math.max(0, (d - p.s * 0.25) / (p.s * 0.5)));
            if (o <= 0.01) return null;
            return (
              <sprite key={i} position={[p.x, p.y, p.z]} scale={[p.s, p.s * 0.62, 1]} renderOrder={3}>
                <spriteMaterial
                  map={puff()}
                  color={sunlit}
                  transparent
                  opacity={o * 0.95}
                  depthWrite={false}
                />
              </sprite>
            );
          })
        : null}
    </group>
  );
};
