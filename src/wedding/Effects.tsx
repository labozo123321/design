import React, { useMemo } from "react";
import * as THREE from "three";
import { HATLADY, OUTFITS } from "./cast";
import { Hat } from "./Figure";
import { hatFlight } from "./People";
import { CAKE_TIERS, TOWER } from "./Treats";
import { rose } from "./Flowers";
import { CUE_W, L, boxAtW, droneAtW, hash } from "./flight";

/**
 * What the drone breaks:
 *  - the hat lady's hat, blown off by the props;
 *  - the champagne tower: every coupe the drone (or the swinging box) actually touches bursts into shards
 *    and a splash of champagne, the ones resting on them come down too; all of it on ballistic paths,
 *    bouncing off the tablecloth or the floor (slow motion makes a glittering cloud of it);
 *  - the cake: the top tiers burst into sponge, frosting and sugar roses, flung outward from where the drone
 *    goes in.
 */

const G = 9.81;
const TABLE_Y = 0.765;
const FLOOR_Y = 0.03;

/** Fall from p0 with v0 for a seconds, bouncing once on whatever is under it (table top or floor). */
const ballistic = (p0: THREE.Vector3, v0: THREE.Vector3, a: number, out: THREE.Vector3, onTable: (x: number, z: number) => boolean, rest = 0.25) => {
  out.copy(p0).addScaledVector(v0, a);
  out.y -= 0.5 * G * a * a;
  const ground = onTable(out.x, out.z) ? TABLE_Y : FLOOR_Y;
  if (out.y < ground) {
    // time it reached the ground, then a damped bounce and a slide to rest
    const A = 0.5 * G;
    const B = -v0.y;
    const C = ground - p0.y;
    const disc = B * B - 4 * A * C;
    const t1 = disc > 0 ? (-B + Math.sqrt(disc)) / (2 * A) : a;
    const vy = Math.abs(v0.y - G * t1) * rest;
    const dt = a - t1;
    const hx = p0.x + v0.x * t1;
    const hz = p0.z + v0.z * t1;
    const slide = Math.min(dt, 0.25) * 0.4;
    out.set(hx + v0.x * slide, ground + Math.max(0, vy * dt - 0.5 * G * dt * dt), hz + v0.z * slide);
  }
  return out;
};

const onTowerTable = (x: number, z: number) => Math.abs(x - L.towerTable[0]) < 0.7 && Math.abs(z - L.towerTable[1]) < 0.475;
const onCakeTable = (x: number, z: number) => Math.hypot(x - L.cakeTable[0], z - L.cakeTable[1]) < 0.75;

/* ------------------------------------------------------------------ */
/* Which glasses break, and when                                         */
/* ------------------------------------------------------------------ */

export const GLASS_BREAK: (number | null)[] = (() => {
  const hit: (number | null)[] = TOWER.map(() => null);
  const w0 = CUE_W.towerHit - 0.6;
  const w1 = CUE_W.towerHit + 0.9;
  for (let w = w0; w <= w1; w += 0.004) {
    const d = droneAtW(w);
    const b = boxAtW(w);
    TOWER.forEach((g, i) => {
      if (hit[i] !== null) return;
      const c = g.p.clone().add(new THREE.Vector3(0, 0.1, 0));
      if (c.distanceTo(d) < 0.3 || c.distanceTo(b) < 0.1) hit[i] = w;
    });
  }
  // a glass resting on a broken one comes down a moment later
  for (let pass = 0; pass < 5; pass++)
    TOWER.forEach((g, i) => {
      if (hit[i] !== null || g.tier === 0) return;
      let t: number | null = null;
      TOWER.forEach((h, j) => {
        if (h.tier !== g.tier - 1 || hit[j] === null) return;
        if (Math.abs(h.p.x - g.p.x) < L.tower.pitch * 0.6 && Math.abs(h.p.z - g.p.z) < L.tower.pitch * 0.6) t = Math.max(t ?? 0, (hit[j] as number) + 0.06);
      });
      if (t !== null) hit[i] = t;
    });
  return hit;
})();

const shardGeo = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.4, 0, 0.55, -0.25, 0, 0.05, 0.6, 0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  return g;
};

const SHARDS = 16;
const DROPS = 48;

