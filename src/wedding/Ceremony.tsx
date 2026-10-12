import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { L, hash } from "./flight";
import { ROSE_COLS, bloomMeshes, bouquet, type Bloom } from "./Flowers";

/**
 * The ceremony on the lawn: an arch of white-washed timber dressed with roses, greenery and chiffon that
 * stirs in the breeze; urns of flowers either side; gold chiavari chairs in two blocks with posies on the
 * aisle seats; the white runner strewn with petals; lanterns with candles along it.
 */

/* ------------------------------------------------------------------ */
/* Chiavari chair (gold), built at its feet, facing -z                   */
/* ------------------------------------------------------------------ */

export const chairGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const d = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(r, r, d.length(), 6, 1);
    g.translate(0, d.length() / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push(g);
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const sw = 0.2;
  const sd = 0.2;
  // legs, a little splayed
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) rod(v(sx * (sw + 0.015), 0, sz * (sd + 0.015)), v(sx * sw, 0.445, sz * sd), 0.011);
  // stretchers
  for (const y of [0.16, 0.3]) {
    rod(v(-sw, y, -sd), v(sw, y, -sd), 0.007);
    rod(v(-sw, y, sd), v(sw, y, sd), 0.007);
    rod(v(-sw, y, -sd), v(-sw, y, sd), 0.007);
    rod(v(sw, y, -sd), v(sw, y, sd), 0.007);
  }
  // seat frame
  const seat = new THREE.BoxGeometry(sw * 2 + 0.03, 0.025, sd * 2 + 0.03);
  seat.translate(0, 0.455, 0);
  parts.push(seat);
  // back: rear posts up, reclined a little, rails and five spindles
  const lean = 0.06;
  for (const sx of [-1, 1]) rod(v(sx * sw, 0.445, sd), v(sx * (sw - 0.015), 0.93, sd + lean), 0.011);
  for (const y of [0.62, 0.9]) {
    const z = sd + (lean * (y - 0.445)) / 0.485;
    rod(v(-sw + 0.01, y, z), v(sw - 0.01, y, z), 0.01);
  }
  for (let k = 0; k < 5; k++) {
    const x = -0.12 + k * 0.06;
    rod(v(x, 0.62, sd + (lean * 0.175) / 0.485), v(x, 0.9, sd + (lean * 0.455) / 0.485), 0.006);
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  g.computeVertexNormals();
  return g;
};

export const cushionGeometry = () => {
  const g = new THREE.BoxGeometry(0.4, 0.045, 0.4, 6, 2, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // puff the top
    const k = (1 - (x / 0.2) ** 2) * (1 - (z / 0.2) ** 2);
    p.setY(i, y > 0 ? y + 0.012 * k : y);
  }
  g.computeVertexNormals();
  g.translate(0, 0.49, 0);
  return g;
};

const GOLD = () => new THREE.MeshStandardMaterial({ color: "#C8A458", roughness: 0.32, metalness: 0.85 });
const CUSHION = () => new THREE.MeshStandardMaterial({ color: "#F4F0E8", roughness: 0.95 });

/* ------------------------------------------------------------------ */
/* The arch                                                              */
/* ------------------------------------------------------------------ */

const archBeams = () => {
  const parts: THREE.BufferGeometry[] = [];
  const { half, h } = L.arch;
  for (const sx of [-1, 1]) {
    const post = new THREE.BoxGeometry(0.11, h - 0.25, 0.11);
    post.translate(sx * half, (h - 0.25) / 2, 0);
    parts.push(post);
    const foot = new THREE.BoxGeometry(0.3, 0.06, 0.3);
    foot.translate(sx * half, 0.03, 0);
    parts.push(foot);
  }
  // the gently curved top beam
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const x = -half - 0.15 + u * (2 * half + 0.3);
    pts.push(new THREE.Vector3(x, h - 0.25 + 0.25 * Math.sin(Math.PI * u), 0));
  }
  parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.06, 8, false));
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  g.computeVertexNormals();
  return g;
};

