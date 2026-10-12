import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DS, GAUGE, LEN, MARK, RAIL_DROP, SPINE_DROP, TR, frameAt, type Frame } from "./track";

/**
 * The steel: a box-spine track like the big dive machines have. Two tubular running rails (bare steel on
 * top where the wheels run), a square spine under them, a tie every 1.2 m, and supports: plain columns
 * where the spine faces the ground, arms reaching round where the track banks over or turns upside down
 * (scripts/generate-coaster-path.py places them clear of the train). On the lift, stairs and handrails up
 * both sides, the chain and the anti-rollback ratchet; on the holding brake and the brake run, brake fins.
 */

export const TRACK_COL = "#E5531F";
export const SUPPORT_COL = "#ECE7DC";

const mats: Record<string, THREE.Material> = {};
const std = (key: string, p: THREE.MeshStandardMaterialParameters) =>
  (mats[key] ??= new THREE.MeshStandardMaterial(p)) as THREE.MeshStandardMaterial;

/** Sweep a closed cross-section (x along R, y along U, with outward normals) along the heartline. */
const sweep = (
  s0: number,
  s1: number,
  step: number,
  section: { x: number; y: number; nx: number; ny: number; c?: number }[],
  colorA?: THREE.Color,
  colorB?: THREE.Color,
) => {
  const n = Math.max(2, Math.ceil((s1 - s0) / step) + 1);
  const m = section.length;
  const pos = new Float32Array(n * (m + 1) * 3);
  const nor = new Float32Array(n * (m + 1) * 3);
  const uv = new Float32Array(n * (m + 1) * 2);
  const col = colorA ? new Float32Array(n * (m + 1) * 3) : null;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(s1, s0 + i * step);
    const f = frameAt(s);
    for (let j = 0; j <= m; j++) {
      const c = section[j % m];
      const k = i * (m + 1) + j;
      pos[k * 3] = f.P.x + f.R.x * c.x + f.U.x * c.y;
      pos[k * 3 + 1] = f.P.y + f.R.y * c.x + f.U.y * c.y;
      pos[k * 3 + 2] = f.P.z + f.R.z * c.x + f.U.z * c.y;
      nor[k * 3] = f.R.x * c.nx + f.U.x * c.ny;
      nor[k * 3 + 1] = f.R.y * c.nx + f.U.y * c.ny;
      nor[k * 3 + 2] = f.R.z * c.nx + f.U.z * c.ny;
      uv[k * 2] = j / m;
      uv[k * 2 + 1] = s / 2;
      if (col && colorA && colorB) {
        const cc = colorA.clone().lerp(colorB, c.c ?? 0);
        col[k * 3] = cc.r;
        col[k * 3 + 1] = cc.g;
        col[k * 3 + 2] = cc.b;
      }
    }
    if (i < n - 1)
      for (let j = 0; j < m; j++) {
        const a = i * (m + 1) + j;
        const b = a + m + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
};

/** A rail tube's section, centred at (cx, cy): the top arc is the bare running surface (c = 1). */
const railSection = (cx: number, cy: number, r: number, seg = 14) =>
  Array.from({ length: seg }).map((_, j) => {
    const a = (j / seg) * Math.PI * 2;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    return { x: cx + nx * r, y: cy + ny * r, nx, ny, c: ny > 0.55 ? 1 : 0 };
  });

/** The spine's section: a rounded square, w wide, h tall, centred at (0, cy). */
const spineSection = (w: number, h: number, cy: number, rc = 0.06, per = 4) => {
  const pts: { x: number; y: number; nx: number; ny: number }[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - rc, h / 2 - rc, 0],
    [-(w / 2 - rc), h / 2 - rc, Math.PI / 2],
    [-(w / 2 - rc), -(h / 2 - rc), Math.PI],
    [w / 2 - rc, -(h / 2 - rc), (3 * Math.PI) / 2],
  ];
  for (const [x, y, a0] of corners)
    for (let k = 0; k <= per; k++) {
      const a = a0 + (k / per) * (Math.PI / 2);
      pts.push({ x: x + Math.cos(a) * rc, y: cy + y + Math.sin(a) * rc, nx: Math.cos(a), ny: Math.sin(a) });
    }
  return pts;
};

