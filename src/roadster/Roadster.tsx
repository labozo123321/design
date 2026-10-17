import React, { useMemo } from "react";
import * as THREE from "three";
import { M, canvasTex, mat } from "./materials";
import type { CarState } from "./path";
import { THRUSTERS } from "./path";

/**
 * The new Roadster: a white wedge in flat facets (an SR-71's chines, an F-35's canopy): the fenders peaked
 * over the wheels with the hood low between them, a gold-visor canopy hinged at the front, the full-width
 * light bar across the nose, the full-width tail light, an active wing, ten cold-gas thruster nozzles (four
 * in the tail, six underneath) and two fans in the floor. Built in the car frame: x right, y up, z back
 * (forward is -z), the origin on the ground under the middle.
 */

export const WHEEL_R = 0.35;
export const AXLE_F = -1.325;
export const AXLE_R = 1.325;
export const HALF_TRACK = 0.865;
export const CANOPY_HINGE = new THREE.Vector3(0, 0.76, -1.05);
export const CANOPY_Z = [-1.05, 0.55];

type V2 = [number, number];
type V3 = [number, number, number];

// the stations, nose to tail: [z, underbody y, underbody edge x, sill x, sill y, chine x, chine y, shoulder x,
// shoulder y, top edge x, top edge y, top centre y]
const ST: number[][] = [
  [-2.2, 0.25, 0.6, 0.76, 0.27, 0.82, 0.42, 0.74, 0.535, 0.56, 0.552, 0.56],
  [-2.1, 0.2, 0.66, 0.86, 0.23, 0.92, 0.45, 0.84, 0.6, 0.62, 0.592, 0.6],
  [-1.95, 0.16, 0.68, 0.93, 0.22, 0.985, 0.48, 0.9, 0.69, 0.645, 0.632, 0.64],
  [-1.825, 0.15, 0.68, 0.97, 0.24, 1.01, 0.52, 0.915, 0.76, 0.655, 0.675, 0.685],
  [-1.585, 0.15, 0.68, 0.985, 0.24, 1.015, 0.52, 0.925, 0.855, 0.665, 0.7, 0.71],
  [-1.325, 0.15, 0.68, 0.99, 0.24, 1.015, 0.52, 0.925, 0.87, 0.675, 0.718, 0.728],
  [-1.05, 0.15, 0.68, 0.985, 0.24, 1.01, 0.52, 0.87, 0.775, 0.7, 0.752, 0.762],
  [-0.825, 0.15, 0.72, 0.97, 0.23, 1.0, 0.52, 0.875, 0.77, 0, 0, 0],
  [-0.4, 0.15, 0.74, 0.955, 0.21, 0.985, 0.5, 0.87, 0.772, 0, 0, 0],
  [0.1, 0.15, 0.74, 0.955, 0.21, 0.99, 0.5, 0.865, 0.78, 0, 0, 0],
  [0.55, 0.15, 0.74, 0.965, 0.22, 1.0, 0.52, 0.87, 0.8, 0.56, 0.985, 1.0],
  [0.825, 0.15, 0.7, 0.99, 0.24, 1.03, 0.53, 0.9, 0.83, 0.6, 0.965, 0.98],
  [1.065, 0.15, 0.68, 1.0, 0.24, 1.035, 0.54, 0.935, 0.875, 0.6, 0.95, 0.96],
  [1.325, 0.15, 0.68, 1.0, 0.24, 1.04, 0.54, 0.95, 0.89, 0.62, 0.93, 0.94],
  [1.585, 0.15, 0.68, 1.0, 0.24, 1.035, 0.55, 0.94, 0.88, 0.64, 0.905, 0.915],
  [1.825, 0.17, 0.7, 0.98, 0.26, 1.01, 0.56, 0.91, 0.85, 0.65, 0.88, 0.89],
  [2.05, 0.24, 0.68, 0.94, 0.28, 0.97, 0.58, 0.87, 0.82, 0.64, 0.855, 0.865],
  [2.2, 0.3, 0.62, 0.88, 0.32, 0.91, 0.6, 0.82, 0.8, 0.6, 0.835, 0.845],
];
const ARCH_TOP = 0.755;
const ARCH_IN = 0.62;

