import React, { useMemo } from "react";
import * as THREE from "three";
import { MARK, NFRAMES, TR, frameAt, sAt, vAt } from "./track";
import { BEAT, FPS, PHOTO_MAST, smooth } from "./world";

/**
 * The splashdown and the on-ride camera.
 *
 * Splash: the train's scoops plough the trough, throwing two walls of water out to either side. Every
 * half metre of trough is struck when the front row passes it; from then its water flies on ballistic
 * paths (out, up, and on with the train a little), so the walls rise beside you and fall behind. Sheets
 * for the bulk, droplets for the spray, foam on the water where it's been.
 *
 * The camera: a mast beside the pull-out with a camera box and its flash, which fires as you pass.
 */

const G = 9.81;
const WATER_Y = -0.12;
const SPLASH = { s0: MARK.splash0 - 0.5, s1: MARK.splash1 + 1.0, step: 0.5 };

/** For each half metre of trough: when the front row reached it (video seconds) and how fast it was going. */
const hits = (() => {
  const S = TR.frames.s;
  const out: { t: number; v: number }[] = [];
  for (let s = SPLASH.s0; s <= SPLASH.s1; s += SPLASH.step) {
    let f = 0;
    while (f < NFRAMES - 1 && S[f + 1] < s) f++;
    const k = S[f + 1] > S[f] ? (s - S[f]) / (S[f + 1] - S[f]) : 0;
    const fr = f + Math.min(1, Math.max(0, k));
    out.push({ t: fr / FPS, v: vAt(fr) });
  }
  return out;
})();
const SLICES = hits.length;

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * One blob of spray: thrown from the scoop under the front of the train when it ploughs into the trough,
 * then slowed by the air (horizontally and vertically, e^-kt) and pulled down. Kinds:
 *  - wing: the two walls, out and up beside the train, keeping up with it for a moment, then left behind;
 *  - bow: a burst thrown on ahead of the train, which drives through it;
 *  - rain: straight up over the front rows, coming down on them.
 */
type Blob = {
  slice: number;
  side: number;
  kind: 0 | 1 | 2;
  delay: number;
  off: number;
  kf: number;
  lat: number;
  up: number;
  k: number;
  s0: number;
  s1: number;
  life: number;
  alpha: number;
  rot: number;
  spin: number;
  tile: number;
};

const BLOBS: Blob[] = (() => {
  const out: Blob[] = [];
  let n = 0;
  const h = () => hash(++n * 1.37);
  for (let i = 0; i < SLICES; i++) {
    // hardest where the train hits the water, easing off as it slows
    const str = 0.45 + 0.75 * Math.exp(-i / (0.3 * SLICES));
    const entry = Math.exp(-i / (0.12 * SLICES));
    for (const side of [-1, 1]) {
      for (let q = 0; q < 16; q++)
        out.push({
          slice: i, side, kind: 0, delay: 0.05 * h(), off: 0.55 + 0.5 * h(),
          kf: 0.92 + 0.09 * h(), lat: (3.5 + 6 * h()) * str, up: (7.5 + 8 * h()) * str, k: 0.55 + 0.6 * h(),
          s0: 0.45 + 0.4 * h(), s1: 1.8 + 1.6 * h(), life: 1.4 + 0.8 * h(), alpha: 0.45 + 0.3 * h(),
          rot: h() * 6.28, spin: (h() - 0.5) * 2, tile: Math.floor(h() * 4),
        });
      for (let q = 0; q < 5; q++)
        out.push({
          slice: i, side, kind: 2, delay: 0.04 * h(), off: 0.3 + 0.5 * h(),
          kf: 0.97 + 0.03 * h(), lat: 0.2 + 1.0 * h(), up: (9 + 4 * h()) * str, k: 0.45 + 0.2 * h(),
          s0: 0.14 + 0.08 * h(), s1: 0.35 + 0.25 * h(), life: 2.2 + 0.5 * h(), alpha: 0.75,
          rot: h() * 6.28, spin: (h() - 0.5) * 3, tile: Math.floor(h() * 4),
        });
    }
    for (let q = 0; q < Math.round(10 * entry); q++)
      out.push({
        slice: i, side: h() < 0.5 ? -1 : 1, kind: 1, delay: 0.03 * h(), off: 0.2 + 0.6 * h(),
        kf: 1.05 + 0.12 * h(), lat: 0.5 + 2.5 * h(), up: 3 + 5 * h(), k: 1.4 + 0.8 * h(),
        s0: 0.4 + 0.3 * h(), s1: 1.5 + 0.9 * h(), life: 0.9 + 0.3 * h(), alpha: 0.7,
        rot: h() * 6.28, spin: (h() - 0.5) * 2, tile: Math.floor(h() * 4),
      });
  }
  return out;
})();