/** Where the circuit's track is drawn (all of it; the station's and tunnel's dressing is elsewhere). */
const S0 = 0;
const S1 = LEN;

const frameMatrix = (f: Frame, right = 0, up = 0, fwd = 0) => {
  const m = new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate());
  const p = f.P.clone().addScaledVector(f.R, right).addScaledVector(f.U, up).addScaledVector(f.T, fwd);
  m.setPosition(p);
  return m;
};

/** One tie: plates from each rail down to the spine, and a cap plate on the spine. Built in the frame. */
const tieGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    // a plate from under the rail to the spine's upper corner
    const a = new THREE.Vector2(sx * GAUGE, -RAIL_DROP - 0.05);
    const b = new THREE.Vector2(sx * 0.28, -SPINE_DROP + 0.36);
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(0.1, len, 0.05);
    g.rotateZ(Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    parts.push(g);
    // the rail's saddle
    const sd = new THREE.BoxGeometry(0.16, 0.08, 0.12);
    sd.translate(sx * GAUGE, -RAIL_DROP - 0.08, 0);
    parts.push(sd);
  }
  const cap = new THREE.BoxGeometry(0.7, 0.04, 0.14);
  cap.translate(0, -SPINE_DROP + 0.4, 0);
  parts.push(cap);
  return mergeGeometries(parts)!;
};

const Ties: React.FC = () => {
  const { geo, mats: m } = useMemo(() => {
    const ss: number[] = [];
    for (let s = S0 + 0.6; s < S1 - 0.6; s += 1.2) ss.push(s);
    const geo = tieGeometry();
    return { geo, mats: ss.map((s) => frameMatrix(frameAt(s))) };
  }, []);
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(geo, std("track", { color: TRACK_COL, roughness: 0.42, metalness: 0.2 }), m.length);
    m.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    return im;
  }, [geo, m]);
  return <primitive object={mesh} />;
};

/** A tube between two points. */
const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 16) => {
  const d = b.clone().sub(a);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
};
const ball = (p: THREE.Vector3, r: number) => {
  const g = new THREE.SphereGeometry(r, 16, 10);
  g.translate(p.x, p.y, p.z);
  return g;
};

type Sup = { kind: string; pts: number[][]; r: number; s: number; extra?: Sup[] };

const Supports: React.FC = () => {
  const { steel, concrete } = useMemo(() => {
    const steelParts: THREE.BufferGeometry[] = [];
    const conc: THREE.BufferGeometry[] = [];
    const one = (sp: Sup, column: boolean) => {
      const pts = sp.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const f = frameAt(sp.s);
      // the saddle that grips the spine
      const sad = new THREE.BoxGeometry(0.95, 0.22, 0.7);
      sad.applyMatrix4(frameMatrix(f, 0, -SPINE_DROP - 0.5, 0));
      steelParts.push(sad);
      for (let i = 0; i < pts.length - 1; i++) {
        const last = i === pts.length - 2;
        if (!column && last) continue;
        const r = last ? sp.r : sp.r * 0.72;
        if (pts[i].distanceTo(pts[i + 1]) > 0.05) steelParts.push(tube(pts[i], pts[i + 1], r));
        if (i > 0) steelParts.push(ball(pts[i], r * 1.02));
      }
    };
    for (const sp of TR.supports as Sup[]) {
      const pts = sp.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const base = pts[pts.length - 1];
      // the column: from the highest attachment down to the footer
      let top = pts[pts.length - 2].y;
      for (const e of sp.extra ?? []) top = Math.max(top, e.pts[e.pts.length - 2][1]);
      one(sp, true);
      for (const e of sp.extra ?? []) one(e, false);
      if (top > pts[pts.length - 2].y + 0.01) {
        const t = new THREE.Vector3(base.x, top, base.z);
        steelParts.push(tube(pts[pts.length - 2], t, sp.r));
        steelParts.push(ball(t, sp.r));
      }
      // a flange and the concrete footer
      const fl = new THREE.CylinderGeometry(sp.r * 1.5, sp.r * 1.5, 0.08, 20);
      fl.translate(base.x, base.y + 0.55, base.z);
      steelParts.push(fl);
      const ft = new THREE.CylinderGeometry(sp.r * 2.2, sp.r * 2.4, 1.2, 20);
      ft.translate(base.x, base.y - 0.08, base.z);
      conc.push(ft);
    }
    return { steel: mergeGeometries(steelParts.map((g) => g.toNonIndexed()))!, concrete: mergeGeometries(conc)! };
  }, []);
  return (
    <>
      <mesh
        geometry={steel}
        material={std("support", { color: SUPPORT_COL, roughness: 0.5, metalness: 0.15 })}
        castShadow
        receiveShadow
      />
      <mesh geometry={concrete} material={std("concrete", { color: "#B9B3A8", roughness: 0.9 })} receiveShadow />
    </>
  );
};

