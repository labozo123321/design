import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The rest of the park's rides, in motion: a 55 m Ferris wheel turning slowly with its gondolas hanging
 * level, a 60 m drop tower whose ring of seats rises and drops, a wave swinger with its seats flying out, a
 * carousel, a pirate ship swinging, a white wooden coaster (a lattice of bents under a hilly out-and-back)
 * and the water park's slides. Their bulbs are just coming on in the golden hour.
 */

const mats: Record<string, THREE.Material> = {};
const std = (k: string, p: THREE.MeshStandardMaterialParameters) => (mats[k] ??= new THREE.MeshStandardMaterial(p));
const glow = (k: string, c: THREE.Color) => (mats[k] ??= new THREE.MeshBasicMaterial({ color: c }));

const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8) => {
  const d = b.clone().sub(a);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
};
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
  g.deleteAttribute("uv");
  return g;
}))!;

/* ------------------------------------------------------------------ */
/* Ferris wheel                                                         */
/* ------------------------------------------------------------------ */

const WHEEL = { x: 72, z: -78, R: 26, hub: 30, n: 32 };
const GONDOLA_COLS = ["#E8463A", "#F2C14E", "#3E8FD8", "#4EB36A", "#E979B4", "#F28C38", "#8C6BD8", "#38C6C6"];

