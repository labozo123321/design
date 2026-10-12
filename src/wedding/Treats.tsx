import React, { useMemo } from "react";
import * as THREE from "three";
import { L, hash } from "./flight";
import { bloomMeshes, bouquet, type Bloom } from "./Flowers";
import { glassMaterial } from "./Tent";

/**
 * The cake and the champagne tower, on their tables at the north end of the tent.
 *  - The cake: four tiers of ivory fondant on a gold stand, pearl piping round each tier, sugar roses
 *    cascading down one side and a crown of them on top.
 *  - The tower: 55 coupes in a square pyramid (25, 16, 9, 4, 1), each with champagne in it, the top one
 *    being filled from a bottle when the drone arrives.
 * Each piece can be hidden (it has broken: Effects.tsx throws its pieces about instead).
 */

/* ------------------------------------------------------------------ */
/* The tower's glasses                                                   */
/* ------------------------------------------------------------------ */

const COUPE: [number, number][] = [
  [0.0, 0.0],
  [0.036, 0.0],
  [0.036, 0.004],
  [0.008, 0.012],
  [0.0045, 0.03],
  [0.0045, 0.075],
  [0.012, 0.082],
  [0.04, 0.09],
  [0.054, 0.104],
  [0.058, 0.122],
  [0.0575, 0.128],
];
export const coupeGeometry = () => new THREE.LatheGeometry(COUPE.map(([r, y]) => new THREE.Vector2(r, y)), 28);
/** The champagne in a coupe: a shallow lens filling the bowl to 8 mm under the rim. */
export const wineGeometry = () => {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const y = 0.084 + u * 0.034;
    // the bowl's inside radius at y
    const r = y < 0.09 ? 0.012 + ((y - 0.082) / 0.008) * 0.026 : y < 0.104 ? 0.038 + ((y - 0.09) / 0.014) * 0.014 : 0.052 + ((y - 0.104) / 0.018) * 0.004;
    prof.push(new THREE.Vector2(Math.max(0.001, r - 0.002), y));
  }
  prof.unshift(new THREE.Vector2(0, 0.084));
  prof.push(new THREE.Vector2(0, 0.118));
  return new THREE.LatheGeometry(prof, 24);
};

/** Each coupe's place: tier (0 bottom), position on the table (world). */
export const TOWER = (() => {
  const out: { tier: number; p: THREE.Vector3 }[] = [];
  const [tx, ty, tz] = L.tower.at;
  const pitch = L.tower.pitch;
  for (let tier = 0; tier < L.tower.tiers; tier++) {
    const n = L.tower.tiers - tier;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const x = tx + (i - (n - 1) / 2) * pitch;
        const z = tz + (j - (n - 1) / 2) * pitch;
        out.push({ tier, p: new THREE.Vector3(x, ty + 0.012 + tier * (L.tower.h - 0.006), z) });
      }
  }
  return out;
})();

/* ------------------------------------------------------------------ */
/* The cake                                                              */
/* ------------------------------------------------------------------ */

/** Tier i: centre bottom, radius, height (world). */
export const CAKE_TIERS = (() => {
  const [cx, cy, cz] = L.cake.at;
  let y = cy + 0.115; // on the stand
  return L.cake.tiers.map(([r, h]) => {
    const t = { c: new THREE.Vector3(cx, y, cz), r, h };
    y += h;
    return t;
  });
})();

const fondant = () =>
  new THREE.MeshPhysicalMaterial({ color: "#FBF4E6", roughness: 0.42, sheen: 0.4, sheenColor: new THREE.Color("#FFFFFF"), clearcoat: 0.15, clearcoatRoughness: 0.5 });

const tierGeometry = (r: number, h: number) => {
  // a drum with softly rounded edges
  const prof: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    prof.push(new THREE.Vector2(r - 0.012 + Math.sin(a) * 0.012, 0.012 - Math.cos(a) * 0.012 + 0.0));
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    prof.push(new THREE.Vector2(r - 0.012 + Math.cos(a) * 0.012, h - 0.012 + Math.sin(a) * 0.012));
  }
  prof.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(prof, 64);
};