/** The wheel arch's top at z (a trapezoid: flat over the wheel, sloping down to the sill), or null. */
const archAt = (z: number, sill: number) => {
  for (const a of [AXLE_F, AXLE_R]) {
    const dz = Math.abs(z - a);
    if (dz < 0.26) return ARCH_TOP;
    if (dz < 0.5) return ARCH_TOP + (sill - ARCH_TOP) * ((dz - 0.26) / 0.24);
  }
  return null;
};
const isOpen = (z: number) => z > CANOPY_Z[0] + 1e-3 && z < CANOPY_Z[1] - 1e-3;

/** A station's half profile (x >= 0), bottom centre round the side to the top centre. */
const profile = (s: number[]): V2[] => {
  const [z, ub, ux, lx, ly, cx, cy0, sx, sy, tx, ty, my] = s;
  const arch = archAt(z, ly);
  const inArch = arch !== null && arch > ly + 0.005;
  const wy = inArch ? (arch as number) : ub + 0.002;
  const lowY = inArch ? (arch as number) : ly;
  const cy = Math.max(cy0, lowY + 0.04);
  return [
    [0, ub],
    [inArch ? ARCH_IN : ux, ub],
    [inArch ? ARCH_IN : ux, wy],
    [lx, lowY],
    [cx, cy],
    [sx, Math.max(sy, cy + 0.02)],
    [tx, ty],
    [0, my],
  ];
};

const BAND_MAT = ["under", "well", "well", "paint", "paint", "paint", "paint"] as const;

/** The body: lofted between the stations in flat facets; the canopy's opening left open. */
const bodyGeometry = () => {
  const out: Record<string, number[]> = { under: [], well: [], paint: [] };
  const P = ST.map(profile);
  const push = (key: string, a: V3, b: V3, c: V3) => out[key].push(...a, ...b, ...c);
  for (let i = 0; i < ST.length - 1; i++) {
    const za = ST[i][0];
    const zb = ST[i + 1][0];
    const open = isOpen(za) || isOpen(zb);
    for (let k = 0; k < 7; k++) {
      if (open && k >= 5) continue;
      for (const side of [1, -1]) {
        const a0: V3 = [side * P[i][k][0], P[i][k][1], za];
        const a1: V3 = [side * P[i][k + 1][0], P[i][k + 1][1], za];
        const b0: V3 = [side * P[i + 1][k][0], P[i + 1][k][1], zb];
        const b1: V3 = [side * P[i + 1][k + 1][0], P[i + 1][k + 1][1], zb];
        const key = BAND_MAT[k];
        if (side > 0) {
          push(key, a0, a1, b1);
          push(key, a0, b1, b0);
        } else {
          push(key, a0, b0, b1);
          push(key, a0, b1, a1);
        }
      }
    }
  }
  // the end caps: the nose fascia and the tail, fans from their middles
  const cap = (i: number, front: boolean) => {
    const z = ST[i][0];
    const half = P[i];
    const ring: V3[] = [];
    for (let k = 0; k < half.length; k++) ring.push([half[k][0], half[k][1], z]);
    for (let k = half.length - 2; k >= 1; k--) ring.push([-half[k][0], half[k][1], z]);
    const c: V3 = [0, ring.reduce((s, p) => s + p[1], 0) / ring.length, z];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      if (front) push("paint", c, b, a);
      else push("paint", c, a, b);
    }
  };
  cap(0, true);
  cap(ST.length - 1, false);
  const geos: Record<string, THREE.BufferGeometry> = {};
  for (const [k, v] of Object.entries(out)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    geos[k] = g;
  }
  return geos;
};

/** Height and half-width of the body's shoulder line at z (for fitting parts to it). */
export const shoulderAt = (z: number): V2 => {
  const P = ST.map(profile);
  for (let i = 0; i < ST.length - 1; i++) {
    if (z >= ST[i][0] && z <= ST[i + 1][0]) {
      const k = (z - ST[i][0]) / (ST[i + 1][0] - ST[i][0]);
      return [P[i][5][0] + (P[i + 1][5][0] - P[i][5][0]) * k, P[i][5][1] + (P[i + 1][5][1] - P[i][5][1]) * k];
    }
  }
  return [0.87, 0.8];
};

// the canopy: stations along z, each [base (the shoulder), roof edge, roof centre]
const CANOPY: [number, V2, V2][] = [
  [-1.05, [0.74, 0.756], [0.0, 0.764]],
  [-0.78, [0.74, 0.905], [0, 0.94]],
  [-0.42, [0.71, 1.04], [0, 1.09]],
  [-0.05, [0.67, 1.09], [0, 1.13]],
  [0.3, [0.63, 1.07], [0, 1.105]],
  [0.55, [0.56, 0.985], [0, 1.0]],
];