const FerrisWheel: React.FC<{ t: number }> = ({ t }) => {
  const g = useMemo(() => {
    const frame: THREE.BufferGeometry[] = [];
    const wheel: THREE.BufferGeometry[] = [];
    const bulbs: THREE.BufferGeometry[] = [];
    const { R, hub, n } = WHEEL;
    // A-frame legs either side of the wheel (the axle runs along z)
    for (const zs of [-1, 1]) {
      const top = new THREE.Vector3(0, hub, zs * 2.4);
      for (const xs of [-1, 1]) frame.push(tube(new THREE.Vector3(xs * 14, 0, zs * 6), top, 0.55));
      frame.push(tube(new THREE.Vector3(-9, 10, zs * 4.6), new THREE.Vector3(9, 10, zs * 4.6), 0.3));
    }
    frame.push(tube(new THREE.Vector3(0, hub, -3.2), new THREE.Vector3(0, hub, 3.2), 0.9, 16));
    // the wheel (built in its own frame, turning about z): two rims, spokes, cross braces
    for (const zs of [-1.6, 1.6]) {
      const rim = new THREE.TorusGeometry(R, 0.28, 8, 96);
      rim.translate(0, 0, zs);
      wheel.push(rim);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        wheel.push(tube(new THREE.Vector3(0, 0, zs * 0.4), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, zs), 0.09, 5));
        // bulbs along the spokes
        for (let k = 1; k <= 6; k++) {
          const b = new THREE.SphereGeometry(0.16, 6, 5);
          b.translate(Math.cos(a) * R * (k / 6.3), Math.sin(a) * R * (k / 6.3), zs * (0.4 + 0.6 * (k / 6.3)));
          bulbs.push(b);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      wheel.push(tube(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, -1.6), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 1.6), 0.12, 6));
    }
    const gond = new THREE.CapsuleGeometry(1.0, 1.0, 4, 10);
    gond.scale(1.0, 1.0, 1.1);
    return { frame: merge(frame), wheel: merge(wheel), bulbs: merge(bulbs), gond };
  }, []);
  const rot = t * 0.06;
  return (
    <group position={[WHEEL.x, 0, WHEEL.z]} rotation={[0, 0.35, 0]}>
      <mesh geometry={g.frame} material={std("fw-frame", { color: "#F4F1EA", roughness: 0.5, metalness: 0.2 })} castShadow />
      <group position={[0, WHEEL.hub, 0]} rotation={[0, 0, rot]}>
        <mesh geometry={g.wheel} material={std("fw-wheel", { color: "#F4F1EA", roughness: 0.45, metalness: 0.25 })} castShadow />
        <mesh geometry={g.bulbs} material={glow("fw-bulb", new THREE.Color(2.4, 1.9, 1.2))} />
      </group>
      {Array.from({ length: WHEEL.n }).map((_, i) => {
        const a = (i / WHEEL.n) * Math.PI * 2 + rot;
        return (
          <group key={i} position={[Math.cos(a) * WHEEL.R, WHEEL.hub + Math.sin(a) * WHEEL.R - 1.6, 0]}>
            <mesh geometry={g.gond} material={std(`fw-g${i % 8}`, { color: GONDOLA_COLS[i % 8], roughness: 0.4, metalness: 0.1 })} castShadow />
            <mesh position={[0, 1.6, 0]} material={std("fw-frame", { color: "#F4F1EA" })}>
              <cylinderGeometry args={[0.06, 0.06, 1.2, 6]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Drop tower                                                           */
/* ------------------------------------------------------------------ */

const TOWER = { x: 128, z: 48, H: 62 };
const DropTower: React.FC<{ t: number }> = ({ t }) => {
  const g = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const s = 1.6;
    for (const [x, z] of [
      [-s, -s],
      [s, -s],
      [s, s],
      [-s, s],
    ])
      parts.push(tube(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, TOWER.H, z), 0.22, 8));
    for (let y = 2; y < TOWER.H; y += 3) {
      const c: [number, number][] = [
        [-s, -s],
        [s, -s],
        [s, s],
        [-s, s],
      ];
      for (let i = 0; i < 4; i++) {
        const a = c[i];
        const b = c[(i + 1) % 4];
        parts.push(tube(new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(b[0], y + 3, b[1]), 0.07, 5));
      }
    }
    const cap = new THREE.CylinderGeometry(2.6, 2.6, 2.4, 24);
    cap.translate(0, TOWER.H + 1.2, 0);
    parts.push(cap);
    const ring = new THREE.TorusGeometry(3.4, 0.5, 10, 32);
    ring.rotateX(Math.PI / 2);
    const seats: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const b = new THREE.BoxGeometry(0.7, 1.2, 0.6);
      b.translate(Math.cos(a) * 4.1, -0.7, Math.sin(a) * 4.1);
      b.rotateY(0);
      seats.push(b);
    }
    return { tower: merge(parts), ring, seats: merge(seats) };
  }, []);
  // a 22 s cycle: slow rise, hold at the top, drop, brake, wait
  const c = t % 22;
  const y =
    c < 8 ? 3 + (TOWER.H - 6) * ((1 - Math.cos((c / 8) * Math.PI)) / 2) : c < 11 ? TOWER.H - 3 : c < 13.2 ? Math.max(3, TOWER.H - 3 - 0.5 * 9.81 * (c - 11) ** 2 * 1.1) : 3;
  return (
    <group position={[TOWER.x, 0, TOWER.z]}>
      <mesh geometry={g.tower} material={std("dt", { color: "#3A6FD8", roughness: 0.45, metalness: 0.4 })} castShadow />
      <group position={[0, y, 0]}>
        <mesh geometry={g.ring} material={std("dt-ring", { color: "#FFD23F", roughness: 0.4 })} castShadow />
        <mesh geometry={g.seats} material={std("dt-seat", { color: "#22252B", roughness: 0.5 })} castShadow />
      </group>
      <mesh position={[0, TOWER.H + 2.8, 0]} material={glow("dt-light", new THREE.Color(4, 0.6, 0.4))}>
        <sphereGeometry args={[0.5, 10, 8]} />
      </mesh>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Wave swinger, carousel, pirate ship                                  */
/* ------------------------------------------------------------------ */

const Swinger: React.FC<{ t: number; x: number; z: number }> = ({ t, x, z }) => {
  const spin = t * 1.1;
  const tilt = 0.12 * Math.sin(t * 0.7);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 8, 0]} material={std("sw-pole", { color: "#E8463A", roughness: 0.4 })} castShadow>
        <cylinderGeometry args={[0.7, 1.0, 16, 16]} />
      </mesh>
      <group position={[0, 15.5, 0]} rotation={[tilt, spin, tilt * 0.5]}>
        <mesh material={std("sw-top", { color: "#F2C14E", roughness: 0.4 })} castShadow>
          <coneGeometry args={[7.2, 2.4, 24, 1, true]} />
        </mesh>
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const out = 0.9;
          return (
            <group key={i} position={[Math.cos(a) * 6.5, -1, Math.sin(a) * 6.5]} rotation={[0, -a, 0]}>
              <group rotation={[0, 0, out]}>
                <mesh position={[0, -3, 0]} material={std("sw-chain", { color: "#C9CDD3", metalness: 0.6, roughness: 0.4 })}>
                  <cylinderGeometry args={[0.03, 0.03, 6, 4]} />
                </mesh>
                <mesh position={[0, -6.2, 0]} material={std(`sw-seat${i % 4}`, { color: ["#3E8FD8", "#E979B4", "#4EB36A", "#F28C38"][i % 4], roughness: 0.5 })} castShadow>
                  <boxGeometry args={[0.6, 0.5, 0.6]} />
                </mesh>
              </group>
            </group>
          );
        })}
      </group>
    </group>
  );
};

