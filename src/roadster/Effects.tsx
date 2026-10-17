import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { THRUSTERS, carMatrixAt, thrusterAt, carAt } from "./path";
import { hash, vnoise } from "./timeline";

/**
 * The cold gas: each thruster, while it fires, throws out puffs in world time (so the plumes stay where
 * they were blown as the car moves on: the corkscrews of white round a flip). A puff shoots out along the
 * nozzle fast, stalls in a fraction of a second, swells and drifts and fades; one that hits the ground
 * spreads out along it and billows up (the cloud the car lands in). Lit roughly by the site's lights (the
 * floods' warm white, the ramp's blue, the lineup's red, the follow spot) and drawn back to front.
 * Plus the haze: big slow sprites hanging low over the pad.
 */

const MAX = 9000;
const EMIT_HZ = 150;
const LIFE = 3.2;
const JET = 46; // m/s out of the nozzle
const TAU = 0.09; // the jet's stall time

const vert = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iData; // size, opacity, seed, brightness
  attribute vec3 iTint;
  varying vec2 vUv;
  varying float vOp;
  varying float vSeed;
  varying vec3 vTint;
  void main() {
    vUv = uv;
    vOp = iData.y;
    vSeed = iData.z;
    vTint = iTint * iData.w;
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    // a billboard, turned a little per puff
    float a = iData.z * 6.2831;
    vec2 c = position.xy;
    c = mat2(cos(a), sin(a), -sin(a), cos(a)) * c;
    mv.xy += c * iData.x;
    gl_Position = projectionMatrix * mv;
  }`;

const frag = /* glsl */ `
  uniform sampler2D tNoise;
  varying vec2 vUv;
  varying float vOp;
  varying float vSeed;
  varying vec3 vTint;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float n = texture2D(tNoise, vUv * 0.9 + vec2(vSeed * 3.7, vSeed * 1.9)).r;
    float n2 = texture2D(tNoise, vUv * 2.1 + vec2(vSeed * 5.3, vSeed * 2.3)).r;
    float shape = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.55 + (n2 - 0.5) * 0.25);
    float a = shape * vOp;
    if (a < 0.003) discard;
    // a little self-shadow: denser middles are a touch darker
    vec3 c = vTint * (0.82 + 0.25 * n);
    gl_FragColor = vec4(c * a, a);
  }`;

const noiseTex = () => {
  const s = 128;
  const data = new Uint8Array(s * s * 4);
  // tileable value noise, a few octaves
  const lat = (x: number, y: number, p: number) => hash(((x % p) + p) % p * 57.1 + (((y % p) + p) % p) * 113.7 + p);
  const v = (x: number, y: number, p: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const w = fy * fy * (3 - 2 * fy);
    const a = lat(xi, yi, p);
    const b = lat(xi + 1, yi, p);
    const c = lat(xi, yi + 1, p);
    const d = lat(xi + 1, yi + 1, p);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      let n = 0;
      let amp = 0.5;
      for (let o = 0; o < 4; o++) {
        const p = 4 << o;
        n += v((x / s) * p, (y / s) * p, p) * amp;
        amp *= 0.5;
      }
      const i = (y * s + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(n * 255);
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
};

type Light = { at: THREE.Vector3; color: THREE.Color; k: number; r: number };
/** The site's lights, crudely, for lighting the puffs. */
export const PUFF_LIGHTS: Light[] = [
  { at: new THREE.Vector3(-14, 0.5, -45), color: new THREE.Color("#FF3020"), k: 0.9, r: 9 },
  { at: new THREE.Vector3(0, 6, -70), color: new THREE.Color("#4A70FF"), k: 0.8, r: 16 },
  { at: new THREE.Vector3(-20, 8, -20), color: new THREE.Color("#FFE9D0"), k: 0.35, r: 60 },
  { at: new THREE.Vector3(-20, 8, -90), color: new THREE.Color("#FFE9D0"), k: 0.35, r: 60 },
];

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** One puff's world position at age a (and whether it's reached the ground), from its birth. */
const puffAt = (p0: THREE.Vector3, v0: THREE.Vector3, carV: THREE.Vector3, a: number, seed: number, out: THREE.Vector3) => {
  // the jet: fast, stalling (exponential), plus the car's own velocity carried along (also slowing)
  const jet = TAU * (1 - Math.exp(-a / TAU));
  const carry = 0.35 * (1 - Math.exp(-a / 0.35));
  out.copy(p0).addScaledVector(v0, jet).addScaledVector(carV, carry);
  // drift: turbulence and a slow rise as it warms
  out.x += vnoise(a * 1.3 + seed * 17, 1) * 0.5 * a;
  out.z += vnoise(a * 1.1 + seed * 23, 2) * 0.5 * a;
  out.y += vnoise(a * 1.2 + seed * 31, 3) * 0.2 * a + 0.12 * a;
  let ground = 0;
  if (out.y < 0.15) {
    // it hit the ground: spread out along it from where it hit, billowing up
    const over = 0.15 - out.y;
    const dx = out.x - p0.x;
    const dz = out.z - p0.z;
    const len = Math.hypot(dx, dz) + 1e-3;
    const ang = seed * 6.2831;
    const rx = (dx / len) * 0.4 + Math.cos(ang);
    const rz = (dz / len) * 0.4 + Math.sin(ang);
    const rl = Math.hypot(rx, rz);
    out.x += (rx / rl) * over * 1.4;
    out.z += (rz / rl) * over * 1.4;
    out.y = 0.15 + Math.min(2.4, over * 0.45 + 0.7 * a);
    ground = 1;
  }
  return ground;
};

export const ThrusterGas: React.FC<{ w: number; from?: number }> = ({ w, from }) => {
  const camera = useThree((s) => s.camera);
  const sys = useMemo(() => {
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute("position", quad.attributes.position);
    geo.setAttribute("uv", quad.attributes.uv);
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    const iData = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    const iTint = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    iPos.setUsage(THREE.DynamicDrawUsage);
    iData.setUsage(THREE.DynamicDrawUsage);
    iTint.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iPos", iPos);
    geo.setAttribute("iData", iData);
    geo.setAttribute("iTint", iTint);
    const material = new THREE.ShaderMaterial({
      uniforms: { tNoise: { value: noiseTex() } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return { geo, iPos, iData, iTint, mesh };
  }, []);
  // gather the live puffs: births over the last LIFE seconds while each thruster fired
  type P = { x: number; y: number; z: number; size: number; op: number; seed: number; tint: THREE.Color; d: number };
  const puffs: P[] = [];
  const t0 = Math.max(from ?? 0, w - LIFE);
  const k0 = Math.ceil(t0 * EMIT_HZ);
  const k1 = Math.floor(w * EMIT_HZ);
  const camPos = camera.position;
  for (let k = k0; k <= k1 && puffs.length < MAX; k++) {
    const te = k / EMIT_HZ;
    const a = w - te;
    let any = false;
    for (let n = 0; n < 10; n++) if (thrusterAt(n, te) > 0.02) any = true;
    if (!any) continue;
    carMatrixAt(te, _m);
    _q.setFromRotationMatrix(_m);
    const carV = carVel(te);
    for (let n = 0; n < 10; n++) {
      const th = thrusterAt(n, te);
      if (th <= 0.02) continue;
      const seed = hash(k * 13.17 + n * 7.31);
      // (thin the side and rear jets a little: two of every three births)
      const T = THRUSTERS[n];
      _p.copy(T.at).applyMatrix4(_m);
      _d.copy(T.dir).applyQuaternion(_q);
      // spread round the jet's axis
      _v.set(hash(seed * 91.1) - 0.5, hash(seed * 47.3) - 0.5, hash(seed * 13.9) - 0.5).multiplyScalar(0.28);
      _d.add(_v).normalize().multiplyScalar(JET * (0.55 + 0.45 * th) * (0.8 + 0.4 * hash(seed * 3.3)));
      const out = new THREE.Vector3();
      const ground = puffAt(_p, _d, carV, a, seed, out);
      const life = LIFE * (0.55 + 0.45 * hash(seed * 5.1)) * (ground ? 1.15 : 1);
      if (a > life) continue;
      const fadeIn = Math.min(1, a / 0.04);
      const fadeOut = 1 - Math.min(1, Math.max(0, (a - life * 0.35) / (life * 0.65)));
      const size = 0.12 + 1.7 * Math.pow(a, 0.62) * (ground ? 1.35 : 1) * (0.7 + 0.6 * hash(seed * 8.7));
      const op = 0.32 * th * fadeIn * fadeOut * fadeOut * (0.6 + 0.4 * hash(seed * 2.9)) * (ground ? 1.1 : 1);
      if (op < 0.004) continue;
      // light: a cool ambient, the site's lights by distance
      const tint = new THREE.Color(0.32, 0.35, 0.42);
      for (const L of PUFF_LIGHTS) {
        const dd = out.distanceTo(L.at);
        tint.add(L.color.clone().multiplyScalar(L.k * Math.max(0, 1 - dd / L.r)));
      }
      puffs.push({ x: out.x, y: out.y, z: out.z, size, op, seed, tint, d: out.distanceToSquared(camPos) });
    }
  }
  puffs.sort((p, q) => q.d - p.d);
  const P = sys.iPos.array as Float32Array;
  const D = sys.iData.array as Float32Array;
  const T = sys.iTint.array as Float32Array;
  puffs.forEach((p, i) => {
    P[i * 3] = p.x;
    P[i * 3 + 1] = p.y;
    P[i * 3 + 2] = p.z;
    D[i * 4] = p.size;
    D[i * 4 + 1] = p.op;
    D[i * 4 + 2] = p.seed;
    D[i * 4 + 3] = 1.0;
    T[i * 3] = p.tint.r;
    T[i * 3 + 1] = p.tint.g;
    T[i * 3 + 2] = p.tint.b;
  });
  sys.geo.instanceCount = puffs.length;
  sys.iPos.needsUpdate = true;
  sys.iData.needsUpdate = true;
  sys.iTint.needsUpdate = true;
  return <primitive object={sys.mesh} />;
};

const velCache = new Map<number, THREE.Vector3>();
const carVel = (t: number) => {
  const key = Math.round(t * 1000);
  const hit = velCache.get(key);
  if (hit) return hit;
  const a = carAt(t - 0.01).pos;
  const b = carAt(t + 0.01).pos;
  const v = b.clone().sub(a).multiplyScalar(50);
  if (velCache.size > 5000) velCache.clear();
  velCache.set(key, v);
  return v;
};

/** The haze: large soft sprites hanging low, drifting, thicker round the ramp and the lineup. */
export const Haze: React.FC<{ t: number }> = ({ t }) => {
  const camera = useThree((s) => s.camera);
  const sys = useMemo(() => {
    const n = 220;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute("position", quad.attributes.position);
    geo.setAttribute("uv", quad.attributes.uv);
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const iData = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const iTint = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute("iPos", iPos);
    geo.setAttribute("iData", iData);
    geo.setAttribute("iTint", iTint);
    const material = new THREE.ShaderMaterial({
      uniforms: { tNoise: { value: noiseTex() } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    const base: { p: THREE.Vector3; s: number; seed: number }[] = [];
    for (let i = 0; i < n; i++) {
      const seed = hash(i * 3.31 + 0.5);
      const zone = i % 3;
      const c = zone === 0 ? new THREE.Vector3(0, 0, -74) : zone === 1 ? new THREE.Vector3(-14, 0, -46) : new THREE.Vector3(-8, 0, -30);
      const spread = zone === 2 ? 46 : 16;
      const p = new THREE.Vector3(c.x + (hash(seed * 7.1) - 0.5) * spread, 0.6 + hash(seed * 3.3) * 2.2, c.z + (hash(seed * 5.7) - 0.5) * spread * 1.6);
      base.push({ p, s: 5 + hash(seed * 9.9) * 7, seed });
    }
    return { geo, iPos, iData, iTint, mesh, base, n };
  }, []);
  const order = sys.base
    .map((b, i) => {
      const p = b.p.clone().add(new THREE.Vector3(Math.sin(t * 0.07 + b.seed * 9) * 2.5, Math.sin(t * 0.11 + b.seed * 5) * 0.3, Math.cos(t * 0.05 + b.seed * 7) * 2.5));
      return { i, p, d: p.distanceToSquared(camera.position) };
    })
    .sort((a, b) => b.d - a.d);
  const P = sys.iPos.array as Float32Array;
  const D = sys.iData.array as Float32Array;
  const T = sys.iTint.array as Float32Array;
  order.forEach((o, j) => {
    const b = sys.base[o.i];
    P.set([o.p.x, o.p.y, o.p.z], j * 3);
    // fade out when the camera's inside one (no flat sprites in the face)
    const near = Math.min(1, Math.max(0, (Math.sqrt(o.d) - 2) / 6));
    D.set([b.s, 0.05 * near, b.seed, 1], j * 4);
    const tint = new THREE.Color(0.22, 0.24, 0.3);
    for (const L of PUFF_LIGHTS) tint.add(L.color.clone().multiplyScalar(L.k * 0.7 * Math.max(0, 1 - o.p.distanceTo(L.at) / (L.r * 1.6))));
    T.set([tint.r, tint.g, tint.b], j * 3);
  });
  sys.geo.instanceCount = sys.n;
  sys.iPos.needsUpdate = true;
  sys.iData.needsUpdate = true;
  sys.iTint.needsUpdate = true;
  return <primitive object={sys.mesh} />;
};

// ------------------------------------------------------------------------- the show's own effects
/** The moments the barrier's CO2 cannons fire (world time) and the cold spark fountains' window. */
export const CO2_SHOTS = (cues: Record<string, number>) => [cues.touch1 - 0.05, cues.lift2 + 0.1, cues.stop2 - 0.4, cues.stop2 + 2.6];
const CO2_AT = Array.from({ length: 10 }, (_, i) => new THREE.Vector3(-26.9, 0.3, -6 - i * 11.5));
export const SPARK_AT = [-87.5, -92.5, -97.5, -102.5, -107.5].map((z) => new THREE.Vector3(-26.8, 0.25, z));

/** CO2 jets: white columns shot straight up from the barrier, hanging and drifting after. */
export const CO2: React.FC<{ w: number; shots: number[] }> = ({ w, shots }) => {
  const camera = useThree((s) => s.camera);
  const sys = useMemo(() => {
    const n = 1400;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute("position", quad.attributes.position);
    geo.setAttribute("uv", quad.attributes.uv);
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const iData = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const iTint = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute("iPos", iPos);
    geo.setAttribute("iData", iData);
    geo.setAttribute("iTint", iTint);
    const material = new THREE.ShaderMaterial({
      uniforms: { tNoise: { value: noiseTex() } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return { geo, iPos, iData, iTint, mesh, n };
  }, []);
  type P = { p: THREE.Vector3; size: number; op: number; seed: number; d: number };
  const puffs: P[] = [];
  const HZ = 60;
  for (const s of shots) {
    if (w < s || w > s + 4.5) continue;
    const k1 = Math.floor((Math.min(w, s + 0.7) - s) * HZ);
    for (let k = 0; k <= k1; k++) {
      const te = s + k / HZ;
      const a = w - te;
      CO2_AT.forEach((at, j) => {
        const seed = hash(k * 3.1 + j * 17.7 + s);
        const up = 26 * (0.8 + 0.4 * hash(seed * 2.2));
        const h = up * 0.12 * (1 - Math.exp(-a / 0.12));
        const p = at.clone().add(new THREE.Vector3(vnoise(a * 2 + seed * 9, 1) * 0.6 * a, h + 0.4 * a, vnoise(a * 2 + seed * 7, 2) * 0.6 * a));
        const life = 2.6 + hash(seed * 4.4);
        if (a > life) return;
        const op = 0.28 * Math.min(1, a / 0.03) * Math.pow(1 - a / life, 1.6);
        puffs.push({ p, size: 0.25 + 1.6 * Math.pow(a, 0.6), op, seed, d: p.distanceToSquared(camera.position) });
      });
    }
  }
  puffs.sort((a, b) => b.d - a.d);
  const n = Math.min(sys.n, puffs.length);
  const P = sys.iPos.array as Float32Array;
  const D = sys.iData.array as Float32Array;
  const T = sys.iTint.array as Float32Array;
  for (let i = 0; i < n; i++) {
    const q = puffs[puffs.length - n + i];
    P.set([q.p.x, q.p.y, q.p.z], i * 3);
    D.set([q.size, q.op, q.seed, 1], i * 4);
    T.set([0.95, 0.97, 1.05], i * 3);
  }
  sys.geo.instanceCount = n;
  sys.iPos.needsUpdate = true;
  sys.iData.needsUpdate = true;
  sys.iTint.needsUpdate = true;
  return <primitive object={sys.mesh} />;
};

/** Cold spark fountains: bright sparks thrown up in arcs from the barrier, falling, flickering out. */
export const Sparks: React.FC<{ w: number; t0: number; t1: number }> = ({ w, t0, t1 }) => {
  const sys = useMemo(() => {
    const n = 2600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 6);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const col = new Float32Array(n * 6);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const lines = new THREE.LineSegments(geo, m);
    lines.frustumCulled = false;
    lines.renderOrder = 7;
    return { geo, pos, col, lines, n };
  }, []);
  let k = 0;
  if (w > t0 && w < t1 + 1.4) {
    const HZ = 110;
    const a0 = Math.max(t0, w - 1.3);
    for (let e = Math.ceil(a0 * HZ); e <= Math.floor(Math.min(w, t1) * HZ) && k < sys.n; e++) {
      const te = e / HZ;
      const a = w - te;
      SPARK_AT.forEach((at, j) => {
        if (k >= sys.n) return;
        const seed = hash(e * 1.7 + j * 31.3);
        const life = 0.7 + 0.6 * hash(seed * 3.1);
        if (a > life) return;
        const sp = 7.5 + 2.5 * hash(seed * 5.5);
        const ang = (hash(seed * 7.7) - 0.5) * 0.45;
        const az = hash(seed * 9.1) * Math.PI * 2;
        const vx = Math.sin(ang) * Math.cos(az) * sp;
        const vz = Math.sin(ang) * Math.sin(az) * sp;
        const vy = Math.cos(ang) * sp;
        const at2 = (tt: number) => [at.x + vx * tt, at.y + vy * tt - 4.9 * tt * tt, at.z + vz * tt];
        const p1 = at2(a);
        const p0 = at2(Math.max(0, a - 0.035));
        const heat = Math.pow(1 - a / life, 0.7) * (0.6 + 0.4 * hash(seed * 1.3 + Math.floor(w * 40)));
        sys.pos.set([...p0, ...p1], k * 6);
        const c = [3.2 * heat, 2.3 * heat, 1.1 * heat];
        sys.col.set([...c, ...c], k * 6);
        k++;
      });
    }
  }
  sys.geo.setDrawRange(0, k * 2);
  (sys.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  (sys.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  return (
    <group>
      <primitive object={sys.lines} />
      {/* the fountains' bases */}
      {SPARK_AT.map((p, i) => (
        <mesh key={i} position={[p.x, 0.12, p.z]} material={M_BASE()}>
          <boxGeometry args={[0.35, 0.24, 0.35]} />
        </mesh>
      ))}
    </group>
  );
};
const M_BASE = () => baseMat ?? (baseMat = new THREE.MeshStandardMaterial({ color: "#121316", roughness: 0.5, metalness: 0.4 }));
let baseMat: THREE.Material | null = null;