export const TowerBurst: React.FC<{ w: number }> = ({ w }) => {
  const objs = useMemo(() => {
    const broken = GLASS_BREAK.map((t, i) => ({ t, i })).filter((x) => x.t !== null) as { t: number; i: number }[];
    const shards = new THREE.InstancedMesh(
      shardGeo(),
      new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.02, transparent: true, opacity: 0.45, clearcoat: 1, specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2.2 }),
      broken.length * SHARDS,
    );
    const drops = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.MeshPhysicalMaterial({ color: "#F6D88A", roughness: 0.0, transparent: true, opacity: 0.42, clearcoat: 1, specularIntensity: 1, envMapIntensity: 3, depthWrite: false }),
      broken.length * DROPS,
    );
    // each piece's launch: offset, velocity, spin, size
    const pieces = broken.map(({ t, i }) => {
      const P = TOWER[i].p.clone().add(new THREE.Vector3(0, 0.1, 0));
      const d0 = droneAtW(t - 0.01);
      const d1 = droneAtW(t + 0.01);
      const vd = d1.clone().sub(d0).divideScalar(0.02);
      const push = P.clone().sub(d1).setY(0).normalize();
      const r = (k: number) => hash(i * 97.1 + k * 3.7);
      const sh = Array.from({ length: SHARDS }, (_, s) => ({
        off: new THREE.Vector3((r(s * 5) - 0.5) * 0.09, (r(s * 5 + 1) - 0.3) * 0.08, (r(s * 5 + 2) - 0.5) * 0.09),
        v: vd.clone().multiplyScalar(0.35 + 0.4 * r(s * 5 + 3)).addScaledVector(push, 0.6 + 1.6 * r(s * 7)).add(new THREE.Vector3((r(s * 9) - 0.5) * 1.6, 0.4 + 1.6 * r(s * 11), (r(s * 13) - 0.5) * 1.6)),
        spin: new THREE.Vector3(r(s * 17) - 0.5, r(s * 19) - 0.5, r(s * 23) - 0.5).multiplyScalar(30),
        size: 0.008 + 0.024 * r(s * 29),
      }));
      const dr = Array.from({ length: DROPS }, (_, s) => ({
        off: new THREE.Vector3((r(s * 31) - 0.5) * 0.06, 0.01 + r(s * 37) * 0.03, (r(s * 41) - 0.5) * 0.06),
        v: vd.clone().multiplyScalar(0.45 + 0.45 * r(s * 43)).addScaledVector(push, 0.3 + 1.2 * r(s * 47)).add(new THREE.Vector3((r(s * 53) - 0.5) * 1.2, 0.2 + 1.4 * r(s * 59), (r(s * 61) - 0.5) * 1.2)),
        size: r(s * 67) < 0.12 ? 0.003 + 0.003 * r(s * 71) : 0.0009 + 0.0018 * r(s * 73),
      }));
      return { t, P, sh, dr };
    });
    shards.frustumCulled = false;
    drops.frustumCulled = false;
    shards.renderOrder = 8;
    drops.renderOrder = 7;
    return { shards, drops, pieces };
  }, []);
  if (w < CUE_W.towerHit - 0.7 || w > CUE_W.towerHit + 30) return null;
  const tmp = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  objs.pieces.forEach((pc, k) => {
    const a = w - pc.t;
    pc.sh.forEach((s, j) => {
      const idx = k * SHARDS + j;
      if (a < 0) {
        objs.shards.setMatrixAt(idx, zero);
        return;
      }
      ballistic(pc.P.clone().add(s.off), s.v, a, tmp, onTowerTable, 0.2);
      const settled = Math.min(a, 0.9);
      q.setFromEuler(new THREE.Euler(s.spin.x * settled, s.spin.y * settled, s.spin.z * settled));
      m.compose(tmp, q, new THREE.Vector3(s.size, s.size, s.size));
      objs.shards.setMatrixAt(idx, m);
    });
    pc.dr.forEach((d, j) => {
      const idx = k * DROPS + j;
      if (a < 0 || a > 1.4) {
        objs.drops.setMatrixAt(idx, zero);
        return;
      }
      ballistic(pc.P.clone().add(d.off), d.v, a, tmp, onTowerTable, 0.0);
      // a drop that has landed is a little puddle
      const landed = tmp.y < TABLE_Y + 0.004 || tmp.y < FLOOR_Y + 0.004;
      const vel = d.v.clone().add(new THREE.Vector3(0, -G * a, 0));
      const stretch = landed ? 0.3 : 1 + Math.min(2.5, vel.length() * 0.35);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vel.normalize());
      m.compose(tmp, q, new THREE.Vector3(d.size * (landed ? 2 : 1), d.size * stretch, d.size * (landed ? 2 : 1)));
      objs.drops.setMatrixAt(idx, m);
    });
  });
  objs.shards.instanceMatrix.needsUpdate = true;
  objs.drops.instanceMatrix.needsUpdate = true;
  return (
    <>
      <primitive object={objs.shards} />
      <primitive object={objs.drops} />
    </>
  );
};