const canopyPoints = () =>
  CANOPY.map(([z, edge, ctr]) => {
    const [sx, sy] = shoulderAt(z);
    return { z, base: [sx, sy] as V2, edge, ctr };
  });

/** The canopy glass (outward winding), relative to its hinge. */
const canopyGeometry = () => {
  const pts = canopyPoints();
  const v: number[] = [];
  const H = CANOPY_HINGE;
  const p = (x: number, y: number, z: number): V3 => [x, y - H.y, z - H.z];
  const tri = (a: V3, b: V3, c: V3) => v.push(...a, ...b, ...c);
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i];
    const B = pts[i + 1];
    for (const s of [1, -1]) {
      // the side window (base to roof edge) and the roof half (edge to centre)
      const rows: [V2, V2][] = [
        [A.base, A.edge],
        [A.edge, A.ctr],
      ];
      const rowsB: [V2, V2][] = [
        [B.base, B.edge],
        [B.edge, B.ctr],
      ];
      for (let r = 0; r < 2; r++) {
        const a0 = p(s * rows[r][0][0], rows[r][0][1], A.z);
        const a1 = p(s * rows[r][1][0], rows[r][1][1], A.z);
        const b0 = p(s * rowsB[r][0][0], rowsB[r][0][1], B.z);
        const b1 = p(s * rowsB[r][1][0], rowsB[r][1][1], B.z);
        if (s > 0) {
          tri(a0, a1, b1);
          tri(a0, b1, b0);
        } else {
          tri(a0, b0, b1);
          tri(a0, b1, a1);
        }
      }
    }
  }
  // the front edge: from the shoulder at the cowl down to the hood's edge (a small triangle each side)
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
};

/** The canopy's frame: thin black strips along its creases (relative to the hinge). */
const canopyFrame = () => {
  const pts = canopyPoints();
  const H = CANOPY_HINGE;
  const lines: THREE.Vector3[][] = [];
  // the frame along the base (where the glass meets the body), and a thin spine down the roof
  for (const s of [1, -1]) lines.push(pts.map((q) => new THREE.Vector3(s * q.base[0], q.base[1] - H.y, q.z - H.z)));
  lines.push(pts.slice(2).map((q) => new THREE.Vector3(0, q.ctr[1] - H.y + 0.003, q.z - H.z)));
  return lines.map((l, i) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(l, false, "catmullrom", 0.05), 48, i >= 2 ? 0.005 : 0.012, 6, false));
};

/** A wheel: tyre with a squared shoulder, an aero cover in faceted spokes, the brake behind. */
const Wheel: React.FC<{ spin: number; side: number; width: number }> = ({ spin, side, width }) => {
  const g = useMemo(() => {
    const R = WHEEL_R;
    const w = width / 2;
    const prof: THREE.Vector2[] = [];
    // tyre cross-section (r, y): inner bead, sidewall, shoulder, tread, shoulder, sidewall
    const pts: V2[] = [
      [R - 0.11, -w + 0.01],
      [R - 0.06, -w],
      [R - 0.02, -w + 0.004],
      [R - 0.004, -w + 0.02],
      [R, -w + 0.04],
      [R, w - 0.04],
      [R - 0.004, w - 0.02],
      [R - 0.02, w - 0.004],
      [R - 0.06, w],
      [R - 0.11, w - 0.01],
    ];
    for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
    const tyre = new THREE.LatheGeometry(prof, 64);
    tyre.rotateZ(Math.PI / 2);
    // the aero cover: a shallow dish, and seven angular blades
    const dish = new THREE.CylinderGeometry(R - 0.105, R - 0.11, 0.03, 48);
    dish.rotateZ(Math.PI / 2);
    const blade = new THREE.BoxGeometry(0.018, 0.17, 0.052);
    blade.translate(0, 0.11, 0);
    const hub = new THREE.CylinderGeometry(0.05, 0.06, 0.035, 7);
    hub.rotateZ(Math.PI / 2);
    const disc = new THREE.CylinderGeometry(0.19, 0.19, 0.028, 40);
    disc.rotateZ(Math.PI / 2);
    const caliper = new THREE.BoxGeometry(0.06, 0.12, 0.09);
    return { tyre, dish, blade, hub, disc, caliper };
  }, [width]);
  const out = side * (width / 2 - 0.02);
  return (
    <group>
      <group rotation={[spin, 0, 0]}>
        <mesh geometry={g.tyre} material={M.tyre()} castShadow />
        <mesh geometry={g.dish} material={M.titanium()} position={[out - side * 0.012, 0, 0]} />
        {Array.from({ length: 7 }, (_, i) => (
          <group key={i} rotation={[(i / 7) * Math.PI * 2, 0, 0]}>
            <mesh geometry={g.blade} material={i % 2 ? M.titanium() : M.gloss()} position={[out + side * 0.006, 0, 0]} rotation={[0, 0, 0.0]} />
          </group>
        ))}
        <mesh geometry={g.hub} material={M.gloss()} position={[out + side * 0.012, 0, 0]} />
        <mesh geometry={g.disc} material={M.steel()} position={[-side * 0.02, 0, 0]} />
      </group>
      {/* the caliper doesn't turn */}
      <mesh geometry={g.caliper} material={mat("caliper", () => new THREE.MeshPhysicalMaterial({ color: "#C9A24A", metalness: 0.6, roughness: 0.3, clearcoat: 0.8 }))} position={[-side * 0.005, 0.12, 0.1]} rotation={[0.6, 0, 0]} />
    </group>
  );
};

