import * as THREE from "three";
import { BOLTS, boltK } from "./pieces/Core";
import { caveLights } from "./pieces/Cave";
import { trainLight } from "./pieces/Metro";
import { LEVEL_DY, MINE_LEVELS } from "./pieces/Mine";
import { EV, EYE, HR, HX, HZ, depthAtWall, sideAt, surfY, tempAt, wallAt } from "./timeline";

/**
 * The underground light rig for meshes (your arms, the set pieces): the shaft shader lights the rock
 * itself, this follows it with real three.js lights. A fixed set (one hemisphere, four points) so materials
 * never recompile mid-shot: the two service lamps nearest your eyes, and two for whatever set piece is near.
 */

// must match the shaft shader
const LAMP_W0 = 8;
const LAMP_DW = 9;
const GOLD = 2.39996323;
const TAU = Math.PI * 2;

/** Incandescent colour * strength (mirrors the shader's heat()). */
export const heatJS = (T: number) => {
  const sm = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const c = new THREE.Color(0.5, 0.02, 0.0).lerp(new THREE.Color(1.0, 0.1, 0.008), sm(500, 900, T));
  c.lerp(new THREE.Color(1.0, 0.22, 0.03), sm(900, 1500, T));
  c.lerp(new THREE.Color(1.0, 0.3, 0.05), sm(1500, 2500, T));
  c.lerp(new THREE.Color(1.0, 0.4, 0.09), sm(2500, 3700, T));
  c.lerp(new THREE.Color(1.0, 0.52, 0.16), sm(3700, 5000, T));
  c.lerp(new THREE.Color(1.0, 0.64, 0.28), sm(5000, 5500, T));
  const I = sm(420, 900, T) * (0.22 + 0.24 * sm(1000, 3500, T) + 0.22 * sm(4000, 5500, T));
  return c.multiplyScalar(I);
};

export type PLight = { pos: THREE.Vector3; color: THREE.Color; intensity: number };
const OFF: PLight = { pos: new THREE.Vector3(HX, -1e4, HZ), color: new THREE.Color("#000"), intensity: 0 };

export const lampPos = (k: number, surf: number) => {
  const la = ((k * GOLD) % TAU) - Math.PI;
  const w = LAMP_W0 + k * LAMP_DW;
  return { w, pos: new THREE.Vector3(HX + Math.sin(la) * (HR - 0.3), surf - w, HZ + Math.cos(la) * (HR - 0.3)) };
};

export const rigAt = (frame: number) => {
  const t = frame / 30;
  const side = sideAt(frame);
  const surf = surfY(frame);
  const wall = wallAt(frame);
  const wEye = wall - EYE;
  const km = depthAtWall(side, Math.max(0, wEye));
  const T = tempAt(km);
  // ambient: the glow of the rock around you (and a little lamp bounce in the crust)
  const glow = heatJS(T);
  const env = {
    sky: glow.clone().multiplyScalar(1.6).add(new THREE.Color(0.03, 0.028, 0.025)),
    ground: glow.clone().multiplyScalar(1.2).add(new THREE.Color(0.02, 0.016, 0.012)),
    k: 1,
  };
  // the two nearest service lamps
  const lamps: PLight[] = [];
  const k0 = Math.round((wEye - LAMP_W0) / LAMP_DW);
  const cand = [k0 - 1, k0, k0 + 1]
    .filter((k) => k >= 0)
    .map((k) => lampPos(k, surf))
    .sort((a, b) => Math.abs(a.w - wEye) - Math.abs(b.w - wEye))
    .slice(0, 2);
  for (const c of cand) {
    const Tl = tempAt(depthAtWall(side, c.w));
    const life = 1 - Math.min(1, Math.max(0, (Tl - 520) / 120));
    lamps.push({ pos: c.pos, color: new THREE.Color(1.0, 0.8, 0.56), intensity: 26 * life * (wall > 2 ? 1 : 0) });
  }
  while (lamps.length < 2) lamps.push(OFF);
  // set pieces
  let p3: PLight = OFF;
  let p4: PLight = OFF;
  if (side === 0 && t > 3 && t < 7.6) {
    const tl = trainLight(t, surf);
    if (tl) p3 = { pos: tl, color: new THREE.Color("#FFE6C0"), intensity: 160 };
    p4 = { pos: new THREE.Vector3(HX + 7, surf - EV.train + 1, HZ), color: new THREE.Color("#FFE2B8"), intensity: 60 };
  } else if (side === 0 && t >= 7.6 && t < 8.5) {
    // a work lamp in front of the fossil, low down
    const y = surf - EV.fossils;
    p3 = {
      pos: new THREE.Vector3(HX - HR + 1.6, y - 1.6, HZ + 0.6),
      color: new THREE.Color("#FFD6A0"),
      intensity: 28,
    };
  } else if (side === 0 && t >= 8.5 && t < 10.5) {
    const [a, b] = caveLights(surf - EV.cave);
    p3 = { pos: a, color: new THREE.Color("#FFD9A8"), intensity: 90 };
    p4 = { pos: b, color: new THREE.Color("#FFE3BC"), intensity: 90 };
  } else if (side === 0 && t >= 11.2 && t < 14) {
    // the gallery levels nearest your eyes
    const ys = MINE_LEVELS.map((k) => surf - EV.mine - k * LEVEL_DY).sort(
      (a, b) => Math.abs(a - (surf - wEye)) - Math.abs(b - (surf - wEye)),
    );
    p3 = { pos: new THREE.Vector3(HX + 5.5, ys[0], HZ), color: new THREE.Color("#FFC27A"), intensity: 70 };
    p4 = { pos: new THREE.Vector3(HX + 5.5, ys[1], HZ), color: new THREE.Color("#FFC27A"), intensity: 70 };
  } else {
    // lightning in the core lights everything blue-white for a few frames
    for (const b of BOLTS) {
      const k = boltK(t, b.t);
      if (k > 0) {
        p3 = { pos: new THREE.Vector3(HX + 40, surf - wEye - 20, HZ + 30), color: new THREE.Color("#BFD8FF"), intensity: 60000 * k };
        break;
      }
    }
  }
  return { env, lamps, p3, p4, T, km };
};
