import * as THREE from "three";
import TRACK from "./track.json";

/**
 * THE DROP, the dive coaster of "POV: your little sister wanted the front row" (scripts/generate-coaster-path.py
 * builds it along its heartline and runs the train on it).
 *
 * World units are metres: y up, x east, z south. The heartline runs through the riders' chests (front row
 * centre); `frameAt(s)` gives the position there and the train's axes: T forward, U the riders' up, R their
 * right. The rails run 1.25 m below the heartline.
 */

export const TR = TRACK;
export const FPS = TRACK.fps;
export const DS = TRACK.ds;
export const ROW = TRACK.row;
export const NROW = TRACK.nrow;
export const LEN = TRACK.length;
export const MARK = TRACK.marks as Record<string, number>;
export const CUE = TRACK.cues as Record<string, number>;
const NS = TRACK.P.length / 3;
export const NFRAMES = TRACK.frames.s.length;

/** Seats across a row (along R), left to right. You sit in the third, your sister in the fourth. */
export const SEATS = [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5];
export const YOUR_SEAT = 2;
export const HER_SEAT = 3;
/** The rails' centre below the heartline, and their half gauge; the spine's centre below that. */
export const RAIL_DROP = 1.25;
export const GAUGE = 0.6;
export const SPINE_DROP = 1.95;

export type Frame = { P: THREE.Vector3; T: THREE.Vector3; U: THREE.Vector3; R: THREE.Vector3 };

const vec = (arr: number[], i: number) => new THREE.Vector3(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);

/** The heartline frame at track position s (clamped to the circuit). */
export const frameAt = (s: number): Frame => {
  const x = Math.max(0, Math.min(NS - 1.000001, s / DS));
  const i = Math.floor(x);
  const k = x - i;
  const P = vec(TRACK.P, i).lerp(vec(TRACK.P, i + 1), k);
  const T = vec(TRACK.T, i).lerp(vec(TRACK.T, i + 1), k).normalize();
  const U0 = vec(TRACK.U, i).lerp(vec(TRACK.U, i + 1), k);
  const U = U0.sub(T.clone().multiplyScalar(U0.dot(T))).normalize();
  const R = new THREE.Vector3().crossVectors(T, U).normalize();
  return { P, T, U, R };
};

/** A point in the train's frame at s: right (along R), up (along U), forward (along T) from the heartline. */
export const pointAt = (f: Frame, right: number, up: number, fwd: number) =>
  f.P.clone().addScaledVector(f.R, right).addScaledVector(f.U, up).addScaledVector(f.T, fwd);

/** Rotation taking a model built facing -z with +y up into the frame (x = R, y = U, z = -T). */
export const quatOf = (f: Frame) => {
  const m = new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate());
  return new THREE.Quaternion().setFromRotationMatrix(m);
};

const F = TRACK.frames;
const clampF = (frame: number) => Math.max(0, Math.min(NFRAMES - 1, frame));
const lerpArr = (arr: number[], frame: number) => {
  const x = clampF(frame);
  const i = Math.floor(x);
  const k = x - i;
  return i >= NFRAMES - 1 ? arr[NFRAMES - 1] : arr[i] + (arr[i + 1] - arr[i]) * k;
};

/** The front row's track position at a (possibly fractional) video frame. */
export const sAt = (frame: number) => lerpArr(F.s, frame);
/** Speed (m/s). */
export const vAt = (frame: number) => lerpArr(F.v, frame);
/** The g's the front row feels: into the seat, sideways (to the right), along the track (forward). */
export const gAt = (frame: number) => ({ n: lerpArr(F.gn, frame), l: lerpArr(F.gl, frame), t: lerpArr(F.gt, frame) });
/** Track position of row r (0 = front). */
export const rowS = (frame: number, r: number) => sAt(frame) - r * ROW;