const Carousel: React.FC<{ t: number; x: number; z: number }> = ({ t, x, z }) => (
  <group position={[x, 0, z]}>
    <mesh position={[0, 0.4, 0]} material={std("ca-base", { color: "#7A3B2E", roughness: 0.7 })} receiveShadow>
      <cylinderGeometry args={[9, 9.2, 0.8, 40]} />
    </mesh>
    <group rotation={[0, t * 0.35, 0]}>
      <mesh position={[0, 7.4, 0]} material={std("ca-roof", { color: "#E8463A", roughness: 0.6 })} castShadow>
        <coneGeometry args={[10, 3.2, 40]} />
      </mesh>
      <mesh position={[0, 5.6, 0]} material={std("ca-band", { color: "#F2C14E", roughness: 0.5 })}>
        <cylinderGeometry args={[9.6, 9.6, 1.0, 40, 1, true]} />
      </mesh>
      <mesh position={[0, 4, 0]} material={std("ca-core", { color: "#F4F1EA", roughness: 0.5 })} castShadow>
        <cylinderGeometry args={[2.2, 2.2, 7, 24]} />
      </mesh>
      {Array.from({ length: 18 }).map((_, i) => {
        const a = (i / 18) * Math.PI * 2;
        const r = i % 2 ? 7.2 : 5.2;
        const bob = 0.35 * Math.sin(t * 2.4 + i);
        return (
          <group key={i} position={[Math.cos(a) * r, 0, Math.sin(a) * r]} rotation={[0, -a, 0]}>
            <mesh position={[0, 3.4, 0]} material={std("ca-pole", { color: "#D9B44A", metalness: 0.8, roughness: 0.3 })}>
              <cylinderGeometry args={[0.05, 0.05, 5.6, 6]} />
            </mesh>
            <mesh position={[0, 2.2 + bob, 0]} material={std(`ca-h${i % 3}`, { color: ["#F4F1EA", "#3E2A1E", "#C9A27A"][i % 3], roughness: 0.5 })} castShadow>
              <boxGeometry args={[0.4, 0.8, 1.5]} />
            </mesh>
          </group>
        );
      })}
      {Array.from({ length: 40 }).map((_, i) => {
        const a = (i / 40) * Math.PI * 2;
        return (
          <mesh key={`b${i}`} position={[Math.cos(a) * 9.65, 5.6, Math.sin(a) * 9.65]} material={glow("ca-bulb", new THREE.Color(3, 2.4, 1.4))}>
            <sphereGeometry args={[0.12, 6, 5]} />
          </mesh>
        );
      })}
    </group>
  </group>
);

