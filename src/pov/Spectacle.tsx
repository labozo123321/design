import React, { useMemo } from "react";
import * as THREE from "three";
import { random } from "remotion";
import { clearance } from "./crowd";
import { PULSES, T, UPDRAFT_AT } from "./timeline";

/**
 * The set pieces that keep the eye busy: the gravity pulses rolling out across the city as a dust ring and
 * wall, a flock of pigeons bursting up at the first one, and the ground shedding its pebbles, leaves and
 * glinting grit as gravity fades.
 */

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const lift = (t: number) => Math.max(0, t - UPDRAFT_AT);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/* ------------------------------------------------------------------ */
/* Pulses                                                               */
/* ------------------------------------------------------------------ */

/** Shockwave radius (m) a given time after a pulse. */
export const waveRadius = (age: number) => 3 + 30 * age + 8 * age * age;

/** How browned out a light is: dimmed and flickering for a moment when a pulse's wave reaches it. */
const surge = (t: number, dist: (p: (typeof PULSES)[number]) => number) => {
  let dip = 0;
  for (const p of PULSES) {
    const age = t - p.t;
    if (age < 0 || age > 6) continue;
    // when the wave reaches this light (inverse of waveRadius)
    const a = age - (Math.sqrt(30 * 30 + 32 * Math.max(0, dist(p) - 3)) - 30) / 16;
    if (a < 0 || a > 0.7) continue;
    dip = Math.max(dip, p.k * Math.exp(-a * 5) * (0.65 + 0.35 * Math.sin(a * 70)));
  }
  return Math.min(1, dip);
};
/** A light at (x, z). */
export const surgeAt = (t: number, x: number, z: number) => surge(t, (p) => Math.hypot(x - p.x, z - p.z));
/** The city at large, as the wave rolls into it (~150 m out). */
export const citySurge = (t: number) => surge(t, () => 150);

let ringTex: THREE.Texture | null = null;
/** A soft bright band at the rim of a disc. */
const ringTexture = () => {
  if (ringTex) return ringTex;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.7, "rgba(255,255,255,0)");
  grd.addColorStop(0.93, "rgba(255,255,255,0.75)");
  grd.addColorStop(0.97, "rgba(255,255,255,1)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  ringTex = new THREE.CanvasTexture(c);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
};
let wallTex: THREE.Texture | null = null;
/** Dust boiling up: dense at the ground, thinning upward, streaked. */
const wallTexture = () => {
  if (wallTex) return wallTex;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  for (let x = 0; x < 512; x += 2) {
    const h = 0.45 + 0.55 * random(`wt${x >> 3}`);
    const grd = g.createLinearGradient(0, 128, 0, 0);
    grd.addColorStop(0, `rgba(255,255,255,${0.55 + 0.45 * random(`wa${x}`)})`);
    grd.addColorStop(h * 0.6, "rgba(255,255,255,0.25)");
    grd.addColorStop(h, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(x, 0, 2, 128);
  }
  wallTex = new THREE.CanvasTexture(c);
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(10, 1);
  wallTex.colorSpace = THREE.SRGBColorSpace;
  return wallTex;
};

/** The pulse rolling outward from where you stood: a bright ring on the ground and a wall of dust. */
export const Shockwave: React.FC<{ t: number }> = ({ t }) => (
  <group>
    {PULSES.map((p, i) => {
      const age = t - p.t;
      if (age < 0 || age > 3.2) return null;
      const R = waveRadius(age);
      const o = p.k * smooth(0, 0.08, age) * (1 - smooth(0.3, 3.2, age));
      const h = 3 + 2.5 * p.k;
      return (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} scale={R} renderOrder={4}>
            <circleGeometry args={[1, 128]} />
            <meshBasicMaterial
              map={ringTexture()}
              color={new THREE.Color("#FFE3B8").multiplyScalar(1.6)}
              transparent
              opacity={o}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh position={[0, h / 2, 0]} scale={[R, h, R]} renderOrder={4}>
            <cylinderGeometry args={[1, 1, 1, 128, 1, true]} />
            <meshBasicMaterial
              map={wallTexture()}
              color={new THREE.Color("#FFE9CC").multiplyScalar(0.9)}
              transparent
              opacity={o * 0.4}
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      );
    })}
  </group>
);

/* ------------------------------------------------------------------ */
/* Pigeons                                                              */
/* ------------------------------------------------------------------ */

