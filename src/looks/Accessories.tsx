import React, { useMemo } from "react";
import * as THREE from "three";
import { eyeCentre, frontZ, type Shape } from "../coaster/face/sculpt";
import { hash } from "./timeline";

/**
 * Things in head space (metres; origin between the ears at eye level, +z out of the face, +y up, +x to the
 * person's left): glasses and sunglasses, a moustache, the photographer's comb-over (strands that can lift in
 * a gale), the mogger's flow (long swept-back hair that can flip forward over his face), a wad of gum, and
 * the edit's glowing eyes.
 */

const mats: Record<string, THREE.Material> = {};

/* ------------------------------------------------------------------ */
/* Glasses                                                               */
/* ------------------------------------------------------------------ */

const roundedRect = (w: number, h: number, r: number) => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
};

export const Glasses: React.FC<{ sh: Shape; kind: "round" | "rect" | "sun"; color: string }> = ({ sh, kind, color }) => {
  const g = useMemo(() => {
    const c = eyeCentre(sh, 1);
    const z = c.z + sh.eyeR + (kind === "sun" ? 0.014 : 0.012);
    const bridgeZ = Math.max(z, frontZ(sh, 0, sh.eyeY + 0.004).p.z + 0.004);
    const w = kind === "round" ? 0.04 : kind === "sun" ? 0.05 : 0.046;
    const h = kind === "round" ? 0.04 : kind === "sun" ? 0.038 : 0.031;
    const shape = kind === "round" ? null : roundedRect(w, h, kind === "sun" ? 0.012 : 0.007);
    const rim = (() => {
      if (!shape) return new THREE.TorusGeometry(w / 2, kind === "round" ? 0.0016 : 0.0022, 8, 40);
      const pts = shape.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 60, kind === "sun" ? 0.0026 : 0.0018, 6, true);
    })();
    const lens = shape ? new THREE.ShapeGeometry(shape, 12) : new THREE.CircleGeometry(w / 2, 40);
    const dx = sh.eyeX * 1.02;
    // the bridge: an arch between the rims over the nose
    const bridge = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([new THREE.Vector3(-dx + w / 2 - 0.001, 0.004, z), new THREE.Vector3(0, 0.009, bridgeZ + 0.002), new THREE.Vector3(dx - w / 2 + 0.001, 0.004, z)]),
      12,
      0.0013,
      5,
      false,
    );
    // the arms back to the ears
    const arms = [-1, 1].map((s) => {
      const a = new THREE.Vector3(s * (dx + w / 2), sh.eyeY + 0.006, z - 0.002);
      const b = new THREE.Vector3(s * (sh.w + 0.004), sh.eyeY + 0.002, -0.012);
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, a.clone().add(new THREE.Vector3(s * 0.004, 0, -0.012)), b]), 10, 0.0013, 5, false);
    });
    return { rim, lens, bridge, arms, z, dx };
  }, [sh, kind]);
  const frame = (mats[`fr${color}`] ??= new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8, metalness: kind === "round" ? 0.6 : 0 }));
  const glass =
    kind === "sun"
      ? (mats.sunlens ??= new THREE.MeshPhysicalMaterial({ color: "#0B0C10", roughness: 0.04, metalness: 0.4, clearcoat: 1, side: THREE.DoubleSide }))
      : (mats.lens ??= new THREE.MeshPhysicalMaterial({ color: "#FFFFFF", roughness: 0.02, transparent: true, opacity: 0.1, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * g.dx, sh.eyeY + 0.003, g.z]}>
          <mesh geometry={g.rim} material={frame} />
          <mesh geometry={g.lens} material={glass} renderOrder={3} />
        </group>
      ))}
      <mesh geometry={g.bridge} material={frame} position={[0, sh.eyeY, 0]} />
      {g.arms.map((a, i) => (
        <mesh key={i} geometry={a} material={frame} />
      ))}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Strands                                                               */
/* ------------------------------------------------------------------ */