const PirateShip: React.FC<{ t: number; x: number; z: number; rot: number }> = ({ t, x, z, rot }) => {
  const swing = 1.05 * Math.sin(t * (2 * Math.PI) / 7.5);
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, 7.5, s * 3]} rotation={[0, 0, 0.42]} material={std("ps-frame", { color: "#2C2F35", roughness: 0.5, metalness: 0.4 })} castShadow>
            <cylinderGeometry args={[0.35, 0.45, 16.5, 10]} />
          </mesh>
          <mesh position={[0, 7.5, s * 3]} rotation={[0, 0, -0.42]} material={std("ps-frame", { color: "#2C2F35" })} castShadow>
            <cylinderGeometry args={[0.35, 0.45, 16.5, 10]} />
          </mesh>
        </group>
      ))}
      <group position={[0, 15, 0]} rotation={[0, 0, swing]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, -5.5, s * 2.2]} material={std("ps-arm", { color: "#C9CDD3", roughness: 0.4, metalness: 0.5 })}>
            <cylinderGeometry args={[0.2, 0.2, 11, 8]} />
          </mesh>
        ))}
        <mesh position={[0, -11.5, 0]} scale={[7, 1.7, 2.2]} material={std("ps-hull", { color: "#7A3B1E", roughness: 0.7 })} castShadow>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, -10.6, 0]} material={std("ps-deck", { color: "#B88A5A", roughness: 0.8 })}>
          <boxGeometry args={[13, 0.3, 4]} />
        </mesh>
        <mesh position={[0, -6.5, 0]} material={std("ps-mast", { color: "#5A3A22", roughness: 0.8 })}>
          <cylinderGeometry args={[0.15, 0.15, 8, 8]} />
        </mesh>
        <mesh position={[1.5, -6.0, 0]} material={std("ps-sail", { color: "#F4F1EA", roughness: 0.9, side: THREE.DoubleSide })}>
          <planeGeometry args={[3.2, 4]} />
        </mesh>
      </group>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* The wooden coaster                                                   */
/* ------------------------------------------------------------------ */

/** A hilly out-and-back east of the park: points (x, z, height) of its track. */
const WOOD_PATH = (() => {
  const pts: THREE.Vector3[] = [];
  const n = 260;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    // out east along z = -60, a turnaround, back along z = -20, with hills
    const a = u * Math.PI * 2;
    const x = 230 + 90 * Math.sin(a - Math.PI / 2) * -1;
    const z = -40 + 22 * Math.sin(a);
    const hill = u < 0.06 ? 30 * (u / 0.06) : 6 + 24 * Math.abs(Math.sin(u * Math.PI * 4.5)) * (1 - u * 0.6);
    pts.push(new THREE.Vector3(x, Math.max(3, hill), z));
  }
  return pts;
})();

