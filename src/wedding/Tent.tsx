import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { L, hash } from "./flight";
import { chairGeometry, cushionGeometry } from "./Ceremony";
import { bloomMeshes, bouquet, type Bloom } from "./Flowers";

/**
 * The reception tent on the lawn: a white frame tent with a gabled roof and a scalloped valance, the
 * sidewalls tied back at the poles, an oak floor with a darker dance floor, round tables laid for dinner
 * (cloths to the floor, plates, glasses, cutlery, napkins, low flowers and tall candles), festoon lights
 * zigzagging under the roof, a crystal chandelier over the dance floor, and the DJ's booth.
 * (The cake and the champagne tower are in Treats.tsx: they get broken.)
 */

const T = L.tent;
const XM = (T.x0 + T.x1) / 2;
const roofY = (x: number) => T.ridge + (T.eave - T.ridge) * Math.min(1, Math.abs(x - XM) / ((T.x1 - T.x0) / 2));

/* ------------------------------------------------------------------ */
/* Structure                                                             */
/* ------------------------------------------------------------------ */

const fabric = () =>
  new THREE.MeshStandardMaterial({ color: "#FBF8F2", roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color("#FFE2B8"), emissiveIntensity: 0.12 });

const roofGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  const len = T.z1 - T.z0;
  const half = (T.x1 - T.x0) / 2;
  const slope = Math.hypot(half, T.ridge - T.eave);
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(slope + 0.25, len + 0.4, 10, 30);
    // a slight sag between the rafters
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const zz = p.getY(i);
      const rafter = (T.z1 - T.z0) / 6;
      const ph = ((zz + len / 2) / rafter) % 1;
      p.setZ(i, -0.06 * Math.sin(Math.PI * ph));
    }
    g.computeVertexNormals();
    g.rotateX(-Math.PI / 2);
    g.rotateZ(sx * Math.atan2(T.ridge - T.eave, half));
    g.translate(XM + (sx * half) / 2, (T.ridge + T.eave) / 2, (T.z0 + T.z1) / 2);
    parts.push(g);
  }
  // gable ends (triangles)
  for (const z of [T.z0, T.z1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(0, T.ridge - T.eave);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.translate(XM, T.eave, z);
    parts.push(g);
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
};

/** The scalloped valance hanging under the eaves all round. */
const valanceGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  const edge = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b);
    const n = Math.round(len / 0.5);
    const g = new THREE.PlaneGeometry(len, 0.32, n * 6, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      if (y < 0) {
        const ph = ((x + len / 2) / 0.5) % 1;
        p.setY(i, y + 0.12 * (1 - Math.sin(Math.PI * ph)));
      }
    }
    g.translate(0, -0.16, 0);
    const dir = b.clone().sub(a).normalize();
    g.rotateY(-Math.atan2(dir.z, dir.x));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    parts.push(g);
  };
  const y = T.eave;
  edge(new THREE.Vector3(T.x0, y, T.z0), new THREE.Vector3(T.x0, y, T.z1));
  edge(new THREE.Vector3(T.x1, y, T.z0), new THREE.Vector3(T.x1, y, T.z1));
  edge(new THREE.Vector3(T.x0, y, T.z0), new THREE.Vector3(T.x1, y, T.z0));
  edge(new THREE.Vector3(T.x0, y, T.z1), new THREE.Vector3(T.x1, y, T.z1));
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
};