/** A strand texture: fine lengthwise hairs, ragged at the ribbon's edges (u across, v along). */
const strandTexture = () =>
  (mats.__strandTex as unknown as THREE.Texture) ??
  (() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 64, 256);
    for (let i = 0; i < 90; i++) {
      const x = hash(i * 3.7) * 64;
      const l = 0.55 + hash(i * 5.3) * 0.45;
      g.strokeStyle = `rgba(255,255,255,${0.55 + hash(i * 1.9) * 0.45})`;
      g.lineWidth = 1 + hash(i * 7.1) * 1.6;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (hash(i) - 0.5) * 6, 90, x + (hash(i * 2) - 0.5) * 8, 170, x + (hash(i * 4) - 0.5) * 10, 256 * l);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    (mats as Record<string, unknown>).__strandTex = t;
    return t;
  })();

const hairMat = (color: string) =>
  (mats[`hair${color}`] ??= new THREE.MeshPhysicalMaterial({
    color,
    alphaMap: strandTexture(),
    alphaTest: 0.35,
    roughness: 0.42,
    sheen: 0.7,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color("#FFF0D8"), 0.5),
    sheenRoughness: 0.35,
    side: THREE.DoubleSide,
  }));

/** Ribbons along centrelines (each a list of points), each a given width at its root tapering to a tip. */
const ribbonGeometry = (geo: THREE.BufferGeometry, lines: THREE.Vector3[][], widths: number[], normals: THREE.Vector3[]) => {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  lines.forEach((pts, li) => {
    const n = pts.length;
    const nrm = normals[li];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const tan = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
      const side = new THREE.Vector3().crossVectors(tan, nrm).normalize();
      const w = widths[li] * (1 - 0.75 * Math.pow(t, 1.6));
      const a = pts[i].clone().addScaledVector(side, w / 2);
      const b = pts[i].clone().addScaledVector(side, -w / 2);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      uv.push(0, t, 1, t);
      if (i < n - 1) idx.push(base + 2 * i, base + 2 * i + 1, base + 2 * i + 2, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2);
    }
    base += 2 * n;
  });
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
};

/** A point on a shell round the skull at azimuth a (0 = the face, + toward the person's left) and elevation e. */
const shell = (sh: Shape, a: number, e: number, out = new THREE.Vector3(), lift = 0.004) => {
  const ce = Math.cos(e);
  out.set(Math.sin(a) * ce * (sh.w + lift), sh.eyeY + 0.006 + Math.sin(e) * (sh.h * 0.92 + lift), Math.cos(a) * ce * (sh.d + lift) - 0.012);
  return out;
};

/* ------------------------------------------------------------------ */
/* The comb-over                                                         */
/* ------------------------------------------------------------------ */

/** Long strands parted low over the left ear and combed across the bald crown; lift (radians) raises them
 * from the parting like a lid, flutter makes them wave. */
export const CombOver: React.FC<{ sh: Shape; color: string; lift: number; flutter: number; t: number }> = ({ sh, color, lift, flutter, t }) => {
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const lines: THREE.Vector3[][] = [];
  const widths: number[] = [];
  const normals: THREE.Vector3[] = [];
  const N = 15;
  for (let i = 0; i < N; i++) {
    const zi = -0.06 + (i / (N - 1)) * 0.115;
    const root = new THREE.Vector3(sh.w * 0.9, sh.eyeY + 0.05, zi);
    const pts: THREE.Vector3[] = [];
    const M = 12;
    // each strand's own lift and flutter
    const li = lift * (0.85 + 0.3 * hash(i * 3.3)) + flutter * 0.25 * Math.sin(t * 19 + i * 1.7);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), li);
    for (let j = 0; j <= M; j++) {
      const s = j / M;
      // over the top from the left parting toward the right side
      const ang = 0.38 + s * 2.05;
      const r = new THREE.Vector3(Math.cos(ang) * (sh.w + 0.0045), sh.eyeY + 0.006 + Math.sin(ang) * (sh.h * 0.93 + 0.0045), zi * (0.98 - 0.12 * Math.sin(Math.PI * s)));
      const rel = r.sub(root).applyQuaternion(q);
      // waving as it lifts
      rel.y += flutter * 0.006 * Math.sin(t * 23 + s * 6 + i) * s;
      pts.push(root.clone().add(rel));
    }
    lines.push(pts);
    widths.push(0.009);
    normals.push(new THREE.Vector3(0, 0, 1));
  }
  ribbonGeometry(geo, lines, widths, normals);
  return <mesh geometry={geo} material={hairMat(color)} />;
};