const WoodenCoaster: React.FC = () => {
  const geo = useMemo(() => {
    const wood: THREE.BufferGeometry[] = [];
    const rails: THREE.BufferGeometry[] = [];
    const n = WOOD_PATH.length;
    for (let i = 0; i < n - 1; i += 2) {
      const p = WOOD_PATH[i];
      const q = WOOD_PATH[Math.min(n - 1, i + 2)];
      const dir = q.clone().sub(p).setY(0).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      // a bent: two posts, ledgers every 2.5 m, an X of bracing
      const w = 2.2 + p.y * 0.06;
      const l = p.clone().addScaledVector(side, -w).setY(0);
      const r = p.clone().addScaledVector(side, w).setY(0);
      wood.push(tube(l, l.clone().setY(p.y), 0.13, 4));
      wood.push(tube(r, r.clone().setY(p.y), 0.13, 4));
      for (let y = 2.5; y < p.y; y += 2.5) wood.push(tube(l.clone().setY(y), r.clone().setY(y), 0.08, 4));
      wood.push(tube(l, r.clone().setY(p.y), 0.06, 4));
      wood.push(tube(r, l.clone().setY(p.y), 0.06, 4));
      // track deck and rails
      wood.push(tube(p.clone().addScaledVector(side, -1), q.clone().addScaledVector(side, -1), 0.14, 4));
      wood.push(tube(p.clone().addScaledVector(side, 1), q.clone().addScaledVector(side, 1), 0.14, 4));
      rails.push(tube(p.clone().addScaledVector(side, -0.6).setY(p.y + 0.2), q.clone().addScaledVector(side, -0.6).setY(q.y + 0.2), 0.06, 4));
      rails.push(tube(p.clone().addScaledVector(side, 0.6).setY(p.y + 0.2), q.clone().addScaledVector(side, 0.6).setY(q.y + 0.2), 0.06, 4));
    }
    return { wood: merge(wood), rails: merge(rails) };
  }, []);
  return (
    <>
      <mesh geometry={geo.wood} material={std("wood", { color: "#EFE9DD", roughness: 0.85 })} castShadow />
      <mesh geometry={geo.rails} material={std("wood-rail", { color: "#8E959C", roughness: 0.35, metalness: 0.7 })} />
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Water park slides (west, against the sunset)                         */
/* ------------------------------------------------------------------ */

const WaterSlides: React.FC = () => {
  const geo = useMemo(() => {
    const tower: THREE.BufferGeometry[] = [];
    const slides: { g: THREE.BufferGeometry; c: string }[] = [];
    const base = new THREE.Vector3(-262, 0, -48);
    for (const [x, z] of [
      [-3, -3],
      [3, -3],
      [3, 3],
      [-3, 3],
    ])
      tower.push(tube(base.clone().add(new THREE.Vector3(x, 0, z)), base.clone().add(new THREE.Vector3(x, 22, z)), 0.3, 6));
    for (let y = 6; y <= 22; y += 8) {
      const deck = new THREE.BoxGeometry(7.2, 0.3, 7.2);
      deck.translate(base.x, y, base.z);
      tower.push(deck);
    }
    const roof = new THREE.ConeGeometry(5.5, 3, 4);
    roof.rotateY(Math.PI / 4);
    roof.translate(base.x, 24.5, base.z);
    tower.push(roof);
    const cols = ["#F2C14E", "#3E8FD8", "#E8463A", "#4EB36A"];
    for (let k = 0; k < 4; k++) {
      const pts: THREE.Vector3[] = [];
      const y0 = 22 - (k % 2) * 8;
      const turns = 1.2 + k * 0.4;
      for (let i = 0; i <= 60; i++) {
        const u = i / 60;
        const a = u * turns * Math.PI * 2 + k * 1.6;
        const r = 7 + 10 * u + k * 2;
        pts.push(new THREE.Vector3(base.x + Math.cos(a) * r, y0 * (1 - u) + 1.2, base.z + Math.sin(a) * r * 1.3 + u * 10));
      }
      slides.push({ g: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.9, 12, false), c: cols[k] });
    }
    return { tower: merge(tower), slides };
  }, []);
  return (
    <>
      <mesh geometry={geo.tower} material={std("ws-tower", { color: "#F4F1EA", roughness: 0.6 })} castShadow />
      {geo.slides.map((s, i) => (
        <mesh key={i} geometry={s.g} material={std(`ws-${i}`, { color: s.c, roughness: 0.3 })} castShadow />
      ))}
    </>
  );
};

export const Rides: React.FC<{ t: number }> = ({ t }) => (
  <>
    <FerrisWheel t={t} />
    <DropTower t={t} />
    <Swinger t={t} x={18} z={-86} />
    <Carousel t={t} x={-130} z={-70} />
    <PirateShip t={t} x={-30} z={-100} rot={0.4} />
    <WoodenCoaster />
    <WaterSlides />
  </>
);

export const RIDE_SPOTS = { WHEEL, TOWER };
