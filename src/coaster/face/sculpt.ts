import * as THREE from "three";

/**
 * A head, sculpted from a sphere by maths, and the expressions it can make.
 *
 * Head space: metres, origin between the ears at eye level, +z out of the face, +y up, +x to the
 * person's left (viewer's right when facing them). `Shape` holds who it is (proportions, nose, lips, a
 * child's or an adult's face); `Expr` what the face is doing. `deform` moves a neutral surface point for an
 * expression; `mouthHole` says whether a deformed point is inside the open mouth (the head's skin there is
 * cut away so you see the lips, teeth, tongue and the dark of the mouth).
 */

export type Shape = {
  /** half width, half height, half depth of the skull (m) */
  w: number;
  h: number;
  d: number;
  /** where the eyes are (y), how far apart (x), how deep the face plane is at them (z) */
  eyeY: number;
  eyeX: number;
  /** eyeball radius */
  eyeR: number;
  noseY: number;
  noseLen: number;
  noseW: number;
  mouthY: number;
  mouthW: number;
  lipFull: number;
  chinY: number;
  jaw: number; // 0 soft, 1 square
  cheek: number; // chubbiness
  brow: number; // brow ridge
  kid: boolean;
  /** a squarer jaw: wider at its angles below the ears (0..1) */
  jawSq?: number;
  /** ear size (1: the riders') */
  earK?: number;
  /** lip thickness (1: the riders') */
  lipK?: number;
  /** eyes a little more open (radians on the lids) */
  eyeOpen?: number;
  /** how much the mouth's muzzle stands out (1: the riders') */
  muzzle?: number;
  /** made for close portraits: a lash line, fuller brows */
  portrait?: boolean;
};

export const ADULT_M: Shape = {
  w: 0.076,
  h: 0.118,
  d: 0.1,
  eyeY: 0.0,
  eyeX: 0.032,
  eyeR: 0.0122,
  noseY: -0.045,
  noseLen: 1.0,
  noseW: 1.0,
  mouthY: -0.071,
  mouthW: 0.05,
  lipFull: 0.9,
  chinY: -0.112,
  jaw: 0.75,
  cheek: 0.35,
  brow: 1.0,
  kid: false,
};

export const ADULT_F: Shape = {
  ...ADULT_M,
  w: 0.072,
  h: 0.112,
  d: 0.096,
  eyeR: 0.0121,
  noseLen: 0.85,
  noseW: 0.88,
  mouthY: -0.067,
  mouthW: 0.047,
  lipFull: 1.25,
  chinY: -0.104,
  jaw: 0.25,
  cheek: 0.5,
  brow: 0.55,
};

/** A seven-year-old: a bigger skull for the face, the eyes lower and nearly adult-sized, a button nose. */
export const KID: Shape = {
  w: 0.073,
  h: 0.103,
  d: 0.093,
  eyeY: -0.014,
  eyeX: 0.03,
  eyeR: 0.0122,
  noseY: -0.037,
  noseLen: 0.58,
  noseW: 0.85,
  mouthY: -0.0525,
  mouthW: 0.037,
  lipFull: 0.95,
  chinY: -0.081,
  jaw: 0.0,
  cheek: 1.0,
  brow: 0.2,
  kid: true,
};

export type Expr = {
  /** jaw drop 0..1 (1: a full scream) */
  jaw: number;
  /** smile 0..1, or a frown below 0 */
  smile: number;
  /** mouth stretched wide (fear, a grimace) */
  wide: number;
  /** lips pushed forward and together (blowing a bubble, a kiss) */
  pucker: number;
  /** cheeks blown out */
  puff: number;
  /** brows up (+) or knitted down (-) */
  brow: number;
  /** eyes squeezed (laughing, wind, fear) */
  squint: number;
  /** eyelids: 0 open, 1 shut; bored half lids ~0.45 */
  lidL: number;
  lidR: number;
  /** where the eyes look: yaw (+ to the person's left), pitch (+ up), radians */
  eyeYaw: number;
  eyePitch: number;
  /** chewing: the jaw's small sideways grind (-1..1) */
  chew: number;
  /** tongue poked out between the lips (concentration, cheek): 0..1 */
  tongue?: number;
  /** the lower jaw thrust forward, lips pressed (mewing): 0..1 */
  jut?: number;
};