/* ------------------------------------------------------------------ */
/* The flow                                                              */
/* ------------------------------------------------------------------ */

type FlowRoot = { a: number; e: number; len: number; w: number; seed: number };
const FLOW_ROOTS: FlowRoot[] = (() => {
  const out: FlowRoot[] = [];
  let k = 0;
  // rows of roots from the hairline back over the crown, and round the sides
  for (let row = 0; row < 7; row++) {
    const e = 0.55 + row * 0.13;
    const n = 9 + row;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * (1.9 + row * 0.12);
      out.push({ a, e: Math.min(e, 1.45), len: 0.13 + 0.05 * hash(k * 1.3), w: 0.016 + 0.006 * hash(k * 2.1), seed: k });
      k++;
    }
  }
  // the sides and the back
  for (let i = 0; i < 26; i++) {
    const a = (i / 25) * 2 * Math.PI;
    out.push({ a, e: 0.25 + 0.1 * hash(i * 4.4), len: 0.1 + 0.05 * hash(i * 2.7), w: 0.016, seed: 100 + i });
  }
  return out;
})();

/**
 * Swept back from the forehead with volume on top, behind the ears, flicking out at the nape. wind pushes it
 * back and up (and makes it flutter); flip (0..1) swings it all forward over the face.
 */
export const FlowHair: React.FC<{ sh: Shape; color: string; wind: number; flip: number; t: number }> = ({ sh, color, wind, flip, t }) => {
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const lines: THREE.Vector3[][] = [];
  const widths: number[] = [];
  const normals: THREE.Vector3[] = [];
  const crown = new THREE.Vector3(0, sh.eyeY + sh.h * 0.9, -0.025);
  const p = new THREE.Vector3();
  FLOW_ROOTS.forEach((r) => {
    const M = 12;
    const pts: THREE.Vector3[] = [];
    // march over a shell growing out from the scalp: back (toward -z) and down
    let a = r.a;
    let e = r.e;
    const back = Math.cos(r.a) > -0.3;
    for (let j = 0; j <= M; j++) {
      const s = j / M;
      const lift = 0.004 + 0.022 * Math.sin(Math.PI * Math.min(1, s * 1.3)) * (0.6 + 0.4 * Math.sin(r.e)) + 0.012 * s;
      shell(sh, a, e, p, lift);
      // the flick at the end: outward
      const out = p.clone().sub(new THREE.Vector3(0, sh.eyeY, -0.012)).normalize();
      const q = p.clone().addScaledVector(out, 0.012 * Math.max(0, s - 0.75) * 4);
      pts.push(q);
      // step: front/top roots sweep back over the crown then down the back; side roots go down and back
      const step = r.len / M;
      if (back) {
        // move the azimuth toward the back (pi) and the elevation over the top then down
        a += (Math.sign(a || 0.01) * 0.05 + (r.a > 0 ? 0.04 : -0.04)) * step * 8;
        e -= (e > 1.0 ? -0.6 : 1.6) * step * 1.4;
      } else {
        e -= 1.4 * step * 5;
      }
    }
    // wind: back and up, more at the tips, with flutter; the flip: swung forward over the top of the head
    const fl = flip;
    const qf = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 2.3 * fl);
    for (let j = 0; j <= M; j++) {
      const s = j / M;
      const q = pts[j];
      if (wind > 0) {
        const fx = 0.004 * Math.sin(t * 21 + r.seed + s * 5) * s;
        q.add(new THREE.Vector3(fx, 0.012 * wind * s * s, -0.03 * wind * s * s));
      }
      if (fl > 0) {
        // rotate about the crown (the strand's own root holds, its length swings), then hang a little
        const rel = q.clone().sub(crown);
        const k = Math.min(1, s * 1.6) * fl;
        const rot = rel.clone().applyQuaternion(qf);
        q.copy(crown).add(rel.lerp(rot, k));
        q.y -= 0.03 * fl * s * s;
        q.z += 0.02 * fl * s;
      }
    }
    lines.push(pts);
    widths.push(r.w);
    normals.push(new THREE.Vector3(Math.sin(r.a), 0.4, Math.cos(r.a)).normalize());
  });
  ribbonGeometry(geo, lines, widths, normals);
  return <mesh geometry={geo} material={hairMat(color)} />;
};