/** The chiffon: two lengths hung from the beam, gathered at the corners, falling to the grass; stirring. */
const Drape: React.FC<{ t: number; side: number }> = ({ t, side }) => {
  const { half, h } = L.arch;
  const geo = useMemo(() => new THREE.PlaneGeometry(0.7, h, 12, 28), [h]);
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#FFFBF6",
        roughness: 0.7,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        sheen: 1,
        sheenColor: new THREE.Color("#FFF4E8"),
        depthWrite: false,
      }),
    [],
  );
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let j = 0; j <= 28; j++) {
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const v = j / 28; // 0 at the top
      const k = j * 13 + i;
      // from the beam's middle swagging toward the post, then hanging straight down the post's outside
      const top = h - 0.02 - 0.18 * Math.sin(Math.PI * u) * (1 - v);
      const x = side * (0.55 + u * (half - 0.5)) + side * 0.1 * v * u;
      const y = top - v * (h - 0.05) * (0.35 + 0.65 * u);
      const flutter = Math.sin(t * 1.3 + v * 4 + u * 3 + side) * 0.05 * v + Math.sin(t * 2.1 + v * 9) * 0.015 * v;
      const z = 0.08 + Math.sin(u * Math.PI * 3) * 0.04 * (1 - v) + flutter;
      p.setXYZ(k, x, Math.max(0.02, y), z);
    }
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return <mesh geometry={geo} material={mat} renderOrder={2} />;
};

/* ------------------------------------------------------------------ */
/* Everything                                                            */
/* ------------------------------------------------------------------ */

