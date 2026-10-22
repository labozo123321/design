import * as THREE from "three";
import { frameAt } from "./direct";
import { PRESETS, type Preset } from "./layout";
import { segAt, srcAt } from "./cut";
import { smoother } from "./anim";

/**
 * The simple cut's camera, in the cut's own seconds: few moves, each slow, and never closer than a
 * two-shot of both pillows (the faces read; the hands and the wall's cut top stay small). When someone gets
 * up and crosses the house, the camera eases back to a framing that holds the hallway well below the top
 * line, and pans with them (a lagging average of where they are), so the walk is never a speck at the edge.
 */

const P = (x: number, y: number, z: number, dist: number): Preset => ({ target: new THREE.Vector3(x, y, z), dist });
const mix = (a: Preset, b: Preset, k: number): Preset => ({
  target: a.target.clone().lerp(b.target, k),
  dist: Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * k),
});
const ease = (o: number, o0: number, o1: number) => smoother((o - o0) / (o1 - o0));

const WIDE = PRESETS.wide;
const MEDIUM = PRESETS.medium;
/** both pillows, the faces large enough to read, nothing closer */
const CLOSE = P(0, 0.64, -3.15, 4.6);
const FOLLOW_D = 8.2;
/** Framing someone up and about: across with them (x), and up the house while they're in the hallway, so
 * the camera looks down into it over the bedrooms' back wall, the walker near the middle of the frame. */
const follow = (at: { x: number; z: number }, d = FOLLOW_D): Preset => {
  const hall = smoother((-at.z - 2.9) / 1.4);
  return P(Math.max(-1.0, Math.min(1.0, 0.65 * at.x)), 0.5, -3.25 - 1.25 * hall, d);
};

type Spot2 = { x: number; z: number };
/** The one who's up: where they are, or before they're up / once they're down, where they lie. */
const subjectAt = (src: number, upAt: number, before: Spot2, after: Spot2): Spot2 => {
  const w = frameAt(src, true).walkers?.[0];
  if (w) return { x: w.p.hip.x, z: w.p.hip.z };
  return src < upAt ? before : after;
};
/** The camera's lagging view of the subject: a weighted average over the last 0.9 s (within the night), so it
 * eases to a stop after them rather than stopping when they do. */
const lagged = (o: number, upAt: number, before: Spot2, after: Spot2): Spot2 => {
  const o0 = segAt(o).o0;
  let x = 0;
  let z = 0;
  let w = 0;
  for (let i = 0; i <= 12; i++) {
    const oi = Math.max(o0, o - (i / 12) * 0.9);
    const wi = 1 - i / 13;
    const p = subjectAt(srcAt(oi), upAt, before, after);
    x += wi * p.x;
    z += wi * p.z;
    w += wi;
  }
  return { x: x / w, z: z / w };
};

export const cutCam = (o: number): Preset => {
  if (o < 12.0) {
    // 2004: held wide under the title, then slowly in to the two of them for the knocks
    const a = mix(WIDE, MEDIUM, ease(o, 1.0, 7.6));
    return mix(a, P(0, 0.62, -3.05, 4.5), ease(o, 7.6, 12.0));
  }
  if (o < 27.5) {
    // 2009: both of you in bed through the storm and the knocks; out as she sits up; with her across the
    // house; settled on her lying on your rug
    const base = mix(P(0, 0.6, -3.0, 5.4), MEDIUM, ease(o, 12.0, 15.9));
    const f = follow(lagged(o, 17.72, { x: -0.29, z: -2.64 }, { x: 1.36, z: -2.55 }), FOLLOW_D - 0.5 * ease(o, 25.0, 27.5));
    return mix(base, f, ease(o, 16.0, 18.7));
  }
  if (o < 39.5) {
    // 2013: from her stripped room, in to the two of you (halfway by her first knocks)
    return mix(mix(WIDE, P(0, 0.6, -2.85, 6.6), ease(o, 27.5, 30.6)), P(0, 0.64, -3.2, 4.7), ease(o, 30.6, 35.8));
  }
  // 2025: in to the two of you; out as she laughs and you get up; with you across the house; down beside
  // her; then slowly down the house, the two of them high in the frame over the end card
  const a = mix(mix(WIDE, CLOSE, ease(o, 40.1, 46.0)), P(0, 0.64, -3.18, 4.35), ease(o, 46.0, 53.0));
  const f = follow(lagged(o, 62.0, { x: 0.27, z: -2.55 }, { x: -1.38, z: -2.55 }));
  const b = mix(a, f, ease(o, 53.0, 56.6));
  return mix(b, P(-0.85, 0.45, -1.45, 7.6), ease(o, 63.4, 69.6));
};
