import React, { useMemo } from "react";
import * as THREE from "three";
import type { PState, Spec } from "../pov/crowd";
import { Human, lookFor, type Direction } from "../pov/Human";
import { HR, HX, HZ } from "./timeline";
import { clipOutsideShaft, glowMat, rng, std } from "./mats";

/**
 * The far side: a small island at night (most of the land on Earth has ocean at its antipode). A beach, the
 * shaft's other end in a concrete ring, palms, a bonfire with four people round it who did not expect
 * anyone to come out of the hole, the sea with the moon on it, and a sky full of stars and the Milky Way.
 */

export const MOON_DIR = new THREE.Vector3(-0.885, 0.407, 0.237).normalize();
const SEA_Y = -1.25;

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Where the water's edge is (world x) at z: the ocean is to the west (-x). */
const shoreX = (z: number) => HX - 21 + 2.6 * Math.sin(z / 13) + 1.2 * Math.sin(z / 5.3 + 1);
/** Ground height: flat round the hole, sloping to the sea, dunes inland. */
export const groundY = (x: number, z: number) => {
  const d = x - shoreX(z);
  let h = -1.55 + 1.5 * smooth(-6, 16, d) + 2.6 * smooth(18, 60, d) * (0.6 + 0.4 * Math.sin(z / 9 + x / 14));
  h += 0.12 * Math.sin(x * 0.7 + z * 0.4) * smooth(2, 10, d) + 0.08 * Math.sin(z * 1.3 - x * 0.5);
  if (d < -2) h = -1.55 - (-2 - d) * 0.08;
  const r = Math.hypot(x - HX, z - HZ);
  return h * smooth(5.6, 11, r);
};

/* ------------------------------------------------------------------ */
/* Sky                                                                  */
/* ------------------------------------------------------------------ */