/** Poles at the sides and ends, the rafters and the ridge beam (aluminium). */
const frameGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const d = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(r, r, d.length(), 8);
    g.translate(0, d.length() / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push(g);
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const nz = 6;
  for (let i = 0; i <= nz; i++) {
    const z = T.z0 + ((T.z1 - T.z0) * i) / nz;
    rod(v(T.x0, 0, z), v(T.x0, T.eave, z), 0.05);
    rod(v(T.x1, 0, z), v(T.x1, T.eave, z), 0.05);
    // rafters up to the ridge
    rod(v(T.x0, T.eave, z), v(XM, T.ridge - 0.05, z), 0.035);
    rod(v(T.x1, T.eave, z), v(XM, T.ridge - 0.05, z), 0.035);
  }
  for (const z of [T.z0, T.z1])
    for (let x = T.x0 + 4; x < T.x1 - 0.5; x += 4) rod(v(x, 0, z), v(x, roofY(x) - 0.05, z), 0.045);
  rod(v(XM, T.ridge - 0.05, T.z0), v(XM, T.ridge - 0.05, T.z1), 0.04);
  rod(v(T.x0, T.eave, T.z0), v(T.x0, T.eave, T.z1), 0.035);
  rod(v(T.x1, T.eave, T.z0), v(T.x1, T.eave, T.z1), 0.035);
  // pole feet
  for (let i = 0; i <= nz; i++) {
    const z = T.z0 + ((T.z1 - T.z0) * i) / nz;
    for (const x of [T.x0, T.x1]) {
      const f = new THREE.BoxGeometry(0.22, 0.02, 0.22);
      f.translate(x, 0.01, z);
      parts.push(f);
    }
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
};

/** A sidewall curtain gathered and tied back against a pole: a fat, folded column of fabric. */
const curtainGeometry = () => {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    const y = u * T.eave;
    // pinched at the tie (1.2 m), full above and below
    const r = 0.16 + 0.1 * Math.abs(Math.sin(u * Math.PI * 1.4)) - 0.11 * Math.exp(-(((y - 1.2) / 0.12) ** 2));
    prof.push(new THREE.Vector2(r, y));
  }
  const g = new THREE.LatheGeometry(prof, 18);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.12 * Math.sin(a * 7);
    p.setX(i, x * k);
    p.setZ(i, z * k * 0.6);
  }
  g.computeVertexNormals();
  return g;
};

