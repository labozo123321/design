import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { flat, gloss, hash, toon, clamp01 } from "../toon";
import { Fx } from "../Fx";
import { Earth } from "../Globe";
import { StripGeometry } from "../hose";
import { SkyDome, Stars, Label, rockGeo } from "./common";
import { LabelOpts } from "../toon";

/**
 * Space, to a schematic scale: Earth (radius 10) at the origin, its equator in the xz plane. Geostationary
 * height (36,000 km) is r = 66.2, the counterweight (100,000 km up) r = 167. The ribbon and everything
 * on it ride in Earth's turning frame, along +x from the base on the equator.
 */

export const R = 10;
export const GEO_R = R * (6371 + 35786) / 6371;
export const TOP_R = R * (6371 + 100000) / 6371;

/** Turns its children to face the camera. */
export const Billboard: React.FC<{ pos: [number, number, number]; children: React.ReactNode }> = ({ pos, children }) => {
  const camera = useThree((s) => s.camera);
  return (
    <group position={pos} quaternion={camera.quaternion.clone()}>
      {children}
    </group>
  );
};

const TAG: LabelOpts = { size: 130, color: "#ffffff", stroke: "#0b1030", strokeW: 20 };

const dashedRing = (r: number, n = 96) => {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.55) / n) * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      const b0 = a0 + ((a1 - a0) * k) / 4;
      const b1 = a0 + ((a1 - a0) * (k + 1)) / 4;
      pts.push(Math.cos(b0) * r, 0, Math.sin(b0) * r, Math.cos(b1) * r, 0, Math.sin(b1) * r);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
};
const GEO_RING = dashedRing(GEO_R);

export const Satellite: React.FC<{ s?: number; gold?: boolean }> = ({ s = 1, gold = true }) => (
  <group scale={s}>
    <mesh material={toon(gold ? "#e9b949" : "#e6e9ef")}>
      <boxGeometry args={[0.6, 0.6, 0.8]} />
    </mesh>
    {[-1, 1].map((sd) => (
      <mesh key={sd} position={[0, 0, sd * 1.15]} material={toon("#2f5fc4", { emissive: "#1b3c8a", ei: 0.3 })}>
        <boxGeometry args={[0.5, 0.04, 1.3]} />
      </mesh>
    ))}
    <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={toon("#f3f3f3")}>
      <coneGeometry args={[0.22, 0.25, 16, 1, true]} />
    </mesh>
  </group>
);

/** The climber: a little white cabin with windows, a solar dish underneath for the beam. */
export const Climber: React.FC<{ s?: number; lit?: number }> = ({ s = 1, lit = 0 }) => (
  <group scale={s}>
    <mesh material={toon("#f2f4f8")} castShadow>
      <boxGeometry args={[1.2, 1.4, 1.2]} />
    </mesh>
    <mesh position={[0, 0.78, 0]} material={toon("#d33f49")}>
      <boxGeometry args={[1.25, 0.16, 1.25]} />
    </mesh>
    {[0, 1, 2, 3].map((i) => (
      <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
        <mesh position={[0, 0.15, 0.605]} material={flat("#7fd3ff", 1.1)}>
          <planeGeometry args={[0.7, 0.45]} />
        </mesh>
      </group>
    ))}
    <mesh position={[0, -0.82, 0]} material={toon("#2a4fa8", { emissive: "#4fd2ff", ei: lit * 1.5 })}>
      <cylinderGeometry args={[0.95, 0.75, 0.12, 6]} />
    </mesh>
  </group>
);

const DEBRIS_N = 900;
const debris = Array.from({ length: DEBRIS_N }, (_, i) => ({
  r: R * (1.06 + 0.3 * Math.pow(hash(i * 1.7), 1.5)),
  inc: (hash(i * 2.3) - 0.5) * 1.8,
  node: hash(i * 3.1) * Math.PI * 2,
  ph: hash(i * 4.7) * Math.PI * 2,
  w: 0.25 + 0.35 * hash(i * 5.9),
  s: 0.14 + 0.2 * hash(i * 6.3),
  kind: Math.floor(hash(i * 7.7) * 3),
}));

