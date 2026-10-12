import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GAUGE, NROW, RAIL_DROP, SEATS, frameAt, rowS } from "./track";
import { TRACK_COL } from "./Track3D";

/**
 * The train: three cars, each one row of six floorless seats on a wide wing over a narrow chassis, so the
 * riders' legs hang free. Each seat has an over-the-shoulder restraint (padded shoulder bars, a chest
 * plate, a lap bar with two grips). Under it all, the bogies: road wheels on the rails, upstops under them,
 * guide wheels at the sides.
 *
 * Built in a row's frame: x right, y up, z backward (the train faces -z), origin on the heartline at the
 * riders' chests.
 */

const mats: Record<string, THREE.Material> = {};
const std = (key: string, p: THREE.MeshStandardMaterialParameters) =>
  (mats[key] ??= new THREE.MeshStandardMaterial(p)) as THREE.MeshStandardMaterial;

/** Materials of everything that rides with you: flagged so the motion blur leaves them sharp. */
export const RIDES_WITH_YOU = "ridesWithYou";
export const markRider = <T extends THREE.Material>(m: T): T => {
  if (!m.userData[RIDES_WITH_YOU]) {
    m.userData[RIDES_WITH_YOU] = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      // alpha 0 in the picture: the motion blur leaves these pixels alone
      sh.fragmentShader = sh.fragmentShader.replace(/}\s*$/, "  gl_FragColor.a = 0.0;\n}");
    };
  }
  return m;
};

export const M = {
  shell: () => markRider(std("shell", { color: "#26282D", roughness: 0.35, metalness: 0.1 })),
  accent: () => markRider(std("accent", { color: TRACK_COL, roughness: 0.32, metalness: 0.15 })),
  pad: () => markRider(std("pad", { color: "#18181B", roughness: 0.62 })),
  padTrim: () => markRider(std("padTrim", { color: "#E8742F", roughness: 0.55 })),
  steel: () => markRider(std("tsteel", { color: "#A9AEB4", roughness: 0.3, metalness: 0.85 })),
  dark: () => markRider(std("tdark", { color: "#3A3D42", roughness: 0.5, metalness: 0.6 })),
  wheel: () => markRider(std("wheel", { color: "#111214", roughness: 0.7 })),
  hub: () => markRider(std("hub", { color: "#C7CBD0", roughness: 0.25, metalness: 0.9 })),
  grip: () => markRider(std("grip", { color: "#0E0E10", roughness: 0.85 })),
};

/** Where things sit in a row's frame. */
export const SEAT = {
  pan: -0.36, // top of the seat pan
  back: 0.17, // the backrest's front face (z)
  knee: -0.34, // the pan's front edge (z)
  wing: -0.52, // the wing beam's centre (y)
  chassisTop: -0.98,
};


/** One seat (shell, cushions) — static parts. */
const seatGeometry = () => {
  const shell: THREE.BufferGeometry[] = [];
  const cushion: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  // seat pan cushion
  const pan = new THREE.BoxGeometry(0.44, 0.08, 0.46, 2, 1, 2);
  pan.translate(0, SEAT.pan - 0.04, (SEAT.back + SEAT.knee) / 2 - 0.02);
  cushion.push(pan);
  // backrest cushion and the shell behind it
  const back = new THREE.BoxGeometry(0.42, 0.62, 0.07);
  back.translate(0, SEAT.pan + 0.36, SEAT.back + 0.035);
  cushion.push(back);
  const shellBack = new THREE.BoxGeometry(0.5, 0.8, 0.07);
  shellBack.translate(0, SEAT.pan + 0.4, SEAT.back + 0.1);
  shell.push(shellBack);
  // headrest block (where the restraint pivots)
  const head = new THREE.BoxGeometry(0.26, 0.2, 0.09);
  head.translate(0, SEAT.pan + 0.86, SEAT.back + 0.07);
  cushion.push(head);
  // shell under the pan and the side bolsters
  const under = new THREE.BoxGeometry(0.5, 0.1, 0.5);
  under.translate(0, SEAT.pan - 0.12, (SEAT.back + SEAT.knee) / 2);
  shell.push(under);
  for (const sx of [-1, 1]) {
    const side = new THREE.BoxGeometry(0.04, 0.3, 0.42);
    side.translate(sx * 0.25, SEAT.pan - 0.02, (SEAT.back + SEAT.knee) / 2 + 0.02);
    accent.push(side);
  }
  // the post down to the wing
  const post = new THREE.CylinderGeometry(0.05, 0.06, 0.2, 12);
  post.translate(0, SEAT.pan - 0.24, SEAT.back);
  shell.push(post);
  return {
    shell: mergeGeometries(shell)!,
    cushion: mergeGeometries(cushion)!,
    accent: mergeGeometries(accent)!,
  };
};