/** Oak floorboards, and the dance floor's darker parquet. */
const floorTex = (dark: boolean) => {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const rows = 16;
  for (let r = 0; r < rows; r++) {
    let x = -hash(r) * 200;
    while (x < 512) {
      const w = 120 + hash(r * 31 + x) * 160;
      const l = dark ? 70 + hash(r * 7 + x) * 25 : 175 + hash(r * 7 + x) * 35;
      g.fillStyle = dark ? `rgb(${l * 0.55},${l * 0.36},${l * 0.24})` : `rgb(${l * 0.93},${l * 0.76},${l * 0.55})`;
      g.fillRect(x, r * 32, w - 2, 30);
      // grain
      for (let k = 0; k < 10; k++) {
        g.strokeStyle = `rgba(0,0,0,${0.04 + hash(k + r * 3 + x) * 0.06})`;
        g.beginPath();
        const yy = r * 32 + 3 + hash(k * 7 + x) * 24;
        g.moveTo(x, yy);
        g.bezierCurveTo(x + w * 0.3, yy + 2, x + w * 0.6, yy - 2, x + w - 2, yy + 1);
        g.stroke();
      }
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/* ------------------------------------------------------------------ */
/* Tables                                                                */
/* ------------------------------------------------------------------ */

const clothGeometry = (r: number) => {
  // the top, then the drop to the floor with soft folds
  const prof: THREE.Vector2[] = [new THREE.Vector2(0, 0.765), new THREE.Vector2(r, 0.765), new THREE.Vector2(r + 0.02, 0.74)];
  for (let i = 1; i <= 10; i++) {
    const u = i / 10;
    prof.push(new THREE.Vector2(r + 0.02 + 0.1 * u * u, 0.74 * (1 - u) + 0.005));
  }
  const g = new THREE.LatheGeometry(prof.reverse(), 72);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (y < 0.74) {
      const a = Math.atan2(z, x);
      const fold = 1 + 0.025 * Math.sin(a * 18) * (1 - y / 0.74);
      p.setX(i, x * fold);
      p.setZ(i, z * fold);
    }
  }
  g.computeVertexNormals();
  return g;
};

const glassProfile = (kind: "wine" | "water" | "flute") => {
  const pts: [number, number][] =
    kind === "wine"
      ? [
          [0.0, 0.0],
          [0.035, 0.0],
          [0.034, 0.004],
          [0.005, 0.01],
          [0.004, 0.08],
          [0.012, 0.09],
          [0.034, 0.12],
          [0.04, 0.16],
          [0.034, 0.21],
        ]
      : kind === "water"
        ? [
            [0.0, 0.0],
            [0.03, 0.0],
            [0.03, 0.004],
            [0.005, 0.01],
            [0.004, 0.05],
            [0.02, 0.06],
            [0.036, 0.1],
            [0.038, 0.16],
          ]
        : [
            [0.0, 0.0],
            [0.03, 0.0],
            [0.004, 0.01],
            [0.004, 0.1],
            [0.016, 0.115],
            [0.024, 0.16],
            [0.025, 0.22],
          ];
  return pts.map(([r, y]) => new THREE.Vector2(r, y));
};

export const glassMaterial = () =>
  new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

const Tables: React.FC = () => {
  const objs = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const R = L.tableR;
    const cloth = new THREE.InstancedMesh(clothGeometry(R), new THREE.MeshStandardMaterial({ color: "#FAF7F1", roughness: 0.92 }), L.tables.length);
    L.tables.forEach(([x, z], i) => cloth.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z)));
    // chairs: eight round each table, facing in
    const per = 8;
    const chairs = new THREE.InstancedMesh(chairGeometry(), new THREE.MeshStandardMaterial({ color: "#C8A458", roughness: 0.32, metalness: 0.85 }), L.tables.length * per);
    const cush = new THREE.InstancedMesh(cushionGeometry(), new THREE.MeshStandardMaterial({ color: "#F4F0E8", roughness: 0.95 }), L.tables.length * per);
    // place settings: charger, plate, napkin, knife and fork, wine and water glasses
    const n = L.tables.length * per;
    const plateGeo = new THREE.CylinderGeometry(0.135, 0.12, 0.012, 32);
    const chargerGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.008, 32);
    const napkinGeo = new THREE.ConeGeometry(0.05, 0.11, 3);
    const cutGeo = new THREE.BoxGeometry(0.016, 0.004, 0.2);
    const plates = new THREE.InstancedMesh(plateGeo, new THREE.MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.25 }), n);
    const chargers = new THREE.InstancedMesh(chargerGeo, new THREE.MeshStandardMaterial({ color: "#C9A55A", roughness: 0.3, metalness: 0.9 }), n);
    const napkins = new THREE.InstancedMesh(napkinGeo, new THREE.MeshStandardMaterial({ color: "#E9D9CF", roughness: 0.9 }), n);
    const cutlery = new THREE.InstancedMesh(cutGeo, new THREE.MeshStandardMaterial({ color: "#D8D8DC", roughness: 0.2, metalness: 1 }), n * 2);
    const glassM = glassMaterial();
    const wine = new THREE.InstancedMesh(new THREE.LatheGeometry(glassProfile("wine"), 20), glassM, n);
    const water = new THREE.InstancedMesh(new THREE.LatheGeometry(glassProfile("water"), 20), glassM, n);
    let k = 0;
    L.tables.forEach(([x, z], ti) => {
      for (let s = 0; s < per; s++) {
        const a = (s / per) * Math.PI * 2 + ti * 0.2;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const yaw = Math.atan2(dir.x, dir.z); // the chair's back faces outward
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
        const cp = new THREE.Vector3(x, 0, z).addScaledVector(dir, R + 0.38);
        chairs.setMatrixAt(k, new THREE.Matrix4().compose(cp, q, new THREE.Vector3(1, 1, 1)));
        cush.setMatrixAt(k, new THREE.Matrix4().compose(cp, q, new THREE.Vector3(1, 1, 1)));
        const pp = new THREE.Vector3(x, 0.772, z).addScaledVector(dir, R - 0.24);
        chargers.setMatrixAt(k, new THREE.Matrix4().makeTranslation(pp.x, pp.y, pp.z));
        plates.setMatrixAt(k, new THREE.Matrix4().makeTranslation(pp.x, pp.y + 0.01, pp.z));
        napkins.setMatrixAt(k, new THREE.Matrix4().compose(pp.clone().add(new THREE.Vector3(0, 0.07, 0)), q, new THREE.Vector3(1, 1, 1)));
        const side = new THREE.Vector3(dir.z, 0, -dir.x);
        for (const sd of [-1, 1]) cutlery.setMatrixAt(k * 2 + (sd > 0 ? 1 : 0), new THREE.Matrix4().compose(pp.clone().addScaledVector(side, sd * 0.2).setY(0.772), q, new THREE.Vector3(1, 1, 1)));
        const gp = pp.clone().addScaledVector(dir, -0.17).addScaledVector(side, 0.14).setY(0.766);
        wine.setMatrixAt(k, new THREE.Matrix4().makeTranslation(gp.x, gp.y, gp.z));
        const wp = gp.clone().addScaledVector(side, 0.09).addScaledVector(dir, 0.03);
        water.setMatrixAt(k, new THREE.Matrix4().makeTranslation(wp.x, wp.y, wp.z));
        k++;
      }
    });
    for (const im of [cloth, chairs, cush, plates, chargers, napkins, cutlery, wine, water]) {
      im.castShadow = im !== wine && im !== water;
      im.receiveShadow = true;
      im.frustumCulled = false;
      out.push(im);
    }
    // centrepieces: a low bowl of roses and three tall white candles in glass
    const blooms: Bloom[] = [];
    L.tables.forEach(([x, z], ti) => blooms.push(...bouquet(new THREE.Vector3(x, 0.86, z), 0.36, 700 + ti, { roses: 16, spread: 1.35 })));
    out.push(...bloomMeshes(blooms));
    const candleGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.3, 12);
    candleGeo.translate(0, 0.15, 0);
    const flameGeo = new THREE.SphereGeometry(0.011, 8, 6);
    flameGeo.scale(1, 2.2, 1);
    const candles = new THREE.InstancedMesh(candleGeo, new THREE.MeshStandardMaterial({ color: "#F7F1E6", roughness: 0.5, emissive: new THREE.Color("#FFB070"), emissiveIntensity: 0.2 }), L.tables.length * 3);
    const flames = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.1, 0.9) }), L.tables.length * 3);
    L.tables.forEach(([x, z], ti) => {
      for (let c = 0; c < 3; c++) {
        const a = (c / 3) * Math.PI * 2 + ti;
        const px = x + Math.cos(a) * 0.3;
        const pz = z + Math.sin(a) * 0.3;
        const hgt = 0.2 + c * 0.05;
        candles.setMatrixAt(ti * 3 + c, new THREE.Matrix4().compose(new THREE.Vector3(px, 0.772, pz), new THREE.Quaternion(), new THREE.Vector3(1, hgt / 0.3, 1)));
        flames.setMatrixAt(ti * 3 + c, new THREE.Matrix4().makeTranslation(px, 0.772 + hgt + 0.025, pz));
      }
    });
    candles.castShadow = true;
    out.push(candles, flames);
    return out;
  }, []);
  return (
    <>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Lights: festoons and the chandelier                                   */
/* ------------------------------------------------------------------ */

const Festoons: React.FC = () => {
  const objs = useMemo(() => {
    const bulbs: THREE.Vector3[] = [];
    const wires: THREE.BufferGeometry[] = [];
    // strands zigzag across the tent between the eaves, sagging
    const strands = 9;
    for (let s = 0; s < strands; s++) {
      const z0 = T.z0 + 0.6 + ((T.z1 - T.z0 - 1.2) * s) / (strands - 1);
      const z1 = T.z0 + 0.6 + ((T.z1 - T.z0 - 1.2) * (s + 0.5)) / (strands - 1);
      const a = new THREE.Vector3(T.x0 + 0.1, T.eave + 0.25, z0);
      const b = new THREE.Vector3(T.x1 - 0.1, T.eave + 0.25, Math.min(T.z1 - 0.6, z1));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        const p = a.clone().lerp(b, u);
        p.y = Math.min(roofY(p.x) - 0.35, p.y + 1.1 * Math.sin(Math.PI * u) * 0.9) - 0.45 * Math.sin(Math.PI * u);
        pts.push(p);
      }
      wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.006, 4, false));
      for (let i = 1; i < 40; i++) bulbs.push(pts[i].clone().add(new THREE.Vector3(0, -0.06, 0)));
    }
    const wire = new THREE.Mesh(mergeGeometries(wires)!, new THREE.MeshStandardMaterial({ color: "#1C1C1C", roughness: 0.6 }));
    const bulbGeo = new THREE.SphereGeometry(0.03, 10, 8);
    bulbGeo.scale(1, 1.25, 1);
    const im = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.9, 1.5) }), bulbs.length);
    bulbs.forEach((p, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    im.frustumCulled = false;
    return [wire, im];
  }, []);
  return (
    <>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
};