const SKY_FRAG = /* glsl */ `
uniform vec3 uMoon;
varying vec3 vDir;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 d = normalize(vDir);
  float e = max(d.y, 0.0);
  vec3 zen = vec3(0.006, 0.011, 0.03);
  vec3 hor = vec3(0.035, 0.06, 0.11);
  vec3 col = mix(hor, zen, pow(e, 0.45));
  // moonlight scattering round the moon and along the horizon under it
  float m = max(dot(d, uMoon), 0.0);
  col += vec3(0.25, 0.32, 0.45) * (pow(m, 8.0) * 0.18 + pow(m, 60.0) * 0.35);
  // the Milky Way: a dusty band across the sky
  vec3 nmw = normalize(vec3(0.35, 0.3, -0.89));
  float b = dot(d, nmw);
  float band = exp(-b * b / 0.018);
  float dust = n3(d * 6.0) * 0.55 + n3(d * 13.0) * 0.3 + n3(d * 29.0) * 0.15;
  float lane = smoothstep(0.55, 0.72, n3(d * 9.0 + 3.0)) * exp(-b * b / 0.003);
  col += vec3(0.11, 0.105, 0.13) * band * smoothstep(0.25, 0.85, dust) * (1.0 - 0.75 * lane) * smoothstep(-0.05, 0.25, d.y);
  // below the horizon: the sea takes over, keep it dark
  col *= smoothstep(-0.2, 0.0, d.y) * 0.85 + 0.15;
  gl_FragColor = vec4(col, 1.0);
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aBright;
attribute vec3 aCol;
uniform float uTime;
varying vec3 vCol;
void main() {
  float tw = 0.75 + 0.25 * sin(uTime * (2.0 + aBright * 5.0) + aBright * 91.0);
  vCol = aCol * aBright * tw;
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w * 0.99998;
}
`;
const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(p));
  gl_FragColor = vec4(vCol * a, a);
}
`;

export const NightSky: React.FC<{ cam: THREE.Vector3; t: number }> = ({ cam, t }) => {
  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uMoon: { value: MOON_DIR } },
      }),
    [],
  );
  const stars = useMemo(() => {
    const R = rng(1234);
    const n = 3400;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const bright = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const nmw = new THREE.Vector3(0.35, 0.3, -0.89).normalize();
    let k = 0;
    while (k < n) {
      const u = R() * 2 - 1;
      const th = R() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = new THREE.Vector3(r * Math.cos(th), u, r * Math.sin(th));
      // more stars in the band
      if (R() > 0.35 + 0.65 * Math.exp(-(v.dot(nmw) ** 2) / 0.03)) continue;
      pos.set([v.x, v.y, v.z], k * 3);
      const m = Math.pow(R(), 3);
      size[k] = 1.6 + m * 3.4;
      bright[k] = 0.35 + m * 2.4;
      const c = new THREE.Color().setHSL(R() < 0.5 ? 0.6 : 0.08, 0.35 * R(), 0.85);
      col.set([c.r, c.g, c.b], k * 3);
      k++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
    g.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: { value: 0 } },
    });
    return { g, m };
  }, []);
  stars.m.uniforms.uTime.value = t;
  const moonTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,255,250,1)");
    grd.addColorStop(0.16, "rgba(250,248,240,1)");
    grd.addColorStop(0.19, "rgba(200,215,240,0.45)");
    grd.addColorStop(0.4, "rgba(150,175,220,0.12)");
    grd.addColorStop(1, "rgba(120,150,210,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    // maria
    const R = rng(55);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = "rgba(150,150,160,0.35)";
      g.beginPath();
      g.arc(128 + (R() - 0.5) * 30, 128 + (R() - 0.5) * 30, 3 + R() * 8, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const moonP = cam.clone().addScaledVector(MOON_DIR, 8e6);
  return (
    <>
      <mesh position={cam} scale={9e6} material={sky} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[1, 64, 32]} />
      </mesh>
      <points geometry={stars.g} material={stars.m} position={cam} scale={8.6e6} renderOrder={-9} frustumCulled={false} />
      <sprite position={moonP} scale={[1.1e6, 1.1e6, 1]} renderOrder={-8} frustumCulled={false}>
        <spriteMaterial map={moonTex} color={new THREE.Color(2.2, 2.2, 2.1)} transparent depthWrite={false} fog={false} />
      </sprite>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Sea                                                                  */
/* ------------------------------------------------------------------ */

const SEA_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;
const SEA_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uMoon;
uniform vec3 uCam;
uniform float uTime;
varying vec3 vW;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float waves(vec2 p) {
  return n2(p * 0.35 + vec2(uTime * 0.12, uTime * 0.05)) * 0.5 + n2(p * 0.9 - vec2(uTime * 0.2, -uTime * 0.11)) * 0.3
    + n2(p * 2.3 + vec2(uTime * 0.35, uTime * 0.27)) * 0.2;
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vW.xz;
  float e = 0.15;
  vec3 n = normalize(vec3(-(waves(p + vec2(e, 0.0)) - waves(p - vec2(e, 0.0))) / (2.0 * e) * 0.9, 1.0,
    -(waves(p + vec2(0.0, e)) - waves(p - vec2(0.0, e))) / (2.0 * e) * 0.9));
  vec3 v = normalize(uCam - vW);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 col = vec3(0.004, 0.012, 0.024) + vec3(0.03, 0.05, 0.09) * fres;
  vec3 r = reflect(-v, n);
  // the moon's path: sharp glints on the wave facets, a soft sheen under them
  float rm = max(dot(r, uMoon), 0.0);
  float glit = pow(rm, 900.0);
  col += vec3(0.9, 0.95, 1.0) * glit * 2.6;
  col += vec3(0.07, 0.09, 0.13) * pow(rm, 40.0) * 0.5;
  float dist = length(vW.xz - uCam.xz);
  col = mix(col, vec3(0.03, 0.05, 0.09), smoothstep(800.0, 4000.0, dist));
  gl_FragColor = vec4(col, 1.0);
}
`;

const Sea: React.FC<{ cam: THREE.Vector3; t: number }> = ({ cam, t }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SEA_VERT,
        fragmentShader: SEA_FRAG,
        uniforms: { uMoon: { value: MOON_DIR }, uCam: { value: new THREE.Vector3() }, uTime: { value: 0 } },
      }),
    [],
  );
  (mat.uniforms.uCam.value as THREE.Vector3).copy(cam);
  mat.uniforms.uTime.value = t;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HX - 2000, SEA_Y, HZ]} material={mat}>
      <planeGeometry args={[4000, 8000, 1, 1]} />
    </mesh>
  );
};

