import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { planksTex } from "../../home/materials";
import { DOOR, ROOM, WINDOWS } from "../layout";
import {
  GB,
  clamp01,
  cottonTex,
  envB,
  frostTex,
  geoB,
  haloB,
  hash3,
  mat,
  oakGrainTex,
  pineTex,
  plushTex,
  canvasWeaveTex,
  rainGlass,
  rand,
  snowBump,
  snowTex,
  stippleBump,
  sweep,
  sweepX,
  tubeCapped,
  withRepeat,
  type Prof,
} from "./texturesB";

/**
 * The house fabric (props set B): the six-panel interior door in its jamb and casings, the double-hung
 * front window (sashes, glass, rain and snow, curtains), the mouldings (casing, baseboard), and the hallway
 * pieces: the frosted ceiling dome, the plug-in nightlight, the banister, the pine garland with its string
 * lights, Moose's round dog bed and the floorboards. Metres, y up; each piece at its own origin (on the
 * floor or at its base), facing -z unless stated. Every cut face is capped; nothing interpenetrates where
 * it can be seen.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------- materials
/** Satin white trim and door paint (a fine roller stipple). */
export const satinWhite = (color = "#F3F1EA") =>
  mat(`b-satin-${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.18, clearcoatRoughness: 0.4, bumpMap: stippleBump(), bumpScale: 0.03 }));
export const brassB = () => mat("b-brass", () => new THREE.MeshStandardMaterial({ color: "#C9A057", metalness: 1, roughness: 0.27, envMap: envB(), envMapIntensity: 1.1 }));
const nickelB = () => mat("b-nickel", () => new THREE.MeshStandardMaterial({ color: "#C8C7C1", metalness: 1, roughness: 0.34, envMap: envB(), envMapIntensity: 1 }));
const oakRail = () =>
  mat("b-oakRail", () => new THREE.MeshPhysicalMaterial({ map: withRepeat(oakGrainTex("rail"), 2, 1), roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.28 }));
const whitePlastic = () => mat("b-whitePlastic", () => new THREE.MeshPhysicalMaterial({ color: "#F1EEE6", roughness: 0.36, clearcoat: 0.25, clearcoatRoughness: 0.3 }));
const darkVoid = () => mat("b-void", () => new THREE.MeshBasicMaterial({ color: "#070605" }));
/** Window glass: a faint tint (normal blending) plus its reflection (added on top, Fresnel-weighted). */
const glassTint = () =>
  mat("b-glassTint", () => new THREE.MeshPhysicalMaterial({ color: "#C9D6DC", roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }));
const glassRefl = (k: number) =>
  mat(
    `b-glassRefl-${Math.round(k * 20)}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#000000",
        roughness: 0.04,
        metalness: 0,
        envMap: envB(),
        envMapIntensity: 0.6 + 1.6 * k,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
  );
const snowMat = () =>
  mat("b-snowMat", () => new THREE.MeshPhysicalMaterial({ map: snowTex(), bumpMap: snowBump(), bumpScale: 0.08, color: "#FFFFFF", roughness: 0.78, sheen: 0.4, sheenColor: new THREE.Color("#DDE8FF") }));

// ======================================================================================= mouldings
/** Door and window casing: 65 mm, a bead on the inner edge, a flat slope, a step and a rounded back band
 * at the outer edge (a across from the inner edge, b out of the wall). */
const CASING_W = 0.065;
const CASING: Prof = [
  [0, 0],
  [CASING_W, 0],
  [CASING_W, 0.0125],
  [0.064, 0.0152],
  [0.0615, 0.0168],
  [0.058, 0.0175],
  [0.054, 0.0175],
  [0.0505, 0.0166],
  [0.0485, 0.0148],
  [0.047, 0.0138],
  [0.012, 0.0118],
  [0.009, 0.0122],
  [0.0065, 0.0126],
  [0.0035, 0.0122],
  [0.0012, 0.0108],
  [0, 0.0088],
];

/** The casing around an opening on a wall face: legs from y0 to the head, mitred. hw is the inner edge's
 * half width, h its height. face -1 projects toward -z (the default), +1 toward +z. */
const casingGeo = (hw: number, h: number, y0: number, face: -1 | 1, prof: Prof = CASING) =>
  geoB(`b-casing-${hw.toFixed(4)}-${h.toFixed(4)}-${y0.toFixed(4)}-${face}-${prof.length}`, () => {
    const pts = face < 0 ? [V(hw, y0), V(hw, h), V(-hw, h), V(-hw, y0)] : [V(-hw, y0), V(-hw, h), V(hw, h), V(hw, y0)];
    return sweep(pts, prof, V(0, 0, face), { caps: true, crease: 40 });
  });

export type DoorCasingProps = { w?: number; h?: number; y0?: number; reveal?: number; color?: string };
/**
 * Door (or window) casing on a wall face: built on z = 0 projecting toward -z, around an opening w wide
 * (centred on x = 0) whose head is at h; the legs run down to y0 (the floor). `reveal` sets the casing back
 * from the opening's edge. 65 x 17.5 mm, mitred at the head.
 */
export const DoorCasing: React.FC<DoorCasingProps> = ({ w = DOOR.x1 - DOOR.x0, h = DOOR.h, y0 = 0, reveal = 0.006, color }) => (
  <mesh geometry={casingGeo(w / 2 + reveal, h + reveal, y0, -1)} material={satinWhite(color)} castShadow receiveShadow />
);

/** Baseboard profile (a up, b out of the wall): a 110 mm board with an ogee cap and a rounded shoe. */
const BASE_PROF: Prof = [
  [0, 0],
  [0.111, 0],
  [0.111, 0.0032],
  [0.1095, 0.0058],
  [0.1065, 0.0072],
  [0.1035, 0.0078],
  [0.1005, 0.0092],
  [0.097, 0.0112],
  [0.0935, 0.0124],
  [0.089, 0.0128],
  [0.018, 0.0128],
  [0.014, 0.015],
  [0.01, 0.0172],
  [0.006, 0.018],
  [0.0025, 0.0172],
  [0.0006, 0.015],
  [0, 0.012],
];
export type BaseboardProps = { length: number; color?: string };
/** A baseboard along x (centred), back on z = 0, projecting toward -z, standing on the floor: 111 mm tall,
 * 18 mm deep at the shoe; square-cut, capped ends. */
export const Baseboard: React.FC<BaseboardProps> = ({ length, color }) => {
  const g = geoB(`b-baseboard-${length.toFixed(3)}`, () => sweep([V(length / 2, 0, 0), V(-length / 2, 0, 0)], BASE_PROF, V(0, 0, -1), { caps: true }));
  return <mesh geometry={g} material={satinWhite(color)} castShadow receiveShadow />;
};

// ======================================================================================= the door
const JAMB = 0.019;
const GAP = 0.003;
const FLOOR_GAP = 0.012;
const SLAB_T = 0.04;
const STOP_T = 0.012;
const STOP_W = 0.032;

/** The six-panel slab, its centre at the origin, faces on z = +-0.02: stiles and rails, raised panels with
 * a field and bevels, an applied ogee moulding round every panel, both faces. */
const slabGeo = (sw: number, sh: number) =>
  geoB(`b-slab-${sw.toFixed(4)}-${sh.toFixed(4)}`, () => {
    const t = SLAB_T / 2;
    const core = 0.008;
    const stile = 0.11;
    const mull = 0.1;
    const pw = (sw - 2 * stile - mull) / 2;
    const x0 = -sw / 2;
    const y0 = -sh / 2;
    // panel openings (slab coords from the bottom-left)
    const rows: [number, number][] = [
      [0.22, 0.78],
      [0.98, sh - 0.1 - 0.1 - 0.28],
      [sh - 0.1 - 0.28, sh - 0.1],
    ];
    const holes: [number, number, number, number][] = [];
    for (const [r0, r1] of rows)
      for (const c of [0, 1]) {
        const hx0 = stile + c * (pw + mull);
        holes.push([x0 + hx0, y0 + r0, x0 + hx0 + pw, y0 + r1]);
      }
    const parts: THREE.BufferGeometry[] = [];
    parts.push(new THREE.BoxGeometry(sw, sh, 2 * core));
    // the frame plates
    const shape = new THREE.Shape();
    shape.moveTo(x0, y0);
    shape.lineTo(x0 + sw, y0);
    shape.lineTo(x0 + sw, y0 + sh);
    shape.lineTo(x0, y0 + sh);
    shape.closePath();
    for (const [a, b, c, d] of holes) {
      const p = new THREE.Path();
      p.moveTo(a, b);
      p.lineTo(a, d);
      p.lineTo(c, d);
      p.lineTo(c, b);
      p.closePath();
      shape.holes.push(p);
    }
    for (const s of [1, -1]) {
      const f = new THREE.ExtrudeGeometry(shape, { depth: t - core, bevelEnabled: false });
      f.translate(0, 0, s > 0 ? core : -t);
      parts.push(f);
    }
    // raised panels (a field and four bevels) and the moulding round each opening
    const mould: Prof = [
      [0, 0],
      [0.011, 0],
      [0.0095, 0.0022],
      [0.007, 0.0032],
      [0.0045, 0.0045],
      [0.003, 0.0072],
      [0.0018, 0.0104],
      [0.0006, 0.0128],
      [0, 0.0132],
    ];
    for (const [a, b, c, d] of holes)
      for (const s of [1, -1]) {
        const gb = new GB();
        const inset = 0.009; // under the moulding
        const bev = 0.032;
        const zE = s * (core + 0.0005);
        const zF = s * (core + 0.0062);
        const O = [V(a + inset, b + inset, zE), V(c - inset, b + inset, zE), V(c - inset, d - inset, zE), V(a + inset, d - inset, zE)];
        const I = [V(a + inset + bev, b + inset + bev, zF), V(c - inset - bev, b + inset + bev, zF), V(c - inset - bev, d - inset - bev, zF), V(a + inset + bev, d - inset - bev, zF)];
        const out = V(0, 0, s);
        for (let k = 0; k < 4; k++) {
          const k2 = (k + 1) % 4;
          const n = O[k2].clone().sub(O[k]).cross(I[k].clone().sub(O[k])).normalize();
          if (n.z * s < 0) n.negate();
          const i0 = gb.v(O[k], n);
          const i1 = gb.v(O[k2], n);
          const i2 = gb.v(I[k2], n);
          const i3 = gb.v(I[k], n);
          gb.q(i0, i1, i2, i3, n);
        }
        const f = I.map((p) => gb.v(p, out, p.x, p.y));
        gb.q(f[0], f[1], f[2], f[3], out);
        // the panel's back, down on the core (hidden, but closes the solid)
        const bk = O.map((p) => gb.v(V(p.x, p.y, s * core), out.clone().negate()));
        gb.q(bk[0], bk[1], bk[2], bk[3], out.clone().negate());
        parts.push(gb.build());
        // moulding path: around the opening, at the core face, a toward the opening's centre
        const path = s > 0 ? [V(a, b, 0), V(c, b, 0), V(c, d, 0), V(a, d, 0)] : [V(a, b, 0), V(a, d, 0), V(c, d, 0), V(c, b, 0)];
        const m = sweep(path, mould, V(0, 0, s), { closed: true, crease: 50 });
        m.translate(0, 0, s * core);
        parts.push(m);
      }
    const norm = parts.map((p) => {
      const q = p.index ? p.toNonIndexed() : p;
      for (const k of Object.keys(q.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") q.deleteAttribute(k);
      return q;
    });
    const g = mergeGeometries(norm, false)!;
    g.computeBoundingSphere();
    return g;
  });

/** A turned door knob with its round rose, on +z (base at z = 0). */
const knobGeo = () =>
  geoB("b-knob", () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.031, 0],
      [0.031, 0.002],
      [0.029, 0.0055],
      [0.022, 0.008],
      [0.0095, 0.0105],
      [0.0085, 0.022],
      [0.0105, 0.03],
      [0.02, 0.039],
      [0.0265, 0.047],
      [0.028, 0.055],
      [0.0255, 0.062],
      [0.019, 0.0665],
      [0.009, 0.0685],
      [0, 0.069],
    ];
    const g = new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    );
    g.rotateX(Math.PI / 2);
    return g;
  });