/** Where a blob is at age a (or null once it's back in the lake). */
const blobAt = (b: Blob, a: number, out: THREE.Vector3) => {
  const f = frameAt(SPLASH.s0 + b.slice * SPLASH.step);
  const v = hits[b.slice].v;
  // the scoop: a metre ahead of the front row, down at the water
  const P0 = f.P.clone().addScaledVector(f.T, 0.9).addScaledVector(f.R, b.side * b.off);
  P0.y = Math.max(WATER_Y + 0.05, f.P.y - 1.25);
  const e = 1 - Math.exp(-b.k * a);
  const fwd = (b.kf * v * e) / b.k;
  const lat = (b.lat * e) / b.k;
  const y = ((b.up + G / b.k) * e) / b.k - (G / b.k) * a;
  out.copy(P0).addScaledVector(f.T, fwd).addScaledVector(f.R, b.side * lat);
  out.y += y;
  return out.y > WATER_Y || a < 0.1 ? out : null;
};

/** A sheet of soft foam puffs (four to a texture), drawn once. */
const puffTexture = (() => {
  let tex: THREE.Texture | null = null;
  return () => {
    if (tex) return tex;
    const N = 256;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d")!;
    let n = 7;
    const r = () => hash(++n * 2.31);
    for (let t = 0; t < 4; t++) {
      const ox = (t % 2) * 128;
      const oy = Math.floor(t / 2) * 128;
      // a soft body, then lots of small foam bubbles and droplets, denser at the middle
      for (let k = 0; k < 10; k++) {
        const a = r() * 6.28;
        const d = Math.pow(r(), 0.8) * 26;
        const x = ox + 64 + Math.cos(a) * d;
        const y = oy + 64 + Math.sin(a) * d;
        const rad = 14 + r() * 20;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(235,240,242,${0.3 + 0.2 * r()})`);
        grd.addColorStop(1, "rgba(235,240,242,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
      for (let k = 0; k < 140; k++) {
        const a = r() * 6.28;
        const d = Math.pow(r(), 0.6) * 52;
        const x = ox + 64 + Math.cos(a) * d;
        const y = oy + 64 + Math.sin(a) * d;
        const rad = 1.5 + r() * 6 * (1 - d / 60);
        const w = 225 + Math.round(r() * 30);
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(${w},${w},${w},${0.55 + 0.4 * r()})`);
        grd.addColorStop(0.6, `rgba(${w},${w},${w},${0.3 + 0.2 * r()})`);
        grd.addColorStop(1, `rgba(${w},${w},${w},0)`);
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

const SPRITE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 iPos;
attribute vec2 iSA;
attribute float iRot;
attribute float iTile;
varying vec2 vUv;
varying float vA;
void main() {
  float c = cos(iRot);
  float s = sin(iRot);
  vec2 q = mat2(c, s, -s, c) * position.xy;
  vUv = (uv + vec2(mod(iTile, 2.0), floor(iTile / 2.0))) * 0.5;
  vA = iSA.y;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += q * iSA.x;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const SPRITE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex;
uniform vec3 uCol;
varying vec2 vUv;
varying float vA;
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(uTex, vUv);
  float a = t.a * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uCol * (0.7 + 0.3 * t.r), a);
}`;

export const Splash: React.FC<{ t: number }> = ({ t }) => {
  const sprites = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("uv", base.attributes.uv);
    const n = BLOBS.length;
    g.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("iSA", new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute("iRot", new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    g.setAttribute("iTile", new THREE.InstancedBufferAttribute(new Float32Array(BLOBS.map((b) => b.tile)), 1));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: puffTexture() }, uCol: { value: new THREE.Color(1.22, 1.27, 1.3) } },
      vertexShader: SPRITE_VERT,
      fragmentShader: SPRITE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    return { g, m };
  }, []);
  const drops = useMemo(() => {
    const per = 70;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SLICES * 2 * per * 3), 3));
    return { g, per };
  }, []);
  const foam = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SLICES * 2 * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(SLICES * 2 * 4), 4));
    const idx: number[] = [];
    for (let i = 0; i < SLICES - 1; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    g.setIndex(idx);
    return g;
  }, []);
  const mats = useMemo(
    () => ({
      drop: new THREE.PointsMaterial({ color: "#F6FBFF", size: 0.08, transparent: true, opacity: 0.95, depthWrite: false }),
      foam: new THREE.MeshStandardMaterial({ color: "#F4F8F8", roughness: 0.6, transparent: true, vertexColors: true, depthWrite: false }),
    }),
    [],
  );
  if (t < hits[0].t - 0.1 || t > hits[SLICES - 1].t + 7) return null;
  const p = new THREE.Vector3();
  // the spray
  const ip = sprites.g.attributes.iPos as THREE.InstancedBufferAttribute;
  const isa = sprites.g.attributes.iSA as THREE.InstancedBufferAttribute;
  const irot = sprites.g.attributes.iRot as THREE.InstancedBufferAttribute;
  BLOBS.forEach((b, i) => {
    const a = t - hits[b.slice].t - b.delay;
    const at = a > 0 && a < b.life ? blobAt(b, a, p) : null;
    if (!at) {
      isa.setXY(i, 0, 0);
      return;
    }
    ip.setXYZ(i, p.x, p.y, p.z);
    const size = b.s0 + (b.s1 - b.s0) * (1 - Math.exp(-2.4 * a));
    const al = b.alpha * smooth(0, 0.06, a) * (1 - smooth(b.life * 0.5, b.life, a)) * smooth(WATER_Y, WATER_Y + 0.4, p.y);
    isa.setXY(i, size, al);
    irot.setX(i, b.rot + b.spin * a);
  });
  ip.needsUpdate = true;
  isa.needsUpdate = true;
  irot.needsUpdate = true;
  // droplets: launched like the walls, faster and more scattered
  const dpos = drops.g.attributes.position as THREE.BufferAttribute;
  let di = 0;
  for (let i = 0; i < SLICES; i++) {
    const str = 0.45 + 0.75 * Math.exp(-i / (0.3 * SLICES));
    for (const side of [-1, 1]) {
      for (let q = 0; q < drops.per; q++) {
        const h1 = hash(i * 97 + side * 31 + q);
        const h2 = hash(i * 13 + side * 7 + q * 3.1);
        const h3 = hash(i * 5 + q * 11.7 + side);
        const b: Blob = {
          slice: i, side, kind: 0, delay: 0.06 * h3, off: 0.5 + 0.6 * h2,
          kf: 0.9 + 0.12 * h1, lat: (1 + 10 * h2) * str, up: (5 + 12 * h3) * str, k: 0.4 + 0.6 * h1,
          s0: 0, s1: 0, life: 2.6, alpha: 1, rot: 0, spin: 0, tile: 0,
        };
        const a = t - hits[i].t - b.delay;
        const at = a > 0 && a < b.life ? blobAt(b, a, p) : null;
        if (at) dpos.setXYZ(di++, p.x, p.y, p.z);
        else dpos.setXYZ(di++, 0, -100, 0);
      }
    }
  }
  dpos.needsUpdate = true;
  // foam on the water either side of the trough
  const fpos = foam.attributes.position as THREE.BufferAttribute;
  const fcol = foam.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < SLICES; i++) {
    const f = frameAt(SPLASH.s0 + i * SPLASH.step);
    const age = t - hits[i].t;
    const edge = smooth(0, 3, i) * smooth(SLICES - 1, SLICES - 4, i);
    for (const side of [0, 1]) {
      const sd = side ? 1 : -1;
      const fp = f.P.clone().addScaledVector(f.R, sd * (2.2 + 1.5 * smooth(0, 3, age)));
      fpos.setXYZ(i * 2 + side, fp.x, WATER_Y + 0.02, fp.z);
      fcol.setXYZW(i * 2 + side, 1, 1, 1, age < 0 ? 0 : edge * 0.75 * (1 - smooth(1.5, 7, age)));
    }
  }
  fpos.needsUpdate = true;
  fcol.needsUpdate = true;
  foam.computeVertexNormals();
  return (
    <>
      <mesh geometry={sprites.g} material={sprites.m} frustumCulled={false} renderOrder={6} />
      <points geometry={drops.g} material={mats.drop} frustumCulled={false} renderOrder={7} />
      <mesh geometry={foam} material={mats.foam} frustumCulled={false} renderOrder={4} />
    </>
  );
};

/** The on-ride camera on its mast; its flash fires as the front row comes past. */
export const PhotoMast: React.FC<{ t: number }> = ({ t }) => {
  const m = PHOTO_MAST;
  const fire = Math.exp(-Math.max(0, t - BEAT.photo) / 0.05) * smooth(BEAT.photo - 0.034, BEAT.photo, t);
  const dir = useMemo(() => {
    const f = frameAt(sAt(Math.round(BEAT.photo * FPS)));
    return f.P.clone().sub(m).setY(0).normalize();
  }, [m]);
  const yaw = Math.atan2(dir.x, dir.z);
  return (
    <group>
      <mesh position={[m.x, m.y / 2 - 0.3, m.z]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, m.y - 0.6, 10]} />
        <meshStandardMaterial color="#3A3D42" roughness={0.5} metalness={0.5} />
      </mesh>
      <group position={m} rotation={[0, yaw, 0]}>
        <mesh position={[0, 0, -0.05]} castShadow>
          <boxGeometry args={[0.36, 0.3, 0.5]} />
          <meshStandardMaterial color="#2C2F35" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.0, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
          <meshStandardMaterial color="#111" roughness={0.2} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.28, 0.1]}>
          <boxGeometry args={[0.5, 0.18, 0.12]} />
          <meshStandardMaterial color="#DDD" emissive="#ffffff" emissiveIntensity={fire * 40} />
        </mesh>
      </group>
      {fire > 0.01 ? <pointLight position={m.clone().add(new THREE.Vector3(0, 0.3, 0))} intensity={25 * fire} distance={18} decay={1.4} color="#FFFFFF" /> : null}
    </group>
  );
};