/** A flat strap (w wide, t thick) along a curve, its width kept horizontal (along x) where it can be. */
const strapAlong = (pts: THREE.Vector3[], w: number, t: number, seg = 28) => {
  const curve = new THREE.CatmullRomCurve3(pts);
  const ring = 4;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const side = new THREE.Vector3(1, 0, 0).addScaledVector(tan, -tan.x).normalize();
    const nrm = new THREE.Vector3().crossVectors(tan, side).normalize();
    const corners: [number, number][] = [
      [-w / 2, -t / 2],
      [w / 2, -t / 2],
      [w / 2, t / 2],
      [-w / 2, t / 2],
    ];
    for (const [a, b] of corners) {
      const q = p.clone().addScaledVector(side, a).addScaledVector(nrm, b);
      pos.push(q.x, q.y, q.z);
    }
    if (i < seg)
      for (let j = 0; j < ring; j++) {
        const a = i * ring + j;
        const b = i * ring + ((j + 1) % ring);
        idx.push(a, a + ring, b, b, a + ring, b + ring);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/** The restraint, built closed (pivot at the origin; it swings up about x to open): a padded lap bar with
 * two grips, and a soft vest of straps up over the shoulders, so the riders' faces stay in the open. */
export const RESTRAINT_PIVOT = new THREE.Vector3(0, SEAT.pan + 0.6, SEAT.back + 0.05);
const restraintGeometry = () => {
  const pad: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const grip: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).sub(RESTRAINT_PIVOT);
  for (const sx of [-1, 1]) {
    // a vest strap: from the hinge behind the shoulder, over it, down the chest to the lap bar
    const pts = [
      P(sx * 0.1, SEAT.pan + 0.6, SEAT.back + 0.03),
      P(sx * 0.12, SEAT.pan + 0.6, SEAT.back - 0.06),
      P(sx * 0.118, SEAT.pan + 0.53, SEAT.back - 0.19),
      P(sx * 0.1, SEAT.pan + 0.38, SEAT.back - 0.3),
      P(sx * 0.07, SEAT.pan + 0.24, SEAT.back - 0.36),
    ];
    pad.push(strapAlong(pts, 0.052, 0.014));
    trim.push(strapAlong(pts.map((p) => p.clone().add(new THREE.Vector3(0, 0, -0.004))), 0.012, 0.016));
    // a grip at each end of the lap bar
    const g = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 14);
    g.rotateX(0.3);
    g.translate(sx * 0.21, SEAT.pan + 0.2 - RESTRAINT_PIVOT.y, SEAT.back - 0.4 - RESTRAINT_PIVOT.z);
    grip.push(g);
    const knob = new THREE.SphereGeometry(0.024, 12, 10);
    knob.translate(sx * 0.21, SEAT.pan + 0.265 - RESTRAINT_PIVOT.y, SEAT.back - 0.38 - RESTRAINT_PIVOT.z);
    steel.push(knob);
  }
  // the lap bar: a padded bar across the lap
  const lap = new THREE.CapsuleGeometry(0.045, 0.3, 6, 14);
  lap.rotateZ(Math.PI / 2);
  lap.translate(0, SEAT.pan + 0.2 - RESTRAINT_PIVOT.y, SEAT.back - 0.37 - RESTRAINT_PIVOT.z);
  pad.push(lap);
  const lapTrim = new THREE.CylinderGeometry(0.047, 0.047, 0.06, 16);
  lapTrim.rotateZ(Math.PI / 2);
  lapTrim.translate(0, SEAT.pan + 0.2 - RESTRAINT_PIVOT.y, SEAT.back - 0.37 - RESTRAINT_PIVOT.z);
  trim.push(lapTrim);
  // the hinge
  const hinge = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 14);
  hinge.rotateZ(Math.PI / 2);
  steel.push(hinge);
  const plainGeo = (gs: THREE.BufferGeometry[]) =>
    mergeGeometries(
      gs.map((g) => {
        const n = g.toNonIndexed();
        n.deleteAttribute("uv");
        return n;
      }),
    )!;
  return { pad: plainGeo(pad), trim: plainGeo(trim), grip: plainGeo(grip), steel: plainGeo(steel) };
};