export const Treats: React.FC<{ t: number; hideGlass?: (i: number) => boolean; cakeGone?: number; pour?: number }> = ({
  t,
  hideGlass,
  cakeGone = 0,
  pour = 0,
}) => {
  const objs = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const cloth = new THREE.MeshStandardMaterial({ color: "#FAF7F1", roughness: 0.92 });
    // the cake's round table and the tower's long one, cloths to the floor
    const [ckx, ckz] = L.cakeTable;
    const ct = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.82, 0.765, 48), cloth);
    ct.position.set(ckx, 0.3825, ckz);
    ct.castShadow = true;
    ct.receiveShadow = true;
    out.push(ct);
    const [twx, twz] = L.towerTable;
    const tt = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.765, 0.95), cloth);
    tt.position.set(twx, 0.3825, twz);
    tt.castShadow = true;
    tt.receiveShadow = true;
    out.push(tt);
    // the gold cake stand
    const stand = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [0, 0],
          [0.16, 0],
          [0.15, 0.02],
          [0.05, 0.05],
          [0.04, 0.09],
          [0.38, 0.1],
          [0.38, 0.115],
          [0, 0.115],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        48,
      ),
      new THREE.MeshStandardMaterial({ color: "#C9A55A", roughness: 0.25, metalness: 1 }),
    );
    stand.position.set(L.cake.at[0], L.cake.at[1] + 0.005, L.cake.at[2]);
    stand.castShadow = true;
    out.push(stand);
    return out;
  }, []);
  const cake = useMemo(() => {
    const grp = new THREE.Group();
    const mat = fondant();
    CAKE_TIERS.forEach((tr, i) => {
      const m = new THREE.Mesh(tierGeometry(tr.r, tr.h), mat);
      m.position.copy(tr.c);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.tier = i;
      grp.add(m);
      // pearl piping round the base of the tier
      const n = Math.round((tr.r * Math.PI * 2) / 0.011);
      const pearl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0058, 8, 6), new THREE.MeshPhysicalMaterial({ color: "#FFF8EC", roughness: 0.2, clearcoat: 1, sheen: 1 }), n);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        pearl.setMatrixAt(k, new THREE.Matrix4().makeTranslation(tr.c.x + Math.cos(a) * (tr.r + 0.002), tr.c.y + 0.006, tr.c.z + Math.sin(a) * (tr.r + 0.002)));
      }
      pearl.userData.tier = i;
      grp.add(pearl);
    });
    // sugar roses: a crown on top, and a cascade down the front-left of the tiers
    const blooms: Bloom[] = [];
    const top = CAKE_TIERS[CAKE_TIERS.length - 1];
    blooms.push(...bouquet(top.c.clone().add(new THREE.Vector3(0, top.h + 0.03, 0)), 0.2, 901, { roses: 9, cols: ["#FFFBF5", "#F8E4DE", "#F3CFC6"] }));
    CAKE_TIERS.forEach((tr, i) => {
      const a = 2.3 + i * 0.35;
      const p = tr.c.clone().add(new THREE.Vector3(Math.cos(a) * tr.r, tr.h * 0.92, Math.sin(a) * tr.r));
      blooms.push(...bouquet(p, 0.13, 910 + i, { roses: 4, dir: new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)), cols: ["#FFFBF5", "#F8E4DE", "#F3CFC6"] }));
    });
    for (const b of bloomMeshes(blooms)) grp.add(b);
    return grp;
  }, []);
  const tower = useMemo(() => {
    const glass = new THREE.InstancedMesh(coupeGeometry(), glassMaterial(), TOWER.length);
    const wine = new THREE.InstancedMesh(
      wineGeometry(),
      new THREE.MeshPhysicalMaterial({ color: "#E9C46A", roughness: 0.05, transparent: true, opacity: 0.62, clearcoat: 1, depthWrite: false }),
      TOWER.length,
    );
    glass.frustumCulled = false;
    wine.frustumCulled = false;
    glass.renderOrder = 3;
    wine.renderOrder = 2;
    return { glass, wine };
  }, []);
  // hide the broken glasses
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  TOWER.forEach((g, i) => {
    const hidden = hideGlass ? hideGlass(i) : false;
    const m = hidden ? zero : new THREE.Matrix4().makeTranslation(g.p.x, g.p.y, g.p.z);
    tower.glass.setMatrixAt(i, m);
    tower.wine.setMatrixAt(i, m);
  });
  tower.glass.instanceMatrix.needsUpdate = true;
  tower.wine.instanceMatrix.needsUpdate = true;
  // the cake's upper tiers go when it's hit (cakeGone 0..1 hides from the top down)
  cake.children.forEach((c) => {
    const tier = c.userData.tier;
    if (tier === undefined) c.visible = cakeGone < 0.5;
    else c.visible = tier < CAKE_TIERS.length - Math.round(cakeGone * 3);
  });
  // the stream from the bottle into the top glass
  const topGlass = TOWER[TOWER.length - 1].p;
  void t;
  return (
    <group>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      <primitive object={cake} />
      <primitive object={tower.glass} />
      <primitive object={tower.wine} />
      {pour > 0.01 ? (
        <mesh position={[topGlass.x + 0.02, topGlass.y + 0.2, topGlass.z]}>
          <cylinderGeometry args={[0.004, 0.006, 0.16, 8]} />
          <meshPhysicalMaterial color="#F3D58A" transparent opacity={0.55 * pour} roughness={0.05} />
        </mesh>
      ) : null}
    </group>
  );
};

void hash;