export const Ceremony: React.FC<{ t: number }> = ({ t }) => {
  const statics = useMemo(() => {
    const out: THREE.Object3D[] = [];
    // chairs and cushions
    const chairs = new THREE.InstancedMesh(chairGeometry(), GOLD(), L.chairs.length);
    const cush = new THREE.InstancedMesh(cushionGeometry(), CUSHION(), L.chairs.length);
    L.chairs.forEach(([x, z], i) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (hash(i) - 0.5) * 0.06, 0)), new THREE.Vector3(1, 1, 1));
      chairs.setMatrixAt(i, m);
      cush.setMatrixAt(i, m);
    });
    for (const im of [chairs, cush]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      out.push(im);
    }
    // the arch
    const arch = new THREE.Mesh(archBeams(), new THREE.MeshStandardMaterial({ color: "#EFE9DF", roughness: 0.8 }));
    arch.castShadow = true;
    arch.receiveShadow = true;
    out.push(arch);
    // flowers: heavy on the top-left corner, cascading down that post; a smaller spray top right; urns
    const blooms: Bloom[] = [];
    const { half, h } = L.arch;
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      blooms.push(...bouquet(new THREE.Vector3(-half + 0.1 + u * 0.9, h - 0.12 + 0.14 * Math.sin(Math.PI * Math.min(1, u * 0.7)), 0.03), 0.45 - u * 0.22, 100 + k, { dir: new THREE.Vector3(0, 0.6, 1) }));
    }
    for (let k = 0; k < 6; k++) blooms.push(...bouquet(new THREE.Vector3(-half - 0.05, h - 0.35 - k * 0.24, 0.05), 0.34 - k * 0.04, 200 + k, { dir: new THREE.Vector3(-0.3, 0.2, 1) }));
    for (let k = 0; k < 4; k++) blooms.push(...bouquet(new THREE.Vector3(half - 0.55 + k * 0.2, h - 0.08, 0.03), 0.3 - k * 0.03, 300 + k, { dir: new THREE.Vector3(0, 0.6, 1) }));
    for (const sx of [-1, 1]) blooms.push(...bouquet(new THREE.Vector3(sx * (half + 0.55), 0.95, 0.25), 0.7, 400 + sx, { roses: 30 }));
    // posies on the aisle chairs
    L.chairs.forEach(([x, z], i) => {
      if (Math.abs(Math.abs(x) - 1.05) < 0.01) blooms.push(...bouquet(new THREE.Vector3(x - Math.sign(x) * 0.215, 0.92, z + 0.22), 0.16, 500 + i, { roses: 5, dir: new THREE.Vector3(-Math.sign(x), 0.4, 0.3) }));
    });
    out.push(...bloomMeshes(blooms));
    // urns
    const urnProf = [
      [0.0, 0.0],
      [0.18, 0.0],
      [0.16, 0.08],
      [0.08, 0.16],
      [0.07, 0.32],
      [0.2, 0.52],
      [0.27, 0.72],
      [0.3, 0.76],
      [0.0, 0.76],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const urnGeo = new THREE.LatheGeometry(urnProf, 24);
    for (const sx of [-1, 1]) {
      const u = new THREE.Mesh(urnGeo, new THREE.MeshStandardMaterial({ color: "#D8D1C4", roughness: 0.7 }));
      u.position.set(sx * (half + 0.55), 0, 0.25);
      u.castShadow = true;
      out.push(u);
    }
    // the runner and its petals
    const { z0, z1, half: ah } = L.aisle;
    const run = new THREE.Mesh(new THREE.PlaneGeometry(ah * 2, z1 - z0), new THREE.MeshStandardMaterial({ color: "#F6F2EA", roughness: 0.9 }));
    run.rotation.x = -Math.PI / 2;
    run.position.set(0, 0.006, (z0 + z1) / 2);
    run.receiveShadow = true;
    out.push(run);
    const petalGeo = new THREE.CircleGeometry(0.022, 7);
    {
      const p = petalGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setZ(i, (p.getX(i) ** 2 + p.getY(i) ** 2) * 6);
      petalGeo.computeVertexNormals();
    }
    const NP = 900;
    const pet = new THREE.InstancedMesh(petalGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6, side: THREE.DoubleSide }), NP);
    for (let i = 0; i < NP; i++) {
      const x = (hash(i * 3.3) - 0.5) * 2 * ah * 1.15;
      const z = z0 + hash(i * 7.1) * (z1 - z0);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, 0.012, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (hash(i) - 0.5) * 0.5, hash(i * 5.3) * 6.28, 0, "YXZ")),
        new THREE.Vector3(1, 0.8 + hash(i * 2.2) * 0.5, 1),
      );
      pet.setMatrixAt(i, m);
      pet.setColorAt(i, new THREE.Color(ROSE_COLS[Math.floor(hash(i * 1.7) * ROSE_COLS.length)]).lerp(new THREE.Color("#C8364A"), hash(i * 9.9) < 0.25 ? 0.8 : 0));
    }
    pet.receiveShadow = true;
    pet.frustumCulled = false;
    out.push(pet);
    // lanterns along the aisle: a black frame, glass, a candle
    const frame = new THREE.MeshStandardMaterial({ color: "#1F1F22", roughness: 0.4, metalness: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.18 });
    const wax = new THREE.MeshStandardMaterial({ color: "#F6EFE2", roughness: 0.6, emissive: new THREE.Color("#FFB060"), emissiveIntensity: 0.25 });
    const flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 0.8) });
    for (let k = 0; k < 6; k++)
      for (const sx of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(sx * (ah + 0.12), 0, 2.6 + k * 2.4);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.2), glass);
        box.position.y = 0.19;
        g.add(box);
        for (const [x, z] of [
          [-0.1, -0.1],
          [0.1, -0.1],
          [-0.1, 0.1],
          [0.1, 0.1],
        ]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.36, 0.014), frame);
          r.position.set(x, 0.19, z);
          g.add(r);
        }
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.08, 4), frame);
        cap.rotation.y = Math.PI / 4;
        cap.position.y = 0.4;
        g.add(cap);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 12), frame);
        ring.position.y = 0.46;
        g.add(ring);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12), wax);
        c.position.y = 0.08;
        g.add(c);
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), flame);
        f.scale.set(1, 2, 1);
        f.position.y = 0.16;
        g.add(f);
        g.traverse((o) => {
          (o as THREE.Mesh).castShadow = o !== box;
        });
        out.push(g);
      }
    return out;
  }, []);
  return (
    <group>
      {statics.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      <Drape t={t} side={-1} />
      <Drape t={t} side={1} />
    </group>
  );
};