/* ------------------------------------------------------------------ */
/* The cake                                                              */
/* ------------------------------------------------------------------ */

const CHUNKS = 90;
const BLOBS = 110;
const ROSES = 14;
const CRUMBS = 220;

export const CakeBurst: React.FC<{ w: number }> = ({ w }) => {
  const objs = useMemo(() => {
    const lumpy = (seed: number, detail = 1) => {
      const g = new THREE.IcosahedronGeometry(1, detail);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const k = 0.75 + 0.5 * hash(i * 1.7 + seed);
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      return g;
    };
    const sponge = new THREE.InstancedMesh(lumpy(3), new THREE.MeshStandardMaterial({ color: "#F2D9A0", roughness: 0.95 }), CHUNKS);
    const blob = new THREE.InstancedMesh(lumpy(7, 2), new THREE.MeshPhysicalMaterial({ color: "#FFF8EC", roughness: 0.38, clearcoat: 0.4, sheen: 0.5 }), BLOBS);
    const roses = new THREE.InstancedMesh(rose(), new THREE.MeshPhysicalMaterial({ color: "#FBEFEA", roughness: 0.5, sheen: 0.8, side: THREE.DoubleSide }), ROSES);
    const crumbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: "#EBCB8A", roughness: 1 }), CRUMBS);
    for (const im of [sponge, blob, roses, crumbs]) {
      im.frustumCulled = false;
      im.castShadow = im !== crumbs;
    }
    // the impact point and the drone's direction there
    const tc = CUE_W.cakeHit;
    const hitP = droneAtW(tc);
    const dirV = droneAtW(tc + 0.02).sub(droneAtW(tc - 0.02)).divideScalar(0.04);
    const fwd = dirV.clone().setY(0).normalize();
    const top = CAKE_TIERS[CAKE_TIERS.length - 1];
    const lowY = CAKE_TIERS[1].c.y;
    const highY = top.c.y + top.h;
    const mk = (n: number, seed: number, speed: number, sizeMin: number, sizeMax: number) =>
      Array.from({ length: n }, (_, i) => {
        const r = (k: number) => hash(seed * 31.3 + i * 7.77 + k * 1.91);
        const y = lowY + r(1) * (highY - lowY);
        const tier = CAKE_TIERS.find((t) => y >= t.c.y && y < t.c.y + t.h) ?? top;
        const a = r(2) * Math.PI * 2;
        const rr = Math.sqrt(r(3)) * tier.r;
        const p = new THREE.Vector3(tier.c.x + Math.cos(a) * rr, y, tier.c.z + Math.sin(a) * rr);
        const out = p.clone().sub(hitP).setY(0);
        const ol = Math.max(0.05, out.length());
        out.divideScalar(ol);
        const v = out
          .multiplyScalar(speed * (0.5 + r(4)) * (1.2 - Math.min(1, ol / 0.5) * 0.4))
          .addScaledVector(fwd, speed * (0.4 + 0.8 * r(5)))
          .add(new THREE.Vector3(0, speed * (0.3 + 0.9 * r(6)), 0));
        return { p, v, spin: new THREE.Vector3(r(7) - 0.5, r(8) - 0.5, r(9) - 0.5).multiplyScalar(14), size: sizeMin + (sizeMax - sizeMin) * r(10) };
      });
    return {
      sponge,
      blob,
      roses,
      crumbs,
      list: {
        sponge: mk(CHUNKS, 1, 2.3, 0.018, 0.05),
        blob: mk(BLOBS, 2, 2.6, 0.012, 0.04),
        roses: mk(ROSES, 3, 2.0, 0.035, 0.05),
        crumbs: mk(CRUMBS, 4, 3.2, 0.003, 0.008),
      },
    };
  }, []);
  if (w < CUE_W.cakeHit - 0.05) return null;
  const a = w - CUE_W.cakeHit;
  const tmp = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const place = (im: THREE.InstancedMesh, list: { p: THREE.Vector3; v: THREE.Vector3; spin: THREE.Vector3; size: number }[], squash: boolean) => {
    list.forEach((it, i) => {
      if (a < 0) {
        im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
        return;
      }
      ballistic(it.p, it.v, a, tmp, onCakeTable, 0.12);
      const s = Math.min(a, 0.7);
      q.setFromEuler(new THREE.Euler(it.spin.x * s, it.spin.y * s, it.spin.z * s));
      const landed = tmp.y <= TABLE_Y + 0.02 || tmp.y <= FLOOR_Y + 0.02;
      // frosting splats when it lands
      const sc = squash && landed ? new THREE.Vector3(it.size * 1.5, it.size * 0.45, it.size * 1.5) : new THREE.Vector3(it.size, it.size, it.size);
      m.compose(tmp, q, sc);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
  };
  place(objs.sponge, objs.list.sponge, false);
  place(objs.blob, objs.list.blob, true);
  place(objs.roses, objs.list.roses, false);
  place(objs.crumbs, objs.list.crumbs, false);
  return (
    <>
      <primitive object={objs.sponge} />
      <primitive object={objs.blob} />
      <primitive object={objs.roses} />
      <primitive object={objs.crumbs} />
      <CakeCrater />
    </>
  );
};

/** What's left round the drone in the cake: a torn rim of sponge and frosting on the bottom tier (none of it
 * right on the lens, or between the lens and the dog on its chair). */
const CakeCrater: React.FC = () => {
  const objs = useMemo(() => {
    const t0 = CAKE_TIERS[0];
    const grp = new THREE.Group();
    const sponge = new THREE.MeshStandardMaterial({ color: "#F2D9A0", roughness: 0.95 });
    const cream = new THREE.MeshPhysicalMaterial({ color: "#FFF8EC", roughness: 0.38, clearcoat: 0.4, sheen: 0.5 });
    const top = t0.c.y + t0.h;
    const lens = droneAtW(CUE_W.feedBack);
    const toDog = new THREE.Vector3(L.dogEnd[0] - lens.x, 0, L.dogEnd[2] - lens.z).normalize();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + hash(i) * 0.2;
      const r = t0.r * (0.55 + 0.35 * hash(i * 3.1));
      const s = 0.03 + 0.04 * hash(i * 5.7);
      const at = new THREE.Vector3(t0.c.x + Math.cos(a) * r, top, t0.c.z + Math.sin(a) * r);
      const rel = at.clone().sub(lens).setY(0);
      if (rel.length() < 0.11 + s || rel.clone().normalize().dot(toDog) > Math.cos(0.75)) continue;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hash(i * 7.3) < 0.5 ? sponge : cream);
      m.position.set(t0.c.x + Math.cos(a) * r, top + s * 0.4, t0.c.z + Math.sin(a) * r);
      m.scale.set(s * 1.3, s * (0.6 + hash(i * 9.1) * 0.8), s * 1.3);
      m.rotation.set(hash(i) * 3, hash(i * 2) * 3, hash(i * 4) * 3);
      m.castShadow = true;
      grp.add(m);
    }
    // and the smashed top it's lying in: dollops of cream, crumbs of sponge, a petal of a sugar rose, low
    // enough not to get in the way of anything
    const petal = new THREE.MeshPhysicalMaterial({ color: "#F6D9D6", roughness: 0.5, sheen: 0.6 });
    for (let i = 0; i < 46; i++) {
      const a = hash(i * 13.1) * Math.PI * 2;
      const r = Math.sqrt(hash(i * 17.9)) * t0.r * 0.95;
      const p = new THREE.Vector3(t0.c.x + Math.cos(a) * r, top, t0.c.z + Math.sin(a) * r);
      if (p.clone().sub(lens).setY(0).length() < 0.05) continue;
      const kind = i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0;
      const s = kind === 0 ? 0.008 + 0.014 * hash(i * 3.3) : kind === 1 ? 0.004 + 0.006 * hash(i * 3.7) : 0.012;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, kind === 1 ? 0 : 1), kind === 0 ? cream : kind === 1 ? sponge : petal);
      m.position.copy(p).add(new THREE.Vector3(0, s * 0.25, 0));
      m.scale.set(s * (kind === 2 ? 1.4 : 1.2), s * (kind === 0 ? 0.45 : kind === 2 ? 0.12 : 0.8), s * (kind === 2 ? 0.9 : 1.2));
      m.rotation.set(kind === 2 ? 0.2 : hash(i) * 3, hash(i * 2.3) * 6, kind === 2 ? 0.1 : hash(i * 4.1) * 3);
      grp.add(m);
    }
    return grp;
  }, []);
  return <primitive object={objs} />;
};

/* ------------------------------------------------------------------ */
/* The hat                                                               */
/* ------------------------------------------------------------------ */

export const FlyingHat: React.FC<{ w: number }> = ({ w }) => {
  const f = hatFlight(w);
  if (!f) return null;
  const hat = OUTFITS.hatlady.hat!;
  return (
    <group position={f.p} rotation={[f.tilt, f.spin, f.tilt * 0.5]}>
      {/* the Hat is built in head space round the crown: move it so the brim sits at the origin */}
      <group position={[0, -HATLADY.shape.h * 0.36, 0]}>
        <Hat hat={hat} who={HATLADY} />
      </group>
    </group>
  );
};