const FLOCK_AT = { x: 8.9, z: 20.5 }; // open paving just ahead, clear of every walker for the first 1.5 s
const BIRDS = Array.from({ length: 14 }).map((_, i) => {
  const r = (k: string) => random(`pg${i}${k}`);
  const a = r("a") * Math.PI * 2;
  const d = Math.sqrt(r("d")) * 1.15;
  // fly up and away from the viewer (who stands to the north-east, looking south-west)
  const away = Math.atan2(-0.7, -0.71) + (r("h") - 0.5) * 2.4;
  return {
    x: FLOCK_AT.x + Math.cos(a) * d * 1.15,
    z: FLOCK_AT.z + Math.sin(a) * d,
    face: r("f") * Math.PI * 2,
    at: PULSES[0].t + 0.04 + r("t") * 0.32,
    head: away,
    turn: (r("w") - 0.5) * 0.9,
    v: 4 + r("v") * 2.2,
    up: 3.2 + r("u") * 2.2,
    flap: 7 + r("p") * 3,
    ph: r("q") * 6.28,
  };
});

const birdPos = (b: (typeof BIRDS)[number], t: number) => {
  const tau = Math.max(0, t - b.at);
  if (tau <= 0) return { x: b.x, y: 0, z: b.z, yaw: b.face, pitch: 0, flying: false, tau };
  const w = b.turn;
  const th = b.head + w * tau;
  // constant-rate turn in the horizontal, a burst of climb that settles to a steady one
  const hx =
    Math.abs(w) > 1e-3 ? (b.v / w) * (Math.sin(th) - Math.sin(b.head)) : b.v * tau * Math.cos(b.head);
  const hz =
    Math.abs(w) > 1e-3 ? (b.v / w) * (Math.cos(b.head) - Math.cos(th)) : b.v * tau * Math.sin(b.head);
  const y = 1.4 * tau + b.up * 0.6 * (1 - Math.exp(-tau / 0.6));
  const vy = 1.4 + b.up * Math.exp(-tau / 0.6);
  return {
    x: b.x + hx * smooth(0, 0.25, tau),
    y,
    z: b.z + hz * smooth(0, 0.25, tau),
    // turn from where it was facing into the flight line over the first beat of the wings
    yaw: b.face + wrap(Math.atan2(Math.cos(th), Math.sin(th)) - b.face) * smooth(0, 0.15, tau),
    pitch: -Math.atan2(vy, b.v) * 0.8,
    flying: true,
    tau,
  };
};

const BirdMat = {
  body: new THREE.MeshStandardMaterial({ color: "#A7ADB7", roughness: 0.75 }),
  head: new THREE.MeshStandardMaterial({ color: "#56606E", roughness: 0.6 }),
  neck: new THREE.MeshStandardMaterial({ color: "#3F7A66", roughness: 0.35, metalness: 0.35 }),
  wing: new THREE.MeshStandardMaterial({ color: "#949AA5", roughness: 0.8 }),
  tip: new THREE.MeshStandardMaterial({ color: "#3E444F", roughness: 0.8 }),
  beak: new THREE.MeshStandardMaterial({ color: "#2A2B30", roughness: 0.5 }),
};