export const NEUTRAL: Expr = {
  jaw: 0,
  smile: 0,
  wide: 0,
  pucker: 0,
  puff: 0,
  brow: 0,
  squint: 0,
  lidL: 0,
  lidR: 0,
  eyeYaw: 0,
  eyePitch: 0,
  chew: 0,
};

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const g2 = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  Math.exp(-(((x - cx) / rx) ** 2) - ((y - cy) / ry) ** 2);

/** The neutral head: a point on the unit sphere (dir) -> a point on the skin. */
export const neutralPoint = (sh: Shape, dir: THREE.Vector3, out: THREE.Vector3) => {
  const ux = dir.x;
  const uy = dir.y;
  const uz = dir.z;
  // skull: an egg, fuller behind, the lower face narrowing to the jaw and chin
  let x = ux * sh.w;
  let y = uy * sh.h;
  let z = uz * sh.d;
  if (uz < 0) z *= 1.07 + (sh.kid ? 0.06 : 0);
  if (uy > 0) {
    // crown: kids' skulls are rounder and bigger on top
    x *= 1 + (sh.kid ? 0.05 : 0.02) * uy;
    y *= sh.kid ? 1.03 : 1.0;
  }
  // portraits: a rounder-shouldered cranium (wide up top, not an egg)
  if (sh.portrait && (uy > 0 || uz < 0)) {
    const n = 2.5;
    const rn = Math.pow(Math.pow(Math.abs(ux), n) + Math.pow(Math.abs(uy), n) + Math.pow(Math.abs(uz), n), 1 / n);
    const k = 1 + (1 / rn - 1) * Math.max(smooth(0, 0.35, uy), 0.6 * smooth(0, -0.4, uz)) * 0.85;
    x *= k;
    y *= 1 + (k - 1) * 0.4;
    z *= k;
  }
  // the lower half: jaw narrows, more for a soft (kid's, woman's) jaw
  if (uy < 0) {
    const d = -uy;
    const narrow = sh.kid ? 0.16 * Math.pow(d, 1.9) : (0.2 + 0.12 * (1 - sh.jaw)) * Math.pow(d, 1.5);
    x *= 1 - narrow;
    // a square jaw: wider at the angles (below and in front of the ears), not at the chin or the mouth
    if (sh.jawSq) x *= 1 + sh.jawSq * 0.15 * Math.exp(-(((uy + 0.62) / 0.24) ** 2)) * (1 - smooth(0.35, 0.85, uz));
    y *= 1 + 0.06 * d;
    if (uz > 0) z *= 1 + 0.05 * d * sh.jaw;
  }
  // flatten the face plane
  const front = smooth(0.35, 0.8, uz);
  if (z > 0) z = z - front * z * (sh.portrait ? 0.09 : 0.13);
  // features, in face coordinates (x, y) on the front, as heights out of the face
  const fw = smooth(0.05, 0.55, uz);
  const ex = sh.eyeX;
  const ey = sh.eyeY;
  let h = 0;
  // eye sockets in, the brow ridge over them
  h -= 0.0075 * (g2(x, y, ex, ey, 0.021, 0.015) + g2(x, y, -ex, ey, 0.021, 0.015));
  h += 0.0042 * sh.brow * (g2(x, y, ex * 1.05, ey + 0.024, 0.026, 0.0085) + g2(x, y, -ex * 1.05, ey + 0.024, 0.026, 0.0085));
  // the bridge of the nose between the eyes, running down to the tip
  const nl = sh.noseLen;
  const nw = sh.noseW;
  const tipY = sh.noseY;
  const bridge = smooth(ey + 0.01, tipY, y) * (1 - smooth(tipY, tipY - 0.01, y));
  h += (0.0055 + 0.012 * nl * smooth(ey, tipY, y)) * bridge * Math.exp(-((x / (0.0075 * nw + 0.002)) ** 2));
  // the tip, round, and the wings of the nostrils either side
  h += 0.0135 * nl * g2(x, y, 0, tipY, 0.0105 * nw, 0.0095);
  h += 0.0065 * (g2(x, y, 0.0125 * nw, tipY - 0.004, 0.0072 * nw, 0.0068) + g2(x, y, -0.0125 * nw, tipY - 0.004, 0.0072 * nw, 0.0068));
  // under the nose: the nostrils
  h -= 0.0032 * (g2(x, y, 0.0068 * nw, tipY - 0.0105, 0.0035, 0.0026) + g2(x, y, -0.0068 * nw, tipY - 0.0105, 0.0035, 0.0026));
  // philtrum and the muzzle round the mouth
  const my = sh.mouthY;
  h += 0.0045 * (sh.muzzle ?? 1) * g2(x, y, 0, (my + tipY) / 2 - 0.002, 0.024, 0.016);
  h -= 0.0012 * g2(x, y, 0, (my + tipY) / 2, 0.0035, 0.007);
  h += 0.0028 * sh.lipFull * g2(x, y, 0, my + 0.004, sh.mouthW * 0.42, 0.0045);
  h += 0.0032 * sh.lipFull * g2(x, y, 0, my - 0.0075, sh.mouthW * 0.36, 0.0055);
  // the dimples at the corners, the chin, the cheekbones and (for a child) round cheeks
  h -= 0.0016 * (g2(x, y, sh.mouthW * 0.55, my, 0.0045, 0.006) + g2(x, y, -sh.mouthW * 0.55, my, 0.0045, 0.006));
  h += 0.0058 * g2(x, y, 0, sh.chinY + 0.012, 0.016, 0.011);
  h -= 0.0018 * g2(x, y, 0, (sh.chinY + my) / 2 - 0.004, 0.014, 0.004);
  h += 0.0045 * (g2(x, y, 0.046, ey - 0.022, 0.02, 0.014) + g2(x, y, -0.046, ey - 0.022, 0.02, 0.014));
  h += 0.0075 * sh.cheek * (g2(x, y, 0.04, my + 0.012, 0.024, 0.022) + g2(x, y, -0.04, my + 0.012, 0.024, 0.022));
  // temples in a little
  h -= 0.003 * (g2(x, y, 0.066, ey + 0.022, 0.012, 0.025) + g2(x, y, -0.066, ey + 0.022, 0.012, 0.025));
  if (sh.portrait) {
    const ax = Math.abs(x);
    // cheekbones out to the side below the eyes, the hollow under them
    h += 0.0034 * g2(ax, y, 0.05, ey - 0.028, 0.02, 0.012);
    h -= 0.0016 * (1 - 0.6 * sh.cheek) * g2(ax, y, 0.054, my + 0.004, 0.014, 0.016);
    // the nasolabial fold: a soft crease from the nostril's wing out and down past the mouth's corner
    const fx0 = 0.016 * nw;
    const fy0 = tipY - 0.004;
    const fx1 = sh.mouthW * 0.62;
    const fy1 = my - 0.012;
    const fdx = fx1 - fx0;
    const fdy = fy1 - fy0;
    const ft = Math.max(0, Math.min(1, ((ax - fx0) * fdx + (y - fy0) * fdy) / (fdx * fdx + fdy * fdy)));
    const fd = Math.hypot(ax - (fx0 + fdx * ft), y - (fy0 + fdy * ft));
    h -= 0.0011 * Math.exp(-((fd / 0.0026) ** 2)) * Math.sin(Math.PI * Math.min(1, ft * 1.1));
    // the dip between the lower lip and the chin
    h -= 0.0012 * g2(x, y, 0, my - 0.017, 0.012, 0.0035);
  }
  z += h * fw;
  out.set(x, y, z);
  return out;
};