export const Chandelier: React.FC<{ swing: number }> = ({ swing }) => {
  const g = useMemo(() => {
    const grp = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: "#C9A55A", roughness: 0.25, metalness: 1 });
    const crystal = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.0, transparent: true, opacity: 0.55, clearcoat: 1, specularIntensity: 1, envMapIntensity: 2.5 });
    const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.8) });
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6), brass);
    chain.position.y = 0.6;
    grp.add(chain);
    for (const [r, y, n] of [
      [0.45, 0.0, 10],
      [0.32, -0.22, 8],
      [0.18, -0.42, 6],
    ] as [number, number, number][]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 48), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      grp.add(ring);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), new THREE.MeshStandardMaterial({ color: "#F7F2E8" }));
        c.position.set(Math.cos(a) * r, y + 0.045, Math.sin(a) * r);
        grp.add(c);
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), bulb);
        b.scale.set(1, 1.5, 1);
        b.position.set(Math.cos(a) * r, y + 0.1, Math.sin(a) * r);
        grp.add(b);
        // strings of crystal drops
        for (let d = 0; d < 4; d++) {
          const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.016 + (d === 3 ? 0.01 : 0), 0), crystal);
          drop.scale.set(1, 1.6, 1);
          drop.position.set(Math.cos(a + 0.3) * r, y - 0.04 - d * 0.045, Math.sin(a + 0.3) * r);
          grp.add(drop);
        }
      }
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, r * 2, 6), brass);
      spoke.rotation.z = Math.PI / 2;
      spoke.position.y = y;
      grp.add(spoke);
    }
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), crystal);
    finial.position.y = -0.62;
    finial.scale.set(1, 1.4, 1);
    grp.add(finial);
    return grp;
  }, []);
  const [cx, cy, cz] = L.chandelier;
  return (
    <group position={[cx, cy + 0.6 + 1.2, cz]} rotation={[swing * 0.6, 0, swing]}>
      <group position={[0, -1.2 - 0.6, 0]}>
        <primitive object={g} />
      </group>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* The DJ's booth                                                       */
/* ------------------------------------------------------------------ */

const DJBooth: React.FC<{ t: number }> = ({ t }) => {
  const objs = useMemo(() => {
    const grp = new THREE.Group();
    const [bx, bz] = L.dj.booth;
    const white = new THREE.MeshStandardMaterial({ color: "#F2F2F2", roughness: 0.4 });
    const black = new THREE.MeshStandardMaterial({ color: "#151517", roughness: 0.5 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 1.7), white);
    desk.position.set(bx, 0.5, bz);
    desk.castShadow = true;
    grp.add(desk);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 1.75), black);
    top.position.set(bx, 1.02, bz);
    grp.add(top);
    const mixer = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.9), black);
    mixer.position.set(bx + 0.1, 1.07, bz);
    grp.add(mixer);
    // the laptop, open, glowing
    const lap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.015, 0.34), new THREE.MeshStandardMaterial({ color: "#B8BABE", metalness: 0.8, roughness: 0.3 }));
    lap.position.set(bx + 0.18, 1.1, bz + 0.62);
    grp.add(lap);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.21), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.65, 0.95) }));
    screen.position.set(bx + 0.3, 1.2, bz + 0.62);
    screen.rotation.y = -Math.PI / 2 - 0.0;
    screen.rotation.z = -0.25;
    grp.add(screen);
    // speakers on stands either side
    for (const sz of [-1, 1]) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 8), black);
      stand.position.set(bx - 0.2, 0.65, bz + sz * 1.6);
      grp.add(stand);
      const spk = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 0.36), black);
      spk.position.set(bx - 0.2, 1.55, bz + sz * 1.6);
      spk.castShadow = true;
      grp.add(spk);
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshStandardMaterial({ color: "#2A2A2E", roughness: 0.8 }));
      cone.position.set(bx - 0.365, 1.5, bz + sz * 1.6);
      cone.rotation.y = -Math.PI / 2;
      grp.add(cone);
    }
    // the LED strip along the front of the desk
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 1.6), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    led.position.set(bx - 0.38, 0.95, bz);
    grp.add(led);
    return { grp, led };
  }, []);
  // the LED strip cycles slowly through colours
  (objs.led.material as THREE.MeshBasicMaterial).color.setHSL((t * 0.15) % 1, 0.9, 0.55).multiplyScalar(2.5);
  return <primitive object={objs.grp} />;
};