/** The lift: stairs and handrails up both sides, the chain, the anti-rollback ratchet; plus brake fins. */
const LiftAndBrakes: React.FC<{ chainShift: number }> = ({ chainShift }) => {
  const parts = useMemo(() => {
    const steel: THREE.BufferGeometry[] = [];
    const grate: THREE.BufferGeometry[] = [];
    const s0 = MARK.lift0;
    const s1 = MARK.lift1;
    // stairs: a tread every 0.22 m of rise, both sides, outboard of the train's envelope
    let lastY = -1;
    for (let s = s0 + 1; s < s1 - 0.5; s += 0.05) {
      const f = frameAt(s);
      if (f.P.y - lastY < 0.22) continue;
      lastY = f.P.y;
      for (const side of [-1, 1]) {
        const c = f.P.clone().addScaledVector(f.R, side * 3.0).addScaledVector(f.U, -1.45);
        // a level tread facing along the heading
        const h = new THREE.Vector3(f.T.x, 0, f.T.z).normalize();
        const g = new THREE.BoxGeometry(0.85, 0.04, 0.3);
        const m = new THREE.Matrix4().makeBasis(
          new THREE.Vector3().crossVectors(h, new THREE.Vector3(0, 1, 0)).normalize(),
          new THREE.Vector3(0, 1, 0),
          h.clone().negate(),
        );
        m.setPosition(c);
        g.applyMatrix4(m);
        grate.push(g);
      }
    }
    // stringers, handrails (two heights) and posts, both sides, following the slope
    for (const side of [-1, 1]) {
      for (const [dx, dy, r] of [
        [-0.45, -1.5, 0.05],
        [0.45, -1.5, 0.05],
        [0.45, -0.45, 0.03],
        [0.45, -0.95, 0.022],
      ] as const) {
        for (let s = s0 + 1; s < s1 - 1; s += 2) {
          const fa = frameAt(s);
          const fb = frameAt(Math.min(s1 - 1, s + 2));
          const a = fa.P.clone().addScaledVector(fa.R, side * (3.0 + dx * side)).addScaledVector(fa.U, dy);
          const b = fb.P.clone().addScaledVector(fb.R, side * (3.0 + dx * side)).addScaledVector(fb.U, dy);
          steel.push(tube(a, b, r, 8));
        }
      }
      for (let s = s0 + 1; s < s1 - 1; s += 1.6) {
        const f = frameAt(s);
        const a = f.P.clone().addScaledVector(f.R, side * 3.45).addScaledVector(f.U, -1.5);
        const b = f.P.clone().addScaledVector(f.R, side * 3.45).addScaledVector(f.U, -0.45);
        steel.push(tube(a, b, 0.022, 6));
        // a bracket from the spine out to the walkway
        const c = f.P.clone().addScaledVector(f.U, -SPINE_DROP);
        const d = f.P.clone().addScaledVector(f.R, side * 2.55).addScaledVector(f.U, -1.52);
        if (Math.round(s / 1.6) % 3 === 0) steel.push(tube(c, d, 0.045, 8));
      }
    }
    // the brake fins: the holding brake and the brake run
    const fins: THREE.BufferGeometry[] = [];
    const finRuns: [number, number][] = [
      [MARK.hold - 6, MARK.hold + 4],
      [MARK.brake0, MARK.brake1],
    ];
    for (const [a, b] of finRuns)
      for (let s = a; s < b; s += 0.55) {
        const f = frameAt(s);
        for (const side of [-1, 1]) {
          const g = new THREE.BoxGeometry(0.03, 0.34, 0.48);
          g.applyMatrix4(frameMatrix(f, side * 0.14, -SPINE_DROP + 0.58, 0));
          fins.push(g);
        }
      }
    return {
      steel: mergeGeometries(steel.map((g) => g.toNonIndexed()))!,
      grate: mergeGeometries(grate)!,
      fins: mergeGeometries(fins)!,
    };
  }, []);
  const chain = useMemo(() => {
    // the chain: a dark strip between the rails, its texture of links running up the lift
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1a1a1c";
    g.fillRect(0, 0, 32, 128);
    for (let y = 0; y < 128; y += 16) {
      g.fillStyle = "#4a4a50";
      g.fillRect(6, y + 2, 20, 6);
      g.fillStyle = "#2b2b30";
      g.fillRect(12, y + 8, 8, 8);
      g.fillStyle = "#77777f";
      g.fillRect(8, y + 3, 16, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const sec = [
      { x: -0.07, y: -RAIL_DROP - 0.16, nx: 0, ny: 1 },
      { x: 0.07, y: -RAIL_DROP - 0.16, nx: 0, ny: 1 },
    ];
    const geo = sweep(MARK.lift0 - 2, MARK.lift1 + 1, 0.5, sec);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide });
    return { geo, mat, tex };
  }, []);
  chain.tex.offset.y = -chainShift / 2 / (128 / 128);
  return (
    <>
      <mesh geometry={parts.steel} material={std("rail", { color: "#9AA0A6", roughness: 0.4, metalness: 0.7 })} castShadow />
      <mesh geometry={parts.grate} material={std("grate", { color: "#6E747A", roughness: 0.6, metalness: 0.5 })} castShadow receiveShadow />
      <mesh geometry={parts.fins} material={std("fins", { color: "#B87333", roughness: 0.35, metalness: 0.85 })} />
      <mesh geometry={chain.geo} material={chain.mat} />
    </>
  );
};

export const Track3D: React.FC<{ chainShift: number }> = ({ chainShift }) => {
  const geos = useMemo(() => {
    const steel = new THREE.Color(TRACK_COL);
    const worn = new THREE.Color("#8C8F94");
    const rails = mergeGeometries([
      sweep(S0, S1, DS, railSection(-GAUGE, -RAIL_DROP, 0.085), steel, worn),
      sweep(S0, S1, DS, railSection(GAUGE, -RAIL_DROP, 0.085), steel, worn),
    ])!;
    const spine = sweep(S0, S1, DS, spineSection(0.62, 0.78, -SPINE_DROP), steel, steel);
    return { rails, spine };
  }, []);
  const mat = std("trackv", { vertexColors: true, roughness: 0.4, metalness: 0.25 });
  return (
    <>
      <mesh geometry={geos.rails} material={mat} castShadow receiveShadow />
      <mesh geometry={geos.spine} material={mat} castShadow receiveShadow />
      <Ties />
      <Supports />
      <LiftAndBrakes chainShift={chainShift} />
    </>
  );
};