/** Mouth corners and lip line, for the lips, the hole and the deformation. */
export const mouthShape = (sh: Shape, e: Expr) => {
  const W = sh.mouthW * (1 + 0.28 * e.wide + 0.12 * Math.max(0, e.smile) - 0.42 * e.pucker - 0.08 * e.jaw);
  const open = 0.036 * e.jaw * (sh.kid ? 0.85 : 1); // the lower lip's drop
  const lift = 0.0065 * e.smile; // corners up (or down for a frown)
  const upper = 0.004 * e.jaw + 0.002 * e.wide; // the upper lip lifts off the teeth
  return { W, open, lift, upper, y: sh.mouthY, chew: e.chew };
};

/** The jaw's hinge (in front of the ears, below the eye line) and how far it turns for an expression. */
export const jawAngle = (e: Expr) => 0.36 * e.jaw + 0.035 * Math.abs(e.chew);
export const jawPivot = (sh: Shape) => new THREE.Vector3(0, sh.eyeY - 0.022, -0.012);

/** Move a neutral skin point for an expression (p is changed in place). */
export const deform = (sh: Shape, e: Expr, p: THREE.Vector3) => {
  const ms = mouthShape(sh, e);
  const x = p.x;
  const y = p.y;
  const front = smooth(-0.02, 0.05, p.z);
  // the jaw: everything below the lip line turns down about the hinge (fading out behind the cheeks)
  const below = smooth(ms.y + 0.0012, ms.y - 0.0042, y) * (1 - smooth(0.06, 0.08, Math.abs(x)));
  // (under the chin the skin follows less, so it doesn't fold into the neck)
  const jawW = below * smooth(-0.07, 0.02, p.z) * (1 - 0.75 * smooth(sh.chinY + 0.006, sh.chinY - 0.022, y));
  if (jawW > 0) {
    const a = jawAngle(e) * jawW;
    const pv = jawPivot(sh);
    const dy = y - pv.y;
    const dz = p.z - pv.z;
    const c = Math.cos(a);
    const s = Math.sin(a);
    p.y = pv.y + dy * c - dz * s;
    p.z = pv.z + dy * s + dz * c;
    // chewing grinds the jaw sideways a touch
    p.x += 0.0025 * e.chew * jawW;
  }
  // jut (mewing): the whole lower jaw forward and a little up, the chin out, more toward the chin
  const jut = e.jut ?? 0;
  if (jut > 0 && below > 0) {
    const jw = below * smooth(-0.075, 0.03, p.z) * (0.55 + 0.45 * smooth(ms.y - 0.004, sh.chinY + 0.004, y));
    p.z += 0.0115 * jut * jw;
    p.y += 0.0018 * jut * jw;
    // the lower lip rolls up against the upper
    p.y += 0.0012 * jut * g2(x, y, 0, ms.y - 0.006, ms.W * 0.4, 0.004);
  }
  // smile: corners up and back, cheeks up; frown: corners down
  const corner = g2(Math.abs(x), y, ms.W * 0.5, ms.y, 0.012, 0.012) * front;
  p.y += 0.0055 * e.smile * corner;
  p.z -= 0.0025 * Math.max(0, e.smile) * corner;
  p.x += Math.sign(x) * 0.004 * Math.max(0, e.smile) * corner;
  const cheek = g2(Math.abs(x), y, 0.038, ms.y + 0.022, 0.02, 0.018) * front;
  p.y += 0.0035 * Math.max(0, e.smile) * cheek;
  p.z += 0.002 * Math.max(0, e.smile) * cheek;
  // wide: corners out
  p.x += Math.sign(x) * 0.0055 * e.wide * corner;
  // pucker: the lips forward and in
  const lips = g2(x, y, 0, ms.y, ms.W * 0.55, 0.011) * front;
  p.z += 0.0065 * e.pucker * lips;
  p.x -= x * 0.35 * e.pucker * lips;
  // puffed cheeks
  const puff = g2(Math.abs(x), y, 0.036, ms.y + 0.006, 0.02, 0.02) * front;
  p.z += 0.007 * e.puff * puff;
  p.x += Math.sign(x) * 0.006 * e.puff * puff;
  // brows: the forehead over the eyes moves up, or down and in
  const browR = g2(Math.abs(x), y, sh.eyeX, sh.eyeY + 0.026, 0.026, 0.014) * front;
  p.y += 0.004 * e.brow * browR;
  p.x -= Math.sign(x) * 0.0015 * Math.min(0, e.brow) * -browR;
  // squint: the cheeks push up under the eyes
  const under = g2(Math.abs(x), y, sh.eyeX, sh.eyeY - 0.016, 0.016, 0.008) * front;
  p.y += 0.0022 * e.squint * under;
  p.z += 0.0012 * e.squint * under;
  // the skin round each eye wraps onto the lids' sphere, and is never pushed into the eyeball (a big smile
  // or a squint would otherwise bring the white through the skin at the corners)
  for (const side of [-1, 1]) {
    if (Math.abs(p.x - side * sh.eyeX) < sh.eyeR * 2.6 && Math.abs(p.y - sh.eyeY) < sh.eyeR * 2.6) {
      const c = eyeCentre(sh, side);
      wrapEye(sh, c, side, eyeLids(sh, e, side), p);
      const d = p.distanceTo(c);
      const rmin = sh.eyeR * 1.06;
      if (d < rmin) p.sub(c).multiplyScalar(rmin / Math.max(d, 1e-6)).add(c);
    }
  }
  return p;
};

