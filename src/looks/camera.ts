import * as THREE from "three";
import { CUE, CUE_W, FPS, editAt, smooth, vnoise, wAt } from "./timeline";
import { GLASS, GUM, HEIGHT, HUNTER, MEWER, MOGGER, NORMAL, PHOTOG, type Kid } from "./cast";
import { SEAT_LIFT } from "./People";
import { PHOTOG_AT, TRIPOD } from "./Kids";
import type { Pose } from "./LooksPost";

/**
 * Where the camera is and what it sees, frame by frame. It sits on its tripod: a slow pan from the line of
 * kids to the stool to open; a wide frame as each kid comes and sits; a snap zoom to the portrait as the
 * focus locks. In each sigma edit it's suddenly a music-video camera (low, pushing in, a Dutch tilt) until
 * the flash puts it back where it really is. It follows the height-maxer up, and down. At the end it comes
 * off the tripod and whips round to the photographer's own face.
 */

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const look = (pos: THREE.Vector3, at: THREE.Vector3, fov: number, roll = 0): Pose => {
  const m = new THREE.Matrix4().lookAt(pos, at, V3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), roll));
  return { pos: pos.clone(), quat: q, fov };
};

export const KID_ORDER: Kid[] = [MEWER, HUNTER, GUM, GLASS, NORMAL, HEIGHT, MOGGER];
/** A kid's eye height, seated on the stool. */
export const seatEye = (kid: Kid) => 0.56 + SEAT_LIFT + 0.567 * kid.k - kid.who.shape.chinY;
const WIDE_AT = V3(0, 1.1, 0);
const WIDE_FOV = 38;
const PORTRAIT_FOV = 12.5;
const LINE_AIM = V3(-3.1, 1.2, 1.15);

export type Shot = {
  pose: Pose;
  /** focus distance and aperture (the depth of field) */
  focus: number;
  aperture: number;
  /** motion blur strength */
  blur: number;
  /** which kid's block we're in (index into KID_ORDER), or -1 */
  block: number;
  /** the face we're framing (world), for the focus box */
  face: THREE.Vector3 | null;
};

const cue = (k: string, b: string) => CUE[`${k}.${b}`];

/** The height-maxer's eye height at world time tw (seated, up on the stool, falling). */
const heightEye = (tw: number) => {
  const climb = smooth(CUE_W["height.stand"], CUE_W["height.stand"] + 0.5, tw);
  const fall = smooth(CUE_W["height.fall"], CUE_W["height.fall"] + 0.4, tw);
  const standEye = 0.62 + (HEIGHT.outfit.lifts ?? 0) + 0.93 * HEIGHT.k + 0.567 * HEIGHT.k - HEIGHT.who.shape.chinY;
  return lerp(lerp(seatEye(HEIGHT), standEye, climb), 0.4, fall);
};

/** The sigma edit's camera, for a face at eye height y: low, pushing in, tilted; te seconds into the edit. */
const editCam = (eye: THREE.Vector3, te: number, side: number, wide = 0) => {
  const push = smooth(0, 3.2, te);
  const pos = V3(0.32 * side - 0.18 * side * push, 0.98 + 0.05 * push, 2.15 - 0.45 * push);
  const fov = lerp(lerp(15, 9.2, push), 26, wide);
  return look(pos, eye.clone().add(V3(0, -0.03, 0)), fov, 0.075 * side * (1 - 0.4 * push));
};

const handheld = (v: number, amt: number) => V3(vnoise(v * 1.7, 1) * 0.006 * amt, vnoise(v * 1.9, 2) * 0.005 * amt, vnoise(v * 1.3, 3) * 0.004 * amt);