/* ------------------------------------------------------------------ */
/* Moustache, gum, glowing eyes                                          */
/* ------------------------------------------------------------------ */

/** A thick moustache: short strands on the upper lip, combed down and out to the corners. */
export const Moustache: React.FC<{ sh: Shape; color: string; twitch?: number }> = ({ sh, color, twitch = 0 }) => {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const lines: THREE.Vector3[][] = [];
    const widths: number[] = [];
    const normals: THREE.Vector3[] = [];
    const y0 = sh.noseY - 0.0125;
    for (let i = 0; i < 180; i++) {
      const x = (hash(i * 1.7) - 0.5) * sh.mouthW * 1.08;
      const y = y0 - hash(i * 2.3) * 0.009 - 0.004 * (Math.abs(x) / (sh.mouthW * 0.5)) ** 2;
      const f = frontZ(sh, x, y);
      const root = f.p.clone().addScaledVector(f.dir, 0.0008);
      const dir = new THREE.Vector3(Math.sign(x) * (0.25 + 0.6 * Math.abs(x) / sh.mouthW), -1, 0.35).normalize();
      const len = 0.011 + 0.006 * hash(i * 3.1);
      const pts = [0, 0.33, 0.66, 1].map((s) => root.clone().addScaledVector(dir, len * s).addScaledVector(f.dir, 0.002 * Math.sin(Math.PI * s)));
      lines.push(pts);
      widths.push(0.0028);
      normals.push(f.dir.clone());
    }
    return ribbonGeometry(g, lines, widths, normals);
  }, [sh]);
  return <mesh geometry={geo} material={hairMat(color)} position={[0, 0.0008 * twitch, 0]} />;
};

/** The gum: a pink wad on the lower teeth, stretched in strings to the upper ones as the jaw drops. */
export const Gum: React.FC<{ sh: Shape; jaw: number; side?: number }> = ({ sh, jaw, side = 1 }) => {
  const m = (mats.gum ??= new THREE.MeshPhysicalMaterial({ color: "#F58FB8", roughness: 0.35, clearcoat: 0.6 }));
  const mz = frontZ(sh, 0, sh.mouthY).p.z;
  const open = 0.036 * jaw;
  const x = side * sh.mouthW * 0.16;
  const yUp = sh.mouthY + 0.0005;
  const yLo = sh.mouthY - open - 0.002;
  const len = yUp - yLo;
  return (
    <group>
      <mesh material={m} position={[x, yLo + 0.002, mz - 0.011]} scale={[0.0085, 0.0045, 0.006]}>
        <sphereGeometry args={[1, 14, 10]} />
      </mesh>
      {jaw > 0.12
        ? [-0.004, 0.004].map((dx) => (
            <mesh key={dx} material={m} position={[x + dx, (yUp + yLo) / 2, mz - 0.0095]} scale={[1, len, 1]}>
              <cylinderGeometry args={[0.0011, 0.0011, 1, 6]} />
            </mesh>
          ))
        : null}
    </group>
  );
};

/** The edit's glowing eyes: a hot point in each pupil (the bloom makes the glow). */
export const EyeGlow: React.FC<{ sh: Shape; k: number; color?: string }> = ({ sh, k, color = "#BFE3FF" }) => {
  if (k <= 0.01) return null;
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2 + 14 * k), toneMapped: true });
  return (
    <group>
      {[-1, 1].map((s) => {
        const c = eyeCentre(sh, s);
        return (
          <mesh key={s} material={m} position={[c.x, c.y, c.z + sh.eyeR + 0.0006]} scale={0.0022 + 0.0016 * k}>
            <sphereGeometry args={[1, 10, 8]} />
          </mesh>
        );
      })}
    </group>
  );
};