/** Inner lip contours at x (the opening is between them), in head space y. */
export const lipLines = (sh: Shape, e: Expr, x: number) => {
  const ms = mouthShape(sh, e);
  const k = Math.min(1, Math.abs(x) / (ms.W / 2));
  const bow = Math.pow(Math.max(0, 1 - k * k), 0.65);
  const lift = ms.lift * k * k;
  return {
    up: ms.y + ms.upper * bow + lift + 0.0004,
    lo: ms.y - ms.open * bow + lift - 0.0004,
    k,
  };
};

/** The neutral face's surface z at (x, y) on the front (a few Newton steps on the sphere direction). */
export const frontZ = (sh: Shape, x: number, y: number) => {
  const dir = new THREE.Vector3(x / sh.w, y / sh.h, 0);
  const out = new THREE.Vector3();
  for (let it = 0; it < 6; it++) {
    dir.z = Math.sqrt(Math.max(0.02, 1 - dir.x * dir.x - dir.y * dir.y));
    dir.normalize();
    neutralPoint(sh, dir, out);
    dir.x += (x - out.x) / sh.w;
    dir.y += (y - out.y) / sh.h;
  }
  dir.z = Math.sqrt(Math.max(0.02, 1 - dir.x * dir.x - dir.y * dir.y));
  dir.normalize();
  return { p: neutralPoint(sh, dir, out).clone(), dir: dir.clone() };
};

