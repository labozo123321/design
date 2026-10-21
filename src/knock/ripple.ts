import * as THREE from "three";
import { KNOCKS, type Knock } from "./script";
import { knockPoint } from "./layout";

/**
 * The knock ripples: every knock sends a ring of light out from the knuckles, a thin shell (4 cm) growing
 * from 0 to about 1.6 m over 0.9 s and fading as it goes, blue from Nora's side and amber from yours. The
 * rings are drawn by the surfaces themselves: materials passed through rippled() add the light of whatever
 * rings pass over them (the wall's cut top and its cavity, the bedding, the headboards, the floor), and a
 * small light at each side lights faces and pillows for a moment.
 *
 * Six ring slots, shared by every rippled material through the same uniform objects; set each frame by
 * setRipples(t).
 */

export const RING_SLOTS = 6;
export const BLUE = new THREE.Color("#7FB4FF");
export const AMBER = new THREE.Color("#FFB45C");
export const GREY = new THREE.Color("#9AA3AB");
export const WHITE = new THREE.Color("#FFE7C2");

const uniforms = {
  uRingP: { value: Array.from({ length: RING_SLOTS }, () => new THREE.Vector4(0, -100, 0, 0)) },
  uRingC: { value: Array.from({ length: RING_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  /** the collision bloom in the payoff: a warm glow from the seam (strength, and where along it) */
  uSeam: { value: new THREE.Vector4(0, 0, -3.2, 0) },
};

/** How a knock's ring looks: life (s), max radius (m), strength, width. */
const RING: Record<Knock["kind"], { life: number; r: number; k: number; w: number }> = {
  tap: { life: 0.9, r: 1.6, k: 1.0, w: 0.04 },
  fist: { life: 1.0, r: 1.8, k: 1.35, w: 0.052 },
  hard: { life: 0.8, r: 1.5, k: 1.15, w: 0.045 },
  soft: { life: 0.9, r: 1.0, k: 0.5, w: 0.035 },
  urgent: { life: 0.55, r: 1.1, k: 0.85, w: 0.035 },
  pulse: { life: 0.7, r: 0.9, k: 0.35, w: 0.035 },
  grey: { life: 0.6, r: 0.64, k: 0.45, w: 0.035 },
};

/** Where on the wall a knock lands (the knuckles' contact), by side and a little variety by index. */
export const contactOf = (k: Knock, i: number) => knockPoint(k.side === "N" ? -1 : 1, ((i * 37) % 7) * 0.012 - 0.036);

export type ActiveRing = { k: Knock; i: number; age: number; radius: number; strength: number; color: THREE.Color; at: THREE.Vector3 };

/** The picture's cuts (era jumps and flash cuts): a ring doesn't carry across one into the next scene. */
const CUTS = [8.0, 9.333, 10.4, 13.9, 15.0, 22.5, 28.0, 36.0, 37.0, 38.8, 42.0, 47.5, 49.0];

/** The rings alive at time t (the newest last). */
export const ringsAt = (t: number, contact: (k: Knock, i: number) => THREE.Vector3 = contactOf): ActiveRing[] => {
  const out: ActiveRing[] = [];
  const cut = CUTS.filter((c) => c <= t + 1e-6).pop() ?? -1;
  KNOCKS.forEach((k, i) => {
    const s = RING[k.kind];
    const age = t - k.t;
    if (age < 0 || age > s.life || k.t < cut - 1e-6) return;
    const u = age / s.life;
    const radius = s.r * (1 - Math.pow(1 - u, 2.2));
    const strength = s.k * k.gain * Math.pow(1 - u, 1.4) * Math.min(1, age / 0.03);
    const color = k.kind === "grey" ? GREY : k.side === "N" ? BLUE : AMBER;
    out.push({ k, i, age, radius, strength, color, at: contact(k, i) });
  });
  return out.slice(-RING_SLOTS);
};

/** Load the rings (and the seam's glow) into the shared uniforms for this frame. */
export const setRipples = (rings: ActiveRing[], seam = 0, seamZ = -3.2) => {
  for (let j = 0; j < RING_SLOTS; j++) {
    const r = rings[j];
    if (!r) {
      uniforms.uRingC.value[j].set(0, 0, 0, 0);
      continue;
    }
    uniforms.uRingP.value[j].set(r.at.x, r.at.y, r.at.z, r.radius);
    uniforms.uRingC.value[j].set(r.color.r, r.color.g, r.color.b, r.strength * 3.0);
  }
  uniforms.uSeam.value.set(seam, 0, seamZ, 0);
};

const cache = new Map<string, THREE.Material>();
/** A copy of a material that also shows the rings passing over it. */
export const rippled = <T extends THREE.MeshStandardMaterial>(key: string, base: T, gain = 1): T => {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = base.clone() as T;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms, { uRingGain: { value: gain } });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRipW;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRipW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vRipW;
        uniform vec4 uRingP[${RING_SLOTS}];
        uniform vec4 uRingC[${RING_SLOTS}];
        uniform vec4 uSeam;
        uniform float uRingGain;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        for (int i = 0; i < ${RING_SLOTS}; i++) {
          vec4 rp = uRingP[i];
          vec4 rc = uRingC[i];
          if (rc.w <= 0.0) continue;
          float d = distance(vRipW, rp.xyz);
          float shell = exp(-pow((d - rp.w) / 0.04, 2.0));
          // a faint fill inside the ring, and the ring weakening with its size
          float fill = 0.05 * smoothstep(rp.w, 0.0, d) * step(d, rp.w);
          totalEmissiveRadiance += rc.rgb * rc.w * uRingGain * (shell + fill) / (1.0 + 2.5 * rp.w);
        }
        if (uSeam.x > 0.0) {
          // the seam's glow: strongest in the cavity, fading out across the rooms
          float dx = abs(vRipW.x);
          float dz = abs(vRipW.z - uSeam.z);
          float g = exp(-dx * 16.0) * exp(-dz * 1.6) * (0.35 + 0.65 * smoothstep(0.0, 1.1, vRipW.y));
          totalEmissiveRadiance += vec3(1.0, 0.86, 0.62) * uSeam.x * g * uRingGain;
        }`,
      );
  };
  m.customProgramCacheKey = () => `rippled-${key}`;
  cache.set(key, m);
  return m;
};