/** The junk round Earth: lots of little bits in low orbits. */
const JunkCloud: React.FC<{ t: number; k: number }> = ({ t, k }) => {
  const geos = useMemo(() => [new THREE.BoxGeometry(1, 1, 1), new THREE.TetrahedronGeometry(0.8), new THREE.CylinderGeometry(0.3, 0.3, 1.4, 6)], []);
  const meshes = useMemo(
    () =>
      geos.map((g, gi) => {
        const m = new THREE.InstancedMesh(g, toon(["#eef1f6", "#ffcf5a", "#d5dbe6"][gi], { emissive: ["#9fb0d0", "#a07a20", "#8a94aa"][gi], ei: 0.6 }), DEBRIS_N);
        m.frustumCulled = false;
        return m;
      }),
    [geos],
  );
  const counts = [0, 0, 0];
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  debris.forEach((d, i) => {
    if (i / DEBRIS_N > k) return;
    const a = d.ph + t * d.w;
    const p = new THREE.Vector3(Math.cos(a) * d.r, 0, Math.sin(a) * d.r);
    p.applyAxisAngle(new THREE.Vector3(1, 0, 0), d.inc).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.node);
    e.set(t * 2 + i, t * 1.3 + i * 0.5, i);
    q.setFromEuler(e);
    mtx.compose(p, q, new THREE.Vector3(d.s, d.s, d.s));
    meshes[d.kind].setMatrixAt(counts[d.kind]++, mtx);
  });
  meshes.forEach((m, i) => {
    m.count = counts[i];
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
};

/** Close junk drifting round a point (for shots inside the field). */
export const JunkField: React.FC<{ t: number; at: [number, number, number]; n?: number; spread?: number; seed?: number; big?: boolean }> = ({ t, at, n = 46, spread = 3, seed = 0, big = false }) => (
  <group position={at}>
    {Array.from({ length: n }, (_, i) => {
      const h = (k: number) => hash(i * 13.1 + k + seed * 7.3);
      // a bounded drift (never wanders off, whatever the film's second)
      const p: [number, number, number] = [(h(1) - 0.5) * spread * 2 + 0.35 * Math.sin(t * 0.3 + h(2) * 6), (h(3) - 0.5) * spread * 1.6 + 0.2 * Math.sin(t * 0.23 + h(11) * 6), (h(4) - 0.5) * spread * 2];
      const rot: [number, number, number] = [t * (h(5) - 0.5) * 2 + h(6) * 6, t * (h(7) - 0.5) * 2, h(8) * 6];
      const kind = Math.floor(h(9) * 4);
      const s = (0.08 + h(10) * 0.22) * (big ? 1.9 : 1);
      return (
        <group key={i} position={p} rotation={rot} scale={s}>
          {kind === 0 ? (
            <mesh material={toon("#c9ced8")}>
              <cylinderGeometry args={[0.3, 0.3, 1.2, 6]} />
            </mesh>
          ) : kind === 1 ? (
            <mesh material={toon("#2f5fc4", { emissive: "#1b3c8a", ei: 0.3 })}>
              <boxGeometry args={[1.6, 0.06, 1.0]} />
            </mesh>
          ) : kind === 2 ? (
            <mesh material={toon("#e3b04b")}>
              <boxGeometry args={[0.9, 0.9, 0.9]} />
            </mesh>
          ) : (
            <mesh geometry={rockGeo(i, 0)} material={toon("#8c8f9a", {})} />
          )}
        </group>
      );
    })}
  </group>
);

export type RibbonState = {
  /** outer end (radius from the centre) */
  len: number;
  /** a loose top: 0 taut .. 1 flapping */
  slack?: number;
  /** sideways bend from the base sailing away (units at the base) */
  dodge?: number;
  width?: number;
  glow?: number;
};

/** The ribbon: two crossed strips (so it reads edge-on from any side). A loose top flops sideways (local
 * y); the base sailing away bends its lower part sideways too. */
const Ribbon: React.FC<{ r: RibbonState; t: number }> = ({ r, t }) => {
  const geoA = useMemo(() => new StripGeometry(160), []);
  const geoB = useMemo(() => new StripGeometry(160), []);
  const L = r.len - R;
  const slack = r.slack ?? 0;
  const dodge = r.dodge ?? 0;
  const f = (s: number) => {
    const x = R + s * L;
    const flop = slack * Math.pow(s, 1.5) * (7 * Math.sin(s * 8 - t * 3.0) + 9 * s);
    const side = dodge * (Math.exp(-s * 4) + 0.5 * Math.sin(s * Math.PI) * Math.exp(-s * 1.5));
    return new THREE.Vector3(x - slack * s * s * 3, flop + side, 0);
  };
  const w = (s: number) => (r.width ?? 0.35) * (1 - 0.35 * s);
  geoA.update(f, () => new THREE.Vector3(0, 0, 1), w);
  geoB.update(f, () => new THREE.Vector3(0, 1, 0), w);
  const m = toon("#eef2f8", { emissive: "#bfe9ff", ei: r.glow ?? 0.55, side: THREE.DoubleSide });
  return (
    <group>
      <mesh geometry={geoA} material={m} />
      <mesh geometry={geoB} material={m} />
    </group>
  );
};

export type SpaceProps = {
  t: number;
  /** Earth's turn (radians) */
  spin?: number;
  /** the ribbon points up the screen (the system turned so +x is +y) */
  up?: boolean;
  ribbon?: RibbonState;
  geo?: number;
  sat?: boolean;
  weight?: number;
  climbers?: { r: number; lit?: number; s?: number }[];
  junk?: number;
  station?: boolean;
  base?: boolean;
  labels?: { text: string; at: [number, number, number]; h: number; k?: number }[];
  noEarth?: boolean;
  /** a dashed line from the base straight out to geostationary height, turning with Earth */
  tether?: number;
  children?: React.ReactNode;
};

export const Space: React.FC<SpaceProps> = ({ t, spin = 0, up = false, ribbon, geo = 0, sat = false, weight = 0, climbers = [], junk = 0, station = false, base = true, labels = [], noEarth = false, tether = 0, children }) => {
  const rock = useMemo(() => rockGeo(3.3, 2), []);
  return (
    <group>
      <SkyDome r={1400} stops={[[0, "#0c1340"], [0.5, "#1b2568"], [1, "#0c1340"]]} />
      <Stars n={2000} r={1200} size={2.8} />
      <ambientLight intensity={0.45} color="#9fb0ff" />
      <directionalLight position={[60, 40, 80]} intensity={2.2} color="#fff6ea" />
      <group rotation={[0, 0, up ? Math.PI / 2 : 0]}>
        {!noEarth ? <Earth r={R} spin={spin} cloudSpin={spin * 1.04 + t * 0.01} /> : null}
        <group rotation={[0, spin, 0]}>
          {base ? (
            <group position={[R * 1.002, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <mesh material={toon("#f2f2f2")}>
                <cylinderGeometry args={[0.45, 0.5, 0.12, 6]} />
              </mesh>
              <Fx>
                <mesh position={[0, 0.1, 0]} material={flat("#ffd23f", 2)}>
                  <sphereGeometry args={[0.12, 12, 8]} />
                </mesh>
              </Fx>
            </group>
          ) : null}
          {ribbon ? <Ribbon r={ribbon} t={t} /> : null}
          {tether > 0 ? (
            <Fx>
              {Array.from({ length: 22 }, (_, i) => (
                <mesh key={i} position={[R + 1.5 + (i / 21) * (GEO_R - R - 4), 0, 0]} material={flat("#ffd23f", 2.0, { opacity: tether })}>
                  <sphereGeometry args={[0.55, 10, 8]} />
                </mesh>
              ))}
            </Fx>
          ) : null}
          {climbers.map((c, i) => (
            <group key={i} position={[c.r, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <Climber s={c.s ?? 0.5} lit={c.lit ?? 0} />
            </group>
          ))}
          {station ? (
            <group position={[GEO_R, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <mesh material={toon("#eef1f6")}>
                <cylinderGeometry args={[1.2, 1.2, 1.4, 24]} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={toon("#c9cfdb")}>
                <torusGeometry args={[2.6, 0.32, 12, 40]} />
              </mesh>
              {[0, 1, 2, 3].map((i) => (
                <mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]} position={[0, 0, 0]} material={toon("#c9cfdb")}>
                  <boxGeometry args={[5.2, 0.16, 0.16]} />
                </mesh>
              ))}
              <Fx>
                <mesh position={[0, 0.75, 0]} material={flat("#ffd23f", 2.2)}>
                  <sphereGeometry args={[0.18, 12, 8]} />
                </mesh>
              </Fx>
            </group>
          ) : null}
          {sat && !station ? (
            <group position={[GEO_R, 0, 0]}>
              <Satellite s={1.6} />
            </group>
          ) : null}
          {weight > 0 && ribbon ? (
            <group position={[ribbon.len + 3.2 * weight, 0, 0]} scale={4.2 * Math.max(0.001, weight)} rotation={[0.4, t * 0.1, 0.2]}>
              <mesh geometry={rock} material={toon("#8a7f78")} />
            </group>
          ) : null}
        </group>
        {geo > 0 ? (
          <Fx>
            <lineSegments geometry={GEO_RING}>
              <lineBasicMaterial color={new THREE.Color("#5fe3ff").multiplyScalar(1.6)} transparent opacity={geo} blending={THREE.AdditiveBlending} depthWrite={false} />
            </lineSegments>
          </Fx>
        ) : null}
        {junk > 0 ? <JunkCloud t={t} k={junk} /> : null}
      </group>
      {labels.map((l, i) => (
        <Billboard key={i} pos={l.at}>
          <Label text={l.text} h={l.h} o={TAG} opacity={l.k ?? 1} glow={1.1} />
        </Billboard>
      ))}
      {children}
    </group>
  );
};

/** The tug with its net, closing round a tumbling rock. close: 0 open .. 1 shut. */
export const Capture: React.FC<{ t: number; close: number; pos?: [number, number, number]; pull?: number }> = ({ t, close, pos = [0, 0, 0], pull = 0 }) => {
  const rock = useMemo(() => rockGeo(3.3, 2), []);
  const net = useMemo(() => {
    const pts: number[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI * 0.55;
      for (let k = 0; k < 24; k++) {
        const a0 = (k / 24) * Math.PI * 2;
        const a1 = ((k + 1) / 24) * Math.PI * 2;
        pts.push(Math.sin(th) * Math.cos(a0), Math.cos(th), Math.sin(th) * Math.sin(a0), Math.sin(th) * Math.cos(a1), Math.cos(th), Math.sin(th) * Math.sin(a1));
      }
    }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * Math.PI * 0.55;
        const t1 = ((i + 1) / n) * Math.PI * 0.55;
        pts.push(Math.sin(t0) * Math.cos(a), Math.cos(t0), Math.sin(t0) * Math.sin(a), Math.sin(t1) * Math.cos(a), Math.cos(t1), Math.sin(t1) * Math.sin(a));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  const k = clamp01(close);
  // the net is a cap that deepens round the rock as it closes
  const capScale: [number, number, number] = [2.6 * (1 - 0.35 * k), 2.6 + 1.2 * k, 2.6 * (1 - 0.35 * k)];
  return (
    <group position={pos}>
      <group position={[0, -pull * 6, 0]}>
        <group rotation={[t * 0.5 * (1 - k), t * 0.3 * (1 - k) + 1, 0.3]}>
          <mesh geometry={rock} material={toon("#8a7f78")} scale={1.9} />
        </group>
        <group position={[0, -1.2 + 2.2 * (1 - k), 0]} rotation={[Math.PI, 0, 0]} scale={capScale}>
          <lineSegments geometry={net}>
            <lineBasicMaterial color="#ffd23f" />
          </lineSegments>
        </group>
      </group>
      {/* the tug, below, pulling on the lines */}
      <group position={[0, -6.5 - pull * 6, 0]}>
        <mesh material={toon("#f2f4f8")}>
          <capsuleGeometry args={[0.7, 1.4, 8, 20]} />
        </mesh>
        <mesh position={[0, -1.4, 0]} material={gloss("#2a2d36", 0.4)}>
          <cylinderGeometry args={[0.35, 0.6, 0.6, 18, 1, true]} />
        </mesh>
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 1.5, 0, 0]} material={toon("#2f5fc4", { emissive: "#1b3c8a", ei: 0.3 })}>
            <boxGeometry args={[1.8, 0.05, 0.8]} />
          </mesh>
        ))}
        <Fx>
          <mesh position={[0, -2.2, 0]} rotation={[Math.PI, 0, 0]} material={flat("#7fd6ff", 2.2, { additive: true, opacity: 0.8 })}>
            <coneGeometry args={[0.32, 1.4 + 0.2 * Math.sin(t * 40), 16, 1, true]} />
          </mesh>
        </Fx>
        {/* lines to the net */}
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const top = new THREE.Vector3(Math.cos(a) * 2.6 * (1 - 0.35 * k), 6.5 - 1.2 + 2.2 * (1 - k) - 0.2, Math.sin(a) * 2.6 * (1 - 0.35 * k));
          const mid = top.clone().multiplyScalar(0.5);
          const len = top.length();
          return (
            <mesh key={i} position={mid} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().normalize())} material={flat("#ffd23f", 1.2)}>
              <cylinderGeometry args={[0.025, 0.025, len, 4]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
};