/* ------------------------------------------------------------------ */
/* Eyes: the eyeball sits in the socket; the skin round it wraps onto a  */
/* sphere a lid's thickness bigger, and the opening is cut out of it.   */
/* ------------------------------------------------------------------ */

export type EyeLids = {
  /** the opening: the upper and lower edges' heights (radians on the eyeball) at the middle */
  up: number;
  lo: number;
  /** half width of the opening (radians round the eyeball), and the corners' tilt */
  half: number;
  tilt: number;
};

const centres = new WeakMap<Shape, [THREE.Vector3, THREE.Vector3]>();
/** The eyeball's centre for an eye (side +1: the person's left, at +x). */
export const eyeCentre = (sh: Shape, side: number) => {
  let c = centres.get(sh);
  if (!c) {
    const mk = (sd: number) => {
      const zf = frontZ(sh, sd * sh.eyeX, sh.eyeY).p.z;
      return new THREE.Vector3(sd * sh.eyeX, sh.eyeY, zf - sh.eyeR * 0.62);
    };
    c = [mk(-1), mk(1)];
    centres.set(sh, c);
  }
  return c[side > 0 ? 1 : 0];
};
export const LID_T = 1.11; // the lid sphere's radius over the eyeball's

export const eyeLids = (sh: Shape, e: Expr, side: number): EyeLids => {
  const lid = side > 0 ? e.lidL : e.lidR;
  const openUp = (sh.kid ? 0.5 : 0.4) + (sh.eyeOpen ?? 0) + 0.12 * Math.max(0, e.brow) + 0.3 * e.eyePitch;
  const shut = -0.22;
  const up = openUp + (shut - openUp) * lid - 0.22 * e.squint;
  const lo = Math.min(up - 0.02, -((sh.kid ? 0.46 : 0.42) - 0.2 * e.squint - 0.1 * Math.max(0, e.smile)) + 0.15 * e.eyePitch);
  return { up, lo, half: sh.kid ? 1.02 : sh.portrait ? 0.98 : 1.06, tilt: sh.kid ? 0.05 : 0.07 };
};