/** "WHERE WE'RE GOING" across the tail (the invitation's line). */
const tailText = () =>
  canvasTex("tail-text", 1024, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(20,20,22,0.95)";
    g.font = "600 38px Montserrat, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "14px";
    g.fillText("WHERE WE'RE GOING", w / 2, h / 2);
  });

export type RoadsterParts = { exterior?: boolean; canopy?: boolean; interior?: React.ReactNode; lights?: number };

export const Roadster: React.FC<{ st: CarState; parts?: RoadsterParts; children?: React.ReactNode }> = ({ st, parts = {}, children }) => {
  const body = useMemo(bodyGeometry, []);
  const glass = useMemo(canopyGeometry, []);
  const frame = useMemo(canopyFrame, []);
  const sill = useMemo(() => {
    const zs: number[] = [];
    for (let z = CANOPY_Z[0] + 0.02; z <= CANOPY_Z[1] - 0.02; z += 0.08) zs.push(z);
    return [1, -1].map((sx) => {
      const pts = zs.map((z) => {
        const [x, y] = shoulderAt(z);
        return new THREE.Vector3(sx * (x - 0.03), y - 0.004, z);
      });
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.028, 6, false);
    });
  }, []);
  const lightK = parts.lights ?? 1;
  const susp = st.susp;
  const wing = st.wing;
  const canopyAng = -0.95 * st.canopy;
  // body roll and pitch from the g's (the suspension), only on the ground
  const onGround = st.pos.y < 0.03;
  const pitchG = onGround ? THREE.MathUtils.clamp(st.f.z * 0.0016, -0.03, 0.03) : 0;
  const rollG = onGround ? THREE.MathUtils.clamp(-st.f.x * 0.0015, -0.03, 0.03) : 0;
  const brake = st.brake;
  const tail = M.light("tail", "#FF1F1A", (2.2 + 4 * brake) * lightK);
  const bar = M.light("bar", "#F4F8FF", 4.5 * lightK);
  const head = M.light("head", "#FFFFFF", 7 * lightK);
  const exterior = parts.exterior !== false;
  return (
    <group position={st.pos} quaternion={st.quat}>
      {/* the wheels stay on their axles; the body rides on the suspension above them */}
      {exterior
        ? [AXLE_F, AXLE_R].map((z) =>
            [-1, 1].map((s) => (
              <group key={`${z}${s}`} position={[s * HALF_TRACK, WHEEL_R, z]} rotation={[0, z < 0 ? st.steer * 0.5 : 0, 0]}>
                <Wheel spin={-st.spin} side={s} width={z < 0 ? 0.29 : 0.33} />
              </group>
            )),
          )
        : null}
      <group position={[0, susp, 0]} rotation={[pitchG, 0, rollG]}>
        {exterior ? (
          <>
            <mesh geometry={body.paint} material={M.paint()} castShadow receiveShadow />
            <mesh geometry={body.under} material={M.carbon()} />
            <mesh geometry={body.well} material={M.well()} />
            {/* the nose: the light bar across, the hidden headlights at its ends, the black splitter */}
            <mesh material={bar} position={[0, 0.515, -2.2005]} scale={[1.3, 0.012, 0.01]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} material={head} position={[s * 0.68, 0.51, -2.19]} scale={[0.09, 0.026, 0.012]}>
                <boxGeometry args={[1, 1, 1]} />
              </mesh>
            ))}
            <mesh material={M.carbon()} position={[0, 0.3, -2.17]} scale={[1.44, 0.1, 0.12]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
            <mesh material={M.gloss()} position={[0, 0.405, -2.196]} scale={[0.95, 0.08, 0.01]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
            {/* the tail: the full-width light, the diffuser, the words */}
            <mesh material={tail} position={[0, 0.745, 2.198]} scale={[1.62, 0.028, 0.012]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
            <mesh material={M.gloss()} position={[0, 0.69, 2.199]} scale={[1.5, 0.06, 0.008]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
            <mesh position={[0, 0.69, 2.205]} scale={[0.9, 0.056, 1]}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial map={tailText()} transparent opacity={0.9} color="#E8E8EA" />
            </mesh>
            <mesh material={M.carbon()} position={[0, 0.37, 2.16]} scale={[1.5, 0.14, 0.12]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
            {[-0.6, -0.3, 0, 0.3, 0.6].map((x) => (
              <mesh key={x} material={M.carbon()} position={[x, 0.3, 2.12]} scale={[0.012, 0.12, 0.2]}>
                <boxGeometry args={[1, 1, 1]} />
              </mesh>
            ))}
            {/* the carbon sill along the cockpit's edge, both sides */}
            {sill.map((g, i) => (
              <mesh key={`sill${i}`} geometry={g} material={M.carbonIn()} />
            ))}
            {/* the hood's heat extractors: two shallow slotted vents */}
            {[-1, 1].map((sx) => (
              <group key={`hv${sx}`} position={[sx * 0.36, 0.0, -1.72]} rotation={[-0.085, 0, 0]}>
                <mesh material={M.gloss()} position={[0, 0.655, 0]} scale={[0.34, 0.006, 0.26]}>
                  <boxGeometry args={[1, 1, 1]} />
                </mesh>
                {[0, 1, 2, 3, 4].map((i) => (
                  <mesh key={i} material={M.carbon()} position={[0, 0.66, -0.1 + i * 0.05]} rotation={[0.5, 0, 0]} scale={[0.32, 0.004, 0.03]}>
                    <boxGeometry args={[1, 1, 1]} />
                  </mesh>
                ))}
              </group>
            ))}
            {/* the frunk's shut lines */}
            {[
              [0, 0.664, -2.05, 1.0, 0.004, 0.006],
              [0, 0.708, -1.22, 1.16, 0.004, 0.006],
            ].map(([x, y, z, sx, sy, sz], i) => (
              <mesh key={`pl${i}`} material={M.gloss()} position={[x, y, z]} rotation={[-0.08, 0, 0]} scale={[sx, sy, sz]}>
                <boxGeometry args={[1, 1, 1]} />
              </mesh>
            ))}
            {/* behind the front wheels: the side vents (three slats in a black inset) */}
            {[-1, 1].map((sx) => (
              <group key={`sv${sx}`} position={[sx * 1.0, 0.43, -0.7]} rotation={[0, sx * 0.04, 0]}>
                <mesh material={M.gloss()} scale={[0.012, 0.2, 0.3]}>
                  <boxGeometry args={[1, 1, 1]} />
                </mesh>
                {[0, 1, 2].map((i) => (
                  <mesh key={i} material={M.carbon()} position={[sx * 0.008, -0.06 + i * 0.06, 0]} rotation={[0, 0, sx * 0.4]} scale={[0.012, 0.012, 0.28]}>
                    <boxGeometry args={[1, 1, 1]} />
                  </mesh>
                ))}
              </group>
            ))}
            {/* the side camera pods (no mirrors) at the canopy's front corners */}
            {[-1, 1].map((sx) => (
              <group key={`cam${sx}`} position={[sx * 0.9, 0.79, -0.98]}>
                <mesh material={M.gloss()} scale={[0.07, 0.035, 0.09]}>
                  <boxGeometry args={[1, 1, 1]} />
                </mesh>
                <mesh material={M.light(`camLens`, "#3B5A8A", 0.6)} position={[sx * 0.036, 0, 0.0]} rotation={[0, sx * Math.PI / 2, 0]}>
                  <circleGeometry args={[0.009, 12]} />
                </mesh>
              </group>
            ))}
            {/* the thruster nozzles */}
            {THRUSTERS.map((t, i) => (
              <Nozzle key={i} at={t.at} dir={t.dir} glow={st.thr[i]} />
            ))}
            {/* the fans in the floor */}
            {[-0.55, 0.55].map((z) => (
              <Fan key={z} z={z} spin={st.spin * 0 + st.fan * 60} />
            ))}
            <Wing k={wing} />
          </>
        ) : null}
        {/* the canopy on its hinge at the cowl */}
        {parts.canopy !== false ? (
          <group position={CANOPY_HINGE} rotation={[canopyAng, 0, 0]}>
            <mesh geometry={glass} material={M.glassOut()} renderOrder={2} />
            <mesh geometry={glass} material={M.glassIn()} renderOrder={3} />
            {frame.map((f, i) => (
              <mesh key={i} geometry={f} material={M.gloss()} />
            ))}
          </group>
        ) : null}
        {parts.interior}
        {children}
      </group>
    </group>
  );
};

/** A thruster nozzle: a short bell, dark inside; frosts over when it's been firing. */
const Nozzle: React.FC<{ at: THREE.Vector3; dir: THREE.Vector3; glow: number }> = ({ at, dir, glow }) => {
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), [dir]);
  const geo = useMemo(() => {
    const bell = new THREE.CylinderGeometry(0.045, 0.026, 0.07, 20, 1, true);
    bell.translate(0, -0.035, 0);
    const ring = new THREE.TorusGeometry(0.046, 0.006, 6, 20);
    ring.rotateX(Math.PI / 2);
    return { bell, ring };
  }, []);
  const frost = mat("nozzle-frost", () => new THREE.MeshStandardMaterial({ color: "#DDE4EA", roughness: 0.6, metalness: 0.3 }));
  return (
    <group position={at} quaternion={q}>
      <mesh geometry={geo.bell} material={glow > 0.4 ? frost : M.nozzle()} position={[0, 0.035, 0]} />
      <mesh geometry={geo.ring} material={M.steel()} position={[0, 0.0, 0]} />
      <mesh material={M.well()} position={[0, 0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.04, 16]} />
      </mesh>
    </group>
  );
};