/* ------------------------------------------------------------------ */
/* Everything                                                            */
/* ------------------------------------------------------------------ */

export const Tent: React.FC<{ t: number; swing: number }> = ({ t, swing }) => {
  const objs = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const roof = new THREE.Mesh(roofGeometry(), fabric());
    roof.castShadow = true;
    roof.receiveShadow = true;
    out.push(roof);
    const val = new THREE.Mesh(valanceGeometry(), fabric());
    val.castShadow = true;
    out.push(val);
    const frame = new THREE.Mesh(frameGeometry(), new THREE.MeshStandardMaterial({ color: "#E8E8EA", roughness: 0.35, metalness: 0.7 }));
    frame.castShadow = true;
    out.push(frame);
    // curtains tied back at every side pole
    const cg = curtainGeometry();
    const nz = 6;
    const cm = new THREE.InstancedMesh(cg, fabric(), (nz + 1) * 2);
    let k = 0;
    for (let i = 0; i <= nz; i++) {
      const z = T.z0 + ((T.z1 - T.z0) * i) / nz;
      for (const x of [T.x0, T.x1]) cm.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(x + (x < XM ? -0.12 : 0.12), 0, z));
    }
    cm.castShadow = true;
    out.push(cm);
    // floor: oak boards, and the dance floor
    const fl = new THREE.Mesh(new THREE.BoxGeometry(T.x1 - T.x0, 0.05, T.z1 - T.z0), new THREE.MeshStandardMaterial({ map: floorTex(false), roughness: 0.55 }));
    (fl.material as THREE.MeshStandardMaterial).map!.repeat.set((T.x1 - T.x0) / 3, (T.z1 - T.z0) / 3);
    fl.position.set(XM, 0.0, (T.z0 + T.z1) / 2);
    fl.receiveShadow = true;
    out.push(fl);
    const df = L.danceFloor;
    const dance = new THREE.Mesh(new THREE.BoxGeometry(df.x1 - df.x0, 0.012, df.z1 - df.z0), new THREE.MeshStandardMaterial({ map: floorTex(true), roughness: 0.25 }));
    (dance.material as THREE.MeshStandardMaterial).map!.repeat.set((df.x1 - df.x0) / 2, (df.z1 - df.z0) / 2);
    dance.position.set((df.x0 + df.x1) / 2, 0.031, (df.z0 + df.z1) / 2);
    dance.receiveShadow = true;
    out.push(dance);
    return out;
  }, []);
  return (
    <group>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      <Tables />
      <Festoons />
      <Chandelier swing={swing} />
      <DJBooth t={t} />
      {/* the warm light of the festoons and candles inside */}
      <pointLight position={[XM, 3.4, -4]} intensity={6} distance={14} decay={1.4} color="#FFC47E" />
      <pointLight position={[XM, 3.4, 5]} intensity={6} distance={14} decay={1.4} color="#FFC47E" />
    </group>
  );
};