/** A flock of pigeons on the paving ahead that bursts into the air at the first pulse. */
export const Pigeons: React.FC<{ t: number }> = ({ t }) => {
  if (t > PULSES[0].t + 7) return null;
  return (
    <group>
      {BIRDS.map((b, i) => {
        const s = birdPos(b, t);
        const flap = s.flying
          ? Math.sin(s.tau * b.flap * Math.PI * 2 + b.ph) * 0.95 * smooth(0, 0.08, s.tau)
          : -0.1;
        // wings folded back along the body until it takes off
        const fold = 1 - smooth(0, 0.08, s.tau);
        const peck = s.flying ? 0 : Math.max(0, Math.sin(t * 5 + b.ph)) * 0.5;
        return (
          <group key={i} position={[s.x, s.y + 0.1, s.z]} rotation={[0, s.yaw, 0]}>
            <group rotation={[s.pitch + peck * 0.4, 0, 0]}>
              <mesh material={BirdMat.body} scale={[0.1, 0.09, 0.16]} castShadow>
                <sphereGeometry args={[1, 10, 8]} />
              </mesh>
              <mesh
                material={BirdMat.neck}
                position={[0, 0.045 - peck * 0.05, 0.095]}
                scale={[0.055, 0.06, 0.05]}
              >
                <sphereGeometry args={[1, 8, 6]} />
              </mesh>
              <mesh material={BirdMat.head} position={[0, 0.08 - peck * 0.09, 0.14]} scale={0.045}>
                <sphereGeometry args={[1, 8, 6]} />
              </mesh>
              <mesh
                material={BirdMat.beak}
                position={[0, 0.075 - peck * 0.09, 0.19]}
                rotation={[Math.PI / 2, 0, 0]}
                scale={[0.012, 0.03, 0.012]}
              >
                <coneGeometry args={[1, 1, 6]} />
              </mesh>
              <mesh material={BirdMat.tip} position={[0, 0.015, -0.18]} scale={[0.075, 0.014, 0.1]}>
                <boxGeometry args={[1, 1, 1]} />
              </mesh>
              {/* wings: tucked away at rest; in flight, a rounded inner wing and an outer hand that bends */}
              {[-1, 1].map((sd) => (
                <group
                  key={sd}
                  position={[sd * 0.055, 0.045, 0.01]}
                  rotation={[0, 0, sd * flap]}
                  scale={1 - fold}
                >
                  <mesh material={BirdMat.wing} position={[sd * 0.085, 0, 0]} scale={[0.09, 0.013, 0.075]}>
                    <sphereGeometry args={[1, 10, 6]} />
                  </mesh>
                  <group position={[sd * 0.16, 0, 0]} rotation={[0, 0, sd * flap * 0.6]}>
                    <mesh
                      material={BirdMat.tip}
                      position={[sd * 0.075, 0, -0.015]}
                      scale={[0.085, 0.009, 0.055]}
                    >
                      <sphereGeometry args={[1, 10, 6]} />
                    </mesh>
                  </group>
                </group>
              ))}
            </group>
          </group>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* The ground letting go                                                */
/* ------------------------------------------------------------------ */

type Bit = { x: number; z: number; at: number; v: number; a: number; s: number; spin: number; ph: number };
/** Spots on open paving near the route, each with the moment it lets go (more and more as g falls). */
const bits = (key: string, n: number, sMin: number, sMax: number): Bit[] => {
  const out: Bit[] = [];
  for (let i = 0; out.length < n && i < n * 20; i++) {
    const r = (k: string) => random(`${key}${i}${k}`);
    const f = Math.floor(200 + r("f") * (T.floatAt - 200));
    const ang = r("a") * Math.PI * 2;
    const d = 1.6 + Math.pow(r("d"), 0.8) * 13;
    const x = T.x[f] + Math.cos(ang) * d;
    const z = T.z[f] + Math.sin(ang) * d;
    if (clearance(x, z) < 0.25) continue;
    out.push({
      x,
      z,
      at: 11 + 23 * Math.sqrt(r("t")),
      v: 0.05 + r("v") * 0.3,
      a: 0.02 + r("g") * 0.07,
      s: sMin + r("s") * (sMax - sMin),
      spin: (r("w") - 0.5) * 4,
      ph: r("p") * 6.28,
    });
  }
  return out;
};
const PEBBLES = bits("pb", 520, 0.022, 0.06);
const LEAVES = bits("lf", 160, 0.06, 0.11);
const GLINTS = bits("gl", 260, 0.009, 0.016);

const bitAt = (
  b: Bit,
  t: number,
  cam: THREE.Vector3,
  m: THREE.Matrix4,
  q: THREE.Quaternion,
  e: THREE.Euler,
) => {
  const tau = t - b.at;
  if (tau <= 0) return false;
  const y = 0.03 + b.v * tau + 0.5 * b.a * tau * tau + lift(t) * lift(t) * 0.9;
  if (y > 90) return false;
  const x = b.x + Math.sin(t * 0.7 + b.ph) * 0.15 * smooth(0, 3, tau);
  const z = b.z + Math.cos(t * 0.6 + b.ph) * 0.15 * smooth(0, 3, tau);
  // grow in as it lets go, and never reach the lens
  const near = smooth(0.35, 0.9, Math.hypot(x - cam.x, y - cam.y, z - cam.z));
  const k = b.s * smooth(0, 0.5, tau) * near;
  if (k < 1e-4) return false;
  e.set(b.spin * tau + b.ph, b.spin * 0.7 * tau, b.ph);
  q.setFromEuler(e);
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(k, k, k));
  return true;
};

const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false;
  m.count = 0;
  return m;
};

export const RisingDebris: React.FC<{ t: number; cam: THREE.Vector3 }> = ({ t, cam }) => {
  const meshes = useMemo(
    () => ({
      pebbles: instanced(
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ color: "#7D7268", roughness: 0.9, flatShading: true }),
        PEBBLES.length,
      ),
      leaves: instanced(
        new THREE.PlaneGeometry(1, 0.7),
        new THREE.MeshStandardMaterial({ color: "#C9792E", roughness: 0.8, side: THREE.DoubleSide }),
        LEAVES.length,
      ),
      glints: instanced(
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshBasicMaterial({ color: new THREE.Color("#FFE6B8").multiplyScalar(4) }),
        GLINTS.length,
      ),
    }),
    [],
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const fill = (mesh: THREE.InstancedMesh, list: Bit[]) => {
    let n = 0;
    for (const b of list) if (bitAt(b, t, cam, m, q, e)) mesh.setMatrixAt(n++, m);
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  };
  if (t > 10.5 && t < 52) {
    fill(meshes.pebbles, PEBBLES);
    fill(meshes.leaves, LEAVES);
    fill(meshes.glints, GLINTS);
  } else {
    meshes.pebbles.count = meshes.leaves.count = meshes.glints.count = 0;
  }
  return (
    <group>
      <primitive object={meshes.pebbles} />
      <primitive object={meshes.leaves} />
      <primitive object={meshes.glints} />
    </group>
  );
};