/** A fan in the floor (seen from below): a ring, a grille, the blades. */
const Fan: React.FC<{ z: number; spin: number }> = ({ z, spin }) => {
  const g = useMemo(() => {
    const ring = new THREE.TorusGeometry(0.3, 0.025, 8, 40);
    ring.rotateX(Math.PI / 2);
    const blade = new THREE.BoxGeometry(0.26, 0.008, 0.07);
    blade.translate(0.15, 0, 0);
    return { ring, blade };
  }, []);
  return (
    <group position={[0, 0.148, z]}>
      <mesh geometry={g.ring} material={M.titanium()} />
      <group rotation={[0, spin, 0]}>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} geometry={g.blade} material={M.gloss()} rotation={[0.35, (i / 9) * Math.PI * 2, 0]} />
        ))}
      </group>
      <mesh material={M.titanium()} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.06, 16]} />
      </mesh>
    </group>
  );
};

/** The active wing: flush in the deck, up on its pylons in Track Mode (angular endplates, carbon below). */
const Wing: React.FC<{ k: number }> = ({ k }) => {
  const plate = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.2, 0);
    s.lineTo(0.17, 0);
    s.lineTo(0.12, 0.14);
    s.lineTo(-0.14, 0.11);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  const lift = 0.26 * k;
  const y = 0.875;
  return (
    <group position={[0, y + lift, 1.86]} rotation={[0.1 * k, 0, 0]}>
      <mesh material={M.paint()} scale={[1.62, 0.028, 0.3]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh material={M.carbon()} position={[0, -0.016, 0.01]} scale={[1.6, 0.006, 0.28]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={plate} material={M.carbon()} position={[s * 0.81 + (s > 0 ? 0 : -0.012), -0.06 - 0.02 * (1 - k), -0.02]} scale={[1, 0.4 + 0.6 * k, 1]} />
      ))}
      {/* the pylons (only seen when it's up) */}
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} material={M.gloss()} position={[x, -lift / 2 - 0.01, 0.02]} scale={[0.02, lift + 0.02, 0.12]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
    </group>
  );
};