const hingeKnuckle = () =>
  geoB("b-knuckle", () => {
    const pts: [number, number][] = [
      [0, -0.051],
      [0.003, -0.0505],
      [0.005, -0.048],
      [0.0055, -0.0445],
      [0.0055, 0.0445],
      [0.005, 0.048],
      [0.003, 0.0505],
      [0, 0.051],
    ];
    return new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      16,
    );
  });

export type DoorProps = {
  /** opening width (default DOOR.x1 - DOOR.x0 = 0.8) and head height (DOOR.h = 2.03) */
  w?: number;
  h?: number;
  /** wall thickness (ROOM.wallT) */
  wallT?: number;
  /** radians, 0 = shut (clamped to 0..1.6) */
  open?: number;
  /** the hinge jamb's side, -1 = -x, +1 = +x (local) */
  hinge?: -1 | 1;
  /** which way it swings: -1 toward -z (the side it faces), +1 toward +z */
  swing?: -1 | 1;
  color?: string;
  /** casings on both wall faces (default true) */
  casing?: boolean;
};

/**
 * An interior six-panel door hung in a jamb for a wallT wall: built at the opening's centre on the floor,
 * the wall's centre plane on z = 0, facing -z. The jamb, stops and head line the opening; the slab is the
 * opening less the jamb and a 3 mm gap (0.756 x 1.996 x 0.04 for the default 0.8 x 2.03 opening). Three
 * brass butt hinges on the hinge side; a brass knob (both faces) and latch. Casings (65 mm) on both faces,
 * their head's top at h + 0.071 (below a 2.1 m cut).
 */