/** The chassis, wing and bogies of one car. */
const carGeometry = (_front: boolean) => {
  const shell: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  const wheel: THREE.BufferGeometry[] = [];
  const hub: THREE.BufferGeometry[] = [];
  // the wing: a beam across under the seats, faired in the track colour
  const wing = new THREE.BoxGeometry(3.7, 0.16, 0.3);
  wing.translate(0, SEAT.wing, SEAT.back + 0.02);
  accent.push(wing);
  const wingCap = new THREE.CapsuleGeometry(0.08, 3.62, 4, 12);
  wingCap.rotateZ(Math.PI / 2);
  wingCap.translate(0, SEAT.wing - 0.02, SEAT.back + 0.17);
  shell.push(wingCap);
  // the post from wing to chassis
  const post = new THREE.BoxGeometry(0.16, SEAT.wing - SEAT.chassisTop, 0.3);
  post.translate(0, (SEAT.wing + SEAT.chassisTop) / 2, SEAT.back + 0.02);
  shell.push(post);
  // the chassis: a narrow box along the track, and the coupling to the next car
  const ch = new THREE.BoxGeometry(0.62, 0.18, 2.0);
  ch.translate(0, SEAT.chassisTop - 0.09, 0.7);
  steel.push(ch);
  const coup = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 10);
  coup.rotateX(Math.PI / 2);
  coup.translate(0, SEAT.chassisTop - 0.1, 1.95);
  steel.push(coup);
  // bogies at both ends of the car: road wheels on the rails, upstops below, guide wheels outside
  const railY = -RAIL_DROP;
  for (const bz of [-0.25, 1.55]) {
    const frame = new THREE.BoxGeometry(1.5, 0.12, 0.42);
    frame.translate(0, railY + 0.33, bz);
    steel.push(frame);
    for (const sx of [-1, 1]) {
      const x = sx * GAUGE;
      const arm = new THREE.BoxGeometry(0.1, 0.5, 0.3);
      arm.translate(x + sx * 0.2, railY + 0.08, bz);
      steel.push(arm);
      // road wheel above the rail
      const rw = new THREE.CylinderGeometry(0.16, 0.16, 0.09, 24);
      rw.rotateZ(Math.PI / 2);
      rw.translate(x, railY + 0.085 + 0.16, bz);
      wheel.push(rw);
      const rh = new THREE.CylinderGeometry(0.07, 0.07, 0.1, 14);
      rh.rotateZ(Math.PI / 2);
      rh.translate(x, railY + 0.085 + 0.16, bz);
      hub.push(rh);
      // upstop under
      const uw = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20);
      uw.rotateZ(Math.PI / 2);
      uw.translate(x, railY - 0.085 - 0.11, bz);
      wheel.push(uw);
      // guide wheel on the outside, axle vertical
      const gw = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 20);
      gw.translate(x + sx * (0.085 + 0.1), railY, bz);
      wheel.push(gw);
    }
  }
  return {
    shell: mergeGeometries(shell.map((g) => g.toNonIndexed()))!,
    accent: mergeGeometries(accent.map((g) => g.toNonIndexed()))!,
    steel: mergeGeometries(steel.map((g) => g.toNonIndexed()))!,
    wheel: mergeGeometries(wheel.map((g) => g.toNonIndexed()))!,
    hub: mergeGeometries(hub.map((g) => g.toNonIndexed()))!,
  };
};

/** How far each restraint is open (0 locked, 1 fully up): they come down together in the first half second. */
export const restraintOpen = (u: number) => {
  const k = Math.min(1, Math.max(0, (0.5 - u) / 0.5));
  return k * k * (3 - 2 * k);
};

/** A row's world matrix at a video frame. */
export const rowMatrix = (frame: number, r: number) => {
  const f = frameAt(rowS(frame, r));
  const m = new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate());
  m.setPosition(f.P);
  return m;
};

export const Train: React.FC<{ frame: number; children?: (row: number) => React.ReactNode }> = ({
  frame,
  children,
}) => {
  const g = useMemo(
    () => ({ seat: seatGeometry(), restraint: restraintGeometry(), car: carGeometry(false), front: carGeometry(true) }),
    [],
  );
  const u = frame / 30;
  const open = restraintOpen(u);
  return (
    <>
      {Array.from({ length: NROW }).map((_, r) => {
        const m = rowMatrix(frame, r);
        const pos = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const sc = new THREE.Vector3();
        m.decompose(pos, q, sc);
        const car = r === 0 ? g.front : g.car;
        return (
          <group key={r} position={pos} quaternion={q}>
            <mesh geometry={car.shell} material={M.shell()} castShadow receiveShadow />
            <mesh geometry={car.accent} material={M.accent()} castShadow receiveShadow />
            <mesh geometry={car.steel} material={M.dark()} castShadow />
            <mesh geometry={car.wheel} material={M.wheel()} />
            <mesh geometry={car.hub} material={M.hub()} />
            {SEATS.map((x, i) => (
              <group key={i} position={[x, 0, 0]}>
                <mesh geometry={g.seat.shell} material={M.shell()} castShadow receiveShadow />
                <mesh geometry={g.seat.cushion} material={M.pad()} castShadow receiveShadow />
                <mesh geometry={g.seat.accent} material={M.accent()} />
                <group
                  position={[RESTRAINT_PIVOT.x, RESTRAINT_PIVOT.y + open * 0.3, RESTRAINT_PIVOT.z - open * 0.28]}
                  rotation={[-open * 0.55, 0, 0]}
                >
                  <mesh geometry={g.restraint.pad} material={M.pad()} castShadow receiveShadow />
                  <mesh geometry={g.restraint.trim} material={M.padTrim()} />
                  <mesh geometry={g.restraint.grip} material={M.grip()} />
                  <mesh geometry={g.restraint.steel} material={M.steel()} />
                </group>
              </group>
            ))}
            {children ? children(r) : null}
          </group>
        );
      })}
    </>
  );
};