/** The lid edges at angle t round the eye (0 middle, +-half the corners). */
export const lidEdges = (l: EyeLids, t: number) => {
  // the inner corner (t < 0) sits nearer the middle than the outer one
  const half = t < 0 ? l.half * 0.86 : l.half;
  const k = Math.min(1, Math.abs(t) / half);
  // almond: the upper edge peaks a little toward the nose
  const shapeU = Math.pow(Math.max(0, Math.cos((Math.PI / 2) * k)), 0.75) * (1 + 0.08 * Math.sign(-t) * k);
  const shapeL = Math.pow(Math.max(0, Math.cos((Math.PI / 2) * k)), 0.9);
  const mid = (l.up + l.lo) / 2;
  const corner = mid * 0.25 + l.tilt * (t / half);
  return {
    up: corner + (l.up - corner) * shapeU,
    lo: corner + (l.lo - corner) * shapeL,
  };
};

/** A point's angles round an eye: t (+ toward the temple) and elevation, and its distance. */
export const eyeAngles = (c: THREE.Vector3, side: number, p: THREE.Vector3) => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const dz = p.z - c.z;
  const h = Math.hypot(dx, dz);
  return { t: Math.atan2(dx * side, dz), el: Math.atan2(dy, h), d: Math.hypot(h, dy) };
};

/** Wrap the skin round the eye onto the lid sphere (p changed in place). */
export const wrapEye = (sh: Shape, c: THREE.Vector3, side: number, l: EyeLids, p: THREE.Vector3) => {
  const a = eyeAngles(c, side, p);
  if (a.d > sh.eyeR * 2.6 || p.z < c.z - sh.eyeR * 0.3) return p;
  const tAbs = Math.abs(a.t);
  const span = l.half + 0.85;
  if (tAbs > span) return p;
  // the lids always cover the eyeball's top and bottom: wrap over the widest (open, unsquinted) extent;
  // closing them only moves the cut (in the skin shader)
  const wide = { ...l, up: Math.max(l.up, sh.kid ? 0.62 : 0.52), lo: Math.min(l.lo, sh.kid ? -0.5 : -0.46) };
  const ed = lidEdges(wide, Math.max(-l.half, Math.min(l.half, a.t)));
  const above = a.el - ed.up;
  const below = ed.lo - a.el;
  // 1 inside the opening and on the lids near it, fading out over ~0.45 rad beyond the edges
  // (portraits: a smooth max, so the corners don't crease into streaks)
  const out = sh.portrait ? 0.1 * Math.log(Math.exp(above / 0.1) + Math.exp(below / 0.1) + Math.exp((tAbs - l.half) / 0.1)) : Math.max(above, below, tAbs - l.half);
  const w = 1 - Math.min(1, Math.max(0, out / 0.85));
  if (w <= 0) return p;
  let ww = w * w * (3 - 2 * w);
  // (portraits: only the skin near the eye wraps onto the lids; further out the face keeps its own shape,
  // or the projection shears the mesh into streaks fanning out from the eye)
  if (sh.portrait) {
    const k = Math.min(1, Math.max(0, (a.d - sh.eyeR * 1.3) / (sh.eyeR * 0.85)));
    ww *= 1 - k * k * (3 - 2 * k);
  }
  const rl = sh.eyeR * LID_T;
  const dir = new THREE.Vector3(p.x - c.x, p.y - c.y, p.z - c.z).normalize();
  const q = c.clone().addScaledVector(dir, rl);
  return p.lerp(q, ww);
};