export const Door: React.FC<DoorProps> = ({ w = DOOR.x1 - DOOR.x0, h = DOOR.h, wallT = ROOM.wallT, open = 0, hinge = 1, swing = -1, color, casing = true }) => {
  const T = wallT / 2;
  const sw = w - 2 * JAMB - 2 * GAP;
  const sh = h - JAMB - GAP - FLOOR_GAP;
  const theta = Math.min(1.6, Math.max(0, open));
  const paint = satinWhite(color);
  const brass = brassB();
  // built for a swing toward -z; mirrored in z for +z
  const zs0 = -T + 0.004; // the slab's -z face, shut
  const zc = zs0 + SLAB_T / 2;
  const hx = hinge * (w / 2 - JAMB - 0.001);
  const hz = zs0 - 0.006;
  const phi = -hinge * theta;
  const hingeYs = [FLOOR_GAP + 0.2, FLOOR_GAP + sh * 0.5 + 0.08, FLOOR_GAP + sh - 0.19];
  const latchX = -hinge * (sw / 2);
  const jambIn = w / 2 - JAMB;
  return (
    <group scale={[1, 1, swing > 0 ? -1 : 1]}>
      {/* the jamb */}
      {[-1, 1].map((s) => (
        <mesh key={`j${s}`} position={[s * (w / 2 - JAMB / 2), h / 2, 0]} material={paint} castShadow receiveShadow>
          <boxGeometry args={[JAMB, h, wallT]} />
        </mesh>
      ))}
      <mesh position={[0, h - JAMB / 2, 0]} material={paint} castShadow receiveShadow>
        <boxGeometry args={[w - 2 * JAMB, JAMB, wallT]} />
      </mesh>
      {/* the stops, against the slab's back face */}
      {[-1, 1].map((s) => (
        <mesh key={`s${s}`} position={[s * (jambIn - STOP_T / 2), (h - JAMB) / 2, zs0 + SLAB_T + STOP_W / 2]} material={paint} castShadow receiveShadow>
          <boxGeometry args={[STOP_T, h - JAMB, STOP_W]} />
        </mesh>
      ))}
      <mesh position={[0, h - JAMB - STOP_T / 2, zs0 + SLAB_T + STOP_W / 2]} material={paint} castShadow receiveShadow>
        <boxGeometry args={[2 * jambIn - 2 * STOP_T, STOP_T, STOP_W]} />
      </mesh>
      {/* the strike plate on the latch jamb */}
      <mesh position={[-hinge * (jambIn - 0.0006), FLOOR_GAP + 0.9 - 0.012, zc]} material={brass}>
        <boxGeometry args={[0.0012, 0.07, 0.028]} />
      </mesh>
      <mesh position={[-hinge * (jambIn - 0.0014), FLOOR_GAP + 0.9 - 0.012, zc]} material={darkVoid()}>
        <boxGeometry args={[0.0004, 0.022, 0.012]} />
      </mesh>
      {/* the casings */}
      {casing ? (
        <>
          <mesh geometry={casingGeo(jambIn + 0.006, h - JAMB + 0.006, 0, -1)} position={[0, 0, -T]} material={paint} castShadow receiveShadow />
          <mesh geometry={casingGeo(jambIn + 0.006, h - JAMB + 0.006, 0, 1)} position={[0, 0, T]} material={paint} castShadow receiveShadow />
        </>
      ) : null}
      {/* hinge knuckles and the jamb leaves */}
      {hingeYs.map((y, i) => (
        <group key={`h${i}`}>
          <mesh geometry={hingeKnuckle()} position={[hx, y, hz]} material={brass} castShadow />
          <mesh position={[hinge * (jambIn - 0.0006), y, hz + 0.0055 + 0.0115]} material={brass}>
            <boxGeometry args={[0.0012, 0.089, 0.023]} />
          </mesh>
        </group>
      ))}
      {/* the slab, on its hinge axis */}
      <group position={[hx, 0, hz]} rotation={[0, phi, 0]}>
        <group position={[-hx, 0, -hz]}>
          <mesh geometry={slabGeo(sw, sh)} position={[0, FLOOR_GAP + sh / 2, zc]} material={paint} castShadow receiveShadow />
          {/* knobs and roses, both faces */}
          {[-1, 1].map((s) => (
            <mesh
              key={`k${s}`}
              geometry={knobGeo()}
              position={[-hinge * (sw / 2 - 0.06), FLOOR_GAP + 0.9, zc + s * (SLAB_T / 2)]}
              scale={[1, 1, s]}
              material={brass}
              castShadow
            />
          ))}
          {/* the latch faceplate on the slab's free edge */}
          <mesh position={[latchX - hinge * 0.0005, FLOOR_GAP + 0.9, zc]} material={brass}>
            <boxGeometry args={[0.001, 0.058, 0.024]} />
          </mesh>
          <mesh position={[latchX - hinge * 0.00115, FLOOR_GAP + 0.9, zc]} material={darkVoid()}>
            <boxGeometry args={[0.0003, 0.014, 0.01]} />
          </mesh>
          {/* the slab's hinge leaves */}
          {hingeYs.map((y, i) => (
            <mesh key={`l${i}`} position={[hinge * (sw / 2 + 0.0006), y, hz + 0.0055 + 0.0105]} material={brass}>
              <boxGeometry args={[0.0012, 0.089, 0.021]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
};

// ======================================================================================= the window
const W_JAMB = 0.019;
const SASH_T = 0.035;
const STILE = 0.05;

type WinDims = {
  hw: number; // opening half width
  sill: number;
  head: number;
  T: number;
  inX: number; // jamb inner face (half)
  sashW: number;
  lower: [number, number]; // y range
  upper: [number, number];
  zL: [number, number];
  zU: [number, number];
  stoolTop: number;
  panes: { sash: "L" | "U"; x0: number; x1: number; y0: number; y1: number; zg: number; ledge: [number, number] }[];
};
const winDims = (w: number, sill: number, head: number, wallT: number): WinDims => {
  const T = wallT / 2;
  const hw = w / 2;
  const inX = hw - W_JAMB;
  const stoolTop = sill + 0.037;
  const headIn = head - W_JAMB;
  const sashW = 2 * inX - 0.002;
  const total = headIn - stoolTop;
  const lower: [number, number] = [stoolTop, stoolTop + total / 2 + 0.0125];
  const upper: [number, number] = [stoolTop + total / 2 - 0.0125, headIn];
  const zL: [number, number] = [-T + 0.017, -T + 0.017 + SASH_T];
  const zU: [number, number] = [zL[1] + 0.016, zL[1] + 0.016 + SASH_T];
  const panes: WinDims["panes"] = [];
  const mull = 0.02;
  const pw = (sashW - 2 * STILE - mull) / 2;
  for (const sash of ["L", "U"] as const) {
    const [y0, y1] = sash === "L" ? lower : upper;
    const zz = sash === "L" ? zL : zU;
    const bot = sash === "L" ? 0.075 : 0.035;
    const top = sash === "L" ? 0.035 : 0.05;
    for (const c of [0, 1]) {
      const x0 = -sashW / 2 + STILE + c * (pw + mull);
      panes.push({ sash, x0, x1: x0 + pw, y0: y0 + bot, y1: y1 - top, zg: (zz[0] + zz[1]) / 2, ledge: [(zz[0] + zz[1]) / 2, zz[1]] });
    }
  }
  return { hw, sill, head, T, inX, sashW, lower, upper, zL, zU, stoolTop, panes };
};

/** A sash: a frame plate with two lights (one muntin), softened edges; centred in x, y from y0 to y1. */
const sashGeo = (sw: number, y0: number, y1: number, bot: number, top: number) =>
  geoB(`b-sash-${sw.toFixed(4)}-${y0.toFixed(4)}-${y1.toFixed(4)}-${bot}-${top}`, () => {
    const bv = 0.0018;
    const s = new THREE.Shape();
    const x0 = -sw / 2 + bv;
    const x1 = sw / 2 - bv;
    s.moveTo(x0, y0 + bv);
    s.lineTo(x1, y0 + bv);
    s.lineTo(x1, y1 - bv);
    s.lineTo(x0, y1 - bv);
    s.closePath();
    const mull = 0.02;
    const pw = (sw - 2 * STILE - mull) / 2;
    for (const c of [0, 1]) {
      const a = -sw / 2 + STILE + c * (pw + mull) - bv;
      const b = a + pw + 2 * bv;
      const p = new THREE.Path();
      p.moveTo(a, y0 + bot - bv);
      p.lineTo(a, y1 - top + bv);
      p.lineTo(b, y1 - top + bv);
      p.lineTo(b, y0 + bot - bv);
      p.closePath();
      s.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: SASH_T - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 2 });
    g.translate(0, 0, -SASH_T / 2 + bv);
    return g;
  });

/** The interior stool: a notched board (horns on the wall face, a tongue into the opening), eased edges. */
const stoolGeo = (d: WinDims) =>
  geoB(`b-stool-${d.hw}-${d.sill}-${d.T}`, () => {
    const e = 0.0028;
    const zF = -d.T - 0.05;
    const zW = -d.T;
    const zB = d.zL[0] + 0.012;
    const hx = d.hw + CASING_W + 0.022;
    const s = new THREE.Shape();
    s.moveTo(-hx + e, zF + e);
    s.lineTo(hx - e, zF + e);
    s.lineTo(hx - e, zW - e);
    s.lineTo(d.inX - e, zW - e);
    s.lineTo(d.inX - e, zB - e);
    s.lineTo(-d.inX + e, zB - e);
    s.lineTo(-d.inX + e, zW - e);
    s.lineTo(-hx + e, zW - e);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.022 - 2 * e, bevelEnabled: true, bevelThickness: e, bevelSize: e, bevelSegments: 3, curveSegments: 2 });
    g.rotateX(Math.PI / 2);
    g.translate(0, d.stoolTop - e, 0);
    return g;
  });

/** The sloped sill through the frame and its exterior nose (with horns under the exterior trim). */
const sillGeo = (d: WinDims) =>
  geoB(`b-sill-${d.hw}-${d.sill}-${d.T}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    // inside the opening: from under the lower sash out to the wall face, sloping down 12 mm
    const zA = d.zL[0] + 0.006;
    const zB = d.T + 0.004;
    const yA = d.stoolTop - 0.004;
    const yB = d.sill + 0.026;
    const prof: Prof = [
      [d.sill, zA],
      [d.sill, zB],
      [yB, zB],
      [yA, zA],
    ];
    parts.push(sweepX(prof, -d.inX, d.inX, 10));
    // the nose: proud of the siding by 38 mm, its front rounded, a drip kerf underneath
    const z0 = d.T - 0.003;
    const z1 = d.T + 0.038;
    const yt0 = yB + 0.0012;
    const yt1 = yB - 0.004;
    const nose: Prof = [
      [d.sill - 0.012, z0],
      [d.sill - 0.012, z1 - 0.012],
      [d.sill - 0.009, z1 - 0.012],
      [d.sill - 0.009, z1 - 0.008],
      [d.sill - 0.012, z1 - 0.008],
      [d.sill - 0.012, z1 - 0.004],
      [d.sill - 0.009, z1 - 0.0005],
      [d.sill - 0.004, z1],
      [yt1 - 0.004, z1],
      [yt1 - 0.001, z1 - 0.002],
      [yt1, z1 - 0.005],
      [yt0, z0],
    ];
    parts.push(sweepX(nose, -(d.hw + 0.092 + 0.018), d.hw + 0.092 + 0.018, 30));
    return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  });

/** Snow lodged on a ledge against the glass: deep in both corners, shallow across the middle, a quarter
 * ellipse in section (z from the glass outward), its ends against the stiles. x from 0 to w. */
const snowFilletGeo = (w: number, depth: number, hMid: number, hCorner: number, seed: number) =>
  geoB(`b-snowFillet-${w.toFixed(4)}-${depth.toFixed(4)}-${hMid.toFixed(4)}-${hCorner.toFixed(4)}-${seed}`, () => {
    const nx = 40;
    const na = 10;
    const gb = new GB();
    const H = (x: number) => {
      const dd = Math.min(x, w - x);
      const n = 0.85 + 0.3 * hash3(Math.floor(x * 300), seed, 3);
      return hMid * n + (hCorner - hMid) * Math.exp(-dd / 0.028);
    };
    const D = (x: number) => depth * (0.92 + 0.08 * Math.exp(-Math.min(x, w - x) / 0.03));
    const ring: number[][] = [];
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx) * w;
      const r: number[] = [];
      for (let k = 0; k <= na; k++) {
        const a = (k / na) * (Math.PI / 2);
        const z = D(x) * Math.sin(a);
        const y = H(x) * Math.cos(a);
        const n = V(0, Math.cos(a) / H(x), Math.sin(a) / D(x)).normalize();
        r.push(gb.v(V(x, y, z), n, x * 4, k / na));
      }
      ring.push(r);
    }
    for (let i = 0; i < nx; i++) for (let k = 0; k < na; k++) gb.q(ring[i][k], ring[i + 1][k], ring[i + 1][k + 1], ring[i][k + 1]);
    // the base (on the ledge) and the back (against the glass)
    for (let i = 0; i < nx; i++) {
      const x0 = (i / nx) * w;
      const x1 = ((i + 1) / nx) * w;
      const b = [gb.v(V(x0, 0, 0), V(0, -1, 0)), gb.v(V(x1, 0, 0), V(0, -1, 0)), gb.v(V(x1, 0, D(x1)), V(0, -1, 0)), gb.v(V(x0, 0, D(x0)), V(0, -1, 0))];
      gb.q(b[0], b[1], b[2], b[3], V(0, -1, 0));
      const k = [gb.v(V(x0, 0, 0), V(0, 0, -1)), gb.v(V(x1, 0, 0), V(0, 0, -1)), gb.v(V(x1, H(x1), 0), V(0, 0, -1)), gb.v(V(x0, H(x0), 0), V(0, 0, -1))];
      gb.q(k[0], k[1], k[2], k[3], V(0, 0, -1));
    }
    // the ends
    for (const [i, nx0] of [
      [0, -1],
      [nx, 1],
    ] as const) {
      const x = (i / nx) * w;
      const c = gb.v(V(x, 0, 0), V(nx0, 0, 0));
      for (let k = 0; k < na; k++) {
        const a0 = (k / na) * (Math.PI / 2);
        const a1 = ((k + 1) / na) * (Math.PI / 2);
        const p0 = gb.v(V(x, H(x) * Math.cos(a0), D(x) * Math.sin(a0)), V(nx0, 0, 0));
        const p1 = gb.v(V(x, H(x) * Math.cos(a1), D(x) * Math.sin(a1)), V(nx0, 0, 0));
        gb.t(c, p0, p1, V(nx0, 0, 0));
      }
    }
    return gb.build();
  });

/** A rounded strip of snow on a surface y = base(z), from x0 to x1 and z0 to z1, tapering at the ends. */
const snowStripGeo = (key: string, x0: number, x1: number, z0: number, z1: number, base: (z: number) => number, thick: number, seed: number) =>
  geoB(`b-snowStrip-${key}-${thick.toFixed(4)}`, () => {
    const nx = 48;
    const nz = 10;
    const gb = new GB();
    const h = (u: number, v: number) => {
      const across = Math.pow(Math.max(0, 1 - (2 * v - 1) ** 2), 0.32);
      const along = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 8)), 0.4);
      const n = 0.82 + 0.36 * (0.5 + 0.5 * Math.sin(u * 37 + seed) * Math.sin(u * 13 + 2 * seed));
      return thick * across * along * n + 0.0006;
    };
    const top: number[][] = [];
    const P = (u: number, v: number) => {
      const z = z0 + (z1 - z0) * v;
      return V(x0 + (x1 - x0) * u, base(z) + h(u, v), z);
    };
    for (let i = 0; i <= nx; i++) {
      const r: number[] = [];
      for (let j = 0; j <= nz; j++) {
        const u = i / nx;
        const v = j / nz;
        const du = P(Math.min(1, u + 0.01), v).sub(P(Math.max(0, u - 0.01), v));
        const dv = P(u, Math.min(1, v + 0.02)).sub(P(u, Math.max(0, v - 0.02)));
        const n = dv.cross(du).normalize();
        if (n.y < 0) n.negate();
        r.push(gb.v(P(u, v), n, u * (x1 - x0) * 3, v * (z1 - z0) * 3));
      }
      top.push(r);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) gb.q(top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1], V(0, 1, 0));
    return gb.build();
  });

/** A rod-pocket curtain panel: folds across (more when gathered), deepening toward the hem; x from xa to xb. */
const curtainGeo = (xa: number, xb: number, yTop: number, yHem: number, amp: number, folds: number, seed: number) =>
  geoB(`b-curtain-${xa.toFixed(3)}-${xb.toFixed(3)}-${yTop.toFixed(3)}-${yHem.toFixed(3)}-${amp.toFixed(4)}-${folds}-${seed}`, () => {
    const nu = folds * 10;
    const nv = 24;
    const g = new THREE.PlaneGeometry(1, 1, nu, nv);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5;
      const v = pos.getY(i) + 0.5; // 1 at the top
      const x = xa + (xb - xa) * u;
      const y = yHem + (yTop - yHem) * v;
      const deep = 0.55 + 0.45 * (1 - v);
      const ph = seed * 1.3;
      const z = amp * deep * Math.sin(u * folds * Math.PI * 2 + ph) + 0.25 * amp * deep * Math.sin(u * folds * Math.PI * 4.1 + ph * 2);
      // the hem flares a little, and swings
      const flare = (1 - v) ** 3 * 0.012 * Math.sin(u * 3.1 + seed);
      pos.setXYZ(i, x, y, z + flare);
      uv.setXY(i, ((xb - xa) * u * (1 + 2 * amp / Math.max(0.05, (xb - xa) / folds))) / 0.25, ((yTop - yHem) * v) / 0.25);
    }
    g.computeVertexNormals();
    return g;
  });
const pocketGeo = (xa: number, xb: number, r: number, amp: number, folds: number, seed: number) =>
  geoB(`b-pocket-${xa.toFixed(3)}-${xb.toFixed(3)}-${r}-${amp.toFixed(4)}-${folds}-${seed}`, () => {
    const nx = folds * 10;
    const na = 14;
    const gb = new GB();
    const rows: number[][] = [];
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const x = xa + (xb - xa) * u;
      const zoff = 0.55 * amp * Math.sin(u * folds * Math.PI * 2 + seed * 1.3);
      const rr = r * (1 + 0.18 * Math.abs(Math.sin(u * folds * Math.PI * 2 + seed * 1.3)));
      const row: number[] = [];
      for (let k = 0; k <= na; k++) {
        const a = (k / na) * Math.PI * 2;
        const n = V(0, Math.sin(a), Math.cos(a));
        row.push(gb.v(V(x, Math.sin(a) * rr * 0.92, zoff + Math.cos(a) * rr), n, u * 6, k / na));
      }
      rows.push(row);
    }
    for (let i = 0; i < nx; i++) for (let k = 0; k < na; k++) gb.q(rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]);
    // gathered ends
    for (const [i, s] of [
      [0, -1],
      [nx, 1],
    ] as const) {
      const u = i / nx;
      const x = xa + (xb - xa) * u;
      const zoff = 0.55 * amp * Math.sin(u * folds * Math.PI * 2 + seed * 1.3);
      const c = gb.v(V(x + s * 0.004, 0, zoff), V(s, 0, 0));
      for (let k = 0; k < na; k++) gb.t(c, rows[i][k], rows[i][k + 1], V(s, 0, 0));
    }
    return gb.build(true);
  });

const fabricMat = (color: string) =>
  mat(`b-curtainFab-${color}`, () => new THREE.MeshPhysicalMaterial({ map: cottonTex("curtain", color, "plain"), roughness: 0.92, sheen: 0.5, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#FFFFFF"), 0.4), side: THREE.DoubleSide }));
const rainMat = (lvl: number, time: number) => {
  const tex = rainGlass(lvl, time);
  return mat(`b-rainMat-${Math.round(lvl * 10)}`, () => new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.08, metalness: 0, envMap: envB(), envMapIntensity: 1.2, side: THREE.DoubleSide }));
};
const rainPaneGeo = (w: number, h: number, ox: number, oy: number) =>
  geoB(`b-rainPane-${w.toFixed(4)}-${h.toFixed(4)}-${ox.toFixed(3)}-${oy.toFixed(3)}`, () => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ox + (uv.getX(i) * w) / 0.4, oy + (uv.getY(i) * h) / 0.6);
    return g;
  });

export type CurtainSpec = { color: string; /** 0 = drawn shut, 1 = open to the sides */ open?: number; length?: "sill" | "floor" };
export type WindowProps = {
  w?: number;
  sill?: number;
  head?: number;
  wallT?: number;
  /** 0..1 streaking droplets on the outside of the glass, animated by time (s) */
  rain?: number;
  time?: number;
  /** 0..1 snow lodged in the panes' bottom corners and along the sill and head outside */
  snowCorner?: number;
  /** null for none (the default), or fabric panels on a rod */
  curtains?: CurtainSpec | null;
  /** 0..1 how much the glass reflects */
  reflect?: number;
  /** varies the rain pattern per window */
  seed?: number;
  color?: string;
};

/**
 * A double-hung window for a wallT wall: built at the opening's centre on the floor, the wall's centre plane
 * on z = 0, the room side toward -z (the outside toward +z). The opening is w wide from sill to head
 * (defaults WINDOWS: 0.74, 0.82 to 1.98). Jambs, head, stops and parting beads; a sloped sill with a drip
 * nose outside; the interior stool with horns and an apron; two sashes with 2-over-2 lights (one muntin
 * each), the upper sash outside the lower; a brass sash lock on the meeting rails; glass with a faint tint
 * and a Fresnel reflection, seen from both sides. Interior casing (65 mm) up to 2.032 m; exterior flat trim
 * with a drip cap up to 2.07 m. Rain is an overlay outside each light; snow fillets sit on the outer ledges.
 * Curtains hang from a rod 8.5 cm proud of the wall at 2.075 m.
 */
export const Window: React.FC<WindowProps> = ({ w = WINDOWS.w, sill = WINDOWS.sill, head = WINDOWS.head, wallT = ROOM.wallT, rain = 0, time = 0, snowCorner = 0, curtains = null, reflect = 0.5, seed = 1, color }) => {
  const d = useMemo(() => winDims(w, sill, head, wallT), [w, sill, head, wallT]);
  const paint = satinWhite(color);
  const T = d.T;
  const tint = glassTint();
  const refl = glassRefl(reflect);
  const beads = useMemo(() => {
    // stops and beads along both jambs and the head: [z0, z1]
    const lines: [number, number][] = [
      [-T, d.zL[0] - 0.0015],
      [d.zL[1] + 0.0015, d.zU[0] - 0.0015],
      [d.zU[1] + 0.0015, d.zU[1] + 0.02],
    ];
    return lines;
  }, [T, d]);
  const headIn = d.head - W_JAMB;
  const sillTopAt = (z: number) => {
    const zA = d.zL[0] + 0.006;
    const zB = d.T + 0.004;
    const yA = d.stoolTop - 0.004;
    const yB = d.sill + 0.026;
    return yA + ((yB - yA) * (z - zA)) / (zB - zA);
  };
  const exW = 0.092;
  const exT = 0.022;
  const sn = clamp01(snowCorner);
  const rn = clamp01(rain);
  const cur = curtains;
  const cOpen = clamp01(cur?.open ?? 1);
  const rodY = 2.075;
  const rodZ = -T - 0.085;
  const rodX = d.hw + CASING_W + 0.1;
  return (
    <group>
      {/* jambs and head */}
      {[-1, 1].map((s) => (
        <mesh key={`j${s}`} position={[s * (d.hw - W_JAMB / 2), (d.sill + d.head) / 2, 0]} material={paint} castShadow receiveShadow>
          <boxGeometry args={[W_JAMB, d.head - d.sill, wallT]} />
        </mesh>
      ))}
      <mesh position={[0, d.head - W_JAMB / 2, 0]} material={paint} castShadow receiveShadow>
        <boxGeometry args={[2 * d.inX, W_JAMB, wallT]} />
      </mesh>
      {/* stops and parting beads (12 mm proud of the jambs and head) */}
      {beads.map(([z0, z1], i) => {
        const yb = sillTopAt(Math.min(z1, d.T)) - 0.002;
        return (
          <group key={`b${i}`}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * (d.inX - 0.006), (yb + headIn) / 2, (z0 + z1) / 2]} material={paint} castShadow receiveShadow>
                <boxGeometry args={[0.012, headIn - yb, z1 - z0]} />
              </mesh>
            ))}
            <mesh position={[0, headIn - 0.006, (z0 + z1) / 2]} material={paint} castShadow receiveShadow>
              <boxGeometry args={[2 * d.inX - 0.024, 0.012, z1 - z0]} />
            </mesh>
          </group>
        );
      })}
      {/* sill, stool, apron */}
      <mesh geometry={sillGeo(d)} material={paint} castShadow receiveShadow />
      <mesh geometry={stoolGeo(d)} material={paint} castShadow receiveShadow />
      <mesh
        geometry={geoB(`b-apron-${d.hw}`, () =>
          sweepX(
            [
              [0, 0],
              [0.075, 0],
              [0.075, -0.012],
              [0.008, -0.012],
              [0.004, -0.0112],
              [0.0012, -0.0085],
              [0, -0.005],
            ],
            -(d.hw + CASING_W - 0.004),
            d.hw + CASING_W - 0.004,
          ),
        )}
        position={[0, d.stoolTop - 0.022 - 0.075, -T]}
        material={paint}
        castShadow
        receiveShadow
      />
      {/* the sashes and their glass */}
      <mesh geometry={sashGeo(d.sashW, d.lower[0], d.lower[1], 0.075, 0.035)} position={[0, 0, (d.zL[0] + d.zL[1]) / 2]} material={paint} castShadow receiveShadow />
      <mesh geometry={sashGeo(d.sashW, d.upper[0], d.upper[1], 0.035, 0.05)} position={[0, 0, (d.zU[0] + d.zU[1]) / 2]} material={paint} castShadow receiveShadow />
      {d.panes.map((p, i) => {
        const pw = p.x1 - p.x0;
        const ph = p.y1 - p.y0;
        return (
          <group key={`p${i}`}>
            <mesh position={[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, p.zg]} material={tint} renderOrder={2}>
              <boxGeometry args={[pw + 0.006, ph + 0.006, 0.003]} />
            </mesh>
            <mesh position={[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, p.zg]} material={refl} renderOrder={3}>
              <boxGeometry args={[pw + 0.006, ph + 0.006, 0.003]} />
            </mesh>
            {rn > 0.01 ? (
              <mesh
                geometry={rainPaneGeo(pw, ph, hash3(seed, i, 1), hash3(seed, i, 2))}
                position={[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, p.zg + 0.0026]}
                material={rainMat(rn, time)}
                renderOrder={4}
              />
            ) : null}
            {sn > 0.01 ? (
              <mesh
                geometry={snowFilletGeo(pw, p.ledge[1] - p.ledge[0] + 0.002, 0.004 + 0.012 * sn, 0.01 + 0.05 * sn, seed * 7 + i)}
                position={[p.x0, p.y0, p.zg + 0.0016]}
                material={snowMat()}
                castShadow
                receiveShadow
              />
            ) : null}
          </group>
        );
      })}
      {/* the sash lock on the meeting rails, and two lifts on the lower sash */}
      <group position={[0, d.lower[1], 0]}>
        <mesh position={[0, 0.0015, d.zL[0] + 0.016]} material={brassB()} castShadow>
          <boxGeometry args={[0.05, 0.003, 0.02]} />
        </mesh>
        <mesh position={[0, 0.006, d.zL[0] + 0.019]} rotation={[0, 0, Math.PI / 2]} material={brassB()} castShadow>
          <cylinderGeometry args={[0.006, 0.0075, 0.03, 14]} />
        </mesh>
        <mesh position={[0.018, 0.012, d.zL[0] + 0.03]} rotation={[0, 0.5, 0]} material={brassB()} castShadow>
          <boxGeometry args={[0.022, 0.003, 0.009]} />
        </mesh>
      </group>
      <mesh position={[0, d.upper[0] + 0.035 + 0.002, d.zU[0] + 0.009]} material={brassB()} castShadow>
        <boxGeometry args={[0.04, 0.004, 0.012]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`lift${s}`} position={[s * 0.18, d.lower[0] + 0.035, d.zL[0] - 0.006]} rotation={[0, 0, Math.PI / 2]} material={brassB()} castShadow>
          <cylinderGeometry args={[0.007, 0.007, 0.03, 12, 1, false, 0, Math.PI]} />
        </mesh>
      ))}
      {/* interior casing (legs on the stool) */}
      <mesh geometry={casingGeo(d.inX + 0.005, headIn + 0.005, d.stoolTop, -1)} position={[0, 0, -T]} material={paint} castShadow receiveShadow />
      {/* exterior flat trim and the head's drip cap */}
      <group position={[0, 0, T]}>
        {[-1, 1].map((s) => (
          <mesh key={`ex${s}`} position={[s * (d.inX + 0.004 + exW / 2), (d.sill + 0.02 + headIn + exW) / 2, exT / 2]} material={paint} castShadow receiveShadow>
            <boxGeometry args={[exW, headIn + exW - d.sill - 0.02, exT]} />
          </mesh>
        ))}
        <mesh position={[0, headIn + 0.004 + exW / 2, exT / 2]} material={paint} castShadow receiveShadow>
          <boxGeometry args={[2 * (d.inX + 0.004), exW - 0.008, exT]} />
        </mesh>
        <mesh
          geometry={geoB(`b-dripcap-${d.inX}`, () =>
            sweepX(
              [
                [0, 0],
                [0.012, 0],
                [0.016, 0.034],
                [0.0135, 0.04],
                [0.006, 0.04],
                [0.004, 0.036],
                [0, 0.036],
              ],
              -(d.inX + 0.004 + exW + 0.01),
              d.inX + 0.004 + exW + 0.01,
            ),
          )}
          position={[0, headIn + 0.004 + exW, 0]}
          material={paint}
          castShadow
          receiveShadow
        />
      </group>
      {/* snow on the sill nose and the drip cap */}
      {sn > 0.01 ? (
        <>
          <mesh
            geometry={snowStripGeo(
              `sill-${d.hw}-${seed}`,
              -(d.hw + exW),
              d.hw + exW,
              d.T + exT + 0.001,
              d.T + 0.037,
              (z) => d.sill + 0.026 - 0.004 * ((z - d.T) / 0.038),
              0.006 + 0.03 * sn,
              seed,
            )}
            material={snowMat()}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={snowStripGeo(`sillIn-${d.hw}-${seed}`, -d.inX + 0.012, d.inX - 0.012, d.zU[1] + 0.022, d.T + exT - 0.002, (z) => sillTopAt(z) + 0.0004, 0.004 + 0.02 * sn, seed + 3)}
            material={snowMat()}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={snowStripGeo(`cap-${d.hw}-${seed}`, -(d.inX + exW + 0.012), d.inX + exW + 0.012, d.T + 0.002, d.T + 0.0395, (z) => headIn + 0.004 + exW + 0.036 * (0.02 + (z - d.T) * 0), 0.005 + 0.018 * sn, seed + 5)}
            material={snowMat()}
            castShadow
            receiveShadow
          />
        </>
      ) : null}
      {/* curtains */}
      {cur ? (
        <group>
          {[-1, 1].map((s) => (
            <group key={`br${s}`} position={[s * (rodX - 0.05), rodY, -T]}>
              <mesh position={[0, 0, -0.003]} material={nickelB()}>
                <boxGeometry args={[0.018, 0.04, 0.006]} />
              </mesh>
              <mesh position={[0, -0.004, -0.045]} rotation={[Math.PI / 2, 0, 0]} material={nickelB()} castShadow>
                <cylinderGeometry args={[0.004, 0.005, 0.078, 8]} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, rodY, rodZ]} rotation={[0, 0, Math.PI / 2]} material={nickelB()} castShadow>
            <cylinderGeometry args={[0.0095, 0.0095, 2 * rodX, 14]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={`fin${s}`} position={[s * (rodX + 0.016), rodY, rodZ]} material={nickelB()} castShadow>
              <sphereGeometry args={[0.018, 16, 12]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => {
            const inner = s * (0.012 + (rodX - 0.2) * cOpen);
            const outer = s * (rodX - 0.03);
            const xa = Math.min(inner, outer);
            const xb = Math.max(inner, outer);
            const span = xb - xa;
            const folds = 6;
            const amp = Math.min(0.022, 0.006 + (0.5 / Math.max(0.12, span)) * 0.0045);
            const hem = cur.length === "floor" ? 0.012 : d.stoolTop - 0.07;
            return (
              <group key={`c${s}`} position={[0, 0, rodZ]}>
                <mesh geometry={curtainGeo(xa, xb, rodY - 0.006, hem, amp, folds, s > 0 ? 2 : 5)} material={fabricMat(cur.color)} castShadow receiveShadow />
                <mesh geometry={pocketGeo(xa, xb, 0.019, amp, folds, s > 0 ? 2 : 5)} position={[0, rodY, 0]} material={fabricMat(cur.color)} castShadow receiveShadow />
              </group>
            );
          })}
        </group>
      ) : null}
    </group>
  );
};

// ======================================================================================= hallway: ceiling dome
const domeGeo = () =>
  geoB("b-dome", () => {
    // a shallow frosted bowl, 0.33 across, 0.105 deep; outer and inner skins and a rolled rim
    const outer: THREE.Vector2[] = [];
    const inner: THREE.Vector2[] = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * (Math.PI / 2);
      outer.push(new THREE.Vector2(0.165 * Math.cos(a) + 1e-4, -0.105 * Math.sin(a)));
      inner.push(new THREE.Vector2(0.159 * Math.cos(a) + 1e-4, -0.099 * Math.sin(a)));
    }
    const o = new THREE.LatheGeometry(outer.reverse(), 48);
    const ii = new THREE.LatheGeometry(inner, 48);
    // the rim: a flat ring between the skins
    const rim = new THREE.RingGeometry(0.159, 0.165, 48, 1);
    rim.rotateX(-Math.PI / 2);
    return mergeGeometries([o.toNonIndexed(), ii.toNonIndexed(), rim.toNonIndexed()], true)!;
  });
const panGeo = (cut: boolean) =>
  geoB(`b-pan-${cut}`, () => {
    // the canopy pan: a shallow drum 0.3 across, 0.03 deep; cut at the ceiling plane it shows a ring
    const pts: THREE.Vector2[] = cut
      ? [
          [0.15, 0.0],
          [0.152, -0.004],
          [0.153, -0.026],
          [0.149, -0.03],
          [0.143, -0.03],
          [0.146, -0.026],
          [0.146, -0.004],
          [0.144, 0],
        ].map(([r, y]) => new THREE.Vector2(r, y))
      : [
          [0, 0],
          [0.15, 0],
          [0.152, -0.004],
          [0.153, -0.026],
          [0.149, -0.03],
          [0.0, -0.03],
        ].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(cut ? [...pts, pts[0]] : pts, 48);
    return g;
  });
const bulbGeo = () =>
  geoB("b-a19", () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.0105, 0],
      [0.0115, 0.006],
      [0.0118, 0.02],
      [0.016, 0.03],
      [0.026, 0.046],
      [0.03, 0.062],
      [0.029, 0.076],
      [0.022, 0.088],
      [0.011, 0.095],
      [0, 0.097],
    ];
    return new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      20,
    );
  });

const domeMat = (on: number) =>
  mat(`b-domeMat-${Math.round(on * 20)}`, () => {
    const f = frostTex();
    return new THREE.MeshStandardMaterial({ color: "#EFEDE8", map: f, roughness: 0.55, emissive: new THREE.Color("#FFC889").multiplyScalar(0.05 + 2.6 * on), emissiveMap: f, side: THREE.DoubleSide });
  });
const bulbMat = (on: number) =>
  mat(`b-bulbMat-${Math.round(on * 20)}`, () => new THREE.MeshStandardMaterial({ color: "#F4F0E6", roughness: 0.3, emissive: new THREE.Color("#FFD9A6").multiplyScalar(0.02 + 7 * on), toneMapped: on < 0.05 }));
const haloMat = (color: string, k: number) =>
  mat(`b-haloMat-${color}-${Math.round(k * 50)}`, () => new THREE.SpriteMaterial({ map: haloB(), color: new THREE.Color(color).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));

export type CeilingFixtureProps = {
  /** 0..1 */
  on?: number;
  /** the dollhouse cut: the canopy pan is cut open at the ceiling plane so the camera above sees into the
   * glowing bowl and its two bulbs (default true); false closes the pan (its back to the camera) */
  cut?: boolean;
  /** a soft halo sprite (0 = none) */
  halo?: number;
  /** a warm point light under it at on = 1 (0 = none, the default; the film's own rig lights the hall) */
  light?: number;
};
/**
 * A flush-mount frosted dome (the hallway's ceiling light): built at the ceiling plane (its mount, y = 0),
 * hanging down 0.15 m: a brushed-nickel canopy pan 0.3 across, a frosted bowl 0.33 across with a nickel
 * finial, two warm A19 bulbs inside on porcelain sockets. 2700 K when on.
 */
export const CeilingFixture: React.FC<CeilingFixtureProps> = ({ on = 1, cut = true, halo = 0.6, light = 0 }) => {
  const k = clamp01(on);
  return (
    <group>
      <mesh geometry={panGeo(cut)} material={nickelB()} castShadow />
      {cut ? (
        // the crossbar and the sockets, seen from above inside the cut pan
        <>
          <mesh position={[0, -0.012, 0]} material={nickelB()}>
            <boxGeometry args={[0.27, 0.004, 0.022]} />
          </mesh>
          <mesh position={[0, -0.08, 0]} material={nickelB()}>
            <cylinderGeometry args={[0.0032, 0.0032, 0.136, 8]} />
          </mesh>
        </>
      ) : null}
      {[-1, 1].map((s) => (
        <mesh key={`bk${s}`} position={[s * 0.02, -0.027, 0]} material={nickelB()}>
          <boxGeometry args={[0.006, 0.03, 0.012]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.026, -0.042, 0]} rotation={[0, 0, -s * (Math.PI / 2 + 0.44)]}>
          <mesh position={[0, 0.012, 0]} material={whitePlastic()}>
            <cylinderGeometry args={[0.0135, 0.0135, 0.024, 14]} />
          </mesh>
          <mesh geometry={bulbGeo()} position={[0, 0.024, 0]} scale={0.8} material={bulbMat(k)} />
        </group>
      ))}
      <mesh geometry={domeGeo()} position={[0, -0.034, 0]} material={domeMat(k)} castShadow />
      <mesh position={[0, -0.034 - 0.105 - 0.008, 0]} material={nickelB()} castShadow>
        <sphereGeometry args={[0.011, 14, 10]} />
      </mesh>
      {halo > 0 && k > 0.01 ? <sprite position={[0, -0.08, 0]} scale={[0.75, 0.75, 1]} material={haloMat("#FFC27A", 0.55 * halo * k)} /> : null}
      {light > 0 && k > 0.01 ? <pointLight position={[0, -0.2, 0]} color="#FFC98A" intensity={light * k} distance={6} decay={1.6} /> : null}
    </group>
  );
};

// ======================================================================================= hallway: nightlight
const nlBodyGeo = () => geoB("b-nlBody", () => new RoundedBoxGeometry(0.058, 0.07, 0.024, 4, 0.009));
const nlLensGeo = () =>
  geoB("b-nlLens", () => {
    // a scalloped shell lens: a half dome with radial flutes, opening down and out
    const nu = 40;
    const nv = 12;
    const gb = new GB();
    const rows: number[][] = [];
    for (let i = 0; i <= nu; i++) {
      const a = (i / nu) * Math.PI; // around (0..pi = left to right over the top)
      const row: number[] = [];
      for (let j = 0; j <= nv; j++) {
        const b = (j / nv) * (Math.PI / 2); // 0 at the rim, pi/2 at the crown
        const flute = 1 + 0.06 * Math.cos(a * 14) * Math.cos(b);
        const R = 0.026 * flute;
        const x = -Math.cos(a) * R * Math.cos(b);
        const y = Math.sin(a) * R * Math.cos(b) * 0.8;
        const z = 0.016 * Math.sin(b) * flute;
        row.push(gb.v(V(x, y, z), V(x, y / 0.8, z / 0.6).normalize(), i / nu, j / nv));
      }
      rows.push(row);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) gb.q(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
    // the flat back (against the body)
    const c = gb.v(V(0, 0, 0), V(0, 0, -1));
    for (let i = 0; i < nu; i++) gb.t(c, rows[i][0], rows[i + 1][0], V(0, 0, -1));
    const b0 = gb.v(V(-0.026, 0, 0), V(0, -1, 0));
    const b1 = gb.v(V(0.026, 0, 0), V(0, -1, 0));
    const t0 = gb.v(V(0, 0, 0.016), V(0, -1, 0));
    gb.t(b0, b1, t0, V(0, -1, 0));
    // the underside of the dome is open at y = 0 (the half below the hinge line): close it with a fan
    const fan = Array.from({ length: nv + 1 }, (_, j) => {
      const b = (j / nv) * (Math.PI / 2);
      return [gb.v(V(-0.026 * Math.cos(b), 0, 0.016 * Math.sin(b)), V(0, -1, 0)), gb.v(V(0.026 * Math.cos(b), 0, 0.016 * Math.sin(b)), V(0, -1, 0))];
    });
    for (let j = 0; j < nv; j++) gb.q(fan[j][0], fan[j][1], fan[j + 1][1], fan[j + 1][0], V(0, -1, 0));
    return gb.build(true);
  });
const nlLensMat = (on: number) =>
  mat(`b-nlLens-${Math.round(on * 20)}`, () => new THREE.MeshStandardMaterial({ color: "#F6EBD8", roughness: 0.45, emissive: new THREE.Color("#FFA54F").multiplyScalar(0.03 + 3.2 * on), toneMapped: on < 0.05 }));
const plateGeo = () => geoB("b-plate", () => new RoundedBoxGeometry(0.07, 0.115, 0.0055, 3, 0.0022));

export type HallNightlightProps = { on?: number; /** the outlet's centre height (m) */ h?: number; halo?: number; light?: number };
/**
 * A plug-in nightlight in a duplex outlet: built on the wall face (z = 0) at the floor below it, projecting
 * toward -z; the outlet plate centred at height h (0.3). A white body in the lower receptacle with a fluted
 * shell lens glowing 2400 K, a light-sensor eye on top; the upper receptacle stays visible.
 */
export const HallNightlight: React.FC<HallNightlightProps> = ({ on = 1, h = 0.3, halo = 0.5, light = 0 }) => {
  const k = clamp01(on);
  return (
    <group position={[0, h, 0]}>
      <mesh geometry={plateGeo()} position={[0, 0, -0.00275]} material={whitePlastic()} castShadow receiveShadow />
      {/* the upper receptacle face and its slots */}
      <mesh position={[0, 0.0195, -0.0062]} material={whitePlastic()}>
        <boxGeometry args={[0.034, 0.029, 0.0016]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.0064, 0.022, -0.0071]} material={darkVoid()}>
          <boxGeometry args={[0.0019, s < 0 ? 0.0079 : 0.0064, 0.0003]} />
        </mesh>
      ))}
      <mesh position={[0, 0.011, -0.0071]} material={darkVoid()}>
        <boxGeometry args={[0.0042, 0.0034, 0.0003]} />
      </mesh>
      {/* the nightlight over the lower receptacle */}
      <mesh geometry={nlBodyGeo()} position={[0, -0.03, -0.0055 - 0.012]} material={whitePlastic()} castShadow />
      <mesh position={[0, 0.0045, -0.024]} rotation={[Math.PI / 2, 0, 0]} material={darkVoid()}>
        <cylinderGeometry args={[0.0026, 0.0026, 0.0012, 12]} />
      </mesh>
      <mesh geometry={nlLensGeo()} position={[0, -0.042, -0.0295]} rotation={[0, Math.PI, 0]} scale={[1, -1, 1]} material={nlLensMat(k)} />
      {halo > 0 && k > 0.01 ? <sprite position={[0, -0.05, -0.05]} scale={[0.35, 0.35, 1]} material={haloMat("#FFA54F", 0.5 * halo * k)} /> : null}
      {light > 0 && k > 0.01 ? <pointLight position={[0, -0.05, -0.08]} color="#FFA54F" intensity={light * k} distance={3} decay={1.5} /> : null}
    </group>
  );
};

// ======================================================================================= hallway: banister
/** The handrail (a up, b across): a rounded top over a cove neck, 68 mm wide, 58 mm tall. */
const RAIL_PROF: Prof = (() => {
  const N = 16;
  const top: Prof = [];
  // the half ellipse over the crown, from b = +0.034 back to b = -0.034
  for (let i = 0; i <= N; i++) {
    const t = Math.PI - (i / N) * Math.PI;
    top.push([0.036 + 0.022 * Math.sin(t), -0.034 * Math.cos(t)]);
  }
  return [[0, -0.022], [0, 0.022], [0.006, 0.022], [0.011, 0.0185], [0.016, 0.0182], [0.021, 0.026], [0.028, 0.0332], ...top, [0.028, -0.0332], [0.021, -0.026], [0.016, -0.0182], [0.011, -0.0185], [0.006, -0.022]];
})();
export const RAIL = { w: 0.068, h: 0.058 };
const balusterGeo = (top: number) =>
  geoB(`b-baluster-${top.toFixed(3)}`, () => {
    const sq = 0.034;
    const parts: THREE.BufferGeometry[] = [];
    const b0 = new RoundedBoxGeometry(sq, 0.15, sq, 2, 0.003);
    b0.translate(0, 0.03 + 0.075, 0);
    parts.push(b0);
    const y0 = 0.18;
    const y1 = top - 0.14;
    const L = y1 - y0;
    const prof: [number, number][] = [
      [0.0, 0],
      [0.017, 0],
      [0.0175, 0.006],
      [0.012, 0.016],
      [0.0135, 0.03],
      [0.0105, 0.05],
      [0.0095, 0.08],
      [0.0125, 0.14],
      [0.015, 0.2],
      [0.0145, 0.26],
      [0.0115, 0.32],
      [0.0095, 0.38],
      [0.009, L - 0.05],
      [0.0125, L - 0.032],
      [0.011, L - 0.018],
      [0.0175, L - 0.006],
      [0.017, L],
      [0, L],
    ];
    const lathe = new THREE.LatheGeometry(
      prof.map(([r, y]) => new THREE.Vector2(r, y0 + y)),
      12,
    );
    parts.push(lathe.toNonIndexed());
    const b1 = new RoundedBoxGeometry(sq, 0.14 + 0.004, sq, 2, 0.003);
    b1.translate(0, y1 + 0.07 + 0.002, 0);
    parts.push(b1);
    return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  });
const newelGeo = () =>
  geoB("b-newel", () => {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, y: number) => {
      g.translate(0, y, 0);
      parts.push(g.index ? g.toNonIndexed() : g);
    };
    add(new RoundedBoxGeometry(0.105, 0.22, 0.105, 2, 0.004), 0.11);
    add(new RoundedBoxGeometry(0.115, 0.03, 0.115, 2, 0.005), 0.235);
    add(new RoundedBoxGeometry(0.09, 0.73, 0.09, 2, 0.004), 0.25 + 0.365);
    add(new RoundedBoxGeometry(0.108, 0.03, 0.108, 2, 0.005), 0.995);
    return mergeGeometries(parts, false)!;
  });
const newelCapGeo = () =>
  geoB("b-newelCap", () => {
    const parts: THREE.BufferGeometry[] = [];
    const c = new RoundedBoxGeometry(0.13, 0.036, 0.13, 3, 0.008);
    c.translate(0, 1.01 + 0.018, 0);
    parts.push(c.toNonIndexed());
    // a low chamfered pyramid on top
    const p = new THREE.CylinderGeometry(0.012, 0.075, 0.05, 4, 1);
    p.rotateY(Math.PI / 4);
    p.translate(0, 1.046 + 0.025, 0);
    parts.push(p.toNonIndexed());
    return mergeGeometries(parts, false)!;
  });

export type BanisterProps = {
  length: number;
  /** newel posts at the ends: both (default), start (-x), end (+x), none */
  newels?: "both" | "start" | "end" | "none";
  /** the handrail's top (0.92) */
  height?: number;
  /** pine garland and warm lights wound along the rail */
  garland?: { on: number; seed?: number } | null;
  color?: string;
};
/**
 * A banister along x (centred), on the floor: an oak handrail (a rounded 68 mm top) at `height`, white
 * turned balusters at 105 mm centres on a shoe rail, square newel posts (base, shaft, collar) with oak caps
 * and a chamfered top. The rail's ends die into the newels.
 */
export const Banister: React.FC<BanisterProps> = ({ length, newels = "both", height = 0.92, garland = null, color }) => {
  const paint = satinWhite(color);
  const nA = newels === "both" || newels === "start";
  const nB = newels === "both" || newels === "end";
  const xa = -length / 2 + (nA ? 0.0525 : 0);
  const xb = length / 2 - (nB ? 0.0525 : 0);
  const railA = xa + (nA ? 0.03 : 0);
  const railB = xb - (nB ? 0.03 : 0);
  const balA = xa + (nA ? 0.045 + 0.06 : 0.05);
  const balB = xb - (nB ? 0.045 + 0.06 : 0.05);
  const n = Math.max(1, Math.round((balB - balA) / 0.105));
  const geo = useMemo(() => {
    const g = balusterGeo(height - RAIL.h + 0.004);
    const all: THREE.BufferGeometry[] = [];
    for (let i = 0; i <= n; i++) {
      const c = g.clone();
      c.translate(balA + ((balB - balA) * i) / n, 0, 0);
      all.push(c);
    }
    return mergeGeometries(all, false)!;
  }, [height, n, balA, balB]);
  const rail = geoB(`b-rail-${railA.toFixed(3)}-${railB.toFixed(3)}`, () => sweep([V(railA, 0, 0), V(railB, 0, 0)], RAIL_PROF, V(0, 0, 1), { caps: true, crease: 35 }));
  return (
    <group>
      <mesh geometry={geo} material={paint} castShadow receiveShadow />
      <mesh geometry={rail} position={[0, height - RAIL.h, 0]} material={oakRail()} castShadow receiveShadow />
      <mesh position={[(xa + xb) / 2, 0.015, 0]} material={paint} castShadow receiveShadow>
        <boxGeometry args={[xb - xa - (nA ? 0.05 : 0) - (nB ? 0.05 : 0), 0.03, 0.07]} />
      </mesh>
      {[nA ? -length / 2 + 0.0525 : null, nB ? length / 2 - 0.0525 : null].map((x, i) =>
        x === null ? null : (
          <group key={i} position={[x, 0, 0]}>
            <mesh geometry={newelGeo()} material={paint} castShadow receiveShadow />
            <mesh geometry={newelCapGeo()} material={oakRail()} castShadow receiveShadow />
          </group>
        ),
      )}
      {garland ? (
        <group position={[(railA + railB) / 2, height, 0]}>
          <PineGarland length={railB - railA - 0.02} on={garland.on} seed={garland.seed} />
        </group>
      ) : null}
    </group>
  );
};

// ======================================================================================= hallway: garland
type GarlandBuild = { needles: THREE.BufferGeometry; core: THREE.BufferGeometry; wire: THREE.BufferGeometry; bulbs: THREE.Vector3[]; bulbDirs: THREE.Vector3[]; cones: { p: THREE.Vector3; d: THREE.Vector3 }[] };
const garlandBuild = (L: number, seed: number, railW: number, railH: number) =>
  geoB(`b-garland-${L.toFixed(3)}-${seed}-${railW}-${railH}`, () => {
    const cy = -railH / 2; // the rail's centre line, below the origin (the rail's top)
    const rc = 0.02;
    const R = Math.hypot(railW / 2, railH / 2) + rc + 0.006;
    const pitch = 0.62;
    const psiMax = (68 * Math.PI) / 180;
    const corePt = (x: number) => {
      const psi = psiMax * Math.sin((2 * Math.PI * x) / pitch + seed);
      return V(x, cy + R * Math.cos(psi), R * Math.sin(psi));
    };
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: Math.ceil(L / 0.02) + 1 }, (_, i) => corePt(-L / 2 + (i * L) / Math.ceil(L / 0.02))));
    const core = tubeCapped(curve, rc, Math.ceil(L / 0.012), 8);
    // the light string: a different sway, a little further out
    const R2 = R + 0.014;
    const wirePt = (x: number) => {
      const psi = psiMax * 1.05 * Math.sin((2 * Math.PI * x) / (pitch * 0.77) + seed * 2 + 1.3);
      return V(x, cy + R2 * Math.cos(psi), R2 * Math.sin(psi));
    };
    const wCurve = new THREE.CatmullRomCurve3(Array.from({ length: Math.ceil(L / 0.02) + 1 }, (_, i) => wirePt(-L / 2 + 0.01 + (i * (L - 0.02)) / Math.ceil(L / 0.02))));
    const wire = tubeCapped(wCurve, 0.0013, Math.ceil(L / 0.01), 5);
    const bulbs: THREE.Vector3[] = [];
    const bulbDirs: THREE.Vector3[] = [];
    const nb = Math.floor(L / 0.085);
    for (let i = 0; i < nb; i++) {
      const u = (i + 0.5) / nb;
      const p = wCurve.getPointAt(u);
      const out = V(0, p.y - cy, p.z).normalize();
      bulbs.push(p.clone().addScaledVector(out, 0.008));
      bulbDirs.push(out);
    }
    const bulbC = bulbs.map((b, i) => b.clone().addScaledVector(bulbDirs[i], 0.009));
    const r = rand(seed * 101 + 7);
    const cones: { p: THREE.Vector3; d: THREE.Vector3 }[] = [];
    for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.55 + r() * 0.25) {
      const c = corePt(x);
      const ang = (r() - 0.5) * 1.6;
      const d = V(0, Math.cos(ang), Math.sin(ang) * (c.z > 0 ? 1 : -1)).normalize();
      cones.push({ p: c.clone().addScaledVector(d, rc + 0.012), d });
    }
    // needles: rings of blades swept forward, kept out of the rail, from under it, the bulbs and the cones
    const blocked = (p: THREE.Vector3) => {
      const ry = p.y - cy;
      if (Math.abs(ry) < railH / 2 + 0.004 && Math.abs(p.z) < railW / 2 + 0.004) return true;
      if (ry < -railH / 2 + 0.006 && Math.abs(p.z) < 0.03) return true;
      for (const b of bulbC) if (Math.abs(b.x - p.x) < 0.025 && b.distanceToSquared(p) < 0.0135 * 0.0135) return true;
      for (const c of cones) if (Math.abs(c.p.x - p.x) < 0.05 && c.p.distanceToSquared(p) < 0.024 * 0.024) return true;
      return false;
    };
    const pos: number[] = [];
    const col: number[] = [];
    const nor: number[] = [];
    const step = 0.0085;
    const per = 15;
    for (let x = -L / 2 + 0.01; x < L / 2 - 0.01; x += step) {
      const c = curve.getPointAt(Math.min(1, Math.max(0, (x + L / 2) / L)));
      const T = curve.getTangentAt(Math.min(1, Math.max(0, (x + L / 2) / L)));
      const n1 = V(0, 1, 0).sub(T.clone().multiplyScalar(T.y)).normalize();
      const n2 = T.clone().cross(n1).normalize();
      for (let j = 0; j < per; j++) {
        const a = (j / per) * Math.PI * 2 + r() * 0.6;
        const radial = n1.clone().multiplyScalar(Math.cos(a)).addScaledVector(n2, Math.sin(a));
        const fwd = 0.45 + r() * 0.5;
        const dir = radial.clone().multiplyScalar(Math.cos(fwd)).addScaledVector(T, Math.sin(fwd) * (r() < 0.85 ? 1 : -1)).normalize();
        const len = 0.032 + r() * 0.03;
        const base = c.clone().addScaledVector(radial, rc * 0.55);
        const tip = base.clone().addScaledVector(dir, len);
        // droop toward the ground a little
        tip.y -= len * 0.18 * r();
        let bad = false;
        for (let s = 0; s <= 4 && !bad; s++) bad = blocked(base.clone().lerp(tip, s / 4));
        if (bad) continue;
        const side = dir.clone().cross(radial).normalize();
        const wB = 0.0016 + r() * 0.0008;
        const wT = 0.0006;
        const v0 = base.clone().addScaledVector(side, -wB);
        const v1 = base.clone().addScaledVector(side, wB);
        const v2 = tip.clone().addScaledVector(side, wT);
        const v3 = tip.clone().addScaledVector(side, -wT);
        const nn = side.clone().cross(dir).normalize();
        const g0 = 0.05 + r() * 0.05;
        const g1 = 0.13 + r() * 0.12;
        const shadeB: [number, number, number] = [0.012, g0, 0.02 + r() * 0.012];
        const shadeT: [number, number, number] = [0.03 + r() * 0.03, g1, 0.04 + r() * 0.04];
        for (const [p, cc] of [
          [v0, shadeB],
          [v1, shadeB],
          [v2, shadeT],
          [v0, shadeB],
          [v2, shadeT],
          [v3, shadeT],
        ] as [THREE.Vector3, [number, number, number]][]) {
          pos.push(p.x, p.y, p.z);
          col.push(cc[0], cc[1], cc[2]);
          nor.push(nn.x, nn.y, nn.z);
        }
      }
    }
    const needles = new THREE.BufferGeometry();
    needles.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    needles.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    needles.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    needles.computeBoundingSphere();
    const out = new THREE.BufferGeometry();
    out.userData = { needles, core, wire, bulbs, bulbDirs, cones } as GarlandBuild;
    return out;
  }).userData as GarlandBuild;

const needleMat = () => mat("b-needles", () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
const coreMat = () => mat("b-pineCore", () => new THREE.MeshStandardMaterial({ map: pineTex(), roughness: 0.85 }));
const wireMat = () => mat("b-wire", () => new THREE.MeshStandardMaterial({ color: "#1E3A22", roughness: 0.5 }));
const miniBulbGeo = () =>
  geoB("b-miniBulb", () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.0034, 0],
      [0.0036, 0.004],
      [0.0042, 0.0075],
      [0.0042, 0.012],
      [0.0034, 0.0155],
      [0.0018, 0.0175],
      [0, 0.018],
    ];
    return new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      10,
    );
  });
const miniSocketGeo = () => geoB("b-miniSocket", () => new THREE.CylinderGeometry(0.0034, 0.003, 0.008, 8).translate(0, -0.004, 0));
const warmBulbMat = (on: number) =>
  mat(`b-warmBulb-${Math.round(on * 20)}`, () => new THREE.MeshStandardMaterial({ color: "#FFF1D6", roughness: 0.2, emissive: new THREE.Color("#FFB062").multiplyScalar(0.02 + 9 * on), toneMapped: on < 0.05, transparent: on < 0.05, opacity: on < 0.05 ? 0.85 : 1 }));
const coneGeo = () =>
  geoB("b-pinecone", () => {
    // a pine cone: stacked scale rings on a lathe envelope (scales as notched bulges)
    const pts: THREE.Vector2[] = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const env = Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.013 * (1 - 0.3 * t);
      const notch = 1 + 0.18 * Math.max(0, Math.sin(t * Math.PI * 14));
      pts.push(new THREE.Vector2(Math.max(1e-4, env * notch), t * 0.045));
    }
    return new THREE.LatheGeometry(pts, 14);
  });
const coneMat = () => mat("b-coneMat", () => new THREE.MeshStandardMaterial({ color: "#6A4426", roughness: 0.8 }));

export type PineGarlandProps = { length: number; on?: number; seed?: number; rail?: { w: number; h: number }; halo?: number };
/**
 * A pine garland wound along a handrail with a string of warm mini lights: built along x (centred) with the
 * origin on the rail's top centre line (the rail's section below it, `rail`, default the Banister's). The
 * garland sways over the rail top and down its sides (never under it, clear of the balusters): a dense
 * needled core, blades swept along it, a few cones; the light string on its own sway, bulbs every 8.5 cm,
 * 2200 K when on.
 */
export const PineGarland: React.FC<PineGarlandProps> = ({ length, on = 1, seed = 1, rail = RAIL, halo = 0.35 }) => {
  const b = garlandBuild(length, seed, rail.w, rail.h);
  const k = clamp01(on);
  const bm = warmBulbMat(k);
  const q = useMemo(() => b.bulbDirs.map((d) => new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d)), [b]);
  const cq = useMemo(() => b.cones.map((c) => new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), c.d)), [b]);
  return (
    <group>
      <mesh geometry={b.core} material={coreMat()} castShadow receiveShadow />
      <mesh geometry={b.needles} material={needleMat()} castShadow receiveShadow />
      <mesh geometry={b.wire} material={wireMat()} castShadow />
      {b.bulbs.map((p, i) => (
        <group key={i} position={p} quaternion={q[i]}>
          <mesh geometry={miniSocketGeo()} material={wireMat()} />
          <mesh geometry={miniBulbGeo()} material={bm} />
          {halo > 0 && k > 0.01 ? <sprite position={[0, 0.008, 0]} scale={[0.07, 0.07, 1]} material={haloMat("#FFB062", 0.7 * halo * k)} /> : null}
        </group>
      ))}
      {b.cones.map((c, i) => (
        <mesh key={`c${i}`} geometry={coneGeo()} position={c.p} quaternion={cq[i]} material={coneMat()} castShadow />
      ))}
    </group>
  );
};

// ======================================================================================= hallway: dog bed
export const PUPPY_BED = { r: 0.25, cushionTop: 0.07, rimTop: 0.128 };
const bolster = { R: 0.19, r: 0.06, sy: 0.85, base: 0.022 };
const bolsterGeo = () =>
  geoB("b-bolster", () => {
    const nt = 96;
    const np = 28;
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const h0 = bolster.base + bolster.r * bolster.sy;
    for (let i = 0; i <= nt; i++) {
      const th = (i / nt) * Math.PI * 2;
      // a lowered front (toward +z)
      const dip = Math.exp(-(Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2)) ** 2) / 0.35);
      const rr = bolster.r * (1 - 0.22 * dip);
      for (let j = 0; j <= np; j++) {
        const ph = (j / np) * Math.PI * 2;
        const outerSide = 0.5 + 0.5 * Math.cos(ph); // lumps only on the outside/top
        const lump = 1 + 0.05 * outerSide * Math.sin(th * 9 + Math.sin(ph * 2) * 1.5) * Math.cos(th * 3);
        const rad = bolster.R + rr * Math.cos(ph) * lump;
        let y = h0 - (bolster.r - rr) * bolster.sy + rr * bolster.sy * Math.sin(ph) * lump;
        y = Math.max(bolster.base + 0.0005, y);
        pos.push(rad * Math.cos(th), y, rad * Math.sin(th));
        uv.push((i / nt) * 8, (j / np) * 2);
      }
    }
    for (let i = 0; i < nt; i++)
      for (let j = 0; j < np; j++) {
        const a = i * (np + 1) + j;
        const b = (i + 1) * (np + 1) + j;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure the normals face out of the tube
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    let flip = 0;
    for (let i = 0; i < pos.length / 3; i += 37) {
      const p = V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const c = V(p.x, 0, p.z).setLength(bolster.R).setY(h0);
      flip += p.clone().sub(c).dot(V(nrm.getX(i), nrm.getY(i), nrm.getZ(i)));
    }
    if (flip < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    return g;
  });
const cushionGeo = () =>
  geoB("b-cushion", () => {
    // inside the bolster's inner contour (5 mm clear), domed, dipped in the middle
    const h0 = bolster.base + bolster.r * bolster.sy;
    const inner = (y: number) => {
      const s = (y - h0) / (bolster.r * bolster.sy);
      return bolster.R - bolster.r * Math.sqrt(Math.max(0, 1 - s * s)) - 0.006;
    };
    const top = PUPPY_BED.cushionTop;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const r = (i / 10) * (inner(top) - 0.02);
      pts.push(new THREE.Vector2(r + 0.0001, top - 0.012 + 0.012 * Math.sin((i / 10) * (Math.PI / 2))));
    }
    for (let i = 1; i <= 8; i++) {
      const y = top - ((top - bolster.base - 0.001) * i) / 8;
      const a = (i / 8) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.min(inner(y), inner(top) - 0.02 + 0.02 * Math.sin(a)), y));
    }
    pts.push(new THREE.Vector2(0.0001, bolster.base + 0.001));
    return new THREE.LatheGeometry(pts.reverse(), 64);
  });
const bedBaseGeo = () =>
  geoB("b-bedBase", () => {
    const pts: [number, number][] = [
      [0.0001, 0],
      [0.236, 0],
      [0.247, 0.003],
      [0.25, 0.011],
      [0.247, 0.019],
      [0.236, 0.022],
      [0.0001, 0.022],
    ];
    return new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      64,
    );
  });
const plushMat = (color: string) =>
  mat(`b-plushMat-${color}`, () => {
    const t = plushTex("bed", color);
    return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.12, roughness: 0.95, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#FFFFFF"), 0.3) });
  });
const baseMat = (color: string) => mat(`b-bedBaseMat-${color}`, () => new THREE.MeshStandardMaterial({ map: canvasWeaveTex("bed", color), roughness: 0.9 }));

export type PuppyBedProps = { color?: string; cushion?: string; base?: string };
/** A round plush dog bed, 0.5 across, on the floor: a faux-fur bolster ring (lowered at the front, +z), a
 * domed cushion inside it (top 0.07 m, see PUPPY_BED) and a canvas base. */
export const PuppyBed: React.FC<PuppyBedProps> = ({ color = "#BFAE98", cushion = "#E4D9C6", base = "#5F5348" }) => (
  <group>
    <mesh geometry={bedBaseGeo()} material={baseMat(base)} castShadow receiveShadow />
    <mesh geometry={bolsterGeo()} material={plushMat(color)} castShadow receiveShadow />
    <mesh geometry={cushionGeo()} material={plushMat(cushion)} castShadow receiveShadow />
  </group>
);

// ======================================================================================= floorboards
/**
 * Oak floorboards for a surface w x d metres (UV 0..1 over it, planks along u): 90 mm boards in random
 * lengths, grain, knots, dark seams (also the bump), a satin finish. Use as the hall floor slab's top
 * material, or with <Floorboards>.
 */
export const floorboardsMat = (w: number, d: number, base = "#A8784A", key = "hall") =>
  mat(`b-floor-${key}-${base}-${w.toFixed(2)}-${d.toFixed(2)}`, () => {
    const map = planksTex(`b-${key}`, base, 64, 9).clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(w / 1.44, d / 1.44);
    map.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({ map, bumpMap: map, bumpScale: 0.5, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.32 });
  });
export type FloorboardsProps = { w: number; d: number; base?: string };
/** A floorboard plane w (along x, the boards' length) by d, on y = 0, centred. */
export const Floorboards: React.FC<FloorboardsProps> = ({ w, d, base }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} material={floorboardsMat(w, d, base)} receiveShadow>
    <planeGeometry args={[w, d]} />
  </mesh>
);