/** White surf running up the beach and sliding back. */
const Surf: React.FC<{ t: number }> = ({ t }) => {
  const lines = useMemo(() => {
    return [0, 1, 2].map((k) => {
      const pts: THREE.Vector3[] = [];
      for (let z = -80; z <= 90; z += 2) pts.push(new THREE.Vector3(shoreX(z), 0, z));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.09 + k * 0.03, 4, false);
    });
  }, []);
  return (
    <group>
      {lines.map((g, k) => {
        const ph = ((t * 0.16 + k / 3) % 1) * Math.PI * 2;
        const run = Math.sin(ph);
        return (
          <mesh
            key={k}
            geometry={g}
            position={[-2.5 - k * 2.2 + run * 1.4, SEA_Y + 0.03, 0]}
            scale={[1, 0.2, 1]}
            material={glowMat("#A9C4E8", 0.35 + 0.25 * Math.max(0, Math.cos(ph)))}
          />
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Beach                                                                */
/* ------------------------------------------------------------------ */

const Beach: React.FC = () => {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.PlaneGeometry(260, 260, 220, 220);
    g.rotateX(-Math.PI / 2);
    g.translate(HX + 30, 0, HZ);
    const p = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const R = rng(808);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = groundY(x, z);
      p.setY(i, y);
      const d = x - shoreX(z);
      const dry = new THREE.Color("#CDBB95");
      const wet = new THREE.Color("#6E6352");
      const grass = new THREE.Color("#3E4A2C");
      const c = wet.clone().lerp(dry, smooth(-1, 4, d)).lerp(grass, smooth(26, 40, d) * 0.85);
      c.offsetHSL(0, 0, (R() - 0.5) * 0.03);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = clipOutsideShaft(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    return { geo: g, mat: m };
  }, []);
  return <mesh geometry={geo} material={mat} receiveShadow />;
};

/* ------------------------------------------------------------------ */
/* Palms                                                                */
/* ------------------------------------------------------------------ */

let frondTex: THREE.Texture | null = null;
const frond = () => {
  if (frondTex) return frondTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 64, 512);
  g.strokeStyle = "#5C7A35";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(32, 0);
  g.lineTo(32, 512);
  g.stroke();
  for (let y = 16; y < 500; y += 9) {
    const L = 30 * Math.sin((y / 512) * Math.PI) + 4;
    g.strokeStyle = y % 2 ? "#4F6E2C" : "#62833A";
    g.lineWidth = 3.2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(32, y);
      g.lineTo(32 + s * L, y + 14);
      g.stroke();
    }
  }
  frondTex = new THREE.CanvasTexture(c);
  frondTex.colorSpace = THREE.SRGBColorSpace;
  return frondTex;
};

type Palm = { x: number; z: number; h: number; lean: number; dir: number; seed: number };
const PALMS: Palm[] = [
  { x: HX - 6.5, z: HZ - 6.2, h: 8.5, lean: 0.42, dir: -2.0, seed: 1 },
  { x: HX - 11, z: HZ + 9.5, h: 9.5, lean: 0.35, dir: -1.2, seed: 2 },
  { x: HX - 4.2, z: HZ + 10.8, h: 7.2, lean: 0.3, dir: -0.9, seed: 3 },
  { x: HX - 15, z: HZ - 2.5, h: 10.5, lean: 0.28, dir: -1.7, seed: 4 },
  { x: HX + 6, z: HZ - 9, h: 9.0, lean: 0.25, dir: -2.6, seed: 5 },
  { x: HX + 9.5, z: HZ + 7, h: 8.2, lean: 0.33, dir: -1.5, seed: 6 },
  { x: HX - 13, z: HZ + 21, h: 11, lean: 0.3, dir: -1.4, seed: 7 },
  { x: HX - 9, z: HZ - 16, h: 9.8, lean: 0.36, dir: -1.9, seed: 8 },
  { x: HX + 3, z: HZ + 17, h: 8.8, lean: 0.22, dir: -1.0, seed: 9 },
];

const PalmTree: React.FC<{ p: Palm; t: number; mats: { trunk: THREE.Material; leaf: THREE.Material } }> = ({
  p,
  t,
  mats,
}) => {
  const parts = useMemo(() => {
    const base = new THREE.Vector3(p.x, groundY(p.x, p.z) - 0.1, p.z);
    const dir = new THREE.Vector3(Math.sin(p.dir), 0, Math.cos(p.dir));
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      pts.push(
        base.clone().addScaledVector(dir, p.lean * p.h * u * u).add(new THREE.Vector3(0, p.h * u, 0)),
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs: { pos: THREE.Vector3; q: THREE.Quaternion; r: number; len: number }[] = [];
    for (let k = 0; k < 14; k++) {
      const a = curve.getPoint(k / 14);
      const b = curve.getPoint((k + 1) / 14);
      const d = b.clone().sub(a);
      segs.push({
        pos: a.clone().add(b).multiplyScalar(0.5),
        q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
        r: 0.2 - 0.07 * (k / 14),
        len: d.length() * 1.04,
      });
    }
    const top = curve.getPoint(1);
    const R = rng(p.seed * 77);
    const fronds = Array.from({ length: 11 }).map((_, k) => ({
      az: (k / 11) * Math.PI * 2 + R() * 0.3,
      droop: 0.25 + R() * 0.5,
      len: 3.2 + R() * 1.3,
    }));
    return { segs, top, fronds };
  }, [p]);
  const sway = Math.sin(t * 0.9 + p.seed) * 0.04;
  return (
    <group>
      {parts.segs.map((s, k) => (
        <mesh key={k} position={s.pos} quaternion={s.q} material={mats.trunk}>
          <cylinderGeometry args={[s.r * 0.92, s.r, s.len, 9, 1]} />
        </mesh>
      ))}
      <group position={parts.top}>
        {parts.fronds.map((f, k) => (
          <group key={k} rotation={[0, f.az, 0]}>
            <group rotation={[Math.PI / 2 - 0.25 + f.droop + sway * (k % 2 ? 1 : -1), 0, 0]}>
              <mesh position={[0, f.len / 2, 0]} material={mats.leaf}>
                <planeGeometry args={[0.9, f.len, 1, 6]} />
              </mesh>
            </group>
          </group>
        ))}
        {[0, 2.1, 4.2].map((a) => (
          <mesh key={a} position={[Math.sin(a) * 0.22, -0.25, Math.cos(a) * 0.22]} material={std("#3B2A18")}>
            <sphereGeometry args={[0.13, 10, 8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Bonfire and the people round it                                      */
/* ------------------------------------------------------------------ */

export const FIRE = { x: HX - 5.4, z: HZ + 5.4 };

let flameTex: THREE.Texture | null = null;
const flame = () => {
  if (flameTex) return flameTex;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 200, 4, 64, 170, 110);
  grd.addColorStop(0, "rgba(255,250,220,1)");
  grd.addColorStop(0.25, "rgba(255,190,90,0.9)");
  grd.addColorStop(0.6, "rgba(255,110,30,0.45)");
  grd.addColorStop(1, "rgba(200,40,0,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(64, 10);
  g.bezierCurveTo(110, 110, 118, 200, 64, 250);
  g.bezierCurveTo(10, 200, 18, 110, 64, 10);
  g.fill();
  flameTex = new THREE.CanvasTexture(c);
  flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
};

/** The fire's flicker (0.6..1.15), shared by the flames and the light. */
export const fireFlicker = (t: number) =>
  0.85 + 0.12 * Math.sin(t * 13.1) + 0.08 * Math.sin(t * 23.7 + 1) + 0.06 * Math.sin(t * 7.3 + 2);

type Sitter = { a: number; r: number; h: number; act?: Direction["act"]; sit: boolean; kid?: boolean };
const SITTERS: Sitter[] = [
  { a: 0.6, r: 1.75, h: 1.74, sit: true },
  { a: 2.3, r: 1.8, h: 1.66, sit: true },
  { a: 3.9, r: 2.1, h: 1.8, act: "stare", sit: false },
  { a: 5.0, r: 1.9, h: 1.3, act: "stare", sit: false, kid: true },
];

const FireCircle: React.FC<{ t: number; cam: THREE.Vector3 }> = ({ t, cam }) => {
  const gy = groundY(FIRE.x, FIRE.z);
  const people = useMemo(
    () =>
      SITTERS.map((s, k) => {
        const x = FIRE.x + Math.sin(s.a) * s.r;
        const z = FIRE.z + Math.cos(s.a) * s.r;
        const sp: Spec = {
          i: 401 + k * 5,
          role: s.sit ? "sit" : "photo",
          kid: !!s.kid,
          height: s.h,
          speed: 0,
          jumpEvery: 0,
          v0: 2.5,
          route: [[x, z]],
          start: [x, z],
          face0: Math.atan2(FIRE.x - x, FIRE.z - z),
          liftAt: 1e9,
          seed: 33 + k * 19,
        };
        const st: PState = {
          x,
          y: groundY(x, z) - (s.sit ? 0.12 : 0),
          z,
          vx: 0,
          vy: 0,
          vz: 0,
          heading: sp.face0,
          phase: 0,
          wp: 0,
          air: false,
          free: false,
          freeAt: 1e9,
          tx: 0,
          ty: 0,
          tz: 0,
          sx: 0,
          sy: 0,
          sz: 0,
          landAt: -10,
          impact: 0,
          nextJump: 1e9,
          jumpAt: -10,
          jumpKind: 0,
          speed: 0,
        };
        return { sp, st, look: lookFor(sp), s };
      }),
    [],
  );
  // they see you shoot out of the hole at 64.6 s
  const shock = smooth(64.7, 65.4, t);
  const fl = fireFlicker(t);
  const R = rng(5);
  const embers = Array.from({ length: 26 }).map((_, k) => {
    const life = 1.6 + R() * 1.2;
    const ph = ((t + R() * 10) % life) / life;
    return {
      x: (R() - 0.5) * 0.5 + Math.sin(t * 2 + k) * 0.15 * ph,
      y: 0.3 + ph * (2.2 + R() * 1.5),
      z: (R() - 0.5) * 0.5 + Math.cos(t * 1.7 + k) * 0.15 * ph,
      o: Math.sin(ph * Math.PI),
    };
  });
  return (
    <group>
      <group position={[FIRE.x, gy, FIRE.z]}>
        {/* stones and logs */}
        {Array.from({ length: 9 }).map((_, k) => {
          const a = (k / 9) * Math.PI * 2;
          return (
            <mesh key={k} position={[Math.sin(a) * 0.62, 0.07, Math.cos(a) * 0.62]} material={std("#4A4844", { flatShading: true })}>
              <icosahedronGeometry args={[0.13, 0]} />
            </mesh>
          );
        })}
        {[0, 1.05, 2.1].map((a) => (
          <mesh key={a} position={[0, 0.16, 0]} rotation={[0.35, a, 0]} material={std("#3A2414")}>
            <cylinderGeometry args={[0.07, 0.08, 0.95, 7]} />
          </mesh>
        ))}
        {/* flames */}
        {[0, 1, 2, 3, 4].map((k) => {
          const s = (0.75 + 0.25 * Math.sin(t * (8 + k * 1.7) + k)) * (k === 0 ? 1.25 : 0.85);
          return (
            <sprite
              key={k}
              position={[Math.sin(k * 2.4) * 0.14, 0.55 * s + 0.15, Math.cos(k * 2.4) * 0.14]}
              scale={[0.62 * s, 1.15 * s, 1]}
            >
              <spriteMaterial
                map={flame()}
                color={new THREE.Color(2.6, 1.7, 0.9).multiplyScalar(fl)}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>
          );
        })}
        {embers.map((e, k) => (
          <mesh key={k} position={[e.x, e.y, e.z]} material={glowMat("#FFB050", 4 * e.o)}>
            <sphereGeometry args={[0.018, 5, 4]} />
          </mesh>
        ))}
        {/* sitting logs */}
        {[0.6, 2.3].map((a) => (
          <mesh
            key={a}
            position={[Math.sin(a) * 1.75, 0.2, Math.cos(a) * 1.75]}
            rotation={[0, a + Math.PI / 2, Math.PI / 2]}
            material={std("#4E3523")}
          >
            <cylinderGeometry args={[0.2, 0.22, 1.5, 10]} />
          </mesh>
        ))}
      </group>
      {people.map((p, k) => (
        <Human
          key={k}
          sp={p.sp}
          look={p.look}
          st={p.st}
          t={t}
          cam={cam}
          detail
          dir={{ act: p.s.act, watch: t > 64.5, react: shock, lean: p.s.sit ? -0.08 * shock : 0 }}
        />
      ))}
    </group>
  );
};

/** String lights between two palms by the fire. */
const StringLights: React.FC<{ t: number }> = ({ t }) => {
  const a = new THREE.Vector3(HX - 4.2, groundY(HX - 4.2, HZ + 10.8) + 3.2, HZ + 10.6);
  const b = new THREE.Vector3(HX - 11, groundY(HX - 11, HZ + 9.5) + 3.6, HZ + 9.3);
  const n = 18;
  return (
    <group>
      {Array.from({ length: n }).map((_, k) => {
        const u = k / (n - 1);
        const p = a.clone().lerp(b, u);
        p.y -= Math.sin(u * Math.PI) * 0.7;
        const on = 0.85 + 0.15 * Math.sin(t * 3 + k * 1.3);
        return (
          <mesh key={k} position={p} material={glowMat(k % 3 ? "#FFD27A" : "#FFB0A0", 6 * on)}>
            <sphereGeometry args={[0.05, 8, 6]} />
          </mesh>
        );
      })}
    </group>
  );
};

/** A dinghy pulled up on the sand and a surfboard stuck upright. */
const Props: React.FC = () => {
  const bx = shoreX(HZ - 9) + 3.5;
  const bz = HZ - 9;
  return (
    <group>
      <group position={[bx, groundY(bx, bz) + 0.2, bz]} rotation={[0, 0.5, 0.05]}>
        <mesh scale={[1, 0.45, 0.45]} material={std("#C8432F", { roughness: 0.6 })}>
          <sphereGeometry args={[1.6, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        </mesh>
      </group>
      <mesh
        position={[HX - 2.5, groundY(HX - 2.5, HZ + 9.5) + 0.9, HZ + 9.5]}
        rotation={[0.08, 0.6, 0.12]}
        scale={[0.28, 1.05, 0.04]}
        material={std("#F1E9D2", { roughness: 0.4 })}
      >
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>
    </group>
  );
};

export const Island: React.FC<{ t: number; cam: THREE.Vector3; y: number }> = ({ t, cam, y }) => {
  const mats = useMemo(
    () => ({
      trunk: std("#5A4632", { roughness: 0.95 }),
      leaf: new THREE.MeshStandardMaterial({
        map: frond(),
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.8,
      }),
    }),
    [],
  );
  const fl = fireFlicker(t);
  const gy = groundY(FIRE.x, FIRE.z);
  return (
    <>
      <group position={[0, y, 0]}>
        <directionalLight position={MOON_DIR.clone().multiplyScalar(200)} color="#A9C0EA" intensity={0.55} />
        <hemisphereLight args={["#22355C", "#0C0B09", 0.38]} />
        <pointLight position={[FIRE.x, gy + 0.9, FIRE.z]} color="#FF8A3A" intensity={38 * fl} distance={0} decay={2} />
        <Sea cam={cam} t={t} />
        <Surf t={t} />
        <Beach />
        {/* the concrete ring round the shaft's top, with a few cyan bollards */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HX, 0.012, HZ]} material={std("#8E8B85", { roughness: 0.9 })}>
          <ringGeometry args={[HR, HR + 1.3, 96, 1]} />
        </mesh>
        {[0.4, 1.97, 3.54, 5.11].map((a) => (
          <group key={a} position={[HX + Math.sin(a) * (HR + 1.0), 0, HZ + Math.cos(a) * (HR + 1.0)]}>
            <mesh position={[0, 0.35, 0]} material={std("#2C2F33", { metalness: 0.5 })}>
              <cylinderGeometry args={[0.08, 0.09, 0.7, 10]} />
            </mesh>
            <mesh position={[0, 0.66, 0]} material={glowMat("#5FE0FF", 5)}>
              <cylinderGeometry args={[0.085, 0.085, 0.08, 10]} />
            </mesh>
          </group>
        ))}
        {PALMS.map((p, k) => (
          <PalmTree key={k} p={p} t={t} mats={mats} />
        ))}
        <StringLights t={t} />
        <Props />
        <FireCircle t={t} cam={cam} />
      </group>
    </>
  );
};