export const shotAt = (f: number): Shot => {
  const v = f / FPS;
  const tw = wAt(f);
  const edit = editAt(f);
  // ---- the opening: the line, then the stool
  if (v < cue("mewer", "in")) {
    const k = smooth(0.7, 3.0, v);
    const aim = LINE_AIM.clone().lerp(WIDE_AT, k);
    return { pose: look(TRIPOD, aim, lerp(34, WIDE_FOV, k)), focus: TRIPOD.distanceTo(aim), aperture: 0.004, blur: 0.6, block: -1, face: null };
  }
  // ---- the photographer turns the camera round
  if (v >= cue("photog", "lift")) return photogShot(v, tw, edit);
  // ---- the kids, one after another
  let i = KID_ORDER.length - 1;
  while (i > 0 && v < cue(KID_ORDER[i].key, "in") - 0.3) i--;
  const kid = KID_ORDER[i];
  const key = kid.key;
  const sit = cue(key, "sit");
  const focus = cue(key, "focus");
  const up = cue(key, "up");
  const flash = cue(key, "flash");
  let eyeY = seatEye(kid);
  if (key === "height") eyeY = heightEye(tw);
  const face = V3(0, eyeY, 0);
  // wide while he walks in and sits; the snap zoom to the portrait as the focus locks; wide again as he gets up
  const zin = smooth(sit + 0.05, focus, v);
  const zout = smooth(up + 0.05, up + 0.45, v);
  let z = zin * (1 - zout);
  let portraitFov = PORTRAIT_FOV;
  let aimY = eyeY - 0.07;
  if (key === "height") {
    // up on the stool: a little wider, following his face up; the fall: down and wide again
    const climb = smooth(CUE_W["height.stand"], CUE_W["height.stand"] + 0.5, tw);
    portraitFov = lerp(PORTRAIT_FOV, 17, climb);
    aimY = eyeY - lerp(0.07, 0.13, climb);
    const fallen = smooth(CUE_W["height.fall"] + 0.1, CUE_W["height.fall"] + 0.5, tw);
    z *= 1 - fallen;
    if (v > cue("height", "fall")) z = (1 - fallen) * (1 - smooth(cue("height", "popUp") - 0.2, cue("height", "popUp"), v));
  }
  if (key === "mogger") z = zin * (1 - zout);
  const wideAim = key === "height" && v > cue("height", "stand") && v < cue("height", "fall") ? V3(0, aimY, 0) : WIDE_AT.clone();
  const aim = wideAim.lerp(V3(0, aimY, 0), z);
  const fov = lerp(WIDE_FOV, portraitFov, z);
  let pose = look(TRIPOD, aim, fov);
  let focusD = TRIPOD.distanceTo(V3(0, eyeY, 0.05));
  // the sigma edit (in his head): the music-video camera
  if (edit > 0 && v < flash) {
    const e0 = key === "mogger" ? cue("mogger", "edit0") : cue(key, "edit0");
    const te = v - e0;
    const side = i % 2 === 0 ? 1 : -1;
    let eye = V3(0, eyeY, 0);
    let wide = 0;
    if (key === "mogger" && v < sit + 0.3) {
      // tracking him in, low, in slow motion
      const walkK = smooth(cue("mogger", "in"), sit - 0.4, v);
      eye = V3(lerp(-1.1, 0, walkK), 1.62 + (eyeY - 1.62) * smooth(sit - 0.5, sit + 0.2, v), lerp(0.36, 0, walkK));
      wide = 1 - smooth(sit - 0.2, sit + 0.3, v);
    }
    const ec = editCam(eye, te, side, wide);
    pose = {
      pos: pose.pos.clone().lerp(ec.pos, edit),
      quat: pose.quat.clone().slerp(ec.quat, edit),
      fov: lerp(pose.fov, ec.fov, edit),
    };
    focusD = lerp(focusD, ec.pos.distanceTo(eye), edit);
  }
  return {
    pose,
    focus: focusD,
    aperture: lerp(0.006, 0.016, z) + 0.01 * edit,
    blur: 0.7,
    block: i,
    face: z > 0.5 ? face : null,
  };
};

/** The selfie: up off the tripod, the whip round, his face at arm's length (handheld), the edit. */
export const SELFIE = V3(0.0, 1.6, 2.62);
const photogShot = (v: number, tw: number, edit: number): Shot => {
  const lift = cue("photog", "lift");
  const t0 = cue("photog", "turn0");
  const t1 = cue("photog", "turn1");
  const flash = cue("photog", "flash");
  const eye = 0.93 * PHOTOG.k + 0.567 * PHOTOG.k - PHOTOG.who.shape.chinY;
  const face = V3(PHOTOG_AT.x, eye, PHOTOG_AT.z);
  const up = smooth(lift, t0 + 0.1, v);
  const turn = smooth(t0, t1, v);
  // off the tripod and up, then round (the aim swings through the side of the gym)
  const pos = TRIPOD.clone().lerp(V3(0.03, 1.52, 2.74), up).lerp(SELFIE, turn);
  const yaw = Math.PI * turn;
  const fwd = V3(-Math.sin(yaw) * 0.0 + Math.sin(yaw) * 0.6, 0, -Math.cos(yaw));
  const stoolAim = pos.clone().add(V3(0, -0.06, -2.6));
  const swing = pos.clone().add(fwd.multiplyScalar(2.6)).add(V3(0, -0.05, 0));
  let aim = turn < 0.001 ? stoolAim : turn > 0.999 ? face.clone() : swing.lerp(face, smooth(0.6, 1, turn));
  aim = aim.clone().add(handheld(v, up));
  let pose = look(pos.clone().add(handheld(v + 3, up)), aim, lerp(PORTRAIT_FOV, 46, smooth(0.15, 0.9, turn)));
  let focusD = turn > 0.6 ? pos.distanceTo(face) - 0.08 : 2.6;
  if (edit > 0 && v < flash) {
    const te = v - cue("photog", "edit0");
    const push = smooth(0, 3.0, te);
    const ep = SELFIE.clone().add(V3(0.09 - 0.1 * push, -0.1 + 0.03 * push, 0.02 + 0.06 * push));
    const ec = look(ep, face.clone().add(V3(0, 0.05, 0)), lerp(46, 40, push), -0.07 * (1 - 0.3 * push));
    pose = { pos: pose.pos.clone().lerp(ec.pos, edit), quat: pose.quat.clone().slerp(ec.quat, edit), fov: lerp(pose.fov, ec.fov, edit) };
    focusD = lerp(focusD, ec.pos.distanceTo(face) - 0.08, edit);
  }
  void tw;
  return { pose, focus: focusD, aperture: turn > 0.6 ? 0.02 : 0.014, blur: 1.0, block: 7, face: turn > 0.95 ? face : null };
};
